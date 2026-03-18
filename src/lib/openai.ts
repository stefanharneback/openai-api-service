import { env } from "./env.js";

// OpenAI API base URL.
// Responses API: https://platform.openai.com/docs/api-reference/responses
// Audio API:     https://platform.openai.com/docs/api-reference/audio/createTranscription
export const openAiBaseUrl = "https://api.openai.com/v1";

export const buildOpenAiHeaders = (
  contentType?: string,
  extraHeaders?: Record<string, string>,
): Headers => {
  const headers = new Headers({
    Authorization: `Bearer ${env.openAiApiKey}`,
  });

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  Object.entries(extraHeaders ?? {}).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return headers;
};

export const filterHeadersForLedger = (headers: Headers): Record<string, string> => {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "authorization") {
      return;
    }
    result[key] = value;
  });

  return result;
};