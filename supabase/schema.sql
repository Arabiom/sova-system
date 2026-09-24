-- SOVA — database structure as used by the app.
--
-- REFERENCE ONLY: this was reconstructed from the application code, not exported from the
-- live Supabase project. Column types are best guesses; compare with the real project
-- (Supabase → Table Editor / Database → Schema) before running any of it.

create table if not exists exhibitions (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  city              text not null,
  mall              text not null,
  date_from         date not null,
  date_to           date not null,
  status            text not null default 'تخطيط',   -- تخطيط | قادم | جاري | منتهي
  notes             text default '',
  booths            integer default 0,                -- total of the three tiers (legacy)
  booth_price       numeric default 0,                -- = booth_tier2_price (legacy)
  booth_tier1_name  text, booth_tier1_price numeric, booth_tier1_count integer,
  booth_tier2_name  text, booth_tier2_price numeric, booth_tier2_count integer,
  booth_tier3_name  text, booth_tier3_price numeric, booth_tier3_count integer
);

create table if not exists exhibitors (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  exhibition_id  uuid references exhibitions (id) on delete cascade,
  brand          text not null,
  manager        text not null,
  phone          text default '',
  email          text default '',
  category       text default '',
  booth          text default '—',
  booth_size     text default '',
  contract       numeric default 0,                   -- contract value, OMR, before VAT
  paid           numeric default 0,                   -- running total of payments (kept by the app)
  status         text default 'مبدئي',                -- مبدئي | قيد التوقيع | مؤكد
  notes          text default ''
);

create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  exhibitor_id  uuid references exhibitors (id) on delete cascade,
  amount        numeric not null,
  method        text default 'نقد',                   -- نقد | تحويل بنكي | فيزا / ماستركارد | شيك
  type          text default 'كامل',                  -- كامل | مقدمة | جزئية | أخيرة
  date          date,
  note          text default '',
  invoice_no    text                                  -- INV-xxxxxx
);

create table if not exists bookings (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  exhibition_id  uuid references exhibitions (id) on delete cascade,
  brand          text not null,
  manager        text not null,
  phone          text not null,
  email          text default '',
  category       text default '',
  booth_size     text default '',
  message        text default '',
  status         text default 'معلق'                   -- معلق | مقبول | مرفوض
);

-- Access rules (Row Level Security) are the next step and are NOT defined here yet.
-- The app expects:
--   * anonymous visitors: read open exhibitions, insert into bookings (the /book page)
--   * signed-in staff: full read/write on all four tables
