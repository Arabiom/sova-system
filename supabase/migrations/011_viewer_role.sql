-- 011: "مطّلع" (viewer) — an administrator who looks at everything and changes nothing
--
-- The viewer reads the whole company: finances, payments, reports, exhibition expenses and
-- sponsors, every employee's expense claims and receipts, clients, staff names. Every write
-- policy that used to allow "any staff" now allows only admin / finance / marketing.
--
-- Needs 003–010 first. Additive only — no data is deleted. Safe to run more than once.

alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check check (role in ('admin', 'finance', 'marketing', 'viewer'));

-- staff who may add or change data (everyone except the viewer)
create or replace function public.can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.staff_role() in ('admin', 'finance', 'marketing'), false)
$$;

grant execute on function public.can_write() to authenticated;

-- ── Reads the viewer needs (these tables were admin/finance only) ────────────────────
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select
  using (public.staff_role() in ('admin', 'finance', 'viewer'));

drop policy if exists expenses_view on public.exhibition_expenses;
create policy expenses_view on public.exhibition_expenses for select using (public.staff_role() = 'viewer');
drop policy if exists sponsors_view on public.exhibition_sponsors;
create policy sponsors_view on public.exhibition_sponsors for select using (public.staff_role() = 'viewer');

drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select
  using (user_id = auth.uid() or public.staff_role() in ('admin', 'finance', 'viewer'));

drop policy if exists staff_expenses_read on public.staff_expenses;
create policy staff_expenses_read on public.staff_expenses for select
  using (user_id = auth.uid() or public.staff_role() in ('admin', 'finance', 'viewer'));

drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select
  using (public.staff_role() in ('admin', 'finance', 'viewer') or (public.staff_role() is not null and created_by = auth.uid()));

drop policy if exists expense_receipts_read on storage.objects;
create policy expense_receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.staff_role() in ('admin', 'finance', 'viewer')));

-- ── Writes that allowed any staff: the viewer is left out ──────────────────────────────
drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients for insert with check (public.can_write());

drop policy if exists exhibitors_insert on public.exhibitors;
create policy exhibitors_insert on public.exhibitors for insert with check (public.can_write());

drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings for update using (public.can_write()) with check (public.can_write());
drop policy if exists bookings_insert on public.bookings;
create policy bookings_insert on public.bookings for insert with check (public.can_write());

drop policy if exists staff_expenses_insert on public.staff_expenses;
create policy staff_expenses_insert on public.staff_expenses for insert
  with check (public.can_write() and user_id = auth.uid() and status = 'بانتظار المراجعة');

drop policy if exists expense_receipts_insert on storage.objects;
create policy expense_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and public.can_write()
              and ((storage.foldername(name))[1] = auth.uid()::text or public.staff_role() in ('admin', 'finance')));
