# AI Workflow

This repository keeps AI guidance in layered files so the core workflow is editor-neutral and can still be consumed by VS Code, GitHub Copilot, Gemini Code Assist, Codex, and Antigravity.

## Source of truth

- [AGENTS.md](../AGENTS.md): primary repository contract for human and AI contributors
- [README.md](../README.md): project overview, runtime setup, and public examples
- [openapi.yaml](../openapi.yaml): public HTTP contract

Editor-specific files should refine or automate this guidance, not replace it.

## Workspace AI files

- `.github/copilot-instructions.md`: repository-wide Copilot and VS Code chat instructions
- `.github/instructions/*.instructions.md`: pattern-based instructions for backend, API entrypoints, and tests
- `.github/prompts/*.prompt.md`: reusable task prompts for implementation, review, and release checks
- `.github/agents/*.agent.md`: reusable custom agents for planning, implementation, and review
- `.vscode/settings.json`: workspace defaults for Copilot chat workflows
- `.vscode/mcp.json`: shared workspace MCP server configuration
- `.aiexclude`: Gemini Code Assist context exclusion file

## Recommended workflow

### 1. Plan before broad changes

- Use the `planner` agent or the `implement-change` prompt for larger changes.
- Identify which code, tests, docs, and contract files must change together.
- Keep the current V1 service scope unless the task explicitly expands it.

### 2. Implement with verification

- Use the `implementer` agent or the `implement-change` prompt.
- For public behavior changes, update implementation, tests, `openapi.yaml`, README examples, and any affected prompts or agent docs in the same change.
- Run:
  - `npm run check`
  - `npm test`
  - `npm run test:coverage` when tests or contracts changed

### 3. Review before merge

- Use the `reviewer` agent or the `review-changes` prompt.
- Review findings-first: correctness, regressions, security, contract drift, then test gaps.
- Treat stale docs and missing verification as review issues when they hide behavioral risk.

### 4. Release checks

- Use the `release-check` prompt before tagging or merging release-sensitive work.
- Confirm CI remains green and generated artifacts are still excluded from version control.

## Maintenance cadence

- Run a monthly quick pass using [maintenance-cadence.md](maintenance-cadence.md).
- Run a quarterly deeper review of architecture, APIs, libraries, CI, docs, and AI workflow files.
- For a solo project, this is preferred over heavier process such as `CODEOWNERS`.
- The goal is steady evolution, not process for its own sake.

## Gemini Code Assist guidance

- Gemini Code Assist respects `.gitignore` and `.aiexclude` for local context exclusion.
- For code customization, `.aiexclude` is the primary exclusion file.
- Keep secrets, generated artifacts, and local-only Copilot overrides excluded there.

## Antigravity guidance

Antigravity is agent-first and supports planning, artifacts, and multi-agent orchestration well. This repository therefore keeps the canonical workflow in editor-neutral Markdown:

- start from [AGENTS.md](../AGENTS.md)
- use this document for the expected plan -> implement -> verify -> review loop
- treat `.github/*` and `.vscode/*` as adapters for VS Code-family tools, not the only source of truth

That keeps the workflow portable even when different contributors use Codex, Copilot, Gemini, or Antigravity.
