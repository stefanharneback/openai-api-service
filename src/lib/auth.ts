import { timingSafeEqual } from "node:crypto";

import { env, hashApiKey } from "./env.js";
import { HttpError } from "./errors.js";
import { sql } from "./db.js";
import type { AuthContext } from "./types.js";

export const getBearerToken = (authorizationHeader: string | undefined): string => {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new HttpError(401, "missing_auth", "Expected a bearer token.");
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw new HttpError(401, "invalid_auth", "Bearer token is empty.");
  }

  return token;
};

const matchesExpectedToken = (token: string, expected: string | null): boolean => {
  if (!expected) {
    return false;
  }

  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
};

export const authenticateClient = async (
  authorizationHeader: string | undefined,
): Promise<AuthContext> => {
  const token = getBearerToken(authorizationHeader);
  const tokenHash = hashApiKey(token);

  const rows = await sql<
    {
      api_key_id: string;
      client_id: string;
      key_prefix: string;
      revoked_at: string | null;
    }[]
  >`
    select ak.id as api_key_id, ak.client_id, ak.key_prefix, ak.revoked_at
    from api_keys ak
    where ak.key_hash = ${tokenHash}
    limit 1
  `;

  const row = rows[0];
  if (!row || row.revoked_at) {
    throw new HttpError(401, "invalid_auth", "Client API key is invalid.");
  }

  return {
    apiKeyId: row.api_key_id,
    clientId: row.client_id,
    keyPrefix: row.key_prefix,
  };
};

export const authorizeAdmin = (authorizationHeader: string | undefined): void => {
  const token = getBearerToken(authorizationHeader);
  if (!matchesExpectedToken(token, env.serviceAdminKey)) {
    throw new HttpError(403, "forbidden", "Admin key is invalid.");
  }
};

export const authorizeRetention = (authorizationHeader: string | undefined): void => {
  const token = getBearerToken(authorizationHeader);
  if (
    matchesExpectedToken(token, env.serviceAdminKey) ||
    matchesExpectedToken(token, env.cronSecret)
  ) {
    return;
  }

  throw new HttpError(403, "forbidden", "Admin or cron key is invalid.");
};
