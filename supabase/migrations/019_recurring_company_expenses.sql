-- Fixed monthly company expenses (rent, salaries, subscriptions…): recorded once with
-- "recurring", then added automatically every month with the same amount and day.
-- • recurring / recurring_end: on the original row; unticking it (or an end date) stops it.
-- • series_id / period: on each added month (the original's id, 'YYYY-MM'); unique together,
--   so a month is never added twice, whoever opens the finance page first.
-- • generated_until: last month added for that original — a month deleted by hand is not
--   added again.
alter table public.company_expenses add column if not exists recurring boolean not null default false;
alter table public.company_expenses add column if not exists recurring_end date;
alter table public.company_expenses add column if not exists series_id uuid;
alter table public.company_expenses add column if not exists period text;
alter table public.company_expenses add column if not exists generated_until text;
create unique index if not exists company_expenses_series_period_uq on public.company_expenses (series_id, period);

-- Add every month due up to today (Muscat time) for each recurring expense. Runs with the
-- caller's rights, so only admin / finance (who may write company expenses) add anything.
create or replace function public.generate_recurring_company_expenses()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  m record;
  today date := (now() at time zone 'Asia/Muscat')::date;
  month_start date;
  day_in_month date;
  added integer := 0;
  n integer;
begin
  for m in select * from public.company_expenses where recurring for update loop
    month_start := (date_trunc('month', coalesce(to_date(m.generated_until, 'YYYY-MM'), m.date)) + interval '1 month')::date;
    while month_start <= today and (m.recurring_end is null or month_start <= m.recurring_end) loop
      day_in_month := least(month_start + (extract(day from m.date)::int - 1),
                            (month_start + interval '1 month - 1 day')::date);
      insert into public.company_expenses (date, category, description, amount, paid, due_date, notes, series_id, period, created_by)
      values (day_in_month, m.category, m.description, m.amount, false, day_in_month,
              'مصروف شهري ثابت — أُضيف تلقائياً', m.id, to_char(month_start, 'YYYY-MM'), m.created_by)
      on conflict (series_id, period) do nothing;
      get diagnostics n = row_count;
      added := added + n;
      update public.company_expenses set generated_until = to_char(month_start, 'YYYY-MM') where id = m.id;
      month_start := (month_start + interval '1 month')::date;
    end loop;
  end loop;
  return added;
end;
$$;

grant execute on function public.generate_recurring_company_expenses() to authenticated;
