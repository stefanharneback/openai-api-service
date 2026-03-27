import type { UsageSnapshot } from "./types.js";

// Handles both Responses API (input_tokens/output_tokens) and Chat Completions
// API (prompt_tokens/completion_tokens) field names.
// See: https://platform.openai.com/docs/api-reference/responses/object
const asNumber = (value: unknown): number | null => {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export const extractUsage = (payload: any): UsageSnapshot => {
  const usage = payload?.usage ?? {};
  const inputTokens = asNumber(usage.input_tokens ?? usage.prompt_tokens ?? null);
  const outputTokens = asNumber(usage.output_tokens ?? usage.completion_tokens ?? null);
  const cachedInputTokens = asNumber(
    usage.input_tokens_details?.cached_tokens ?? usage.cached_input_tokens ?? null,
  );
  const reasoningTokens = asNumber(
    usage.output_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? null,
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

export const extractResponseText = (payload: any): string | null => {
  if (typeof payload?.output_text === "string") {
    return payload.output_text;
  }

  if (!Array.isArray(payload?.output)) {
    return null;
  }

  const texts = payload.output
    .flatMap((item: any) => item?.content ?? [])
    .filter((content: any) => content?.type === "output_text" && typeof content?.text === "string")
    .map((content: any) => content.text);

  return texts.length > 0 ? texts.join("\n") : null;
};
