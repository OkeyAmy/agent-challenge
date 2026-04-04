/**
 * SEARCH_HISTORY action — query past events from the event store
 *
 * Triggered when user asks about past work, what was done, recent tasks, etc.
 * Extracts a date hint from the message and queries relay_events.
 */

import type { Action, IAgentRuntime, Memory, HandlerCallback } from '@elizaos/core';
import { RelayRepository } from '../repository.js';

const TRIGGER_PATTERNS = [
  /what did (i|you|we) (do|work on|ask|build|research)/i,
  /what (have|has) (i|you|we) (done|built|asked)/i,
  /recent(ly)?/i,
  /history/i,
  /last (week|day|hour|session)/i,
  /show me (past|previous|recent)/i,
  /recall|remember when/i,
];

function shouldTrigger(text: string): boolean {
  return TRIGGER_PATTERNS.some((p) => p.test(text));
}

function extractSince(text: string): string | undefined {
  const now = Date.now();
  if (/last hour/i.test(text))  return new Date(now - 3_600_000).toISOString();
  if (/today/i.test(text))      return new Date(now - 86_400_000).toISOString();
  if (/last day/i.test(text))   return new Date(now - 86_400_000).toISOString();
  if (/last week/i.test(text))  return new Date(now - 7 * 86_400_000).toISOString();
  if (/last month/i.test(text)) return new Date(now - 30 * 86_400_000).toISOString();
  return undefined;
}

export const searchHistoryAction: Action = {
  name: 'SEARCH_HISTORY',
  similes: ['RECALL', 'HISTORY', 'PAST_EVENTS', 'WHAT_DID_I', 'SEARCH_EVENTS'],
  description:
    'Searches the relay event store for past tasks, returning a timeline of recent activity.',

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    if (!(runtime as any)?.db) return false;
    return shouldTrigger(message.content.text ?? '');
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: unknown,
    _options: unknown,
    callback?: HandlerCallback
  ) => {
    const repo  = new RelayRepository((runtime as any).db);
    const text  = message.content.text ?? '';
    const since = extractSince(text);

    const events = await repo.getEvents({ since, limit: 20 });

    if (events.length === 0) {
      await callback?.({
        text: "I don't have any recorded events yet. Start using me and everything will be logged here.",
        actions: ['SEARCH_HISTORY'],
      });
      return;
    }

    const lines = events.slice(0, 10).map((e) => {
      const ts      = new Date(e.timestamp).toLocaleString();
      const preview = (e.content ?? '').substring(0, 80).replace(/\n/g, ' ');
      return `• [${ts}] ${e.eventType.toUpperCase()} ${e.sender} → ${e.receiver}${e.topic ? ` [${e.topic}]` : ''}: ${preview}`;
    });

    const summary = [
      `**Recent Activity** (${events.length} events found)`,
      ...lines,
      events.length > 10 ? `…and ${events.length - 10} more` : '',
    ].filter(Boolean).join('\n');

    await callback?.({ text: summary, actions: ['SEARCH_HISTORY'] });
  },

  examples: [
    [
      { name: 'User',  content: { text: 'What did I work on last week?' } },
      { name: 'Relay', content: { text: '**Recent Activity**\n• [Apr 1] SEND...', actions: ['SEARCH_HISTORY'] } },
    ],
  ],
};
