/**
 * session-status.provider.ts — injects relay stats into every conversation
 *
 * Makes the agent aware of its own activity: how many events have been
 * logged, what topics are active, and current session info.
 */

import type { Provider, IAgentRuntime, Memory } from '@elizaos/core';
import { RelayRepository } from '../repository.js';

export const sessionStatusProvider: Provider = {
  name: 'RELAY_SESSION_STATUS',
  description: 'Current relay event store stats and active topics',

  get: async (runtime: IAgentRuntime, _message: Memory) => {
    const db = (runtime as any).db;
    if (!db) return { text: '', data: {}, values: {} };

    try {
      const repo = new RelayRepository(db);
      const [stats, topics] = await Promise.all([
        repo.getStats(),
        repo.getTopics(),
      ]);

      const activeTopics = topics
        .filter((t) => t.latestEventType !== 'exit')
        .slice(0, 5)
        .map((t) => t.topic)
        .join(', ');

      const text = [
        `[Relay Context]`,
        `Total events logged: ${stats.totalEvents}`,
        `Events in last 24h: ${stats.eventsLast24h}`,
        `Avg response latency: ${stats.avgLatencyMs !== null ? stats.avgLatencyMs + 'ms' : 'n/a'}`,
        activeTopics ? `Active topics: ${activeTopics}` : '',
      ].filter(Boolean).join(' | ');

      return {
        text,
        data:   { stats, topics },
        values: {
          totalEvents:    stats.totalEvents,
          eventsLast24h:  stats.eventsLast24h,
          avgLatencyMs:   stats.avgLatencyMs,
          activeTopics,
        },
      };
    } catch {
      return { text: '', data: {}, values: {} };
    }
  },
};
