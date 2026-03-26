---
description: Run a monthly or quarterly maintenance review for this repository, including API and AI/agent drift.
agent: reviewer
---

References:

- [AGENTS.md](../../AGENTS.md)
- [README.md](../../README.md)
- [openapi.yaml](../../openapi.yaml)
- [docs/ai-workflow.md](../../docs/ai-workflow.md)
- [docs/maintenance-cadence.md](../../docs/maintenance-cadence.md)

Cadence: ${input:cadence:Choose monthly or quarterly}

## Phase 1 — Run verification commands

Run each command below in a terminal. Record the outcome (pass/fail, counts, versions) for the report.

1. `npm ci`
2. `npm run check`
3. `npm run lint`
4. `npm test`
5. `npm run test:coverage` — record line and branch percentages
6. `npm outdated` — record any outdated packages
7. `npm audit --omit=dev --json` — record vulnerability count
8. `npm audit --json` — record total vulnerability count

## Phase 2 — Gather current state

Read these files and note their current versions or key values:

- `src/lib/costing.ts` — record `pricingCatalogVersion` and the full model list
- `src/lib/env.ts` — record the `MODEL_ALLOWLIST` parsing and default behavior
- `src/lib/validation.ts` — record the model validation strategy
- `openapi.yaml` — record the version and endpoint paths
- `package.json` — record the `version` field
- `.github/workflows/ci.yml` — record the steps and Node version

## Phase 3 — Check for drift

Research requirement: use internet/web access when available. Prefer official docs, API references, release notes, changelogs, and pricing pages. If web access is unavailable, state that explicitly and mark affected checks as partial.

1. **Dependency drift**: compare `npm outdated` output against current stable releases.
2. **OpenAI API drift**: check current official models, pricing, and API fields against this repo's costing catalog, validation logic, and openapi.yaml.
3. **Other external drift**: check Hono, Vercel, and PostgreSQL driver versions against current stable releases.
4. **AI/agent workflow drift**: check whether `.github/prompts/`, `.github/instructions/`, `.github/agents/`, `.vscode/`, and `AGENTS.md` still match current best practices and actual workflows.
5. **CI drift**: check whether `.github/workflows/` steps, actions versions, and Node version are current.

If this is a **quarterly** review, also:

6. Re-evaluate core implementation choices (native fetch vs SDK, validation strategy, costing strategy, Vercel assumptions).
7. Re-evaluate whether new OpenAI platform features should change passthrough-only behavior.
8. Review security-sensitive defaults (logging, retention, secret handling).

## Phase 4 — Check previous reviews

Read the most recent report in `docs/maintenance-reviews/` and check:

- Were all required actions from the previous review completed?
- Are any follow-up items still open?

## Phase 5 — Write the report

Create a file named `docs/maintenance-reviews/YYYY-MM-DD-${input:cadence}.md` with this structure:

```markdown
# Maintenance Review Report

- Date: YYYY-MM-DD
- Cadence: ${input:cadence}
- Repo: openai-api-service
- Reviewer/tool: (your identity)
- Overall outcome: green | amber | red

## Scope

(one-paragraph summary of what this review covers)

## Sources checked

- (list URLs and docs consulted)

## Commands run

- (list each command and its outcome: pass/fail, counts)

## Previous review follow-up

- (status of each action/follow-up from the last review)

## Findings

(numbered list, each with severity, file/area, description, and required action)

## Required maintenance actions

(bulleted list of things that must be done now)

## Recommended follow-ups

(bulleted list of exploration items for next review or next quarter)

## Limitations

- (missing access, partial checks, assumptions)
```

## Checklist

Before finishing, verify:

- [ ] All Phase 1 commands were run and results recorded
- [ ] Key file versions were gathered in Phase 2
- [ ] External drift was checked in Phase 3
- [ ] Previous review follow-ups were checked in Phase 4
- [ ] Report file was created with the correct name and all sections filled
