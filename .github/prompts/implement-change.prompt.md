---
description: Implement a scoped repository change with tests and docs sync.
agent: implementer
---

Use [AGENTS.md](../../AGENTS.md), [copilot-instructions.md](../copilot-instructions.md), and [docs/ai-workflow.md](../../docs/ai-workflow.md) as the repository contract.

Task: ${input:task:Describe the change to implement}

Workflow:

1. Summarize the requested change, affected subsystems, and risks.
2. Inspect the relevant implementation, tests, OpenAPI, and README sections before editing.
3. Implement the smallest coherent change that satisfies the request.
4. Update or add tests for the changed behavior.
5. Update docs and examples when public behavior changes.
6. Run `npm run check` and `npm test`. Run `npm run test:coverage` if tests or contracts changed.

Deliver:

- concise change summary
- files changed
- verification results
- remaining risks or follow-ups
