/**
 * notion/events-sync.ts — Sync relay events to a Notion database
 *
 * Inserts new events and updates existing ones (via a local ID→PageID cache).
 * Noise events (echoes, empty responses, lifecycle) are filtered out.
 * Events are linked to their Topic page via a Notion relation.
 */

import { logger } from '@elizaos/core';
import type { Client } from '@notionhq/client';
import { richText, stripMarkdown, parseContentToBlocks, parseMarkdownToRichText } from './rich-text.js';
import type { RelayEvent } from '../types.js';

const EVENT_EMOJI: Record<string, string> = {
  send: '📤', response: '✅', spawn: '🚀', exit: '🔴',
};

const NOISE_RECEIVERS = new Set(['', '?', 'unknown', '#general']);

function isNoise(e: RelayEvent): boolean {
  const recv = (e.receiver ?? '').trim();
  const sndr = (e.sender  ?? '').trim();
  if (!recv || NOISE_RECEIVERS.has(recv.toLowerCase())) return true;
  if (sndr && recv && sndr === recv) return true; // echo
  if (e.eventType === 'response' && !e.content?.trim()) return true;
  return false;
}

export type EventIdMap = Record<string, string>; // localId → notionPageId

export async function syncEvents(
  notion: Client,
  eventsDbId: string,
  events: RelayEvent[],
  idMap: EventIdMap,
  topicPages: Record<string, string>
): Promise<void> {
  let inserted = 0, updated = 0, filtered = 0;

  for (const e of events) {
    if (isNoise(e)) { filtered++; continue; }

    const localId    = String(e.id);
    const emoji      = EVENT_EMOJI[e.eventType] ?? '📋';
    const topicSuffix = e.topic ? ` (${e.topic})` : '';
    const title      = `${emoji} ${e.sender || '?'} → ${e.receiver || '?'}${topicSuffix}`;
    const preview    = stripMarkdown(e.content).slice(0, 200);
    const topicPageId = e.topic ? topicPages[e.topic] : null;

    const props: Record<string, unknown> = {
      Title:          { title: richText(title) },
      'Event Type':   { select: { name: e.eventType } },
      Sender:         { rich_text: richText(e.sender ?? '') },
      Receiver:       { rich_text: richText(e.receiver ?? '') },
      Timestamp:      e.timestamp ? { date: { start: e.timestamp } } : { date: null },
      Latency:        { number: e.latencyMs ?? null },
      'Session ID':   { rich_text: richText(e.sessionId ?? '') },
      'Origin Chat':  { rich_text: richText(e.originChatId  ?? '') },
      'Origin Topic': { rich_text: richText(e.originTopicId ?? '') },
      Preview:        { rich_text: richText(preview) },
    };

    if (topicPageId) {
      props.Topic = { relation: [{ id: topicPageId }] };
    }

    if (idMap[localId]) {
      await notion.pages.update({ page_id: idMap[localId], properties: props as never });
      updated++;
    } else {
      const sessionHeader = e.sessionId
        ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: parseMarkdownToRichText(`**Session:** ${e.sessionId}`) } }]
        : [];
      const contentBlocks = parseContentToBlocks(e.content);
      const children = [...sessionHeader, ...contentBlocks];

      const page = await notion.pages.create({
        parent:     { database_id: eventsDbId },
        properties: props as never,
        children:   children.slice(0, 100) as never,
      });

      idMap[localId] = (page as { id: string }).id;
      inserted++;

      if (inserted % 10 === 0) {
        logger.debug(`[notion-events] checkpoint: ${inserted} inserted`);
      }
    }
  }

  if (filtered > 0) {
    logger.debug(`[notion-events] filtered ${filtered} noise events from ${events.length} total`);
  }
  logger.info(`[notion-events] ${inserted} inserted, ${updated} updated`);
}

/** Schema definition for the Events database. */
export function eventsProps(topicsDbId: string | null): Record<string, unknown> {
  const props: Record<string, unknown> = {
    Title:          { title: {} },
    'Event Type':   { select: { options: [
      { name: 'send',     color: 'blue'   },
      { name: 'response', color: 'green'  },
      { name: 'spawn',    color: 'purple' },
      { name: 'exit',     color: 'red'    },
    ]}},
    Sender:         { rich_text: {} },
    Receiver:       { rich_text: {} },
    Timestamp:      { date: {} },
    Latency:        { number: {} },
    'Session ID':   { rich_text: {} },
    'Origin Chat':  { rich_text: {} },
    'Origin Topic': { rich_text: {} },
    Preview:        { rich_text: {} },
  };

  if (topicsDbId) {
    props.Topic = { relation: { database_id: topicsDbId, single_property: {} } };
  }

  return props;
}
