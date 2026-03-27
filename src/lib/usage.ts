import type { UsageSnapshot } from "./types.js";

type JsonRecord = Record<string, unknown>;
type OutputTextContent = {
  type: "output_text";
  text: string;
};

const asRecord = (value: unknown): JsonRecord | null => {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : null;
};

const isOutputTextContent = (value: unknown): value is OutputTextContent => {
  const record = asRecord(value);
  return record?.type === "output_text" && typeof record.text === "string";
};

// Handles both Responses API (input_tokens/output_tokens) and Chat Completions
// API (prompt_tokens/completion_tokens) field names.
// See: https://platform.openai.com/docs/api-reference/responses/object
const asNumber = (value: unknown): number | null => {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export const extractUsage = (payload: unknown): UsageSnapshot => {
  const payloadRecord = asRecord(payload);
  const usage = asRecord(payloadRecord?.usage) ?? {};
  const inputTokens = asNumber(usage.input_tokens ?? usage.prompt_tokens ?? null);
  const outputTokens = asNumber(usage.output_tokens ?? usage.completion_tokens ?? null);
  const inputTokenDetails = asRecord(usage.input_tokens_details);
  const outputTokenDetails = asRecord(usage.output_tokens_details);
  const cachedInputTokens = asNumber(
    inputTokenDetails?.cached_tokens ?? usage.cached_input_tokens ?? null,
  );
  const reasoningTokens = asNumber(
    outputTokenDetails?.reasoning_tokens ?? usage.reasoning_tokens ?? null,
  );
  const totalTokens = asNumber(usage.total_tokens ?? null);
  const computedTotalTokens =
    inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null;

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    reasoningTokens,
    totalTokens: totalTokens ?? computedTotalTokens,
  };
};

export const extractResponseText = (payload: unknown): string | null => {
  const payloadRecord = asRecord(payload);
  if (typeof payloadRecord?.output_text === "string") {
    return payloadRecord.output_text;
  }

  if (!Array.isArray(payloadRecord?.output)) {
    return null;
  }

  const texts = payloadRecord.output
    .flatMap((item) => {
      const content = asRecord(item)?.content;
      return Array.isArray(content) ? content : [];
    })
    .filter(isOutputTextContent)
    .map((content) => content.text);

  return texts.length > 0 ? texts.join("\n") : null;
};
