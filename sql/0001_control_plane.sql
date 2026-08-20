-- Org control plane (applied to the shared project 2026-08-20; mirrored in
-- trivia-bot-brain/infra/supabase-schema.sql). Daemon-internal tables —
-- service-role only, RLS enabled with no policies.

-- org_flags: the PRD §4 table, realized — remote switches the daemon obeys
-- at run start (kill_switch, paused_agents, daily_budget_usd_override).
create table org_flags (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
alter table org_flags enable row level security;
insert into org_flags (key, value) values
  ('kill_switch', 'false'::jsonb),
  ('paused_agents', '[]'::jsonb),
  ('daily_budget_usd_override', 'null'::jsonb);

-- agent_run_requests: "Run now" from the console; the daemon polls minutely.
create table agent_run_requests (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  requested_by text not null default 'owner',
  status text not null default 'pending' check (status in ('pending','started','done','failed','skipped')),
  run_id uuid,
  created_at timestamptz default now(),
  started_at timestamptz
);
create index on agent_run_requests (status, created_at);
alter table agent_run_requests enable row level security;

-- outbox_records: the daemon's would-do/draft stream mirrored to the DB so
-- the console reads briefs and drafts from anywhere.
create table outbox_records (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  mode text not null,
  action text not null,
  payload jsonb not null default '{}',
  note text,
  reviewed boolean not null default false,
  created_at timestamptz default now()
);
create index on outbox_records (created_at desc);
create index on outbox_records (agent, created_at desc);
alter table outbox_records enable row level security;
