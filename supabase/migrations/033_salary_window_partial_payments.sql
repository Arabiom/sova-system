-- Salaries: one payment window for the whole team, and paying in parts.
-- • company_settings.salary_pay_from / salary_pay_to: the days of the month salaries are paid
--   (23 → 28 by default). Each month's salary of a team contract is due in that window of its
--   own month: «upcoming» before, «due now» inside, «late» after.
--   apply_salary_pay_window(from, to) — admin / finance — saves the days and moves every
--   unpaid salary (and each salary's record the next months are made from) to the window.
-- • company_expense_payments: what was actually paid of a company expense, when, with its
--   receipt. A salary can be paid in parts; it is «paid» once its payments reach the amount.
--
-- Needs 032. Nothing is deleted. Safe to run more than once.

alter table public.company_settings add column if not exists salary_pay_from integer not null default 23;
alter table public.company_settings add column if not exists salary_pay_to integer not null default 28;
alter table public.company_settings drop constraint if exists company_settings_salary_days_check;
alter table public.company_settings add constraint company_settings_salary_days_check
  check (salary_pay_from between 1 and 28 and salary_pay_to between 1 and 28 and salary_pay_to >= salary_pay_from);

create table if not exists public.company_expense_payments (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  expense_id    uuid not null references public.company_expenses (id) on delete cascade,
  date          date not null default ((now() at time zone 'Asia/Muscat')::date),
  amount        numeric not null check (amount > 0),
  note          text not null default '',
  receipt_path  text
);

create index if not exists company_expense_payments_expense_idx on public.company_expense_payments (expense_id);

alter table public.company_expense_payments enable row level security;

drop policy if exists company_expense_payments_read on public.company_expense_payments;
drop policy if exists company_expense_payments_write on public.company_expense_payments;

create policy company_expense_payments_read on public.company_expense_payments for select
  using (public.staff_role() in ('admin', 'finance', 'viewer'));
create policy company_expense_payments_write on public.company_expense_payments for all
  using (public.staff_role() in ('admin', 'finance'))
  with check (public.staff_role() in ('admin', 'finance'));

grant select, insert, update, delete on public.company_expense_payments to authenticated;

-- Salaries of team contracts: each monthly contract's salary record, the months added from it,
-- and the records of an earlier salary of the same contract (same description).
create or replace function public.team_salary_ids()
returns setof uuid
language sql
stable
set search_path = public
as $$
  with origins as (
    select x.id
      from public.company_expenses x
     where x.series_id is null
       and (x.id in (select c.expense_id from public.staff_contracts c where c.pay_type = 'شهري' and c.expense_id is not null)
            or (x.category = 'رواتب وأجور' and x.notes like '%عقود الفريق%' and x.description like 'راتب %'))
  )
  select id from origins
  union
  select x.id from public.company_expenses x where x.series_id in (select id from origins)
$$;

create or replace function public.apply_salary_pay_window(p_from integer, p_to integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if current_user in ('anon', 'authenticated') and coalesce(public.staff_role(), '') not in ('admin', 'finance') then
    raise exception 'only admin or finance can change the salary payment days' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from < 1 or p_to > 28 or p_to < p_from then
    raise exception 'salary payment days must be between 1 and 28, «from» not after «to»' using errcode = '22023';
  end if;
  update public.company_settings set salary_pay_from = p_from, salary_pay_to = p_to, updated_at = now() where id = 1;
  -- The month of each salary: its period, or the month of its date (a salary's own record).
  update public.company_expenses x
     set pay_from = make_date(extract(year from m.d)::int, extract(month from m.d)::int, p_from),
         pay_to = make_date(extract(year from m.d)::int, extract(month from m.d)::int, p_to),
         due_date = make_date(extract(year from m.d)::int, extract(month from m.d)::int, p_to)
    from (select y.id, coalesce(to_date(y.period, 'YYYY-MM'), date_trunc('month', y.date)::date) as d
            from public.company_expenses y
           where y.id in (select public.team_salary_ids())) m
   where x.id = m.id
     and (x.paid = false or x.series_id is null);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.team_salary_ids() from public, anon;
revoke execute on function public.apply_salary_pay_window(integer, integer) from public, anon;
grant execute on function public.team_salary_ids() to authenticated;
grant execute on function public.apply_salary_pay_window(integer, integer) to authenticated;

select public.apply_salary_pay_window(
  (select salary_pay_from from public.company_settings where id = 1),
  (select salary_pay_to from public.company_settings where id = 1)
);
