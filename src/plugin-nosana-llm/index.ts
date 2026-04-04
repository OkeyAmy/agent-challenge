/**
 * plugin-nosana-llm — Chat completions model handler for Nosana/OpenAI-compatible endpoints
 *
 * Fixes the `Unexpected message role` error caused by @elizaos/plugin-openai@1.6.0
 * using @ai-sdk/openai without `compatibility: 'compatible'`, which defaults to
 * the OpenAI Responses API (/v1/responses). Nosana's vLLM endpoint only supports
 * the standard Chat Completions API (/v1/chat/completions).
 *
 * This plugin registers TEXT_LARGE and TEXT_SMALL handlers with priority: 1
 * (above plugin-openai's default priority 0), so ElizaOS picks this handler
 * first via its models[0] priority-sorted lookup.
 *
 * Env vars read (in priority order):
 *   Base URL : OPENAI_API_URL → OPENAI_BASE_URL → https://api.openai.com/v1
 *   API key  : OPENAI_API_KEY → 'nosana'
 *   Model    : MODEL_NAME → OPENAI_LARGE_MODEL → LARGE_MODEL → Qwen/Qwen3.5-4B
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { ModelType, type Plugin, type IAgentRuntime } from '@elizaos/core';

function createClient(runtime: IAgentRuntime) {
  const baseURL =
    runtime.getSetting('OPENAI_API_URL') ??
    runtime.getSetting('OPENAI_BASE_URL') ??
    'https://api.openai.com/v1';
  const apiKey = runtime.getSetting('OPENAI_API_KEY') ?? 'nosana';
  return createOpenAI({ baseURL, apiKey, compatibility: 'compatible' });
}

function getModelName(runtime: IAgentRuntime): string {
  return (
    runtime.getSetting('MODEL_NAME') ??
    runtime.getSetting('OPENAI_LARGE_MODEL') ??
    runtime.getSetting('LARGE_MODEL') ??
    'Qwen/Qwen3.5-4B'
  );
}

async function handleText(runtime: IAgentRuntime, params: any): Promise<any> {
  const openai = createClient(runtime);
  // Must use .chat() explicitly — openai(modelId) defaults to Responses API in @ai-sdk/openai@2.x
  const model = openai.chat(getModelName(runtime));
  const generateParams = {
    model,
    prompt: params.prompt,
    system: runtime.character.system ?? undefined,
    temperature: params.temperature ?? 0.7,
    maxOutputTokens: params.maxTokens ?? 8192,
    frequencyPenalty: params.frequencyPenalty ?? 0.7,
    presencePenalty: params.presencePenalty ?? 0.7,
    stopSequences: params.stopSequences ?? [],
  };

  if (params.stream) {
    const result = streamText(generateParams);
    return {
      textStream: result.textStream,
      text: result.text,
      usage: result.usage.then((u: any) =>
        u
          ? {
              promptTokens: u.inputTokens ?? 0,
              completionTokens: u.outputTokens ?? 0,
              totalTokens: (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
            }
          : undefined
      ),
      finishReason: result.finishReason,
    };
  }

  const { text } = await generateText(generateParams);
  return text;
}

export const nosanaLlmPlugin: Plugin = {
  name: 'plugin-nosana-llm',
  description: 'Chat completions model handler for Nosana/OpenAI-compatible endpoints',
  priority: 1,
  models: {
    [ModelType.TEXT_LARGE]: handleText,
    [ModelType.TEXT_SMALL]: handleText,
  },
};

export default nosanaLlmPlugin;
