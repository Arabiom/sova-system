-- SOVA — migration 003: staff roles (admin / finance / marketing)
--
-- Enforced by the database itself (Row Level Security), not just by hiding buttons.
--   admin     — everything, including managing staff roles
--   finance   — everything except managing staff roles
--   marketing — clients, exhibitions (read), site booking, exhibitors (add/edit),
--               payments READ-ONLY (to check a transfer arrived), WhatsApp.
--               No expenses, sponsors, payment changes, deletes or exhibition setup.
--
-- Everyone who can already sign in when this runs becomes admin. Accounts created later
-- start as marketing; an admin changes the role from the "الموظفون" page.
-- Safe to run more than once.

-- 1. Staff table ------------------------------------------------------------------------------
create table if not exists public.staff (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text default '',
  name        text default '',
  role        text not null default 'marketing' check (role in ('admin', 'finance', 'marketing')),
  created_at  timestamptz not null default now()
);

-- Existing accounts (created before roles existed) are the owners: make them admin.
insert into public.staff (user_id, email, role)
select u.id, coalesce(u.email, ''), 'admin'
from auth.users u
on conflict (user_id) do nothing;

-- New accounts get the least-privileged role automatically.
create or replace function public.handle_new_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.staff (user_id, email, role)
  values (new.id, coalesce(new.email, ''), 'marketing')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_staff on auth.users;
create trigger on_auth_user_created_staff
  after insert on auth.users
  for each row execute function public.handle_new_staff();

-- 2. Role of the signed-in user (null = not staff → no access) --------------------------------
create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.staff where user_id = auth.uid()
$$;

grant execute on function public.staff_role() to authenticated;

-- 3. Replace every existing policy on the business tables ------------------------------------
-- (policies are OR-ed together, so any old "all signed-in users" policy must go)
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('exhibitions', 'exhibition_sites', 'exhibition_expenses', 'exhibition_sponsors',
                        'clients', 'exhibitors', 'payments', 'bookings', 'staff')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end;
$$;

alter table public.staff enable row level security;
alter table public.exhibitions enable row level security;
alter table public.exhibition_sites enable row level security;
alter table public.exhibition_expenses enable row level security;
alter table public.exhibition_sponsors enable row level security;
alter table public.clients enable row level security;
alter table public.exhibitors enable row level security;
alter table public.payments enable row level security;
alter table public.bookings enable row level security;

-- staff: everyone sees their own row; admins see and manage all
create policy staff_read on public.staff for select
  using (user_id = auth.uid() or public.staff_role() = 'admin');
create policy staff_admin_write on public.staff for update
  using (public.staff_role() = 'admin') with check (public.staff_role() = 'admin');
create policy staff_admin_delete on public.staff for delete
  using (public.staff_role() = 'admin' and user_id <> auth.uid());

-- exhibitions: all staff read; admin/finance manage
create policy exhibitions_read on public.exhibitions for select using (public.staff_role() is not null);
create policy exhibitions_write on public.exhibitions for all
  using (public.staff_role() in ('admin', 'finance')) with check (public.staff_role() in ('admin', 'finance'));

-- site map: all staff read and book sites (update); admin/finance build the map
create policy sites_read on public.exhibition_sites for select using (public.staff_role() is not null);
create policy sites_book on public.exhibition_sites for update
  using (public.staff_role() is not null) with check (public.staff_role() is not null);
create policy sites_insert on public.exhibition_sites for insert with check (public.staff_role() in ('admin', 'finance'));
create policy sites_delete on public.exhibition_sites for delete using (public.staff_role() in ('admin', 'finance'));

-- expenses & sponsors: admin/finance only
create policy expenses_all on public.exhibition_expenses for all
  using (public.staff_role() in ('admin', 'finance')) with check (public.staff_role() in ('admin', 'finance'));
create policy sponsors_all on public.exhibition_sponsors for all
  using (public.staff_role() in ('admin', 'finance')) with check (public.staff_role() in ('admin', 'finance'));

-- clients: all staff read/add/edit; admin/finance delete
create policy clients_read on public.clients for select using (public.staff_role() is not null);
create policy clients_insert on public.clients for insert with check (public.staff_role() is not null);
create policy clients_update on public.clients for update
  using (public.staff_role() is not null) with check (public.staff_role() is not null);
create policy clients_delete on public.clients for delete using (public.staff_role() in ('admin', 'finance'));

-- exhibitors: all staff read/add/edit; admin/finance delete
create policy exhibitors_read on public.exhibitors for select using (public.staff_role() is not null);
create policy exhibitors_insert on public.exhibitors for insert with check (public.staff_role() is not null);
create policy exhibitors_update on public.exhibitors for update
  using (public.staff_role() is not null) with check (public.staff_role() is not null);
create policy exhibitors_delete on public.exhibitors for delete using (public.staff_role() in ('admin', 'finance'));

-- payments: all staff read (to confirm transfers); admin/finance record, edit, delete
create policy payments_read on public.payments for select using (public.staff_role() is not null);
create policy payments_write on public.payments for all
  using (public.staff_role() in ('admin', 'finance')) with check (public.staff_role() in ('admin', 'finance'));

-- bookings (legacy requests): all staff read/update; admin/finance delete
create policy bookings_read on public.bookings for select using (public.staff_role() is not null);
create policy bookings_update on public.bookings for update
  using (public.staff_role() is not null) with check (public.staff_role() is not null);
create policy bookings_insert on public.bookings for insert with check (public.staff_role() is not null);
create policy bookings_delete on public.bookings for delete using (public.staff_role() in ('admin', 'finance'));

-- 4. Marketing may edit an exhibitor but not their money -------------------------------------
-- The running "paid" total only changes through payments (admin/finance).
create or replace function public.protect_exhibitor_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.staff_role() = 'marketing' and new.paid is distinct from old.paid then
    raise exception 'فريق التسويق لا يملك صلاحية تعديل المبالغ المدفوعة' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists exhibitors_protect_paid on public.exhibitors;
create trigger exhibitors_protect_paid
  before update on public.exhibitors
  for each row execute function public.protect_exhibitor_paid();
