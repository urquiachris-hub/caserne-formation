import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { DOMAINES, ETATS, fmtDate, exportCSV } from '../lib'

export default function Matrice() {
  const [agents, setAgents] = useState([])
  const [refs, setRefs] = useState([])
  const [quals, setQuals] = useState({})
  const [domaine, setDomaine] = useState('')

  useEffect(() => {
    (async () => {
      const [a, r, q] = await Promise.all([
        supabase.from('personnel').select('id, nom, prenom, grade').eq('actif', true).order('nom'),
        supabase.from('referentiels').select('*').eq('actif', true).order('ordre'),
        supabase.from('v_qualifications').select('personnel_id, referentiel_id, etat, date_echeance'),
      ])
      setAgents(a.data || []); setRefs(r.data || [])
      const m = {}
      for (const x of q.data || []) m[`${x.personnel_id}|${x.referentiel_id}`] = x
      setQuals(m)
    })()
  }, [])

  const cols = refs.filter((r) => !domaine || r.domaine === domaine)
  const totaux = cols.map((r) => agents.filter((a) => {
    const q = quals[`${a.id}|${r.id}`]; return q && (q.etat === 'VALIDE' || q.etat === 'A_RECYCLER')
  }).length)

  function exporter() {
    exportCSV('matrice-competences.csv', agents.map((a) => {
      const o = { Nom: a.nom, Prénom: a.prenom, Grade: a.grade ?? '' }
      cols.forEach((r) => { const q = quals[`${a.id}|${r.id}`]; o[r.code] = q ? ETATS[q.etat].label : '' })
      return o
    }))
  }

  return (
    <>
      <div className="page-head">
        <h1>Matrice des compétences</h1>
        <div className="actions">
          <select value={domaine} onChange={(e) => setDomaine(e.target.value)}>
            <option value="">Tous domaines</option>
            {Object.entries(DOMAINES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="ghost" onClick={exporter}>Exporter</button>
        </div>
      </div>
      <div className="legend">
        {Object.values(ETATS).map((e) => <span key={e.label} className={`badge ${e.cls}`}>{e.label}</span>)}
      </div>
      <div className="card scroll">
        <table className="matrix">
          <thead>
            <tr><th className="sticky">Agent</th>{cols.map((r) => <th key={r.id} title={r.libelle}>{r.code}</th>)}</tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td className="sticky"><Link to={`/personnel/${a.id}`}>{a.nom.toUpperCase()} {a.prenom}</Link></td>
                {cols.map((r) => {
                  const q = quals[`${a.id}|${r.id}`]
                  return <td key={r.id} className={q ? `cell ${ETATS[q.etat].cls}` : 'cell'}
                    title={q ? `${ETATS[q.etat].label} — échéance ${fmtDate(q.date_echeance)}` : 'Non détenu'}>{q ? '●' : ''}</td>
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th className="sticky">Agents opérationnels</th>{totaux.map((t, i) => <th key={i}>{t}</th>)}</tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}
