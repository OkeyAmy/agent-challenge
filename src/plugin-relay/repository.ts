/**
 * repository.ts — RelayRepository
 *
 * All database access for the relay event store goes through here.
 * Constructed with the Drizzle db instance from runtime.databaseAdapter.db
 *
 * Usage (inside a Service or Action):
 *   const db   = (runtime.databaseAdapter as any).db;
 *   const repo = new RelayRepository(db);
 *   await repo.insertEvent({ ... });
 */

import { desc, eq, gte, sql, and, isNotNull } from 'drizzle-orm';
import { relayEventsTable, relaySessionsTable } from './schema.js';
import type { RelayEvent, RelaySession, RelayStats, WriteEventParams } from './types.js';

export class RelayRepository {
  constructor(private readonly db: any) {}

  // ── Events ──────────────────────────────────────────────────────────────

  async insertEvent(params: WriteEventParams & { agentName?: string }): Promise<number | null> {
    const {
      eventType, agentName, sender, receiver,
      sessionId, sessionLabel,
      content, contentFile,
      latencyMs, originChatId, originTopicId,
      topic, metadata,
    } = params;

    try {
      const [row] = await this.db
        .insert(relayEventsTable)
        .values({
          eventType,
          agentName: agentName ?? null,
          sender:    sender  ?? '',
          receiver:  receiver ?? '',
          sessionId:    sessionId    ?? null,
          sessionLabel: sessionLabel ?? null,
          content:    content    ? content.substring(0, 5_000) : null,
          contentFile: contentFile ?? null,
          latencyMs:   latencyMs  ?? null,
          originChatId:  originChatId  ?? null,
          originTopicId: originTopicId ?? null,
          topic:    topic    ?? null,
          metadata: metadata ?? null,
        })
        .returning({ id: relayEventsTable.id });

      // Upsert session record
      if (sessionId) {
        await this.upsertSession(sessionId, {
          label: sessionLabel,
          agentName,
          status: eventType === 'exit' ? 'dead' : 'active',
          isSpawn: eventType === 'spawn',
        });
      }

      return row?.id ?? null;
    } catch {
      return null;
    }
  }

  async getEvents(opts: {
    since?: string | Date;
    limit?: number;
    offset?: number;
    sessionId?: string;
    topic?: string;
    agentName?: string;
  } = {}): Promise<RelayEvent[]> {
    const { since, limit = 100, offset = 0, sessionId, topic, agentName } = opts;

    const conditions = [];
    if (since)      conditions.push(gte(relayEventsTable.timestamp, new Date(since)));
    if (sessionId)  conditions.push(eq(relayEventsTable.sessionId, sessionId));
    if (topic)      conditions.push(eq(relayEventsTable.topic, topic));
    if (agentName)  conditions.push(eq(relayEventsTable.agentName, agentName));

    const rows = await this.db
      .select()
      .from(relayEventsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(relayEventsTable.timestamp))
      .limit(limit)
      .offset(offset);

    return rows.map(this.mapEvent);
  }

  async getTopics(): Promise<Array<{
    topic: string;
    eventCount: number;
    lastActivity: string;
    latestEventType: string;
  }>> {
    const rows = await this.db
      .select({
        topic:           relayEventsTable.topic,
        eventCount:      sql<number>`cast(count(*) as int)`,
        lastActivity:    sql<string>`max(${relayEventsTable.timestamp})`,
        latestEventType: sql<string>`(array_agg(${relayEventsTable.eventType} order by ${relayEventsTable.timestamp} desc))[1]`,
      })
      .from(relayEventsTable)
      .where(isNotNull(relayEventsTable.topic))
      .groupBy(relayEventsTable.topic)
      .orderBy(sql`max(${relayEventsTable.timestamp}) desc`);

    return rows.map((r: any) => ({
      topic:           r.topic as string,
      eventCount:      r.eventCount as number,
      lastActivity:    r.lastActivity as string,
      latestEventType: r.latestEventType as string,
    }));
  }

  // ── Sessions ─────────────────────────────────────────────────────────────

  async getSessions(): Promise<RelaySession[]> {
    const rows = await this.db
      .select()
      .from(relaySessionsTable)
      .orderBy(desc(relaySessionsTable.lastActivity));
    return rows.map(this.mapSession);
  }

  private async upsertSession(
    id: string,
    opts: { label?: string | null; agentName?: string | null; status: string; isSpawn?: boolean }
  ): Promise<void> {
    const now = new Date();
    if (opts.isSpawn) {
      await this.db
        .insert(relaySessionsTable)
        .values({
          id,
          label:      opts.label ?? null,
          agentName:  opts.agentName ?? null,
          status:     opts.status,
          spawnedAt:  now,
          lastActivity: now,
          totalEvents: 1,
        })
        .onConflictDoUpdate({
          target: relaySessionsTable.id,
          set: {
            spawnedAt:   now,
            lastActivity: now,
            totalEvents:  sql`${relaySessionsTable.totalEvents} + 1`,
            status:       opts.status,
            label:        sql`COALESCE(${opts.label ?? null}, ${relaySessionsTable.label})`,
          },
        });
    } else {
      await this.db
        .insert(relaySessionsTable)
        .values({
          id,
          label:        opts.label ?? null,
          agentName:    opts.agentName ?? null,
          status:       opts.status,
          spawnedAt:    now,
          lastActivity: now,
          totalEvents:  1,
        })
        .onConflictDoUpdate({
          target: relaySessionsTable.id,
          set: {
            lastActivity: now,
            totalEvents:  sql`${relaySessionsTable.totalEvents} + 1`,
            status:       opts.status,
            label:        sql`COALESCE(${opts.label ?? null}, ${relaySessionsTable.label})`,
          },
        });
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats(): Promise<RelayStats> {
    const since24h = new Date(Date.now() - 86_400_000);

    const [[total], [sessions], [recent], [latency]] = await Promise.all([
      this.db.select({ c: sql<number>`cast(count(*) as int)` }).from(relayEventsTable),
      this.db.select({ c: sql<number>`cast(count(*) as int)` }).from(relaySessionsTable),
      this.db
        .select({ c: sql<number>`cast(count(*) as int)` })
        .from(relayEventsTable)
        .where(gte(relayEventsTable.timestamp, since24h)),
      this.db
        .select({ avg: sql<number | null>`avg(${relayEventsTable.latencyMs})` })
        .from(relayEventsTable)
        .where(isNotNull(relayEventsTable.latencyMs)),
    ]);

    return {
      totalEvents:    total.c,
      totalSessions:  sessions.c,
      eventsLast24h:  recent.c,
      avgLatencyMs:   latency.avg !== null ? Math.round(latency.avg) : null,
    };
  }

  // ── Mappers ───────────────────────────────────────────────────────────────

  private mapEvent(r: any): RelayEvent {
    return {
      id:           r.id,
      timestamp:    r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
      eventType:    r.eventType ?? r.event_type,
      sender:       r.sender,
      receiver:     r.receiver,
      sessionId:    r.sessionId    ?? r.session_id,
      sessionLabel: r.sessionLabel ?? r.session_label,
      content:      r.content,
      contentFile:  r.contentFile  ?? r.content_file,
      latencyMs:    r.latencyMs    ?? r.latency_ms,
      originChatId: r.originChatId ?? r.origin_chat_id,
      originTopicId:r.originTopicId?? r.origin_topic_id,
      topic:        r.topic,
      metadata:     r.metadata,
    };
  }

  private mapSession(r: any): RelaySession {
    return {
      id:          r.id,
      label:       r.label,
      status:      r.status,
      spawnedAt:   r.spawnedAt instanceof Date ? r.spawnedAt.toISOString() : r.spawnedAt,
      lastActivity:r.lastActivity instanceof Date ? r.lastActivity.toISOString() : r.lastActivity,
      totalEvents: r.totalEvents ?? r.total_events,
    };
  }
}
