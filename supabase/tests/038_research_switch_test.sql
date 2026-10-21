-- Rules of migration 038 (after 035–037), in a rolled-back transaction:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/038_research_switch_test.sql
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000fea1'), ('00000000-0000-0000-0000-00000000fea2') on conflict do nothing;
insert into public.staff (user_id, email, role) values
  ('00000000-0000-0000-0000-00000000fea1', 'admin@test', 'admin'),
  ('00000000-0000-0000-0000-00000000fea2', 'market@test', 'marketing')
on conflict (user_id) do update set role = excluded.role;
delete from public.research_runs;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000fea1', true);
set local role authenticated;
update public.research_settings set enabled = true, run_requested_at = null, daily_limit = 20 where id = 1;
create temp table t_token as select public.rotate_prospect_feed_token() as token;
grant select on t_token to anon;
reset role;

set local role anon;
do $$
declare
  tok text := (select token from t_token);
  b jsonb;
begin
  -- no run today yet: the daily search is due
  b := public.research_brief(tok);
  if not (b->>'due')::boolean or b->>'why' <> 'daily' then raise exception 'expected daily due: %', b; end if;
  perform public.log_research_run(tok, '{"added": 0}');
  -- ran today, nothing requested: nothing to do
  b := public.research_brief(tok);
  if (b->>'due')::boolean or b->>'why' <> 'done_today' then raise exception 'expected done_today: %', b; end if;
end $$;
reset role;

-- marketing cannot switch it; the admin asks for a search now
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000fea2', true);
update public.research_settings set enabled = false where id = 1;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000fea1', true);
do $$ begin
  if not (select enabled from public.research_settings where id = 1) then raise exception 'marketing switched it off'; end if;
end $$;
update public.research_settings set run_requested_at = now() + interval '1 second' where id = 1;
reset role;

set local role anon;
do $$
declare
  tok text := (select token from t_token);
  b jsonb;
begin
  b := public.research_brief(tok);
  if not (b->>'due')::boolean or b->>'why' <> 'requested' then raise exception 'expected requested: %', b; end if;
end $$;
reset role;

-- switched off: nothing is due, and nothing can be added by the research
set local role authenticated;
update public.research_settings set enabled = false where id = 1;
reset role;
set local role anon;
do $$
declare
  tok text := (select token from t_token);
  b jsonb;
begin
  b := public.research_brief(tok);
  if (b->>'due')::boolean or b->>'why' <> 'off' or (b->>'enabled')::boolean then raise exception 'expected off: %', b; end if;
  begin
    perform public.add_prospects(tok, '[{"name": "أثناء الإيقاف", "source_url": "https://e.com"}]');
    raise exception 'added while switched off';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- staff adding by hand is not affected by the switch
set local role authenticated;
insert into public.prospects (name, source_url) values ('إضافة يدوية أثناء الإيقاف', 'https://e.com/m');
reset role;

select 'ALL 038 RULES PASSED' as result;
rollback;
