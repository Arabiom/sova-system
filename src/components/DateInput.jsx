import { useRef, useState } from 'react'
import { autoSlash, formatDayMonthYear, parseDayMonthYear } from '../lib/dates.js'

/**
 * Date field typed as day/month/year whatever the browser's language, plus a calendar button.
 * The browser's own date box follows its locale (month first in English) and mixes up the
 * order in a right-to-left page, so typing 27 went into the month.
 * `value` is ISO (yyyy-mm-dd); `onChange` receives `{ target: { value } }` like a normal input.
 */
export default function DateInput({ value = '', onChange, className = '', ...rest }) {
  const [text, setText] = useState(formatDayMonthYear(value))
  const [shown, setShown] = useState(value)
  const picker = useRef(null)

  // The value was changed from outside (form reset, calendar): show it.
  if (value !== shown) {
    setShown(value)
    setText(formatDayMonthYear(value))
  }

  const emit = (iso) => {
    setShown(iso)
    onChange?.({ target: { value: iso } })
  }

  const onType = (e) => {
    const next = autoSlash(e.target.value)
    setText(next)
    const iso = parseDayMonthYear(next)
    if (iso) emit(iso)
    else if (!next.trim()) emit('')
  }

  const invalid = text.trim() && !parseDayMonthYear(text)

  return (
    <div className="date-input">
      <input
        {...rest}
        className={`input ${invalid ? 'input-invalid' : ''} ${className}`}
        inputMode="numeric"
        dir="ltr"
        placeholder="يوم/شهر/سنة"
        value={text}
        onChange={onType}
        onBlur={() => invalid || setText(formatDayMonthYear(shown))}
      />
      <button
        type="button"
        className="date-input-btn"
        title="اختر من التقويم"
        onClick={() => {
          try {
            picker.current?.showPicker()
          } catch {
            picker.current?.click()
          }
        }}
      >
        📅
      </button>
      <input ref={picker} type="date" className="date-input-native" tabIndex={-1} aria-hidden="true" value={value || ''} onChange={(e) => emit(e.target.value)} />
    </div>
  )
}
