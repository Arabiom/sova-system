-- Fixed expenses whose payment window ends on the last day of the month (every salary from
-- «عقود الفريق»): the months added automatically drifted — a window ending 30 June gave
-- 30 July, 30 August… and an unpaid salary looked late on the 31st. A window that ends on a
-- month's last day now ends on the last day of every month added, and the months already
-- added are corrected.
--
-- Needs 022. Nothing is deleted. Safe to run more than once.

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
      win_to := case
        when m.pay_to is not null and m.pay_to = (date_trunc('month', m.pay_to) + interval '1 month - 1 day')::date
          then (date_trunc('month', (m.pay_to + shift)::date) + interval '1 month - 1 day')::date
        else (m.pay_to + shift)::date
      end;
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

revoke execute on function public.generate_recurring_company_expenses() from public, anon;
grant execute on function public.generate_recurring_company_expenses() to authenticated;

update public.company_expenses x
   set pay_to = (date_trunc('month', x.pay_to) + interval '1 month - 1 day')::date,
       due_date = case when x.due_date = x.pay_to then (date_trunc('month', x.pay_to) + interval '1 month - 1 day')::date else x.due_date end
  from public.company_expenses o
 where x.series_id = o.id
   and o.pay_to is not null
   and o.pay_to = (date_trunc('month', o.pay_to) + interval '1 month - 1 day')::date
   and x.pay_to is not null
   and x.pay_to <> (date_trunc('month', x.pay_to) + interval '1 month - 1 day')::date;
