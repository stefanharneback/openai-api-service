import { describe, it, expect } from "vitest";
import { estimateCost } from "../src/lib/costing.js";
import type { UsageSnapshot } from "../src/lib/types.js";

const makeUsage = (overrides: Partial<UsageSnapshot> = {}): UsageSnapshot => ({
  inputTokens: null,
  outputTokens: null,
  cachedInputTokens: null,
  reasoningTokens: null,
  totalTokens: null,
  ...overrides,
});

describe("estimateCost", () => {
  it("returns null for an unknown model", () => {
    const result = estimateCost("unknown-model", makeUsage({ inputTokens: 100 }));
    expect(result).toBeNull();
  });

  it("calculates cost for gpt-5.4", () => {
    const usage = makeUsage({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cachedInputTokens: 0,
    });
    const result = estimateCost("gpt-5.4", usage);
    expect(result).not.toBeNull();
    expect(result!.inputCostUsd).toBe(2.5);
    expect(result!.outputCostUsd).toBe(15);
    expect(result!.cachedInputCostUsd).toBe(0);
    expect(result!.totalCostUsd).toBe(17.5);
    expect(result!.pricingVersion).toBe("2026-03-17");
  });

  it("calculates cost for gpt-5-mini-2025-08-07", () => {
    const usage = makeUsage({
      inputTokens: 2_000_000,
      outputTokens: 500_000,
      cachedInputTokens: 1_000_000,
    });
    const result = estimateCost("gpt-5-mini-2025-08-07", usage);
    expect(result).not.toBeNull();
    expect(result!.inputCostUsd).toBe(0.5);
    expect(result!.outputCostUsd).toBe(1);
    expect(result!.cachedInputCostUsd).toBe(0.025);
    expect(result!.totalCostUsd).toBe(1.525);
  });

  it("handles zero tokens", () => {
    const usage = makeUsage({
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
    });
    const result = estimateCost("gpt-5.4", usage);
    expect(result).not.toBeNull();
    expect(result!.totalCostUsd).toBe(0);
  });

  it("handles null tokens gracefully", () => {
    const usage = makeUsage();
    const result = estimateCost("gpt-5.4", usage);
    expect(result).not.toBeNull();
    expect(result!.inputCostUsd).toBe(0);
    expect(result!.outputCostUsd).toBe(0);
    expect(result!.totalCostUsd).toBe(0);
  });

  it("returns null for audio models (no pricing entry)", () => {
    expect(estimateCost("whisper-1", makeUsage())).toBeNull();
    expect(estimateCost("gpt-4o-transcribe", makeUsage())).toBeNull();
  });
});
