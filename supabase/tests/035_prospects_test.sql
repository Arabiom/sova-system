-- Rules of migration 035, run as the real roles inside a transaction that is rolled back:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/035_prospects_test.sql
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000fea1'),
  ('00000000-0000-0000-0000-00000000fea2'),
  ('00000000-0000-0000-0000-00000000fea3')
on conflict do nothing;
insert into public.staff (user_id, email, role) values
  ('00000000-0000-0000-0000-00000000fea1', 'admin@test', 'admin'),
  ('00000000-0000-0000-0000-00000000fea2', 'market@test', 'marketing'),
  ('00000000-0000-0000-0000-00000000fea3', 'view@test', 'viewer')
on conflict (user_id) do update set role = excluded.role;
insert into public.clients (id, name, phone, instagram) values
  ('00000000-0000-0000-0000-0000000000c9', 'عميل قائم', '91110000', '@existing.shop');

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

-- staff add by hand; the account is tidied; the viewer cannot add
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea2');
insert into public.prospects (name, instagram, phone, source_url) values ('متجر تجربة', '@Test.Shop', '+968 9222 3333', 'https://example.com/a');
do $$ begin
  if (select instagram from public.prospects where name = 'متجر تجربة') <> 'test.shop' then raise exception 'instagram not tidied'; end if;
end $$;
select pg_temp.expect_error($$insert into public.prospects (name, phone) values ('نفس الرقم', '92223333')$$, '23505');
select pg_temp.expect_error($$insert into public.prospects (name, kind) values ('نوع غلط', 'زبون')$$, '23514');
reset role;
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea3');
select pg_temp.expect_error($$insert into public.prospects (name) values ('من المطلع')$$, '42501');
reset role;

-- only the admin makes the research code
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea2');
select pg_temp.expect_error($$select public.rotate_prospect_feed_token()$$, 'admin_only');
reset role;
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea1');
create temp table t_token as select public.rotate_prospect_feed_token() as token;
grant select on t_token to anon;
reset role;

-- a visitor without the code gets nothing in and cannot read the list or the code
select pg_temp.as_anon();
select pg_temp.expect_error($$select public.add_prospects('wrong-token-wrong-token-wrong-token', '[{"name":"x","source_url":"https://e.com"}]')$$, 'bad_token');
select pg_temp.expect_error($$select * from public.known_prospects('')$$, 'bad_token');
select pg_temp.expect_error($$select * from public.prospects$$, '42501');
select pg_temp.expect_error($$select * from public.prospect_feed$$, '42501');

-- with the code: new ones added, duplicates skipped, rows without a source link refused
do $$
declare
  res jsonb;
  tok text := (select token from t_token);
begin
  res := public.add_prospects(tok, jsonb_build_array(
    jsonb_build_object('name', 'مشروع جديد', 'kind', 'عارض محتمل', 'instagram', '@new.one', 'source_url', 'https://instagram.com/new.one'),
    jsonb_build_object('name', 'عميل قائم', 'source_url', 'https://e.com/1'),
    jsonb_build_object('name', 'حساب مكرر', 'instagram', 'TEST.SHOP', 'source_url', 'https://e.com/2'),
    jsonb_build_object('name', 'بدون مصدر'),
    jsonb_build_object('name', 'مول للمعارض', 'kind', 'موقع أو فعالية', 'source_url', 'http://e.com/3')
  ));
  if (res->>'added')::int <> 2 or (res->>'skipped')::int <> 2 or (res->>'rejected')::int <> 1 then
    raise exception 'add_prospects gave %', res;
  end if;
  if (select count(*) from public.known_prospects(tok)) < 4 then raise exception 'known list too short'; end if;
end $$;
select pg_temp.expect_error($$select public.add_prospects((select token from t_token), (select jsonb_agg(jsonb_build_object('name', 'n' || g, 'source_url', 'https://e.com')) from generate_series(1, 51) g))$$, 'too_many');
reset role;

do $$ begin
  if (select origin from public.prospects where name = 'مشروع جديد') <> 'البحث اليومي' then raise exception 'origin not set'; end if;
  if (select status from public.prospects where name = 'مشروع جديد') <> 'جديد' then raise exception 'status not new'; end if;
end $$;

-- marketing cannot delete what the research added; the admin can; revoking stops the code
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea2');
delete from public.prospects where name = 'مشروع جديد';
reset role;
do $$ begin
  if not exists (select 1 from public.prospects where name = 'مشروع جديد') then raise exception 'marketing deleted a research row'; end if;
end $$;
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea1');
delete from public.prospects where name = 'مشروع جديد';
select public.revoke_prospect_feed_token();
reset role;
select pg_temp.as_anon();
select pg_temp.expect_error($$select public.add_prospects((select token from t_token), '[]')$$, 'bad_token');
reset role;

select 'ALL 035 RULES PASSED' as result;
rollback;
