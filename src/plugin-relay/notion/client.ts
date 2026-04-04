/**
 * notion/client.ts — Notion REST API wrapper with retry + rate-limit handling
 *
 * Uses native fetch (Node 18+). Does NOT depend on @notionhq/client SDK
 * for schema-mutating operations (SDK v5 silently drops several params).
 * SDK Client is still used for page read/update where it works correctly.
 */

import { Client } from '@notionhq/client';
import { logger } from '@elizaos/core';

const NOTION_VERSION = '2022-06-28';
const MAX_RETRIES    = 3;

export function makeNotionSDK(token: string): Client {
  return new Client({ auth: token });
}

async function notionRequest(
  token: string,
  method: string,
  endpoint: string,
  body?: unknown
): Promise<unknown> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const opts: RequestInit = {
      method,
      headers: {
        Authorization:    `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type':   'application/json',
      },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`https://api.notion.com/v1${endpoint}`, opts);

    if (res.ok) return res.json();

    // Retry on rate-limit or server error
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = res.headers.get('retry-after');
      const delayMs = retryAfter
        ? Number(retryAfter) * 1_000
        : 1_000 * Math.pow(2, attempt);
      logger.warn(`[notion] ${method} ${endpoint} → ${res.status}, retrying in ${delayMs}ms (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    const err = await res.json().catch(() => ({}));
    throw new Error(`Notion ${method} ${endpoint} ${res.status}: ${JSON.stringify(err)}`);
  }
  throw new Error(`Notion ${method} ${endpoint}: max retries exceeded`);
}

export const notionPost   = (t: string, ep: string, b?: unknown) => notionRequest(t, 'POST',   ep, b);
export const notionPatch  = (t: string, ep: string, b?: unknown) => notionRequest(t, 'PATCH',  ep, b);
export const notionGet    = (t: string, ep: string)              => notionRequest(t, 'GET',    ep);
export const notionDelete = (t: string, ep: string)              => notionRequest(t, 'DELETE', ep);

/** Query all pages from a Notion database (handles pagination). */
export async function queryDatabase(token: string, dbId: string): Promise<unknown[]> {
  const pages: unknown[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const q = await notionPost(token, `/databases/${dbId}/query`, body) as {
      results: unknown[];
      has_more: boolean;
      next_cursor: string | null;
    };

    pages.push(...q.results);
    cursor = q.has_more && q.next_cursor ? q.next_cursor : undefined;
  } while (cursor);

  return pages;
}

/** Delete all children of a page then append new blocks (used for topic body refresh). */
export async function replacePageBody(token: string, pageId: string, blocks: unknown[]): Promise<void> {
  try {
    const children = await notionGet(token, `/blocks/${pageId}/children?page_size=100`) as {
      results: Array<{ id: string }>;
    };
    for (const block of children.results) {
      await notionDelete(token, `/blocks/${block.id}`);
    }
  } catch { /* page may have no children */ }

  if (blocks.length > 0) {
    await notionPatch(token, `/blocks/${pageId}/children`, { children: blocks.slice(0, 100) });
  }
}
