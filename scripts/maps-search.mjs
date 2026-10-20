// Google Maps search for the research employee, through the official Places API (New):
//   node scripts/maps-search.mjs "محلات عطور نزوى" ["مصنع حلوى عمانية مسقط" …] > /tmp/maps.json
// Each query returns up to 20 places in Oman, already shaped as prospects (place_id, Maps link,
// name, type, address, phone, website). Permanently closed places are left out.
// The key is read from GOOGLE_MAPS_KEY in the environment — never from a file in the repository.
// Cost guard: at most 15 queries per run (≈ 450 a month, inside Google's free monthly allowance
// for these fields at the time of writing). Google's terms keep a place's details for 30 days at
// most unless the team reviews them; the system removes unreviewed Maps finds after 30 days.

const MAX_QUERIES = 15
const FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.googleMapsUri',
  'places.primaryTypeDisplayName',
  'places.businessStatus',
  'places.nationalPhoneNumber',
  'places.websiteUri',
].join(',')

const key = process.env.GOOGLE_MAPS_KEY
if (!key) {
  console.error('GOOGLE_MAPS_KEY is not set in this environment — the admin adds it in the environment settings.')
  process.exit(2)
}
const queries = process.argv.slice(2).filter(Boolean)
if (!queries.length) {
  console.error('Usage: node scripts/maps-search.mjs "<what> <city>" […]')
  process.exit(1)
}
if (queries.length > MAX_QUERIES) {
  console.error(`At most ${MAX_QUERIES} queries per run.`)
  process.exit(1)
}

/** The governorate / town named in an Omani address, when it is one we know. */
const TOWNS = ['مسقط', 'مطرح', 'السيب', 'بوشر', 'العامرات', 'قريات', 'نزوى', 'بهلاء', 'صحار', 'صلالة', 'البريمي', 'عبري', 'إبراء', 'صور', 'الرستاق', 'بركاء', 'المصنعة', 'السويق', 'إزكي', 'سمائل', 'ينقل', 'خصب', 'Muscat', 'Seeb', 'Nizwa', 'Sohar', 'Salalah', 'Buraimi', 'Ibri', 'Ibra', 'Sur', 'Barka', 'Rustaq', 'Bawshar', 'Muttrah']
const AR = { Muscat: 'مسقط', Seeb: 'السيب', Nizwa: 'نزوى', Sohar: 'صحار', Salalah: 'صلالة', Buraimi: 'البريمي', Ibri: 'عبري', Ibra: 'إبراء', Sur: 'صور', Barka: 'بركاء', Rustaq: 'الرستاق', Bawshar: 'بوشر', Muttrah: 'مطرح' }
const townOf = (address = '') => {
  const t = TOWNS.find((name) => address.includes(name))
  return t ? AR[t] || t : ''
}

async function search(textQuery) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({ textQuery, languageCode: 'ar', regionCode: 'OM', pageSize: 20 }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(`Places API refused "${textQuery}" (${res.status}): ${body.error?.message || ''}`)
    process.exit(1)
  }
  return body.places || []
}

const seen = new Set()
const out = []
for (const q of queries) {
  for (const p of await search(q)) {
    if (seen.has(p.id) || p.businessStatus === 'CLOSED_PERMANENTLY') continue
    seen.add(p.id)
    out.push({
      place_id: p.id,
      name: p.displayName?.text || '',
      category: p.primaryTypeDisplayName?.text || '',
      city: townOf(p.formattedAddress),
      phone: p.nationalPhoneNumber || '',
      website: p.websiteUri || '',
      source_url: p.googleMapsUri || '',
      notes: [p.formattedAddress, p.businessStatus === 'CLOSED_TEMPORARILY' && 'مغلق مؤقتاً حسب الخرائط', `بحث: ${q}`].filter(Boolean).join(' — '),
    })
  }
}
console.log(JSON.stringify(out, null, 2))
