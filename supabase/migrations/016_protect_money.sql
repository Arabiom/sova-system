-- 016: protect the money records
--
-- • Marketing could create a participant that already shows a "paid" amount (the check only
--   covered edits). Now a new participant added by marketing always starts at 0 paid; money
--   only arrives through a payment finance confirms.
-- • Deleting a participant (or a whole exhibition) silently deleted every payment recorded for
--   them. Payments now block that: delete or move the payments first, so no receipt ever
--   disappears from the books by accident.
--
-- Needs 003 first. Nothing is deleted. Safe to run more than once.

create or replace function public.protect_exhibitor_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.staff_role() = 'marketing' then
    if tg_op = 'INSERT' and coalesce(new.paid, 0) <> 0 then
      raise exception 'فريق التسويق لا يملك صلاحية تسجيل مبالغ مدفوعة مباشرة — تُسجَّل الدفعة وتنتظر تأكيد المالية' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.paid is distinct from old.paid then
      raise exception 'فريق التسويق لا يملك صلاحية تعديل المبالغ المدفوعة' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists exhibitors_protect_paid on public.exhibitors;
create trigger exhibitors_protect_paid
  before insert or update on public.exhibitors
  for each row execute function public.protect_exhibitor_paid();

-- payments.exhibitor_id: ON DELETE CASCADE → RESTRICT
do $$
declare c text;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
     where con.conrelid = 'public.payments'::regclass
       and con.contype = 'f'
       and att.attname = 'exhibitor_id'
  loop
    execute format('alter table public.payments drop constraint %I', c);
  end loop;
end;
$$;

alter table public.payments
  add constraint payments_exhibitor_id_fkey
  foreign key (exhibitor_id) references public.exhibitors (id) on delete restrict;
