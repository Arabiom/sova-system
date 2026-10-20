-- Rules of migration 037 (after 035–036), in a rolled-back transaction:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/037_maps_prospects_test.sql
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000fea1') on conflict do nothing;
insert into public.staff (user_id, email, role) values ('00000000-0000-0000-0000-00000000fea1', 'admin@test', 'admin')
on conflict (user_id) do update set role = excluded.role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000fea1', true);
set local role authenticated;
update public.research_settings set daily_limit = 20 where id = 1;
create temp table t_token as select public.rotate_prospect_feed_token() as token;
grant select on t_token to anon;
reset role;

-- an old Maps find nobody reviewed, an old one the team reviewed, and an old daily-research find
insert into public.prospects (name, source_url, place_id, origin, status, created_at) values
  ('خرائط قديم', 'https://maps.google.com/?cid=1', 'place-old', 'خرائط جوجل', 'جديد', now() - interval '31 days'),
  ('خرائط تمت مراجعته', 'https://maps.google.com/?cid=2', 'place-kept', 'خرائط جوجل', 'تم التحقق', now() - interval '40 days'),
  ('بحث قديم', 'https://e.com/old', null, 'البحث اليومي', 'جديد', now() - interval '40 days');

set local role anon;
do $$
declare
  tok text := (select token from t_token);
  res jsonb;
begin
  res := public.add_prospects(tok, jsonb_build_array(
    jsonb_build_object('name', 'محل من الخرائط', 'source_url', 'https://maps.google.com/?cid=3', 'place_id', 'place-new', 'fit', 2),
    jsonb_build_object('name', 'نفس المكان باسم آخر', 'source_url', 'https://maps.google.com/?cid=3', 'place_id', 'place-new'),
    jsonb_build_object('name', 'المحل الذي رُوجع', 'source_url', 'https://maps.google.com/?cid=2', 'place_id', 'place-kept')
  ));
  if (res->>'added')::int <> 1 or (res->>'skipped')::int <> 2 or (res->>'purged')::int <> 1 then
    raise exception 'add_prospects gave %', res;
  end if;
  if not exists (select 1 from public.known_prospects(tok) k where k.place_id = 'place-new') then
    raise exception 'place_id missing from known_prospects';
  end if;
end $$;
reset role;

do $$ begin
  if exists (select 1 from public.prospects where name = 'خرائط قديم') then raise exception 'unreviewed Maps find kept past 30 days'; end if;
  if not exists (select 1 from public.prospects where name = 'خرائط تمت مراجعته') then raise exception 'reviewed Maps find removed'; end if;
  if not exists (select 1 from public.prospects where name = 'بحث قديم') then raise exception 'non-Maps find removed'; end if;
  if (select origin from public.prospects where name = 'محل من الخرائط') <> 'خرائط جوجل' then raise exception 'origin not set'; end if;
end $$;

-- nobody but the system can run the purge
set local role authenticated;
do $$ begin
  begin
    perform public.purge_unreviewed_maps();
    raise exception 'purge callable by staff';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'ALL 037 RULES PASSED' as result;
rollback;
