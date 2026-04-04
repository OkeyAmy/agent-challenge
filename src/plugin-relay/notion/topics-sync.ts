/**
 * notion/topics-sync.ts — Sync relay topics to a Notion kanban board
 *
 * Creates/updates one page per unique topic found in relay events.
 * Each page has: Name, Status, Worker, Origin, Last Activity, Event Count.
 * Status auto-detected: in-progress | done | stale | blocked.
 */

import { logger } from '@elizaos/core';
import type { Client } from '@notionhq/client';
import {
  notionPost, notionPatch, queryDatabase, replacePageBody,
} from './client.js';
import {
  richText, stripMarkdown, formatTimestamp, parseMarkdownToRichText,
} from './rich-text.js';
import type { RelayEvent } from '../types.js';

const EVENT_EMOJI: Record<string, string> = {
  send: '📤', response: '✅', spawn: '🚀', exit: '🔴',
};

export const TOPICS_PROPS = {
  Name:            { title: {} },
  Status:          { select: { options: [
    { name: 'in-progress', color: 'yellow' },
    { name: 'done',        color: 'green'  },
    { name: 'stale',       color: 'gray'   },
    { name: 'blocked',     color: 'red'    },
  ]}},
  Worker:          { rich_text: {} },
  'Origin Chat':   { rich_text: {} },
  'Origin Topic':  { rich_text: {} },
  Created:         { date: {} },
  'Last Activity': { date: {} },
  'Event Count':   { number: {} },
};

function detectTopicStatus(events: RelayEvent[]): string {
  if (!events.length) return 'in-progress';
  const sorted = [...events].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp)
  );
  const latest = sorted[0];
  if (Date.now() - new Date(latest.timestamp).getTime() > 86_400_000) return 'stale';
  if (
    latest.eventType === 'response' &&
    latest.content &&
    /\b(SHIP|SOLID|DONE|COMPLETE)\b/i.test(latest.content)
  ) return 'done';
  return 'in-progress';
}

function buildTopicBody(
  topicName: string,
  status: string,
  events: RelayEvent[],
  latest: RelayEvent
) {
  const blocks: unknown[] = [];

  blocks.push({
    object: 'block', type: 'heading_2',
    heading_2: { rich_text: richText('📊 Stats') },
  });

  const statsLine = `Events: ${events.length} | Status: ${status} | Last Active: ${formatTimestamp(latest.timestamp)} | Worker: ${latest.sessionId || 'N/A'}`;
  blocks.push({
    object: 'block', type: 'paragraph',
    paragraph: { rich_text: richText(statsLine) },
  });

  blocks.push({
    object: 'block', type: 'heading_2',
    heading_2: { rich_text: richText('📝 Timeline') },
  });

  const sorted = [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  for (const ev of sorted.slice(0, 20)) {
    const emoji = EVENT_EMOJI[ev.eventType] ?? '📋';
    const preview = stripMarkdown(ev.content).slice(0, 100) || '(no content)';
    const line = `${emoji} ${formatTimestamp(ev.timestamp)} — ${ev.sender || '?'} → ${ev.receiver || '?'}: ${preview}`;
    blocks.push({
      object: 'block', type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: parseMarkdownToRichText(line) },
    });
  }

  return blocks;
}

export interface TopicPages { [topicName: string]: string }

export async function syncTopics(
  notion: Client,
  token: string,
  topicsDbId: string,
  events: RelayEvent[],
  topicPages: TopicPages
): Promise<void> {
  // Group events by topic
  const byTopic = new Map<string, RelayEvent[]>();
  for (const e of events) {
    if (!e.topic) continue;
    const arr = byTopic.get(e.topic) ?? [];
    arr.push(e);
    byTopic.set(e.topic, arr);
  }

  if (byTopic.size === 0) return;

  // Warm cache if empty
  if (Object.keys(topicPages).length === 0) {
    const pages = await queryDatabase(token, topicsDbId) as Array<{
      id: string;
      properties: { Name?: { title?: Array<{ plain_text: string }> } };
    }>;
    for (const p of pages) {
      const name = p.properties.Name?.title?.[0]?.plain_text;
      if (name) topicPages[name] = p.id;
    }
  }

  for (const [topicName, topicEvents] of byTopic.entries()) {
    const status  = detectTopicStatus(topicEvents);
    const sorted  = [...topicEvents].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const latest  = sorted[0];
    const earliest = sorted[sorted.length - 1];

    const props: Record<string, unknown> = {
      Name:            { title: richText(topicName) },
      Status:          { select: { name: status } },
      Worker:          { rich_text: richText(latest.sessionId ?? '') },
      'Origin Chat':   { rich_text: richText(latest.originChatId ?? '') },
      'Origin Topic':  { rich_text: richText(latest.originTopicId ?? '') },
      'Last Activity': { date: { start: latest.timestamp } },
      'Event Count':   { number: topicEvents.length },
    };

    const topicBody = buildTopicBody(topicName, status, topicEvents, latest);

    if (topicPages[topicName]) {
      try {
        const existing = await notion.pages.retrieve({ page_id: topicPages[topicName] }) as {
          properties: { 'Event Count'?: { number?: number } };
        };
        const currentCount = existing.properties?.['Event Count']?.number ?? 0;
        props['Event Count'] = { number: currentCount + topicEvents.length };
      } catch { /* use batch count as fallback */ }

      await notion.pages.update({ page_id: topicPages[topicName], properties: props as never });
      await replacePageBody(token, topicPages[topicName], topicBody);
      logger.debug(`[notion-topics] updated: ${topicName} [${status}]`);
    } else {
      props.Created = { date: { start: earliest.timestamp } };
      const page = await notion.pages.create({
        parent: { database_id: topicsDbId },
        properties: props as never,
        children: topicBody.slice(0, 100) as never,
      });
      topicPages[topicName] = (page as { id: string }).id;
      logger.debug(`[notion-topics] created: ${topicName} [${status}]`);
    }
  }
}

/** Mark topics inactive for >24h as 'stale'. */
export async function sweepStaleTopics(
  notion: Client,
  topicsDbId: string
): Promise<void> {
  const pages = await queryDatabase('', topicsDbId) as Array<{
    id: string;
    properties: {
      Status?: { select?: { name?: string } };
      'Last Activity'?: { date?: { start?: string } };
    };
  }>;

  let staleCount = 0;
  for (const page of pages) {
    const status       = page.properties?.Status?.select?.name;
    const lastActivity = page.properties?.['Last Activity']?.date?.start;
    if (status === 'done' || !lastActivity) continue;
    if (Date.now() - new Date(lastActivity).getTime() > 86_400_000 && status !== 'stale') {
      await notion.pages.update({
        page_id:    page.id,
        properties: { Status: { select: { name: 'stale' } } } as never,
      });
      staleCount++;
    }
  }

  if (staleCount > 0) logger.info(`[notion-topics] stale sweep: ${staleCount} topics marked stale`);
}
