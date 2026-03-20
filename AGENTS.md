# Repository Agents Guide

This repository is a TypeScript service that exposes a narrow OpenAI gateway on top of Hono, Vercel serverless handlers, PostgreSQL ledgering, and Vitest tests.

## Project goals

- Preserve the current V1 scope unless the task explicitly expands it.
- Keep OpenAI-facing behavior aligned with current official docs while avoiding unnecessary product-scope growth.
- Prefer transparent request forwarding plus focused policy validation over brittle hand-maintained request schemas.
- Keep API contracts, tests, README examples, and `openapi.yaml` in sync.

## Working agreement

- Read [README.md](README.md), [openapi.yaml](openapi.yaml), and [docs/ai-workflow.md](docs/ai-workflow.md) before making broad changes.
- Treat this repo as security-sensitive: never hardcode secrets, never commit credentials, and preserve existing SSRF and auth protections.
- Prefer minimal diffs that preserve established patterns in `src/app.ts` and `src/lib/*`.
- When changing request or response behavior, update tests first or in the same change.
- When changing public behavior, also update README examples, OpenAPI, and any impacted prompt or agent docs.
- Keep generated/editor-local state out of version control. Use `.github/copilot/settings.local.json` for personal Copilot CLI overrides.

## Commands

- Install: `npm ci`
- Dev server: `npm run dev`
- Type-check: `npm run check`
- Tests: `npm test`
- Coverage: `npm run test:coverage`
- Seed API key: `npm run db:seed`

## Maintenance cadence

- Run a lightweight maintenance pass at least monthly.
- Run a deeper architecture and tooling review at least quarterly.
- Use [docs/maintenance-cadence.md](docs/maintenance-cadence.md) as the checklist.
- Treat drift in OpenAI docs, pricing, models, CI workflows, AI/editor workflows, and public docs as normal maintenance work, not only as incident-driven work.

## Done criteria

- `npm run check` passes.
- `npm test` passes for code changes.
- `npm run test:coverage` passes when tests or contracts change.
- Docs and examples are updated when behavior changes.
- New AI workflow files remain consistent with this guide.
