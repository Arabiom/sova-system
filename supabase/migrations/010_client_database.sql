-- 010: the shared client / prospect database
--
-- • every employee adds the projects they come across; each sees only their own clients,
--   admin/finance see the whole database
-- • one phone number = one client: a number already in the database cannot be added again
--   (older duplicates are left as they are; the app lists them for the manager)
-- • find_client(): any employee can check a number or name against the WHOLE database and
--   learn who added it — without seeing the other employees' client details
--
-- Needs 003 and 009 first. Additive only — no data is deleted. Safe to run more than once.

-- Same rule as phoneKey() in the app: digits only, without 00 / 968 in front.
create or replace function public.phone_key(p text)
returns text
language sql
immutable
as $$
  select case when length(d) > 8 and d like '968%' then substr(d, 4) else d end
  from (select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^00', '') as d) x
$$;

create index if not exists clients_phone_key_idx on public.clients (public.phone_key(phone));

-- Who added a record, for messages: the staff name, else their email.
create or replace function public.staff_display_name(uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(name), ''), nullif(email, ''), 'موظف') from public.staff where user_id = uid
$$;

-- Block a number that is already in the database.
create or replace function public.clients_no_duplicate_phone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing record;
begin
  if public.phone_key(new.phone) = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and public.phone_key(new.phone) = public.phone_key(old.phone) then
    return new;
  end if;
  select c.name, c.created_at, public.staff_display_name(c.created_by) as owner
    into existing
    from public.clients c
   where public.phone_key(c.phone) = public.phone_key(new.phone) and c.id <> new.id
   limit 1;
  if found then
    raise exception 'هذا المشروع مسجل مسبقاً: «%» — أضافه %', existing.name, coalesce(existing.owner, 'الإدارة')
      using errcode = 'P0001', hint = 'duplicate_client';
  end if;
  return new;
end;
$$;

drop trigger if exists clients_no_duplicate_phone on public.clients;
create trigger clients_no_duplicate_phone
  before insert or update of phone on public.clients
  for each row execute function public.clients_no_duplicate_phone();

-- Search the whole database by number (exact) or name (contains). Other employees' clients
-- come back with their name, who added them and when — not their contact details.
create or replace function public.find_client(q text)
returns table (id uuid, name text, phone text, owner_name text, owner_is_me boolean, created_at timestamptz, matched_by text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         c.name,
         case when c.created_by = auth.uid() or public.staff_role() in ('admin', 'finance') then c.phone end,
         coalesce(public.staff_display_name(c.created_by), 'الإدارة'),
         c.created_by = auth.uid(),
         c.created_at,
         case when length(public.phone_key(q)) >= 7 and public.phone_key(c.phone) = public.phone_key(q) then 'phone' else 'name' end
    from public.clients c
   where public.staff_role() is not null
     and ((length(public.phone_key(q)) >= 7 and public.phone_key(c.phone) = public.phone_key(q))
          or (length(trim(q)) >= 3 and c.name ilike '%' || trim(q) || '%'))
   order by case when length(public.phone_key(q)) >= 7 and public.phone_key(c.phone) = public.phone_key(q) then 0 else 1 end, c.created_at
   limit 10
$$;

grant execute on function public.find_client(text) to authenticated;
grant execute on function public.phone_key(text) to authenticated;

-- Each employee sees their own clients; admin/finance see all.
drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select
  using (public.staff_role() in ('admin', 'finance') or (public.staff_role() is not null and created_by = auth.uid()));
