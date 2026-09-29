-- Fixed-term contracts with the team (designer, marketer…): who, from when to when, and how
-- they are paid — a monthly salary, one lump sum, or commission only — plus an optional
-- commission on sales.
-- • Salary / lump sum are kept as a company expense (expense_id): a monthly salary is a fixed
--   monthly expense that stops at the contract's end; a lump sum is one expense due by the end.
-- • Commission: commission_pct % of what the participants registered by the employee
--   (exhibitors.created_by = user_id) during the contract have paid (commission_base
--   'المحصّل') or signed for ('قيمة العقود'). commission_recorded = the part already entered
--   as an expense, so each amount is recorded once.
create table if not exists public.staff_contracts (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  created_by          uuid default auth.uid(),
  name                text not null,
  title               text not null default '',
  user_id             uuid,
  start_date          date not null,
  end_date            date not null,
  pay_type            text not null default 'شهري' check (pay_type in ('شهري', 'مبلغ مقطوع', 'عمولة فقط')),
  amount              numeric not null default 0 check (amount >= 0),
  commission_pct      numeric not null default 0 check (commission_pct >= 0 and commission_pct <= 100),
  commission_base     text not null default 'المحصّل' check (commission_base in ('المحصّل', 'قيمة العقود')),
  commission_recorded numeric not null default 0,
  expense_id          uuid references public.company_expenses (id) on delete set null,
  notes               text default '',
  check (end_date >= start_date),
  check (amount > 0 or commission_pct > 0)
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
