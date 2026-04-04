/**
 * schema.ts — Drizzle ORM schema for the relay event store
 *
 * Tables are SHARED (no agentId) so all 4 agents write to the same
 * relay_events table. Use the `agent_name` column to filter by agent.
 *
 * ElizaOS reads Plugin.schema and runs migrations automatically —
 * no manual DDL needed.
 *
 * Other projects can query these tables directly:
 *   SELECT * FROM relay_events WHERE topic = 'code-review';
 */

import {
  pgTable,
  bigserial,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const relayEventsTable = pgTable(
  'relay_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    timestamp: timestamp('timestamp', { withTimezone: true })
      .defaultNow()
      .notNull(),

    eventType:    text('event_type').notNull(),      // send | response | spawn | exit
    agentName:    text('agent_name'),                // Relay | CodeWorker | ResearchWorker | ReviewWorker
    sender:       text('sender').notNull().default(''),
    receiver:     text('receiver').notNull().default(''),
    sessionId:    text('session_id'),
    sessionLabel: text('session_label'),
    content:      text('content'),                   // truncated to 5000 chars
    contentFile:  text('content_file'),              // path if full content saved to disk
    latencyMs:    integer('latency_ms'),
    originChatId: text('origin_chat_id'),
    originTopicId:text('origin_topic_id'),
    topic:        text('topic'),                     // auto-detected topic label
    metadata:     jsonb('metadata'),
  },
  (t) => [
    index('idx_relay_events_session').on(t.sessionId),
    index('idx_relay_events_timestamp').on(t.timestamp),
    index('idx_relay_events_topic').on(t.topic),
    index('idx_relay_events_agent').on(t.agentName),
    index('idx_relay_events_event_type').on(t.eventType),
  ]
);

export const relaySessionsTable = pgTable(
  'relay_sessions',
  {
    id:           text('id').primaryKey(),
    label:        text('label'),
    agentName:    text('agent_name'),
    status:       text('status').notNull().default('active'), // active | suspended | dead
    spawnedAt:    timestamp('spawned_at', { withTimezone: true }).defaultNow().notNull(),
    lastActivity: timestamp('last_activity', { withTimezone: true }),
    totalEvents:  integer('total_events').notNull().default(0),
  },
  (t) => [
    index('idx_relay_sessions_status').on(t.status),
    index('idx_relay_sessions_agent').on(t.agentName),
  ]
);

/** Attached to Plugin.schema — ElizaOS migrates these automatically */
export const relaySchema = {
  relayEventsTable,
  relaySessionsTable,
};
