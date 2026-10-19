-- «الموظفون الرقميون» — phase 1: the data, with the rules kept in the database itself.
-- No sending and no outside service here: campaigns are prepared, approved and followed up.
--
-- • clients.contact_source: where the number came from (consent matters for WhatsApp):
--   نموذج الموقع | صفحة البايو | راسلنا بنفسه | عارض سابق | قائمة مستوردة   ('' = not set yet).
--   (clients.source stays as it was: how the client heard of us.)
-- • clients.last_contact_at: the last WhatsApp message to that number, kept up to date from
--   whatsapp_log and from campaign replies.
-- • opt_outs: numbers that asked to stop. Never added to a campaign; removing one is admin only.
-- • campaigns: مسودة → بانتظار الاعتماد → معتمدة → أُرسلت (or ملغاة). Only the admin approves.
--   Changing an approved campaign's text sends it back to «بانتظار الاعتماد».
-- • campaign_recipients: one row per number and campaign, with its delivery status. Recipients
--   are fixed once a campaign is approved.
-- • followups: who to call back, when, and why.
--
-- Additive only. Safe to run more than once.

-- 1. Clients: where the number came from, and the last contact ------------------------------
alter table public.clients add column if not exists contact_source text not null default '';
alter table public.clients add column if not exists last_contact_at timestamptz;
alter table public.clients drop constraint if exists clients_contact_source_check;
alter table public.clients add constraint clients_contact_source_check
  check (contact_source in ('', 'نموذج الموقع', 'صفحة البايو', 'راسلنا بنفسه', 'عارض سابق', 'قائمة مستوردة'));
create index if not exists clients_phone_key_idx on public.clients (public.phone_key(phone));

-- 2. Stop list ---------------------------------------------------------------------------------
create table if not exists public.opt_outs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  phone       text not null,
  client_id   uuid references public.clients (id) on delete set null,
  reason      text not null default ''
);
create unique index if not exists opt_outs_phone_key_idx on public.opt_outs (public.phone_key(phone));

-- 3. Campaigns -----------------------------------------------------------------------------------
create table if not exists public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  name          text not null,
  template_name text not null default '',
  body          text not null default '',
  segment       jsonb not null default '{}'::jsonb,
  exhibition_id uuid references public.exhibitions (id) on delete set null,
  status        text not null default 'مسودة',
  approved_by   uuid,
  approved_at   timestamptz,
  notes         text not null default '',
  constraint campaigns_status_check check (status in ('مسودة', 'بانتظار الاعتماد', 'معتمدة', 'أُرسلت', 'ملغاة'))
);

create table if not exists public.campaign_recipients (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  client_id   uuid references public.clients (id) on delete set null,
  name        text not null default '',
  phone       text not null,
  status      text not null default 'بانتظار',
  status_at   timestamptz,
  constraint campaign_recipients_status_check check (status in ('بانتظار', 'أُرسلت', 'قُرئت', 'رد', 'طلب الإيقاف', 'فشل'))
);
create index if not exists campaign_recipients_campaign_idx on public.campaign_recipients (campaign_id);
create unique index if not exists campaign_recipients_phone_idx on public.campaign_recipients (campaign_id, public.phone_key(phone));

-- 4. Follow-ups ----------------------------------------------------------------------------------
create table if not exists public.followups (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  client_id   uuid references public.clients (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  assigned_to uuid,
  due_date    date not null default ((now() at time zone 'Asia/Muscat')::date),
  note        text not null default '',
  status      text not null default 'مفتوحة',
  done_at     timestamptz,
  constraint followups_status_check check (status in ('مفتوحة', 'تمت'))
);
create index if not exists followups_open_idx on public.followups (status, due_date);

-- 5. Rules ---------------------------------------------------------------------------------------
-- Running as the database owner (SQL editor, future server functions) is trusted; signed-in
-- staff go through the rules.
create or replace function public.is_staff_session()
returns boolean
language sql
stable
as $$
  select current_user in ('anon', 'authenticated')
$$;

-- Campaign status: only the admin approves; approval is stamped; editing an approved text
-- sends it back for approval; «أُرسلت» only after approval.
create or replace function public.campaigns_guard()
returns trigger
language plpgsql
-- runs as the caller (not security definer), so the rules see who is acting
set search_path = public
as $$
declare
  admin boolean := not public.is_staff_session() or public.staff_role() = 'admin';
begin
  if tg_op = 'INSERT' then
    if new.status not in ('مسودة', 'بانتظار الاعتماد') then
      raise exception 'campaign_new_status' using errcode = '22023';
    end if;
    new.approved_by := null;
    new.approved_at := null;
    return new;
  end if;

  -- an approved (or sent) campaign whose message changes needs approving again
  if old.status in ('معتمدة', 'أُرسلت') and new.status = old.status
     and (new.body is distinct from old.body or new.segment is distinct from old.segment) then
    if old.status = 'أُرسلت' then
      raise exception 'campaign_sent_locked' using errcode = '42501';
    end if;
    new.status := 'بانتظار الاعتماد';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'معتمدة' then
      if not admin then
        raise exception 'campaign_approve_admin_only' using errcode = '42501';
      end if;
      if old.status <> 'بانتظار الاعتماد' then
        raise exception 'campaign_approve_from_pending' using errcode = '22023';
      end if;
      if not exists (select 1 from public.campaign_recipients r where r.campaign_id = new.id) then
        raise exception 'campaign_no_recipients' using errcode = '22023';
      end if;
      new.approved_by := auth.uid();
      new.approved_at := now();
    elsif new.status = 'أُرسلت' then
      if old.status <> 'معتمدة' then
        raise exception 'campaign_send_needs_approval' using errcode = '42501';
      end if;
    else
      if old.status = 'أُرسلت' then
        raise exception 'campaign_sent_locked' using errcode = '42501';
      end if;
      new.approved_by := null;
      new.approved_at := null;
    end if;
  elsif new.status = 'معتمدة' and (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at) then
    raise exception 'campaign_approve_admin_only' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists campaigns_guard on public.campaigns;
create trigger campaigns_guard before insert or update on public.campaigns
  for each row execute function public.campaigns_guard();

-- Recipients: never a number on the stop list; the list is fixed once the campaign is approved
-- (only delivery statuses change after that).
create or replace function public.campaign_recipients_guard()
returns trigger
language plpgsql
-- runs as the caller (not security definer), so the rules see who is acting
set search_path = public
as $$
declare
  st text;
begin
  select c.status into st from public.campaigns c where c.id = coalesce(new.campaign_id, old.campaign_id);
  if tg_op = 'DELETE' then
    -- the stop list itself may clear a number from a campaign not yet sent
    if st in ('معتمدة', 'أُرسلت') and public.is_staff_session()
       and not exists (select 1 from public.opt_outs o where public.phone_key(o.phone) = public.phone_key(old.phone)) then
      raise exception 'campaign_locked' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if st not in ('مسودة', 'بانتظار الاعتماد') then
      raise exception 'campaign_locked' using errcode = '42501';
    end if;
    if exists (select 1 from public.opt_outs o where public.phone_key(o.phone) = public.phone_key(new.phone)) then
      raise exception 'opted_out' using errcode = '23514';
    end if;
    if public.phone_key(new.phone) !~ '^\d{8,15}$' then
      raise exception 'invalid_phone' using errcode = '22023';
    end if;
    new.status := 'بانتظار';
    new.status_at := null;
    return new;
  end if;
  -- UPDATE: the number and campaign stay; the status moves
  if new.phone is distinct from old.phone or new.campaign_id is distinct from old.campaign_id then
    raise exception 'campaign_locked' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    new.status_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_recipients_guard on public.campaign_recipients;
create trigger campaign_recipients_guard before insert or update or delete on public.campaign_recipients
  for each row execute function public.campaign_recipients_guard();

-- A number put on the stop list leaves every campaign not sent yet.
create or replace function public.opt_outs_apply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.campaign_recipients r
   using public.campaigns c
   where c.id = r.campaign_id
     and c.status <> 'أُرسلت'
     and public.phone_key(r.phone) = public.phone_key(new.phone);
  return new;
end;
$$;

drop trigger if exists opt_outs_apply on public.opt_outs;
create trigger opt_outs_apply after insert on public.opt_outs
  for each row execute function public.opt_outs_apply();

-- A recipient asking to stop goes onto the stop list.
create or replace function public.campaign_recipients_stop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'طلب الإيقاف' and old.status is distinct from new.status then
    insert into public.opt_outs (phone, client_id, reason)
    values (new.phone, new.client_id, 'طلب الإيقاف من حملة')
    on conflict do nothing;
  end if;
  if new.status in ('أُرسلت', 'رد') and old.status is distinct from new.status and new.client_id is not null then
    update public.clients set last_contact_at = now() where id = new.client_id;
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_recipients_stop on public.campaign_recipients;
create trigger campaign_recipients_stop after update on public.campaign_recipients
  for each row execute function public.campaign_recipients_stop();

-- Last contact: every WhatsApp message logged by the system counts.
create or replace function public.whatsapp_log_last_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clients
     set last_contact_at = greatest(coalesce(last_contact_at, new.sent_at), new.sent_at)
   where public.phone_key(phone) = public.phone_key(new.phone)
     and public.phone_key(new.phone) <> '';
  return new;
end;
$$;

drop trigger if exists whatsapp_log_last_contact on public.whatsapp_log;
create trigger whatsapp_log_last_contact after insert on public.whatsapp_log
  for each row execute function public.whatsapp_log_last_contact();

-- the last contact of the messages already sent
update public.clients c
   set last_contact_at = l.last_at
  from (select public.phone_key(phone) as k, max(sent_at) as last_at from public.whatsapp_log group by 1) l
 where public.phone_key(c.phone) = l.k
   and l.k <> ''
   and (c.last_contact_at is null or c.last_contact_at < l.last_at);

-- 6. Access ------------------------------------------------------------------------------------
alter table public.opt_outs enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.followups enable row level security;

drop policy if exists opt_outs_read on public.opt_outs;
drop policy if exists opt_outs_insert on public.opt_outs;
drop policy if exists opt_outs_delete on public.opt_outs;
create policy opt_outs_read on public.opt_outs for select using (public.staff_role() is not null);
create policy opt_outs_insert on public.opt_outs for insert with check (public.can_write());
create policy opt_outs_delete on public.opt_outs for delete using (public.staff_role() = 'admin');

drop policy if exists campaigns_read on public.campaigns;
drop policy if exists campaigns_insert on public.campaigns;
drop policy if exists campaigns_update on public.campaigns;
drop policy if exists campaigns_delete on public.campaigns;
create policy campaigns_read on public.campaigns for select using (public.staff_role() is not null);
create policy campaigns_insert on public.campaigns for insert with check (public.can_write());
create policy campaigns_update on public.campaigns for update using (public.can_write()) with check (public.can_write());
create policy campaigns_delete on public.campaigns for delete
  using (public.staff_role() = 'admin' or (public.can_write() and status in ('مسودة', 'بانتظار الاعتماد')));

drop policy if exists campaign_recipients_read on public.campaign_recipients;
drop policy if exists campaign_recipients_insert on public.campaign_recipients;
drop policy if exists campaign_recipients_update on public.campaign_recipients;
drop policy if exists campaign_recipients_delete on public.campaign_recipients;
create policy campaign_recipients_read on public.campaign_recipients for select using (public.staff_role() is not null);
create policy campaign_recipients_insert on public.campaign_recipients for insert with check (public.can_write());
create policy campaign_recipients_update on public.campaign_recipients for update using (public.can_write()) with check (public.can_write());
create policy campaign_recipients_delete on public.campaign_recipients for delete using (public.can_write());

drop policy if exists followups_read on public.followups;
drop policy if exists followups_insert on public.followups;
drop policy if exists followups_update on public.followups;
drop policy if exists followups_delete on public.followups;
create policy followups_read on public.followups for select using (public.staff_role() is not null);
create policy followups_insert on public.followups for insert with check (public.can_write());
create policy followups_update on public.followups for update using (public.can_write()) with check (public.can_write());
create policy followups_delete on public.followups for delete
  using (public.staff_role() = 'admin' or (public.can_write() and created_by = auth.uid()));

grant select, insert, update, delete on public.opt_outs, public.campaigns, public.campaign_recipients, public.followups to authenticated;

revoke execute on function public.campaigns_guard() from public, anon;
revoke execute on function public.campaign_recipients_guard() from public, anon;
revoke execute on function public.opt_outs_apply() from public, anon;
revoke execute on function public.campaign_recipients_stop() from public, anon;
revoke execute on function public.whatsapp_log_last_contact() from public, anon;

notify pgrst, 'reload schema';
