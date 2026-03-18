import { describe, it, expect } from "vitest";
import { HttpError, isHttpError } from "../src/lib/errors.js";

describe("HttpError", () => {
  it("creates an error with status, code, and message", () => {
    const error = new HttpError(404, "not_found", "Resource was not found.");
    expect(error.status).toBe(404);
    expect(error.code).toBe("not_found");
    expect(error.message).toBe("Resource was not found.");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("isHttpError", () => {
  it("returns true for an HttpError instance", () => {
    expect(isHttpError(new HttpError(400, "bad", "bad"))).toBe(true);
  });

  it("returns false for a regular Error", () => {
    expect(isHttpError(new Error("oops"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isHttpError(null)).toBe(false);
    expect(isHttpError("string")).toBe(false);
    expect(isHttpError(42)).toBe(false);
  });
});
