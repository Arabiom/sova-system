import { Link } from 'react-router-dom'
import { exhibitionTitle } from '../lib/format.js'
import StatusBadge from './StatusBadge.jsx'
import { calendarYears } from '../lib/calendar.js'
import { tr } from '../lib/i18n.js'

const dayRange = (ex) => `${+ex.date_from.slice(8, 10)} – ${+String(ex.date_to || ex.date_from).slice(8, 10)}`

export default function AnnualCalendar({ exhibitions }) {
  const years = calendarYears(exhibitions)
  if (!years.length) return <div className="empty-inline">{tr('لا توجد معارض بعد')}</div>
  return years.map(({ year, months }) => {
    const count = months.reduce((t, m) => t + m.exhibitions.length, 0)
    return (
      <section key={year} className="panel mb-16">
        <div className="calendar-year">
          <strong>{tr(year)}</strong>
          <span className="muted small">{count}{' '}{tr('معرض')}</span>
        </div>
        <div className="table-wrap">
          <table className="table calendar-table">
            <thead>
              <tr>
                <th>{tr('الشهر')}</th>
                <th>{tr('المعرض / المناسبة')}</th>
                <th>{tr('التاريخ')}</th>
                <th>{tr('المول')}</th>
                <th>{tr('الحالة')}</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) =>
                m.exhibitions.length ? (
                  m.exhibitions.map((ex, i) => (
                    <tr key={ex.id}>
                      {i === 0 && (
                        <td className="strong" rowSpan={m.exhibitions.length}>
                          {tr(m.name)}
                        </td>
                      )}
                      <td>
                        <Link to={`/exhibitions/${ex.id}`} className="strong">
                          {exhibitionTitle(ex)}
                        </Link>
                        {tr(ex.occasion) && <div className="muted tiny">{tr(ex.occasion)}</div>}
                        {ex.notes && <div className="muted tiny">{tr(ex.notes)}</div>}
                      </td>
                      <td className="nowrap">
                        {dayRange(ex)} / {+ex.date_from.slice(5, 7)} / {tr(year)}
                      </td>
                      <td>{tr(ex.mall)}</td>
                      <td>
                        <StatusBadge status={ex.status} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr key={m.name} className="calendar-rest">
                    <td>{tr(m.name)}</td>
                    <td colSpan={4} className="muted small">
                      {tr('بلا معرض')}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>
    )
  })
}
