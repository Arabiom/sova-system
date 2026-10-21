-- 1. Clear sorting: each client and each prospect keeps a short note on its products, and each
--    exhibition names the sectors it is for — so an exhibition goes only to those it suits
--    (an Omani-products exhibition is not sent to fashion shops).
-- 2. «موظف المتابعة والاقتراحات والحلول»: the owner's list of tasks, suggestions and problems with
--    their solutions. The admin keeps it; the daily review adds to it through a token-gated door
--    (the same secret code as the research), and reads only counts — never names or numbers.

-- 1. Products and target sectors ---------------------------------------------------------------
alter table public.clients add column if not exists products text not null default '';
alter table public.clients drop constraint if exists clients_products_len;
alter table public.clients add constraint clients_products_len check (length(products) <= 1000);

alter table public.prospects add column if not exists products text not null default '';
alter table public.prospects drop constraint if exists prospects_products_len;
alter table public.prospects add constraint prospects_products_len check (length(products) <= 1000);

alter table public.exhibitions add column if not exists sectors text[] not null default '{}';

-- the research may send a products note with each finding
create or replace function public.add_prospects(p_token text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  added int := 0;
  skipped int := 0;
  rejected int := 0;
  over_limit int := 0;
  purged int;
  v_name text;
  v_kind text;
  v_source text;
  v_fit int;
  v_place text;
  room int;
begin
  if not public.prospect_feed_ok(p_token) then
    raise exception 'bad_token' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 50 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  purged := public.purge_unreviewed_maps();
  select greatest(coalesce(s.daily_limit, 20) - (
           select count(*) from public.prospects p
            where p.origin in ('البحث اليومي', 'خرائط جوجل')
              and (p.created_at at time zone 'Asia/Muscat')::date = (now() at time zone 'Asia/Muscat')::date), 0)
    into room
    from public.research_settings s where s.id = 1;
  room := coalesce(room, 20);
  for r in select * from jsonb_array_elements(p_rows) loop
    v_name := btrim(coalesce(r->>'name', ''));
    v_kind := coalesce(nullif(btrim(r->>'kind'), ''), 'عارض محتمل');
    v_source := btrim(coalesce(r->>'source_url', ''));
    v_fit := case when coalesce(r->>'fit', '') ~ '^[1-3]$' then (r->>'fit')::int end;
    v_place := nullif(btrim(coalesce(r->>'place_id', '')), '');
    if v_name = '' or v_source !~* '^https?://' or v_kind not in ('عارض محتمل', 'راعٍ أو شريك', 'موقع أو فعالية', 'أخرى') then
      rejected := rejected + 1;
      continue;
    end if;
    if exists (select 1 from public.prospects p where lower(btrim(p.name)) = lower(v_name) or (v_place is not null and p.place_id = v_place))
       or exists (select 1 from public.clients c where lower(btrim(c.name)) = lower(v_name)) then
      skipped := skipped + 1;
      continue;
    end if;
    if added >= room then
      over_limit := over_limit + 1;
      continue;
    end if;
    begin
      insert into public.prospects (kind, name, category, products, city, instagram, website, phone, email, source_url, notes, fit, fit_reason, place_id, origin, created_by)
      values (
        v_kind, left(v_name, 200),
        left(btrim(coalesce(r->>'category', '')), 120), left(btrim(coalesce(r->>'products', '')), 1000),
        left(btrim(coalesce(r->>'city', '')), 80),
        left(btrim(coalesce(r->>'instagram', '')), 120), left(btrim(coalesce(r->>'website', '')), 300),
        left(btrim(coalesce(r->>'phone', '')), 40), left(btrim(coalesce(r->>'email', '')), 200),
        left(v_source, 500), left(btrim(coalesce(r->>'notes', '')), 2000),
        v_fit, left(btrim(coalesce(r->>'fit_reason', '')), 300),
        left(v_place, 300), case when v_place is null then 'البحث اليومي' else 'خرائط جوجل' end, null
      );
      added := added + 1;
    exception when unique_violation then
      skipped := skipped + 1;
    end;
  end loop;
  return jsonb_build_object('added', added, 'skipped', skipped, 'rejected', rejected, 'over_limit', over_limit, 'purged', purged);
end;
$$;
grant execute on function public.add_prospects(text, jsonb) to anon, authenticated;

-- the research brief names each upcoming exhibition's target sectors
create or replace function public.research_brief(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.research_settings;
  added_today int;
  last_run timestamptz;
  ran_today boolean;
  requested boolean;
begin
  if not public.prospect_feed_ok(p_token) then
    raise exception 'bad_token' using errcode = '42501';
  end if;
  select * into s from public.research_settings where id = 1;
  select max(run_at) into last_run from public.research_runs;
  ran_today := last_run is not null and (last_run at time zone 'Asia/Muscat')::date = (now() at time zone 'Asia/Muscat')::date;
  requested := s.run_requested_at is not null and (last_run is null or s.run_requested_at > last_run);
  select count(*) into added_today from public.prospects
   where origin in ('البحث اليومي', 'خرائط جوجل') and (created_at at time zone 'Asia/Muscat')::date = (now() at time zone 'Asia/Muscat')::date;
  return jsonb_build_object(
    'enabled', coalesce(s.enabled, true),
    'due', coalesce(s.enabled, true) and (requested or not ran_today),
    'why', case
      when not coalesce(s.enabled, true) then 'off'
      when requested then 'requested'
      when not ran_today then 'daily'
      else 'done_today'
    end,
    'focus', coalesce(s.focus, ''),
    'cities', to_jsonb(coalesce(s.cities, '{}')),
    'kinds', to_jsonb(coalesce(s.kinds, '{}')),
    'sectors', to_jsonb(coalesce(s.sectors, '{}')),
    'daily_limit', coalesce(s.daily_limit, 20),
    'remaining_today', greatest(coalesce(s.daily_limit, 20) - added_today, 0),
    'upcoming_exhibitions', coalesce((
      select jsonb_agg(jsonb_build_object('name', e.name, 'city', e.city, 'mall', e.mall, 'date_from', e.date_from, 'date_to', e.date_to, 'sectors', to_jsonb(e.sectors)) order by e.date_from)
        from public.exhibitions e
       where e.date_to >= (now() at time zone 'Asia/Muscat')::date and e.status not in ('منتهي', 'ملغى')
    ), '[]'::jsonb)
  );
end;
$$;

-- 2. The follow-up employee's list -------------------------------------------------------------
create table if not exists public.advisor_items (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  kind        text not null default 'مهمة' check (kind in ('مهمة', 'اقتراح', 'مشكلة')),
  title       text not null check (length(btrim(title)) between 1 and 200),
  details     text not null default '' check (length(details) <= 2000),
  priority    text not null default 'عادية' check (priority in ('عاجلة', 'مهمة', 'عادية')),
  status      text not null default 'مفتوحة' check (status in ('مفتوحة', 'قيد التنفيذ', 'تمت', 'مؤجلة')),
  due_date    date,
  link        text not null default '' check (link = '' or (link ~ '^/' and length(link) <= 200)),
  origin      text not null default 'يدوي' check (origin in ('يدوي', 'المراجعة اليومية')),
  ref         text unique check (ref is null or ref ~ '^[a-z0-9:_-]{3,80}$'),
  done_at     timestamptz
);
create index if not exists advisor_items_status_idx on public.advisor_items (status, priority);

create or replace function public.advisor_items_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.status = 'تمت' and (tg_op = 'INSERT' or old.status is distinct from 'تمت') then
    new.done_at := now();
  elsif new.status <> 'تمت' then
    new.done_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists advisor_items_touch on public.advisor_items;
create trigger advisor_items_touch before insert or update on public.advisor_items
  for each row execute function public.advisor_items_touch();
revoke execute on function public.advisor_items_touch() from public, anon;

alter table public.advisor_items enable row level security;
drop policy if exists advisor_items_admin on public.advisor_items;
create policy advisor_items_admin on public.advisor_items for all
  using (public.staff_role() = 'admin') with check (public.staff_role() = 'admin');
grant select, insert, update, delete on public.advisor_items to authenticated;

-- what was still open when the follow-up employee started
insert into public.advisor_items (ref, kind, priority, title, details, link, created_by) values
  ('seed:maps-key', 'مهمة', 'مهمة', 'إنشاء مفتاح Google Maps وإضافته لإعدادات البيئة',
   'من Google Cloud: فعّل Places API ثم أنشئ المفتاح وضعه باسم GOOGLE_MAPS_KEY في إعدادات بيئة Claude — لا ترسله في المحادثة. بعدها يبحث موظف البحث في خرائط جوجل عن المحلات والمصانع.', '/digital/research?tab=plan', null),
  ('seed:letsbot-template', 'مهمة', 'مهمة', 'اعتماد قالب رسالة واتساب في LetsBot',
   'الإرسال التلقائي متوقف حتى يُعتمد قالب الرسالة من Meta ويُضاف مفتاح LetsBot في إعدادات Supabase السرية.', '/digital/marketing', null),
  ('seed:company-docs', 'مهمة', 'مهمة', 'رفع وثائق الشركة',
   'السجل التجاري، ترخيص السجل التجاري، شهادة الانتساب، الشهادة الضريبية، بطاقة ريادة الأعمال — مع تاريخ انتهاء كل وثيقة ليصلك تنبيه قبل انتهائها.', '/documents', null),
  ('seed:exhibition-sectors', 'مهمة', 'مهمة', 'تحديد القطاعات المستهدفة لكل معرض قادم',
   'من «تعديل المعرض» اختر القطاعات التي يناسبها المعرض، فيظهر في صفحة العملاء من يناسبه ومتى نتواصل معه، وتُبنى الحملات عليه.', '/exhibitions', null),
  ('seed:clients-sectors', 'اقتراح', 'عادية', 'إكمال القطاع والمنتجات للعملاء الذين بلا قطاع',
   'كل عميل بلا قطاع لا يظهر في فرز المعارض. ابدأ بفلتر «بلا قطاع» في صفحة العملاء.', '/clients', null),
  ('seed:analytics', 'اقتراح', 'عادية', 'ربط Google Analytics بالصفحات العامة',
   'لمعرفة عدد زوار صفحة البايو والحجز ومن أين جاؤوا. يحتاج فقط رمز القياس (يبدأ بـ G-) من حساب Google Analytics.', '', null)
on conflict (ref) do nothing;

-- The daily review adds tasks and suggestions (never twice: each has its own ref).
create or replace function public.add_advisor_items(p_token text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  added int := 0;
  skipped int := 0;
  rejected int := 0;
  v_ref text;
  v_title text;
  v_link text;
  v_due date;
begin
  if not public.prospect_feed_ok(p_token) then
    raise exception 'bad_token' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 20 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_ref := lower(btrim(coalesce(r->>'ref', '')));
    v_title := btrim(coalesce(r->>'title', ''));
    v_link := btrim(coalesce(r->>'link', ''));
    v_due := case when coalesce(r->>'due_date', '') ~ '^\d{4}-\d{2}-\d{2}$' then (r->>'due_date')::date end;
    if v_ref !~ '^[a-z0-9:_-]{3,80}$' or v_title = ''
       or coalesce(r->>'kind', 'مهمة') not in ('مهمة', 'اقتراح', 'مشكلة')
       or coalesce(r->>'priority', 'عادية') not in ('عاجلة', 'مهمة', 'عادية')
       or (v_link <> '' and v_link !~ '^/') then
      rejected := rejected + 1;
      continue;
    end if;
    insert into public.advisor_items (ref, kind, priority, title, details, link, due_date, origin, created_by)
    values (v_ref, coalesce(r->>'kind', 'مهمة'), coalesce(r->>'priority', 'عادية'), left(v_title, 200),
            left(btrim(coalesce(r->>'details', '')), 2000), left(v_link, 200), v_due, 'المراجعة اليومية', null)
    on conflict (ref) do nothing;
    if found then added := added + 1; else skipped := skipped + 1; end if;
  end loop;
  return jsonb_build_object('added', added, 'skipped', skipped, 'rejected', rejected);
end;
$$;
revoke execute on function public.add_advisor_items(text, jsonb) from public;
grant execute on function public.add_advisor_items(text, jsonb) to anon, authenticated;

-- What the daily review looks at: counts and exhibitions only — no client names or numbers.
create or replace function public.advisor_brief(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Muscat')::date;
begin
  if not public.prospect_feed_ok(p_token) then
    raise exception 'bad_token' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'today', today,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('ref', i.ref, 'kind', i.kind, 'title', i.title, 'status', i.status,
                                          'priority', i.priority, 'due_date', i.due_date) order by i.created_at)
        from public.advisor_items i
       where i.status <> 'تمت' or i.done_at > now() - interval '30 days'), '[]'::jsonb),
    'refs', coalesce((select jsonb_agg(i.ref) from public.advisor_items i where i.ref is not null), '[]'::jsonb),
    'exhibitions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', coalesce(nullif(e.name, ''), e.city || ' — ' || e.mall), 'city', e.city, 'date_from', e.date_from,
               'date_to', e.date_to, 'status', e.status, 'booths', coalesce(e.booths, 0), 'sectors', to_jsonb(e.sectors),
               'exhibitors', (select count(*) from public.exhibitors x where x.exhibition_id = e.id),
               'confirmed', (select count(*) from public.exhibitors x where x.exhibition_id = e.id and x.status = 'مؤكد'),
               'owing', (select count(*) from public.exhibitors x where x.exhibition_id = e.id and coalesce(x.contract, 0) > coalesce(x.paid, 0)))
             order by e.date_from)
        from public.exhibitions e
       where e.date_to >= today and coalesce(e.status, '') <> 'ملغى'), '[]'::jsonb),
    'bookings_pending', (select count(*) from public.bookings b where b.status = 'معلق'),
    'clients', jsonb_build_object(
      'total', (select count(*) from public.clients),
      'no_sector', (select count(*) from public.clients c where btrim(coalesce(c.sector, '')) = ''),
      'no_products', (select count(*) from public.clients c where btrim(c.products) = ''),
      'messaged', (select count(*) from public.clients c where c.outreach = 'وصلته رسالة'),
      'suitable', (select count(*) from public.clients c where c.outreach = 'مناسب')),
    'prospects_to_review', (select count(*) from public.prospects p where p.status = 'جديد'),
    'followups_overdue', (select count(*) from public.followups f where f.status = 'مفتوحة' and f.due_date < today),
    'campaigns_pending', (select count(*) from public.campaigns c where c.status = 'بانتظار الاعتماد'),
    'documents', jsonb_build_object(
      'total', (select count(*) from public.company_documents),
      'expired', (select count(*) from public.company_documents d where d.expiry_date < today),
      'expiring_30', (select count(*) from public.company_documents d where d.expiry_date between today and today + 30)),
    'expenses_overdue', (select count(*) from public.company_expenses x where not x.paid and x.due_date < today),
    'research', (select jsonb_build_object('enabled', s.enabled, 'last_run', (select max(run_at) from public.research_runs))
                   from public.research_settings s where s.id = 1)
  );
end;
$$;
revoke execute on function public.advisor_brief(text) from public;
grant execute on function public.advisor_brief(text) to anon, authenticated;

notify pgrst, 'reload schema';
