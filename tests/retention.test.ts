import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, logMock } = vi.hoisted(() => {
  const sqlTagged = vi.fn();
  const sqlMock = Object.assign(sqlTagged, {
    unsafe: vi.fn(),
    json: vi.fn((v: unknown) => v),
  });
  return {
    sqlMock,
    logMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

vi.mock("../src/lib/db.js", () => ({
  sql: sqlMock,
}));

vi.mock("../src/lib/logger.js", () => ({
  log: logMock,
}));

import { purgeOldRecords } from "../src/lib/retention.js";

describe("purgeOldRecords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RETENTION_DAYS;
  });

  afterEach(() => {
    delete process.env.RETENTION_DAYS;
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

  it("respects a custom RETENTION_DAYS value", async () => {
    process.env.RETENTION_DAYS = "30";
    sqlMock.mockResolvedValueOnce([]);

    const count = await purgeOldRecords();

    expect(count).toBe(0);
    expect(vi.mocked(logMock.info)).not.toHaveBeenCalled();
  });

  it("falls back to default for invalid RETENTION_DAYS", async () => {
    process.env.RETENTION_DAYS = "not-a-number";
    sqlMock.mockResolvedValueOnce([{ id: "r1" }]);

    const count = await purgeOldRecords();

    expect(count).toBe(1);
    expect(vi.mocked(logMock.info)).toHaveBeenCalledWith(
      "Purged expired ledger records.",
      expect.objectContaining({ retentionDays: 90 }),
    );
  });
});
