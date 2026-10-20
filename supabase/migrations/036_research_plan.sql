-- The research employee, developed: a plan the admin sets (focus, cities, kinds, sectors, daily
-- limit), the upcoming exhibitions it searches for, a fit rating on every prospect, a «غير مناسب»
-- status that keeps a rejected name from coming back, and a log of every daily run.

-- 1. Prospects: how well each fits, and why --------------------------------------------------
alter table public.prospects add column if not exists fit smallint check (fit between 1 and 3);
alter table public.prospects add column if not exists fit_reason text not null default '' check (length(fit_reason) <= 300);

alter table public.prospects drop constraint if exists prospects_status_check;
alter table public.prospects add constraint prospects_status_check
  check (status in ('جديد', 'تم التحقق', 'تم التواصل', 'مهتم', 'غير مهتم', 'غير مناسب', 'أصبح عميلاً'));

-- 2. The research plan (one row) ------------------------------------------------------------
create table if not exists public.research_settings (
  id           int primary key default 1 check (id = 1),
  focus        text not null default '' check (length(focus) <= 1000),
  cities       text[] not null default '{}',
  kinds        text[] not null default '{}',
  sectors      text[] not null default '{}',
  daily_limit  int not null default 20 check (daily_limit between 1 and 30),
  updated_at   timestamptz not null default now(),
  updated_by   uuid default auth.uid()
);
insert into public.research_settings (id) values (1) on conflict (id) do nothing;

alter table public.research_settings enable row level security;
drop policy if exists research_settings_read on public.research_settings;
drop policy if exists research_settings_update on public.research_settings;
create policy research_settings_read on public.research_settings for select using (public.staff_role() is not null);
create policy research_settings_update on public.research_settings for update
  using (public.staff_role() = 'admin') with check (public.staff_role() = 'admin');
grant select, update on public.research_settings to authenticated;

create or replace function public.research_settings_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
drop trigger if exists research_settings_touch on public.research_settings;
create trigger research_settings_touch before update on public.research_settings
  for each row execute function public.research_settings_touch();

-- 3. The log of daily runs ------------------------------------------------------------------
create table if not exists public.research_runs (
  id        uuid primary key default gen_random_uuid(),
  run_at    timestamptz not null default now(),
  added     int not null default 0,
  skipped   int not null default 0,
  rejected  int not null default 0,
  focus     text not null default '' check (length(focus) <= 300),
  summary   text not null default '' check (length(summary) <= 2000)
);
create index if not exists research_runs_at_idx on public.research_runs (run_at desc);
alter table public.research_runs enable row level security;
drop policy if exists research_runs_read on public.research_runs;
drop policy if exists research_runs_delete on public.research_runs;
create policy research_runs_read on public.research_runs for select using (public.staff_role() is not null);
create policy research_runs_delete on public.research_runs for delete using (public.staff_role() = 'admin');
grant select, delete on public.research_runs to authenticated;

-- 4. What the daily research reads before it starts -----------------------------------------
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
   where origin = 'البحث اليومي' and (created_at at time zone 'Asia/Muscat')::date = (now() at time zone 'Asia/Muscat')::date;
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

-- 5. A run reports what it did ---------------------------------------------------------------
create or replace function public.log_research_run(p_token text, p_run jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.prospect_feed_ok(p_token) then
    raise exception 'bad_token' using errcode = '42501';
  end if;
  if (select count(*) from public.research_runs where run_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  insert into public.research_runs (added, skipped, rejected, focus, summary)
  values (
    greatest(least(coalesce((p_run->>'added')::int, 0), 1000), 0),
    greatest(least(coalesce((p_run->>'skipped')::int, 0), 1000), 0),
    greatest(least(coalesce((p_run->>'rejected')::int, 0), 1000), 0),
    left(btrim(coalesce(p_run->>'focus', '')), 300),
    left(btrim(coalesce(p_run->>'summary', '')), 2000)
  );
end;
$$;

-- 6. Adding findings: now with a fit rating, and never past the day's limit -------------------
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
  v_name text;
  v_kind text;
  v_source text;
  v_fit int;
  room int;
begin
  if not public.prospect_feed_ok(p_token) then
    raise exception 'bad_token' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 50 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  select greatest(coalesce(s.daily_limit, 20) - (
           select count(*) from public.prospects p
            where p.origin = 'البحث اليومي'
              and (p.created_at at time zone 'Asia/Muscat')::date = (now() at time zone 'Asia/Muscat')::date), 0)
    into room
    from public.research_settings s where s.id = 1;
  room := coalesce(room, 20);
  for r in select * from jsonb_array_elements(p_rows) loop
    v_name := btrim(coalesce(r->>'name', ''));
    v_kind := coalesce(nullif(btrim(r->>'kind'), ''), 'عارض محتمل');
    v_source := btrim(coalesce(r->>'source_url', ''));
    v_fit := case when coalesce(r->>'fit', '') ~ '^[1-3]$' then (r->>'fit')::int end;
    if v_name = '' or v_source !~* '^https?://' or v_kind not in ('عارض محتمل', 'راعٍ أو شريك', 'موقع أو فعالية', 'أخرى') then
      rejected := rejected + 1;
      continue;
    end if;
    if exists (select 1 from public.prospects p where lower(btrim(p.name)) = lower(v_name))
       or exists (select 1 from public.clients c where lower(btrim(c.name)) = lower(v_name)) then
      skipped := skipped + 1;
      continue;
    end if;
    if added >= room then
      over_limit := over_limit + 1;
      continue;
    end if;
    begin
      insert into public.prospects (kind, name, category, city, instagram, website, phone, email, source_url, notes, fit, fit_reason, origin, created_by)
      values (
        v_kind, left(v_name, 200),
        left(btrim(coalesce(r->>'category', '')), 120), left(btrim(coalesce(r->>'city', '')), 80),
        left(btrim(coalesce(r->>'instagram', '')), 120), left(btrim(coalesce(r->>'website', '')), 300),
        left(btrim(coalesce(r->>'phone', '')), 40), left(btrim(coalesce(r->>'email', '')), 200),
        left(v_source, 500), left(btrim(coalesce(r->>'notes', '')), 2000),
        v_fit, left(btrim(coalesce(r->>'fit_reason', '')), 300),
        'البحث اليومي', null
      );
      added := added + 1;
    exception when unique_violation then
      skipped := skipped + 1;
    end;
  end loop;
  return jsonb_build_object('added', added, 'skipped', skipped, 'rejected', rejected, 'over_limit', over_limit);
end;
$$;

-- When the daily research last reported (for the «is it working?» check).
create or replace function public.prospect_feed_status()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select created_at from public.prospect_feed where id = 1 and public.staff_role() is not null;
$$;

revoke execute on function public.research_settings_touch() from public, anon;
grant execute on function public.research_brief(text) to anon, authenticated;
grant execute on function public.log_research_run(text, jsonb) to anon, authenticated;
grant execute on function public.add_prospects(text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
