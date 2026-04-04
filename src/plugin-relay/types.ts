/**
 * plugin-relay — shared type definitions
 */

export type EventType = 'send' | 'response' | 'spawn' | 'exit';
export type SessionStatus = 'active' | 'suspended' | 'dead';
export type TopicStatus = 'in-progress' | 'done' | 'stale' | 'blocked';

export interface RelayEvent {
  id?: number;
  timestamp: string;
  eventType: EventType;
  sender: string;
  receiver: string;
  sessionId?: string;
  sessionLabel?: string;
  content?: string;
  contentFile?: string;
  latencyMs?: number;
  originChatId?: string;
  originTopicId?: string;
  topic?: string;
  metadata?: Record<string, unknown>;
}

export interface RelaySession {
  id: string;
  label?: string;
  status: SessionStatus;
  spawnedAt: string;
  lastActivity?: string;
  totalEvents: number;
}

/** Persisted to relay-session-state.json — mirrors original v2 format */
export interface SessionStateEntry {
  sessionId: string;
  status: 'active' | 'suspended';
  project: string;
  lastMessageAt: string | null;
  cwd: string;
}

export type SessionStateMap = Record<string, SessionStateEntry>;

export interface PendingSend {
  timestamp: number;
  sender: string;
  text: string;
  originChatId?: string;
  originTopicId?: string;
  topic?: string;
}

export interface RelayStats {
  totalEvents: number;
  totalSessions: number;
  eventsLast24h: number;
  avgLatencyMs: number | null;
}

export interface WriteEventParams {
  eventType: EventType;
  sender: string;
  receiver: string;
  sessionId?: string;
  sessionLabel?: string;
  content?: string;
  contentFile?: string;
  latencyMs?: number;
  originChatId?: string;
  originTopicId?: string;
  topic?: string;
  metadata?: Record<string, unknown>;
}
