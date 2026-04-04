/**
 * notion-sync.service.ts — ElizaOS Service: sync relay events → Notion
 *
 * Polls the relay event store every NOTION_SYNC_INTERVAL_MS (default 30s).
 * Creates two Notion databases under NOTION_PAGE_ID on first run:
 *   - Events  — full event timeline with session headers + content blocks
 *   - Topics  — kanban board with auto-detected status + activity timeline
 *
 * Config (env):
 *   NOTION_TOKEN            — integration secret
 *   NOTION_PAGE_ID          — 32-char page ID (from URL: notion.so/...-<PAGE_ID>)
 *   NOTION_SYNC_INTERVAL_MS — poll interval in ms (default: 30000)
 *
 * State persisted to: RELAY_SESSION_STATE dir / notion-config.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { logger, Service, type IAgentRuntime } from '@elizaos/core';
import { makeNotionSDK, notionPost, notionPatch } from '../notion/client.js';
import { syncEvents, eventsProps, type EventIdMap } from '../notion/events-sync.js';
import { syncTopics, sweepStaleTopics, TOPICS_PROPS, type TopicPages } from '../notion/topics-sync.js';
import { richText } from '../notion/rich-text.js';
import { RelayRepository } from '../repository.js';

const INTERVAL_MS = parseInt(process.env.NOTION_SYNC_INTERVAL_MS ?? '30000', 10);
const CONFIG_FILE = join(
  process.env.RELAY_LOG_DIR ?? './relay/logs',
  '../notion-config.json'
);

interface NotionConfig {
  events_db:    string | null;
  topics_db:    string | null;
  last_sync:    string | null;
  event_id_map: EventIdMap;
  topic_pages:  TopicPages;
}

function loadConfig(): NotionConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as NotionConfig;
    }
  } catch { /* corrupt — reset */ }
  return { events_db: null, topics_db: null, last_sync: null, event_id_map: {}, topic_pages: {} };
}

function saveConfig(cfg: NotionConfig): void {
  try {
    const dir = dirname(CONFIG_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch (err) {
    logger.warn(`[notion-sync] could not save config: ${(err as Error).message}`);
  }
}

export class NotionSyncService extends Service {
  static serviceType = 'notion-sync';
  capabilityDescription = 'Syncs relay events and topics to Notion databases every 30s';

  private timer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;
  private repo!: RelayRepository;
  private token!: string;
  private pageId!: string;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime): Promise<Service> {
    const instance = new NotionSyncService(runtime);
    await instance.start();
    return instance;
  }

  async start(): Promise<void> {
    this.token  = process.env.NOTION_TOKEN   ?? '';
    this.pageId = process.env.NOTION_PAGE_ID ?? '';

    if (!this.token || !this.pageId) {
      logger.info('[notion-sync] disabled — set NOTION_TOKEN + NOTION_PAGE_ID to enable');
      return;
    }

    this.repo = new RelayRepository((this.runtime as any).db);

    // Initialize databases on first run
    let cfg = loadConfig();
    if (!cfg.events_db) {
      cfg = await this.initDatabases(cfg);
    }

    // First sync immediately, then on interval
    await this.doSync();
    this.timer = setInterval(() => this.doSync(), INTERVAL_MS);
    logger.info(`[notion-sync] started — syncing every ${INTERVAL_MS / 1000}s`);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ── Sync ────────────────────────────────────────────────────────

  private async doSync(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;

    const cfg = loadConfig();
    if (!cfg.events_db) { this.syncing = false; return; }

    try {
      const notion = makeNotionSDK(this.token);
      const ts     = new Date().toISOString();

      // Fetch events since last sync
      const events = await this.repo.getEvents({
        since: cfg.last_sync ?? undefined,
        limit: 500,
      });

      if (events.length === 0) { this.syncing = false; return; }
      logger.info(`[notion-sync] ${ts}: ${events.length} events to sync`);

      // Topics first so page IDs are available for event relations
      if (cfg.topics_db) {
        await syncTopics(notion, this.token, cfg.topics_db, events, cfg.topic_pages);
        await sweepStaleTopics(notion, cfg.topics_db);
      }

      await syncEvents(notion, cfg.events_db, events, cfg.event_id_map, cfg.topic_pages);

      cfg.last_sync = ts;
      saveConfig(cfg);
    } catch (err) {
      logger.error(`[notion-sync] sync error: ${(err as Error).message}`);
    } finally {
      this.syncing = false;
    }
  }

  // ── Database initialization ────────────────────────────────────

  private async initDatabases(cfg: NotionConfig): Promise<NotionConfig> {
    logger.info('[notion-sync] creating Notion databases...');

    const topicsDb = await notionPost(this.token, '/databases', {
      parent:     { type: 'page_id', page_id: this.pageId },
      title:      richText('Topics'),
      properties: TOPICS_PROPS,
    }) as { id: string };

    const eventsDb = await notionPost(this.token, '/databases', {
      parent:     { type: 'page_id', page_id: this.pageId },
      title:      richText('Relay Events'),
      properties: eventsProps(topicsDb.id),
    }) as { id: string };

    // Notion creates title prop as "Name" — rename to "Title"
    await notionPatch(this.token, `/databases/${eventsDb.id}`, {
      properties: { Name: { name: 'Title' } },
    }).catch(() => {});

    cfg.events_db    = eventsDb.id;
    cfg.topics_db    = topicsDb.id;
    cfg.event_id_map = {};
    cfg.topic_pages  = {};
    cfg.last_sync    = null;
    saveConfig(cfg);

    logger.info(`[notion-sync] Events DB: ${eventsDb.id} | Topics DB: ${topicsDb.id}`);
    return cfg;
  }
}
