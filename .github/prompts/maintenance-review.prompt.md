---
description: Run a monthly or quarterly maintenance review for this repository, including API and AI/agent drift.
agent: reviewer
---

Use [AGENTS.md](../../AGENTS.md), [README.md](../../README.md), [openapi.yaml](../../openapi.yaml), [docs/ai-workflow.md](../../docs/ai-workflow.md), and [docs/maintenance-cadence.md](../../docs/maintenance-cadence.md).

Cadence: ${input:cadence:Choose monthly or quarterly}

Research requirement:

- For anything that depends on current external state, use internet/web access when available.
- Prefer official documentation, API references, release notes, changelogs, pricing pages, and primary vendor sources.
- If the tool cannot browse the web, state that explicitly in the report and mark the review as partial rather than guessing.

Review:

1. current code vs current docs and examples
2. dependency freshness and outdated packages
3. OpenAI API/model/pricing drift and other external API drift relevant to this service
4. AI/agent implementation fit:
   - request forwarding and validation strategy
   - model allowlist and pricing coverage
   - current use of prompting, tool usage, structured outputs, streaming, and evaluation patterns
5. CI workflow health, coverage reporting, and AI/editor workflow file relevance

Return:

- create or update a dated report in `docs/maintenance-reviews/` named `YYYY-MM-DD-${input:cadence}.md`
- include review date, cadence, scope, sources checked, commands run, findings, required actions, follow-ups, and limitations
- required maintenance actions
- recommended follow-ups and quarterly exploration items
- commands checked or still to run
