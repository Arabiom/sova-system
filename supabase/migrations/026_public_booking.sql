-- Public booking link (/book): anyone can send a booking request or an inquiry without an
-- account, and it lands in «طلبات الحجز» as pending. Visitors still cannot read or change any
-- table: they only call the two functions below, which expose the upcoming exhibitions' public
-- details (name, city, mall, dates, hours, packages) and accept one request at a time.
--
-- Additive only. Safe to run more than once.

alter table public.bookings add column if not exists kind text not null default 'حجز';

create or replace function public.public_exhibitions()
returns table (id uuid, name text, city text, mall text, date_from date, date_to date, hours text, packages jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, coalesce(e.name, ''), e.city, e.mall, e.date_from, e.date_to, coalesce(e.hours, ''),
    coalesce((
      select jsonb_agg(jsonb_build_object('name', p->>'name', 'area', coalesce(p->>'area', ''), 'price', p->'price', 'includes', coalesce(p->>'includes', '')))
      from jsonb_array_elements(case when jsonb_typeof(e.booth_packages) = 'array' then e.booth_packages else '[]'::jsonb end) p
      where coalesce(trim(p->>'name'), '') <> ''
    ), '[]'::jsonb)
  from public.exhibitions e
  where e.status in ('قادم', 'جاري') and e.date_to >= current_date
  order by e.date_from;
$$;

create or replace function public.submit_booking(
  p_kind text,
  p_brand text,
  p_manager text,
  p_phone text,
  p_email text,
  p_category text,
  p_exhibition_id uuid,
  p_package text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := coalesce(trim(p_kind), '');
  v_manager text := coalesce(trim(p_manager), '');
  v_brand text := coalesce(trim(p_brand), '');
  v_phone text := coalesce(trim(p_phone), '');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_email text := lower(coalesce(trim(p_email), ''));
  v_message text := coalesce(trim(p_message), '');
  v_id uuid;
begin
  if v_kind not in ('حجز', 'استفسار') then
    raise exception 'invalid_kind';
  end if;
  if length(v_manager) < 2 or length(v_manager) > 120 then
    raise exception 'invalid_name';
  end if;
  if length(v_digits) < 8 or length(v_digits) > 15 then
    raise exception 'invalid_phone';
  end if;
  if length(v_brand) > 120 or length(v_email) > 160 or length(v_message) > 1000
     or length(coalesce(p_category, '')) > 80 or length(coalesce(p_package, '')) > 200 then
    raise exception 'too_long';
  end if;
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;
  if v_kind = 'حجز' then
    if v_brand = '' then
      raise exception 'invalid_brand';
    end if;
    if p_exhibition_id is null or not exists (select 1 from public.public_exhibitions() x where x.id = p_exhibition_id) then
      raise exception 'invalid_exhibition';
    end if;
  elsif p_exhibition_id is not null and not exists (select 1 from public.public_exhibitions() x where x.id = p_exhibition_id) then
    raise exception 'invalid_exhibition';
  end if;
  if v_kind = 'استفسار' and v_message = '' then
    raise exception 'empty_message';
  end if;

  if (select count(*) from public.bookings b
      where b.created_at > now() - interval '1 hour'
        and right(regexp_replace(b.phone, '\D', '', 'g'), 8) = right(v_digits, 8)) >= 3 then
    raise exception 'too_many';
  end if;
  if (select count(*) from public.bookings b where b.created_at > now() - interval '1 hour') >= 100 then
    raise exception 'too_many';
  end if;

  insert into public.bookings (kind, brand, manager, phone, email, category, exhibition_id, booth_size, message, status)
  values (v_kind, coalesce(nullif(v_brand, ''), v_manager), v_manager, v_phone, v_email,
          coalesce(trim(p_category), ''), p_exhibition_id, coalesce(trim(p_package), ''), v_message, 'معلق')
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.public_exhibitions() from public;
revoke all on function public.submit_booking(text, text, text, text, text, text, uuid, text, text) from public;
grant execute on function public.public_exhibitions() to anon, authenticated;
grant execute on function public.submit_booking(text, text, text, text, text, text, uuid, text, text) to anon, authenticated;
