-- Open-ended team contracts (permanent staff): no end date — the salary keeps being added
-- every month until an end date is set.
alter table public.staff_contracts alter column end_date drop not null;
