import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

const RESEND_SECONDS = 60

function friendlyError(error) {
  if (error?.status === 429) return 'Has pedido demasiados códigos. Espera un minuto e inténtalo de nuevo.'
  if (/signups not allowed|not allowed for otp/i.test(error?.message ?? '')) {
    return 'Ese correo no está dado de alta. Pide al club que te invite.'
  }
  return 'No hemos podido enviar el código. Revisa el correo e inténtalo de nuevo.'
}

export default function Login() {
  const [step, setStep] = useState('email') // 'email' | 'code'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function sendCode(e) {
    e?.preventDefault()
    setError('')
    setBusy(true)
    const clean = email.trim().toLowerCase()
    // shouldCreateUser:false => solo entran los alumnos que ya has dado de alta
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: false },
    })
    setBusy(false)
    if (error) return setError(friendlyError(error))
    setEmail(clean)
    setCode('')
    setStep('code')
    setCooldown(RESEND_SECONDS)
  }

  async function verifyCode(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    if (error) setError('El código no es correcto o ha caducado. Pide uno nuevo.')
    // Si va bien, onAuthStateChange en App.jsx abre la sesión solo.
  }

  return (
    <main className="screen login">
      <img className="login-logo" src="/logo.jpg" alt="Shurite-LK Club Deportivo" />

      {step === 'email' ? (
        <form onSubmit={sendCode} className="stack">
          <div className="stack-sm">
            <h1>Entra con tu correo</h1>
            <p className="muted">Te enviaremos un código por correo para entrar.</p>
          </div>

          <label className="field">
            <span>Correo electrónico</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@correo.com"
            />
          </label>

          {error && <p role="alert" className="error">{error}</p>}

          <button className="btn btn-primary" disabled={busy || !email}>
            {busy ? 'Enviando…' : 'Enviar código'}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="stack">
          <div className="stack-sm">
            <h1>Introduce tu código</h1>
            <p className="muted">Te lo hemos enviado a {email}.</p>
          </div>

          <label className="field">
            <span>Código</span>
            <input
              className="code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="······"
            />
          </label>

          {error && <p role="alert" className="error">{error}</p>}

          <button className="btn btn-primary" disabled={busy || code.length < 6}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>

          <div className="row-center">
            <button
              type="button"
              className="btn-link"
              onClick={sendCode}
              disabled={busy || cooldown > 0}
            >
              {cooldown > 0 ? `Reenviar código en ${cooldown} s` : 'Reenviar código'}
            </button>
          </div>
          <div className="row-center">
            <button type="button" className="btn-link" onClick={() => { setStep('email'); setError('') }}>
              Cambiar de correo
            </button>
          </div>
        </form>
      )}

      <p className="footnote">
        Solo pueden entrar los alumnos invitados por el club. Si no te llega el correo, revisa la carpeta de spam.
      </p>
    </main>
  )
}
