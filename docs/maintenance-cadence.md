# Maintenance Cadence

Use this checklist to keep the project current without adding unnecessary process overhead.

## Monthly quick pass

- Run:
  - `npm run check`
  - `npm test`
  - `npm run test:coverage`
  - `npm outdated`
- Review current OpenAI docs and pricing against:
  - `src/lib/validation.ts`
  - `src/lib/costing.ts`
  - `openapi.yaml`
  - `README.md`
- Review GitHub Actions status and whether `.github/workflows/ci.yml` still reflects current best practice.
- Review AI workflow files:
  - `AGENTS.md`
  - `.github/copilot-instructions.md`
  - `.github/instructions/`
  - `.github/prompts/`
  - `.github/agents/`
  - `.vscode/`
  - `.aiexclude`
- Update anything clearly stale, broken, or needlessly manual.

## Quarterly deeper review

- Re-evaluate whether core implementation choices are still the right ones:
  - native `fetch` vs official SDK usage
  - validation strategy
  - costing strategy
  - Vercel/runtime assumptions
- Revisit the enabled model list, pricing mappings, coverage gaps, and CI setup.
- Review security-sensitive defaults such as logging, retention, encryption, and secret-handling guidance.
- Remove stale prompts, agent files, editor settings, and docs that no longer match how the repo is actually used.
- Capture the outcome in a short changelog note, issue, or maintenance PR summary.

## Trigger events

Do not wait for the scheduled cadence if any of these happen sooner:

- major OpenAI API/model/pricing changes
- major VS Code, Copilot, Gemini, Codex, or Antigravity workflow changes
- CI breakage or repeated flaky tests
- dependency security advisories
- significant repo-scope or architecture changes
