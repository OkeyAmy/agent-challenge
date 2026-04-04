/**
 * latency.evaluator.ts — records agent response latency to the event store
 *
 * Runs after every response. Resolves pending send records to calculate
 * how long the agent took to respond, then writes a `response` event.
 */

import type { Evaluator, IAgentRuntime, Memory } from '@elizaos/core';
import { RelayRepository } from '../repository.js';
import { TelegramTickerService } from '../services/ticker.service.js';
import { resolveSend } from '../services/latency-tracker.js';
import { detectTopic } from './topic-detection.evaluator.js';
import { writeLog } from '../services/log-rotation.js';

export const latencyEvaluator: Evaluator = {
  name:        'RELAY_LATENCY',
  description: 'Records agent response time to the event store and fires Telegram ticker',
  alwaysRun:   true,
  similes:     [],
  examples:    [],

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    return !!(message.content.text && message.entityId);
  },

  handler: async (runtime: IAgentRuntime, message: Memory) => {
    const db = (runtime as any).db;
    if (!db) return;

    const repo   = new RelayRepository(db);
    const ticker = runtime.getService<TelegramTickerService>(TelegramTickerService.serviceType);

    const text   = message.content.text ?? '';
    const roomId = String(message.roomId ?? '');
    const agentName = runtime.character.name ?? 'Relay';

    // Resolve latency from a prior /send POST
    const resolved = resolveSend(roomId) ?? resolveSend(agentName);

    const latencyMs = resolved?.latencyMs;
    const topic     = resolved?.topic ?? detectTopic(text) ?? undefined;

    await repo.insertEvent({
      eventType:     'response',
      agentName,
      sender:        agentName,
      receiver:      resolved?.sender ?? 'user',
      sessionId:     roomId,
      content:       text.substring(0, 5_000),
      latencyMs,
      originChatId:  resolved?.originChatId,
      originTopicId: resolved?.originTopicId,
      topic,
    });

    if (latencyMs) {
      writeLog(`RESPONSE ${agentName} → user: ${latencyMs}ms`);
    }

    if (ticker?.isEnabled()) {
      ticker.fire('response', agentName, resolved?.sender ?? 'user', text, {
        latencyMs,
        originChatId:  resolved?.originChatId,
        originTopicId: resolved?.originTopicId,
      });
    }

    return { success: true, data: { latencyMs, topic }, values: { latencyMs, topic } };
  },
};
