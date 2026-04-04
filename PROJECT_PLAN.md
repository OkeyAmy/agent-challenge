# Relay — Personal AI Command Center
### Nosana × ElizaOS Agent Challenge Build Plan

> **Challenge:** Nosana × ElizaOS Agent Challenge
> **Deadline:** April 14, 2026
> **Prize Pool:** $3,000 USDC
> **Framework:** ElizaOS v2
> **Compute:** Nosana Decentralized GPU Network
> **Model:** Qwen3.5-27B-AWQ-4bit (Nosana-hosted)

---

## The Concept

Most people manage their AI sessions in disconnected chat windows — no history, no visibility, no structure. Every conversation starts from scratch.

**Relay** is a personal AI command center that fixes this. One agent. Every task you send it is logged, categorized, and surfaced in a real-time Notion dashboard and Telegram notification. Session context is preserved across restarts. Response latency is tracked per message. Topics are auto-detected. You get a full picture of everything your AI has done for you — organized, searchable, and always live.

This is not a demo concept. The architecture was validated in 6 days of production operation: **370+ events orchestrated, 8 session contexts managed, 25 auto-detected topics, zero lost context.**

---

## Why This Wins

### Against the Judging Criteria

| Criterion | Weight | Our Differentiation |
|-----------|--------|---------------------|
| **Technical Implementation** | 25% | Three custom ElizaOS plugins built from scratch. SQLite event store with latency tracking. Custom actions, providers, and evaluators. Full REST API within the agent. |
| **Nosana Integration Depth** | 25% | Deployed on Nosana. Inference via Nosana-hosted Qwen3.5-27B. Nosana job ID tracked in session state and shown on dashboard. Agent reports its own Nosana compute metrics. |
| **Usefulness & UX** | 25% | Solves a real daily problem for any serious AI user. Notion kanban + Telegram alerts + live React dashboard = genuinely polished UX. Proven in production. |
| **Creativity & Originality** | 15% | No other submission will have real-time observability of an AI's work. The event store + Notion sync + Telegram ticker combination is novel. |
| **Documentation** | 10% | Architecture docs, setup guide, API reference, video demo. All already partially written from the original project. |

### What No One Else Will Have

Most submissions will be: a chatbot with web search, deployed on Nosana.

Relay will be: a personal AI that logs every interaction to SQLite with millisecond precision, auto-organizes your conversations into topics, shows you a live Notion dashboard of everything it has ever done for you, fires a Telegram notification the moment it responds, and has a React dashboard with latency graphs and a topic kanban — all running on Nosana.

---

## Architecture: One Agent, All Superpowers

The original project used Anthropic's proprietary `agent-relay` SDK to manage separate Claude Code processes. This rebuild ports every single feature into ElizaOS as custom plugins, providers, actions, and evaluators — one agent, one deployment, every capability.

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERFACES                          │
│                                                             │
│   React Dashboard    Telegram Bot    Direct HTTP API        │
│   (port 3000)        (plugin)        (port 3890)            │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  RELAY ELIZAOS AGENT                        │
│                                                             │
│  Model: Qwen3.5-27B via Nosana endpoint                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  CUSTOM ACTIONS                                     │   │
│  │  ROUTE_TASK · GET_STATUS · SEARCH_HISTORY           │   │
│  │  TRIGGER_NOTION_SYNC · TOGGLE_TICKER                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  CUSTOM PROVIDERS                                   │   │
│  │  EventStoreProvider · SessionStatusProvider         │   │
│  │  TopicContextProvider                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  CUSTOM EVALUATORS                                  │   │
│  │  TopicDetectionEvaluator · LatencyEvaluator         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐  │
│  │ plugin-relay │ │plugin-notion │ │ plugin-telegram   │  │
│  │  (core)      │ │  -sync       │ │   -ticker         │  │
│  └──────┬───────┘ └──────┬───────┘ └────────┬──────────┘  │
└─────────┼────────────────┼──────────────────┼─────────────┘
          │                │                  │
┌─────────▼────────┐ ┌─────▼──────────┐ ┌────▼──────────────┐
│  SQLite          │ │  Notion API    │ │  Telegram Bot API │
│  events.db       │ │  Events DB     │ │  HTML cards       │
│  sessions table  │ │  Topics kanban │ │  per event        │
└──────────────────┘ └────────────────┘ └───────────────────┘
```

---

## Feature-to-Implementation Mapping

Every feature from the original `agent-relay-orchestrator` is ported into ElizaOS:

### plugin-relay (Core — Replaces relay-service.mjs)

This is the heart. A custom ElizaOS plugin that gives the agent a persistent event store, REST API, and session awareness.

**What it does:**

**1. SQLite Event Store**
Identical schema to the original. Every message the agent sends or receives is written to SQLite with:
- `timestamp`, `event_type` (send/response/spawn/exit)
- `sender`, `receiver`, `session_id`, `session_label`
- `content` (truncated at 5000 chars, full content written to file)
- `latency_ms` (calculated from send → response time)
- `origin_chat_id`, `origin_topic_id`, `topic`

```typescript
// src/plugin-relay/event-store.ts
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,
    sender TEXT NOT NULL,
    receiver TEXT NOT NULL,
    session_id TEXT,
    session_label TEXT,
    content TEXT,
    content_file TEXT,
    latency_ms INTEGER,
    origin_chat_id TEXT,
    origin_topic_id TEXT,
    topic TEXT,
    metadata TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    label TEXT,
    status TEXT DEFAULT 'active',
    spawned_at TEXT,
    last_activity TEXT,
    total_events INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
`);
```

**2. Session Persistence**
ElizaOS has built-in conversation memory, but we augment it with explicit session state JSON — same format as the original. Session ID preserved across restarts. Crash guard: if agent is restored from session but something goes wrong within 15 seconds, fall back to fresh context.

**3. REST API (port 3890)**
Identical endpoints to the original — same curl commands work:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Service health, session status, ticker state |
| GET | `/sessions` | All sessions from event store |
| GET | `/sessions/:name/events` | Timeline for specific session |
| GET | `/events` | Global event feed (`?since=`, `?limit=`) |
| GET | `/stats` | Total events, sessions, 24h count, avg latency |
| POST | `/send` | Send message to agent with topic routing |
| POST | `/ticker` | Toggle Telegram notifications |
| DELETE | `/session/:id` | Purge session state |

**4. Latency Tracking**
`pendingSends` map: timestamp recorded on every send, latency calculated on response receipt. Written to SQLite, exposed in `/stats`, shown on dashboard.

**5. Log Rotation**
Same 10MB / 5-file rotation. Prompts > 200 chars saved to file. Responses > 2000 chars saved to file. Path stored in `content_file` column.

**6. Topic Routing**
The original routed to different workers by topic. In Relay, the `ROUTE_TASK` action classifies the incoming message and injects specialized system context — code tasks get code-focused reasoning, research tasks activate web search, etc. The topic label is still written to the event store and Notion.

**7. Auto-suspend / Idle Detection**
Original: suspended idle workers after 15 minutes. Relay: marks sessions "stale" in the event store after 15 minutes of no activity. Notion sync picks this up and updates the kanban status. Same behavior, adapted to single-agent model.

---

### plugin-notion-sync (Replaces notion-sync.mjs)

Polls the relay event store every 30 seconds and syncs to two Notion databases.

**Events Database:**
Every row in SQLite → one page in Notion's Events database:
- Title (truncated content preview)
- Event Type (send / response / spawn / exit)
- Sender, Receiver
- Timestamp, Latency (ms)
- Session ID
- Topic (relation to Topics database)

**Topics Kanban:**
Auto-detected from event content. Status logic identical to original:
- `in-progress` → latest event for this topic is a "send" (waiting for response)
- `done` → latest response contains `SHIP` or `SOLID` markers
- `stale` → no activity in >24 hours
- `blocked` → manually set in Notion

Body of each Topic page: timeline of last 20 events for that topic, markdown-to-rich-text converted.

**Retry logic:** exponential backoff, 3 retries on 429/5xx from Notion API.

**Markdown→rich text:** bold (`**text**`), inline code (`` `text` ``), headings (`##`), chunked at 2000 chars for Notion API limits.

---

### plugin-telegram-ticker (Replaces telegram-ticker.py)

TypeScript port of the Python telegram-ticker. Fires on every event the event store writes.

HTML-formatted cards posted to Telegram group topics:
- 📤 **send** card: sender → receiver, timestamp, task label
- ✅ **response** card: sender → receiver, timestamp, latency badge
- 🚀 **spawn** card: session started
- 🔴 **exit** card: session ended

Safety gate: only fires if `TELEGRAM_TICKER_ENABLED=true` in env (replaces the `.ticker-enabled` file gate from the original).

Toggle via `POST /ticker` endpoint or `TOGGLE_TICKER` action.

---

### Custom Actions

**ROUTE_TASK**
Classifies the incoming message type (code / research / review / writing / general) and injects the appropriate system context suffix. Writes classification to event store as `topic`. Routes web-search requests through `plugin-web-search`.

**GET_STATUS**
Returns current session stats from the event store: total events, avg latency, sessions today, active topics. Agent can report these conversationally ("you've given me 47 tasks today, average response time 3.2 seconds").

**SEARCH_HISTORY**
Queries the event store by topic, date range, or keyword. Lets the user ask "what did I work on last Tuesday?" and get a real answer from the SQLite log.

**TRIGGER_NOTION_SYNC**
Forces an immediate Notion sync cycle rather than waiting for the 30-second poll.

**TOGGLE_TICKER**
Enables/disables Telegram notifications via conversation: "stop sending me Telegram alerts" → fires `POST /ticker { enabled: false }`.

---

### Custom Providers

**EventStoreProvider**
Injects the agent's recent event history into every conversation context. The agent knows what tasks it has handled recently and can reference them.

**SessionStatusProvider**
Injects current session status: uptime, event count, active topics, last Notion sync time.

**TopicContextProvider**
When a topic is detected in the conversation, injects the recent history for that topic as additional context. Equivalent to the original's per-topic event timeline in Notion.

---

### Custom Evaluators

**TopicDetectionEvaluator**
Runs after every response. Scans content for topic markers (project names, task types, keywords). Writes detected topic to the event's SQLite row. Feeds the Topics kanban.

**LatencyEvaluator**
Calculates and records response latency after every exchange. Maintains rolling average exposed via `/stats`.

---

## Web Frontend (React Dashboard)

Served as static files alongside the agent. Polls the relay REST API (port 3890) every 5 seconds.

### Components

**StatsBar** — top bar showing:
- Total events (all time)
- Events last 24h
- Average response latency (ms)
- Active sessions count
- Nosana job status badge

**LiveEventFeed** — scrolling timeline:
- Every event with type icon (📤/✅/🚀/🔴)
- Sender → receiver with timestamp
- Latency badge on responses
- Topic tag
- Content preview (expandable)

**TopicKanban** — four columns:
- In Progress / Done / Stale / Blocked
- Each card: topic name, last activity time, event count
- Links to filtered event feed for that topic

**MessageComposer** — bottom of page:
- Text input
- Topic selector (optional)
- Send button → `POST /send` to relay API

**SessionPanel** — right sidebar:
- Current session ID
- Uptime
- Notion sync status (last synced timestamp)
- Telegram ticker toggle

---

## Nosana Integration (Deep)

**Inference:** Qwen3.5-27B via Nosana-hosted endpoint. Every response goes through Nosana compute.

**Deployment:** Single Docker container on Nosana GPU node. Job definition includes the agent, relay REST API, and static frontend all in one container.

**Session state on ephemeral compute:** Nosana jobs are ephemeral. The session state JSON and SQLite database are written to a mounted volume path (configurable via `RELAY_DB_PATH`). Between job restarts, context is fully preserved.

**Nosana job metadata in dashboard:** The agent reads its own `NOSANA_JOB_ID` environment variable (set by Nosana at runtime) and surfaces it in the `/health` endpoint and the dashboard stats bar. Users can see which Nosana node they're running on.

**Embedding model:** `Qwen3-Embedding-0.6B` via Nosana's embedding endpoint for semantic memory and topic detection.

---

## File Structure

```
agent-challenge/
│
├── characters/
│   └── relay.character.json           ← Agent character definition
│
├── src/
│   ├── plugin-relay/
│   │   ├── index.ts                   ← Plugin entry, service bootstrap
│   │   ├── event-store.ts             ← SQLite setup, writeEvent(), queries
│   │   ├── session-state.ts           ← JSON persistence, load/save/clear
│   │   ├── rest-api.ts                ← HTTP server (port 3890), all endpoints
│   │   ├── log-rotation.ts            ← 10MB/5-file rotation, prompt/response files
│   │   ├── latency-tracker.ts         ← pendingSends map, latency calculation
│   │   └── actions/
│   │       ├── route-task.ts
│   │       ├── get-status.ts
│   │       ├── search-history.ts
│   │       ├── trigger-notion-sync.ts
│   │       └── toggle-ticker.ts
│   │
│   ├── plugin-notion-sync/
│   │   ├── index.ts                   ← Plugin entry, starts 30s poll cycle
│   │   ├── notion-client.ts           ← Notion API wrapper, retry logic
│   │   ├── events-sync.ts             ← Events database upsert
│   │   ├── topics-sync.ts             ← Topics kanban, status detection
│   │   └── rich-text.ts               ← Markdown → Notion rich text conversion
│   │
│   ├── plugin-telegram-ticker/
│   │   ├── index.ts                   ← Plugin entry, hooks into event store
│   │   └── ticker.ts                  ← HTML card formatting, Telegram API calls
│   │
│   ├── providers/
│   │   ├── event-store-provider.ts
│   │   ├── session-status-provider.ts
│   │   └── topic-context-provider.ts
│   │
│   ├── evaluators/
│   │   ├── topic-detection-evaluator.ts
│   │   └── latency-evaluator.ts
│   │
│   └── index.ts                       ← Registers all plugins, providers, evaluators
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── StatsBar.tsx
│   │   │   ├── LiveEventFeed.tsx
│   │   │   ├── TopicKanban.tsx
│   │   │   ├── MessageComposer.tsx
│   │   │   └── SessionPanel.tsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.ts
│
├── relay/
│   ├── events.db                      ← Auto-created SQLite (or mounted volume)
│   ├── relay-session-state.json       ← Session persistence
│   ├── worker-profiles.json           ← Topic routing config
│   └── logs/                          ← Rotated logs + prompt/response files
│
├── nos_job_def/
│   └── nosana_eliza_job_definition.json
│
├── Dockerfile
├── .env.example
├── package.json
└── README.md
```

---

## Character Definition

```json
{
  "name": "Relay",
  "bio": [
    "Relay is your personal AI command center — a single agent that remembers everything, shows you everything, and never loses context.",
    "Every task you give Relay is logged, categorized by topic, and synced to your Notion dashboard in real time.",
    "You get a Telegram notification the moment Relay responds. You see exactly how long it took.",
    "Session context survives restarts. The event history is always searchable.",
    "Relay runs on Nosana decentralized compute, powered by Qwen3.5-27B."
  ],
  "system": "You are Relay, a personal AI assistant with full observability. Every message you receive and every response you send is logged to a SQLite event store with millisecond precision. You auto-detect topics from conversation content and organize your work into a Notion kanban dashboard. You notify the user on Telegram for every event. You have memory of your full session history. When asked about your past work, query your event store. When asked to do code tasks, apply code-focused reasoning. When asked to research, use web search. Always be direct, precise, and concise. Report what you did, not how you did it.",
  "plugins": [
    "@elizaos/plugin-bootstrap",
    "@elizaos/plugin-openai",
    "@elizaos/plugin-web-search",
    "@elizaos/plugin-telegram",
    "plugin-relay",
    "plugin-notion-sync",
    "plugin-telegram-ticker"
  ],
  "clients": ["direct", "telegram"],
  "settings": {
    "OPENAI_API_URL": "https://...nosana.../v1",
    "MODEL_NAME": "Qwen3.5-27B-AWQ-4bit",
    "RELAY_PORT": "3890"
  }
}
```

---

## Build Phases

### Phase 1: Core Agent + Event Store (Days 1–2)
- [ ] `characters/relay.character.json`
- [ ] `src/plugin-relay/event-store.ts` — SQLite schema, `writeEvent()`, all queries
- [ ] `src/plugin-relay/session-state.ts` — JSON load/save/migrate/backup
- [ ] `src/plugin-relay/log-rotation.ts` — file logging with rotation
- [ ] `src/plugin-relay/latency-tracker.ts` — pendingSends map
- [ ] Wire agent to Qwen3.5-27B via `.env`, verify responses

### Phase 2: REST API + Actions (Days 3–4)
- [ ] `src/plugin-relay/rest-api.ts` — all 8 endpoints on port 3890
- [ ] All 5 custom actions
- [ ] All 3 providers
- [ ] All 2 evaluators
- [ ] `src/index.ts` — register everything
- [ ] End-to-end test: send message → event written → latency tracked → `/stats` updated

### Phase 3: Notion Sync (Days 5–6)
- [ ] `src/plugin-notion-sync/notion-client.ts` — API wrapper, retry logic
- [ ] `src/plugin-notion-sync/rich-text.ts` — markdown → Notion conversion
- [ ] `src/plugin-notion-sync/events-sync.ts` — Events database upsert
- [ ] `src/plugin-notion-sync/topics-sync.ts` — Topics kanban, status detection, stale sweep
- [ ] Test: send messages → events appear in Notion within 30 seconds

### Phase 4: Telegram Ticker (Day 7)
- [ ] `src/plugin-telegram-ticker/ticker.ts` — HTML card templates (📤/✅/🚀/🔴)
- [ ] Hook into event store write cycle
- [ ] Toggle endpoint wired to `TOGGLE_TICKER` action
- [ ] Test: send → Telegram notification fires with latency on response

### Phase 5: Web Frontend (Days 8–9)
- [ ] Scaffold React app in `frontend/`
- [ ] `StatsBar` — polls `/stats` every 5s
- [ ] `LiveEventFeed` — polls `/events` every 5s, scrolling timeline
- [ ] `TopicKanban` — four columns from event store topics
- [ ] `MessageComposer` — `POST /send` with topic selector
- [ ] `SessionPanel` — session ID, uptime, Notion sync status, ticker toggle
- [ ] Tailwind CSS styling — clean, dark mode, production-grade

### Phase 6: Nosana Deployment (Days 10–11)
- [ ] `Dockerfile` — single container: agent + relay API + frontend static serve
- [ ] `nos_job_def/nosana_eliza_job_definition.json` — complete job definition
- [ ] Mount strategy for SQLite persistence across job restarts
- [ ] Build and push Docker image to Docker Hub
- [ ] Deploy to Nosana, verify Qwen3.5-27B responses
- [ ] Test full pipeline: message → event → Notion → Telegram → dashboard

### Phase 7: Polish + Submission (Days 12–13)
- [ ] Update `README.md` with full setup guide, architecture diagram, API reference
- [ ] Write agent description ≤300 words
- [ ] Record 60-second video demo
- [ ] Star all 4 required GitHub repos
- [ ] Social media post
- [ ] Submit via superteam.fun

---

## What Makes This Different From Every Other Submission

| Feature | Typical Submission | Relay |
|---------|-------------------|-------|
| Memory | ElizaOS built-in only | SQLite event store + session state JSON |
| Observability | None | Real-time Notion kanban + Telegram alerts |
| Latency tracking | None | Per-message ms precision, rolling average |
| Topic organization | None | Auto-detected, kanban board, stale detection |
| History search | None | `SEARCH_HISTORY` action, SQL queries |
| REST API | None | 8 endpoints, fully documented |
| Dashboard | ElizaOS default UI | Custom React with event feed + kanban |
| Nosana integration | One container | Job ID surfaced in dashboard, volume mounts |
| Production tested | No | 370+ events, 6 days, zero context loss |

---

## The 60-Second Demo

**0–8s:** Open the React dashboard. Stats bar shows 47 total events, 3 active topics, 2.8s avg latency. Live event feed scrolling.

**8–20s:** Type into the message composer: *"Research the latest Nosana network stats and summarize them."* Hit send. 📤 send event appears instantly in feed with topic tag "research."

**20–35s:** Response arrives. ✅ response event appears with "1247ms" latency badge. Summary text visible in feed. Cut to Telegram — notification card already there: "✅ Relay → you · research · 1247ms."

**35–48s:** Open Notion. Events database — the send and response are already synced. Topics kanban — "research" card moved from In Progress to Done.

**48–58s:** Ask the agent: "What have I asked you about today?" Agent replies using SEARCH_HISTORY action: "You've given me 3 tasks today — research (done), code-review (done), writing (in progress)."

**58–60s:** Cut to Nosana dashboard. Running job shown with Relay's job ID. End.

---

## Agent Description (≤300 Words — Submission Copy)

**Relay** is a personal AI command center built on ElizaOS v2, running on Nosana decentralized compute.

The problem it solves: every AI conversation today is isolated. No history. No organization. No visibility into what your AI actually did for you. Relay fixes this at the infrastructure level.

Every message you send Relay and every response it generates is logged to a SQLite event store with millisecond latency precision. Topics are auto-detected from conversation content and organized into a live Notion kanban board — in-progress, done, stale, blocked. A Telegram notification fires the moment Relay responds, showing you who sent what, to whom, and how long it took.

A custom React dashboard shows the full picture: scrolling live event feed, stats bar (total events, avg latency, active sessions), topic kanban, and a message composer wired to the relay REST API. Your conversation history is always searchable — ask Relay "what did I work on last Tuesday?" and it queries its own event store.

Session context survives restarts. The SQLite database and session state are persisted to a mounted volume on Nosana, so when the job restarts, Relay picks up exactly where it left off.

Under the hood: three custom ElizaOS plugins (plugin-relay for the event store and REST API, plugin-notion-sync for the dashboard, plugin-telegram-ticker for notifications), five custom actions, three providers, and two evaluators — all wired into a single ElizaOS character powered by Qwen3.5-27B via Nosana's hosted inference endpoint.

This architecture was validated in production before this challenge: 370+ events, 8 session contexts, 25 auto-detected topics, six days of continuous operation, zero lost context.

**Stack:** ElizaOS v2 · Qwen3.5-27B · Nosana · SQLite · Notion API · Telegram Bot API · React

---

*Built with ElizaOS · Powered by Qwen3.5-27B · Deployed on Nosana*
