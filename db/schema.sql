create extension if not exists pgcrypto;

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  key_prefix text not null,
  key_hash text not null unique,
  description text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists api_keys_client_id_idx on api_keys(client_id);

create table if not exists requests (
  id uuid primary key,
  client_id uuid references clients(id) on delete set null,
  api_key_id uuid references api_keys(id) on delete set null,
  endpoint text not null,
  method text not null,
  model text,
  openai_request_id text,
  http_status integer not null,
  upstream_status integer,
  duration_ms integer not null,
  error_code text,
  error_message text,
  audio_bytes integer,
  audio_source text,
  request_headers jsonb not null default '{}'::jsonb,
  response_headers jsonb not null default '{}'::jsonb,
  request_body jsonb,
  response_body jsonb,
  response_text text,
  response_sse text,
  created_at timestamptz not null default now()
);

create index if not exists requests_client_id_created_at_idx on requests(client_id, created_at desc);
create index if not exists requests_model_created_at_idx on requests(model, created_at desc);
create index if not exists requests_openai_request_id_idx on requests(openai_request_id);

create table if not exists request_usage (
  request_id uuid primary key references requests(id) on delete cascade,
  input_tokens integer,
  output_tokens integer,
  cached_input_tokens integer,
  reasoning_tokens integer,
  total_tokens integer,
  input_cost_usd numeric(18, 6),
  output_cost_usd numeric(18, 6),
  cached_input_cost_usd numeric(18, 6),
  total_cost_usd numeric(18, 6),
  pricing_version text
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  request_id uuid references requests(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_client_id_created_at_idx on audit_events(client_id, created_at desc);

comment on table requests is 'Stores full request and response payloads for OpenAI gateway calls. Consider encryption and retention policies before production use.';