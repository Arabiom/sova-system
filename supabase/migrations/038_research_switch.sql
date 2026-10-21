-- The research employee gets an on/off switch and a «ابحث الآن» request, both set from the system.
-- The scheduled research checks every hour of the working day; the brief tells it whether there is
-- work: nothing when switched off; the day's search once a day; a requested search right away.

alter table public.research_settings add column if not exists enabled boolean not null default true;
alter table public.research_settings add column if not exists run_requested_at timestamptz;

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
  last_run timestamptz;
  ran_today boolean;
  requested boolean;
begin
  if not public.prospect_feed_ok(p_token) then
    raise exception 'bad_token' using errcode = '42501';
  end if;
  select * into s from public.research_settings where id = 1;
  select max(run_at) into last_run from public.research_runs;
  ran_today := last_run is not null and (last_run at time zone 'Asia/Muscat')::date = (now() at time zone 'Asia/Muscat')::date;
  requested := s.run_requested_at is not null and (last_run is null or s.run_requested_at > last_run);
  select count(*) into added_today from public.prospects
   where origin in ('البحث اليومي', 'خرائط جوجل') and (created_at at time zone 'Asia/Muscat')::date = (now() at time zone 'Asia/Muscat')::date;
  return jsonb_build_object(
    'enabled', coalesce(s.enabled, true),
    'due', coalesce(s.enabled, true) and (requested or not ran_today),
    'why', case
      when not coalesce(s.enabled, true) then 'off'
      when requested then 'requested'
      when not ran_today then 'daily'
      else 'done_today'
    end,
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

-- Switched off, the research cannot add anything either (even a run already under way).
create or replace function public.research_switched_off()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select not enabled from public.research_settings where id = 1), false);
$$;
revoke execute on function public.research_switched_off() from public, anon, authenticated;

create or replace function public.prospects_respect_switch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- only the research's own rows look at the switch (staff adding by hand are never stopped)
  if new.origin in ('البحث اليومي', 'خرائط جوجل') then
    if public.research_switched_off() then
      raise exception 'research_off' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists prospects_respect_switch on public.prospects;
create trigger prospects_respect_switch before insert on public.prospects
  for each row execute function public.prospects_respect_switch();
revoke execute on function public.prospects_respect_switch() from public, anon;

notify pgrst, 'reload schema';
