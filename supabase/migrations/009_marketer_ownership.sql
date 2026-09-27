-- 009: each marketer edits only the participants (and clients) they entered
--
-- • exhibitors.created_by / clients.created_by: who entered the record (filled automatically)
-- • marketing may update only their own participants and clients; admin/finance edit all
-- • site map: marketing may book a free site for their own participant, or free one of
--   their own participant's sites — never touch a site held by another marketer's participant
-- • marketing may record a payment only for their own participants
-- Records entered before this update have no owner: only admin/finance edit them.
--
-- Needs 003 and 004 first. Additive only — no data is deleted. Safe to run more than once.

alter table public.exhibitors add column if not exists created_by uuid default auth.uid();
alter table public.clients add column if not exists created_by uuid default auth.uid();

-- true when the participant was entered by the signed-in user
create or replace function public.owns_exhibitor(exhibitor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.exhibitors where id = exhibitor and created_by = auth.uid())
$$;

grant execute on function public.owns_exhibitor(uuid) to authenticated;

drop policy if exists exhibitors_update on public.exhibitors;
create policy exhibitors_update on public.exhibitors for update
  using (public.staff_role() in ('admin', 'finance') or (public.staff_role() = 'marketing' and created_by = auth.uid()))
  with check (public.staff_role() in ('admin', 'finance') or (public.staff_role() = 'marketing' and created_by = auth.uid()));

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients for update
  using (public.staff_role() in ('admin', 'finance') or (public.staff_role() = 'marketing' and created_by = auth.uid()))
  with check (public.staff_role() in ('admin', 'finance') or (public.staff_role() = 'marketing' and created_by = auth.uid()));

drop policy if exists sites_book on public.exhibition_sites;
create policy sites_book on public.exhibition_sites for update
  using (public.staff_role() in ('admin', 'finance')
         or (public.staff_role() = 'marketing' and (exhibitor_id is null or public.owns_exhibitor(exhibitor_id))))
  with check (public.staff_role() in ('admin', 'finance')
              or (public.staff_role() = 'marketing' and (exhibitor_id is null or public.owns_exhibitor(exhibitor_id))));

drop policy if exists payments_submit on public.payments;
create policy payments_submit on public.payments for insert
  with check (public.staff_role() = 'marketing' and status = 'بانتظار التأكيد' and public.owns_exhibitor(exhibitor_id));
