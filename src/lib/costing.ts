import { log } from "./logger.js";
import type { CostBreakdown, UsageSnapshot } from "./types.js";

type PricingCatalogEntry = {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion: number;
};

// Pricing sourced from https://openai.com/api/pricing/ (snapshot date below).
export const pricingCatalogVersion = "2026-03-18";

const pricingCatalogAgeMs =
  Date.now() - new Date(pricingCatalogVersion).getTime();
const staleThresholdMs = 30 * 24 * 60 * 60 * 1000;

if (pricingCatalogAgeMs > staleThresholdMs) {
  log.warn("Pricing catalog is stale. Review https://openai.com/api/pricing/ and update costing.ts.", {
    pricingVersion: pricingCatalogVersion,
    staleDays: Math.floor(pricingCatalogAgeMs / (24 * 60 * 60 * 1000)),
  });
}

const pricingCatalog: Record<string, PricingCatalogEntry> = {
  "gpt-5.4": {
    inputPerMillion: 2.5,
    outputPerMillion: 15,
    cachedInputPerMillion: 0.25,
  },
  "gpt-5.4-mini": {
    inputPerMillion: 0.75,
    outputPerMillion: 4.5,
    cachedInputPerMillion: 0.075,
  },
  "gpt-5-mini-2025-08-07": {
    inputPerMillion: 0.75,
    outputPerMillion: 4.5,
    cachedInputPerMillion: 0.075,
  },
  "gpt-4o-transcribe": {
    inputPerMillion: 6,
    outputPerMillion: 10,
    cachedInputPerMillion: 0,
  },
};

const toUsd = (tokens: number | null, ratePerMillion: number): number => {
  if (!tokens || ratePerMillion === 0) {
    return 0;
  }

  return Number(((tokens / 1_000_000) * ratePerMillion).toFixed(6));
};

export const estimateCost = (
  model: string,
  usage: UsageSnapshot,
): CostBreakdown | null => {
  const pricing = pricingCatalog[model];
  if (!pricing) {
    return null;
  }

  const hasTokenUsage = [
    usage.inputTokens,
    usage.outputTokens,
    usage.cachedInputTokens,
  ].some((value) => value !== null);

  if (!hasTokenUsage) {
    return null;
  }

  const uncachedInputTokens =
    usage.inputTokens === null
      ? null
      : Math.max(usage.inputTokens - (usage.cachedInputTokens ?? 0), 0);
  const inputCostUsd = toUsd(uncachedInputTokens, pricing.inputPerMillion);
  const outputCostUsd = toUsd(usage.outputTokens, pricing.outputPerMillion);
  const cachedInputCostUsd = toUsd(
    usage.cachedInputTokens,
    pricing.cachedInputPerMillion,
  );

  return {
    inputCostUsd,
    outputCostUsd,
    cachedInputCostUsd,
    totalCostUsd: Number(
      (inputCostUsd + outputCostUsd + cachedInputCostUsd).toFixed(6),
    ),
    pricingVersion: pricingCatalogVersion,
  };
};
