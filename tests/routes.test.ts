import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "../src/lib/errors.js";

const {
  authenticateClient,
  authorizeAdmin,
  authorizeRetention,
  recordRequest,
  listUsageForClient,
  listUsageForAdmin,
  fetchRemoteAudio,
  checkRateLimit,
  purgeOldRecords,
} = vi.hoisted(() => ({
  authenticateClient: vi.fn(),
  authorizeAdmin: vi.fn(),
  authorizeRetention: vi.fn(),
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
  authorizeRetention,
}));

vi.mock("../src/lib/env.js", () => ({
  env: {
    openAiApiKey: "sk-test-key",
    databaseUrl: "postgres://localhost:5432/unused",
    serviceAdminKey: "admin-key",
    cronSecret: "cron-key",
    apiKeySalt: "salt",
    modelAllowlist: new Set([
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-4o-transcribe",
      "gpt-4o-mini-transcribe",
      "gpt-4o-transcribe-diarize",
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

    authorizeRetention.mockImplementation((authorizationHeader?: string) => {
      if (!["Bearer admin-key", "Bearer cron-key"].includes(String(authorizationHeader))) {
        throw new HttpError(403, "forbidden", "Admin or cron key is invalid.");
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

  it("returns 400 for malformed JSON request bodies", async () => {
    const res = await request("/v1/llm", {
      method: "POST",
      headers: {
        Authorization: "Bearer client-key",
        "Content-Type": "application/json",
      },
      body: '{"model":"gpt-5.4","input"',
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: {
        code: "invalid_json",
        message: "Request body must be valid JSON.",
        requestId: "req-test-0001",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 400 for schema validation errors", async () => {
    const res = await request("/v1/llm", {
      method: "POST",
      headers: {
        Authorization: "Bearer client-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        input: "Hello",
        stream_options: { include_usage: true },
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("validation_error");
    expect(body.error.message).toBe("stream_options requires stream=true.");
    expect(fetch).not.toHaveBeenCalled();
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
          totalCostUsd: 7.5,
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

  it("allows retention purge through GET with the cron secret", async () => {
    purgeOldRecords.mockResolvedValueOnce(4);

    const res = await request("/v1/admin/retention", {
      headers: { Authorization: "Bearer cron-key" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ purged: 4 });
    expect(authorizeRetention).toHaveBeenCalledWith("Bearer cron-key");
  });

  it("keeps POST retention purge available for admin use", async () => {
    purgeOldRecords.mockResolvedValueOnce(2);

    const res = await request("/v1/admin/retention", {
      method: "POST",
      headers: { Authorization: "Bearer admin-key" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ purged: 2 });
    expect(authorizeAdmin).toHaveBeenCalledWith("Bearer admin-key");
  });

  it("returns 502 when upstream stream body is missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const res = await request("/v1/llm", {
      method: "POST",
      headers: {
        Authorization: "Bearer client-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "gpt-5.4", input: "test", stream: true }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("missing_upstream_stream");
  });

  it("records response.incomplete metadata for incomplete streams", async () => {
    const sseText = [
      "event: response.incomplete",
      'data: {"type":"response.incomplete","response":{"id":"resp_inc","output":[],"usage":{"input_tokens":5,"output_tokens":2,"total_tokens":7},"status_details":{"type":"incomplete","reason":"max_output_tokens"}}}',
      "",
    ].join("\n");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(sseText, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-request-id": "up_inc_1",
        },
      }),
    );

    const res = await request("/v1/llm", {
      method: "POST",
      headers: {
        Authorization: "Bearer client-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "gpt-5.4", input: "Incomplete", stream: true }),
    });

    expect(res.status).toBe(200);
    await res.text();
    await waitForBackgroundWork();

    expect(recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "incomplete",
        errorMessage: "max_output_tokens",
      }),
    );
  });

  it("returns 400 when whisper has neither file nor audio_url", async () => {
    const formData = new FormData();
    formData.set("model", "whisper-1");

    const res = await request("/v1/whisper", {
      method: "POST",
      headers: { Authorization: "Bearer client-key" },
      body: formData,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("missing_audio");
  });

  it("skips non-string form values in whisper forwarding", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ text: "ok" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "audio_skip_1",
        },
      }),
    );

    const formData = new FormData();
    formData.set("model", "whisper-1");
    formData.set("file", new File(["audio"], "clip.wav", { type: "audio/wav" }));
    formData.set("extra_blob", new File(["extra"], "extra.bin"));

    const res = await request("/v1/whisper", {
      method: "POST",
      headers: { Authorization: "Bearer client-key" },
      body: formData,
    });

    expect(res.status).toBe(200);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const forwardedForm = (init as RequestInit).body as FormData;
    expect(forwardedForm.get("extra_blob")).toBeNull();
    expect(forwardedForm.get("model")).toBe("whisper-1");
  });

  it("preserves duplicate-key form fields via append for whisper forwarding", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ text: "diarized" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "audio_dup_1",
        },
      }),
    );

    const formData = new FormData();
    formData.set("model", "gpt-4o-transcribe-diarize");
    formData.set("file", new File(["audio"], "meeting.wav", { type: "audio/wav" }));
    formData.append("known_speaker_names[]", "Alice");
    formData.append("known_speaker_names[]", "Bob");
    formData.set("response_format", "diarized_json");

    const res = await request("/v1/whisper", {
      method: "POST",
      headers: { Authorization: "Bearer client-key" },
      body: formData,
    });

    expect(res.status).toBe(200);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const forwardedForm = (init as RequestInit).body as FormData;
    expect(forwardedForm.getAll("known_speaker_names[]")).toEqual(["Alice", "Bob"]);
    expect(forwardedForm.get("response_format")).toBe("diarized_json");
  });

  it("records response.failed metadata when upstream status is OK but SSE signals failure", async () => {
    const sseText = [
      "event: response.failed",
      'data: {"type":"response.failed","response":{"id":"resp_fail","output":[],"usage":{"input_tokens":3,"output_tokens":0,"total_tokens":3}},"error":{"code":"content_filter","message":"Content was filtered."}}',
      "",
    ].join("\n");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(sseText, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-request-id": "up_fail_ok_1",
        },
      }),
    );

    const res = await request("/v1/llm", {
      method: "POST",
      headers: {
        Authorization: "Bearer client-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "gpt-5.4", input: "Fail me", stream: true }),
    });

    expect(res.status).toBe(200);
    await res.text();
    await waitForBackgroundWork();

    expect(recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "content_filter",
        errorMessage: "Content was filtered.",
      }),
    );
  });

  it("returns 400 when whisper model is missing", async () => {
    const formData = new FormData();
    formData.set("file", new File(["audio"], "clip.wav", { type: "audio/wav" }));

    const res = await request("/v1/whisper", {
      method: "POST",
      headers: { Authorization: "Bearer client-key" },
      body: formData,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("missing_model");
  });

  it("returns error without recording when auth has not been set", async () => {
    authenticateClient.mockRejectedValueOnce(
      new HttpError(401, "invalid_api_key", "API key is invalid."),
    );

    const res = await request("/v1/llm", {
      method: "POST",
      headers: {
        Authorization: "Bearer bad-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "gpt-5.4", input: "test" }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_api_key");
    expect(recordRequest).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown routes", async () => {
    const res = await request("/v1/nonexistent");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toContain("/v1/nonexistent");
  });

  it("streams whisper SSE responses and audits in the background", async () => {
    const sseText = [
      "event: transcript.text.delta",
      'data: {"type":"transcript.text.delta","delta":"Hello "}',
      "",
      "event: transcript.text.done",
      'data: {"type":"transcript.text.done","text":"Hello world"}',
      "",
    ].join("\n");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(sseText, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-request-id": "audio_sse_1",
        },
      }),
    );

    const formData = new FormData();
    formData.set("model", "gpt-4o-mini-transcribe");
    formData.set("file", new File(["audio"], "clip.wav", { type: "audio/wav" }));
    formData.set("stream", "true");
    formData.set("response_format", "text");

    const res = await request("/v1/whisper", {
      method: "POST",
      headers: { Authorization: "Bearer client-key" },
      body: formData,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const body = await res.text();
    expect(body).toContain("transcript.text.done");

    await waitForBackgroundWork();

    expect(recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/v1/whisper",
        model: "gpt-4o-mini-transcribe",
        payload: expect.objectContaining({
          responseSse: expect.stringContaining("transcript.text.done"),
        }),
      }),
    );
  });

  it("returns 502 when whisper upstream stream body is missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const formData = new FormData();
    formData.set("model", "gpt-4o-transcribe");
    formData.set("file", new File(["audio"], "clip.wav", { type: "audio/wav" }));
    formData.set("stream", "true");

    const res = await request("/v1/whisper", {
      method: "POST",
      headers: { Authorization: "Bearer client-key" },
      body: formData,
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("missing_upstream_stream");
  });

  it("logs whisper streamed audit failures instead of leaving an unhandled rejection", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    recordRequest.mockRejectedValueOnce(new Error("db unavailable"));

    const sseText = [
      "event: transcript.text.done",
      'data: {"type":"transcript.text.done","text":"ok"}',
      "",
    ].join("\n");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(sseText, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-request-id": "audio_sse_err_1",
        },
      }),
    );

    const formData = new FormData();
    formData.set("model", "gpt-4o-transcribe");
    formData.set("file", new File(["audio"], "clip.wav", { type: "audio/wav" }));
    formData.set("stream", "true");

    const res = await request("/v1/whisper", {
      method: "POST",
      headers: { Authorization: "Bearer client-key" },
      body: formData,
    });

    expect(res.status).toBe(200);
    await res.text();
    await waitForBackgroundWork();

    expect(stderrSpy).toHaveBeenCalled();
    const logLine = JSON.parse(String(stderrSpy.mock.calls[0][0]));
    expect(logLine).toMatchObject({
      level: "error",
      msg: "Failed to persist streamed whisper request audit.",
      requestId: "req-test-0001",
    });
  });

  it("returns the configured model allowlist from GET /v1/models", async () => {
    const res = await request("/v1/models", {
      headers: { Authorization: "Bearer client-key" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models).toEqual(
      expect.arrayContaining(["gpt-5.4", "gpt-5.4-mini"]),
    );
    expect(authenticateClient).toHaveBeenCalledOnce();
  });

  it("returns 401 from GET /v1/models when not authenticated", async () => {
    authenticateClient.mockRejectedValueOnce(
      new HttpError(401, "invalid_api_key", "API key is invalid."),
    );

    const res = await request("/v1/models", {
      headers: { Authorization: "Bearer bad-key" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_api_key");
  });
});
