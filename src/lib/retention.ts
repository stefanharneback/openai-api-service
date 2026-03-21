import { sql } from "./db.js";
import { log } from "./logger.js";

const defaultRetentionDays = 90;

const getRetentionDays = (): number => {
  const raw = process.env.RETENTION_DAYS;
  if (!raw) return defaultRetentionDays;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultRetentionDays;
};

export const purgeOldRecords = async (): Promise<number> => {
  const days = getRetentionDays();
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
