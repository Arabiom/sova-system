-- Rules of migration 042, in a rolled-back transaction:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/042_move_imported_prospects_test.sql
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000fea1'), ('00000000-0000-0000-0000-00000000fea2') on conflict do nothing;
insert into public.staff (user_id, email, role) values
  ('00000000-0000-0000-0000-00000000fea1', 'admin@test', 'admin'),
  ('00000000-0000-0000-0000-00000000fea2', 'market@test', 'marketing')
on conflict (user_id) do update set role = excluded.role;

create function pg_temp.as_staff(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
end;
$$;

insert into public.clients (id, name, phone) values ('00000000-0000-0000-0000-0000000c0042', 'عميل قديم', '91110000');
insert into public.prospects (name, phone, origin, status, kind, category, products, instagram, notes, source_url) values
  ('عطور المستورد', '92220000', 'استيراد', 'جديد', 'عارض محتمل', 'عطور وبخور', 'بخور', 'oud.shop', 'من الملف', ''),
  ('بنفس رقم عميل', '+968 9111 0000', 'استيراد', 'جديد', 'عارض محتمل', '', '', '', '', ''),
  ('بلا رقم', '', 'استيراد', 'تم التحقق', 'راعٍ أو شريك', '', '', '', '', ''),
  ('مول مستورد', '93330000', 'استيراد', 'جديد', 'موقع أو فعالية', '', '', '', '', ''),
  ('رفضناه', '94440000', 'استيراد', 'غير مناسب', 'عارض محتمل', '', '', '', '', ''),
  ('من البحث', '95550000', 'البحث اليومي', 'جديد', 'عارض محتمل', '', '', '', '', 'https://e.com');

-- marketing may not move the list
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea2');
do $$ begin
  begin
    perform public.move_imported_prospects(10);
    raise exception 'marketing moved the list';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- the admin moves it in batches of one
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea1');
do $$
declare r jsonb;
begin
  r := public.move_imported_prospects(1);
  if (r->>'linked')::int <> 1 or (r->>'moved')::int <> 1 or (r->>'remaining')::int <> 1 then raise exception 'first batch gave %', r; end if;
  r := public.move_imported_prospects(1);
  if (r->>'moved')::int <> 1 or (r->>'remaining')::int <> 0 then raise exception 'second batch gave %', r; end if;
  r := public.move_imported_prospects(1);
  if (r->>'moved')::int <> 0 then raise exception 'third batch moved %', r; end if;
end $$;
reset role;

do $$ begin
  if (select client_id from public.prospects where name = 'بنفس رقم عميل') <> '00000000-0000-0000-0000-0000000c0042' then raise exception 'not linked to the existing client'; end if;
  if not exists (select 1 from public.clients where name = 'عطور المستورد' and sector = 'عطور وبخور' and products = 'بخور' and instagram = '@oud.shop'
                   and status = 'محتمل' and contact_source = 'قائمة مستوردة') then raise exception 'client fields wrong'; end if;
  if (select status from public.prospects where name = 'عطور المستورد') <> 'أصبح عميلاً' then raise exception 'prospect not marked'; end if;
  if exists (select 1 from public.clients where name in ('مول مستورد', 'رفضناه', 'من البحث')) then raise exception 'moved what it should not'; end if;
  if (select count(*) from public.clients where name = 'بنفس رقم عميل') <> 0 then raise exception 'duplicate client created'; end if;
end $$;

select 'ALL 042 RULES PASSED' as result;
rollback;
