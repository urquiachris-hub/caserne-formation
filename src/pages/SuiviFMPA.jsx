import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { DOMAINES_FMPA, pct, exportCSV } from '../lib'
import { Progression, useAnnees } from './MesFMPA'

export default function SuiviFMPA() {
  const annees = useAnnees()
  const [annee, setAnnee] = useState(new Date().getFullYear())
  const [domaine, setDomaine] = useState('')
  const [q, setQ] = useState('')
  const [lignes, setLignes] = useState(null)

  useEffect(() => {
    setLignes(null)
    supabase.from('v_fmpa_suivi').select('*').eq('annee', annee).then(({ data }) => setLignes(data || []))
  }, [annee])

  if (!lignes) return <p>Chargement…</p>
  const l = lignes.filter((x) => !domaine || x.domaine === domaine)
  const agents = {}
  for (const x of l) {
    const a = (agents[x.personnel_id] ||= { id: x.personnel_id, nom: x.nom, prenom: x.prenom, grade: x.grade, total: 0, fait: 0, restants: [] })
    a.total++
    if (x.valide) a.fait++; else a.restants.push(x.code)
  }
  const liste = Object.values(agents)
    .filter((a) => `${a.nom} ${a.prenom} ${a.grade ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => pct(a.fait, a.total) - pct(b.fait, b.total) || a.nom.localeCompare(b.nom))
  const totalModules = l.length
  const totalFait = l.filter((x) => x.valide).length
  const aJour = Object.values(agents).filter((a) => a.fait === a.total).length

  return (
    <>
      <div className="page-head">
        <h1>Suivi des FMPA</h1>
        <div className="actions">
          <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} style={{ width: 'auto' }}>
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={domaine} onChange={(e) => setDomaine(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Tous domaines</option>
            {Object.entries(DOMAINES_FMPA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="ghost" onClick={() => exportCSV(`suivi-fmpa-${annee}.csv`, liste.map((a) => ({
            Nom: a.nom, Prénom: a.prenom, Grade: a.grade ?? '', Validés: a.fait, Attendus: a.total, '%': pct(a.fait, a.total), 'Restant à valider': a.restants.join(', '),
          })))}>Exporter</button>
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi"><div className="kpi-value">{pct(totalFait, totalModules)} %</div><div className="kpi-label">avancement global ({totalFait} / {totalModules})</div><Progression fait={totalFait} total={totalModules} /></div>
        <div className="card kpi ok"><div className="kpi-value">{aJour}</div><div className="kpi-label">agent(s) à jour</div></div>
        <div className={`card kpi ${Object.keys(agents).length - aJour ? 'warn' : 'ok'}`}><div className="kpi-value">{Object.keys(agents).length - aJour}</div><div className="kpi-label">agent(s) avec des modules restants</div></div>
      </div>

      <div className="filters"><input placeholder="Rechercher un agent…" value={q} onChange={(e) => setQ(e.target.value)} /></div>

      <div className="card">
        {liste.length === 0 ? <p className="muted">Aucun module FMPA attendu pour {annee}. Créez le catalogue dans « Modules FMPA ».</p> : (
          <table>
            <thead><tr><th>Agent</th><th>Validés</th><th style={{ width: '25%' }}>Avancement</th><th>Restant à valider</th></tr></thead>
            <tbody>
              {liste.map((a) => (
                <tr key={a.id}>
                  <td><Link to={`/suivi/${a.id}`}>{a.grade} {a.nom.toUpperCase()} {a.prenom}</Link></td>
                  <td className="nowrap">{a.fait} / {a.total}</td>
                  <td><Progression fait={a.fait} total={a.total} /></td>
                  <td>{a.restants.length ? a.restants.map((c) => <span key={c} className="badge warn" style={{ marginRight: 4 }}>{c}</span>) : <span className="badge ok">À jour</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
