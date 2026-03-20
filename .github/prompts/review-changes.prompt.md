---
description: Review a change set for correctness, regressions, security, and test gaps.
agent: reviewer
---

Use [AGENTS.md](../../AGENTS.md) and [copilot-instructions.md](../copilot-instructions.md).

Review target: ${input:scope:Describe the branch, diff, files, or feature to review}

Review in findings-first order:

1. correctness and behavioral regressions
2. auth, validation, and security issues
3. contract drift between code, tests, README, and `openapi.yaml`
4. missing or weak tests
5. optional modernization ideas

Output:

- severity-ranked findings with exact file references
- open questions or assumptions
- concise summary only after findings
