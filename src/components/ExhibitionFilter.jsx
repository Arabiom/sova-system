import { exhibitionLabel } from '../lib/format.js'
import { tr } from '../lib/i18n.js'

/** "كل المعارض" + one option per exhibition. Value is 'all' or an exhibition id. */
export default function ExhibitionFilter({ exhibitions, value, onChange, className = '' }) {
  return (
    <select className={`input input-compact ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">{tr('كل المعارض')}</option>
      {exhibitions.map((ex) => (
        <option key={ex.id} value={ex.id}>
          {exhibitionLabel(ex)}
        </option>
      ))}
    </select>
  )
}
