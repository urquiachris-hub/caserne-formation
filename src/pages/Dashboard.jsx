import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { fmtDate, fmtDateTime, ETATS, TYPES_SESSION } from '../lib'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [alertes, setAlertes] = useState([])
  const [sessions, setSessions] = useState([])

  useEffect(() => {
    (async () => {
      const [{ count: nbAgents }, { data: quals }, { data: sess }] = await Promise.all([
        supabase.from('personnel').select('*', { count: 'exact', head: true }).eq('actif', true),
        supabase.from('v_qualifications').select('*').eq('agent_actif', true),
        supabase.from('sessions_formation').select('*, participations(count)')
          .gte('date_debut', new Date().toISOString()).order('date_debut').limit(8),
      ])
      const q = quals || []
      setStats({
        agents: nbAgents ?? 0,
        expirees: q.filter((x) => x.etat === 'EXPIRE').length,
        aRecycler: q.filter((x) => x.etat === 'A_RECYCLER').length,
        sessions: (sess || []).length,
      })
      setAlertes(q.filter((x) => x.etat === 'EXPIRE' || x.etat === 'A_RECYCLER')
        .sort((a, b) => (a.date_echeance || '').localeCompare(b.date_echeance || '')))
      setSessions(sess || [])
    })()
  }, [])

  if (!stats) return <p>Chargement…</p>
  return (
    <>
      <h1>Tableau de bord</h1>
      <div className="kpis">
        <Kpi label="Agents actifs" value={stats.agents} />
        <Kpi label="Qualifications expirées" value={stats.expirees} cls={stats.expirees ? 'ko' : 'ok'} />
        <Kpi label="À recycler sous 60 j" value={stats.aRecycler} cls={stats.aRecycler ? 'warn' : 'ok'} />
        <Kpi label="Sessions à venir" value={stats.sessions} />
      </div>

      <div className="grid2">
        <section className="card">
          <h2>Alertes recyclage</h2>
          {alertes.length === 0 ? <p className="muted">Aucune alerte. 👍</p> : (
            <table>
              <thead><tr><th>Agent</th><th>Qualif.</th><th>Échéance</th><th>État</th></tr></thead>
              <tbody>
                {alertes.slice(0, 15).map((a) => (
                  <tr key={a.id}>
                    <td><Link to={`/personnel/${a.personnel_id}`}>{a.nom} {a.prenom}</Link></td>
                    <td>{a.code}</td>
                    <td>{fmtDate(a.date_echeance)}</td>
                    <td><span className={`badge ${ETATS[a.etat].cls}`}>{ETATS[a.etat].label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h2>Prochaines formations</h2>
          {sessions.length === 0 ? <p className="muted">Aucune session planifiée.</p> : (
            <table>
              <thead><tr><th>Date</th><th>Intitulé</th><th>Type</th><th>Inscrits</th></tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{fmtDateTime(s.date_debut)}</td>
                    <td><Link to={`/planning/${s.id}`}>{s.titre}</Link></td>
                    <td>{TYPES_SESSION[s.type]}</td>
                    <td>{s.participations?.[0]?.count ?? 0}{s.places_max ? ` / ${s.places_max}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  )
}

const Kpi = ({ label, value, cls = '' }) => (
  <div className={`card kpi ${cls}`}><div className="kpi-value">{value}</div><div className="kpi-label">{label}</div></div>
)
