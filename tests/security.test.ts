import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash, randomBytes } from "node:crypto";

// We test the encryption module by bypassing the env dependency.
// Since security.ts imports env at module level, we mock it.
vi.mock("../src/lib/env.js", () => {
  const key = randomBytes(32);
  return {
    env: {
      ledgerEncryptionKey: key,
    },
  };
});

import { maybeEncryptJson, maybeDecryptJson } from "../src/lib/security.js";

describe("maybeEncryptJson / maybeDecryptJson", () => {
  it("round-trips a simple object", () => {
    const original = { message: "Hello, world!", count: 42 };
    const encrypted = maybeEncryptJson(original);

    // Encrypted value should have the AES-GCM structure.
    expect(encrypted).toHaveProperty("alg", "aes-256-gcm");
    expect(encrypted).toHaveProperty("iv");
    expect(encrypted).toHaveProperty("tag");
    expect(encrypted).toHaveProperty("value");

    // Value should not reveal the plaintext.
    const enc = encrypted as { value: string };
    expect(enc.value).not.toContain("Hello");

    const decrypted = maybeDecryptJson<typeof original>(encrypted);
    expect(decrypted).toEqual(original);
  });

  it("round-trips an array", () => {
    const original = [1, "two", { three: 3 }];
    const encrypted = maybeEncryptJson(original);
    const decrypted = maybeDecryptJson<typeof original>(encrypted);
    expect(decrypted).toEqual(original);
  });

  it("produces different ciphertext for the same input (random IV)", () => {
    const original = { sensitive: true };
    const encrypted1 = maybeEncryptJson(original) as { iv: string };
    const encrypted2 = maybeEncryptJson(original) as { iv: string };
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
  });
});

describe("maybeEncryptJson with no key", () => {
  it("passes through when encryption key is null", async () => {
    // Clear all module caches so the new mock takes effect.
    vi.resetModules();

    vi.doMock("../src/lib/env.js", () => ({
      env: { ledgerEncryptionKey: null },
    }));

    const { maybeEncryptJson: encryptNoKey, maybeDecryptJson: decryptNoKey } =
      await import("../src/lib/security.js");

    const original = { plain: "text" };
    const result = encryptNoKey(original);
    expect(result).toEqual(original);

    const decrypted = decryptNoKey(original);
    expect(decrypted).toEqual(original);
  });
});

describe("maybeDecryptJson error handling", () => {
  it("throws a descriptive error when ciphertext is corrupted", () => {
    const corrupted = {
      alg: "aes-256-gcm" as const,
      iv: "AAAAAAAAAAAAAAAA",
      tag: "AAAAAAAAAAAAAAAAAAAAAA==",
      value: "corrupted_not_valid_base64!!!!",
    };

    expect(() => maybeDecryptJson(corrupted)).toThrow(
      "Failed to decrypt ledger payload",
    );
  });

  it("throws a descriptive error when auth tag is wrong", () => {
    // Encrypt a value then tamper with the tag
    const encrypted = maybeEncryptJson({ secret: true }) as {
      alg: string;
      iv: string;
      tag: string;
      value: string;
    };
    const tampered = { ...encrypted, tag: Buffer.from("wrong-tag-value!").toString("base64") };

    expect(() => maybeDecryptJson(tampered)).toThrow(
      "Failed to decrypt ledger payload",
    );
  });
});
