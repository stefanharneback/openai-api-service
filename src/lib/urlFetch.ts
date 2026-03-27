import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

import { Agent } from "undici";

import { HttpError } from "./errors.js";
import { ensureAudioSize } from "./validation.js";

const dnsLookupTimeoutMs = 5_000;
const maxRedirects = 5;
const lookupTypeByFamily = {
  4: "ipv4",
  6: "ipv6",
} as const;

const blockedAddresses = new BlockList();
blockedAddresses.addSubnet("0.0.0.0", 8, "ipv4");
blockedAddresses.addSubnet("10.0.0.0", 8, "ipv4");
blockedAddresses.addSubnet("100.64.0.0", 10, "ipv4");
blockedAddresses.addSubnet("127.0.0.0", 8, "ipv4");
blockedAddresses.addSubnet("169.254.0.0", 16, "ipv4");
blockedAddresses.addSubnet("172.16.0.0", 12, "ipv4");
blockedAddresses.addSubnet("192.0.0.0", 24, "ipv4");
blockedAddresses.addSubnet("192.0.2.0", 24, "ipv4");
blockedAddresses.addSubnet("192.168.0.0", 16, "ipv4");
blockedAddresses.addSubnet("198.18.0.0", 15, "ipv4");
blockedAddresses.addSubnet("198.51.100.0", 24, "ipv4");
blockedAddresses.addSubnet("203.0.113.0", 24, "ipv4");
blockedAddresses.addSubnet("224.0.0.0", 4, "ipv4");
blockedAddresses.addSubnet("240.0.0.0", 4, "ipv4");
blockedAddresses.addAddress("::", "ipv6");
blockedAddresses.addAddress("::1", "ipv6");
blockedAddresses.addSubnet("fc00::", 7, "ipv6");
blockedAddresses.addSubnet("fe80::", 10, "ipv6");
blockedAddresses.addSubnet("fec0::", 10, "ipv6");

type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

const normalizeHost = (host: string): string => {
  return host.replace(/^\[|\]$/g, "");
};

const isPrivateAddress = (address: string): boolean => {
  const normalizedAddress = normalizeHost(address);
  const family = isIP(normalizedAddress);
  if (family !== 4 && family !== 6) {
    return false;
  }

  if (family === 6 && normalizedAddress.startsWith("::ffff:")) {
    return isPrivateAddress(normalizedAddress.slice("::ffff:".length));
  }

  return blockedAddresses.check(normalizedAddress, lookupTypeByFamily[family]);
};

const resolveRemoteUrl = async (url: URL): Promise<ResolvedAddress> => {
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new HttpError(400, "invalid_audio_url", "Only HTTP(S) URLs are allowed.");
  }

  const hostname = normalizeHost(url.hostname);
  if (hostname.toLowerCase() === "localhost") {
    throw new HttpError(400, "invalid_audio_url", "Localhost URLs are not allowed.");
  }

  const hostFamily = isIP(hostname);
  if (hostFamily === 4 || hostFamily === 6) {
    if (isPrivateAddress(hostname)) {
      throw new HttpError(400, "invalid_audio_url", "Private network targets are not allowed.");
    }

    return {
      address: hostname,
      family: hostFamily,
    };
  }

  const resolved = await Promise.race([
    lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new HttpError(400, "audio_fetch_failed", "DNS lookup timed out.")),
        dnsLookupTimeoutMs,
      ),
    ),
  ]);

  const publicEntries = resolved.filter(
    (entry): entry is { address: string; family: 4 | 6 } =>
      (entry.family === 4 || entry.family === 6) && !isPrivateAddress(entry.address),
  );

  if (publicEntries.length === 0 || resolved.some((entry) => isPrivateAddress(entry.address))) {
    throw new HttpError(400, "invalid_audio_url", "Private network targets are not allowed.");
  }

  return publicEntries[0];
};

const fetchRemoteUrl = async (
  url: URL,
  resolvedAddress: ResolvedAddress,
): Promise<{ response: Response; dispatcher: Agent }> => {
  const fetchWithDispatcher = globalThis.fetch as (
    input: string | URL | Request,
    init?: RequestInit & { dispatcher?: Agent },
  ) => Promise<Response>;
  const dispatcher = new Agent({
    connect: {
      lookup(_hostname, _options, callback) {
        callback(null, resolvedAddress.address, resolvedAddress.family);
      },
    },
  });

  try {
    const response = await fetchWithDispatcher(url, {
      redirect: "manual",
      dispatcher,
      headers: {
        "User-Agent": "openai-api-service/0.1",
      },
    });

    return { response, dispatcher };
  } catch {
    await dispatcher.close();
    throw new HttpError(400, "audio_fetch_failed", "Remote audio fetch failed.");
  }
};

export const fetchRemoteAudio = async (
  urlValue: string,
): Promise<{ fileName: string; contentType: string; bytes: Uint8Array }> => {
  let currentUrl = new URL(urlValue);

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const resolvedAddress = await resolveRemoteUrl(currentUrl);
    const { response, dispatcher } = await fetchRemoteUrl(currentUrl, resolvedAddress);

    try {
      const location = response.headers.get("location");
      if (location && response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
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
        await response.body?.cancel();
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
    } finally {
      await dispatcher.close();
    }
  }

  throw new HttpError(
    400,
    "audio_fetch_failed",
    `Remote audio fetch exceeded ${maxRedirects} redirects.`,
  );
};
