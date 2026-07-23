-- ── Site-wide settings (single-row) ──────────────────────────────────────────
-- Holds global UI toggles that every visitor reads (e.g. the footer mascot).
-- One row, id = 1, enforced by a check constraint.

create table if not exists public.site_settings (
  id              smallint primary key default 1,
  mascot_enabled  boolean  not null default true,
  mascot_size     smallint not null default 120,   -- rendered width in px (48–320)
  updated_at      timestamptz not null default now(),
  constraint site_settings_singleton check (id = 1)
);

-- Seed the single row if it does not exist yet.
insert into public.site_settings (id, mascot_enabled, mascot_size)
values (1, true, 120)
on conflict (id) do nothing;

-- ── RLS: world-readable, writable only via the service role ───────────────────
-- The mascot config is public UI state, so anyone (even signed-out visitors)
-- may read it. Writes go exclusively through the admin API, which uses the
-- service-role key and bypasses RLS — so no write policy is defined here.
-- NOTE: the USING clause is a plain constant, never a self-select, so this
-- cannot trigger the 42P17 recursion that broke the profiles table.
alter table public.site_settings enable row level security;

drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read
  on public.site_settings
  for select
  using (true);

-- ── Realtime: push changes to every connected visitor instantly ───────────────
alter publication supabase_realtime add table public.site_settings;
