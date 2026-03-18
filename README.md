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
  │  GET  /v1/usage              │
  │  GET  /v1/admin/usage        │
  └──────────┬───────────────────┘
             │  record request, usage, cost
             ▼
        PostgreSQL
        (requests · request_usage)
```

Every request is proxied to OpenAI, and the full request/response, token count, and estimated cost are recorded in PostgreSQL. The OpenAI API key stays on the server.

## What this service does

- Exposes stable HTTP endpoints that any client can call.
- Keeps the OpenAI API key on the server side.
- Supports text generation through the [Responses API](https://platform.openai.com/docs/api-reference/responses).
- Supports speech-to-text through the [Audio API](https://platform.openai.com/docs/api-reference/audio/createTranscription).
- Stores per-request usage, estimated cost, and full prompt/response payloads in PostgreSQL.
- Supports optional application-level AES-256-GCM encryption of stored ledger payloads.

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
API_KEY_SALT=local-dev-salt
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
  -d '{"model":"gpt-5.4","input":"Hello, what is 2+2?"}'
```

### 7. Check usage

```bash
curl http://localhost:3000/v1/usage \
  -H "Authorization: Bearer <your-api-key-from-step-4>"
```

## Running tests

```bash
npm test              # single run
npm run test:watch    # watch mode
npm run test:coverage # with V8 coverage
```

## Environment variables

| Variable               | Required | Description                                                   |
|------------------------|----------|---------------------------------------------------------------|
| `OPENAI_API_KEY`       | Yes      | Server-side OpenAI credential.                                |
| `DATABASE_URL`         | Yes      | PostgreSQL connection string.                                 |
| `SERVICE_ADMIN_KEY`    | Yes      | Admin bearer token for `/v1/admin/usage`.                     |
| `API_KEY_SALT`         | Yes      | Salt used to SHA-256 hash client API keys before DB lookup.   |
| `LEDGER_ENCRYPTION_KEY`| No       | Base64 or hex encoded 32-byte key for AES-256-GCM encryption. |
| `MODEL_ALLOWLIST`      | No       | Comma-separated models enabled by policy.                     |
| `MAX_AUDIO_BYTES`      | No       | Max audio file size (default: 10 MB).                         |
| `MAX_JSON_BODY_BYTES`  | No       | Max JSON body size (default: 256 KB).                         |

## Endpoints

| Method | Path             | Auth          | Description                           |
|--------|------------------|---------------|---------------------------------------|
| GET    | `/health`        | None          | Health check + request ID.            |
| POST   | `/v1/llm`        | Client key    | Proxy to OpenAI Responses API.        |
| POST   | `/v1/whisper`    | Client key    | Proxy to OpenAI Audio API.            |
| GET    | `/v1/usage`      | Client key    | Usage history for the calling client. |
| GET    | `/v1/admin/usage`| Admin key     | Usage history across all clients.     |

See [openapi.yaml](openapi.yaml) for the full API contract including request/response schemas.

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
    openai.ts            OpenAI request helpers
    repository.ts        PostgreSQL data access (insert / query)
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
```

## Deployment note for Vercel free tier

This design fits Vercel free tier for moderate development and light usage. The main limitations are request size (4.5 MB), execution time (60 s), cold starts, and throughput. For larger audio and higher concurrency, move to a paid plan or a longer-running host.