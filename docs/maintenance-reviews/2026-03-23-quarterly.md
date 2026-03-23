# Maintenance Review Report

- Date: 2026-03-23
- Cadence: quarterly
- Repo: openai-api-service
- Reviewer/tool: Codex (GPT-5)
- Overall outcome: amber

## Scope

Quarterly review of gateway architecture, OpenAI contract drift, AI/agent implementation fit, security-sensitive defaults, and workflow/tooling direction.

## Sources checked

- https://platform.openai.com/docs/api-reference/responses
- https://platform.openai.com/docs/api-reference/audio/createTranscription
- https://platform.openai.com/docs/models
- https://openai.com/api/pricing/

## Commands run

- All commands from the monthly review
- Local source inspection of `src/lib/validation.ts`, `src/lib/costing.ts`, `openapi.yaml`, `README.md`, `.github/workflows/ci.yml`, and `.github/*` workflow files

## Findings

1. The current passthrough-first gateway architecture is still the right high-level choice.
   - The official Responses API now covers a broad and fast-moving surface, including built-in tools, MCP tools, function calling, prompt templates, prompt caching, conversations, and structured output controls.
   - Given that surface area, this repo's choice to validate a narrow core and pass through additional fields remains defensible and still aligns with the repository goals.

2. The public contract has drifted from the current Responses reference in a few specific places.
   - `service_tier` in `src/lib/validation.ts` and `openapi.yaml` still allows `scale`, but the current Responses reference documents `auto`, `default`, `flex`, and `priority`.
   - `openapi.yaml` documents `prompt_cache_retention` as an object-style configuration, but the current Responses reference defines it as a string and gives `24h` as the documented retention value.
   - `openapi.yaml` includes `context_management`, which was not found in the current official Responses reference during this review.
   - Impact: generated clients and human readers can be misled even though the runtime mostly passes unknown fields through.

3. Costing and model documentation should be expanded, not narrowed.
   - The current official model guide lists `gpt-5.4`, `gpt-5.4-mini`, and `gpt-5.4-nano`.
   - This repo documents and prices the first two, plus a legacy `gpt-5-mini-2025-08-07` snapshot alias, but does not yet cover `gpt-5.4-nano`.
   - Impact: the repo is not badly out of date, but it is incomplete against the current frontier model family.

4. CI and verification remain healthy and proportionate.
   - Coverage is high.
   - The workflow already publishes a coverage summary and artifact.
   - For a narrow V1 gateway, the current CI shape is adequate.

5. The current risk is contract precision, not architecture sprawl.
   - The deeper quarterly issue is not that the gateway should become schema-heavy.
   - The issue is that README/OpenAPI examples need tighter precision around the fields they do choose to describe explicitly.

## Required maintenance actions

- Remove or verify `scale` in the public `service_tier` contract based on the current official Responses API reference.
- Correct `prompt_cache_retention` in `openapi.yaml` to match the current documented type and semantics.
- Review `context_management` and either remove it from explicit docs or re-add it with a source-backed explanation if it is still intentionally supported.

## Recommended follow-ups

- Add `gpt-5.4-nano` to the costing/docs matrix if the service is expected to support current frontier variants explicitly.
- Clarify in README/OpenAPI that built-in tools, MCP tools, and other current Responses fields are forwarded where policy allows, even if only a subset is called out in the schema text.

## Limitations

- This review did not exercise live upstream calls against OpenAI.
- External research was limited to official sources.
