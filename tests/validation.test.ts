import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env before importing the modules under test.
vi.mock("../src/lib/env.js", () => ({
  env: {
    modelAllowlist: new Set(["gpt-5.4", "gpt-5-mini-2025-08-07"]),
    maxJsonBodyBytes: 256 * 1024,
    maxAudioBytes: 10 * 1024 * 1024,
  },
}));

import { llmBodySchema, usageQuerySchema, ensureAllowedModel, ensureJsonBodySize, ensureAudioSize } from "../src/lib/validation.js";
import { HttpError } from "../src/lib/errors.js";

describe("llmBodySchema", () => {
  it("accepts a minimal valid body", () => {
    const result = llmBodySchema.safeParse({
      model: "gpt-5.4",
      input: "Hello",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a body with all optional fields", () => {
    const result = llmBodySchema.safeParse({
      model: "gpt-5.4",
      input: "Hello",
      instructions: "Be helpful",
      temperature: 0.7,
      max_output_tokens: 1024,
      stream: true,
      metadata: { user: "test" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing model", () => {
    const result = llmBodySchema.safeParse({ input: "Hello" });
    expect(result.success).toBe(false);
  });

  it("rejects empty input string", () => {
    const result = llmBodySchema.safeParse({ model: "gpt-5.4", input: "" });
    expect(result.success).toBe(false);
  });

  it("accepts array input", () => {
    const result = llmBodySchema.safeParse({
      model: "gpt-5.4",
      input: [{ role: "user", content: "Hi" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects temperature above 2", () => {
    const result = llmBodySchema.safeParse({
      model: "gpt-5.4",
      input: "Hi",
      temperature: 3,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative max_output_tokens", () => {
    const result = llmBodySchema.safeParse({
      model: "gpt-5.4",
      input: "Hi",
      max_output_tokens: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("usageQuerySchema", () => {
  it("uses defaults for empty object", () => {
    const result = usageQuerySchema.parse({});
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it("coerces string numbers", () => {
    const result = usageQuerySchema.parse({ limit: "50", offset: "10" });
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(10);
  });

  it("clamps limit to max 100", () => {
    const result = usageQuerySchema.safeParse({ limit: "200" });
    expect(result.success).toBe(false);
  });
});

describe("ensureAllowedModel", () => {
  it("passes for an allowed model", () => {
    expect(() => ensureAllowedModel("gpt-5.4")).not.toThrow();
  });

  it("throws HttpError 403 for a disallowed model", () => {
    expect(() => ensureAllowedModel("not-allowed-model")).toThrow(HttpError);
    try {
      ensureAllowedModel("not-allowed-model");
    } catch (e) {
      expect((e as HttpError).status).toBe(403);
      expect((e as HttpError).code).toBe("model_not_allowed");
    }
  });
});

describe("ensureJsonBodySize", () => {
  it("passes for a small body", () => {
    expect(() => ensureJsonBodySize("short")).not.toThrow();
  });

  it("throws HttpError 413 for oversized body", () => {
    const bigBody = "x".repeat(256 * 1024 + 1);
    expect(() => ensureJsonBodySize(bigBody)).toThrow(HttpError);
    try {
      ensureJsonBodySize(bigBody);
    } catch (e) {
      expect((e as HttpError).status).toBe(413);
    }
  });
});

describe("ensureAudioSize", () => {
  it("passes for small audio", () => {
    expect(() => ensureAudioSize(1024)).not.toThrow();
  });

  it("throws HttpError 413 for oversized audio", () => {
    expect(() => ensureAudioSize(10 * 1024 * 1024 + 1)).toThrow(HttpError);
    try {
      ensureAudioSize(10 * 1024 * 1024 + 1);
    } catch (e) {
      expect((e as HttpError).status).toBe(413);
    }
  });
});
