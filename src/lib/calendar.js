// The annual plan: exhibitions month by month.

export const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

/**
 * Exhibitions laid out month by month for each year they cover — the annual plan.
 * Months without an exhibition show as rest months. Cancelled exhibitions are left out.
 */
export function calendarYears(exhibitions) {
  const live = exhibitions.filter((ex) => ex.status !== 'ملغى' && /^\d{4}-\d{2}/.test(ex.date_from || ''))
  const years = [...new Set(live.map((ex) => +ex.date_from.slice(0, 4)))].sort()
  return years.map((year) => ({
    year,
    months: MONTHS.map((name, i) => ({
      name,
      exhibitions: live
        .filter((ex) => +ex.date_from.slice(0, 4) === year && +ex.date_from.slice(5, 7) === i + 1)
        .sort((a, b) => a.date_from.localeCompare(b.date_from)),
    })),
  }))
}
