-- SOVA — migration 002: client database + full exhibition file
--
-- ADDITIVE ONLY: creates new tables and adds nullable columns. No existing row is changed
-- or deleted (except that existing exhibitors are linked to the client records created
-- from them in step 6). Safe to run once in Supabase → SQL Editor. Re-running it is harmless.

-- 1. Clients: every company/brand the business deals with, stored once ---------------------
create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  name          text not null,                 -- brand / business name
  contact_name  text default '',
  phone         text default '',
  whatsapp      text default '',
  email         text default '',
  instagram     text default '',
  sector        text default '',
  city          text default '',
  source        text default '',               -- how we got the client (instagram, referral…)
  status        text not null default 'نشط',    -- نشط | محتمل | متوقف
  notes         text default ''
);

-- 2. Link each exhibition participation (exhibitors row) to its client ----------------------
alter table public.exhibitors
  add column if not exists client_id uuid references public.clients (id) on delete set null;
create index if not exists exhibitors_client_id_idx on public.exhibitors (client_id);

-- 3. Richer exhibition details ---------------------------------------------------------------
alter table public.exhibitions add column if not exists name     text default '';
alter table public.exhibitions add column if not exists address  text default '';
alter table public.exhibitions add column if not exists hours    text default '';
alter table public.exhibitions add column if not exists occasion text default '';

-- 4. Site map: one row per numbered booth, with its tier and price ---------------------------
create table if not exists public.exhibition_sites (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  exhibition_id  uuid not null references public.exhibitions (id) on delete cascade,
  number         integer not null,
  tier           text not null default '',
  price          numeric not null default 0,
  exhibitor_id   uuid references public.exhibitors (id) on delete set null,
  unique (exhibition_id, number)
);
create index if not exists exhibition_sites_exhibition_idx on public.exhibition_sites (exhibition_id);

-- 5. Itemised expenses and sponsors per exhibition -------------------------------------------
create table if not exists public.exhibition_expenses (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  exhibition_id  uuid not null references public.exhibitions (id) on delete cascade,
  item           text not null,
  category       text default '',
  amount         numeric not null default 0,
  due_date       date,
  paid           boolean not null default false,
  notes          text default ''
);
create index if not exists exhibition_expenses_exhibition_idx on public.exhibition_expenses (exhibition_id);

create table if not exists public.exhibition_sponsors (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  exhibition_id  uuid not null references public.exhibitions (id) on delete cascade,
  name           text not null,
  contact_name   text default '',
  phone          text default '',
  amount         numeric not null default 0,
  status         text not null default 'متفق عليه', -- متفق عليه | مدفوع
  notes          text default ''
);
create index if not exists exhibition_sponsors_exhibition_idx on public.exhibition_sponsors (exhibition_id);

-- 6. Build the client list from existing exhibitors (one client per phone, else per brand) ----
insert into public.clients (name, contact_name, phone, email, sector)
select distinct on (coalesce(nullif(e.phone, ''), e.brand))
       e.brand, coalesce(e.manager, ''), coalesce(e.phone, ''), coalesce(e.email, ''), coalesce(e.category, '')
from public.exhibitors e
where e.client_id is null
  and not exists (
    select 1 from public.clients c
    where coalesce(nullif(c.phone, ''), c.name) = coalesce(nullif(e.phone, ''), e.brand)
  )
order by coalesce(nullif(e.phone, ''), e.brand), e.created_at desc;

update public.exhibitors e
set client_id = c.id
from public.clients c
where e.client_id is null
  and coalesce(nullif(c.phone, ''), c.name) = coalesce(nullif(e.phone, ''), e.brand);

-- 7. Internal system: only signed-in staff can read or write the new tables ------------------
alter table public.clients             enable row level security;
alter table public.exhibition_sites    enable row level security;
alter table public.exhibition_expenses enable row level security;
alter table public.exhibition_sponsors enable row level security;

drop policy if exists auth_all_clients on public.clients;
create policy auth_all_clients on public.clients
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists auth_all_exhibition_sites on public.exhibition_sites;
create policy auth_all_exhibition_sites on public.exhibition_sites
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists auth_all_exhibition_expenses on public.exhibition_expenses;
create policy auth_all_exhibition_expenses on public.exhibition_expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists auth_all_exhibition_sponsors on public.exhibition_sponsors;
create policy auth_all_exhibition_sponsors on public.exhibition_sponsors
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
