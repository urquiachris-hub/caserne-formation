import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import { supabase, isConfigured } from './supabase'
import { AuthCtx, droits, ROLES } from './auth'
import { LOGO } from './logo'
import Login from './pages/Login'
import Documents from './pages/Documents'
import MesFMPA, { FmpaAgentRoute } from './pages/MesFMPA'
import SuiviFMPA from './pages/SuiviFMPA'
import ModulesFMPA from './pages/ModulesFMPA'
import Personnel from './pages/Personnel'
import AgentFiche from './pages/AgentFiche'
import Emplois from './pages/Emplois'
import Matrice from './pages/Matrice'
import Planning from './pages/Planning'
import SessionDetail from './pages/SessionDetail'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [acces, setAcces] = useState(null) // { role, personnelId }
  const [menu, setMenu] = useState(false)

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
  const fermer = () => setMenu(false)

  return (
    <AuthCtx.Provider value={ctx}>
      <div className="layout">
        <aside className={`sidebar ${menu ? 'open' : ''}`}>
          <div className="brand">
            <img src={LOGO} alt="Ornano" className="brand-logo" />
            <div className="brand-txt"><b>ORNANO</b><small>Suivi formation</small></div>
            <button className="burger" onClick={() => setMenu(!menu)} aria-label="Menu">☰</button>
          </div>
          <nav onClick={fermer}>
            <NavLink to="/referentiels">Référentiels</NavLink>
            {acces.personnelId && <NavLink to="/mes-fmpa">Mes FMPA</NavLink>}
            <NavLink to="/planning">Planning</NavLink>
            {d.lireTout && <>
              <div className="nav-title">Suivi de la formation</div>
              <NavLink to="/suivi">Suivi des FMPA</NavLink>
              <NavLink to="/matrice">Matrice des emplois</NavLink>
              <NavLink to="/personnel">Personnel</NavLink>
            </>}
            {d.gererFormation && <>
              <div className="nav-title">Paramétrage</div>
              <NavLink to="/modules-fmpa">Modules FMPA</NavLink>
              <NavLink to="/emplois">Emplois & qualifications</NavLink>
            </>}
            {acces.personnelId && <NavLink to="/mon-dossier">Mon dossier</NavLink>}
          </nav>
          <div className="sidebar-foot">
            <small>{session.user.email}</small>
            <span className="badge">{ROLES[acces.role]}</span>
            <button className="ghost" onClick={() => supabase.auth.signOut()}>Déconnexion</button>
          </div>
        </aside>
        <main className="content">
          <Routes>
            <Route path="/referentiels" element={<Navigate to="/referentiels/SUAP" replace />} />
            <Route path="/referentiels/:cat" element={<Documents />} />
            {acces.personnelId && <Route path="/mes-fmpa" element={<MesFMPA />} />}
            {acces.personnelId && <Route path="/mon-dossier" element={<AgentFiche id={acces.personnelId} monSuivi />} />}
            <Route path="/planning" element={<Planning />} />
            <Route path="/planning/:id" element={<SessionDetail />} />
            <Route path="/personnel/:id" element={<AgentFiche />} />
            {d.lireTout && <Route path="/suivi" element={<SuiviFMPA />} />}
            {d.lireTout && <Route path="/suivi/:id" element={<FmpaAgentRoute />} />}
            {d.lireTout && <Route path="/matrice" element={<Matrice />} />}
            {d.lireTout && <Route path="/personnel" element={<Personnel />} />}
            {d.gererFormation && <Route path="/modules-fmpa" element={<ModulesFMPA />} />}
            {d.gererFormation && <Route path="/emplois" element={<Emplois />} />}
            <Route path="*" element={<Navigate to="/referentiels/SUAP" replace />} />
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
