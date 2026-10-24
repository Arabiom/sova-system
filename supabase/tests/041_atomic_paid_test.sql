-- Rules of migration 041, in a rolled-back transaction:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/041_atomic_paid_test.sql
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000fea1'), ('00000000-0000-0000-0000-00000000fea2') on conflict do nothing;
insert into public.staff (user_id, email, role) values
  ('00000000-0000-0000-0000-00000000fea1', 'admin@test', 'admin'),
  ('00000000-0000-0000-0000-00000000fea2', 'market@test', 'marketing')
on conflict (user_id) do update set role = excluded.role;
insert into public.exhibitions (id, city, mall, date_from, date_to) values ('00000000-0000-0000-0000-0000000e0041', 'مسقط', 'م', '2026-12-01', '2026-12-05');
insert into public.exhibitors (id, brand, manager, phone, exhibition_id, contract, paid, created_by)
values ('00000000-0000-0000-0000-0000000a0041', 'تجربة', 'مسؤول', '91234567', '00000000-0000-0000-0000-0000000e0041', 300, 50, '00000000-0000-0000-0000-00000000fea2');

create function pg_temp.as_staff(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
end;
$$;

select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea1');
do $$ begin
  if public.adjust_exhibitor_paid('00000000-0000-0000-0000-0000000a0041', 100) <> 150 then raise exception 'add failed'; end if;
  if public.adjust_exhibitor_paid('00000000-0000-0000-0000-0000000a0041', -500) <> 0 then raise exception 'paid went below zero'; end if;
end $$;
reset role;

-- marketing still cannot move the paid total, even of its own participant
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea2');
do $$ begin
  begin
    perform public.adjust_exhibitor_paid('00000000-0000-0000-0000-0000000a0041', 10);
    raise exception 'marketing changed paid';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role anon;
do $$ begin
  begin
    perform public.adjust_exhibitor_paid('00000000-0000-0000-0000-0000000a0041', 10);
    raise exception 'anon changed paid';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'ALL 041 RULES PASSED' as result;
rollback;
