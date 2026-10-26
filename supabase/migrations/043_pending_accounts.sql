-- Two hardenings found in the security review:
-- 1. A new account no longer becomes «تسويق» by itself. It waits as «بانتظار التفعيل» (no access
--    at all) until the admin gives it a role from «الموظفين». Sign-ups are closed in Supabase
--    today; this keeps the data safe even if they are ever opened again.
-- 2. A link on the follow-up list must be a page of the system («/clients»), never another site
--    («//example.com»).

alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check check (role in ('admin', 'finance', 'marketing', 'viewer', 'pending'));
alter table public.staff alter column role set default 'pending';

create or replace function public.handle_new_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.staff (user_id, email, role)
  values (new.id, coalesce(new.email, ''), 'pending')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- a waiting account has no role: every rule that asks for a role refuses it
create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(role, 'pending') from public.staff where user_id = auth.uid()
$$;

alter table public.advisor_items drop constraint if exists advisor_items_link_check;
update public.advisor_items set link = '' where link <> '' and link !~ '^/[^/\\]';
alter table public.advisor_items add constraint advisor_items_link_check check (link = '' or (link ~ '^/[^/\\]' and length(link) <= 200));

create or replace function public.add_advisor_items(p_token text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  added int := 0;
  skipped int := 0;
  rejected int := 0;
  v_ref text;
  v_title text;
  v_link text;
  v_due date;
begin
  if not public.prospect_feed_ok(p_token) then
    raise exception 'bad_token' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 20 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_ref := lower(btrim(coalesce(r->>'ref', '')));
    v_title := btrim(coalesce(r->>'title', ''));
    v_link := btrim(coalesce(r->>'link', ''));
    v_due := case when coalesce(r->>'due_date', '') ~ '^\d{4}-\d{2}-\d{2}$' then (r->>'due_date')::date end;
    if v_ref !~ '^[a-z0-9:_-]{3,80}$' or v_title = ''
       or coalesce(r->>'kind', 'مهمة') not in ('مهمة', 'اقتراح', 'مشكلة')
       or coalesce(r->>'priority', 'عادية') not in ('عاجلة', 'مهمة', 'عادية')
       or (v_link <> '' and (v_link !~ '^/[^/\\]' or length(v_link) > 200)) then
      rejected := rejected + 1;
      continue;
    end if;
    insert into public.advisor_items (ref, kind, priority, title, details, link, due_date, origin, created_by)
    values (v_ref, coalesce(r->>'kind', 'مهمة'), coalesce(r->>'priority', 'عادية'), left(v_title, 200),
            left(btrim(coalesce(r->>'details', '')), 2000), v_link, v_due, 'المراجعة اليومية', null)
    on conflict (ref) do nothing;
    if found then added := added + 1; else skipped := skipped + 1; end if;
  end loop;
  return jsonb_build_object('added', added, 'skipped', skipped, 'rejected', rejected);
end;
$$;

notify pgrst, 'reload schema';
