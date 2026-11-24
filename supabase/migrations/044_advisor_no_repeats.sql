-- The daily review wrote the same reminder again every day (a new ref each time), so the
-- owner's list filled with repeats. Now an item whose ref already exists is updated while it is
-- open (its text, priority and date follow the latest review) and never added twice; a closed
-- one stays closed, and an item the owner wrote is never touched. The review uses one ref per matter (docs/daily-review.md).

create or replace function public.add_advisor_items(p_token text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  added int := 0;
  updated int := 0;
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
       or (v_link <> '' and (v_link !~ '^/[^/\\]' or length(v_link) > 200)) then
      rejected := rejected + 1;
      continue;
    end if;
    if exists (select 1 from public.advisor_items i where i.ref = v_ref) then
      -- the same matter again: its open item is brought up to date, never added a second time
      update public.advisor_items
         set kind = coalesce(r->>'kind', 'مهمة'), priority = coalesce(r->>'priority', 'عادية'), title = left(v_title, 200),
             details = left(btrim(coalesce(r->>'details', '')), 2000), link = v_link, due_date = v_due
       where ref = v_ref and status <> 'تمت' and origin = 'المراجعة اليومية';
      if found then updated := updated + 1; else skipped := skipped + 1; end if;
    else
      insert into public.advisor_items (ref, kind, priority, title, details, link, due_date, origin, created_by)
      values (v_ref, coalesce(r->>'kind', 'مهمة'), coalesce(r->>'priority', 'عادية'), left(v_title, 200),
              left(btrim(coalesce(r->>'details', '')), 2000), v_link, v_due, 'المراجعة اليومية', null)
      on conflict (ref) do nothing;
      if found then added := added + 1; else skipped := skipped + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('added', added, 'updated', updated, 'skipped', skipped, 'rejected', rejected);
end;
$$;

-- each exhibition carries its id, so the review's ref for it is the same every day
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
               'id', e.id, 'name', coalesce(nullif(e.name, ''), e.city || ' — ' || e.mall), 'city', e.city, 'date_from', e.date_from,
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
