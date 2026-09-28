-- 015: WhatsApp — saved message templates and a log of every message sent
--
-- • templates: every staff member reads them; anyone who can write adds their own; the owner
--   (or the admin) edits and deletes
-- • log: one row per message opened from the WhatsApp page (who, to whom, when, which text).
--   admin / finance / viewer read all of it, everyone else only what they sent
-- • whatsapp_last_contact(): when each number was last messaged and by whom — without the
--   message text — so no one messages the same person twice by mistake
--
-- Needs 003, 010 and 011 first. Additive only. Safe to run more than once.

create table if not exists public.whatsapp_templates (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  name        text not null,
  body        text not null
);

alter table public.whatsapp_templates enable row level security;

drop policy if exists whatsapp_templates_read on public.whatsapp_templates;
drop policy if exists whatsapp_templates_insert on public.whatsapp_templates;
drop policy if exists whatsapp_templates_update on public.whatsapp_templates;
drop policy if exists whatsapp_templates_delete on public.whatsapp_templates;

create policy whatsapp_templates_read on public.whatsapp_templates for select using (public.staff_role() is not null);
create policy whatsapp_templates_insert on public.whatsapp_templates for insert
  with check (public.can_write() and created_by = auth.uid());
create policy whatsapp_templates_update on public.whatsapp_templates for update
  using (public.can_write() and (created_by = auth.uid() or public.staff_role() = 'admin'))
  with check (public.can_write() and (created_by = auth.uid() or public.staff_role() = 'admin'));
create policy whatsapp_templates_delete on public.whatsapp_templates for delete
  using (public.can_write() and (created_by = auth.uid() or public.staff_role() = 'admin'));

create table if not exists public.whatsapp_log (
  id             uuid primary key default gen_random_uuid(),
  sent_at        timestamptz not null default now(),
  sent_by        uuid default auth.uid(),
  campaign_id    uuid not null,
  campaign_name  text not null default '',
  source         text not null default '',   -- exhibitor | client | manual
  record_id      uuid,
  name           text not null default '',
  phone          text not null,
  body           text not null default ''
);

create index if not exists whatsapp_log_sent_at_idx on public.whatsapp_log (sent_at desc);
create index if not exists whatsapp_log_phone_idx on public.whatsapp_log (public.phone_key(phone));

alter table public.whatsapp_log enable row level security;

drop policy if exists whatsapp_log_read on public.whatsapp_log;
drop policy if exists whatsapp_log_insert on public.whatsapp_log;

create policy whatsapp_log_read on public.whatsapp_log for select
  using (sent_by = auth.uid() or public.staff_role() in ('admin', 'finance', 'viewer'));
create policy whatsapp_log_insert on public.whatsapp_log for insert
  with check (public.can_write() and sent_by = auth.uid());

create or replace function public.whatsapp_last_contact()
returns table (phone text, sent_at timestamptz, sent_by_name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (public.phone_key(l.phone))
         public.phone_key(l.phone), l.sent_at, coalesce(nullif(s.name, ''), s.email, '')
    from public.whatsapp_log l
    left join public.staff s on s.user_id = l.sent_by
   where public.staff_role() is not null
     and l.sent_at > now() - interval '90 days'
   order by public.phone_key(l.phone), l.sent_at desc
$$;

grant execute on function public.whatsapp_last_contact() to authenticated;
