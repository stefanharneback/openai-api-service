# Cross-Repository Workspace Instructions

This workspace contains three repositories that form a connected system:

## Repository dependency direction

```
                     →  openai-service-clients
openai-api-service
                     →  multi-agent-task-solver
```

- **openai-api-service** is the **source of truth** for the API contract (`openapi.yaml`), authentication, rate limiting, costing, and request routing.
- **openai-service-clients** consumes the gateway's `openapi.yaml` to generate or maintain typed clients (web TS, .NET Core, .NET Web, MAUI).
- **multi-agent-task-solver** currently integrates directly with `openai-api-service` through its own Infrastructure gateway adapter and adds task orchestration, agent loop, and MAUI UI.

## Cross-repo change propagation

When a change in this repo affects sibling repos, propagate based on the actual integration path:

1. **API contract changes** (gateway `openapi.yaml`):
   - Update `openapi.yaml` in openai-service-clients (run `scripts/sync-openapi.ps1` or `.sh`) when the typed clients should stay in sync.
   - Update affected client code and tests in openai-service-clients.
   - Update multi-agent-task-solver's Infrastructure gateway adapter, request/response mapping, and tests when gateway endpoint paths, request shapes, or response shapes change.

2. **Pricing/model changes** (gateway `costing.ts` or `env.ts`):
   - Update the pricing catalog in the gateway.
   - If new models are added to the allowlist, clients may need model picker or default updates.
   - Update multi-agent-task-solver's `config/providers/openai.models.json` if the model catalog drifts.

3. **Authentication or security changes**:
   - All three repos treat security as first-class. Never commit secrets.
   - Auth token handling may need updates in openai-service-clients transport layers and in multi-agent-task-solver's direct gateway configuration.

## Shared quality expectations

- All repos enforce type-checking (`tsc --noEmit` for TS, `TreatWarningsAsErrors` for .NET).
- All repos have CI with tests. Don't merge code that breaks any repo's CI.
- CodeQL and dependency-review workflows exist in all repos.
- ESLint + Prettier are enforced in both TypeScript codebases.

## When working across repos

- Read the target repo's `AGENTS.md` before making changes there.
- Run that repo's validation commands (listed in its `AGENTS.md`) before considering work done.
- Keep diffs minimal and aligned with established patterns in each repo.
