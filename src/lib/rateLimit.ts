import { HttpError } from "./errors.js";

type ClientWindow = {
  timestamps: number[];
};

const windowMs = 60_000;
const maxRequestsPerWindow = 60;

const clients = new Map<string, ClientWindow>();

const pruneOld = (window: ClientWindow, now: number): void => {
  const cutoff = now - windowMs;
  while (window.timestamps.length > 0 && window.timestamps[0] <= cutoff) {
    window.timestamps.shift();
  }
};

/**
 * Check rate limit for a client. Throws HttpError 429 if exceeded.
 * Returns remaining requests in the current window.
 */
export const checkRateLimit = (clientId: string): { remaining: number } => {
  const now = Date.now();

  let window = clients.get(clientId);
  if (!window) {
    window = { timestamps: [] };
    clients.set(clientId, window);
  }

  pruneOld(window, now);

  if (window.timestamps.length >= maxRequestsPerWindow) {
    throw new HttpError(
      429,
      "rate_limit_exceeded",
      `Rate limit exceeded. Maximum ${maxRequestsPerWindow} requests per ${windowMs / 1000}s.`,
    );
  }

  window.timestamps.push(now);
  return { remaining: maxRequestsPerWindow - window.timestamps.length };
};

/** Visible for testing. */
export const resetRateLimits = (): void => {
  clients.clear();
};
