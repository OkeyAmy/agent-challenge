/**
 * latency-tracker.ts — per-message send/response latency tracking
 *
 * Keeps a Map of pending sends keyed by receiver name.
 * When the response arrives, latency = Date.now() - send_timestamp.
 */

import type { PendingSend } from '../types.js';

/** Module-level singleton — shared across the whole plugin lifecycle */
const pending = new Map<string, PendingSend>();

export function trackSend(
  receiver: string,
  data: PendingSend
): void {
  pending.set(receiver, data);
}

export function resolveSend(
  sender: string
): PendingSend & { latencyMs: number } | null {
  const entry = pending.get(sender);
  if (!entry) return null;
  pending.delete(sender);
  return { ...entry, latencyMs: Date.now() - entry.timestamp };
}

export function hasPending(receiver: string): boolean {
  return pending.has(receiver);
}

export function clearPending(receiver: string): void {
  pending.delete(receiver);
}
