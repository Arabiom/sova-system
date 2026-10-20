-- The research employee searches Google Maps through the official Places API. Google's terms allow
-- keeping a place's ID for good, but its other content (name, phone, address) for 30 days at most
-- unless the team confirms or corrects it. So: a prospect found on Maps keeps its place_id and its
-- Maps link; if nobody reviews it within 30 days it is removed automatically. Once the team moves it
-- past «جديد», the details are the team's own.

alter table public.prospects add column if not exists place_id text check (place_id is null or length(place_id) <= 300);
create unique index if not exists prospects_place_id_idx on public.prospects (place_id) where place_id is not null;

alter table public.prospects drop constraint if exists prospects_origin_check;
alter table public.prospects add constraint prospects_origin_check
  check (origin in ('يدوي', 'استيراد', 'البحث اليومي', 'خرائط جوجل'));

-- Remove what came from Google Maps and was never reviewed within 30 days.
create or replace function public.purge_unreviewed_maps()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  delete from public.prospects
   where origin = 'خرائط جوجل' and status = 'جديد' and created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.purge_unreviewed_maps() from public, anon, authenticated;

-- What is known also lists the Maps place IDs, so a place is never fetched twice.
drop function if exists public.known_prospects(text);
create or replace function public.known_prospects(p_token text)
returns table (name text, instagram text, website text, place_id text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.prospect_feed_ok(p_token) then
    raise exception 'bad_token' using errcode = '42501';
  end if;
  return query
    select p.name, p.instagram, p.website, p.place_id from public.prospects p
    union all
    select c.name, lower(regexp_replace(coalesce(c.instagram, ''), '^@', '')), ''::text, null::text from public.clients c;
end;
$$;
grant execute on function public.known_prospects(text) to anon, authenticated;

-- Adding findings: a row with a place_id is a Maps find (origin «خرائط جوجل»); the old Maps
-- finds nobody reviewed are cleared first, every day.
create or replace function public.add_prospects(p_token text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  added int := 0;
  skipped int := 0;
  rejected int := 0;
  over_limit int := 0;
  purged int;
  v_name text;
  v_kind text;
  v_source text;
  v_fit int;
  v_place text;
  room int;
begin
  if not public.prospect_feed_ok(p_token) then
    raise exception 'bad_token' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 50 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  purged := public.purge_unreviewed_maps();
  select greatest(coalesce(s.daily_limit, 20) - (
           select count(*) from public.prospects p
            where p.origin in ('البحث اليومي', 'خرائط جوجل')
              and (p.created_at at time zone 'Asia/Muscat')::date = (now() at time zone 'Asia/Muscat')::date), 0)
    into room
    from public.research_settings s where s.id = 1;
  room := coalesce(room, 20);
  for r in select * from jsonb_array_elements(p_rows) loop
    v_name := btrim(coalesce(r->>'name', ''));
    v_kind := coalesce(nullif(btrim(r->>'kind'), ''), 'عارض محتمل');
    v_source := btrim(coalesce(r->>'source_url', ''));
    v_fit := case when coalesce(r->>'fit', '') ~ '^[1-3]$' then (r->>'fit')::int end;
    v_place := nullif(btrim(coalesce(r->>'place_id', '')), '');
    if v_name = '' or v_source !~* '^https?://' or v_kind not in ('عارض محتمل', 'راعٍ أو شريك', 'موقع أو فعالية', 'أخرى') then
      rejected := rejected + 1;
      continue;
    end if;
    if exists (select 1 from public.prospects p where lower(btrim(p.name)) = lower(v_name) or (v_place is not null and p.place_id = v_place))
       or exists (select 1 from public.clients c where lower(btrim(c.name)) = lower(v_name)) then
      skipped := skipped + 1;
      continue;
    end if;
    if added >= room then
      over_limit := over_limit + 1;
      continue;
    end if;
    begin
      insert into public.prospects (kind, name, category, city, instagram, website, phone, email, source_url, notes, fit, fit_reason, place_id, origin, created_by)
      values (
        v_kind, left(v_name, 200),
        left(btrim(coalesce(r->>'category', '')), 120), left(btrim(coalesce(r->>'city', '')), 80),
        left(btrim(coalesce(r->>'instagram', '')), 120), left(btrim(coalesce(r->>'website', '')), 300),
        left(btrim(coalesce(r->>'phone', '')), 40), left(btrim(coalesce(r->>'email', '')), 200),
        left(v_source, 500), left(btrim(coalesce(r->>'notes', '')), 2000),
        v_fit, left(btrim(coalesce(r->>'fit_reason', '')), 300),
        left(v_place, 300), case when v_place is null then 'البحث اليومي' else 'خرائط جوجل' end, null
      );
      added := added + 1;
    exception when unique_violation then
      skipped := skipped + 1;
    end;
  end loop;
  return jsonb_build_object('added', added, 'skipped', skipped, 'rejected', rejected, 'over_limit', over_limit, 'purged', purged);
end;
$$;
grant execute on function public.add_prospects(text, jsonb) to anon, authenticated;

-- The brief counts Maps finds in the day's limit too.
create or replace function public.research_brief(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.research_settings;
  added_today int;
begin
  if not public.prospect_feed_ok(p_token) then
    raise exception 'bad_token' using errcode = '42501';
  end if;
  select * into s from public.research_settings where id = 1;
  select count(*) into added_today from public.prospects
   where origin in ('البحث اليومي', 'خرائط جوجل') and (created_at at time zone 'Asia/Muscat')::date = (now() at time zone 'Asia/Muscat')::date;
  return jsonb_build_object(
    'focus', coalesce(s.focus, ''),
    'cities', to_jsonb(coalesce(s.cities, '{}')),
    'kinds', to_jsonb(coalesce(s.kinds, '{}')),
    'sectors', to_jsonb(coalesce(s.sectors, '{}')),
    'daily_limit', coalesce(s.daily_limit, 20),
    'remaining_today', greatest(coalesce(s.daily_limit, 20) - added_today, 0),
    'upcoming_exhibitions', coalesce((
      select jsonb_agg(jsonb_build_object('name', e.name, 'city', e.city, 'mall', e.mall, 'date_from', e.date_from, 'date_to', e.date_to) order by e.date_from)
        from public.exhibitions e
       where e.date_to >= (now() at time zone 'Asia/Muscat')::date and e.status not in ('منتهي', 'ملغى')
    ), '[]'::jsonb)
  );
end;
$$;

notify pgrst, 'reload schema';
