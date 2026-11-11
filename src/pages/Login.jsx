import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMsg({ type: 'ko', text: 'Identifiants incorrects.' })
    setBusy(false)
  }

  async function reset() {
    if (!email) return setMsg({ type: 'warn', text: "Saisissez d'abord votre email." })
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname })
    setMsg(error ? { type: 'ko', text: error.message } : { type: 'ok', text: 'Email de réinitialisation envoyé.' })
  }

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>🚒 Suivi formation</h1>
        <p className="muted">Connexion réservée au personnel habilité.</p>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Mot de passe<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
        <button disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        <button type="button" className="link" onClick={reset}>Mot de passe oublié ?</button>
      </form>
    </div>
  )
}
