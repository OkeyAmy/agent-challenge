/**
 * src/index.ts — ElizaOS Project entry point
 *
 * Registers 4 agents sharing the relay_events PostgreSQL table.
 * The relayPlugin is injected directly via ProjectAgent.plugins so ElizaOS
 * doesn't have to resolve it as a package name (local path resolution breaks
 * inside @elizaos/core when using character file plugin strings).
 *
 *   Relay         — orchestrator: REST API, Notion sync, Telegram ticker
 *   CodeWorker    — code review, debugging, refactoring
 *   ResearchWorker — web research, summarization
 *   ReviewWorker  — PR review, architecture critique, quality gate
 *
 * Run:
 *   pnpm start:all   → loads this file (Project pattern, all 4 agents)
 *   pnpm start       → loads relay.character.json only (single agent)
 */

import { type Project, type ProjectAgent, logger } from '@elizaos/core';
import { relayPlugin } from './plugin-relay/index.js';
import { nosanaLlmPlugin } from './plugin-nosana-llm/index.js';
import { codexPlugin } from './plugin-codex/index.js';
import relayChar from '../characters/relay.character.json' with { type: 'json' };
import codeChar from '../characters/code-worker.character.json' with { type: 'json' };
import researchChar from '../characters/research-worker.character.json' with { type: 'json' };
import reviewChar from '../characters/review-worker.character.json' with { type: 'json' };

const relayAgent: ProjectAgent = {
  character: relayChar as any,
  plugins:   [relayPlugin, nosanaLlmPlugin, codexPlugin],
  init: async (runtime) => {
    logger.info(`[${runtime.character.name}] online — REST API on http://0.0.0.0:${process.env.RELAY_PORT ?? 3890}`);
  },
};

const codeWorkerAgent: ProjectAgent = {
  character: codeChar as any,
  plugins:   [relayPlugin, nosanaLlmPlugin, codexPlugin],
  init: async (runtime) => {
    logger.info(`[${runtime.character.name}] online`);
  },
};

const researchWorkerAgent: ProjectAgent = {
  character: researchChar as any,
  plugins:   [relayPlugin, nosanaLlmPlugin, codexPlugin],
  init: async (runtime) => {
    logger.info(`[${runtime.character.name}] online`);
  },
};

const reviewWorkerAgent: ProjectAgent = {
  character: reviewChar as any,
  plugins:   [relayPlugin, nosanaLlmPlugin, codexPlugin],
  init: async (runtime) => {
    logger.info(`[${runtime.character.name}] online`);
  },
};

const project: Project = {
  agents: [relayAgent, codeWorkerAgent, researchWorkerAgent, reviewWorkerAgent],
};

export default project;
