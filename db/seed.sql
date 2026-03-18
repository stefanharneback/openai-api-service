-- Seed data for local development.
-- This file is auto-applied by Docker Compose (it runs after schema.sql).
-- It creates a test client only. Use db/seed.ts to generate a hashed API key:
--
--   DATABASE_URL="postgres://oais:oais_local_dev@localhost:5432/oais" API_KEY_SALT="local-dev-salt" npx tsx db/seed.ts

insert into clients (id, name)
values ('a0000000-0000-0000-0000-000000000001', 'Local dev client')
on conflict (id) do nothing;
