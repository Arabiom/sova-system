-- Fixed company expenses repeat every 1, 3 or 6 months (chosen on the form; the ones recorded
-- before this update were monthly).
alter table public.company_expenses add column if not exists recurring_every integer not null default 1;
alter table public.company_expenses drop constraint if exists company_expenses_recurring_every_check;
alter table public.company_expenses add constraint company_expenses_recurring_every_check check (recurring_every in (1, 3, 6));

-- Recurring expenses (019, 020), now stepping by 1, 3 or 6 months.
create or replace function public.generate_recurring_company_expenses()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  m record;
  today date := (now() at time zone 'Asia/Muscat')::date;
  step interval;
  month_start date;
  day_in_month date;
  shift interval;
  win_from date;
  win_to date;
  added integer := 0;
  n integer;
begin
  for m in select * from public.company_expenses where recurring for update loop
    step := make_interval(months => coalesce(m.recurring_every, 1));
    month_start := (date_trunc('month', coalesce(to_date(m.generated_until, 'YYYY-MM'), m.date)) + step)::date;
    while month_start <= today and (m.recurring_end is null or month_start <= m.recurring_end) loop
      day_in_month := least(month_start + (extract(day from m.date)::int - 1),
                            (month_start + interval '1 month - 1 day')::date);
      shift := make_interval(months => ((extract(year from month_start) - extract(year from m.date)) * 12
                                        + extract(month from month_start) - extract(month from m.date))::int);
      win_from := (m.pay_from + shift)::date;
      win_to := (m.pay_to + shift)::date;
      insert into public.company_expenses (date, category, description, amount, paid, due_date, pay_from, pay_to, notes, series_id, period, created_by)
      values (day_in_month, m.category, m.description, m.amount, false, coalesce(win_to, day_in_month), win_from, win_to,
              'مصروف ثابت — أُضيف تلقائياً', m.id, to_char(month_start, 'YYYY-MM'), m.created_by)
      on conflict (series_id, period) do nothing;
      get diagnostics n = row_count;
      added := added + n;
      update public.company_expenses set generated_until = to_char(month_start, 'YYYY-MM') where id = m.id;
      month_start := (month_start + step)::date;
    end loop;
  end loop;
  return added;
end;
$$;

grant execute on function public.generate_recurring_company_expenses() to authenticated;
