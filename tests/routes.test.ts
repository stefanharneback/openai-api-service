import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "../src/lib/errors.js";

const {
  authenticateClient,
  authorizeAdmin,
  recordRequest,
  listUsageForClient,
  listUsageForAdmin,
  fetchRemoteAudio,
  checkRateLimit,
  purgeOldRecords,
} = vi.hoisted(() => ({
  authenticateClient: vi.fn(),
  authorizeAdmin: vi.fn(),
  recordRequest: vi.fn(),
  listUsageForClient: vi.fn(),
  listUsageForAdmin: vi.fn(),
  fetchRemoteAudio: vi.fn(),
  checkRateLimit: vi.fn(),
  purgeOldRecords: vi.fn(),
}));

vi.mock("../src/lib/auth.js", () => ({
  authenticateClient,
  authorizeAdmin,
}));

vi.mock("../src/lib/env.js", () => ({
  env: {
    openAiApiKey: "sk-test-key",
    databaseUrl: "postgres://localhost:5432/unused",
    serviceAdminKey: "admin-key",
    apiKeySalt: "salt",
    modelAllowlist: new Set([
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-4o-transcribe",
      "gpt-4o-mini-transcribe",
      "whisper-1",
    ]),
    maxAudioBytes: 10 * 1024 * 1024,
    maxJsonBodyBytes: 256 * 1024,
    ledgerEncryptionKey: null,
  },
  hashApiKey: (key: string) => `hashed_${key}`,
  newRequestId: () => "req-test-0001",
}));

vi.mock("../src/lib/repository.js", () => ({
  recordRequest,
  listUsageForClient,
  listUsageForAdmin,
}));

vi.mock("../src/lib/urlFetch.js", () => ({
  fetchRemoteAudio,
}));

vi.mock("../src/lib/rateLimit.js", () => ({
  checkRateLimit,
}));

vi.mock("../src/lib/retention.js", () => ({
  purgeOldRecords,
}));

import app from "../src/app.js";

const request = (path: string, init?: RequestInit) => {
  return app.request(path, init);
};

const waitForBackgroundWork = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("route success paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());

    authenticateClient.mockResolvedValue({
      clientId: "client-1",
      apiKeyId: "key-1",
      keyPrefix: "oais_test",
    });

    authorizeAdmin.mockImplementation((authorizationHeader?: string) => {
      if (authorizationHeader !== "Bearer admin-key") {
        throw new HttpError(403, "forbidden", "Admin key is invalid.");
      }
    });

    recordRequest.mockResolvedValue(undefined);
    listUsageForClient.mockResolvedValue([]);
    listUsageForAdmin.mockResolvedValue([]);
    checkRateLimit.mockReturnValue({ remaining: 59 });
    purgeOldRecords.mockResolvedValue(0);
    fetchRemoteAudio.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "remote.wav",
      contentType: "audio/wav",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("proxies a JSON /v1/llm response and forwards current Responses fields", async () => {
    const upstreamPayload = {
      id: "resp_1",
      output_text: "Hello world",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
      },
    };

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(upstreamPayload), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "up_req_1",
        },
      }),
    );

    const res = await request("/v1/llm", {
      method: "POST",
      headers: {
        Authorization: "Bearer client-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        input: "Hello",
        background: true,
        include: ["output_text"],
        stream: false,
        stream_options: undefined,
        top_p: 0.3,
        service_tier: "flex",
        conversation: "conv_123",
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(upstreamPayload);
    expect(fetch).toHaveBeenCalledTimes(1);

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const forwardedBody = JSON.parse(String((init as RequestInit).body));
    expect(forwardedBody).toMatchObject({
      model: "gpt-5.4",
      input: "Hello",
      background: true,
      include: ["output_text"],
      top_p: 0.3,
      service_tier: "flex",
      conversation: "conv_123",
    });

    expect(recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/v1/llm",
        model: "gpt-5.4",
        errorCode: null,
        payload: expect.objectContaining({
          responseText: "Hello world",
        }),
      }),
    );
  });

  it("persists streamed /v1/llm responses with terminal event metadata", async () => {
    const sseText = [
      "event: response.output_item.done",
      'data: {"type":"response.output_item.done","item":{"type":"message","content":[{"type":"output_text","text":"Hello from stream"}]}}',
      "",
      "event: response.completed",
      'data: {"type":"response.completed","response":{"id":"resp_stream","output":[{"type":"message","content":[{"type":"output_text","text":"Hello from stream"}]}],"usage":{"input_tokens":11,"output_tokens":7,"total_tokens":18}}}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(sseText, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-request-id": "up_stream_1",
        },
      }),
    );

    const res = await request("/v1/llm", {
      method: "POST",
      headers: {
        Authorization: "Bearer client-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        input: "Stream please",
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("response.completed");

    await waitForBackgroundWork();

    expect(recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/v1/llm",
        model: "gpt-5.4-mini",
        errorCode: null,
        usage: expect.objectContaining({
          inputTokens: 11,
          outputTokens: 7,
          totalTokens: 18,
        }),
        payload: expect.objectContaining({
          responseText: "Hello from stream",
        }),
      }),
    );
  });

  it("logs streamed audit failures instead of leaving an unhandled rejection", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    recordRequest.mockRejectedValueOnce(new Error("db unavailable"));

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        [
          "event: response.failed",
          'data: {"type":"response.failed","error":{"code":"server_error","message":"Upstream failed"}}',
          "",
        ].join("\n"),
        {
          status: 500,
          headers: {
            "content-type": "text/event-stream",
            "x-request-id": "up_stream_2",
          },
        },
      ),
    );

    const res = await request("/v1/llm", {
      method: "POST",
      headers: {
        Authorization: "Bearer client-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        input: "Hello",
        stream: true,
      }),
    });

    expect(res.status).toBe(500);
    await res.text();
    await waitForBackgroundWork();

    expect(stderrSpy).toHaveBeenCalled();
    const logLine = JSON.parse(String(stderrSpy.mock.calls[0][0]));
    expect(logLine).toMatchObject({
      level: "error",
      msg: "Failed to persist streamed request audit.",
      requestId: "req-test-0001",
    });
  });

  it("proxies /v1/whisper uploads and records supported transcription cost", async () => {
    const upstreamPayload = {
      text: "transcribed text",
      usage: {
        input_tokens: 1_000_000,
        output_tokens: 500_000,
      },
    };

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(upstreamPayload), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "audio_req_1",
        },
      }),
    );

    const formData = new FormData();
    formData.set("model", "gpt-4o-transcribe");
    formData.set("file", new File(["audio"], "clip.wav", { type: "audio/wav" }));

    const res = await request("/v1/whisper", {
      method: "POST",
      headers: {
        Authorization: "Bearer client-key",
      },
      body: formData,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(upstreamPayload);

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const forwardedForm = (init as RequestInit).body as FormData;
    expect(forwardedForm.get("model")).toBe("gpt-4o-transcribe");

    expect(recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/v1/whisper",
        model: "gpt-4o-transcribe",
        cost: expect.objectContaining({
          totalCostUsd: 11,
        }),
      }),
    );
  });

  it("returns client usage from /v1/usage", async () => {
    listUsageForClient.mockResolvedValueOnce([
      {
        id: "req_1",
        endpoint: "/v1/llm",
        model: "gpt-5.4",
      },
    ]);

    const res = await request("/v1/usage?limit=1&offset=2", {
      headers: {
        Authorization: "Bearer client-key",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      clientId: "client-1",
      items: [
        {
          id: "req_1",
          endpoint: "/v1/llm",
          model: "gpt-5.4",
        },
      ],
      limit: 1,
      offset: 2,
    });
  });

  it("handles non-JSON whisper responses (plain text transcription)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Hello, this is a transcription.", {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "x-request-id": "audio_txt_1",
        },
      }),
    );

    const formData = new FormData();
    formData.set("model", "whisper-1");
    formData.set("file", new File(["audio"], "clip.wav", { type: "audio/wav" }));
    formData.set("response_format", "text");

    const res = await request("/v1/whisper", {
      method: "POST",
      headers: { Authorization: "Bearer client-key" },
      body: formData,
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Hello, this is a transcription.");
    await waitForBackgroundWork();

    expect(recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/v1/whisper",
        model: "whisper-1",
        payload: expect.objectContaining({
          responseText: "Hello, this is a transcription.",
        }),
      }),
    );
  });

  it("handles OpenAI error responses from /v1/llm (non-streaming)", async () => {
    const errorPayload = {
      error: {
        code: "model_not_found",
        message: "The model does not exist.",
      },
    };

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(errorPayload), {
        status: 404,
        headers: {
          "content-type": "application/json",
          "x-request-id": "up_err_1",
        },
      }),
    );

    const res = await request("/v1/llm", {
      method: "POST",
      headers: {
        Authorization: "Bearer client-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "gpt-5.4", input: "test" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("model_not_found");

    expect(recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        httpStatus: 404,
        errorCode: "model_not_found",
        errorMessage: "The model does not exist.",
      }),
    );
  });

  it("proxies /v1/whisper via audio_url using fetchRemoteAudio", async () => {
    const upstreamPayload = { text: "remote transcribed" };

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(upstreamPayload), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "audio_url_1",
        },
      }),
    );

    const formData = new FormData();
    formData.set("model", "whisper-1");
    formData.set("audio_url", "https://example.com/audio.mp3");

    const res = await request("/v1/whisper", {
      method: "POST",
      headers: { Authorization: "Bearer client-key" },
      body: formData,
    });

    expect(res.status).toBe(200);
    expect(fetchRemoteAudio).toHaveBeenCalledWith("https://example.com/audio.mp3");
  });

  it("returns admin usage from /v1/admin/usage", async () => {
    listUsageForAdmin.mockResolvedValueOnce([
      { id: "req_a1", endpoint: "/v1/llm", model: "gpt-5.4" },
    ]);

    const res = await request("/v1/admin/usage?limit=5&offset=0", {
      headers: { Authorization: "Bearer admin-key" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.limit).toBe(5);
    expect(body.offset).toBe(0);
  });
});
