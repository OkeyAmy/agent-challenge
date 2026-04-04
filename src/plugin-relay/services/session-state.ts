/**
 * session-state.ts — JSON-backed session persistence
 *
 * Preserves session context across restarts. Same v2 format as the
 * original relay-service.mjs: { workerName: { sessionId, status, ... } }
 *
 * Uses atomic write (tmp → rename) + backup to prevent corruption.
 */

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '@elizaos/core';
import type { SessionStateMap, SessionStateEntry } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const STATE_FILE =
  process.env.RELAY_SESSION_STATE ||
  join(process.cwd(), 'relay', 'relay-session-state.json');

const BACKUP_FILE = STATE_FILE.replace(/\.json$/, '.backup.json');

// ── v1 migration: { name: "sessionId" } → v2 ─────────────────────────────────
function migrate(raw: Record<string, unknown>): SessionStateMap {
  const out: SessionStateMap = {};
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val === 'string') {
      out[key] = {
        sessionId: val,
        status: 'suspended',
        project: key,
        lastMessageAt: null,
        cwd: process.cwd(),
      };
      logger.info(`[session-state] migrated ${key} to v2 format`);
    } else {
      out[key] = val as SessionStateEntry;
    }
  }
  return out;
}

export function loadSessionState(): SessionStateMap {
  for (const f of [STATE_FILE, BACKUP_FILE]) {
    try {
      if (existsSync(f)) {
        const raw = JSON.parse(readFileSync(f, 'utf8')) as Record<
          string,
          unknown
        >;
        if (f === BACKUP_FILE) {
          logger.warn('[session-state] loaded from backup file');
        }
        return migrate(raw);
      }
    } catch (err) {
      logger.warn(
        `[session-state] could not parse ${f}: ${(err as Error).message}`
      );
    }
  }
  return {};
}

export function saveSessionState(state: SessionStateMap): void {
  try {
    if (existsSync(STATE_FILE)) {
      writeFileSync(BACKUP_FILE, readFileSync(STATE_FILE));
    }
  } catch {
    /* best-effort backup */
  }

  const tmp = STATE_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, STATE_FILE);
}

export function recordSession(
  workerName: string,
  sessionId: string,
  cwd?: string
): void {
  const state = loadSessionState();
  const existing = state[workerName] ?? {};
  state[workerName] = {
    sessionId,
    status: 'active',
    project: (existing as SessionStateEntry).project ?? workerName,
    lastMessageAt: new Date().toISOString(),
    cwd: cwd ?? (existing as SessionStateEntry).cwd ?? process.cwd(),
  };
  saveSessionState(state);
}

export function suspendSession(workerName: string): void {
  const state = loadSessionState();
  if (state[workerName]) {
    state[workerName].status = 'suspended';
    saveSessionState(state);
  }
}

export function touchSession(workerName: string): void {
  const state = loadSessionState();
  if (state[workerName]) {
    state[workerName].lastMessageAt = new Date().toISOString();
    saveSessionState(state);
  }
}

export function clearSession(workerName: string): void {
  const state = loadSessionState();
  delete state[workerName];
  saveSessionState(state);
}

export function getLastSession(workerName: string): string | null {
  return loadSessionState()[workerName]?.sessionId ?? null;
}
