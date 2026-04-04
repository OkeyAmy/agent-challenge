/**
 * log-rotation.ts — file-based logging with rotation
 *
 * - Max log file size: 10 MB (configurable via RELAY_MAX_LOG_SIZE_MB)
 * - Keeps up to 5 rotated files (configurable via RELAY_MAX_LOG_FILES)
 * - Writes logs to RELAY_LOG_DIR/relay.log
 * - Long content (>200 chars) saved to prompts/ or responses/ subdirs
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { logger } from '@elizaos/core';

const LOG_DIR = process.env.RELAY_LOG_DIR ?? join(process.cwd(), 'relay', 'logs');
const LOG_FILE = join(LOG_DIR, 'relay.log');
const PROMPT_DIR = join(LOG_DIR, 'prompts');
const RESPONSE_DIR = join(LOG_DIR, 'responses');

const MAX_SIZE =
  parseInt(process.env.RELAY_MAX_LOG_SIZE_MB ?? '10', 10) * 1024 * 1024;
const MAX_FILES = parseInt(process.env.RELAY_MAX_LOG_FILES ?? '5', 10);

export function ensureLogDirs(): void {
  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(PROMPT_DIR, { recursive: true });
  mkdirSync(RESPONSE_DIR, { recursive: true });
}

function rotate(): void {
  try {
    if (!existsSync(LOG_FILE)) return;
    if (statSync(LOG_FILE).size < MAX_SIZE) return;

    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const older = `${LOG_FILE}.${i + 1}`;
      const newer = `${LOG_FILE}.${i}`;
      if (i === MAX_FILES - 1 && existsSync(older)) unlinkSync(older);
      if (existsSync(newer)) renameSync(newer, older);
    }
    renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch (err) {
    logger.error(`[log-rotation] rotate failed: ${(err as Error).message}`);
  }
}

export function writeLog(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logger.info(line);
  try {
    rotate();
    appendFileSync(LOG_FILE, line + '\n');
  } catch {
    /* non-fatal */
  }
}

/**
 * Save prompt to file if content exceeds threshold.
 * Returns the file path if saved, otherwise null.
 */
export function savePromptFile(
  text: string,
  sender: string,
  receiver: string
): string | null {
  if (text.length <= 200) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_');
  const fname = `${ts}-${safe(sender)}-to-${safe(receiver)}.txt`;
  const fpath = join(PROMPT_DIR, fname);
  writeFileSync(fpath, text);
  writeLog(`SEND full prompt saved: ${fpath}`);
  return fpath;
}

/**
 * Save response to file if content exceeds threshold.
 * Returns the file path if saved, otherwise null.
 */
export function saveResponseFile(text: string, from: string): string | null {
  if (text.length <= 2000) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_');
  const fname = `${ts}-${safe(from)}.txt`;
  const fpath = join(RESPONSE_DIR, fname);
  writeFileSync(fpath, text);
  return fpath;
}

export { LOG_DIR, PROMPT_DIR, RESPONSE_DIR };
