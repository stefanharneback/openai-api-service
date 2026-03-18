import { z } from "zod";

import { env } from "./env.js";
import { HttpError } from "./errors.js";

const inputContentSchema = z.union([
  z.string().min(1),
  z.array(z.record(z.any())).min(1),
]);

// Mirrors the fields accepted by the OpenAI Responses API.
// See: https://platform.openai.com/docs/api-reference/responses/create
export const llmBodySchema = z.object({
  model: z.string().min(1),
  input: inputContentSchema,
  instructions: z.string().min(1).optional(),
  reasoning: z.record(z.any()).optional(),
  tools: z.array(z.record(z.any())).optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_output_tokens: z.number().int().positive().max(128000).optional(),
  metadata: z.record(z.string()).optional(),
  stream: z.boolean().optional(),
  text: z.record(z.any()).optional(),
  tool_choice: z.union([z.string(), z.record(z.any())]).optional(),
});

export const usageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ensureAllowedModel = (model: string): void => {
  if (env.modelAllowlist.size > 0 && !env.modelAllowlist.has(model)) {
    throw new HttpError(403, "model_not_allowed", `Model ${model} is not enabled.`);
  }
};

export const ensureJsonBodySize = (rawBody: string): void => {
  if (Buffer.byteLength(rawBody, "utf8") > env.maxJsonBodyBytes) {
    throw new HttpError(413, "body_too_large", "JSON body exceeds configured limit.");
  }
};

export const ensureAudioSize = (size: number): void => {
  if (size > env.maxAudioBytes) {
    throw new HttpError(413, "audio_too_large", "Audio payload exceeds configured limit.");
  }
};