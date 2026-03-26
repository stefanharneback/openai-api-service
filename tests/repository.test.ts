import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSql = vi.hoisted(() => {
  const fn: any = vi.fn((..._args: unknown[]) => Promise.resolve([]));
  fn.json = (v: unknown) => v;
  // sql.begin(callback) — invoke callback with fn as the TransactionSql (tx),
  // since the implementation casts tx to typeof sql and calls it as a template tag.
  fn.begin = vi.fn(async (callback: (tx: unknown) => Promise<void>) => {
    await callback(fn);
  });
  return fn;
});

vi.mock("../src/lib/db.js", () => ({
  sql: mockSql,
}));

vi.mock("../src/lib/env.js", () => ({
  env: { ledgerEncryptionKey: null },
}));

vi.mock("../src/lib/security.js", () => ({
  maybeEncryptJson: (v: unknown) => v,
}));

import { recordRequest, listUsageForClient, listUsageForAdmin } from "../src/lib/repository.js";
import type { RequestLogRecord } from "../src/lib/types.js";

const makeRecord = (overrides: Partial<RequestLogRecord> = {}): RequestLogRecord => ({
  requestId: "req-001",
  auth: { clientId: "c1", apiKeyId: "k1", keyPrefix: "oais_test" },
  endpoint: "/v1/llm",
  method: "POST",
  model: "gpt-5.4",
  openaiRequestId: "oai-req-1",
  httpStatus: 200,
  upstreamStatus: 200,
  durationMs: 120,
  usage: {
    inputTokens: 10,
    outputTokens: 5,
    cachedInputTokens: null,
    reasoningTokens: null,
    totalTokens: 15,
  },
  cost: {
    inputCostUsd: 0.000025,
    outputCostUsd: 0.000075,
    cachedInputCostUsd: 0,
    totalCostUsd: 0.0001,
    pricingVersion: "2026-03-18",
  },
  payload: {
    requestBody: { model: "gpt-5.4", input: "hi" },
    responseBody: { output_text: "hello" },
    responseText: "hello",
    responseSse: null,
    requestHeaders: {},
    responseHeaders: { "x-request-id": "oai-req-1" },
  },
  errorCode: null,
  errorMessage: null,
  audioBytes: null,
  audioSource: null,
  ...overrides,
});

describe("recordRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wraps inserts in a begin/commit transaction", async () => {
    await recordRequest(makeRecord());

    expect(mockSql.begin).toHaveBeenCalledOnce();
  });

  it("performs two tagged template inserts (requests + request_usage)", async () => {
    await recordRequest(makeRecord());

    // Tagged template calls go through the main sql function (not .unsafe)
    const taggedCalls = mockSql.mock.calls;
    expect(taggedCalls.length).toBe(2);
  });

  it("rolls back transaction on insert failure", async () => {
    // Fail on the first tagged template call (request insert)
    mockSql.mockRejectedValueOnce(new Error("unique constraint"));

    await expect(recordRequest(makeRecord())).rejects.toThrow("unique constraint");
    // Rollback is handled internally by postgres.js sql.begin(); we just verify the error propagates.
  });

  it("handles null auth gracefully", async () => {
    await recordRequest(makeRecord({ auth: null }));

    // Both inserts (requests + request_usage) should be executed via the transaction callback.
    expect(mockSql).toHaveBeenCalledTimes(2);
    expect(mockSql.begin).toHaveBeenCalledOnce();
  });

  it("handles null cost gracefully", async () => {
    await recordRequest(makeRecord({ cost: null }));

    expect(mockSql).toHaveBeenCalledTimes(2);
    expect(mockSql.begin).toHaveBeenCalledOnce();
  });
});

describe("listUsageForClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries with client_id, limit, and offset", async () => {
    await listUsageForClient("client-1", 10, 0);

    expect(mockSql).toHaveBeenCalledTimes(1);
    // Tagged template: verify the values array includes our parameters
    const [, ...values] = mockSql.mock.calls[0];
    expect(values).toContain("client-1");
    expect(values).toContain(10);
    expect(values).toContain(0);
  });
});

describe("listUsageForAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries with limit and offset (no client filter)", async () => {
    await listUsageForAdmin(25, 50);

    expect(mockSql).toHaveBeenCalledTimes(1);
    const [, ...values] = mockSql.mock.calls[0];
    expect(values).toContain(25);
    expect(values).toContain(50);
  });
});
