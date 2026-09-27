-- 004: participant registration form + payments awaiting confirmation
--
-- • exhibitors: the extra fields of the registration form (civil ID, products, booth package,
--   extras, terms accepted)
-- • payments: status (مؤكد / بانتظار التأكيد), transfer reference, who recorded and who confirmed
-- • marketing may ADD a payment, but only as "بانتظار التأكيد"; admin/finance confirm it.
--
-- Needs 003 first. Additive only — no data is deleted. Safe to run more than once.

alter table public.exhibitors add column if not exists civil_id text default '';
alter table public.exhibitors add column if not exists products text default '';
alter table public.exhibitors add column if not exists booth_type text default '';
alter table public.exhibitors add column if not exists extras jsonb not null default '[]'::jsonb;
alter table public.exhibitors add column if not exists terms_accepted boolean not null default false;

alter table public.payments add column if not exists status text not null default 'مؤكد';
alter table public.payments add column if not exists transfer_ref text default '';
alter table public.payments add column if not exists created_by uuid default auth.uid();
alter table public.payments add column if not exists confirmed_by uuid;
alter table public.payments add column if not exists confirmed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_status_check') then
    alter table public.payments add constraint payments_status_check check (status in ('مؤكد', 'بانتظار التأكيد'));
  end if;
end;
$$;

-- Marketing: insert only, and only as awaiting confirmation (admin/finance keep payments_write).
drop policy if exists payments_submit on public.payments;
create policy payments_submit on public.payments for insert
  with check (public.staff_role() = 'marketing' and status = 'بانتظار التأكيد');
