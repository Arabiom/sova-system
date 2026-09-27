-- 012: company expenses not tied to one exhibition (office rent, salaries, licences, …)
--
-- • admin / finance add, edit and delete them; the viewer (مطّلع) reads them
-- • an optional invoice goes in the private "expense-receipts" bucket, folder "company/"
--
-- Needs 003, 008 and 011 first. Additive only — no data is deleted. Safe to run more than once.

create table if not exists public.company_expenses (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  date          date not null default current_date,
  category      text not null default 'أخرى',
  description   text not null,
  amount        numeric not null check (amount > 0),
  paid          boolean not null default true,
  due_date      date,
  receipt_path  text,
  notes         text default ''
);

create index if not exists company_expenses_date_idx on public.company_expenses (date desc);

alter table public.company_expenses enable row level security;

drop policy if exists company_expenses_read on public.company_expenses;
drop policy if exists company_expenses_write on public.company_expenses;

create policy company_expenses_read on public.company_expenses for select
  using (public.staff_role() in ('admin', 'finance', 'viewer'));
create policy company_expenses_write on public.company_expenses for all
  using (public.staff_role() in ('admin', 'finance'))
  with check (public.staff_role() in ('admin', 'finance'));
