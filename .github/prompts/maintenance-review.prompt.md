---
description: Run a monthly or quarterly maintenance review for this repository.
agent: reviewer
---

Use [AGENTS.md](../../AGENTS.md), [docs/ai-workflow.md](../../docs/ai-workflow.md), and [docs/maintenance-cadence.md](../../docs/maintenance-cadence.md).

Cadence: ${input:cadence:Choose monthly or quarterly}

Review:

1. current code vs current docs and examples
2. dependency freshness and outdated packages
3. OpenAI API/model/pricing drift
4. CI workflow health and coverage reporting
5. AI/editor workflow files and prompt relevance

Return:

- required maintenance actions
- recommended follow-ups
- commands checked or still to run
