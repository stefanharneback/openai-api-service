import { z } from "zod";

import { env } from "./env.js";
import { HttpError } from "./errors.js";

const inputContentSchema = z.union([z.string().min(1), z.array(z.unknown()).min(1)]);

const unknownObjectSchema = z.record(z.string(), z.unknown());

// Validate the gateway's required core fields but pass through additional
// Responses API fields so the service stays compatible with current releases.
// See: https://developers.openai.com/api/reference/resources/responses/methods/create
export const llmBodySchema = z
  .object({
    model: z.string().min(1),
    input: inputContentSchema,
    instructions: z.string().min(1).optional(),
    background: z.boolean().optional(),
    include: z.array(z.string()).optional(),
    max_tool_calls: z.number().int().positive().optional(),
    metadata: unknownObjectSchema.optional(),
    parallel_tool_calls: z.boolean().optional(),
    previous_response_id: z.string().min(1).optional(),
    prompt: z.unknown().optional(),
    reasoning: unknownObjectSchema.optional(),
    safety_identifier: z.string().max(64).optional(),
    service_tier: z.enum(["auto", "default", "flex", "scale", "priority"]).optional(),
    store: z.boolean().optional(),
    stream: z.boolean().optional(),
    stream_options: unknownObjectSchema.optional(),
    temperature: z.number().min(0).max(2).optional(),
    text: unknownObjectSchema.optional(),
    tool_choice: z.union([z.string(), unknownObjectSchema]).optional(),
    tools: z.array(z.unknown()).optional(),
    top_p: z.number().min(0).max(1).optional(),
    truncation: z.unknown().optional(),
    max_output_tokens: z.number().int().positive().max(128000).optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.stream_options && !value.stream) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "stream_options requires stream=true.",
        path: ["stream_options"],
      });
    }
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
