import type { CostBreakdown, UsageSnapshot } from "./types.js";

type PricingCatalogEntry = {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion: number;
};

// Pricing sourced from https://openai.com/api/pricing/ (snapshot date below).
const pricingCatalogVersion = "2026-03-17";

const pricingCatalog: Record<string, PricingCatalogEntry> = {
  "gpt-5.4": {
    inputPerMillion: 2.5,
    outputPerMillion: 15,
    cachedInputPerMillion: 0.25,
  },
  "gpt-5-mini-2025-08-07": {
    inputPerMillion: 0.25,
    outputPerMillion: 2,
    cachedInputPerMillion: 0.025,
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

  const inputCostUsd = toUsd(usage.inputTokens, pricing.inputPerMillion);
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