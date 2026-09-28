-- 007: marketing no longer reads the payment log
--
-- Marketing sees participants' names and details and the operating indicators, not income or
-- amounts. They can still record a payment on the registration form (as "بانتظار التأكيد",
-- policy payments_submit from 004) — they just cannot read the payment log back.
--
-- Needs 003 and 004 first. Safe to run more than once.

drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select
  using (public.staff_role() in ('admin', 'finance'));
