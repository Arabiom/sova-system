-- Rules of migration 043, in a rolled-back transaction:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/043_pending_accounts_test.sql
begin;

-- a brand-new account waits, with no access
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000a0043', 'new@test');
insert into public.clients (name, phone) values ('عميل سري', '96660000');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a0043', true);
set local role authenticated;
do $$ begin
  if (select role from public.staff where user_id = auth.uid()) <> 'pending' then raise exception 'new account is not pending'; end if;
  if public.staff_role() is not null then raise exception 'pending account has a role'; end if;
  if (select count(*) from public.clients) <> 0 then raise exception 'pending account reads clients'; end if;
  if (select count(*) from public.exhibitors) <> 0 then raise exception 'pending account reads exhibitors'; end if;
  begin
    insert into public.bookings (brand, manager, phone) values ('x', 'y', '91234567');
    raise exception 'pending account wrote a booking';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- once the admin gives a role, it works
update public.staff set role = 'viewer' where user_id = '00000000-0000-0000-0000-0000000a0043';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a0043', true);
set local role authenticated;
do $$ begin
  if public.staff_role() <> 'viewer' then raise exception 'role not applied'; end if;
end $$;
reset role;

-- links on the follow-up list stay inside the system
do $$ begin
  begin
    insert into public.advisor_items (title, link) values ('رابط خارجي', '//evil.example');
    raise exception 'protocol-relative link accepted';
  exception when check_violation then null;
  end;
  insert into public.advisor_items (title, link) values ('رابط داخلي', '/clients');
end $$;
update public.staff set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000a0043';
create temp table t_token as select public.rotate_prospect_feed_token() as token;
do $$
declare r jsonb;
begin
  r := public.add_advisor_items((select token from t_token), jsonb_build_array(
    jsonb_build_object('ref', 'review:x:ok', 'title', 'داخلي', 'link', '/bookings'),
    jsonb_build_object('ref', 'review:x:bad', 'title', 'خارجي', 'link', '//evil.example'),
    jsonb_build_object('ref', 'review:x:bad2', 'title', 'خارجي', 'link', '/\evil.example')));
  if (r->>'added')::int <> 1 or (r->>'rejected')::int <> 2 then raise exception 'add_advisor_items gave %', r; end if;
end $$;

select 'ALL 043 RULES PASSED' as result;
rollback;
