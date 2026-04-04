/**
 * plugin-codex — Gives ElizaOS agents real-world execution power via Codex CLI
 *
 * Agents in ElizaOS are conversational by nature. This plugin bridges the gap
 * by letting any agent delegate actual work to Codex (codex exec).
 *
 * Actions:
 *   CODEX_EXEC    — Run any task non-interactively via `codex exec --full-auto`
 *   CODEX_REVIEW  — Run a full code review via `codex exec review`
 *
 * Codex handles:
 *   - Reading / writing files
 *   - Running shell commands, tests, builds
 *   - Git operations (diff, status, commit)
 *   - Searching and navigating codebases
 *
 * The agent acts as coordinator + observer; Codex is the executor.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Action, HandlerCallback, IAgentRuntime, Memory, Plugin } from '@elizaos/core';

const execFileAsync = promisify(execFile);

// ── Helpers ────────────────────────────────────────────────────────────────

function extractCwd(text: string): string {
  // Accept "in /path/to/dir" or "cd /path/to/dir" hints from the message
  const m = text.match(/(?:in|cd|cwd|directory)\s+([/~][\w./\\-]+)/i);
  if (m) return m[1].replace(/^~/, process.env.HOME ?? '~');
  return process.cwd();
}

async function runCodex(
  args: string[],
  cwd: string,
  timeoutMs = 180_000
): Promise<string> {
  const outputFile = join(tmpdir(), `codex-out-${randomUUID()}.txt`);
  try {
    const { stdout, stderr } = await execFileAsync(
      'codex',
      [...args, '-o', outputFile],
      { cwd, timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 }
    );
    try {
      const saved = await readFile(outputFile, 'utf-8');
      if (saved.trim()) return saved.trim();
    } catch {
      // -o file might not exist if codex exited early
    }
    return (stdout || stderr || '(no output)').trim();
  } finally {
    unlink(outputFile).catch(() => {});
  }
}

// ── Action: CODEX_EXEC ──────────────────────────────────────────────────────

export const codexExecAction: Action = {
  name: 'CODEX_EXEC',
  similes: [
    'IMPLEMENT', 'BUILD', 'CREATE_FILE', 'WRITE_CODE', 'FIX', 'REFACTOR',
    'RUN_TESTS', 'INSTALL', 'EXECUTE_TASK', 'DELEGATE', 'DO_IT', 'APPLY',
  ],
  description:
    'Delegate a coding task to the Codex agent, which has full access to the file system, ' +
    'shell, and the ability to read/write code. Use for any task requiring real file operations, ' +
    'running commands, implementing features, fixing bugs, or running tests.',

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text ?? '').toLowerCase();
    const triggers = [
      'implement', 'create', 'write', 'fix', 'refactor', 'update',
      'add', 'remove', 'delete', 'rename', 'move', 'build', 'compile',
      'test', 'run', 'install', 'deploy', 'debug', 'make', 'edit',
    ];
    return triggers.some((t) => text.includes(t));
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: unknown,
    _options: unknown,
    callback?: HandlerCallback
  ) => {
    const task = message.content?.text ?? '';
    const cwd  = extractCwd(task);

    let result: string;
    try {
      result = await runCodex(
        ['exec', '--full-auto', '--skip-git-repo-check', task],
        cwd
      );
    } catch (err: any) {
      result = `Codex error: ${(err.stdout || err.stderr || err.message)?.slice(0, 2000)}`;
    }

    await callback?.({ text: result, actions: ['CODEX_EXEC'] });
    return true;
  },

  examples: [
    [
      { name: '{{user1}}',     content: { text: 'Implement a debounce utility function in src/utils/debounce.ts' } },
      { name: '{{agentName}}', content: { text: 'Delegating to Codex…', actions: ['CODEX_EXEC'] } },
    ],
    [
      { name: '{{user1}}',     content: { text: 'Fix the TypeScript errors in src/index.ts' } },
      { name: '{{agentName}}', content: { text: 'Running Codex to fix the errors…', actions: ['CODEX_EXEC'] } },
    ],
    [
      { name: '{{user1}}',     content: { text: 'Run the test suite and show me the results' } },
      { name: '{{agentName}}', content: { text: 'Asking Codex to run the tests…', actions: ['CODEX_EXEC'] } },
    ],
  ],
};

// ── Action: CODEX_REVIEW ────────────────────────────────────────────────────

export const codexReviewAction: Action = {
  name: 'CODEX_REVIEW',
  similes: [
    'CODE_REVIEW', 'REVIEW_CODE', 'REVIEW_PR', 'REVIEW_DIFF',
    'AUDIT_CODE', 'CHECK_CODE', 'SECURITY_AUDIT',
  ],
  description:
    'Run a comprehensive code review on the current repository using Codex. ' +
    'Returns detailed findings on code quality, security issues, and best practices.',

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text ?? '').toLowerCase();
    return (
      text.includes('review') ||
      text.includes('audit') ||
      text.includes('code quality') ||
      text.includes('security') ||
      text.includes('what\'s wrong') ||
      text.includes('check the code') ||
      text.includes('find bug')
    );
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: unknown,
    _options: unknown,
    callback?: HandlerCallback
  ) => {
    const task = message.content?.text ?? '';
    const cwd  = extractCwd(task);

    let result: string;
    try {
      result = await runCodex(
        ['exec', 'review', '--skip-git-repo-check'],
        cwd
      );
    } catch (err: any) {
      result = `Code review failed: ${(err.stdout || err.stderr || err.message)?.slice(0, 2000)}`;
    }

    await callback?.({ text: result, actions: ['CODEX_REVIEW'] });
    return true;
  },

  examples: [
    [
      { name: '{{user1}}',     content: { text: 'Review the code in this repository' } },
      { name: 'ReviewWorker', content: { text: 'Running Codex code review…', actions: ['CODEX_REVIEW'] } },
    ],
    [
      { name: '{{user1}}',     content: { text: 'Check for security vulnerabilities' } },
      { name: 'ReviewWorker', content: { text: 'Asking Codex to audit for security issues…', actions: ['CODEX_REVIEW'] } },
    ],
  ],
};

// ── Plugin ──────────────────────────────────────────────────────────────────

export const codexPlugin: Plugin = {
  name: 'plugin-codex',
  description:
    'Gives ElizaOS agents real-world execution power by delegating tasks to the ' +
    'Codex CLI. Agents can implement features, run tests, fix bugs, review code, ' +
    'and perform any file/shell operation through Codex.',
  actions: [codexExecAction, codexReviewAction],
};

export default codexPlugin;
