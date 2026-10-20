-- «الموظفون الرقميون» — the research employee: a list of possible exhibitors, sponsors and partners,
-- venues and events, found in public sources. Every entry keeps where it was found; nothing is
-- a client until someone checks it and turns it into one.

create table if not exists public.prospects (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  kind        text not null default 'عارض محتمل'
              check (kind in ('عارض محتمل', 'راعٍ أو شريك', 'موقع أو فعالية', 'أخرى')),
  name        text not null check (length(btrim(name)) between 1 and 200),
  category    text not null default '' check (length(category) <= 120),
  city        text not null default '' check (length(city) <= 80),
  instagram   text not null default '' check (length(instagram) <= 120),
  website     text not null default '' check (length(website) <= 300),
  phone       text not null default '' check (length(phone) <= 40),
  email       text not null default '' check (length(email) <= 200),
  source_url  text not null default '' check (length(source_url) <= 500),
  notes       text not null default '' check (length(notes) <= 2000),
  status      text not null default 'جديد'
              check (status in ('جديد', 'تم التحقق', 'تم التواصل', 'مهتم', 'غير مهتم', 'أصبح عميلاً')),
  client_id   uuid references public.clients(id) on delete set null,
  origin      text not null default 'يدوي' check (origin in ('يدوي', 'استيراد', 'البحث اليومي'))
);

-- one entry per number and per Instagram account
create unique index if not exists prospects_phone_key_idx on public.prospects (public.phone_key(phone)) where public.phone_key(phone) <> '';
create unique index if not exists prospects_instagram_idx on public.prospects (lower(instagram)) where instagram <> '';
create index if not exists prospects_kind_status_idx on public.prospects (kind, status);

create or replace function public.prospects_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.email := lower(btrim(new.email));
  new.instagram := lower(regexp_replace(btrim(new.instagram), '^@', ''));
  return new;
end;
$$;

drop trigger if exists prospects_touch on public.prospects;
create trigger prospects_touch before insert or update on public.prospects
  for each row execute function public.prospects_touch();

alter table public.prospects enable row level security;

drop policy if exists prospects_read on public.prospects;
drop policy if exists prospects_insert on public.prospects;
drop policy if exists prospects_update on public.prospects;
drop policy if exists prospects_delete on public.prospects;
create policy prospects_read on public.prospects for select using (public.staff_role() is not null);
create policy prospects_insert on public.prospects for insert with check (public.can_write());
create policy prospects_update on public.prospects for update using (public.can_write()) with check (public.can_write());
create policy prospects_delete on public.prospects for delete
  using (public.staff_role() = 'admin' or (public.can_write() and created_by = auth.uid()));

grant select, insert, update, delete on public.prospects to authenticated;
revoke execute on function public.prospects_touch() from public, anon;

-- The daily research: a scheduled assistant adds what it finds through one narrow door. It holds a
-- secret code (made by the admin from the system, shown once, stored here only as a hash) that can
-- add prospects and read which ones exist — nothing else.
create table if not exists public.prospect_feed (
  id          int primary key default 1 check (id = 1),
  token_hash  text not null,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
alter table public.prospect_feed enable row level security;
revoke all on public.prospect_feed from public, anon, authenticated;

-- A new code for the daily research (the admin only); the old one stops working.
create or replace function public.rotate_prospect_feed_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if public.staff_role() is distinct from 'admin' then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  insert into public.prospect_feed (id, token_hash, created_at, created_by)
  values (1, encode(sha256(convert_to(token, 'UTF8')), 'hex'), now(), auth.uid())
  on conflict (id) do update set token_hash = excluded.token_hash, created_at = now(), created_by = auth.uid();
  return token;
end;
$$;

-- Stop the daily research (the admin only).
create or replace function public.revoke_prospect_feed_token()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.staff_role() is distinct from 'admin' then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  delete from public.prospect_feed;
end;
$$;

-- When the daily research was last switched on (no secret in it).
create or replace function public.prospect_feed_status()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select created_at from public.prospect_feed where id = 1 and public.staff_role() is not null;
$$;

create or replace function public.prospect_feed_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.prospect_feed
     where id = 1 and length(coalesce(p_token, '')) >= 32
       and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  );
$$;

-- What is already on the list (names, accounts, sites — no phone numbers), so the research skips them.
create or replace function public.known_prospects(p_token text)
returns table (name text, instagram text, website text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.prospect_feed_ok(p_token) then
    raise exception 'bad_token' using errcode = '42501';
  end if;
  return query
    select p.name, p.instagram, p.website from public.prospects p
    union all
    select c.name, lower(regexp_replace(coalesce(c.instagram, ''), '^@', '')), ''::text from public.clients c;
end;
$$;

-- Add the day's findings: at most 50 per call, each with the link it was found at; a duplicate
-- (same number, account or name) is skipped, not an error.
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
  v_name text;
  v_kind text;
  v_source text;
begin
  if not public.prospect_feed_ok(p_token) then
    raise exception 'bad_token' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 50 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_name := btrim(coalesce(r->>'name', ''));
    v_kind := coalesce(nullif(btrim(r->>'kind'), ''), 'عارض محتمل');
    v_source := btrim(coalesce(r->>'source_url', ''));
    if v_name = '' or v_source !~* '^https?://' or v_kind not in ('عارض محتمل', 'راعٍ أو شريك', 'موقع أو فعالية', 'أخرى') then
      rejected := rejected + 1;
      continue;
    end if;
    if exists (select 1 from public.prospects p where lower(btrim(p.name)) = lower(v_name))
       or exists (select 1 from public.clients c where lower(btrim(c.name)) = lower(v_name)) then
      skipped := skipped + 1;
      continue;
    end if;
    begin
      insert into public.prospects (kind, name, category, city, instagram, website, phone, email, source_url, notes, origin, created_by)
      values (
        v_kind, left(v_name, 200),
        left(btrim(coalesce(r->>'category', '')), 120), left(btrim(coalesce(r->>'city', '')), 80),
        left(btrim(coalesce(r->>'instagram', '')), 120), left(btrim(coalesce(r->>'website', '')), 300),
        left(btrim(coalesce(r->>'phone', '')), 40), left(btrim(coalesce(r->>'email', '')), 200),
        left(v_source, 500), left(btrim(coalesce(r->>'notes', '')), 2000),
        'البحث اليومي', null
      );
      added := added + 1;
    exception when unique_violation then
      skipped := skipped + 1;
    end;
  end loop;
  return jsonb_build_object('added', added, 'skipped', skipped, 'rejected', rejected);
end;
$$;

revoke execute on function public.rotate_prospect_feed_token() from public, anon;
revoke execute on function public.revoke_prospect_feed_token() from public, anon;
revoke execute on function public.prospect_feed_status() from public, anon;
revoke execute on function public.prospect_feed_ok(text) from public, anon, authenticated;
grant execute on function public.rotate_prospect_feed_token() to authenticated;
grant execute on function public.revoke_prospect_feed_token() to authenticated;
grant execute on function public.prospect_feed_status() to authenticated;
grant execute on function public.known_prospects(text) to anon, authenticated;
grant execute on function public.add_prospects(text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
