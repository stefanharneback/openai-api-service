---
description: Use these guidelines when editing serverless entrypoints and API boundary files.
applyTo: api/**/*.ts
---

- Keep entrypoints thin and delegate business logic to `src/app.ts` or shared helpers.
- Avoid embedding request validation or persistence logic directly in the entrypoint layer.
- Preserve compatibility with the Vercel deployment model used by this repository.
