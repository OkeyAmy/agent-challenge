# Forge

**Forge** is an autonomous AI software-engineering agent written entirely in Rust. It spins up an isolated Docker sandbox, clones a repository, and autonomously writes, edits, and tests code — driven by any OpenAI-compatible model API — until it produces a verified patch.

It integrates with [ElizaOS](https://elizaos.com) as a first-class action handler and can be deployed on decentralised compute infrastructure such as [Nosana](https://nosana.com).

---

## Live demo — real GitHub issue solved end-to-end

> **Issue #25** on [`OkeyAmy/Axioschat-Onboard`](https://github.com/OkeyAmy/Axioschat-Onboard/issues/25):
> *"Add a utility function `isValidEmail(email: string): boolean` in `src/utils/validation.ts` …"*

### 1 — Write a config file

```yaml
# issue25.yaml
agent:
  model_name: models/gemini-2.0-flash-001
  base_url: https://generativelanguage.googleapis.com/v1beta/openai
  api_key: $FORGE_API_KEY          # never hard-code keys — read from env
  max_steps: 25
  parser_type: thought_action
  system_template: |
    You are an expert software engineer inside a Docker container.
    The repository is at {repo}.
    CRITICAL: Each response must contain EXACTLY ONE ```bash``` block.
    When done, run: submit
  instance_template: |
    TASK:
    {problem_statement}
    Repository: {repo}. Explore, implement, then run `submit`.

env:
  image: forge-sandbox:latest      # python:3.11-slim + git, pre-built locally
  repo_path: /repo
  timeout_secs: 120
  startup_commands:
    - "git clone --depth 1 https://github.com/OkeyAmy/Axioschat-Onboard /repo"
    - "git -C /repo config user.email forge@forge.local && git -C /repo config user.name Forge"
    - "printf '#!/bin/sh\\ncd /repo && git add -A 2>/dev/null && git diff --cached\\n' > /usr/local/bin/submit && chmod +x /usr/local/bin/submit"

problem_statement:
  type: github_issue
  url: https://github.com/OkeyAmy/Axioschat-Onboard/issues/25

output_dir: trajectories
```

### 2 — Run Forge

```bash
set -a && source .env && set +a
./target/release/forge run --config issue25.yaml
```

### 3 — What the agent did (8 steps, all autonomous)

```
[step 1]  ls -F src
[step 2]  ls -F
[step 3]  ls -F /repo
[step 4]  ls -F /repo/src
[step 5]  ls -F /repo/src/utils          ← discovered no utils dir yet
[step 6]  cat << EOF > /repo/src/utils/validation.ts ...
[step 7]  cat << EOF > /repo/src/utils/string.ts ...
[step 8]  submit                          ← produced a git diff patch
```

### 4 — Output

```
Run complete. Exit status: submitted
Submission:
diff --git a/src/utils/string.ts b/src/utils/string.ts
new file mode 100644
--- /dev/null
+++ b/src/utils/string.ts
@@ -0,0 +1,20 @@
+export function truncate(text: string, maxLength: number): string {
+  if (text.length <= maxLength) { return text; }
+  if (maxLength <= 3) { return ".".repeat(maxLength); }
+  return text.substring(0, maxLength - 3) + "...";
+}
...

diff --git a/src/utils/validation.ts b/src/utils/validation.ts
new file mode 100644
--- /dev/null
+++ b/src/utils/validation.ts
@@ -0,0 +1,22 @@
+export function isValidEmail(email: string): boolean {
+  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
+  return emailRegex.test(email);
+}
...
```

### 5 — The resulting pull request

The patch was applied and pushed automatically:
**[https://github.com/OkeyAmy/Axioschat-Onboard/pull/26](https://github.com/OkeyAmy/Axioschat-Onboard/pull/26)**

The complete agent trajectory (every command, every output, model response, timing) is stored in [`trajectories/OkeyAmy__Axioschat-Onboard-i25.traj`](trajectories/OkeyAmy__Axioschat-Onboard-i25.traj).

---

## How Forge works

```
You: "Fix issue #25"
        │
        ▼
┌─────────────────────────────────────────────┐
│  Forge                                      │
│                                             │
│  1. Fetches problem statement               │
│     (GitHub issue, text, or file)           │
│  2. Starts isolated Docker sandbox          │
│  3. Runs startup commands                   │
│     (clone repo, configure git, etc.)       │
│  4. Enters the agent step loop:             │
│     a. Applies history processors           │
│     b. Renders system + instance templates  │
│     c. Queries OpenAI-compatible model      │
│     d. Parses thought + bash action         │
│     e. Executes command in sandbox          │
│     f. Records observation in trajectory    │
│     g. Repeats until submit / step limit    │
│  5. Captures git diff as the patch          │
│  6. Tears down sandbox container            │
│  7. Saves full trajectory (.traj file)      │
└─────────────────────────────────────────────┘
        │
        ▼
  Clean git diff — ready to apply as a PR
```

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [CLI reference](#cli-reference)
- [Running with Docker Compose](#running-with-docker-compose)
- [Deploying to Nosana](#deploying-to-nosana)
- [ElizaOS integration](#elizaos-integration)
- [Trajectories](#output--trajectories)
- [Crate architecture](#crate-architecture)
- [Building from source](#building-from-source)
- [Environment variables](#environment-variables)

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Docker 24+ | Required at runtime — Forge sandboxes every run inside a container |
| Rust 1.82+ | Build only — not required at runtime |

Build the sandbox image once (git pre-installed):

```bash
docker build -f Dockerfile.sandbox -t forge-sandbox:latest .
```

---

## Quick start

### 1. Get the code

```bash
git clone <your-repo-url>
cd forge
```

### 2. Configure credentials

```bash
cp .env.example .env
# Edit .env and set FORGE_MODEL, FORGE_BASE_URL, FORGE_API_KEY
```

### 3. Build

```bash
cargo build --release -p forge
```

### 4. Run against a GitHub issue

```bash
set -a && source .env && set +a

./target/release/forge run \
  --github-url https://github.com/owner/repo/issues/42
```

### 5. Run with a config file

```bash
./target/release/forge run --config issue25.yaml
```

---

## Configuration

### `.env` file

```dotenv
# Required — any OpenAI-compatible API endpoint
FORGE_MODEL=your-model-name
FORGE_BASE_URL=https://your-provider.example.com/v1/openai
FORGE_API_KEY=your-api-key

# Optional
RUST_LOG=forge=info
GITHUB_TOKEN=ghp_...        # raises GitHub API rate limit
DOCKER_GID=999              # host Docker group GID for docker-compose socket mount
```

See [`.env.example`](.env.example) for all options. **Never commit `.env`.**

### YAML config file

```yaml
agent:
  model_name: your-model-name
  base_url: https://your-provider.example.com/v1/openai
  api_key: your-api-key        # or omit to fall back to FORGE_API_KEY env var
  max_steps: 50
  max_requeries: 3
  parser_type: thought_action  # thought_action | action_only | function_calling

env:
  image: forge-sandbox:latest
  repo_path: /repo
  timeout_secs: 120
  startup_commands:
    - "git clone --depth 1 https://github.com/owner/repo /repo"
    - "git -C /repo config user.email agent@forge.local && git -C /repo config user.name Forge"

problem_statement:
  type: github_issue
  url: https://github.com/owner/repo/issues/42
  # OR: type: text,      text: "Add rate-limiting middleware"
  # OR: type: text_file, path: /path/to/problem.txt

output_dir: trajectories
```

CLI flags override individual YAML fields when passed after `--config`.

---

## CLI reference

### `forge run`

| Flag | Env var | Default | Description |
|---|---|---|---|
| `--config <path>` | — | — | YAML config file |
| `--github-url <url>` | — | — | GitHub issue URL |
| `--problem-text <text>` | — | — | Inline problem statement |
| `--problem-file <path>` | — | — | Path to a plain-text problem file |
| `--model <name>` | `FORGE_MODEL` | — | Model identifier |
| `--base-url <url>` | `FORGE_BASE_URL` | — | OpenAI-compatible API base URL |
| `--api-key <key>` | `FORGE_API_KEY` | — | API key |
| `--image <image>` | — | `forge-sandbox:latest` | Docker sandbox image |
| `--output-dir <dir>` | — | `trajectories` | Where to save `.traj` files |
| `--max-steps <n>` | — | `100` | Step limit before giving up |

Problem statement priority: `--github-url` > `--problem-text` > `--problem-file` > value from `--config`.

### `forge quick-stats [directory]`

Scan a directory of `.traj` files and print a result summary:

```
Trajectory stats for "trajectories":
  Total:             12
  Submitted:          9
  Forfeited:          2
  Errors:             1
  Step limit:         0
  Other:              0
```

---

## Running with Docker Compose

```bash
# Build the forge image
docker compose build

# Solve a GitHub issue
docker compose run --rm forge run \
  --github-url https://github.com/owner/repo/issues/42

# Use a local YAML config
docker compose run --rm \
  -v "$(pwd)/issue25.yaml:/config.yaml:ro" \
  forge run --config /config.yaml

# Show stats on saved trajectories
docker compose run --rm quick-stats
```

Find your host Docker group GID for the `.env`:

```bash
getent group docker | cut -d: -f3
```

---

## Deploying to Nosana

Forge runs as a standard Docker container and deploys directly to [Nosana](https://nosana.com)'s decentralised compute network.

### 1. Build and push

```bash
docker build -t yourusername/forge:latest .
docker push yourusername/forge:latest
```

### 2. Job definition

```json
{
  "version": "0.1",
  "type": "container",
  "meta": { "trigger": "cli" },
  "ops": [
    {
      "type": "container/run",
      "id": "forge-agent",
      "args": {
        "image": "yourusername/forge:latest",
        "env": {
          "FORGE_MODEL": "your-model-name",
          "FORGE_BASE_URL": "https://your-provider.example.com/v1/openai",
          "FORGE_API_KEY": "your-api-key",
          "RUST_LOG": "forge=info"
        },
        "cmd": [
          "run",
          "--github-url", "https://github.com/owner/repo/issues/42",
          "--output-dir", "/trajectories"
        ],
        "volumes": [
          { "name": "trajectories", "path": "/trajectories" }
        ]
      }
    }
  ]
}
```

### 3. Deploy via Nosana CLI

```bash
npm install -g @nosana/cli

nosana job post \
  --file ./nos_job_def/forge_job_definition.json \
  --market nvidia-4090 \
  --timeout 120 \
  --api <YOUR_NOSANA_API_KEY>
```

### 4. Deploy via Nosana Dashboard

1. Go to [dashboard.nosana.com/deploy](https://dashboard.nosana.com/deploy)
2. Paste your job definition JSON
3. Select a compute market (`nvidia-4090` recommended)
4. Click **Deploy**

---

## ElizaOS integration

`forge-plugin` exposes a `SolveIssueAction` that integrates directly into any [ElizaOS](https://elizaos.com) agent as a plugin action:

```rust
use forge_plugin::action::{SolveIssueAction, SolveIssueParams};

let action = SolveIssueAction::new();
let result = action.handle(SolveIssueParams {
    github_url: Some("https://github.com/owner/repo/issues/42".into()),
    model_name: Some("your-model".into()),
    base_url:   Some("https://your-provider.example.com/v1/openai".into()),
    api_key:    Some("your-api-key".into()),
    ..Default::default()
}).await?;

println!("exit:  {:?}", result.exit_status);
println!("patch: {:?}", result.submission);
```

Wire this into an ElizaOS character so your personal assistant can autonomously fix bugs on request.

---

## Output — trajectories

Every run saves a `<instance-id>.traj` JSON file in the `output_dir`. The file contains the complete record of the agent's work:

```jsonc
{
  "trajectory": [
    {
      "thought":         "I should explore the repo structure first",
      "action":          "ls -F /repo/src",
      "observation":     "components/\nutils/\nApp.tsx\n...",
      "response":        "...",    // raw model output
      "execution_time":  0.43,
      "state":           {},
      "query":           [],
      "extra_info":      {}
    }
    // one entry per step
  ],
  "history": [ ... ],   // full prompt/response history sent to the model
  "info":    { ... },   // exit_status, submission patch, stats
  "environment": "docker"
}
```

A real trajectory from the live demo above is checked into this repository:
[`trajectories/OkeyAmy__Axioschat-Onboard-i25.traj`](trajectories/OkeyAmy__Axioschat-Onboard-i25.traj)

---

## Crate architecture

Forge is a Rust workspace with a strict layered dependency graph — no circular dependencies.

```
forge/crates/
│
├── forge-types      Shared data types: History, Trajectory, ModelOutput,
│                   StepOutput, ExitStatus, ForgeError, special tokens.
│                   Pure data — zero I/O.
│
├── forge-tools      Parsers (ThoughtAction, ActionOnly, XML, FunctionCalling,
│                   factory), windowed file viewer, StrReplaceEditor.
│
├── forge-model      AbstractModel trait + implementations:
│                   • OpenAICompatModel  — any OpenAI-compatible HTTP endpoint
│                   • AnthropicModel     — Anthropic messages API + extended thinking
│                   • ReplayModel        — deterministic replay from a .traj file
│                   • HumanModel         — interactive human-in-the-loop
│
├── forge-env        Docker runtime (bollard), persistent bash sessions,
│                   repo checkout/reset, file upload/download.
│
├── forge-agent      Agent loop (DefaultAgent), history processors,
│                   problem statement variants (text, file, GitHub issue).
│
├── forge-run        RunSingle, RunBatch, YAML config loading.
│
├── forge-plugin     ElizaOS integration boundary.
│                   SolveIssueAction wraps RunSingle behind a simple
│                   async handle(params) interface.
│
└── forge            forge binary — clap CLI (run, quick-stats subcommands).
```

Dependency flow:

```
forge → forge-run → forge-agent → forge-model
                              └→ forge-env   → forge-types
                                              → forge-tools
```

---

## Building from source

```bash
# Type-check everything
cargo check

# Run all tests (Docker tests auto-skipped when Docker is unavailable)
cargo test --workspace

# Release build
cargo build --release -p forge

# Run the binary
./target/release/forge --help
```

Run Docker-dependent integration tests when Docker is available:

```bash
cargo test --workspace -- --include-ignored
```

Test breakdown:

| Crate | Tests |
|---|---|
| forge-types | 19 |
| forge-tools | 70 |
| forge-model | 28 |
| forge-env | 14 (+ 7 Docker-gated) |
| forge-agent | 38 |
| forge-run | 22 |
| forge-plugin | 7 |
| **Total** | **199 passing** |

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `FORGE_MODEL` | Yes | Model identifier passed to the API |
| `FORGE_BASE_URL` | Yes | Base URL of an OpenAI-compatible completions endpoint |
| `FORGE_API_KEY` | Yes | API key for the model endpoint |
| `RUST_LOG` | No | Log filter — e.g. `forge=debug` (default: `forge=info`) |
| `GITHUB_TOKEN` | No | GitHub PAT — raises API rate limit when fetching issues |
| `DOCKER_GID` | No | Docker group GID on the host (docker-compose socket mount) |

---

## License

MIT
