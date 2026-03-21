import { describe, it, expect, vi } from "vitest";

// Mock env to avoid requiring real env vars.
vi.mock("../src/lib/env.js", () => ({
  env: {
    maxAudioBytes: 10 * 1024 * 1024,
  },
}));

// Capture the mock for DNS so tests can override behavior per-test.
const lookupMock = vi.hoisted(() => vi.fn().mockResolvedValue([{ address: "10.0.0.1", family: 4 }]));
vi.mock("node:dns/promises", () => ({
  lookup: lookupMock,
}));

import { fetchRemoteAudio } from "../src/lib/urlFetch.js";
import { HttpError } from "../src/lib/errors.js";

describe("fetchRemoteAudio — SSRF protection", () => {
  it("rejects non-HTTP protocols", async () => {
    await expect(fetchRemoteAudio("ftp://example.com/audio.wav")).rejects.toThrow(HttpError);
    await expect(fetchRemoteAudio("file:///etc/passwd")).rejects.toThrow(HttpError);
  });

  it("rejects localhost URLs", async () => {
    await expect(fetchRemoteAudio("http://localhost/audio.wav")).rejects.toThrow(HttpError);
    await expect(fetchRemoteAudio("http://127.0.0.1/audio.wav")).rejects.toThrow(HttpError);
  });

  it("rejects invalid URLs", async () => {
    await expect(fetchRemoteAudio("not-a-url")).rejects.toThrow();
  });
});

describe("fetchRemoteAudio — private IP detection", () => {
  it("rejects a URL that resolves to a private IP", async () => {
    await expect(fetchRemoteAudio("https://evil.example.com/audio.wav")).rejects.toThrow(HttpError);
  });
});

describe("fetchRemoteAudio — DNS timeout", () => {
  it("succeeds when DNS resolves to a public IP and fetch returns OK", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);

    const fakeAudio = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(fakeAudio, {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        }),
      ),
    );

    const result = await fetchRemoteAudio("https://example.com/audio.mp3");
    expect(result.contentType).toBe("audio/mpeg");
    expect(result.bytes.byteLength).toBe(4);

    vi.unstubAllGlobals();
  });
});

describe("fetchRemoteAudio — redirects", () => {
  it("follows redirects only after validating the next hop", async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "93.184.216.35", family: 4 }]);

    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: { location: "https://cdn.example.com/final.wav" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { "content-type": "audio/wav" },
          }),
        ),
    );

    const result = await fetchRemoteAudio("https://example.com/audio.wav");
    expect(result.fileName).toBe("final.wav");
    expect(result.contentType).toBe("audio/wav");

    vi.unstubAllGlobals();
  });

  it("rejects redirects to localhost targets", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "http://localhost/internal.wav" },
        }),
      ),
    );

    await expect(fetchRemoteAudio("https://example.com/audio.wav")).rejects.toThrow(HttpError);

    vi.unstubAllGlobals();
  });
});

describe("fetchRemoteAudio — IPv6 private addresses", () => {
  it("rejects fc00::/7 (ULA) addresses", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "fd12::1", family: 6 }]);
    await expect(fetchRemoteAudio("https://evil6.example.com/audio.wav")).rejects.toThrow(HttpError);
  });

  it("rejects ::1 loopback", async () => {
    await expect(fetchRemoteAudio("http://[::1]/audio.wav")).rejects.toThrow(HttpError);
  });
});

describe("fetchRemoteAudio — failed upstream response", () => {
  it("throws when remote server returns non-OK status", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("Not Found", { status: 404 })),
    );

    await expect(fetchRemoteAudio("https://example.com/missing.wav")).rejects.toThrow(
      /status 404/,
    );

    vi.unstubAllGlobals();
  });
});
