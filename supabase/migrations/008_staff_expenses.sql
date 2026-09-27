-- 008: expenses paid by staff for the company, with their invoices / receipts attached
--
-- • every employee records what they spent (amount, date, what for, exhibition) and attaches
--   the invoice; they see only their own
-- • admin and finance (the accountant) see everyone's, approve / reject them and mark them
--   reimbursed
-- • invoices live in the PRIVATE "expense-receipts" bucket, one folder per employee
--
-- Needs 003 first. Additive only — no data is deleted. Safe to run more than once.

create table if not exists public.staff_expenses (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exhibition_id   uuid references public.exhibitions (id) on delete set null,
  date            date not null default current_date,
  amount          numeric not null check (amount > 0),
  category        text default '',
  description     text not null,
  vendor          text default '',
  payment_method  text default '',
  receipt_path    text,
  status          text not null default 'بانتظار المراجعة'
                  check (status in ('بانتظار المراجعة', 'معتمد', 'مرفوض', 'تم التعويض')),
  review_note     text default '',
  reviewed_by     uuid,
  reviewed_at     timestamptz
);

create index if not exists staff_expenses_user_idx on public.staff_expenses (user_id, date desc);

alter table public.staff_expenses enable row level security;

drop policy if exists staff_expenses_read on public.staff_expenses;
drop policy if exists staff_expenses_insert on public.staff_expenses;
drop policy if exists staff_expenses_update on public.staff_expenses;
drop policy if exists staff_expenses_delete on public.staff_expenses;

-- own expenses, or everyone's for admin/finance
create policy staff_expenses_read on public.staff_expenses for select
  using (user_id = auth.uid() or public.staff_role() in ('admin', 'finance'));
-- anyone on staff adds their own, always as awaiting review
create policy staff_expenses_insert on public.staff_expenses for insert
  with check (public.staff_role() is not null and user_id = auth.uid() and status = 'بانتظار المراجعة');
-- the employee edits their own while it awaits review; admin/finance review any
create policy staff_expenses_update on public.staff_expenses for update
  using ((user_id = auth.uid() and status = 'بانتظار المراجعة') or public.staff_role() in ('admin', 'finance'))
  with check ((user_id = auth.uid() and status = 'بانتظار المراجعة') or public.staff_role() in ('admin', 'finance'));
create policy staff_expenses_delete on public.staff_expenses for delete
  using ((user_id = auth.uid() and status = 'بانتظار المراجعة') or public.staff_role() in ('admin', 'finance'));

-- finance (the accountant) needs staff names to review expenses
drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select
  using (user_id = auth.uid() or public.staff_role() in ('admin', 'finance'));

-- receipts: private bucket, folder = the employee's user id
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists expense_receipts_read on storage.objects;
drop policy if exists expense_receipts_insert on storage.objects;
drop policy if exists expense_receipts_delete on storage.objects;

create policy expense_receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.staff_role() in ('admin', 'finance')));
create policy expense_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and public.staff_role() is not null
              and ((storage.foldername(name))[1] = auth.uid()::text or public.staff_role() in ('admin', 'finance')));
create policy expense_receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'expense-receipts'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.staff_role() in ('admin', 'finance')));
