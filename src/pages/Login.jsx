import { useState } from 'react'
import { supabase } from '../supabase'
import { LOGO } from '../logo'

export default function Login() {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    if (error) {
      // L'adresse hors liste blanche est refusée par la base (erreur 500 / P0001)
      const refus = error.status >= 500 || /non autoris|database error|not allowed|signups not allowed|^\{\}$/i.test(error.message || '')
      const tropDeDemandes = error.status === 429
      setMsg({
        type: 'ko',
        text: refus ? "Cette adresse n'est pas autorisée. Contactez l'administrateur."
          : tropDeDemandes ? 'Trop de demandes. Patientez quelques minutes avant de redemander un lien.'
          : error.message,
      })
    } else {
      setMsg({ type: 'ok', text: 'Lien de connexion envoyé ! Ouvrez votre boîte mail sur cet appareil et cliquez sur le lien.' })
    }
    setBusy(false)
  }

  return (
    <div className="center login-page">
      <img src={LOGO} alt="Écusson Ornano" className="login-logo" />
      <form className="card login" onSubmit={submit}>
        <h1>Suivi formation</h1>
        <p className="muted">Saisissez votre adresse email : vous recevrez un lien de connexion (pas de mot de passe).</p>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
        {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
        <button disabled={busy}>{busy ? 'Envoi…' : 'Recevoir le lien de connexion'}</button>
        <small className="muted">Ouvrez le lien sur le même appareil et le même navigateur que cette page.</small>
      </form>
    </div>
  )
}
