import { Link } from 'react-router-dom'
import { exhibitionTitle } from '../lib/format.js'
import StatusBadge from './StatusBadge.jsx'
import { calendarYears } from '../lib/calendar.js'

const dayRange = (ex) => `${+ex.date_from.slice(8, 10)} – ${+String(ex.date_to || ex.date_from).slice(8, 10)}`

export default function AnnualCalendar({ exhibitions }) {
  const years = calendarYears(exhibitions)
  if (!years.length) return <div className="empty-inline">لا توجد معارض بعد</div>
  return years.map(({ year, months }) => {
    const count = months.reduce((t, m) => t + m.exhibitions.length, 0)
    return (
      <section key={year} className="panel mb-16">
        <div className="calendar-year">
          <strong>{year}</strong>
          <span className="muted small">{count} معرض</span>
        </div>
        <div className="table-wrap">
          <table className="table calendar-table">
            <thead>
              <tr>
                <th>الشهر</th>
                <th>المعرض / المناسبة</th>
                <th>التاريخ</th>
                <th>المول</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) =>
                m.exhibitions.length ? (
                  m.exhibitions.map((ex, i) => (
                    <tr key={ex.id}>
                      {i === 0 && (
                        <td className="strong" rowSpan={m.exhibitions.length}>
                          {m.name}
                        </td>
                      )}
                      <td>
                        <Link to={`/exhibitions/${ex.id}`} className="strong">
                          {exhibitionTitle(ex)}
                        </Link>
                        {ex.occasion && <div className="muted tiny">{ex.occasion}</div>}
                        {ex.notes && <div className="muted tiny">{ex.notes}</div>}
                      </td>
                      <td className="nowrap">
                        {dayRange(ex)} / {+ex.date_from.slice(5, 7)} / {year}
                      </td>
                      <td>{ex.mall}</td>
                      <td>
                        <StatusBadge status={ex.status} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr key={m.name} className="calendar-rest">
                    <td>{m.name}</td>
                    <td colSpan={4} className="muted small">
                      بلا معرض
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
