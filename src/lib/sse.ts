import { extractResponseText, extractUsage } from "./usage.js";
import type { UsageSnapshot } from "./types.js";

// Parses SSE events emitted by the OpenAI Responses API streaming mode.
// Events reference: https://platform.openai.com/docs/api-reference/responses-streaming/events
type ParsedSseSummary = {
  finalPayload: unknown;
  responseText: string | null;
  usage: UsageSnapshot;
};

const emptyUsage: UsageSnapshot = {
  inputTokens: null,
  outputTokens: null,
  cachedInputTokens: null,
  reasoningTokens: null,
  totalTokens: null,
};

export const parseResponseSse = (sseText: string): ParsedSseSummary => {
  const chunks = sseText.split(/\r?\n\r?\n/);
  let finalPayload: unknown = null;
  let responseText: string | null = null;

  for (const chunk of chunks) {
    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      continue;
    }

    const eventName = lines
      .filter((line) => line.startsWith("event:"))
      .map((line) => line.slice("event:".length).trim())[0];
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n");

    if (!data || data === "[DONE]") {
      continue;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }

    if (eventName === "response.output_text.done" && typeof parsed?.text === "string") {
      responseText = (responseText ?? "") + parsed.text;
    }

    if (eventName === "response.completed") {
      finalPayload = parsed?.response ?? parsed;
      if (!responseText) {
        responseText = extractResponseText(finalPayload);
      }
    }

    if (!finalPayload && parsed?.response?.usage) {
      finalPayload = parsed.response;
    }
  }

  return {
    finalPayload,
    responseText,
    usage: finalPayload ? extractUsage(finalPayload) : emptyUsage,
  };
};