import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { HttpError } from "./errors.js";
import { ensureAudioSize } from "./validation.js";

const dnsLookupTimeoutMs = 5_000;
const maxRedirects = 5;

const privateIpv4Prefixes = [
  "10.",
  "127.",
  "169.254.",
  "172.16.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
  "192.168.",
];

const isPrivateAddress = (address: string): boolean => {
  if (address === "::1" || address.startsWith("fc") || address.startsWith("fd")) {
    return true;
  }

  return privateIpv4Prefixes.some((prefix) => address.startsWith(prefix));
};

const validateRemoteUrl = async (url: URL): Promise<void> => {
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new HttpError(400, "invalid_audio_url", "Only HTTP(S) URLs are allowed.");
  }

  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new HttpError(400, "invalid_audio_url", "Localhost URLs are not allowed.");
  }

  const resolved = await Promise.race([
    lookup(url.hostname, { all: true }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new HttpError(400, "audio_fetch_failed", "DNS lookup timed out.")),
        dnsLookupTimeoutMs,
      ),
    ),
  ]);
  if (resolved.some((entry) => isIP(entry.address) && isPrivateAddress(entry.address))) {
    throw new HttpError(400, "invalid_audio_url", "Private network targets are not allowed.");
  }
};

const fetchRemoteUrl = async (url: URL): Promise<Response> => {
  try {
    return await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent": "openai-api-service/0.1",
      },
    });
  } catch {
    throw new HttpError(400, "audio_fetch_failed", "Remote audio fetch failed.");
  }
};

export const fetchRemoteAudio = async (
  urlValue: string,
): Promise<{ fileName: string; contentType: string; bytes: Uint8Array }> => {
  let currentUrl = new URL(urlValue);

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    await validateRemoteUrl(currentUrl);

    const response = await fetchRemoteUrl(currentUrl);
    const location = response.headers.get("location");
    if (location && response.status >= 300 && response.status < 400) {
      if (redirects === maxRedirects) {
        throw new HttpError(
          400,
          "audio_fetch_failed",
          `Remote audio fetch exceeded ${maxRedirects} redirects.`,
        );
      }

      currentUrl = new URL(location, currentUrl);
      continue;
    }

    if (!response.ok) {
      throw new HttpError(
        400,
        "audio_fetch_failed",
        `Remote audio fetch failed with status ${response.status}.`,
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    ensureAudioSize(bytes.byteLength);

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const fileName = currentUrl.pathname.split("/").pop() || "audio";

    return { bytes, contentType, fileName };
  }

  throw new HttpError(
    400,
    "audio_fetch_failed",
    `Remote audio fetch exceeded ${maxRedirects} redirects.`,
  );
};
