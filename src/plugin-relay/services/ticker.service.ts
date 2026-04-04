/**
 * ticker.service.ts — Telegram notification cards for relay events
 *
 * Posts HTML-formatted cards to a Telegram group/topic for every
 * send, response, spawn, or exit event. Disabled by default.
 *
 * Config (env):
 *   TELEGRAM_BOT_TOKEN   — bot token from @BotFather
 *   TELEGRAM_CHAT_ID     — group chat ID (negative integer)
 *   TELEGRAM_TICKER_ENABLED — 'true' to enable at start
 *
 * Optional env:
 *   TELEGRAM_TOPIC_ID    — message_thread_id for group topics
 */

import { logger, Service, type IAgentRuntime } from '@elizaos/core';

export interface TickerFireOpts {
  label?: string | null;
  latencyMs?: number | null;
  originChatId?: string | null;
  originTopicId?: string | null;
}

export class TelegramTickerService extends Service {
  static serviceType = 'telegram-ticker';
  capabilityDescription = 'Sends HTML notification cards to Telegram for relay events';

  private enabled = false;
  private token: string | null = null;
  private chatId: string | null = null;
  private topicId: number | null = null;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime): Promise<Service> {
    const instance = new TelegramTickerService(runtime);
    await instance.start();
    return instance;
  }

  async start(): Promise<void> {
    this.token  = process.env.TELEGRAM_BOT_TOKEN ?? null;
    this.chatId = process.env.TELEGRAM_CHAT_ID   ?? null;
    this.topicId = process.env.TELEGRAM_TOPIC_ID
      ? parseInt(process.env.TELEGRAM_TOPIC_ID, 10)
      : null;
    this.enabled = process.env.TELEGRAM_TICKER_ENABLED === 'true'
      && !!(this.token && this.chatId);

    if (this.enabled) {
      logger.info('[ticker] Telegram ticker enabled');
    } else {
      logger.info('[ticker] Telegram ticker disabled (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID + TELEGRAM_TICKER_ENABLED=true to enable)');
    }
  }

  async stop(): Promise<void> {
    this.enabled = false;
  }

  isEnabled(): boolean { return this.enabled; }
  setEnabled(val: boolean): void { this.enabled = val && !!(this.token && this.chatId); }

  fire(
    eventType: 'send' | 'response' | 'spawn' | 'exit',
    sender: string,
    receiver: string,
    text: string,
    opts: TickerFireOpts = {}
  ): void {
    if (!this.enabled || !this.token || !this.chatId) return;

    const card = this.formatCard(eventType, sender, receiver, text, opts);
    this.sendTelegram(card).catch((err: Error) =>
      logger.warn(`[ticker] send failed: ${err.message}`)
    );
  }

  // ── Formatters ─────────────────────────────────────────────────

  private formatCard(
    eventType: string,
    sender: string,
    receiver: string,
    text: string,
    opts: TickerFireOpts
  ): string {
    const now = new Date().toISOString().slice(11, 16) + 'Z';
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const preview = esc(text.slice(0, 150)) + (text.length > 150 ? '…' : '');
    const senderEsc   = esc(sender);
    const receiverEsc = esc(receiver);
    const labelEsc    = opts.label ? esc(opts.label.slice(0, 40)) : null;
    const labelStr    = labelEsc ? ` · <i>${labelEsc}</i>` : '';

    if (eventType === 'send') {
      return (
        `🔵 <b>${senderEsc} → ${receiverEsc}</b>\n` +
        `${now}${labelStr}\n` +
        `📤 <code>${preview}</code>`
      );
    }

    if (eventType === 'response') {
      const latStr = opts.latencyMs ? ` (${(opts.latencyMs / 1000).toFixed(1)}s)` : '';
      return (
        `🟢 <b>${senderEsc} → ${receiverEsc}</b>\n` +
        `${now}${latStr}${labelStr}\n` +
        `📥 <code>${preview}</code>`
      );
    }

    if (eventType === 'spawn') {
      return `🚀 <b>spawn</b> ${senderEsc} → ${receiverEsc} ${now}`;
    }

    if (eventType === 'exit') {
      return `🔴 <b>exit</b> ${senderEsc} ${now}`;
    }

    return `⚪ ${esc(eventType)}: ${senderEsc} → ${receiverEsc}`;
  }

  // ── HTTP transport ─────────────────────────────────────────────

  private async sendTelegram(text: string): Promise<void> {
    if (!this.token || !this.chatId) return;

    const payload: Record<string, unknown> = {
      chat_id:              this.chatId,
      text,
      parse_mode:           'HTML',
      disable_notification: true,
    };
    if (this.topicId) payload.message_thread_id = this.topicId;

    const res = await fetch(
      `https://api.telegram.org/bot${this.token}/sendMessage`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Telegram ${res.status}: ${err}`);
    }
  }
}
