import { describe, it, expect, vi, beforeEach } from "vitest";

const setupEnv = (overrides: Record<string, string> = {}) => {
  const base: Record<string, string> = {
    OPENAI_API_KEY: "sk-test-key",
    DATABASE_URL: "postgres://localhost:5432/test",
    SERVICE_ADMIN_KEY: "admin-key",
    API_KEY_SALT: "test-salt",
    ...overrides,
  };
  for (const [key, value] of Object.entries(base)) {
    process.env[key] = value;
  }
};

const cleanEnv = () => {
  for (const key of [
    "OPENAI_API_KEY",
    "DATABASE_URL",
    "SERVICE_ADMIN_KEY",
    "CRON_SECRET",
    "API_KEY_SALT",
    "MODEL_ALLOWLIST",
    "MAX_AUDIO_BYTES",
    "MAX_JSON_BODY_BYTES",
    "LEDGER_ENCRYPTION_KEY",
  ]) {
    delete process.env[key];
  }
};

describe("env module", () => {
  beforeEach(() => {
    cleanEnv();
    vi.resetModules();
  });

  it("parses all required environment variables", async () => {
    setupEnv();
    const { env } = await import("../src/lib/env.js");

    expect(env.openAiApiKey).toBe("sk-test-key");
    expect(env.databaseUrl).toBe("postgres://localhost:5432/test");
    expect(env.serviceAdminKey).toBe("admin-key");
    expect(env.cronSecret).toBeNull();
    expect(env.apiKeySalt).toBe("test-salt");
  });

  it("parses CRON_SECRET when configured", async () => {
    setupEnv({ CRON_SECRET: "cron-key" });
    const { env } = await import("../src/lib/env.js");
    expect(env.cronSecret).toBe("cron-key");
  });

  it("throws when a required variable is missing", async () => {
    setupEnv();
    delete process.env.OPENAI_API_KEY;

    await expect(import("../src/lib/env.js")).rejects.toThrow(
      "Missing required environment variable: OPENAI_API_KEY",
    );
  });

  it("uses default for MAX_AUDIO_BYTES when not set", async () => {
    setupEnv();
    const { env } = await import("../src/lib/env.js");
    expect(env.maxAudioBytes).toBe(10 * 1024 * 1024);
  });

  it("parses a custom MAX_AUDIO_BYTES", async () => {
    setupEnv({ MAX_AUDIO_BYTES: "5000000" });
    const { env } = await import("../src/lib/env.js");
    expect(env.maxAudioBytes).toBe(5_000_000);
  });

  it("throws for invalid numeric MAX_AUDIO_BYTES", async () => {
    setupEnv({ MAX_AUDIO_BYTES: "not-a-number" });
    await expect(import("../src/lib/env.js")).rejects.toThrow(
      "Invalid numeric environment variable: MAX_AUDIO_BYTES",
    );
  });

  it("parses MODEL_ALLOWLIST into a Set", async () => {
    setupEnv({ MODEL_ALLOWLIST: "gpt-5.4, gpt-5.4-mini" });
    const { env } = await import("../src/lib/env.js");
    expect(env.modelAllowlist.size).toBe(2);
    expect(env.modelAllowlist.has("gpt-5.4")).toBe(true);
    expect(env.modelAllowlist.has("gpt-5.4-mini")).toBe(true);
  });

  it("returns empty allowlist when MODEL_ALLOWLIST is not set", async () => {
    setupEnv();
    const { env } = await import("../src/lib/env.js");
    expect(env.modelAllowlist.size).toBe(0);
  });

  it("parses a hex LEDGER_ENCRYPTION_KEY", async () => {
    const hexKey = "a".repeat(64); // 32 bytes in hex
    setupEnv({ LEDGER_ENCRYPTION_KEY: hexKey });
    const { env } = await import("../src/lib/env.js");
    expect(env.ledgerEncryptionKey).toBeInstanceOf(Buffer);
    expect(env.ledgerEncryptionKey!.length).toBe(32);
  });

  it("parses a base64 LEDGER_ENCRYPTION_KEY", async () => {
    const key = Buffer.alloc(32, 0xab);
    setupEnv({ LEDGER_ENCRYPTION_KEY: key.toString("base64") });
    const { env } = await import("../src/lib/env.js");
    expect(env.ledgerEncryptionKey).toBeInstanceOf(Buffer);
    expect(env.ledgerEncryptionKey!.length).toBe(32);
  });

  it("throws when LEDGER_ENCRYPTION_KEY decodes to wrong length", async () => {
    setupEnv({ LEDGER_ENCRYPTION_KEY: "aabb" }); // only 2 bytes
    await expect(import("../src/lib/env.js")).rejects.toThrow(
      "LEDGER_ENCRYPTION_KEY must decode to exactly 32 bytes.",
    );
  });

  it("returns null when LEDGER_ENCRYPTION_KEY is not set", async () => {
    setupEnv();
    const { env } = await import("../src/lib/env.js");
    expect(env.ledgerEncryptionKey).toBeNull();
  });
});

describe("hashApiKey", () => {
  beforeEach(() => {
    cleanEnv();
    vi.resetModules();
  });

  it("produces a consistent SHA-256 hex hash", async () => {
    setupEnv();
    const { hashApiKey } = await import("../src/lib/env.js");
    const hash1 = hashApiKey("my-key");
    const hash2 = hashApiKey("my-key");
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the key changes", async () => {
    setupEnv();
    const { hashApiKey } = await import("../src/lib/env.js");
    expect(hashApiKey("key-a")).not.toBe(hashApiKey("key-b"));
  });
});

describe("newRequestId", () => {
  beforeEach(() => {
    cleanEnv();
    vi.resetModules();
  });

  it("returns a UUID-formatted string", async () => {
    setupEnv();
    const { newRequestId } = await import("../src/lib/env.js");
    const id = newRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
