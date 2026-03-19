import { extractResponseText, extractUsage } from "./usage.js";
import type { UsageSnapshot } from "./types.js";

// Parses SSE events emitted by the OpenAI Responses API streaming mode.
// Events reference: https://platform.openai.com/docs/api-reference/responses-streaming/events
type ParsedSseSummary = {
  finalPayload: unknown;
  responseText: string | null;
  usage: UsageSnapshot;
  terminalEvent: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

const emptyUsage: UsageSnapshot = {
  inputTokens: null,
  outputTokens: null,
  cachedInputTokens: null,
  reasoningTokens: null,
  totalTokens: null,
};

const terminalEvents = new Set([
  "response.completed",
  "response.failed",
  "response.incomplete",
]);

const joinText = (parts: string[]): string | null => {
  return parts.length > 0 ? parts.join("") : null;
};

const extractTextFromEvent = (payload: any): string | null => {
  if (typeof payload?.text === "string") {
    return payload.text;
  }

  if (typeof payload?.delta === "string") {
    return payload.delta;
  }

  if (payload?.item) {
    return extractResponseText({ output: [payload.item] });
  }

  if (payload?.response) {
    return extractResponseText(payload.response);
  }

  return extractResponseText(payload);
};

const extractEventError = (
  payload: any,
): { code: string | null; message: string | null } => {
  const candidate =
    payload?.error ??
    payload?.response?.error ??
    payload?.status_details ??
    payload?.response?.status_details ??
    null;

  if (!candidate) {
    return {
      code: null,
      message: null,
    };
  }

  return {
    code:
      typeof candidate?.code === "string"
        ? candidate.code
        : typeof candidate?.type === "string"
          ? candidate.type
          : null,
    message:
      typeof candidate?.message === "string"
        ? candidate.message
        : typeof candidate?.reason === "string"
          ? candidate.reason
          : null,
  };
};

export const parseResponseSse = (sseText: string): ParsedSseSummary => {
  const chunks = sseText.split(/\r?\n\r?\n/);
  let finalPayload: unknown = null;
  let terminalEvent: string | null = null;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  const deltaTextParts: string[] = [];
  const doneTextParts: string[] = [];
  const outputItemTextParts: string[] = [];

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

    if (eventName === "response.output_text.delta") {
      const deltaText = extractTextFromEvent(parsed);
      if (deltaText) {
        deltaTextParts.push(deltaText);
      }
    }

    if (eventName === "response.output_text.done") {
      const doneText = extractTextFromEvent(parsed);
      if (doneText) {
        doneTextParts.push(doneText);
      }
    }

    if (eventName === "response.output_item.done") {
      const outputItemText = extractTextFromEvent(parsed);
      if (outputItemText) {
        outputItemTextParts.push(outputItemText);
      }
    }

    if (terminalEvents.has(eventName ?? "")) {
      terminalEvent = eventName ?? null;
      finalPayload = parsed?.response ?? parsed;
    }

    if (!finalPayload && parsed?.response?.usage) {
      finalPayload = parsed.response;
    }

    const eventError = extractEventError(parsed);
    errorCode ??= eventError.code;
    errorMessage ??= eventError.message;
  }

  const responseText =
    joinText(doneTextParts) ??
    joinText(outputItemTextParts) ??
    extractResponseText(finalPayload) ??
    joinText(deltaTextParts);

  return {
    finalPayload,
    responseText,
    usage: finalPayload ? extractUsage(finalPayload) : emptyUsage,
    terminalEvent,
    errorCode,
    errorMessage,
  };
};
