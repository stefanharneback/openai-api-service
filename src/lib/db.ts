import postgres from "postgres";

import { env } from "./env.js";

declare global {
  var __openAiApiServiceSql: postgres.Sql | undefined;
}

export const sql =
  globalThis.__openAiApiServiceSql ??
  postgres(env.databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

if (!globalThis.__openAiApiServiceSql) {
  globalThis.__openAiApiServiceSql = sql;
}