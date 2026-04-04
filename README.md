# Relay — Personal AI Command Center

> **Nosana × ElizaOS Agent Challenge** · Deadline: April 14, 2026 · Prize: $3,000 USDC

A 4-agent ElizaOS system that gives every conversation real-time observability: every message is logged to PostgreSQL, topics are auto-detected, a REST API exposes all data, and agents can execute real tasks via Codex CLI.

---

## What This Is

Most AI sessions are isolated — no history, no organization, no visibility. Relay fixes this at the infrastructure level.

**4 agents, one shared event store:**

| Agent | Role |
|-------|------|
| **Relay** | Orchestrator: REST API (port 3890), Notion sync, Telegram ticker |
| **CodeWorker** | Code review, debugging, refactoring via Codex |
| **ResearchWorker** | Web research and summarization via Codex |
| **ReviewWorker** | PR review, architecture critique, security audit via Codex |

Every message any agent sends or receives is written to the `relay_events` PostgreSQL table with millisecond latency, topic auto-detection, and session tracking.

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                   USER INTERFACES                         │
│  ElizaOS UI (port 3000)    REST API (port 3890)           │
└──────────────────────────┬────────────────────────────────┘
                           │
┌──────────────────────────▼────────────────────────────────┐
│              4 ELIZAOS AGENTS (shared plugins)            │
│                                                           │
│  plugin-relay     → PostgreSQL event store, REST API,     │
│                     Notion sync, Telegram ticker          │
│                     Actions: GET_STATUS, SEARCH_HISTORY,  │
│                     TOGGLE_TICKER                         │
│                     Evaluators: topic detection, latency  │
│                                                           │
│  plugin-nosana-llm → Chat completions via Nosana endpoint │
│                      (fixes Responses API incompatibility)│
│                                                           │
│  plugin-codex     → CODEX_EXEC: run any task via Codex   │
│                     CODEX_REVIEW: code review via Codex   │
└──────────────────────────┬────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   PostgreSQL DB     Notion API       Telegram Bot API
   relay_events      Events DB        HTML event cards
   relay_sessions    Topics kanban
```

### Custom Plugins (built from scratch)

**`src/plugin-relay/`** — Core observability layer
- PostgreSQL schema with `relay_events` + `relay_sessions` tables (auto-migrated by ElizaOS)
- REST API server on port 3890
- Notion sync service (30-second poll cycle)
- Telegram ticker (fires on every event)
- Actions: `GET_STATUS`, `SEARCH_HISTORY`, `TOGGLE_TICKER`
- Provider: `RELAY_SESSION_STATUS` (injects session stats into every LLM context)
- Evaluators: `TOPIC_DETECTION`, `RELAY_LATENCY`

**`src/plugin-nosana-llm/`** — LLM compatibility fix
- Overrides `plugin-openai`'s TEXT_LARGE/TEXT_SMALL handlers
- Forces `openai.chat()` → `/v1/chat/completions` (Nosana vLLM only supports Chat Completions, not the Responses API)
- `priority: 1` beats `plugin-openai`'s default `priority: 0`

**`src/plugin-codex/`** — Real task execution
- `CODEX_EXEC` — delegates any coding/file/shell task to `codex exec --full-auto`
- `CODEX_REVIEW` — runs `codex exec review` for comprehensive code review
- Agents trigger these from natural language (detect: implement, fix, test, build, review, etc.)

---

## Prerequisites

- **Node.js 23+**
- **pnpm** — `npm install -g pnpm`
- **ElizaOS CLI** — `pnpm add -g @elizaos/cli`
- **Codex CLI** — must be installed and on PATH (`codex --version` to verify)
- **PostgreSQL** — running locally or remote (for the relay event store)
- **Docker** — for Nosana deployment (optional for local dev)

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR-USERNAME/agent-challenge
cd agent-challenge
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# ── LLM ─────────────────────────────────────────────────────
# Nosana-hosted Qwen/Qwen3.5-4B endpoint (both vars required)
OPENAI_API_KEY=your-nosana-api-key
OPENAI_API_URL=https://4ksj3tve5bazqwkuyqdhwdpcar4yutcuxphwhckrdxmu.node.k8s.prd.nos.ci/v1
OPENAI_BASE_URL=https://4ksj3tve5bazqwkuyqdhwdpcar4yutcuxphwhckrdxmu.node.k8s.prd.nos.ci/v1
MODEL_NAME=Qwen/Qwen3.5-4B
LARGE_MODEL=Qwen/Qwen3.5-4B

# ── Embedding ────────────────────────────────────────────────
OPENAI_EMBEDDING_URL=https://4yiccatpyxx773jtewo5ccwhw1s2hezq5pehndb6fcfq.node.k8s.prd.nos.ci/v1
OPENAI_EMBEDDING_API_KEY=your-nosana-api-key
OPENAI_EMBEDDING_MODEL=Qwen3-Embedding-0.6B
OPENAI_EMBEDDING_DIMENSIONS=1024

# ── PostgreSQL ───────────────────────────────────────────────
# The relay plugin auto-creates relay_events and relay_sessions tables
POSTGRES_URL=postgres://postgres:password@localhost:5432/relay_db

# ── ElizaOS ──────────────────────────────────────────────────
SERVER_PORT=3000

# ── Relay REST API ───────────────────────────────────────────
RELAY_PORT=3890
RELAY_LOG_DIR=./relay/logs
RELAY_SESSION_STATE=./relay/relay-session-state.json
RELAY_MAX_LOG_SIZE_MB=10
RELAY_MAX_LOG_FILES=5

# ── Notion (optional) ────────────────────────────────────────
# NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxx
# NOTION_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxx
# NOTION_SYNC_INTERVAL_MS=30000

# ── Telegram (optional) ─────────────────────────────────────
# TELEGRAM_BOT_TOKEN=123456789:AAxxxxxxxxxxxxxxxx
# TELEGRAM_CHAT_ID=-100xxxxxxxxxx
TELEGRAM_TICKER_ENABLED=false
```

**Local dev with Ollama** (alternative to Nosana endpoint):
```env
OPENAI_API_KEY=ollama
OPENAI_API_URL=http://127.0.0.1:11434/v1
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
MODEL_NAME=qwen3.5:4b
LARGE_MODEL=qwen3.5:4b
```

### 3. Create the database

```bash
# Create the database (the relay plugin handles table creation)
createdb relay_db

# Or with a specific user:
psql -c "CREATE DATABASE relay_db;" -U postgres
```

---

## Running

### All 4 agents (recommended)

```bash
pnpm start
# or dev mode with hot reload:
pnpm dev
```

ElizaOS reads `src/index.ts` (the Project entry point) and boots all 4 agents sharing the relay plugin.

### Single agent (Relay only)

```bash
pnpm start:relay
# or:
pnpm dev:relay
```

### Expected startup output

```
[Relay] online — REST API on http://0.0.0.0:3890
[CodeWorker] online
[ResearchWorker] online
[ReviewWorker] online
```

Then open **http://localhost:3000** for the ElizaOS chat UI.

---

## Testing

### Verify the LLM is working

Send any message in the ElizaOS UI at http://localhost:3000 and confirm you get a response. If you see `Unexpected message role` in logs, check that `OPENAI_API_URL` is set (not just `OPENAI_BASE_URL`).

### Verify the REST API

```bash
# Health check — should return status + session info
curl http://localhost:3890/health

# Aggregate stats
curl http://localhost:3890/stats

# All events (most recent 20)
curl "http://localhost:3890/events?limit=20"

# Events for a specific topic
curl "http://localhost:3890/events?topic=code"

# All sessions
curl http://localhost:3890/sessions

# Current session state
curl http://localhost:3890/session-state

# Topic summary with status
curl http://localhost:3890/topics
```

### Send an event via API

```bash
curl -X POST http://localhost:3890/send \
  -H "Content-Type: application/json" \
  -d '{"content": "Test message", "topic": "test"}'
```

### Toggle Telegram ticker

```bash
# Enable
curl -X POST http://localhost:3890/ticker \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# Disable
curl -X POST http://localhost:3890/ticker \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

### Test Codex execution (via chat)

In the ElizaOS UI, talk to CodeWorker:
```
"Implement a debounce utility in src/utils/debounce.ts"
"Fix the TypeScript errors in src/index.ts"
"Run the tests and show me the results"
"Review the code in this repository"
```

The agent will trigger `CODEX_EXEC` or `CODEX_REVIEW` and delegate to Codex CLI.

### Test agent actions via chat

Talk to the Relay agent:
```
"What's my current session status?"   → GET_STATUS action
"What did I work on today?"           → SEARCH_HISTORY action
"Stop sending Telegram notifications" → TOGGLE_TICKER action
```

---

## REST API Reference

All endpoints on `http://localhost:3890` (configurable via `RELAY_PORT`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health, session status, ticker state |
| `GET` | `/stats` | Total events, sessions, 24h count, avg latency |
| `GET` | `/events` | Global event feed (`?since=`, `?limit=`, `?topic=`) |
| `GET` | `/sessions` | All sessions |
| `GET` | `/sessions/:id/events` | Event timeline for a specific session |
| `GET` | `/topics` | Topic summary with status (in-progress/done/stale) |
| `GET` | `/session-state` | Current JSON session state |
| `POST` | `/send` | Log a send event `{ content, topic?, sender? }` |
| `POST` | `/ticker` | Toggle Telegram ticker `{ enabled: bool }` |
| `DELETE` | `/session/:id` | Purge session state |

---

## Agent Actions Reference

Actions are triggered by the LLM based on message content.

### plugin-relay actions

| Action | Trigger keywords | What it does |
|--------|-----------------|--------------|
| `GET_STATUS` | "status", "stats", "how many" | Returns session stats from the event store |
| `SEARCH_HISTORY` | "history", "what did I", "last week" | SQL query against relay_events |
| `TOGGLE_TICKER` | "telegram", "notifications", "ticker" | Enables/disables Telegram alerts |

### plugin-codex actions

| Action | Trigger keywords | What it does |
|--------|-----------------|--------------|
| `CODEX_EXEC` | "implement", "create", "fix", "test", "build", "run", "install", "deploy" | Runs `codex exec --full-auto <task>` |
| `CODEX_REVIEW` | "review", "audit", "code quality", "security", "find bug" | Runs `codex exec review` |

---

## Project Structure

```
agent-challenge/
├── characters/
│   ├── relay.character.json           ← Relay orchestrator
│   ├── code-worker.character.json     ← CodeWorker specialist
│   ├── research-worker.character.json ← ResearchWorker specialist
│   └── review-worker.character.json   ← ReviewWorker specialist
│
├── src/
│   ├── index.ts                       ← Project entry — boots all 4 agents
│   │
│   ├── plugin-relay/                  ← Core observability plugin
│   │   ├── index.ts                   ← Plugin entry, service bootstrap
│   │   ├── schema.ts                  ← Drizzle schema (relay_events, relay_sessions)
│   │   ├── repository.ts              ← DB queries (writeEvent, getEvents, etc.)
│   │   ├── types.ts                   ← Shared TypeScript types
│   │   ├── actions/
│   │   │   ├── get-status.ts
│   │   │   ├── search-history.ts
│   │   │   └── toggle-ticker.ts
│   │   ├── evaluators/
│   │   │   ├── topic-detection.evaluator.ts
│   │   │   └── latency.evaluator.ts
│   │   ├── providers/
│   │   │   └── session-status.provider.ts
│   │   ├── services/
│   │   │   ├── relay-api.service.ts   ← HTTP server (port 3890)
│   │   │   ├── notion-sync.service.ts ← 30s Notion poll cycle
│   │   │   ├── ticker.service.ts      ← Telegram event notifications
│   │   │   ├── latency-tracker.ts     ← pendingSends map
│   │   │   ├── session-state.ts       ← JSON state persistence
│   │   │   └── log-rotation.ts        ← 10MB/5-file log rotation
│   │   └── notion/
│   │       └── ...                    ← Notion API helpers
│   │
│   ├── plugin-nosana-llm/             ← LLM compatibility plugin
│   │   └── index.ts                   ← Forces /v1/chat/completions
│   │
│   └── plugin-codex/                  ← Task execution plugin
│       └── index.ts                   ← CODEX_EXEC + CODEX_REVIEW actions
│
├── nos_job_def/
│   └── nosana_eliza_job_definition.json
├── Dockerfile
├── .env.example
└── package.json
```

---

## Nosana Deployment

### Build and push Docker image

```bash
docker build -t yourusername/nosana-relay-agent:latest .
docker run -p 3000:3000 -p 3890:3890 --env-file .env yourusername/nosana-relay-agent:latest
# Verify at http://localhost:3000 and http://localhost:3890/health

docker login
docker push yourusername/nosana-relay-agent:latest
```

### Update job definition

Edit `nos_job_def/nosana_eliza_job_definition.json` — change the image and env vars to match your setup.

### Deploy via Nosana Dashboard

1. Visit [dashboard.nosana.com/deploy](https://dashboard.nosana.com/deploy)
2. Connect your Solana wallet
3. Paste your job definition JSON
4. Select GPU market (`nvidia-3090` recommended)
5. Deploy — you'll get a public URL when a node picks up the job

### Deploy via Nosana CLI

```bash
npm install -g @nosana/cli

nosana job post \
  --file ./nos_job_def/nosana_eliza_job_definition.json \
  --market nvidia-4090 \
  --timeout 300 \
  --api YOUR_API_KEY

nosana job status <job-id>
nosana job logs <job-id>
```

---

## Notion Integration Setup (Optional)

1. Create an integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Share a Notion page with the integration
3. Copy the page ID from the URL (32-char hex after the last `/`)
4. Set in `.env`:
   ```env
   NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxx
   NOTION_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxx
   NOTION_SYNC_INTERVAL_MS=30000
   ```

The plugin auto-creates Events and Topics databases in that Notion page on first sync.

---

## Telegram Ticker Setup (Optional)

1. Create a bot via [@BotFather](https://t.me/BotFather) — copy the token
2. Add the bot to a group or channel
3. Get the chat ID (use [@userinfobot](https://t.me/userinfobot) or check the Telegram API)
4. Set in `.env`:
   ```env
   TELEGRAM_BOT_TOKEN=123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TELEGRAM_CHAT_ID=-100xxxxxxxxxx
   TELEGRAM_TICKER_ENABLED=true
   ```

---

## Troubleshooting

**`Not implemented` on startup**
- All 3 services (`RelayApiService`, `NotionSyncService`, `TelegramTickerService`) must have a `static async start(runtime)` method. These are already implemented in this repo.

**`Unexpected message role` / calls to `/v1/responses`**
- `plugin-openai` defaults to the OpenAI Responses API. The `plugin-nosana-llm` in this repo overrides it with priority 1.
- Make sure `OPENAI_API_URL` is set (not just `OPENAI_BASE_URL`).

**Database connection errors**
- Verify `POSTGRES_URL` is correct and the database exists.
- The relay plugin auto-creates tables on boot — you just need an empty database.

**Codex not found**
- Verify: `which codex` and `codex --version`
- Codex must be on PATH when ElizaOS starts.

**Notion not syncing**
- Check `NOTION_TOKEN` and `NOTION_PAGE_ID` are set correctly.
- Verify the integration has access to the page in Notion.

---

## Submission Checklist

- [ ] Fork this repository
- [ ] Build and deploy to Nosana (public URL required)
- [ ] Star these repos:
  - [ ] [nosana-ci/agent-challenge](https://github.com/nosana-ci/agent-challenge)
  - [ ] [nosana-ci/nosana-programs](https://github.com/nosana-ci/nosana-programs)
  - [ ] [nosana-ci/nosana-kit](https://github.com/nosana-ci/nosana-kit)
  - [ ] [nosana-ci/nosana-cli](https://github.com/nosana-ci/nosana-cli)
- [ ] Social media post about the project
- [ ] Agent description ≤300 words
- [ ] Video demo <1 minute
- [ ] Submit at [superteam.fun/earn/listing/nosana-builders-elizaos-challenge](https://superteam.fun/earn/listing/nosana-builders-elizaos-challenge/) before April 14, 2026

---

## Judging Criteria

| Criterion | Weight |
|-----------|--------|
| Technical implementation | 25% |
| Nosana integration depth | 25% |
| Usefulness & UX | 25% |
| Creativity & originality | 15% |
| Documentation | 10% |

---

## Resources

- [ElizaOS Documentation](https://elizaos.github.io/eliza/docs)
- [Nosana Documentation](https://docs.nosana.io)
- [Nosana Dashboard](https://dashboard.nosana.com)
- [Nosana Builders Credits](https://nosana.com/builders-credits)
- [Nosana Discord](https://nosana.com/discord)

---

## Star History

<a href="https://www.star-history.com/?repos=nosana-ci%2Fagent-challenge&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=nosana-ci/agent-challenge&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=nosana-ci/agent-challenge&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=nosana-ci/agent-challenge&type=date&legend=top-left" />
 </picture>
</a>

---

*Built with ElizaOS · Powered by Qwen/Qwen3.5-4B · Deployed on Nosana*
