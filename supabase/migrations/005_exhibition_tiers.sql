-- 005: any number of planning booth tiers per exhibition
--      + make sure every column the app writes exists
--
-- The live database turned out not to have the old booth_tier1..3 columns (the previous app
-- wrote them, but they were never created). Every column the app uses is added here when
-- missing, with the types described in supabase/schema.sql.
--
-- exhibitions.tiers = [{ "name": "ركن مدخل", "price": 200, "count": 6 }, ...]
-- Additive only — no data is deleted. Safe to run more than once.

-- exhibitions
alter table public.exhibitions add column if not exists status text default 'تخطيط';
alter table public.exhibitions add column if not exists notes text default '';
alter table public.exhibitions add column if not exists booths integer default 0;
alter table public.exhibitions add column if not exists booth_price numeric default 0;
alter table public.exhibitions add column if not exists booth_tier1_name text;
alter table public.exhibitions add column if not exists booth_tier1_price numeric;
alter table public.exhibitions add column if not exists booth_tier1_count integer default 0;
alter table public.exhibitions add column if not exists booth_tier2_name text;
alter table public.exhibitions add column if not exists booth_tier2_price numeric;
alter table public.exhibitions add column if not exists booth_tier2_count integer default 0;
alter table public.exhibitions add column if not exists booth_tier3_name text;
alter table public.exhibitions add column if not exists booth_tier3_price numeric;
alter table public.exhibitions add column if not exists booth_tier3_count integer default 0;
alter table public.exhibitions add column if not exists tiers jsonb not null default '[]'::jsonb;

-- exhibitors
alter table public.exhibitors add column if not exists phone text default '';
alter table public.exhibitors add column if not exists email text default '';
alter table public.exhibitors add column if not exists category text default '';
alter table public.exhibitors add column if not exists booth text default '—';
alter table public.exhibitors add column if not exists booth_size text default '';
alter table public.exhibitors add column if not exists contract numeric default 0;
alter table public.exhibitors add column if not exists paid numeric default 0;
alter table public.exhibitors add column if not exists status text default 'مبدئي';
alter table public.exhibitors add column if not exists notes text default '';

-- payments
alter table public.payments add column if not exists method text default 'نقد';
alter table public.payments add column if not exists type text default 'كامل';
alter table public.payments add column if not exists date date;
alter table public.payments add column if not exists note text default '';
alter table public.payments add column if not exists invoice_no text;

-- Copy the old three tiers into the new list (only where it is still empty).
update public.exhibitions
set tiers = (
  select coalesce(jsonb_agg(t order by n), '[]'::jsonb)
  from (
    values
      (1, booth_tier1_name, booth_tier1_price, booth_tier1_count),
      (2, booth_tier2_name, booth_tier2_price, booth_tier2_count),
      (3, booth_tier3_name, booth_tier3_price, booth_tier3_count)
  ) as v(n, name, price, count)
  cross join lateral (select jsonb_build_object('name', coalesce(name, ''), 'price', coalesce(price, 0), 'count', coalesce(count, 0)) as t) x
  where coalesce(count, 0) > 0
)
where tiers = '[]'::jsonb;
