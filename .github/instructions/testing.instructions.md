---
description: Use these guidelines when generating or updating tests.
applyTo: tests/**/*.ts
---

- Prefer behavior-driven tests that assert request and response contracts, not implementation trivia.
- Mock external systems cleanly: auth, database access, remote fetches, and OpenAI upstream responses.
- For route tests, cover at least one successful path and the most relevant failure path.
- For helper tests, cover parsing edge cases, forward-compatibility behavior, and null/error handling.
- Keep tests deterministic and fast enough for CI on every push.
