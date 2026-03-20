---
description: Perform a release-readiness pass for this service.
agent: reviewer
---

Use [AGENTS.md](../../AGENTS.md), [docs/ai-workflow.md](../../docs/ai-workflow.md), and [README.md](../../README.md).

Release target: ${input:target:Describe the branch, tag, or feature set being prepared}

Check:

1. `npm run check`
2. `npm test`
3. `npm run test:coverage`
4. docs and examples match current behavior
5. CI files, `.gitignore`, and AI workflow files are in a sensible state
6. secrets and local-only files remain excluded from version control

Return:

- release blockers
- non-blocking cleanup items
- exact commands run or still required
