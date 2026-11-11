import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import { supabase, isConfigured } from './supabase'
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
  const [role, setRole] = useState(null)

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setRole(null); return }
    supabase.from('profils').select('role').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => setRole(data?.role ?? 'aucun'))
  }, [session])

  if (!isConfigured) return <ConfigManquante />
  if (session === undefined) return <div className="center">Chargement…</div>
  if (!session) return <Login />
  if (role === null) return <div className="center">Chargement…</div>
  if (role !== 'admin')
    return (
      <div className="center card" style={{ maxWidth: 480 }}>
        <h2>Accès en préparation</h2>
        <p>Votre compte ({session.user.email}) n'a pas encore les droits administrateur.
          L'espace agent sera disponible dans une prochaine version.</p>
        <button onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </div>
    )

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">🚒 Suivi formation</div>
        <nav>
          <NavLink to="/" end>Tableau de bord</NavLink>
          <NavLink to="/personnel">Personnel</NavLink>
          <NavLink to="/matrice">Matrice compétences</NavLink>
          <NavLink to="/planning">Planning & FMPA</NavLink>
          <NavLink to="/referentiels">Référentiels</NavLink>
        </nav>
        <div className="sidebar-foot">
          <small>{session.user.email}</small>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>Déconnexion</button>
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/personnel" element={<Personnel />} />
          <Route path="/personnel/:id" element={<AgentFiche />} />
          <Route path="/matrice" element={<Matrice />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/planning/:id" element={<SessionDetail />} />
          <Route path="/referentiels" element={<Referentiels />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
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
