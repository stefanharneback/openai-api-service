# OpenAI API Service

Vercel-first TypeScript gateway for OpenAI text and speech-to-text APIs with PostgreSQL-backed request auditing, token accounting, and estimated cost tracking.

## Architecture

```
  Client apps (.NET, TS, curl …)
        │  Bearer <API key>
        ▼
  ┌──────────────────────────────┐
  │  Hono on Vercel Serverless   │
  │  (api/[[...route]].ts)       │
  │                              │
  │  POST /v1/llm ──────────►  OpenAI Responses API
  │  POST /v1/whisper ───────►  OpenAI Audio API
  │  GET  /v1/models             │
  │  GET  /v1/usage              │
  │  GET  /v1/admin/usage        │
  │  GET  /v1/admin/retention    │
  └──────────┬───────────────────┘
             │  record request, usage, cost
             ▼
        PostgreSQL
        (requests · request_usage)
```

Every request is proxied to OpenAI, and the full request/response, token count, and estimated cost are recorded in PostgreSQL. The OpenAI API key stays on the server. The gateway intentionally uses native `fetch` so JSON and SSE payloads can be relayed with minimal transformation.

## What this service does

- Exposes stable HTTP endpoints that any client can call.
- Keeps the OpenAI API key on the server side.
- Supports text generation through the [Responses API](https://platform.openai.com/docs/api-reference/responses).
- Supports speech-to-text through the [Audio API](https://platform.openai.com/docs/api-reference/audio/createTranscription).
- Transparently forwards additional current Responses API fields beyond the gateway's core validation.
- Stores per-request usage, estimated cost, and full prompt/response payloads in PostgreSQL.
- Supports optional application-level AES-256-GCM encryption of stored ledger payloads.
- Applies a per-client 60 requests/minute guard on `/v1/llm` and `/v1/whisper`.

## V1 scope

- Text responses: streaming (SSE) and non-streaming.
- Speech-to-text: upload and URL-based audio.
- Client API-key authentication with SHA-256 hashing.
- PostgreSQL ledger for request, usage, and cost data.
- SSRF-protected URL audio fetch.
- TypeScript and .NET client examples.

## Quick start (local development)

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Docker](https://www.docker.com/) (for PostgreSQL)
- An [OpenAI API key](https://platform.openai.com/api-keys)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd openai-api-service
npm install
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

This starts a PostgreSQL 16 container and automatically applies `db/schema.sql` and `db/seed.sql`. The default credentials are:

| Setting  | Value              |
|----------|--------------------|
| Host     | localhost          |
| Port     | 5432               |
| Database | oais               |
| User     | oais               |
| Password | oais_local_dev     |

### 3. Create a `.env` file

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
OPENAI_API_KEY=sk-your-key-here
DATABASE_URL=postgres://oais:oais_local_dev@localhost:5432/oais
SERVICE_ADMIN_KEY=pick-any-secret-for-admin
CRON_SECRET=optional-secret-for-vercel-cron
API_KEY_SALT=local-dev-salt
RETENTION_DAYS=90
```

### 4. Seed a test API key

```bash
npm run db:seed
```

This prints an API key like `oais_test_abc123...`. Copy it — you'll use it as a Bearer token.

### 5. Start the dev server

```bash
npm run dev
```

### 6. Make your first request

```bash
curl -X POST http://localhost:3000/v1/llm \
  -H "Authorization: Bearer <your-api-key-from-step-4>" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.4-mini","input":"Hello, what is 2+2?","include":["output_text"]}'
```

### 7. Check usage

```bash
curl http://localhost:3000/v1/usage \
  -H "Authorization: Bearer <your-api-key-from-step-4>"
```

## Production deployment

### Database setup

In production, provision a PostgreSQL 16+ instance (e.g. Vercel Postgres, Neon, Supabase, or any managed provider) and apply the schema manually:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

Then seed at least one client API key:

```bash
DATABASE_URL="<production-url>" API_KEY_SALT="<production-salt>" npx tsx db/seed.ts
```

Store the returned key securely — it cannot be retrieved later.

### Vercel environment variables

In the Vercel dashboard under **Settings → Environment Variables**, set:

| Variable               | Notes                                                         |
|------------------------|---------------------------------------------------------------|
| `OPENAI_API_KEY`       | Your production OpenAI key.                                   |
| `DATABASE_URL`         | Connection string for the production PostgreSQL instance.     |
| `SERVICE_ADMIN_KEY`    | A strong random secret for admin endpoints.                   |
| `API_KEY_SALT`         | Must match the salt used when seeding client keys.            |
| `CRON_SECRET`          | Required for the daily retention cron job.                    |
| `LEDGER_ENCRYPTION_KEY`| Recommended — 32-byte key (base64 or hex) for payload encryption. |
| `RETENTION_DAYS`       | Optional, defaults to 90.                                     |

### Monitoring and logs

- **Vercel Logs:** Structured JSON logs (from `src/lib/logger.ts`) are emitted to stderr and appear in the Vercel dashboard under **Deployments → Functions → Logs**. Filter by `level`, `requestId`, or `msg` fields.
- **Database queries:** Use the admin endpoint to inspect usage:
  ```bash
  curl https://your-app.vercel.app/v1/admin/usage?limit=50 \
    -H "Authorization: Bearer $SERVICE_ADMIN_KEY"
  ```
- **Error tracking:** The `onError` handler returns structured `{ error: { code, message, requestId } }` payloads. Correlate errors across logs and the database using `requestId`.

### Pre-go-live checklist

- [ ] `LEDGER_ENCRYPTION_KEY` is set and tested.
- [ ] `CRON_SECRET` is configured and the daily retention cron runs successfully.
- [ ] Database connection is pooled and SSL-enabled.
- [ ] At least one client API key is seeded.
- [ ] `MODEL_ALLOWLIST` restricts models to only those you intend to offer.
- [ ] Verify `GET /health` returns `200` after deployment.

## Running tests

```bash
npm test              # single run
npm run test:watch    # watch mode
npm run test:coverage # with V8 coverage
```

## CI and coverage on GitHub

This repository includes a GitHub Actions workflow at `.github/workflows/ci.yml`.

- It runs on every push, on pull requests targeting `main`, and on manual dispatch.
- It executes `npm run check` and `npm run test:coverage`.
- Each workflow run publishes a coverage summary in the GitHub Actions run summary.
- Each workflow run also uploads the full HTML coverage report as a downloadable artifact.

If you want richer pull request coverage reporting, commit-to-commit coverage tracking, or badges, add a repository secret named `CODECOV_TOKEN`. The workflow will then upload `coverage/lcov.info` to Codecov automatically.

## AI workflow baseline

This repository now includes a layered AI baseline for VS Code, GitHub Copilot, Gemini Code Assist, Codex, and agent-first editors such as Antigravity.

- [AGENTS.md](AGENTS.md) is the primary repository contract.
- [docs/ai-workflow.md](docs/ai-workflow.md) describes the plan -> implement -> verify -> review workflow.
- [docs/maintenance-cadence.md](docs/maintenance-cadence.md) defines the monthly and quarterly maintenance checklist.
- `.github/copilot-instructions.md` provides repository-wide Copilot instructions.
- `.github/instructions/`, `.github/prompts/`, and `.github/agents/` provide reusable file-scoped instructions, prompt files, and custom agents for current VS Code/Copilot workflows.
- `.vscode/mcp.json` and `.vscode/settings.json` provide shared workspace defaults without hardcoding secrets.
- `.aiexclude` keeps generated files, secrets, and local-only artifacts out of Gemini Code Assist context.

## Environment variables

| Variable               | Required | Description                                                   |
|------------------------|----------|---------------------------------------------------------------|
| `OPENAI_API_KEY`       | Yes      | Server-side OpenAI credential.                                |
| `DATABASE_URL`         | Yes      | PostgreSQL connection string.                                 |
| `SERVICE_ADMIN_KEY`    | Yes      | Admin bearer token for `/v1/admin/*` endpoints.               |
| `CRON_SECRET`          | No       | Bearer token accepted by `GET /v1/admin/retention` for Vercel Cron Jobs. |
| `API_KEY_SALT`         | Yes      | Salt used to SHA-256 hash client API keys before DB lookup.   |
| `RETENTION_DAYS`       | No       | Ledger retention window in days (default: 90).                |
| `LEDGER_ENCRYPTION_KEY`| No       | Base64 or hex encoded 32-byte key for AES-256-GCM encryption. |
| `MODEL_ALLOWLIST`      | No       | Comma-separated models enabled by policy.                     |
| `MAX_AUDIO_BYTES`      | No       | Max audio file size (default: 10 MB).                         |
| `MAX_JSON_BODY_BYTES`  | No       | Max JSON body size (default: 256 KB).                         |

## Endpoints

| Method | Path             | Auth          | Description                           |
|--------|------------------|---------------|---------------------------------------|
| GET    | `/health`        | None          | Health check + request ID.            |
| GET    | `/v1/models`     | Client key    | List model IDs allowed by gateway policy. |
| POST   | `/v1/llm`        | Client key    | Proxy to OpenAI Responses API.        |
| POST   | `/v1/whisper`    | Client key    | Proxy to OpenAI Audio API.            |
| GET    | `/v1/usage`      | Client key    | Usage history for the calling client. |
| GET    | `/v1/admin/usage`| Admin key     | Usage history across all clients.     |
| GET    | `/v1/admin/retention`| Admin key or `CRON_SECRET` | Purge expired ledger rows; cron-friendly entrypoint. |
| POST   | `/v1/admin/retention`| Admin key | Purge expired ledger rows manually.   |

See [openapi.yaml](openapi.yaml) for the full API contract including request/response schemas.

`POST /v1/llm` and `POST /v1/whisper` enforce a 60-request-per-minute limit per client key using an in-memory sliding window. Because each Vercel serverless invocation runs in its own isolate, the window is scoped to a single running instance and is not shared across cold starts or concurrent instances.

## Vercel cron

`vercel.json` includes a daily cron job (3:00 AM UTC) that calls `GET /v1/admin/retention` to purge ledger rows older than `RETENTION_DAYS`. To authenticate the cron request, set `CRON_SECRET` in your Vercel project environment variables — the cron job sends this value as a bearer token.

## Responses passthrough policy

`POST /v1/llm` validates the required core request contract (`model`, `input`, body size, and selected high-signal fields such as `stream_options`) and then forwards additional Responses API fields transparently. This keeps the gateway aligned with newer OpenAI request parameters without forcing frequent schema churn.

## Cost estimation coverage

Estimated cost is currently mapped for `gpt-5.4`, `gpt-5.4-mini`, the legacy `gpt-5-mini-2025-08-07` snapshot alias, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, and `gpt-4o-transcribe-diarize`. Requests for other models are still logged, but `total_cost_usd` remains `null` until that model's pricing is mapped explicitly.

## Security note about storing prompts and responses

This repository is configured to store full prompts and full responses by design. That is powerful for debugging and auditing, but it also increases privacy and security exposure. The recommended defaults are:

- Enable `LEDGER_ENCRYPTION_KEY` in production.
- Restrict database access tightly.
- Avoid storing raw audio binaries in PostgreSQL.
- Define a retention policy before going live.

## OpenAI API references

- [Responses API](https://platform.openai.com/docs/api-reference/responses) — used by `POST /v1/llm`
- [Audio transcriptions](https://platform.openai.com/docs/api-reference/audio/createTranscription) — used by `POST /v1/whisper`
- [Models](https://platform.openai.com/docs/models) — for model IDs and capabilities
- [Pricing](https://openai.com/api/pricing/) — source for the server-side cost catalog

## Project structure

```
api/
  [[...route]].ts        Vercel serverless entrypoint
src/
  app.ts                 Hono application and route handlers
  lib/
    auth.ts              API key authentication and admin authorization
    costing.ts           Server-side pricing catalog and cost estimation
    db.ts                PostgreSQL connection singleton
    env.ts               Environment variable parsing and hashing
    errors.ts            Structured HTTP error class
    logger.ts            Zero-dependency structured JSON logger
    openai.ts            OpenAI request helpers
    rateLimit.ts         Per-client sliding-window rate limiter
    repository.ts        PostgreSQL data access (insert / query)
    retention.ts         Ledger data retention and purge logic
    security.ts          AES-256-GCM encryption for stored payloads
    sse.ts               SSE parser for streaming response usage
    types.ts             Shared TypeScript types
    urlFetch.ts          SSRF-protected remote audio fetch
    usage.ts             Token usage extraction from OpenAI payloads
    validation.ts        Zod schemas and policy enforcement
db/
  schema.sql             PostgreSQL schema (auto-applied by Docker)
  seed.sql               Seed data (auto-applied by Docker)
  seed.ts                Interactive seed script for API key generation
tests/                   Vitest unit and integration tests
examples/
  typescript-client/     Minimal TypeScript client example
  dotnet-client/         Minimal .NET client example
.github/
  copilot-instructions.md Repository-wide Copilot instructions
  agents/                Workspace custom agents for planning, implementation, review
  instructions/          Pattern-based instruction files for VS Code/Copilot
  prompts/               Reusable prompt files for common tasks
  workflows/
    ci.yml               GitHub Actions CI for type-check, tests, and coverage
.vscode/
  mcp.json               Shared workspace MCP server configuration
  settings.json          Workspace AI settings for review, commit, and PR generation
  tasks.json             Shared verification tasks
docs/
  ai-workflow.md         Editor-neutral AI and agent workflow guide
  maintenance-cadence.md Monthly and quarterly maintenance checklist
```

## Deployment note for Vercel free tier

This design fits Vercel free tier for moderate development and light usage. The main limitations are request size (4.5 MB), execution time (60 s), cold starts, and throughput. For larger audio and higher concurrency, move to a paid plan or a longer-running host.
