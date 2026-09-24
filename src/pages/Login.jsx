import { useState } from 'react'
import { signIn } from '../context/AuthContext.jsx'
import { COMPANY } from '../lib/constants.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!email || !password) return setError('الرجاء إدخال البريد وكلمة السر')
    setBusy(true)
    setError('')
    const { error: authError } = await signIn(email, password)
    if (authError) {
      setError('بيانات الدخول غير صحيحة — تحقق من البريد وكلمة السر')
      setBusy(false)
    }
    // On success the auth listener swaps this screen for the app.
  }

  return (
    <div className="login">
      <div className="login-glow login-glow-a" />
      <div className="login-glow login-glow-b" />
      <div className="login-box slide-in">
        <div className="login-brand">
          <div className="logo-mark logo-xl">S</div>
          <div className="login-name">SOVA</div>
          <div className="login-sub">نظام الإدارة الداخلي</div>
          <div className="login-cr">
            {COMPANY.name} • {COMPANY.cr}
          </div>
        </div>

        <form className="login-card" onSubmit={submit}>
          <div className="login-title">مرحباً بعودتك</div>
          <div className="login-hint">سجّل دخولك للمتابعة</div>

          {error && <div className="alert alert-danger">⚠️ {error}</div>}

          <label className="field">
            <span className="field-label">البريد الإلكتروني</span>
            <input className="input input-lg" type="email" dir="ltr" autoComplete="email" placeholder="example@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">كلمة السر</span>
            <input className="input input-lg" type="password" autoComplete="current-password" placeholder="••••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>

          <button type="submit" className="btn btn-primary btn-lg btn-full login-submit" disabled={busy}>
            {busy ? 'جاري الدخول...' : 'دخول إلى النظام'}
          </button>

          <div className="login-note">
            <strong>نظام مخصص لـ</strong>
            <br />
            {COMPANY.name} — {COMPANY.brandFull}
            <br />
            <small>للدعم الفني تواصل مع مدير النظام</small>
          </div>
        </form>
      </div>
    </div>
  )
}
