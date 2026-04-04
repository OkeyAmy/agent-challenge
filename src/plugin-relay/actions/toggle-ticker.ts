/**
 * TOGGLE_TICKER action — enable/disable Telegram notifications conversationally
 *
 * "Stop sending me Telegram alerts" → disables ticker
 * "Turn on Telegram notifications"  → enables ticker
 */

import type { Action, IAgentRuntime, Memory, HandlerCallback } from '@elizaos/core';
import { TelegramTickerService } from '../services/ticker.service.js';

const ENABLE_PATTERNS = [
  /turn on (telegram|ticker|notifications?|alerts?)/i,
  /enable (telegram|ticker|notifications?|alerts?)/i,
  /start (sending|notif)/i,
];

const DISABLE_PATTERNS = [
  /turn off (telegram|ticker|notifications?|alerts?)/i,
  /disable (telegram|ticker|notifications?|alerts?)/i,
  /stop (sending|notif|telegram|ticker|alerts?)/i,
  /no more (telegram|alerts?|notifications?)/i,
];

export const toggleTickerAction: Action = {
  name: 'TOGGLE_TICKER',
  similes: ['ENABLE_TICKER', 'DISABLE_TICKER', 'TELEGRAM_ALERTS', 'NOTIFICATIONS'],
  description: 'Enables or disables Telegram notification cards for relay events.',

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    if (!runtime.getService(TelegramTickerService.serviceType)) return false;
    const text = message.content.text ?? '';
    return (
      ENABLE_PATTERNS.some((p)  => p.test(text)) ||
      DISABLE_PATTERNS.some((p) => p.test(text))
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: unknown,
    _options: unknown,
    callback?: HandlerCallback
  ) => {
    const ticker = runtime.getService<TelegramTickerService>(
      TelegramTickerService.serviceType
    )!;

    const text   = message.content.text ?? '';
    const enable = ENABLE_PATTERNS.some((p) => p.test(text));
    ticker.setEnabled(enable);

    const reply = enable
      ? 'Telegram notifications enabled. You\'ll receive a card for every relay event.'
      : 'Telegram notifications disabled.';

    await callback?.({ text: reply, actions: ['TOGGLE_TICKER'] });
  },

  examples: [
    [
      { name: 'User',  content: { text: 'Stop sending me Telegram alerts' } },
      { name: 'Relay', content: { text: 'Telegram notifications disabled.', actions: ['TOGGLE_TICKER'] } },
    ],
  ],
};
