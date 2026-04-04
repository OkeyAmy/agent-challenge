/**
 * plugin-relay — ElizaOS Plugin entry point
 *
 * One consolidated plugin providing:
 *   - Drizzle schema (auto-migrated by ElizaOS via Plugin.schema)
 *   - Services: REST API · Notion sync · Telegram ticker
 *   - Actions:  GET_STATUS · SEARCH_HISTORY · TOGGLE_TICKER
 *   - Providers: RELAY_SESSION_STATUS
 *   - Evaluators: TOPIC_DETECTION · RELAY_LATENCY
 *
 * All 4 agents share relay_events / relay_sessions tables.
 * Use the agent_name column to filter per-agent.
 *
 * REST API on RELAY_PORT (default 3890) — curl-friendly, accessible to other projects:
 *   curl http://localhost:3890/stats
 *   curl http://localhost:3890/events?limit=20
 */

import type { Plugin } from '@elizaos/core';
import { relaySchema } from './schema.js';
import { TelegramTickerService } from './services/ticker.service.js';
import { NotionSyncService } from './services/notion-sync.service.js';
import { RelayApiService } from './services/relay-api.service.js';
import { getStatusAction } from './actions/get-status.js';
import { searchHistoryAction } from './actions/search-history.js';
import { toggleTickerAction } from './actions/toggle-ticker.js';
import { sessionStatusProvider } from './providers/session-status.provider.js';
import { topicDetectionEvaluator } from './evaluators/topic-detection.evaluator.js';
import { latencyEvaluator } from './evaluators/latency.evaluator.js';
import { ensureLogDirs } from './services/log-rotation.js';

ensureLogDirs();

export const relayPlugin: Plugin = {
  name: 'plugin-relay',
  description:
    'Personal AI observability layer: PostgreSQL event store, REST API, session persistence, latency tracking, topic auto-detection, Notion sync, Telegram ticker.',

  // ElizaOS reads Plugin.schema and auto-migrates tables on boot
  schema: relaySchema,

  // Services started in order — ticker first so API can reference it
  services: [TelegramTickerService, NotionSyncService, RelayApiService],

  actions:    [getStatusAction, searchHistoryAction, toggleTickerAction],
  providers:  [sessionStatusProvider],
  evaluators: [topicDetectionEvaluator, latencyEvaluator],
};

export default relayPlugin;

export * from './types.js';
export { RelayRepository } from './repository.js';
export { TelegramTickerService } from './services/ticker.service.js';
export { NotionSyncService } from './services/notion-sync.service.js';
export { RelayApiService } from './services/relay-api.service.js';
