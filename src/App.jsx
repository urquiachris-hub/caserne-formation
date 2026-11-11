import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import { supabase, isConfigured } from './supabase'
import { AuthCtx, droits, ROLES } from './auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Personnel from './pages/Personnel'
import AgentFiche from './pages/AgentFiche'
import Referentiels from './pages/Referentiels'
import Matrice from './pages/Matrice'
import Planning from './pages/Planning'
import SessionDetail from './pages/SessionDetail'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [acces, setAcces] = useState(null) // { role, personnelId }

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Nettoie l'URL après retour du lien de connexion (?code=…)
  useEffect(() => {
    if (session && window.location.search.includes('code=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    }
  }, [session])

  useEffect(() => {
    if (!session) { setAcces(null); return }
    const email = session.user.email.toLowerCase()
    Promise.all([
      supabase.from('acces_autorises').select('role').eq('email', email).maybeSingle(),
      supabase.from('personnel').select('id').ilike('email', email).maybeSingle(),
    ]).then(([a, p]) => setAcces({ role: a.data?.role ?? null, personnelId: p.data?.id ?? null }))
  }, [session])

  if (!isConfigured) return <ConfigManquante />
  if (session === undefined) return <div className="center">Chargement…</div>
  if (!session) return <Login />
  if (acces === null) return <div className="center">Chargement…</div>
  if (!acces.role)
    return (
      <div className="center card" style={{ maxWidth: 480 }}>
        <h2>Accès non autorisé</h2>
        <p>L'adresse {session.user.email} n'a pas (ou plus) d'accès à l'application. Contactez l'administrateur.</p>
        <button onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </div>
    )

  const d = droits(acces.role)
  const ctx = { ...acces, d }
  const accueil = d.lireTout ? '/' : acces.personnelId ? '/mon-suivi' : '/planning'

  return (
    <AuthCtx.Provider value={ctx}>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">🚒 Suivi formation</div>
          <nav>
            {d.lireTout && <NavLink to="/" end>Tableau de bord</NavLink>}
            {acces.personnelId && <NavLink to="/mon-suivi">Mon suivi</NavLink>}
            {d.lireTout && <NavLink to="/personnel">Personnel</NavLink>}
            {d.lireTout && <NavLink to="/matrice">Matrice compétences</NavLink>}
            <NavLink to="/planning">Planning & FMPA</NavLink>
            <NavLink to="/referentiels">Référentiels</NavLink>
          </nav>
          <div className="sidebar-foot">
            <small>{session.user.email}</small>
            <span className="badge">{ROLES[acces.role]}</span>
            <button className="ghost" onClick={() => supabase.auth.signOut()}>Déconnexion</button>
          </div>
        </aside>
        <main className="content">
          <Routes>
            {d.lireTout && <Route path="/" element={<Dashboard />} />}
            {d.lireTout && <Route path="/personnel" element={<Personnel />} />}
            {d.lireTout && <Route path="/matrice" element={<Matrice />} />}
            <Route path="/personnel/:id" element={<AgentFiche />} />
            {acces.personnelId && <Route path="/mon-suivi" element={<AgentFiche id={acces.personnelId} monSuivi />} />}
            <Route path="/planning" element={<Planning />} />
            <Route path="/planning/:id" element={<SessionDetail />} />
            <Route path="/referentiels" element={<Referentiels />} />
            <Route path="*" element={<Navigate to={accueil} />} />
          </Routes>
        </main>
      </div>
    </AuthCtx.Provider>
  )
}

function ConfigManquante() {
  return (
    <div className="center card" style={{ maxWidth: 560 }}>
      <h2>Configuration Supabase manquante</h2>
      <p>Renseignez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> :</p>
      <ul>
        <li>en local : dans un fichier <code>.env</code> (voir <code>.env.example</code>)</li>
        <li>en ligne : dans GitHub &gt; Settings &gt; Secrets and variables &gt; Actions</li>
      </ul>
    </div>
  )
}
