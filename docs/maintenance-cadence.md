# Maintenance Cadence

Use this checklist to keep the project current without adding unnecessary process overhead.

## Monthly quick pass

- Run:
  - `npm run check`
  - `npm run lint`
  - `npm run format`
  - `npm test`
  - `npm run test:coverage`
  - `npm outdated`
- Review current OpenAI docs and pricing against:
  - `src/lib/validation.ts`
  - `src/lib/costing.ts`
  - `openapi.yaml`
  - `README.md`
- Review current OpenAI platform changes beyond pricing:
  - request/response fields used by this gateway
  - model capability or deprecation changes
  - API guidance that affects passthrough, validation, streaming, or usage extraction
- Review any other external APIs or platform dependencies used by the service for behavior, auth, or version drift.
- Verify current external changes against official online sources when the reviewing tool supports web access.
- Review GitHub Actions status and whether `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, and `.github/workflows/dependency-review.yml` still reflect current best practice.
- Review AI workflow files:
  - `AGENTS.md`
  - `.github/copilot-instructions.md`
  - `.github/instructions/`
  - `.github/prompts/`
  - `.github/agents/`
  - `.vscode/`
  - `.aiexclude`
- Review whether current AI and agent implementation choices still fit the V1 service goal:
  - transparent forwarding vs added schema maintenance
  - current validation boundaries
  - current prompting/tooling assumptions in docs and examples
- Update anything clearly stale, broken, or needlessly manual.
- Write a dated report in `docs/maintenance-reviews/` so the review is visible, reviewable, and timestamped.

## Quarterly deeper review

- Re-evaluate whether core implementation choices are still the right ones:
  - native `fetch` vs official SDK usage
  - validation strategy
  - costing strategy
  - Vercel/runtime assumptions
- Re-evaluate AI and agent solution patterns for this kind of gateway:
  - whether new OpenAI platform features should remain passthrough-only or become first-class documented behavior
  - whether current examples, prompts, and agent guidance still reflect the best approach for applications built on this gateway
  - whether evaluation, observability, safety, cost, and latency coverage are sufficient
- Revisit the enabled model list, pricing mappings, coverage gaps, and CI setup.
- Review security-sensitive defaults such as logging, retention, encryption, and secret-handling guidance.
- Remove stale prompts, agent files, editor settings, and docs that no longer match how the repo is actually used.
- Capture the outcome in a short changelog note, issue, or maintenance PR summary.
- Write a dated report in `docs/maintenance-reviews/` with sources, findings, actions, and open questions.

## Trigger events

Do not wait for the scheduled cadence if any of these happen sooner:

- major OpenAI API/model/pricing changes
- major VS Code, Copilot, Gemini, Codex, or Antigravity workflow changes
- CI breakage or repeated flaky tests
- dependency security advisories
- significant repo-scope or architecture changes
