import { currentLang, setLang } from '../lib/i18n.js'

/** "English" / "العربية" — switches the whole interface and remembers the choice on this device. */
export default function LanguageSwitch({ className = '' }) {
  const next = currentLang() === 'ar' ? 'en' : 'ar'
  return (
    <button type="button" className={`lang-switch ${className}`} onClick={() => setLang(next)} lang={next} title={next === 'en' ? 'Switch to English' : 'التبديل إلى العربية'}>
      🌐 {next === 'en' ? 'English' : 'العربية'}
    </button>
  )
}
