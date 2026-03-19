import { Hono } from "hono";
import { cors } from "hono/cors";

import { authenticateClient, authorizeAdmin } from "./lib/auth.js";
import { estimateCost } from "./lib/costing.js";
import { env, newRequestId } from "./lib/env.js";
import { HttpError, isHttpError } from "./lib/errors.js";
import { buildOpenAiHeaders, filterHeadersForLedger, openAiBaseUrl } from "./lib/openai.js";
import { listUsageForAdmin, listUsageForClient, recordRequest } from "./lib/repository.js";
import { parseResponseSse } from "./lib/sse.js";
import type { LedgerPayload, RequestLogRecord, RequestContextState } from "./lib/types.js";
import { extractResponseText, extractUsage } from "./lib/usage.js";
import { fetchRemoteAudio } from "./lib/urlFetch.js";
import {
  ensureAllowedModel,
  ensureAudioSize,
  ensureJsonBodySize,
  llmBodySchema,
  usageQuerySchema,
} from "./lib/validation.js";

type Variables = {
  state: RequestContextState;
};

const app = new Hono<{ Variables: Variables }>();

const emptyUsage = {
  inputTokens: null,
  outputTokens: null,
  cachedInputTokens: null,
  reasoningTokens: null,
  totalTokens: null,
} as const;

const buildStreamFailure = (
  upstreamOk: boolean,
  terminalEvent: string | null,
  errorCode: string | null,
  errorMessage: string | null,
): { code: string | null; message: string | null } => {
  if (!upstreamOk) {
    return {
      code: errorCode ?? "openai_stream_error",
      message: errorMessage ?? "Streaming request failed.",
    };
  }

  if (terminalEvent === "response.failed") {
    return {
      code: errorCode ?? "openai_stream_failed",
      message: errorMessage ?? "Streaming response failed.",
    };
  }

  if (terminalEvent === "response.incomplete") {
    return {
      code: errorCode ?? "openai_stream_incomplete",
      message: errorMessage ?? "Streaming response ended incomplete.",
    };
  }

  return {
    code: null,
    message: null,
  };
};

app.use("*", cors());

app.use("*", async (c, next) => {
  c.set("state", {
    requestId: newRequestId(),
    startedAt: Date.now(),
    auth: null,
  });
  await next();
});

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "openai-api-service",
    requestId: c.get("state").requestId,
    now: new Date().toISOString(),
  });
});

app.post("/v1/llm", async (c) => {
  const state = c.get("state");
  const auth = await authenticateClient(c.req.header("authorization"));
  state.auth = auth;

  const rawBody = await c.req.text();
  ensureJsonBodySize(rawBody);
  const parsedBody = llmBodySchema.parse(JSON.parse(rawBody));
  ensureAllowedModel(parsedBody.model);

  const upstreamResponse = await fetch(`${openAiBaseUrl}/responses`, {
    method: "POST",
    headers: buildOpenAiHeaders("application/json"),
    body: JSON.stringify(parsedBody),
  });

  const upstreamRequestId = upstreamResponse.headers.get("x-request-id");
  const responseHeaders = filterHeadersForLedger(upstreamResponse.headers);

  if (!parsedBody.stream) {
    const responseJson = await upstreamResponse.json();
    const usage = extractUsage(responseJson);
    const cost = estimateCost(parsedBody.model, usage);

    await recordRequest({
      requestId: state.requestId,
      auth,
      endpoint: "/v1/llm",
      method: "POST",
      model: parsedBody.model,
      openaiRequestId: upstreamRequestId,
      httpStatus: upstreamResponse.status,
      upstreamStatus: upstreamResponse.status,
      durationMs: Date.now() - state.startedAt,
      usage,
      cost,
      payload: {
        requestBody: parsedBody,
        responseBody: responseJson,
        responseText: extractResponseText(responseJson),
        responseSse: null,
        requestHeaders: {},
        responseHeaders,
      },
      errorCode: upstreamResponse.ok ? null : responseJson?.error?.code ?? "openai_error",
      errorMessage: upstreamResponse.ok ? null : responseJson?.error?.message ?? "OpenAI request failed.",
      audioBytes: null,
      audioSource: null,
    });

    return c.json(responseJson, upstreamResponse.status as 200);
  }

  if (!upstreamResponse.body) {
    throw new HttpError(502, "missing_upstream_stream", "Upstream stream was missing.");
  }

  const [clientStream, auditStream] = upstreamResponse.body.tee();
  const sseTextPromise = new Response(auditStream).text();

  void (async () => {
    try {
      const sseText = await sseTextPromise;
      const parsedSse = parseResponseSse(sseText);
      const cost = estimateCost(parsedBody.model, parsedSse.usage);
      const streamFailure = buildStreamFailure(
        upstreamResponse.ok,
        parsedSse.terminalEvent,
        parsedSse.errorCode,
        parsedSse.errorMessage,
      );

      await recordRequest({
        requestId: state.requestId,
        auth,
        endpoint: "/v1/llm",
        method: "POST",
        model: parsedBody.model,
        openaiRequestId: upstreamRequestId,
        httpStatus: upstreamResponse.status,
        upstreamStatus: upstreamResponse.status,
        durationMs: Date.now() - state.startedAt,
        usage: parsedSse.usage,
        cost,
        payload: {
          requestBody: parsedBody,
          responseBody: parsedSse.finalPayload ?? {
            streamed: true,
            terminalEvent: parsedSse.terminalEvent,
          },
          responseText: parsedSse.responseText,
          responseSse: sseText,
          requestHeaders: {},
          responseHeaders,
        },
        errorCode: streamFailure.code,
        errorMessage: streamFailure.message,
        audioBytes: null,
        audioSource: null,
      });
    } catch (error) {
      console.error("Failed to persist streamed request audit.", {
        requestId: state.requestId,
        error,
      });
    }
  })();

  return new Response(clientStream, {
    status: upstreamResponse.status,
    headers: {
      "content-type": upstreamResponse.headers.get("content-type") ?? "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-request-id": state.requestId,
    },
  });
});

app.post("/v1/whisper", async (c) => {
  const state = c.get("state");
  const auth = await authenticateClient(c.req.header("authorization"));
  state.auth = auth;

  const formData = await c.req.formData();
  const model = String(formData.get("model") ?? "");
  if (!model) {
    throw new HttpError(400, "missing_model", "The form field 'model' is required.");
  }

  ensureAllowedModel(model);

  const audioUrl = formData.get("audio_url");
  const uploadFile = formData.get("file");

  let audioBytes: Uint8Array;
  let fileName: string;
  let contentType: string;
  let audioSource: string;

  if (typeof audioUrl === "string" && audioUrl.trim()) {
    const remoteFile = await fetchRemoteAudio(audioUrl);
    audioBytes = remoteFile.bytes;
    fileName = remoteFile.fileName;
    contentType = remoteFile.contentType;
    audioSource = "url";
  } else if (uploadFile instanceof File) {
    audioBytes = new Uint8Array(await uploadFile.arrayBuffer());
    ensureAudioSize(audioBytes.byteLength);
    fileName = uploadFile.name || "audio";
    contentType = uploadFile.type || "application/octet-stream";
    audioSource = "upload";
  } else {
    throw new HttpError(400, "missing_audio", "Provide either 'file' or 'audio_url'.");
  }

  const upstreamForm = new FormData();
  upstreamForm.set(
    "file",
    new File([Buffer.from(audioBytes)], fileName, {
      type: contentType,
    }),
  );

  for (const [key, value] of formData.entries()) {
    if (key === "file" || key === "audio_url") {
      continue;
    }

    if (typeof value === "string") {
      upstreamForm.set(key, value);
    }
  }

  const upstreamResponse = await fetch(`${openAiBaseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: buildOpenAiHeaders(undefined),
    body: upstreamForm,
  });

  const upstreamRequestId = upstreamResponse.headers.get("x-request-id");
  const responseHeaders = filterHeadersForLedger(upstreamResponse.headers);
  const contentTypeHeader = upstreamResponse.headers.get("content-type") ?? "application/json";

  if (contentTypeHeader.includes("application/json")) {
    const responseJson = await upstreamResponse.json();
    const usage = extractUsage(responseJson);
    const cost = estimateCost(model, usage);

    await recordRequest({
      requestId: state.requestId,
      auth,
      endpoint: "/v1/whisper",
      method: "POST",
      model,
      openaiRequestId: upstreamRequestId,
      httpStatus: upstreamResponse.status,
      upstreamStatus: upstreamResponse.status,
      durationMs: Date.now() - state.startedAt,
      usage,
      cost,
      payload: {
        requestBody: Object.fromEntries(formData.entries()),
        responseBody: responseJson,
        responseText: typeof responseJson?.text === "string" ? responseJson.text : null,
        responseSse: null,
        requestHeaders: {},
        responseHeaders,
      },
      errorCode: upstreamResponse.ok ? null : responseJson?.error?.code ?? "openai_error",
      errorMessage: upstreamResponse.ok ? null : responseJson?.error?.message ?? "OpenAI request failed.",
      audioBytes: audioBytes.byteLength,
      audioSource,
    });

    return c.json(responseJson, upstreamResponse.status as 200);
  }

  const responseText = await upstreamResponse.text();

  await recordRequest({
    requestId: state.requestId,
    auth,
    endpoint: "/v1/whisper",
    method: "POST",
    model,
    openaiRequestId: upstreamRequestId,
    httpStatus: upstreamResponse.status,
    upstreamStatus: upstreamResponse.status,
    durationMs: Date.now() - state.startedAt,
    usage: {
      ...emptyUsage,
    },
    cost: null,
    payload: {
      requestBody: Object.fromEntries(formData.entries()),
      responseBody: responseText,
      responseText,
      responseSse: null,
      requestHeaders: {},
      responseHeaders,
    },
    errorCode: upstreamResponse.ok ? null : "openai_error",
    errorMessage: upstreamResponse.ok ? null : responseText,
    audioBytes: audioBytes.byteLength,
    audioSource,
  });

  return c.text(responseText, upstreamResponse.status as 200, {
    "content-type": contentTypeHeader,
  });
});

app.get("/v1/usage", async (c) => {
  const auth = await authenticateClient(c.req.header("authorization"));
  const query = usageQuerySchema.parse(c.req.query());
  const rows = await listUsageForClient(auth.clientId, query.limit, query.offset);

  return c.json({
    clientId: auth.clientId,
    items: rows,
    limit: query.limit,
    offset: query.offset,
  });
});

app.get("/v1/admin/usage", async (c) => {
  authorizeAdmin(c.req.header("authorization"));
  const query = usageQuerySchema.parse(c.req.query());
  const rows = await listUsageForAdmin(query.limit, query.offset);

  return c.json({
    items: rows,
    limit: query.limit,
    offset: query.offset,
  });
});

app.onError(async (error, c) => {
  const state = c.get("state");
  const httpError = isHttpError(error)
    ? error
    : new HttpError(500, "internal_error", "Internal server error.");

  const payload: LedgerPayload = {
    requestBody: null,
    responseBody: {
      error: {
        code: httpError.code,
        message: httpError.message,
      },
    },
    responseText: null,
    responseSse: null,
    requestHeaders: {},
    responseHeaders: {},
  };

  if (state.auth) {
    await recordRequest({
      requestId: state.requestId,
      auth: state.auth,
      endpoint: c.req.path,
      method: c.req.method,
      model: null,
      openaiRequestId: null,
      httpStatus: httpError.status,
      upstreamStatus: null,
      durationMs: Date.now() - state.startedAt,
      usage: {
        ...emptyUsage,
      },
      cost: null,
      payload,
      errorCode: httpError.code,
      errorMessage: httpError.message,
      audioBytes: null,
      audioSource: null,
    });
  }

  return c.json(
    {
      error: {
        code: httpError.code,
        message: httpError.message,
        requestId: state.requestId,
      },
    },
    httpError.status as 400,
  );
});

app.notFound((c) => {
  return c.json(
    {
      error: {
        code: "not_found",
        message: `Route ${c.req.path} was not found.`,
      },
    },
    404,
  );
});

void env;

export default app;
