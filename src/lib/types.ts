export type UsageSnapshot = {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
};

export type CostBreakdown = {
  inputCostUsd: number;
  outputCostUsd: number;
  cachedInputCostUsd: number;
  totalCostUsd: number;
  pricingVersion: string;
};

export type LedgerPayload = {
  requestBody: unknown;
  responseBody: unknown;
  responseText: string | null;
  responseSse: string | null;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
};

export type AuthContext = {
  clientId: string;
  apiKeyId: string;
  keyPrefix: string;
};

export type RequestLogRecord = {
  requestId: string;
  auth: AuthContext | null;
  endpoint: string;
  method: string;
  model: string | null;
  openaiRequestId: string | null;
  httpStatus: number;
  upstreamStatus: number | null;
  durationMs: number;
  usage: UsageSnapshot;
  cost: CostBreakdown | null;
  payload: LedgerPayload;
  errorCode: string | null;
  errorMessage: string | null;
  audioBytes: number | null;
  audioSource: string | null;
};

export type RequestContextState = {
  requestId: string;
  startedAt: number;
  auth: AuthContext | null;
};
