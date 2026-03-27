import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, logMock, envMock } = vi.hoisted(() => {
  const sqlTagged = vi.fn();
  const sqlMock = Object.assign(sqlTagged, {
    unsafe: vi.fn(),
    json: vi.fn((v: unknown) => v),
  });
  return {
    sqlMock,
    logMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    envMock: {
      retentionDays: 90,
      openAiApiKey: "sk-test",
      databaseUrl: "postgres://localhost:5432/test",
      serviceAdminKey: "admin-key",
      cronSecret: null,
      apiKeySalt: "test-salt",
      modelAllowlist: new Set<string>(),
      maxAudioBytes: 10 * 1024 * 1024,
      maxJsonBodyBytes: 256 * 1024,
      ledgerEncryptionKey: null,
    },
  };
});

vi.mock("../src/lib/db.js", () => ({
  sql: sqlMock,
}));

vi.mock("../src/lib/logger.js", () => ({
  log: logMock,
}));

vi.mock("../src/lib/env.js", () => ({
  env: envMock,
}));

import { purgeOldRecords } from "../src/lib/retention.js";

describe("purgeOldRecords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.retentionDays = 90;
  });

  it("deletes records older than the default 90 days", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "r1" }, { id: "r2" }]);

    const count = await purgeOldRecords();

    expect(count).toBe(2);
    expect(sqlMock).toHaveBeenCalledOnce();
    expect(vi.mocked(logMock.info)).toHaveBeenCalledWith(
      "Purged expired ledger records.",
      expect.objectContaining({ count: 2, retentionDays: 90 }),
    );
  });

  it("respects a custom retention days value", async () => {
    envMock.retentionDays = 30;
    sqlMock.mockResolvedValueOnce([]);

    const count = await purgeOldRecords();

    expect(count).toBe(0);
    expect(vi.mocked(logMock.info)).not.toHaveBeenCalled();
  });
});
