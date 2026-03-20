import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "./env.js";

type EncryptedValue = {
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  value: string;
};

export const maybeEncryptJson = (payload: unknown): unknown => {
  if (!env.ledgerEncryptionKey) {
    return payload;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", env.ledgerEncryptionKey, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const encrypted: EncryptedValue = {
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    value: ciphertext.toString("base64"),
  };

  return encrypted;
};

export const maybeDecryptJson = <T>(payload: unknown): T => {
  if (!env.ledgerEncryptionKey) {
    return payload as T;
  }

  const record = payload as EncryptedValue;
  if (record?.alg !== "aes-256-gcm") {
    return payload as T;
  }

  try {
    const encrypted = payload as EncryptedValue;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      env.ledgerEncryptionKey,
      Buffer.from(encrypted.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted.value, "base64")),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString("utf8")) as T;
  } catch {
    throw new Error("Failed to decrypt ledger payload. Data may be corrupted or key mismatch.");
  }
};