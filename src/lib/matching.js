// Who an exhibition is for: each exhibition names its sectors (migration 040), each client has
// its sector and a note on its products — so every client shows which exhibition suits it, why,
// and from when to contact it. An exhibition without sectors is open to every sector.
import { guessSector, sectorsIn } from './prospects.js'
import { addDays } from './team.js'

/** Contact a client this many days before the exhibition that suits it opens. */
export const CONTACT_LEAD_DAYS = 60

/** A client's standard sectors, from its sector and products (from its name when both are empty). */
export function clientSectors(c) {
  const text = `${c.sector || ''} ${c.products || ''}`
  const found = sectorsIn(text)
  if (found.length || text.trim()) return found
  const g = guessSector(c.name || '')
  return g ? [g] : []
}

/** Exhibitions not ended nor cancelled, soonest first. */
export const upcomingExhibitions = (exhibitions, today) =>
  exhibitions.filter((e) => e.date_to >= today && e.status !== 'ملغى').sort((a, b) => String(a.date_from).localeCompare(String(b.date_from)))

/** Whether an exhibition suits these sectors (one without target sectors suits everyone). */
export const suits = (exhibition, sectors) => !exhibition.sectors?.length || exhibition.sectors.some((s) => sectors.includes(s))

/**
 * Why and when to contact a client: the first upcoming exhibition made for one of its sectors,
 * else the first open one — leaving out those it already takes part in, and nobody marked
 * «غير مناسب». { exhibition, matched, open, from, now } or null.
 */
export function contactPlan(client, upcoming, today, takingPart = new Set(), sectors = clientSectors(client)) {
  if (client.outreach === 'غير مناسب') return null
  const free = upcoming.filter((e) => !takingPart.has(e.id))
  const targeted = free.find((e) => e.sectors?.length && e.sectors.some((s) => sectors.includes(s)))
  const exhibition = targeted || free.find((e) => !e.sectors?.length)
  if (!exhibition) return null
  const from = addDays(exhibition.date_from, -CONTACT_LEAD_DAYS)
  return { exhibition, matched: targeted ? exhibition.sectors.filter((s) => sectors.includes(s)) : [], open: !targeted, from, now: from <= today }
}
