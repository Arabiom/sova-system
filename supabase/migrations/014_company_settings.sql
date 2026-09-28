-- 014: company settings — VAT on or off
--
-- The company is not registered for VAT yet: VAT starts OFF and no amount carries it. Once
-- registered, the manager turns it on (with the VAT registration number) from the staff page
-- and 5% is added across the system from then on.
--
-- Additive only. Safe to run more than once.

create table if not exists public.company_settings (
  id           int primary key default 1 check (id = 1),
  vat_enabled  boolean not null default false,
  vat_number   text not null default '',
  updated_at   timestamptz not null default now()
);

insert into public.company_settings (id) values (1) on conflict (id) do nothing;

alter table public.company_settings enable row level security;

drop policy if exists company_settings_read on public.company_settings;
drop policy if exists company_settings_update on public.company_settings;

create policy company_settings_read on public.company_settings for select using (public.staff_role() is not null);
create policy company_settings_update on public.company_settings for update
  using (public.staff_role() = 'admin') with check (public.staff_role() = 'admin');
