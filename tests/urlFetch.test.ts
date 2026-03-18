import { describe, it, expect, vi } from "vitest";

// Mock env to avoid requiring real env vars.
vi.mock("../src/lib/env.js", () => ({
  env: {
    maxAudioBytes: 10 * 1024 * 1024,
  },
}));

// Mock DNS at top level (Vitest hoists vi.mock calls regardless of position).
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn().mockResolvedValue([{ address: "10.0.0.1", family: 4 }]),
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
