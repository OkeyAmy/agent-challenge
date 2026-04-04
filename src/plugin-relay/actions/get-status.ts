/**
 * GET_STATUS action — returns relay stats conversationally
 *
 * Triggered when the user asks about stats, history, status, or metrics.
 * Queries the event store and replies with a formatted summary.
 */

import type { Action, IAgentRuntime, Memory, HandlerCallback } from '@elizaos/core';
import { RelayRepository } from '../repository.js';

export const getStatusAction: Action = {
  name: 'GET_STATUS',
  similes: ['STATUS', 'STATS', 'RELAY_STATUS', 'HOW_MANY', 'METRICS'],
  description:
    'Returns current relay stats: total events, sessions, avg latency, active topics.',

  validate: async (runtime: IAgentRuntime) => {
    return !!(runtime as any).db;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: unknown,
    _options: unknown,
    callback?: HandlerCallback
  ) => {
    const repo = new RelayRepository((runtime as any).db);

    const [stats, topics] = await Promise.all([
      repo.getStats(),
      repo.getTopics(),
    ]);

    const topicSummary =
      topics.length > 0
        ? topics
            .slice(0, 5)
            .map((t) => `  • ${t.topic} (${t.eventCount} events, last: ${new Date(t.lastActivity).toLocaleString()})`)
            .join('\n')
        : '  none yet';

    const text = [
      `**Relay Status**`,
      `• Total events: ${stats.totalEvents}`,
      `• Events (24 h): ${stats.eventsLast24h}`,
      `• Sessions: ${stats.totalSessions}`,
      `• Avg latency: ${stats.avgLatencyMs !== null ? stats.avgLatencyMs + ' ms' : 'n/a'}`,
      `• Active topics:\n${topicSummary}`,
    ].join('\n');

    await callback?.({ text, actions: ['GET_STATUS'] });
  },

  examples: [
    [
      { name: 'User',  content: { text: 'What are your stats?' } },
      { name: 'Relay', content: { text: '**Relay Status**\n• Total events: 47\n...', actions: ['GET_STATUS'] } },
    ],
  ],
};
