import { sql } from "./db.js";
import { env } from "./env.js";
import { log } from "./logger.js";

export const purgeOldRecords = async (): Promise<number> => {
  const days = env.retentionDays;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const result = await sql`
    delete from requests
    where created_at < ${cutoff}
    returning id
  `;

  const count = result.length;
  if (count > 0) {
    log.info("Purged expired ledger records.", { count, retentionDays: days });
  }

  return count;
};
