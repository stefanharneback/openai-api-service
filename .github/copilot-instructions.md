# Copilot Repository Instructions

Use [AGENTS.md](../AGENTS.md) as the primary repository contract and [docs/ai-workflow.md](../docs/ai-workflow.md) as the workflow reference.

- This is a Hono + TypeScript + Vercel gateway with PostgreSQL-backed request auditing.
- Preserve the narrow V1 service shape unless the task explicitly expands scope.
- For OpenAI-facing work, verify current official docs first and keep request passthrough behavior forward-compatible where policy allows.
- When changing contracts in `src/app.ts` or `src/lib/*`, also update `openapi.yaml`, README examples, and tests.
- Prefer focused route-level tests for HTTP behavior and helper-level tests for parsing, validation, SSE, usage, and costing logic.
- Do not commit secrets, API keys, local overrides, or editor-private state.
- Before finishing a code change, run `npm run check` and `npm test`. Run `npm run test:coverage` when tests or public behavior change.
