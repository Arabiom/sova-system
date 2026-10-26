-- A customer list imported from Excel into «الفرص» belongs with the clients: it is the company's
-- own database, not what the research found. The admin moves it in batches (each call moves up to
-- p_limit rows, so a long list never hits the request time limit):
--   · a row whose number is already a client is only linked to that client;
--   · every other potential exhibitor or sponsor becomes a client («محتمل», number source
--     «قائمة مستوردة»), and the row is marked «أصبح عميلاً» and linked.
-- Rows the team marked «غير مناسب» or already handled stay where they are.

create or replace function public.move_imported_prospects(p_limit int default 1000)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  p public.prospects;
  new_id uuid;
  moved int := 0;
  linked int := 0;
  remaining int;
begin
  if coalesce(public.staff_role(), '') <> 'admin' then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  with keys as (
    select distinct on (public.phone_key(c.phone)) public.phone_key(c.phone) as k, c.id
      from public.clients c
     where public.phone_key(c.phone) <> ''
  ), dup as (
    update public.prospects x
       set status = 'أصبح عميلاً', client_id = keys.id
      from keys
     where keys.k = public.phone_key(x.phone)
       and x.origin = 'استيراد' and x.status in ('جديد', 'تم التحقق') and x.client_id is null
    returning 1)
  select count(*) into linked from dup;

  for p in
    select * from public.prospects x
     where x.origin = 'استيراد' and x.status in ('جديد', 'تم التحقق') and x.client_id is null
       and x.kind in ('عارض محتمل', 'راعٍ أو شريك')
     order by x.created_at, x.id
     limit greatest(1, least(coalesce(p_limit, 1000), 2000))
  loop
    begin
    insert into public.clients (name, phone, email, instagram, sector, products, city, source, status, notes, contact_source)
    values (
      left(p.name, 200), p.phone, p.email,
      case when p.instagram <> '' then '@' || p.instagram else '' end,
      p.category, p.products, p.city, 'أخرى', 'محتمل',
      concat_ws(E'\n', nullif(p.notes, ''), case when p.source_url <> '' then 'المصدر: ' || p.source_url end),
      'قائمة مستوردة')
    returning id into new_id;
    update public.prospects set status = 'أصبح عميلاً', client_id = new_id where id = p.id;
    moved := moved + 1;
    exception when others then
      -- a colleague added this number meanwhile: link to that client instead
      update public.prospects
         set status = 'أصبح عميلاً',
             client_id = (select c.id from public.clients c where public.phone_key(c.phone) = public.phone_key(p.phone) limit 1)
       where id = p.id and public.phone_key(p.phone) <> '';
      if not found then raise; end if;
      linked := linked + 1;
    end;
  end loop;

  select count(*) into remaining from public.prospects x
   where x.origin = 'استيراد' and x.status in ('جديد', 'تم التحقق') and x.client_id is null
     and x.kind in ('عارض محتمل', 'راعٍ أو شريك');
  return jsonb_build_object('moved', moved, 'linked', linked, 'remaining', remaining);
end;
$$;
revoke execute on function public.move_imported_prospects(int) from public, anon;
grant execute on function public.move_imported_prospects(int) to authenticated;

-- the daily review counts an imported list apart from the research finds
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
    'prospects_to_review', (select count(*) from public.prospects p where p.status = 'جديد' and p.origin <> 'استيراد'),
    'imported_waiting', (select count(*) from public.prospects p
                          where p.origin = 'استيراد' and p.status in ('جديد', 'تم التحقق') and p.client_id is null),
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

notify pgrst, 'reload schema';
