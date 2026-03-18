import { describe, it, expect, vi } from "vitest";

// Mock env and db so auth module can be imported without real env vars or DB.
vi.mock("../src/lib/env.js", () => ({
  env: {
    apiKeySalt: "test-salt",
    serviceAdminKey: "super-secret-admin-key",
  },
  hashApiKey: (key: string) => {
    const { createHash } = require("node:crypto");
    return createHash("sha256").update(`test-salt:${key}`).digest("hex");
  },
}));

vi.mock("../src/lib/db.js", () => ({
  sql: Object.assign(
    // Tagged template function that returns mock rows.
    (...args: unknown[]) => Promise.resolve([]),
    { unsafe: () => Promise.resolve([]) },
  ),
}));

import { getBearerToken } from "../src/lib/auth.js";
import { HttpError } from "../src/lib/errors.js";

describe("getBearerToken", () => {
  it("extracts a token from a valid Authorization header", () => {
    expect(getBearerToken("Bearer my-token-123")).toBe("my-token-123");
  });

  it("trims whitespace around the token", () => {
    expect(getBearerToken("Bearer   my-token  ")).toBe("my-token");
  });

  it("throws 401 when header is missing", () => {
    expect(() => getBearerToken(undefined)).toThrow(HttpError);
    try {
      getBearerToken(undefined);
    } catch (e) {
      expect((e as HttpError).status).toBe(401);
      expect((e as HttpError).code).toBe("missing_auth");
    }
  });

  it("throws 401 when header does not start with Bearer", () => {
    expect(() => getBearerToken("Basic abc123")).toThrow(HttpError);
  });

  it("throws 401 when token is empty", () => {
    expect(() => getBearerToken("Bearer ")).toThrow(HttpError);
    try {
      getBearerToken("Bearer ");
    } catch (e) {
      expect((e as HttpError).code).toBe("invalid_auth");
    }
  });
});
