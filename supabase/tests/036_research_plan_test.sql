-- Rules of migration 036 (after 035), as the real roles inside a rolled-back transaction:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/036_research_plan_test.sql
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000fea1'),
  ('00000000-0000-0000-0000-00000000fea2')
on conflict do nothing;
insert into public.staff (user_id, email, role) values
  ('00000000-0000-0000-0000-00000000fea1', 'admin@test', 'admin'),
  ('00000000-0000-0000-0000-00000000fea2', 'market@test', 'marketing')
on conflict (user_id) do update set role = excluded.role;
insert into public.exhibitions (id, city, mall, date_from, date_to, status, name)
values ('00000000-0000-0000-0000-0000000000e1', 'نزوى', 'مول تجربة', current_date + 30, current_date + 34, 'قادم', 'معرض تجربة');

create function pg_temp.as_staff(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
end;
$$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end;
$$;
create function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
declare
  passed boolean := false;
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm like '%' || code || '%' or sqlstate = code then
      passed := true;
    else
      raise exception 'WRONG ERROR for [%]: % %', stmt, sqlstate, sqlerrm;
    end if;
  end;
  if not passed then
    raise exception 'EXPECTED ERROR % for [%]', code, stmt;
  end if;
end;
$$;
grant execute on function pg_temp.expect_error(text, text) to anon, authenticated;

-- only the admin changes the plan; marketing's update touches nothing
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea2');
update public.research_settings set focus = 'من التسويق' where id = 1;
reset role;
do $$ begin
  if (select focus from public.research_settings) = 'من التسويق' then raise exception 'marketing changed the plan'; end if;
end $$;
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea1');
update public.research_settings set focus = 'عارضون لمعرض نزوى', cities = '{نزوى}', daily_limit = 2 where id = 1;
select pg_temp.expect_error($$update public.research_settings set daily_limit = 99 where id = 1$$, '23514');
create temp table t_token as select public.rotate_prospect_feed_token() as token;
grant select on t_token to anon;
reset role;

select pg_temp.as_anon();
do $$
declare
  tok text := (select token from t_token);
  brief jsonb;
  res jsonb;
begin
  -- the brief carries the plan and the upcoming exhibitions
  brief := public.research_brief(tok);
  if brief->>'focus' <> 'عارضون لمعرض نزوى' or (brief->>'daily_limit')::int <> 2 or (brief->>'remaining_today')::int <> 2 then
    raise exception 'brief wrong: %', brief;
  end if;
  if not exists (select 1 from jsonb_array_elements(brief->'upcoming_exhibitions') e where e->>'name' = 'معرض تجربة') then
    raise exception 'upcoming exhibition missing: %', brief;
  end if;

  -- the day's limit (2) holds; the fit is kept when it is 1–3 and dropped otherwise
  res := public.add_prospects(tok, jsonb_build_array(
    jsonb_build_object('name', 'فرصة أ', 'source_url', 'https://a.com', 'fit', 3, 'fit_reason', 'شارك في معرض مشابه'),
    jsonb_build_object('name', 'فرصة ب', 'source_url', 'https://b.com', 'fit', '9'),
    jsonb_build_object('name', 'فرصة ج', 'source_url', 'https://c.com')
  ));
  if (res->>'added')::int <> 2 or (res->>'over_limit')::int <> 1 then raise exception 'limit not kept: %', res; end if;
  if (public.research_brief(tok)->>'remaining_today')::int <> 0 then raise exception 'remaining not 0'; end if;

  -- a run reports itself
  perform public.log_research_run(tok, '{"added": 2, "skipped": 0, "rejected": 0, "focus": "نزوى", "summary": "تجربة"}');
end $$;
select pg_temp.expect_error($$select public.research_brief('wrong-wrong-wrong-wrong-wrong-wrong')$$, 'bad_token');
select pg_temp.expect_error($$select public.log_research_run('wrong-wrong-wrong-wrong-wrong-wrong', '{}')$$, 'bad_token');
select pg_temp.expect_error($$select * from public.research_runs$$, '42501');
select pg_temp.expect_error($$select * from public.research_settings$$, '42501');
reset role;

do $$ begin
  if (select fit from public.prospects where name = 'فرصة أ') <> 3 then raise exception 'fit not kept'; end if;
  if (select fit from public.prospects where name = 'فرصة ب') is not null then raise exception 'bad fit kept'; end if;
  if (select count(*) from public.research_runs where summary = 'تجربة') <> 1 then raise exception 'run not logged'; end if;
end $$;

-- staff read the log; «غير مناسب» is a valid status; an unknown one is not
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea2');
do $$ begin
  if (select count(*) from public.research_runs) < 1 then raise exception 'staff cannot read the log'; end if;
end $$;
update public.prospects set status = 'غير مناسب' where name = 'فرصة أ';
select pg_temp.expect_error($$update public.prospects set status = 'لاحقاً' where name = 'فرصة أ'$$, '23514');
reset role;

select 'ALL 036 RULES PASSED' as result;
rollback;
