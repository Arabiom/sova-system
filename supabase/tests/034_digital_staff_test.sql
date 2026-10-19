-- Rules of migration 034 (الموظفون الرقميون), run as real staff roles. Everything is rolled back.
-- Run on a database with the migrations applied:  psql -v ON_ERROR_STOP=1 -f 034_digital_staff_test.sql
begin;

-- (auth.users holds the sign-in accounts; on Supabase they exist already)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000fea1', 'admin.034@test.om'),
  ('00000000-0000-0000-0000-00000000fea2', 'market.034@test.om'),
  ('00000000-0000-0000-0000-00000000fea3', 'view.034@test.om');
insert into public.staff (user_id, email, role, name) values
  ('00000000-0000-0000-0000-00000000fea1', 'admin.034@test.om', 'admin', 'مدير'),
  ('00000000-0000-0000-0000-00000000fea2', 'market.034@test.om', 'marketing', 'تسويق'),
  ('00000000-0000-0000-0000-00000000fea3', 'view.034@test.om', 'viewer', 'مطلع')
on conflict (user_id) do update set role = excluded.role, name = excluded.name; -- a new account may get a staff row by itself
insert into public.clients (id, name, phone, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', 'عميل أ', '91111111', '00000000-0000-0000-0000-00000000fea2'),
  ('00000000-0000-0000-0000-0000000000c2', 'عميل ب', '+968 9222 2222', '00000000-0000-0000-0000-00000000fea2');

create function pg_temp.as_staff(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
declare
  passed boolean := false;
begin
  begin
    execute stmt;
    passed := true;
  exception when others then
    if sqlerrm not like '%' || code || '%' then raise exception 'EXPECTED % GOT %: %', code, sqlerrm, stmt; end if;
  end;
  if passed then raise exception 'EXPECTED REFUSAL % BUT IT PASSED: %', code, stmt; end if;
end $$;

-- marketing prepares a campaign
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea2');
insert into public.campaigns (id, name, body) values ('00000000-0000-0000-0000-0000000000f1', 'دعوة نزوى', 'أهلاً {الاسم}');
insert into public.campaign_recipients (campaign_id, client_id, name, phone) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', 'عميل أ', '91111111'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', 'عميل ب', '92222222');
-- a new campaign cannot start approved
select pg_temp.expect_error($$insert into public.campaigns (name, status) values ('x', 'معتمدة')$$, 'campaign_new_status');
-- approval needs «بانتظار الاعتماد» first, and only the admin approves
update public.campaigns set status = 'بانتظار الاعتماد' where id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.expect_error($$update public.campaigns set status = 'معتمدة' where id = '00000000-0000-0000-0000-0000000000f1'$$, 'campaign_approve_admin_only');
-- nor can it be sent without approval
select pg_temp.expect_error($$update public.campaigns set status = 'أُرسلت' where id = '00000000-0000-0000-0000-0000000000f1'$$, 'campaign_send_needs_approval');
-- the viewer cannot touch campaigns at all (no rows change)
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea3');
update public.campaigns set name = 'تغيير' where id = '00000000-0000-0000-0000-0000000000f1';
reset role;
do $$ begin if (select name from public.campaigns where id = '00000000-0000-0000-0000-0000000000f1') <> 'دعوة نزوى' then raise exception 'viewer changed a campaign'; end if; end $$;

-- the admin approves: stamped with who and when
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea1');
update public.campaigns set status = 'معتمدة' where id = '00000000-0000-0000-0000-0000000000f1';
reset role;
do $$ begin
  if (select approved_by from public.campaigns where id = '00000000-0000-0000-0000-0000000000f1') <> '00000000-0000-0000-0000-00000000fea1' then raise exception 'approval not stamped'; end if;
end $$;

-- approved: recipients are fixed
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea2');
select pg_temp.expect_error($$insert into public.campaign_recipients (campaign_id, name, phone) values ('00000000-0000-0000-0000-0000000000f1', 'جديد', '93333333')$$, 'campaign_locked');
select pg_temp.expect_error($$delete from public.campaign_recipients where campaign_id = '00000000-0000-0000-0000-0000000000f1'$$, 'campaign_locked');
-- editing the approved text sends it back for approval
update public.campaigns set body = 'نص معدّل' where id = '00000000-0000-0000-0000-0000000000f1';
reset role;
do $$ begin
  if (select status from public.campaigns where id = '00000000-0000-0000-0000-0000000000f1') <> 'بانتظار الاعتماد' then raise exception 'edited approved campaign stayed approved'; end if;
  if (select approved_by from public.campaigns where id = '00000000-0000-0000-0000-0000000000f1') is not null then raise exception 'approval kept after edit'; end if;
end $$;

-- stop list: a number on it is never added, and leaves campaigns not sent yet
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea2');
insert into public.opt_outs (phone, reason) values ('+96891111111', 'طلب الإيقاف');
reset role;
do $$ begin
  if exists (select 1 from public.campaign_recipients where public.phone_key(phone) = '91111111') then raise exception 'opted-out number stayed in a campaign'; end if;
end $$;
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea2');
insert into public.campaigns (id, name, body) values ('00000000-0000-0000-0000-0000000000f2', 'حملة 2', 'نص');
select pg_temp.expect_error($$insert into public.campaign_recipients (campaign_id, name, phone) values ('00000000-0000-0000-0000-0000000000f2', 'عميل أ', '0096891111111')$$, 'opted_out');
-- only the admin removes a number from the stop list (others delete nothing)
delete from public.opt_outs where public.phone_key(phone) = '91111111';
reset role;
do $$ begin if not exists (select 1 from public.opt_outs where public.phone_key(phone) = '91111111') then raise exception 'non-admin removed from stop list'; end if; end $$;

-- a recipient who asks to stop goes onto the stop list
select pg_temp.as_staff('00000000-0000-0000-0000-00000000fea2');
insert into public.campaign_recipients (campaign_id, client_id, name, phone) values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c2', 'عميل ب', '92222222');
update public.campaign_recipients set status = 'طلب الإيقاف' where campaign_id = '00000000-0000-0000-0000-0000000000f2' and public.phone_key(phone) = '92222222';
reset role;
do $$ begin if not exists (select 1 from public.opt_outs where public.phone_key(phone) = '92222222') then raise exception 'stop request not on the stop list'; end if; end $$;

-- last contact follows the WhatsApp log
insert into public.whatsapp_log (campaign_id, phone, body, sent_at) values (gen_random_uuid(), '96891111111', 'x', '2026-10-01 10:00+04');
do $$ begin if (select last_contact_at from public.clients where id = '00000000-0000-0000-0000-0000000000c1') is null then raise exception 'last contact not set'; end if; end $$;

-- contact source takes only the known values
select pg_temp.expect_error($$update public.clients set contact_source = 'غير معروف' where id = '00000000-0000-0000-0000-0000000000c1'$$, 'clients_contact_source_check');

select 'ALL 034 RULES PASSED' as result;
rollback;
