-- Rules of migration 040, in a rolled-back transaction:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/040_advisor_sectors_test.sql
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000fea1'), ('00000000-0000-0000-0000-00000000fea2'), ('00000000-0000-0000-0000-00000000fea4')
on conflict do nothing;
insert into public.staff (user_id, email, role) values
  ('00000000-0000-0000-0000-00000000fea1', 'admin@test', 'admin'),
  ('00000000-0000-0000-0000-00000000fea2', 'market@test', 'marketing'),
  ('00000000-0000-0000-0000-00000000fea4', 'fin@test', 'finance')
on conflict (user_id) do update set role = excluded.role;

create function pg_temp.as_staff(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
end;
$$;

-- products and target sectors are saved
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea1');
insert into public.clients (name, phone, sector, products) values ('عطور تجربة', '95556666', 'عطور وبخور', 'بخور ودخون ومخمرية');
insert into public.exhibitions (city, mall, date_from, date_to, sectors)
values ('مسقط', 'مول تجربة', current_date + 40, current_date + 44, array['عطور وبخور', 'حرف يدوية']);
create temp table t_token as select public.rotate_prospect_feed_token() as token;
grant select on t_token to anon;
reset role;
do $$ begin
  if (select products from public.clients where name = 'عطور تجربة') <> 'بخور ودخون ومخمرية' then raise exception 'products not saved'; end if;
  if (select sectors from public.exhibitions where mall = 'مول تجربة') <> array['عطور وبخور', 'حرف يدوية'] then raise exception 'sectors not saved'; end if;
  begin
    insert into public.clients (name, products) values ('طويل', repeat('x', 1001));
    raise exception 'a 1001-letter products note was accepted';
  exception when check_violation then null;
  end;
end $$;

-- the seeded tasks are there; only the admin sees and edits the list
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea1');
do $$ begin
  if (select count(*) from public.advisor_items where ref like 'seed:%') < 5 then raise exception 'seed tasks missing'; end if;
end $$;
insert into public.advisor_items (title, kind, priority) values ('مهمة يدوية', 'مهمة', 'عاجلة');
update public.advisor_items set status = 'تمت' where title = 'مهمة يدوية';
do $$ begin
  if (select done_at from public.advisor_items where title = 'مهمة يدوية') is null then raise exception 'done_at not set'; end if;
end $$;
update public.advisor_items set status = 'مفتوحة' where title = 'مهمة يدوية';
do $$ begin
  if (select done_at from public.advisor_items where title = 'مهمة يدوية') is not null then raise exception 'done_at kept after reopening'; end if;
end $$;
reset role;

select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea4');
do $$ begin
  if (select count(*) from public.advisor_items) <> 0 then raise exception 'finance sees the owner list'; end if;
end $$;
reset role;
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea2');
do $$
begin
  if (select count(*) from public.advisor_items) <> 0 then raise exception 'marketing sees the owner list'; end if;
  begin
    insert into public.advisor_items (title) values ('من المسوق');
    raise exception 'marketing added to the owner list';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- the daily review: wrong code refused; good rows added once; bad rows rejected; the brief has counts only
set local role anon;
do $$
declare
  tok text := (select token from t_token);
  res jsonb;
  brief jsonb;
begin
  begin
    perform public.advisor_brief('x' || repeat('0', 40));
    raise exception 'brief without the code';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.add_advisor_items('x' || repeat('0', 40), '[]'::jsonb);
    raise exception 'add without the code';
  exception when insufficient_privilege then null;
  end;
  res := public.add_advisor_items(tok, jsonb_build_array(
    jsonb_build_object('ref', 'review:2026-10-21:bookings', 'kind', 'مهمة', 'priority', 'عاجلة', 'title', 'راجع طلبات الحجز', 'link', '/bookings'),
    jsonb_build_object('ref', 'review:2026-10-21:bookings', 'title', 'مكرر'),
    jsonb_build_object('ref', 'seed:analytics', 'title', 'موجود مسبقاً'),
    jsonb_build_object('ref', 'Bad Ref!', 'title', 'رمز خاطئ'),
    jsonb_build_object('ref', 'review:x:link', 'title', 'رابط خارجي', 'link', 'https://evil.example'),
    jsonb_build_object('ref', 'review:x:kind', 'title', 'نوع غير معروف', 'kind', 'أمر')
  ));
  if (res->>'added')::int <> 1 or (res->>'skipped')::int <> 2 or (res->>'rejected')::int <> 3 then
    raise exception 'add_advisor_items gave %', res;
  end if;
  brief := public.advisor_brief(tok);
  if not (brief->'refs') ? 'review:2026-10-21:bookings' then raise exception 'brief misses refs'; end if;
  if (brief->'clients'->>'total')::int < 1 then raise exception 'brief misses client counts'; end if;
  if jsonb_array_length(brief->'exhibitions') < 1 or not (brief->'exhibitions'->0->'sectors') ? 'عطور وبخور' then
    raise exception 'brief misses upcoming exhibitions';
  end if;
  if brief::text like '%95556666%' or brief::text like '%عطور تجربة%' then raise exception 'brief leaks client data'; end if;
  begin
    perform 1 from public.advisor_items;
    raise exception 'anon read the list';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin
  if (select origin from public.advisor_items where ref = 'review:2026-10-21:bookings') <> 'المراجعة اليومية' then raise exception 'origin not set'; end if;
end $$;

-- a research finding keeps its products note
set local role anon;
do $$
declare res jsonb;
begin
  res := public.add_prospects((select token from t_token), jsonb_build_array(
    jsonb_build_object('name', 'فخاريات تجربة', 'source_url', 'https://e.com/p', 'category', 'حرف يدوية', 'products', 'فخار وسعفيات')));
  if (res->>'added')::int <> 1 then raise exception 'add_prospects gave %', res; end if;
end $$;
reset role;
do $$ begin
  if (select products from public.prospects where name = 'فخاريات تجربة') <> 'فخار وسعفيات' then raise exception 'prospect products lost'; end if;
end $$;

select 'ALL 040 RULES PASSED' as result;
rollback;
