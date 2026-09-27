-- 005: any number of planning booth tiers per exhibition
--
-- exhibitions.tiers = [{ "name": "ركن مدخل", "price": 200, "count": 6 }, ...]
-- The old booth_tier1..3 columns stay filled with the first three tiers.
-- Additive only — no data is deleted. Safe to run more than once.

alter table public.exhibitions add column if not exists tiers jsonb not null default '[]'::jsonb;

-- Copy the existing three tiers into the new list (only where it is still empty).
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
