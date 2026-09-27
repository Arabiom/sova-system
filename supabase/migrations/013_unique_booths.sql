-- 013: one participant per site in each exhibition
--
-- A site (booth) number can belong to only one participant in the same exhibition — typed
-- by hand, booked from the site map or brought in by the Excel import. A second participant
-- with the same number is refused with the name of who already holds it. Existing duplicates
-- are left as they are; the app lists them for clean-up.
--
-- Additive only — no data is deleted. Safe to run more than once.

-- "16، 22" / "1–6" / "A-01" → {16,22} / {1,2,3,4,5,6} / {A-01}  (same rule as boothKeys() in the app)
create or replace function public.booth_keys(b text)
returns text[]
language plpgsql
immutable
as $$
declare
  part text;
  m text[];
  keys text[] := '{}';
  i int;
begin
  if b is null or trim(b) in ('', '—', '-') then
    return keys;
  end if;
  foreach part in array regexp_split_to_array(trim(b), '[،,\s]+') loop
    continue when part = '' or part in ('—', '-');
    m := regexp_match(part, '^(\d+)[-–—](\d+)$');
    if m is not null and m[2]::int >= m[1]::int and m[2]::int - m[1]::int <= 500 then
      for i in m[1]::int .. m[2]::int loop
        keys := keys || i::text;
      end loop;
    elsif part ~ '^\d+$' then
      keys := keys || (part::bigint)::text;
    else
      keys := keys || upper(part);
    end if;
  end loop;
  return keys;
end;
$$;

create or replace function public.exhibitors_unique_booth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text[];
  clash record;
begin
  k := public.booth_keys(new.booth);
  if coalesce(array_length(k, 1), 0) = 0 or new.exhibition_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.booth is not distinct from old.booth and new.exhibition_id is not distinct from old.exhibition_id then
    return new;
  end if;
  select e.brand,
         (select string_agg(x, '، ') from unnest(public.booth_keys(e.booth)) x where x = any (k)) as nums
    into clash
    from public.exhibitors e
   where e.exhibition_id = new.exhibition_id
     and e.id <> new.id
     and public.booth_keys(e.booth) && k
   limit 1;
  if found then
    raise exception 'الموقع % محجوز مسبقاً لـ «%» في هذا المعرض — كل موقع لمشارك واحد فقط', clash.nums, clash.brand
      using errcode = 'P0001', hint = 'duplicate_booth';
  end if;
  return new;
end;
$$;

drop trigger if exists exhibitors_unique_booth on public.exhibitors;
create trigger exhibitors_unique_booth
  before insert or update of booth, exhibition_id on public.exhibitors
  for each row execute function public.exhibitors_unique_booth();
