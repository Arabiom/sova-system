-- Rules of migration 044, in a rolled-back transaction:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/044_advisor_no_repeats_test.sql
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000a0441') on conflict do nothing;
insert into public.staff (user_id, email, role) values ('00000000-0000-0000-0000-0000000a0441', 'admin44@test', 'admin')
on conflict (user_id) do update set role = excluded.role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a0441', true);
set local role authenticated;
insert into public.exhibitions (city, mall, date_from, date_to) values ('صحار', 'مول 44', current_date + 5, current_date + 8);
insert into public.advisor_items (ref, kind, priority, title) values ('review:own-note', 'مهمة', 'عادية', 'كتبها المدير');
create temp table t_token as select public.rotate_prospect_feed_token() as token;
grant select on t_token to anon;
reset role;

set local role anon;
do $$
declare
  tok text := (select token from t_token);
  res jsonb;
  brief jsonb;
begin
  res := public.add_advisor_items(tok, jsonb_build_array(
    jsonb_build_object('ref', 'review:bookings:2026-11', 'priority', 'مهمة', 'title', 'طلبا حجز بانتظار الرد', 'link', '/bookings')));
  if (res->>'added')::int <> 1 then raise exception 'first add gave %', res; end if;

  -- the next morning, the same matter: updated, not added again
  res := public.add_advisor_items(tok, jsonb_build_array(
    jsonb_build_object('ref', 'review:bookings:2026-11', 'priority', 'عاجلة', 'title', '3 طلبات حجز بانتظار الرد', 'link', '/bookings', 'due_date', '2026-11-30'),
    jsonb_build_object('ref', 'review:own-note', 'title', 'يكتب فوق ملاحظة المدير')));
  if (res->>'added')::int <> 0 or (res->>'updated')::int <> 1 or (res->>'skipped')::int <> 1 then raise exception 'repeat gave %', res; end if;

  brief := public.advisor_brief(tok);
  if (brief->'exhibitions'->0->>'id') is null then raise exception 'brief misses exhibition ids'; end if;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.advisor_items where ref = 'review:bookings:2026-11') <> 1 then raise exception 'repeated'; end if;
  if (select title from public.advisor_items where ref = 'review:bookings:2026-11') <> '3 طلبات حجز بانتظار الرد'
     or (select priority from public.advisor_items where ref = 'review:bookings:2026-11') <> 'عاجلة'
     or (select due_date from public.advisor_items where ref = 'review:bookings:2026-11') <> '2026-11-30' then
    raise exception 'open item not brought up to date';
  end if;
  if (select title from public.advisor_items where ref = 'review:own-note') <> 'كتبها المدير' then raise exception 'owner note overwritten'; end if;
end $$;

-- once done, it stays done
update public.advisor_items set status = 'تمت' where ref = 'review:bookings:2026-11';
set local role anon;
do $$
declare res jsonb;
begin
  res := public.add_advisor_items((select token from t_token), jsonb_build_array(
    jsonb_build_object('ref', 'review:bookings:2026-11', 'title', 'مرة أخرى')));
  if (res->>'skipped')::int <> 1 then raise exception 'done item gave %', res; end if;
end $$;
reset role;
do $$ begin
  if (select status from public.advisor_items where ref = 'review:bookings:2026-11') <> 'تمت' then raise exception 'done item reopened'; end if;
end $$;

rollback;
