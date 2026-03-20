import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSql = vi.hoisted(() => {
  const fn: any = vi.fn((..._args: unknown[]) => Promise.resolve([]));
  fn.unsafe = vi.fn(() => Promise.resolve());
  fn.json = (v: unknown) => v;
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

    const unsafeCalls = mockSql.unsafe.mock.calls.map((c: unknown[]) => c[0]);
    expect(unsafeCalls[0]).toBe("begin");
    expect(unsafeCalls[unsafeCalls.length - 1]).toBe("commit");
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

    const unsafeCalls = mockSql.unsafe.mock.calls.map((c: unknown[]) => c[0]);
    expect(unsafeCalls).toContain("rollback");
    expect(unsafeCalls).not.toContain("commit");
  });

  it("handles null auth gracefully", async () => {
    await recordRequest(makeRecord({ auth: null }));

    // Should still succeed — the first tagged template call is the request insert
    expect(mockSql).toHaveBeenCalledTimes(2);
    expect(mockSql.unsafe).toHaveBeenCalledWith("commit");
  });

  it("handles null cost gracefully", async () => {
    await recordRequest(makeRecord({ cost: null }));

    expect(mockSql).toHaveBeenCalledTimes(2);
    expect(mockSql.unsafe).toHaveBeenCalledWith("commit");
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
    const [strings, ...values] = mockSql.mock.calls[0];
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
    const [strings, ...values] = mockSql.mock.calls[0];
    expect(values).toContain(25);
    expect(values).toContain(50);
  });
});
