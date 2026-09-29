-- Each exhibition sets its own booth packages (name, area, price, what they include), its own
-- extras with their prices, and its own note for the registration form. Empty = the system's
-- default packages are used until they are set.
alter table public.exhibitions add column if not exists booth_packages jsonb;
alter table public.exhibitions add column if not exists booth_extras jsonb;
alter table public.exhibitions add column if not exists booth_note text default '';
