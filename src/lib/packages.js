// Booth packages, extras and the booth note of one exhibition. Each exhibition sets its own
// (migration 018); nothing generic is shown — an exhibition without packages has none until
// they are set. The defaults only serve as a starting point on the exhibition form.

import { BOOTH_AREA, BOOTH_EXTRAS, BOOTH_PACKAGES } from './constants.js'
import { num } from './format.js'

const text = (v) => String(v ?? '').trim()

/** Packages typed on the form, without blank rows: [{ name, area, price, includes }]. */
export const cleanPackages = (rows = []) =>
  rows
    .map((p) => ({ name: text(p.name), area: text(p.area), price: num(p.price), includes: text(p.includes) }))
    .filter((p) => p.name)

/** Extras typed on the form, without blank rows: [{ name, price }]. */
export const cleanExtras = (rows = []) => rows.map((x) => ({ name: text(x.name), price: num(x.price) })).filter((x) => x.name)

/** Whether this exhibition has its own packages. */
export const hasOwnPackages = (exhibition) => Array.isArray(exhibition?.booth_packages) && cleanPackages(exhibition.booth_packages).length > 0

/** The exhibition's own packages ([] until they are set). */
export const packagesOf = (exhibition) => (hasOwnPackages(exhibition) ? cleanPackages(exhibition.booth_packages) : [])

/** The exhibition's own extras ([] until they are set). */
export const extrasOf = (exhibition) => (Array.isArray(exhibition?.booth_extras) ? cleanExtras(exhibition.booth_extras) : [])

/** The exhibition's own note under the booth section ('' when none). */
export const boothNoteOf = (exhibition) => text(exhibition?.booth_note)

/** One package of this exhibition by name (as stored on the exhibitor's booth_type). */
export const packageOf = (exhibition, name) => (name ? packagesOf(exhibition).find((p) => p.name === name) || null : null)

/** Rows to edit on the exhibition form: its own packages, else one blank row. */
export const formPackages = (exhibition) => (hasOwnPackages(exhibition) ? cleanPackages(exhibition.booth_packages) : [{ name: '', area: '', price: '', includes: '' }])
export const formExtras = (exhibition) => (Array.isArray(exhibition?.booth_extras) ? cleanExtras(exhibition.booth_extras) : [])

/** The defaults, to start an exhibition's packages from and then adjust. */
export const defaultPackages = () => BOOTH_PACKAGES.map((p) => ({ ...p, area: BOOTH_AREA }))
export const defaultExtras = () => BOOTH_EXTRAS.map((x) => ({ ...x }))
