/**
 * Seed the local database with a test client and API key.
 *
 * Usage:
 *   npx tsx db/seed.ts
 *
 * Requires DATABASE_URL and API_KEY_SALT environment variables (or .env file).
 */

import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const apiKeySalt = process.env.API_KEY_SALT;

if (!databaseUrl || !apiKeySalt) {
  console.error("Set DATABASE_URL and API_KEY_SALT before running the seed script.");
  console.error("Example:");
  console.error('  DATABASE_URL="postgres://oais:oais_local_dev@localhost:5432/oais" API_KEY_SALT="local-dev-salt" npx tsx db/seed.ts');
  process.exit(1);
}

const sql = postgres(databaseUrl, { prepare: false });

const clientId = "a0000000-0000-0000-0000-000000000001";
const clientName = "Local dev client";
const rawApiKey = `oais_test_${randomUUID().replaceAll("-", "")}`;
const keyPrefix = rawApiKey.slice(0, 12);
const keyHash = createHash("sha256").update(`${apiKeySalt}:${rawApiKey}`).digest("hex");

async function seed() {
  await sql`
    insert into clients (id, name)
    values (${clientId}, ${clientName})
    on conflict (id) do nothing
  `;

  await sql`
    insert into api_keys (client_id, key_prefix, key_hash, description)
    values (${clientId}, ${keyPrefix}, ${keyHash}, ${"Seeded by db/seed.ts"})
  `;

  console.log("--- Seed complete ---");
  console.log(`Client ID:  ${clientId}`);
  console.log(`API key:    ${rawApiKey}`);
  console.log(`Key prefix: ${keyPrefix}`);
  console.log("");
  console.log("Use this API key as a Bearer token when calling the service.");

  await sql.end();
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
