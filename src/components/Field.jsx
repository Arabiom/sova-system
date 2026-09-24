export default function Field({ label, required, hint, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">
        {label} {required && <span className="required">*</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

/** A <select> with a blank "اختر..." option followed by plain string options. */
export function SelectOptions({ options, placeholder = 'اختر...', ...rest }) {
  return (
    <select className="input" {...rest}>
      {placeholder !== null && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  )
}
