---
description: Propagate a change from this gateway repo to sibling consumer repos (openai-service-clients, multi-agent-task-solver).
---

References:

- [AGENTS.md](../../AGENTS.md)
- [.github/instructions/cross-repo.instructions.md](../instructions/cross-repo.instructions.md)
- [openapi.yaml](../../openapi.yaml)
- [src/lib/costing.ts](../../src/lib/costing.ts)
- [src/lib/env.ts](../../src/lib/env.ts)

Change description: ${input:change:Describe the change made in this repo}

## Dependency direction

```
                     →  openai-service-clients
openai-api-service
                     →  multi-agent-task-solver
(this repo)            (typed clients)             (MAUI task app)
```

## Step 1 — Classify the change

Determine which categories the change falls into:

- **API contract change**: endpoints, request/response shapes, or `openapi.yaml` changes
- **Pricing/model change**: `src/lib/costing.ts` models or pricing, or `MODEL_ALLOWLIST` in `src/lib/env.ts`
- **Auth/security change**: authentication flow, rate limiting, or security policy changes
- **Documentation-only change**: README, examples, or workflow files

## Step 2 — Determine propagation scope

Based on the classification:

### API contract changes

1. In **multi-agent-task-solver**:
   - Update `src/MultiAgentTaskSolver.Infrastructure/` to match the current gateway contract
   - Update `Gateway/OpenAiGatewayAdapter.cs` if endpoint paths or request or response handling changed
   - Update tests
   - Run: `dotnet build MultiAgentTaskSolver.sln && dotnet test MultiAgentTaskSolver.sln --no-build`

2. In **openai-service-clients** when the typed clients should stay aligned:
   - Run `scripts/sync-openapi.ps1` (or `scripts/sync-openapi.sh`) to sync the updated `openapi.yaml`
   - Update `dotnet/src/Core/GatewayClient.cs` if endpoint paths or signatures changed
   - Update `web/src/api/client.ts` if endpoint paths or signatures changed
   - Update tests in both stacks
   - Run validation: `npm --prefix web run check && npm --prefix web test && dotnet test dotnet/tests/Core.Tests/OpenAiServiceClients.Core.Tests.csproj`

### Pricing/model changes

1. In **multi-agent-task-solver**:
   - Update `config/providers/openai.models.json` to reflect new models or removed models
   - Each model entry needs: `modelId`, `displayName`, `description`, `capabilities`, and optionally `contextWindowTokens`
   - Run: `dotnet build MultiAgentTaskSolver.sln && dotnet test MultiAgentTaskSolver.sln --no-build`

2. In **openai-service-clients** when applicable:
   - Check if model picker defaults or display lists need updates
   - Update tests if model validation behavior changed

### Auth/security changes

1. In **multi-agent-task-solver**: update Infrastructure auth configuration and any direct gateway request handling
2. In **openai-service-clients** when applicable: update auth token handling in transport layers

## Step 3 — Validate each repo

Before considering propagation complete, run each affected repo's validation commands (see its `AGENTS.md`).

## Step 4 — Report

Summarize:
- What changed in this repo
- What was propagated to each affected repo
- What validation commands passed
- Any follow-ups or manual steps remaining
