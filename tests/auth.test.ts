import { describe, it, expect, vi } from "vitest";

// Mock env and db so auth module can be imported without real env vars or DB.
vi.mock("../src/lib/env.js", () => ({
  env: {
    apiKeySalt: "test-salt",
    serviceAdminKey: "super-secret-admin-key",
    cronSecret: "cron-job-secret",
  },
  hashApiKey: (key: string) => {
    const { createHash } = require("node:crypto");
    return createHash("sha256").update(`test-salt:${key}`).digest("hex");
  },
}));

vi.mock("../src/lib/db.js", () => ({
  sql: Object.assign(
    // Tagged template function that returns mock rows.
    (..._args: unknown[]) => Promise.resolve([]),
    { unsafe: () => Promise.resolve([]) },
  ),
}));

import { getBearerToken, authorizeAdmin, authorizeRetention } from "../src/lib/auth.js";
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

describe("authorizeAdmin", () => {
  it("succeeds with the correct admin key", () => {
    expect(() => authorizeAdmin("Bearer super-secret-admin-key")).not.toThrow();
  });

  it("throws 403 with an incorrect admin key", () => {
    expect(() => authorizeAdmin("Bearer wrong-key")).toThrow(HttpError);
    try {
      authorizeAdmin("Bearer wrong-key");
    } catch (e) {
      expect((e as HttpError).status).toBe(403);
      expect((e as HttpError).code).toBe("forbidden");
    }
  });

  it("throws 403 when the key has different length (timing-safe)", () => {
    expect(() => authorizeAdmin("Bearer x")).toThrow(HttpError);
    try {
      authorizeAdmin("Bearer x");
    } catch (e) {
      expect((e as HttpError).status).toBe(403);
    }
  });

  it("throws 401 when authorization header is missing", () => {
    expect(() => authorizeAdmin(undefined)).toThrow(HttpError);
    try {
      authorizeAdmin(undefined);
    } catch (e) {
      expect((e as HttpError).status).toBe(401);
    }
  });
});

describe("authorizeRetention", () => {
  it("accepts the admin key", () => {
    expect(() => authorizeRetention("Bearer super-secret-admin-key")).not.toThrow();
  });

  it("accepts the cron secret", () => {
    expect(() => authorizeRetention("Bearer cron-job-secret")).not.toThrow();
  });

  it("rejects unrelated keys", () => {
    expect(() => authorizeRetention("Bearer wrong-key")).toThrow(HttpError);
    try {
      authorizeRetention("Bearer wrong-key");
    } catch (e) {
      expect((e as HttpError).status).toBe(403);
      expect((e as HttpError).code).toBe("forbidden");
    }
  });
});
