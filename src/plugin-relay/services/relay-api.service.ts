/**
 * relay-api.service.ts — HTTP REST API for the relay event store
 *
 * Runs on RELAY_PORT (default 3890) as a standalone http.Server.
 * CORS-enabled so the React dashboard and other projects can query it.
 *
 * Endpoints:
 *   GET  /health              service health + ticker state
 *   GET  /sessions            list all sessions
 *   GET  /sessions/:id/events timeline for one session
 *   GET  /events              global event feed (?since, ?limit, ?topic)
 *   GET  /stats               aggregate stats
 *   GET  /topics              topic summary with status
 *   GET  /session-state       current JSON session state
 *   POST /send                log a send event + fire ticker
 *   POST /ticker              toggle Telegram notifications { enabled: bool }
 *   DELETE /session/:id       purge session state
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { logger, Service, type IAgentRuntime } from '@elizaos/core';
import { RelayRepository } from '../repository.js';
import { TelegramTickerService } from './ticker.service.js';
import { trackSend } from './latency-tracker.js';
import { loadSessionState, clearSession } from './session-state.js';
import { writeLog } from './log-rotation.js';
import type { WriteEventParams } from '../types.js';

const PORT = parseInt(process.env.RELAY_PORT ?? '3890', 10);

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end',  () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

export class RelayApiService extends Service {
  static serviceType = 'relay-api';
  capabilityDescription = `REST API exposing relay event store on port ${PORT}`;

  private server!: ReturnType<typeof createServer>;
  private repo!: RelayRepository;
  private ticker: TelegramTickerService | null = null;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime): Promise<Service> {
    const instance = new RelayApiService(runtime);
    await instance.start();
    return instance;
  }

  async start(): Promise<void> {
    this.repo = new RelayRepository((this.runtime as any).db);
    this.ticker = this.runtime.getService<TelegramTickerService>(
      TelegramTickerService.serviceType
    ) ?? null;

    this.server = createServer(async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin':  '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
      }
      try {
        await this.route(req, res);
      } catch (err) {
        logger.error(`[relay-api] unhandled: ${(err as Error).message}`);
        json(res, { ok: false, error: (err as Error).message }, 500);
      }
    });

    await new Promise<void>((resolve) => {
      this.server.listen(PORT, '0.0.0.0', () => {
        writeLog(`[relay-api] listening on http://0.0.0.0:${PORT}`);
        logger.info(`[relay-api] REST API on http://0.0.0.0:${PORT}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server.close((err) => (err ? reject(err) : resolve()))
    );
    writeLog('[relay-api] server closed');
  }

  // ── Router ───────────────────────────────────────────────────────

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url    = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const path   = url.pathname;
    const method = req.method ?? 'GET';

    // GET /health
    if (method === 'GET' && path === '/health') {
      return json(res, {
        status: 'ok',
        pid:    process.pid,
        ticker: this.ticker?.isEnabled() ?? false,
        port:   PORT,
      });
    }

    // GET /stats
    if (method === 'GET' && path === '/stats') {
      return json(res, await this.repo.getStats());
    }

    // GET /sessions
    if (method === 'GET' && path === '/sessions') {
      return json(res, { sessions: await this.repo.getSessions() });
    }

    // GET /sessions/:id/events
    const sessionEventsMatch = path.match(/^\/sessions\/([^/]+)\/events$/);
    if (method === 'GET' && sessionEventsMatch) {
      const sessionId = decodeURIComponent(sessionEventsMatch[1]);
      const limit     = parseInt(url.searchParams.get('limit')  ?? '50', 10);
      const offset    = parseInt(url.searchParams.get('offset') ?? '0',  10);
      const events    = await this.repo.getEvents({ sessionId, limit, offset });
      return json(res, { session: sessionId, events, limit, offset });
    }

    // GET /events
    if (method === 'GET' && path === '/events') {
      const since  = url.searchParams.get('since')  ?? undefined;
      const topic  = url.searchParams.get('topic')  ?? undefined;
      const limit  = parseInt(url.searchParams.get('limit')  ?? '100', 10);
      const offset = parseInt(url.searchParams.get('offset') ?? '0',   10);
      const events = await this.repo.getEvents({ since, topic, limit, offset });
      return json(res, { events, since, limit });
    }

    // GET /topics
    if (method === 'GET' && path === '/topics') {
      return json(res, { topics: await this.repo.getTopics() });
    }

    // GET /session-state
    if (method === 'GET' && path === '/session-state') {
      return json(res, { state: loadSessionState() });
    }

    // POST /send — log event, optionally fire ticker
    if (method === 'POST' && path === '/send') {
      const body = (await readBody(req)) as {
        to?: string; from?: string; text?: string; topic?: string;
        origin_chat_id?: string; origin_topic_id?: string; sessionLabel?: string;
      };

      if (!body.text) return json(res, { ok: false, error: 'text is required' }, 400);

      const sender   = body.from ?? 'external';
      const receiver = body.to   ?? 'Relay';
      const text     = body.text;

      trackSend(receiver, {
        timestamp:     Date.now(),
        sender,
        text,
        originChatId:  body.origin_chat_id,
        originTopicId: body.origin_topic_id,
        topic:         body.topic,
      });

      const params: WriteEventParams = {
        eventType:     'send',
        sender,
        receiver,
        sessionLabel:  body.sessionLabel,
        content:       text,
        originChatId:  body.origin_chat_id,
        originTopicId: body.origin_topic_id,
        topic:         body.topic,
      };

      const eventId = await this.repo.insertEvent(params);

      if (this.ticker?.isEnabled()) {
        this.ticker.fire('send', sender, receiver, text, {
          label:        body.sessionLabel,
          originChatId: body.origin_chat_id,
        });
      }

      writeLog(`SEND ${sender} → ${receiver}: ${text.substring(0, 120)}`);
      return json(res, { ok: true, eventId });
    }

    // POST /ticker — toggle notifications
    if (method === 'POST' && path === '/ticker') {
      const body = (await readBody(req)) as { enabled?: boolean };
      if (this.ticker) {
        this.ticker.setEnabled(body.enabled ?? false);
        writeLog(`[relay-api] ticker ${body.enabled ? 'enabled' : 'disabled'}`);
        return json(res, { ok: true, ticker: body.enabled });
      }
      return json(res, { ok: false, error: 'Telegram ticker not configured' }, 503);
    }

    // DELETE /session/:id — purge session state
    if (method === 'DELETE' && path.startsWith('/session/')) {
      const sessionId = decodeURIComponent(path.slice('/session/'.length));
      clearSession(sessionId);
      writeLog(`[relay-api] session purged: ${sessionId}`);
      return json(res, { ok: true, sessionId });
    }

    return json(res, {
      error: 'Not found',
      endpoints: [
        'GET /health', 'GET /stats', 'GET /sessions',
        'GET /sessions/:id/events', 'GET /events',
        'GET /topics', 'GET /session-state',
        'POST /send', 'POST /ticker', 'DELETE /session/:id',
      ],
    }, 404);
  }
}
