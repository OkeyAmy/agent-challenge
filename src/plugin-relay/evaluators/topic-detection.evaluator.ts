/**
 * topic-detection.evaluator.ts — auto-detect topic from conversation
 *
 * Runs after every response. Scans message content for topic signals
 * and writes the detected topic to the relay_events table.
 *
 * Topics are used by Notion sync for the Topics kanban board.
 */

import type { Evaluator, IAgentRuntime, Memory } from '@elizaos/core';
import { RelayRepository } from '../repository.js';

// Keyword → topic label mapping (ordered by specificity)
const TOPIC_RULES: Array<{ patterns: RegExp[]; topic: string }> = [
  { patterns: [/\bcode review\b/i, /\breview (this|my|the)? ?(code|pr|pull request)\b/i], topic: 'code-review' },
  { patterns: [/\bdebug\b/i, /\bfix (the|this|a)? ?bug\b/i, /\berror\b.*\bfix\b/i],       topic: 'debugging' },
  { patterns: [/\bresearch\b/i, /\bsummar(ize|ise)\b/i, /\bfind (info|information|data)\b/i], topic: 'research' },
  { patterns: [/\bwrite (a|the|an)? ?(blog|post|article|copy|email|tweet)\b/i, /\bcontent\b/i], topic: 'writing' },
  { patterns: [/\bdeploy\b/i, /\bnosana\b/i, /\bdocker\b/i, /\bkubernetes\b/i],           topic: 'deployment' },
  { patterns: [/\btest(s|ing)?\b/i, /\bunit test\b/i, /\be2e\b/i],                        topic: 'testing' },
  { patterns: [/\brefactor\b/i, /\bclean up\b/i, /\bimprove (the|this)? ?code\b/i],       topic: 'refactoring' },
  { patterns: [/\barchitect(ure)?\b/i, /\bdesign (system|pattern|the)\b/i],                topic: 'architecture' },
  { patterns: [/\bscript\b/i, /\bautomat(e|ion)\b/i],                                     topic: 'automation' },
  { patterns: [/\belizaos\b/i, /\bplugin\b/i, /\bagent\b/i],                              topic: 'elizaos' },
];

export function detectTopic(text: string): string | null {
  for (const rule of TOPIC_RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.topic;
  }
  return null;
}

export const topicDetectionEvaluator: Evaluator = {
  name:       'TOPIC_DETECTION',
  description: 'Detects conversation topic and logs it to the relay event store',
  alwaysRun:  true,
  similes:    [],
  examples:   [],

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    return !!message.content.text;
  },

  handler: async (runtime: IAgentRuntime, message: Memory) => {
    const db = (runtime as any).db;
    if (!db) return;

    const text  = message.content.text ?? '';
    const topic = detectTopic(text);
    if (!topic) return;

    const repo = new RelayRepository(db);
    await repo.insertEvent({
      eventType: 'send',
      sender:    String(message.entityId ?? 'user'),
      receiver:  runtime.character.name ?? 'Relay',
      sessionId: String(message.roomId),
      content:   text.substring(0, 5_000),
      topic,
    });

    return { success: true, data: { topic }, values: { topic } };
  },
};
