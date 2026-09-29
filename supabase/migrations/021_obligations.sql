-- Obligations: money the company must pay later — refunds owed to participants, postponed
-- cheques, debts or payments agreed for a later date. Each keeps its original due date, the
-- current one and every postponement (when, to what date, why).
create table if not exists public.obligations (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  kind          text not null default 'أخرى',
  party         text not null default '',
  exhibitor_id  uuid references public.exhibitors (id) on delete set null,
  exhibition_id uuid references public.exhibitions (id) on delete set null,
  description   text not null default '',
  amount        numeric not null check (amount > 0),
  cheque_no     text default '',
  original_due  date,
  due_date      date,
  postponements jsonb not null default '[]'::jsonb,
  status        text not null default 'قائم' check (status in ('قائم', 'مدفوع')),
  paid_at       date,
  refund_invoice text default '',
  notes         text default ''
);

create index if not exists obligations_due_idx on public.obligations (status, due_date);

alter table public.obligations enable row level security;

drop policy if exists obligations_read on public.obligations;
drop policy if exists obligations_write on public.obligations;

create policy obligations_read on public.obligations for select
  using (public.staff_role() in ('admin', 'finance', 'viewer'));
create policy obligations_write on public.obligations for all
  using (public.staff_role() in ('admin', 'finance'))
  with check (public.staff_role() in ('admin', 'finance'));

grant select, insert, update, delete on public.obligations to authenticated;
