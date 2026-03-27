import { describe, it, expect } from "vitest";
import { extractUsage, extractResponseText } from "../src/lib/usage.js";

describe("extractUsage", () => {
  it("extracts Responses API field names", () => {
    const payload = {
      usage: {
        input_tokens: 42,
        output_tokens: 17,
        total_tokens: 59,
        input_tokens_details: { cached_tokens: 10 },
        output_tokens_details: { reasoning_tokens: 5 },
      },
    };
    const result = extractUsage(payload);
    expect(result.inputTokens).toBe(42);
    expect(result.outputTokens).toBe(17);
    expect(result.cachedInputTokens).toBe(10);
    expect(result.reasoningTokens).toBe(5);
    expect(result.totalTokens).toBe(59);
  });

  it("extracts Chat Completions API field names", () => {
    const payload = {
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    };
    const result = extractUsage(payload);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.totalTokens).toBe(150);
    expect(result.cachedInputTokens).toBeNull();
    expect(result.reasoningTokens).toBeNull();
  });

  it("handles missing usage object", () => {
    const result = extractUsage({});
    expect(result.inputTokens).toBeNull();
    expect(result.outputTokens).toBeNull();
    expect(result.totalTokens).toBeNull();
  });

  it("handles null payload", () => {
    const result = extractUsage(null);
    expect(result.inputTokens).toBeNull();
  });

  it("computes totalTokens when not explicitly provided", () => {
    const payload = {
      usage: {
        input_tokens: 10,
        output_tokens: 20,
      },
    };
    const result = extractUsage(payload);
    expect(result.totalTokens).toBe(30);
  });

  it("preserves explicit totalTokens even when the sum differs", () => {
    const payload = {
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 99,
      },
    };

    const result = extractUsage(payload);
    expect(result.totalTokens).toBe(99);
  });

  it("returns explicit totalTokens when category counts are missing", () => {
    const payload = {
      usage: {
        total_tokens: 77,
      },
    };

    const result = extractUsage(payload);
    expect(result.inputTokens).toBeNull();
    expect(result.outputTokens).toBeNull();
    expect(result.totalTokens).toBe(77);
  });

  it("returns null totalTokens when input/output are both missing", () => {
    const result = extractUsage({ usage: {} });
    expect(result.totalTokens).toBeNull();
  });
});

describe("extractResponseText", () => {
  it("extracts output_text from top level", () => {
    const payload = { output_text: "Hello world" };
    expect(extractResponseText(payload)).toBe("Hello world");
  });

  it("extracts text from nested output content array", () => {
    const payload = {
      output: [
        {
          content: [
            { type: "output_text", text: "Part 1" },
            { type: "output_text", text: "Part 2" },
          ],
        },
      ],
    };
    expect(extractResponseText(payload)).toBe("Part 1\nPart 2");
  });

  it("returns null when no text found", () => {
    expect(extractResponseText({})).toBeNull();
    expect(extractResponseText(null)).toBeNull();
  });

  it("skips non-text content items", () => {
    const payload = {
      output: [
        {
          content: [
            { type: "tool_call", id: "abc" },
            { type: "output_text", text: "Found it" },
          ],
        },
      ],
    };
    expect(extractResponseText(payload)).toBe("Found it");
  });
});
