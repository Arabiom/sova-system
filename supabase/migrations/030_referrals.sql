-- Referral commission: whoever brought a participant (an employee or an outside agent) earns
-- their own percentage of what that participant has actually paid.
-- • referrers: the people who bring participants, each with their own rate (%).
-- • exhibitors.referrer_id / referral_pct: who brought this participant, and the rate agreed
--   for it (taken from the referrer when the participant is registered).
-- • company_expenses.referrer_id: a commission paid out to a referrer (a company expense).
-- Only admin / finance set or change a rate; marketing may only name who brought a participant
-- they register, and the referrer's own rate is applied.
--
-- Additive only. Safe to run more than once.

create table if not exists public.referrers (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  phone       text not null default '',
  user_id     uuid,
  rate        numeric not null default 0 check (rate >= 0 and rate <= 100),
  active      boolean not null default true,
  notes       text not null default ''
);

alter table public.referrers enable row level security;
drop policy if exists referrers_read on public.referrers;
drop policy if exists referrers_write on public.referrers;
create policy referrers_read on public.referrers for select using (public.staff_role() is not null);
create policy referrers_write on public.referrers for all
  using (public.staff_role() in ('admin', 'finance'))
  with check (public.staff_role() in ('admin', 'finance'));

alter table public.exhibitors add column if not exists referrer_id uuid references public.referrers (id) on delete set null;
alter table public.exhibitors add column if not exists referral_pct numeric;
alter table public.exhibitors drop constraint if exists exhibitors_referral_pct_check;
alter table public.exhibitors add constraint exhibitors_referral_pct_check check (referral_pct is null or (referral_pct >= 0 and referral_pct <= 100));
create index if not exists exhibitors_referrer_idx on public.exhibitors (referrer_id);

alter table public.company_expenses add column if not exists referrer_id uuid references public.referrers (id) on delete set null;

create or replace function public.guard_exhibitor_referral()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') or coalesce(public.staff_role(), '') in ('admin', 'finance') then
    if new.referrer_id is not null and new.referral_pct is null then
      new.referral_pct := (select r.rate from public.referrers r where r.id = new.referrer_id);
    end if;
    if new.referrer_id is null then
      new.referral_pct := null;
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.referral_pct := (select r.rate from public.referrers r where r.id = new.referrer_id);
  else
    new.referrer_id := old.referrer_id;
    new.referral_pct := old.referral_pct;
  end if;
  return new;
end;
$$;

drop trigger if exists exhibitors_guard_referral on public.exhibitors;
create trigger exhibitors_guard_referral
  before insert or update on public.exhibitors
  for each row execute function public.guard_exhibitor_referral();
