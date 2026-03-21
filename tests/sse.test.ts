import { describe, it, expect } from "vitest";
import { parseResponseSse } from "../src/lib/sse.js";

describe("parseResponseSse", () => {
  it("parses a response.completed event and extracts usage", () => {
    const sseText = [
      "event: response.output_text.delta",
      'data: {"type":"response.output_text.delta","delta":"Hello"}',
      "",
      "event: response.output_text.done",
      'data: {"type":"response.output_text.done","text":"Hello world"}',
      "",
      "event: response.completed",
      `data: {"type":"response.completed","response":{"id":"resp_1","output_text":"Hello world","usage":{"input_tokens":10,"output_tokens":5,"total_tokens":15}}}`,
      "",
      "data: [DONE]",
      "",
    ].join("\n");

    const result = parseResponseSse(sseText);
    expect(result.responseText).toBe("Hello world");
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
    expect(result.usage.totalTokens).toBe(15);
    expect(result.terminalEvent).toBe("response.completed");
    expect(result.finalPayload).toBeTruthy();
  });

  it("accumulates multiple output_text.done events", () => {
    const sseText = [
      "event: response.output_text.done",
      'data: {"type":"response.output_text.done","text":"Part A"}',
      "",
      "event: response.output_text.done",
      'data: {"type":"response.output_text.done","text":" Part B"}',
      "",
      "event: response.completed",
      `data: {"type":"response.completed","response":{"id":"resp_2","usage":{"input_tokens":20,"output_tokens":10}}}`,
      "",
    ].join("\n");

    const result = parseResponseSse(sseText);
    expect(result.responseText).toBe("Part A Part B");
  });

  it("returns empty usage for unparseable SSE", () => {
    const result = parseResponseSse("not valid sse at all");
    expect(result.usage.inputTokens).toBeNull();
    expect(result.usage.outputTokens).toBeNull();
    expect(result.responseText).toBeNull();
    expect(result.finalPayload).toBeNull();
  });

  it("handles [DONE] marker", () => {
    const sseText = "data: [DONE]\n\n";
    const result = parseResponseSse(sseText);
    expect(result.finalPayload).toBeNull();
    expect(result.terminalEvent).toBeNull();
  });

  it("falls back to response.completed text if no output_text.done events", () => {
    const sseText = [
      "event: response.completed",
      `data: {"type":"response.completed","response":{"id":"resp_3","output_text":"Directly here","usage":{"input_tokens":5,"output_tokens":2}}}`,
      "",
    ].join("\n");

    const result = parseResponseSse(sseText);
    expect(result.responseText).toBe("Directly here");
    expect(result.usage.inputTokens).toBe(5);
  });

  it("extracts text from response.output_item.done events", () => {
    const sseText = [
      "event: response.output_item.done",
      'data: {"type":"response.output_item.done","item":{"type":"message","content":[{"type":"output_text","text":"Tool-safe output"}]}}',
      "",
      "event: response.completed",
      'data: {"type":"response.completed","response":{"id":"resp_4","usage":{"input_tokens":4,"output_tokens":3}}}',
      "",
    ].join("\n");

    const result = parseResponseSse(sseText);
    expect(result.responseText).toBe("Tool-safe output");
  });

  it("captures failed terminal events and upstream error details", () => {
    const sseText = [
      "event: response.failed",
      'data: {"type":"response.failed","error":{"code":"server_error","message":"Upstream exploded"}}',
      "",
    ].join("\n");

    const result = parseResponseSse(sseText);
    expect(result.terminalEvent).toBe("response.failed");
    expect(result.errorCode).toBe("server_error");
    expect(result.errorMessage).toBe("Upstream exploded");
  });

  it("skips malformed JSON data lines", () => {
    const sseText = [
      "event: response.output_text.delta",
      "data: {not valid json",
      "",
      "event: response.output_text.done",
      'data: {"type":"response.output_text.done","text":"OK"}',
      "",
    ].join("\n");

    const result = parseResponseSse(sseText);
    expect(result.responseText).toBe("OK");
  });

  it("extracts text from response.output_text.delta when no done events", () => {
    const sseText = [
      "event: response.output_text.delta",
      'data: {"type":"response.output_text.delta","delta":"Hello "}',
      "",
      "event: response.output_text.delta",
      'data: {"type":"response.output_text.delta","delta":"world"}',
      "",
    ].join("\n");

    const result = parseResponseSse(sseText);
    expect(result.responseText).toBe("Hello world");
  });

  it("handles response.incomplete terminal event", () => {
    const sseText = [
      "event: response.incomplete",
      'data: {"type":"response.incomplete","response":{"id":"resp_5","status_details":{"type":"max_tokens","reason":"Token limit reached"},"usage":{"input_tokens":100,"output_tokens":50}}}',
      "",
    ].join("\n");

    const result = parseResponseSse(sseText);
    expect(result.terminalEvent).toBe("response.incomplete");
    expect(result.errorCode).toBe("max_tokens");
    expect(result.errorMessage).toBe("Token limit reached");
  });

  it("extracts text from payload.response path in extractTextFromEvent", () => {
    const sseText = [
      "event: response.output_text.done",
      'data: {"type":"response.output_text.done","response":{"output_text":"From inner response"}}',
      "",
    ].join("\n");

    const result = parseResponseSse(sseText);
    expect(result.responseText).toBe("From inner response");
  });
});
