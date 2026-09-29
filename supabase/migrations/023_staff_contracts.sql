-- Fixed-term contracts with the team (designer, marketer…): who, from when to when, and how
-- they are paid (a monthly salary or one lump sum). Each contract keeps its pay as a company
-- expense (expense_id): a monthly salary is a fixed monthly expense that stops at the
-- contract's end; a lump sum is one expense due within the contract.
create table if not exists public.staff_contracts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  name        text not null,
  title       text not null default '',
  user_id     uuid,
  start_date  date not null,
  end_date    date not null,
  pay_type    text not null default 'شهري' check (pay_type in ('شهري', 'مبلغ مقطوع')),
  amount      numeric not null check (amount > 0),
  expense_id  uuid references public.company_expenses (id) on delete set null,
  notes       text default '',
  check (end_date >= start_date)
);

create index if not exists staff_contracts_dates_idx on public.staff_contracts (start_date, end_date);

alter table public.staff_contracts enable row level security;

drop policy if exists staff_contracts_read on public.staff_contracts;
drop policy if exists staff_contracts_write on public.staff_contracts;

create policy staff_contracts_read on public.staff_contracts for select
  using (public.staff_role() in ('admin', 'finance', 'viewer'));
create policy staff_contracts_write on public.staff_contracts for all
  using (public.staff_role() in ('admin', 'finance'))
  with check (public.staff_role() in ('admin', 'finance'));

grant select, insert, update, delete on public.staff_contracts to authenticated;
