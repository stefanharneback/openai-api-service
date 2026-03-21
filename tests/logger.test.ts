import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log } from "../src/lib/logger.js";

describe("log", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("log.info writes JSON to stdout", () => {
    log.info("hello", { requestId: "abc" });
    expect(stdoutSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed).toMatchObject({ level: "info", msg: "hello", requestId: "abc" });
    expect(parsed.time).toBeDefined();
  });

  it("log.warn writes JSON to stdout", () => {
    log.warn("caution");
    expect(stdoutSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed).toMatchObject({ level: "warn", msg: "caution" });
  });

  it("log.error writes JSON to stderr", () => {
    log.error("boom", { code: 500 });
    expect(stderrSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(String(stderrSpy.mock.calls[0][0]));
    expect(parsed).toMatchObject({ level: "error", msg: "boom", code: 500 });
  });

  it("log.info works without extra data", () => {
    log.info("bare");
    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed.msg).toBe("bare");
    expect(Object.keys(parsed)).toEqual(["level", "msg", "time"]);
  });
});
