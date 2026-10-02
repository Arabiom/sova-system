-- The money actually in the company's bank account, as read from the bank (statement or app).
-- The system cannot see the bank, so finance records the balance by hand; every update is kept,
-- so the latest is shown and the history stays. Compared on the finance page with the cash the
-- system expects (collected − paid), the difference shows what may not be recorded yet.
--
-- Additive only. Safe to run more than once.

create table if not exists public.bank_balances (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  as_of       date not null default current_date,
  amount      numeric not null,
  account     text not null default '',
  note        text not null default ''
);
create index if not exists bank_balances_as_of_idx on public.bank_balances (as_of desc, created_at desc);

alter table public.bank_balances enable row level security;

drop policy if exists bank_balances_read on public.bank_balances;
drop policy if exists bank_balances_insert on public.bank_balances;
drop policy if exists bank_balances_delete on public.bank_balances;

create policy bank_balances_read on public.bank_balances for select
  using (public.staff_role() in ('admin', 'finance', 'viewer'));
create policy bank_balances_insert on public.bank_balances for insert
  with check (public.staff_role() in ('admin', 'finance'));
create policy bank_balances_delete on public.bank_balances for delete
  using (public.staff_role() in ('admin', 'finance'));
