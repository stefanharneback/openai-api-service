import { sql } from "./db.js";
import { maybeEncryptJson } from "./security.js";
import type { RequestLogRecord } from "./types.js";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const asJsonValue = (value: unknown): JsonValue => {
  return value as JsonValue;
};

export const recordRequest = async (record: RequestLogRecord): Promise<void> => {
  await sql.begin(async (tx) => {
    // postgres.js v3: TransactionSql lacks template literal call signatures in its type
    // definitions, but IS callable at runtime. Cast to satisfy the type checker.
    const t = tx as unknown as typeof sql;
    const encryptedRequestBody = asJsonValue(maybeEncryptJson(record.payload.requestBody));
    const encryptedResponseBody = asJsonValue(maybeEncryptJson(record.payload.responseBody));
    await t`
      insert into requests (
        id,
        client_id,
        api_key_id,
        endpoint,
        method,
        model,
        openai_request_id,
        http_status,
        upstream_status,
        duration_ms,
        error_code,
        error_message,
        audio_bytes,
        audio_source,
        request_headers,
        response_headers,
        request_body,
        response_body,
        response_text,
        response_sse
      ) values (
        ${record.requestId},
        ${record.auth?.clientId ?? null},
        ${record.auth?.apiKeyId ?? null},
        ${record.endpoint},
        ${record.method},
        ${record.model},
        ${record.openaiRequestId},
        ${record.httpStatus},
        ${record.upstreamStatus},
        ${record.durationMs},
        ${record.errorCode},
        ${record.errorMessage},
        ${record.audioBytes},
        ${record.audioSource},
          ${t.json(record.payload.requestHeaders)},
          ${t.json(record.payload.responseHeaders)},
          ${t.json(encryptedRequestBody)},
          ${t.json(encryptedResponseBody)},
        ${record.payload.responseText},
        ${record.payload.responseSse}
      )
    `;

    await t`
      insert into request_usage (
        request_id,
        input_tokens,
        output_tokens,
        cached_input_tokens,
        reasoning_tokens,
        total_tokens,
        input_cost_usd,
        output_cost_usd,
        cached_input_cost_usd,
        total_cost_usd,
        pricing_version
      ) values (
        ${record.requestId},
        ${record.usage.inputTokens},
        ${record.usage.outputTokens},
        ${record.usage.cachedInputTokens},
        ${record.usage.reasoningTokens},
        ${record.usage.totalTokens},
        ${record.cost?.inputCostUsd ?? null},
        ${record.cost?.outputCostUsd ?? null},
        ${record.cost?.cachedInputCostUsd ?? null},
        ${record.cost?.totalCostUsd ?? null},
        ${record.cost?.pricingVersion ?? null}
      )
    `;
  });
};

export const listUsageForClient = async (clientId: string, limit: number, offset: number) => {
  return sql`
    select
      r.id,
      r.created_at,
      r.endpoint,
      r.model,
      r.http_status,
      r.duration_ms,
      u.input_tokens,
      u.output_tokens,
      u.total_tokens,
      u.total_cost_usd
    from requests r
    left join request_usage u on u.request_id = r.id
    where r.client_id = ${clientId}
    order by r.created_at desc
    limit ${limit}
    offset ${offset}
  `;
};

export const listUsageForAdmin = async (limit: number, offset: number) => {
  return sql`
    select
      r.id,
      r.created_at,
      r.client_id,
      r.endpoint,
      r.model,
      r.http_status,
      r.duration_ms,
      u.input_tokens,
      u.output_tokens,
      u.total_tokens,
      u.total_cost_usd
    from requests r
    left join request_usage u on u.request_id = r.id
    order by r.created_at desc
    limit ${limit}
    offset ${offset}
  `;
};
