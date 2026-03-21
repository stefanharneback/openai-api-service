import { createHash, randomUUID } from "node:crypto";

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const parseByteLimit = (name: string, fallback: number): number => {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid numeric environment variable: ${name}`);
  }

  return value;
};

const parseAllowlist = (): Set<string> => {
  const rawValue = process.env.MODEL_ALLOWLIST ?? "";
  return new Set(
    rawValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
};

const parseEncryptionKey = (): Buffer | null => {
  const rawValue = process.env.LEDGER_ENCRYPTION_KEY;
  if (!rawValue) {
    return null;
  }

  const trimmed = rawValue.trim();
  const candidate = /^[0-9a-fA-F]+$/.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");

  if (candidate.length !== 32) {
    throw new Error("LEDGER_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return candidate;
};

const parseOptionalSecret = (name: string): string | null => {
  const value = process.env[name]?.trim();
  return value ? value : null;
};

export const env = {
  openAiApiKey: requireEnv("OPENAI_API_KEY"),
  databaseUrl: requireEnv("DATABASE_URL"),
  serviceAdminKey: requireEnv("SERVICE_ADMIN_KEY"),
  cronSecret: parseOptionalSecret("CRON_SECRET"),
  apiKeySalt: requireEnv("API_KEY_SALT"),
  modelAllowlist: parseAllowlist(),
  maxAudioBytes: parseByteLimit("MAX_AUDIO_BYTES", 10 * 1024 * 1024),
  maxJsonBodyBytes: parseByteLimit("MAX_JSON_BODY_BYTES", 256 * 1024),
  ledgerEncryptionKey: parseEncryptionKey(),
};

export const hashApiKey = (apiKey: string): string => {
  return createHash("sha256").update(`${env.apiKeySalt}:${apiKey}`).digest("hex");
};

export const newRequestId = (): string => randomUUID();
