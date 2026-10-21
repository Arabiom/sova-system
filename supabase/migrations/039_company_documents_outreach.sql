-- 1. The company's own papers (commercial register, chamber membership, tax certificate…): each
--    with its number and dates, and its file (PDF or image) in a private bucket. The admin and
--    finance see them; the admin adds and removes them.
-- 2. Outreach on every client: whether they got a message about the exhibition, and whether they
--    suit us — set by hand, and «وصلته رسالة» set by itself when the system logs a WhatsApp message.

-- 1. Company documents ------------------------------------------------------------------------
create table if not exists public.company_documents (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  doc_type     text not null check (length(btrim(doc_type)) between 1 and 80),
  title        text not null default '' check (length(title) <= 200),
  number       text not null default '' check (length(number) <= 80),
  issue_date   date,
  expiry_date  date,
  notes        text not null default '' check (length(notes) <= 1000),
  file_path    text check (file_path is null or length(file_path) <= 300),
  file_name    text not null default '' check (length(file_name) <= 200),
  check (expiry_date is null or issue_date is null or expiry_date >= issue_date)
);
create index if not exists company_documents_expiry_idx on public.company_documents (expiry_date);

alter table public.company_documents enable row level security;
drop policy if exists company_documents_read on public.company_documents;
drop policy if exists company_documents_insert on public.company_documents;
drop policy if exists company_documents_update on public.company_documents;
drop policy if exists company_documents_delete on public.company_documents;
create policy company_documents_read on public.company_documents for select using (public.staff_role() in ('admin', 'finance'));
create policy company_documents_insert on public.company_documents for insert with check (public.staff_role() = 'admin');
create policy company_documents_update on public.company_documents for update using (public.staff_role() = 'admin') with check (public.staff_role() = 'admin');
create policy company_documents_delete on public.company_documents for delete using (public.staff_role() = 'admin');
grant select, insert, update, delete on public.company_documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-docs', 'company-docs', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists company_docs_read on storage.objects;
drop policy if exists company_docs_insert on storage.objects;
drop policy if exists company_docs_delete on storage.objects;
create policy company_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'company-docs' and public.staff_role() in ('admin', 'finance'));
create policy company_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'company-docs' and public.staff_role() = 'admin');
create policy company_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-docs' and public.staff_role() = 'admin');

-- 2. Outreach on clients ----------------------------------------------------------------------
alter table public.clients add column if not exists outreach text not null default '';
alter table public.clients drop constraint if exists clients_outreach_check;
alter table public.clients add constraint clients_outreach_check
  check (outreach in ('', 'وصلته رسالة', 'مناسب', 'غير مناسب'));
alter table public.clients add column if not exists outreach_at timestamptz;

create or replace function public.clients_outreach_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.outreach is distinct from old.outreach then
    new.outreach_at := case when new.outreach = '' then null else now() end;
  end if;
  return new;
end;
$$;
drop trigger if exists clients_outreach_touch on public.clients;
create trigger clients_outreach_touch before update on public.clients
  for each row execute function public.clients_outreach_touch();
revoke execute on function public.clients_outreach_touch() from public, anon;

-- A WhatsApp message the system logged marks the client «وصلته رسالة» (a choice made by hand —
-- «مناسب» or «غير مناسب» — is kept).
create or replace function public.whatsapp_log_last_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clients
     set last_contact_at = greatest(coalesce(last_contact_at, new.sent_at), new.sent_at),
         outreach = case when outreach = '' then 'وصلته رسالة' else outreach end
   where public.phone_key(phone) = public.phone_key(new.phone)
     and public.phone_key(new.phone) <> '';
  return new;
end;
$$;

-- clients the system already messaged
update public.clients c
   set outreach = 'وصلته رسالة', outreach_at = coalesce(c.last_contact_at, now())
 where c.outreach = '' and c.last_contact_at is not null;

notify pgrst, 'reload schema';
