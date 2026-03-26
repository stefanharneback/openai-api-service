# Cross-Repository Workspace Instructions

This workspace contains three repositories that form a connected system:

## Repository dependency direction

```
openai-api-service  →  openai-service-clients  →  multi-agent-task-solver
(gateway)              (typed clients)              (MAUI task app)
```

- **openai-api-service** is the **source of truth** for the API contract (`openapi.yaml`), authentication, rate limiting, costing, and request routing.
- **openai-service-clients** consumes the gateway's `openapi.yaml` to generate or maintain typed clients (web TS, .NET Core, .NET Web, MAUI).
- **multi-agent-task-solver** consumes the .NET Core client from openai-service-clients and adds task orchestration, agent loop, and MAUI UI.

## Cross-repo change propagation

When a change in one repo affects downstream repos, propagate in this order:

1. **API contract changes** (gateway `openapi.yaml`):
   - Update `openapi.yaml` in openai-service-clients (run `scripts/sync-openapi.ps1` or `.sh`).
   - Update affected client code and tests in openai-service-clients.
   - If the .NET Core client's public API changes, update multi-agent-task-solver's Infrastructure layer.

2. **Pricing/model changes** (gateway `costing.ts` or `env.ts`):
   - Update the pricing catalog in the gateway.
   - If new models are added to the allowlist, clients may need model picker or default updates.
   - Update multi-agent-task-solver's `config/providers/openai.models.json` if the model catalog drifts.

3. **Authentication or security changes**:
   - All three repos treat security as first-class. Never commit secrets.
   - Auth token handling flows from gateway policy through client transport to app UI.

## Shared quality expectations

- All repos enforce type-checking (`tsc --noEmit` for TS, `TreatWarningsAsErrors` for .NET).
- All repos have CI with tests. Don't merge code that breaks any repo's CI.
- CodeQL and dependency-review workflows exist in all repos.
- ESLint + Prettier are enforced in both TypeScript codebases.

## When working across repos

- Read the target repo's `AGENTS.md` before making changes there.
- Run that repo's validation commands (listed in its `AGENTS.md`) before considering work done.
- Keep diffs minimal and aligned with established patterns in each repo.
