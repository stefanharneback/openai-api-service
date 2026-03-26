import { describe, it, expect } from "vitest";
import { estimateCost, pricingCatalogVersion } from "../src/lib/costing.js";
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
    expect(result!.pricingVersion).toBe("2026-03-26");
  });

  it("calculates cost for gpt-5.4-mini", () => {
    const usage = makeUsage({
      inputTokens: 2_000_000,
      outputTokens: 500_000,
      cachedInputTokens: 1_000_000,
    });
    const result = estimateCost("gpt-5.4-mini", usage);
    expect(result).not.toBeNull();
    expect(result!.inputCostUsd).toBe(0.75);
    expect(result!.outputCostUsd).toBe(2.25);
    expect(result!.cachedInputCostUsd).toBe(0.075);
    expect(result!.totalCostUsd).toBe(3.075);
  });

  it("calculates cost for gpt-5.4-nano", () => {
    const usage = makeUsage({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cachedInputTokens: 0,
    });
    const result = estimateCost("gpt-5.4-nano", usage);
    expect(result).not.toBeNull();
    expect(result!.inputCostUsd).toBe(0.2);
    expect(result!.outputCostUsd).toBe(1.25);
    expect(result!.cachedInputCostUsd).toBe(0);
    expect(result!.totalCostUsd).toBe(1.45);
  });

  it("calculates cost for gpt-5.4-pro", () => {
    const usage = makeUsage({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cachedInputTokens: 500_000,
    });
    const result = estimateCost("gpt-5.4-pro", usage);
    expect(result).not.toBeNull();
    expect(result!.inputCostUsd).toBe(15);
    expect(result!.outputCostUsd).toBe(180);
    expect(result!.cachedInputCostUsd).toBe(0);
    expect(result!.totalCostUsd).toBe(195);
  });

  it("keeps a legacy mini snapshot alias on the current pricing", () => {
    const usage = makeUsage({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    const result = estimateCost("gpt-5-mini-2025-08-07", usage);
    expect(result).not.toBeNull();
    expect(result!.totalCostUsd).toBe(5.25);
  });

  it("calculates cost for gpt-4o-transcribe", () => {
    const usage = makeUsage({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    });
    const result = estimateCost("gpt-4o-transcribe", usage);
    expect(result).not.toBeNull();
    expect(result!.inputCostUsd).toBe(2.5);
    expect(result!.outputCostUsd).toBe(5);
    expect(result!.totalCostUsd).toBe(7.5);
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

  it("never bills negative uncached input tokens", () => {
    const usage = makeUsage({
      inputTokens: 100,
      cachedInputTokens: 200,
    });
    const result = estimateCost("gpt-5.4", usage);
    expect(result).not.toBeNull();
    expect(result!.inputCostUsd).toBe(0);
  });

  it("returns null when token usage is unavailable", () => {
    const usage = makeUsage();
    const result = estimateCost("gpt-5.4", usage);
    expect(result).toBeNull();
  });

  it("returns null for audio models without token usage", () => {
    expect(estimateCost("whisper-1", makeUsage())).toBeNull();
  });

  it("calculates cost for gpt-4o-mini-transcribe", () => {
    const usage = makeUsage({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    const result = estimateCost("gpt-4o-mini-transcribe", usage);
    expect(result).not.toBeNull();
    expect(result!.inputCostUsd).toBe(1.25);
    expect(result!.outputCostUsd).toBe(5);
    expect(result!.totalCostUsd).toBe(6.25);
  });

  it("calculates cost for gpt-4o-transcribe-diarize", () => {
    const usage = makeUsage({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    });
    const result = estimateCost("gpt-4o-transcribe-diarize", usage);
    expect(result).not.toBeNull();
    expect(result!.inputCostUsd).toBe(2.5);
    expect(result!.outputCostUsd).toBe(5);
    expect(result!.totalCostUsd).toBe(7.5);
  });

  it("pricing catalog version is less than 90 days old", () => {
    const ageMs = Date.now() - new Date(pricingCatalogVersion).getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    expect(ageDays).toBeLessThan(90);
  });
});
