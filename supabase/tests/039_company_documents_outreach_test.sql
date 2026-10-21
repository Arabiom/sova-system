-- Rules of migration 039, in a rolled-back transaction:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/039_company_documents_outreach_test.sql
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000fea1'), ('00000000-0000-0000-0000-00000000fea2'), ('00000000-0000-0000-0000-00000000fea4')
on conflict do nothing;
insert into public.staff (user_id, email, role) values
  ('00000000-0000-0000-0000-00000000fea1', 'admin@test', 'admin'),
  ('00000000-0000-0000-0000-00000000fea2', 'market@test', 'marketing'),
  ('00000000-0000-0000-0000-00000000fea4', 'fin@test', 'finance')
on conflict (user_id) do update set role = excluded.role;
insert into public.clients (id, name, phone) values ('00000000-0000-0000-0000-0000000000d1', 'عميل تواصل', '93334444');

create function pg_temp.as_staff(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
end;
$$;

-- the admin files a document; finance reads it; marketing neither sees nor adds
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea1');
insert into public.company_documents (doc_type, number, issue_date, expiry_date, file_path, file_name)
values ('السجل التجاري', '1636161', '2025-01-01', '2027-01-01', 'cr/a.pdf', 'cr.pdf');
reset role;
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea4');
do $$ begin
  if (select count(*) from public.company_documents) <> 1 then raise exception 'finance cannot read'; end if;
end $$;
reset role;
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea2');
do $$
begin
  if (select count(*) from public.company_documents) <> 0 then raise exception 'marketing sees company documents'; end if;
  begin
    insert into public.company_documents (doc_type) values ('أخرى');
    raise exception 'marketing added a document';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- dates must make sense
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea1');
do $$ begin
  begin
    insert into public.company_documents (doc_type, issue_date, expiry_date) values ('أخرى', '2026-01-01', '2025-01-01');
    raise exception 'expiry before issue accepted';
  exception when check_violation then null;
  end;
end $$;

-- outreach: set by hand, stamped; an unknown value refused
update public.clients set outreach = 'مناسب' where id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin
  if (select outreach_at from public.clients where id = '00000000-0000-0000-0000-0000000000d1') is null then raise exception 'not stamped'; end if;
  begin
    update public.clients set outreach = 'ربما' where id = '00000000-0000-0000-0000-0000000000d1';
    raise exception 'unknown outreach accepted';
  exception when check_violation then null;
  end;
end $$;
update public.clients set outreach = '' where id = '00000000-0000-0000-0000-0000000000d1';
reset role;

-- a logged WhatsApp message marks «وصلته رسالة», but keeps a choice made by hand
insert into public.whatsapp_log (campaign_id, campaign_name, source, name, phone, body, sent_by) values (gen_random_uuid(), 'اختبار', 'client', 'x', '96893334444', 'مرحبا', '00000000-0000-0000-0000-00000000fea1');
do $$ begin
  if (select outreach from public.clients where id = '00000000-0000-0000-0000-0000000000d1') <> 'وصلته رسالة' then raise exception 'message not marked'; end if;
end $$;
update public.clients set outreach = 'غير مناسب' where id = '00000000-0000-0000-0000-0000000000d1';
insert into public.whatsapp_log (campaign_id, campaign_name, source, name, phone, body, sent_by) values (gen_random_uuid(), 'اختبار', 'client', 'x', '93334444', 'مرة ثانية', '00000000-0000-0000-0000-00000000fea1');
do $$ begin
  if (select outreach from public.clients where id = '00000000-0000-0000-0000-0000000000d1') <> 'غير مناسب' then raise exception 'hand choice overwritten'; end if;
end $$;

select 'ALL 039 RULES PASSED' as result;
rollback;
