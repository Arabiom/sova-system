import { useState } from 'react'
import { signIn } from '../context/AuthContext.jsx'
import { COMPANY } from '../lib/constants.js'
import { tr } from '../lib/i18n.js'
import LanguageSwitch from '../components/LanguageSwitch.jsx'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!email || !password) return setError(tr('الرجاء إدخال البريد وكلمة السر'))
    setBusy(true)
    setError('')
    const { error: authError } = await signIn(email, password)
    if (authError) {
      setError(tr('بيانات الدخول غير صحيحة — تحقق من البريد وكلمة السر'))
      setBusy(false)
    }
    // On success the auth listener swaps this screen for the app.
  }

  return (
    <div className="login">
      <div className="login-glow login-glow-a" />
      <div className="login-glow login-glow-b" />
      <LanguageSwitch className="login-lang" />
      <div className="login-box slide-in">
        <div className="login-brand">
          <img className="login-logo" src={COMPANY.logoLight} alt={COMPANY.nameEn} />
          <div className="login-sub">{tr(COMPANY.systemName)}</div>
          <div className="login-cr">
            {tr(COMPANY.legalName)} • {tr(COMPANY.cr)}
          </div>
        </div>

        <form className="login-card" onSubmit={submit}>
          <div className="login-title">{tr('مرحباً بعودتك')}</div>
          <div className="login-hint">{tr('سجّل دخولك للمتابعة')}</div>

          {error && <div className="alert alert-danger">⚠️ {error}</div>}

          <label className="field">
            <span className="field-label">{tr('البريد الإلكتروني')}</span>
            <input className="input input-lg" type="email" dir="ltr" autoComplete="email" placeholder="example@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">{tr('كلمة السر')}</span>
            <input className="input input-lg" type="password" autoComplete="current-password" placeholder="••••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>

          <button type="submit" className="btn btn-primary btn-lg btn-full login-submit" disabled={busy}>
            {busy ? tr('جاري الدخول...') : tr('دخول إلى النظام')}
          </button>

          <div className="login-note">
            <strong>{tr('نظام مخصص لـ')}</strong>
            <br />
            {tr(COMPANY.legalName)} — {tr(COMPANY.nameEn)}
            <br />
            <small>{tr('للدعم الفني تواصل مع مدير النظام')}</small>
          </div>
        </form>
      </div>
    </div>
  )
}
