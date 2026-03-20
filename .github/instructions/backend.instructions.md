---
description: Use these guidelines when editing service and library TypeScript files.
applyTo: src/**/*.ts
---

- Preserve the established Hono route structure and shared helper layering under `src/lib`.
- Centralize env parsing, auth, validation, OpenAI integration, and repository access instead of duplicating logic in route handlers.
- For OpenAI API changes, prefer additive passthrough-compatible validation instead of enumerating every request field unless policy requires a hard allowlist.
- Keep error payloads structured and consistent with `HttpError`.
- When changing externally visible behavior, update `openapi.yaml`, README examples, and matching tests in the same change.
