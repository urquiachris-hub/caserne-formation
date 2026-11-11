import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { DOMAINES_FMPA, fmtDate, fmtDateTime, pct, nomComplet } from '../lib'

export function Progression({ fait, total }) {
  const p = pct(fait, total)
  return (
    <div className="progress" title={`${fait} / ${total}`}>
      <div className={`progress-bar ${p === 100 ? 'ok' : p >= 50 ? 'warn' : 'ko'}`} style={{ width: `${p}%` }} />
    </div>
  )
}

export function useAnnees() {
  const [annees, setAnnees] = useState([new Date().getFullYear()])
  useEffect(() => {
    supabase.from('fmpa_modules').select('annee').then(({ data }) => {
      const s = new Set([new Date().getFullYear(), ...(data || []).map((x) => x.annee)])
      setAnnees([...s].sort((a, b) => b - a))
    })
  }, [])
  return annees
}

// Suivi FMPA d'un agent (utilisé par « Mes FMPA » et par le détail du suivi)
export function FmpaAgent({ personnelId, monEspace = false }) {
  const { d } = useAuth()
  const annees = useAnnees()
  const [annee, setAnnee] = useState(new Date().getFullYear())
  const [agent, setAgent] = useState(null)
  const [lignes, setLignes] = useState(null)
  const [sessions, setSessions] = useState([])
  const [valid, setValid] = useState(null) // { module_id, date, commentaire }

  async function load() {
    const [a, l] = await Promise.all([
      supabase.from('personnel').select('id, nom, prenom, grade').eq('id', personnelId).single(),
      supabase.from('v_fmpa_suivi').select('*').eq('personnel_id', personnelId).eq('annee', annee).order('domaine').order('ordre').order('code'),
    ])
    setAgent(a.data); setLignes(l.data || [])
    const restants = (l.data || []).filter((x) => !x.valide).map((x) => x.module_id)
    if (restants.length) {
      const { data } = await supabase.from('sessions_formation').select('id, titre, date_debut, lieu, fmpa_module_id')
        .in('fmpa_module_id', restants).gte('date_debut', new Date().toISOString()).order('date_debut')
      setSessions(data || [])
    } else setSessions([])
  }
  useEffect(() => { load() }, [personnelId, annee])

  // Mise à jour en temps réel quand une validation change
  useEffect(() => {
    const ch = supabase.channel(`fmpa-${personnelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fmpa_validations', filter: `personnel_id=eq.${personnelId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [personnelId, annee])

  async function valider(e) {
    e.preventDefault()
    await supabase.from('fmpa_validations').insert({
      personnel_id: personnelId, module_id: valid.module_id, date_validation: valid.date, commentaire: valid.commentaire || null,
    })
    setValid(null); load()
  }
  async function annuler(l) {
    if (!confirm(`Annuler la validation de ${l.code} ?`)) return
    await supabase.from('fmpa_validations').delete().eq('personnel_id', personnelId).eq('module_id', l.module_id); load()
  }

  if (!lignes || !agent) return <p>Chargement…</p>
  const total = lignes.length
  const fait = lignes.filter((x) => x.valide).length
  const domaines = Object.keys(DOMAINES_FMPA).filter((k) => lignes.some((x) => x.domaine === k))

  return (
    <>
      {!monEspace && <p><Link to="/suivi">← Suivi des FMPA</Link></p>}
      <div className="page-head">
        <h1>{monEspace ? 'Mes FMPA' : `FMPA — ${nomComplet(agent)}`}</h1>
        <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} style={{ width: 'auto' }}>
          {annees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {total === 0 ? (
        <div className="card muted">Aucun module FMPA attendu pour {annee}
          {monEspace ? '. Si cela vous paraît anormal, contactez le responsable formation.' : ' (vérifier les emplois de l\'agent et le catalogue des modules).'}</div>
      ) : (
        <>
          <div className="kpis">
            <div className={`card kpi ${fait === total ? 'ok' : ''}`}>
              <div className="kpi-value">{fait} / {total}</div>
              <div className="kpi-label">modules validés ({pct(fait, total)} %)</div>
              <Progression fait={fait} total={total} />
            </div>
            <div className={`card kpi ${total - fait ? 'warn' : 'ok'}`}>
              <div className="kpi-value">{total - fait}</div>
              <div className="kpi-label">restant(s) à valider</div>
            </div>
            {domaines.map((k) => {
              const l = lignes.filter((x) => x.domaine === k)
              const f = l.filter((x) => x.valide).length
              return (
                <div key={k} className="card kpi">
                  <div className="kpi-value small">{f} / {l.length}</div>
                  <div className="kpi-label">{DOMAINES_FMPA[k]}</div>
                  <Progression fait={f} total={l.length} />
                </div>
              )
            })}
          </div>

          {sessions.length > 0 && (
            <section className="card">
              <h2>Prochaines sessions pour valider ce qui reste</h2>
              <table>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="nowrap">{fmtDateTime(s.date_debut)}</td>
                      <td><Link to={`/planning/${s.id}`}>{s.titre}</Link></td>
                      <td><b>{lignes.find((x) => x.module_id === s.fmpa_module_id)?.code}</b></td>
                      <td>{s.lieu || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {domaines.map((k) => (
            <section className="card" key={k}>
              <h2>{DOMAINES_FMPA[k]}</h2>
              <table>
                <thead><tr><th>Module</th><th>Intitulé</th><th>Durée</th><th>État</th><th>Validé le</th><th></th></tr></thead>
                <tbody>
                  {lignes.filter((x) => x.domaine === k).map((l) => (
                    <tr key={l.module_id}>
                      <td><b>{l.code}</b></td>
                      <td>{l.libelle}</td>
                      <td>{l.duree_heures ? `${l.duree_heures} h` : '—'}</td>
                      <td><span className={`badge ${l.valide ? 'ok' : 'warn'}`}>{l.valide ? 'Validé' : 'À valider'}</span></td>
                      <td>{l.valide ? <>{fmtDate(l.date_validation)}{l.session_id && <> · <Link to={`/planning/${l.session_id}`}>session</Link></>}{l.commentaire && <small className="muted"> · {l.commentaire}</small>}</> : '—'}</td>
                      <td className="nowrap">
                        {d.gererFormation && !l.valide && <button className="link" onClick={() => setValid({ module_id: l.module_id, date: new Date().toISOString().slice(0, 10), commentaire: '' })}>Valider</button>}
                        {d.gererFormation && l.valide && <button className="link danger" onClick={() => annuler(l)}>Annuler</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}

      {valid && (
        <div className="modal-bg" onClick={() => setValid(null)}>
          <form className="card form modal" onClick={(e) => e.stopPropagation()} onSubmit={valider}>
            <h2>Valider {lignes.find((x) => x.module_id === valid.module_id)?.code}</h2>
            <label>Date de validation<input type="date" value={valid.date} onChange={(e) => setValid({ ...valid, date: e.target.value })} required /></label>
            <label>Commentaire (rattrapage, autre centre…)<input value={valid.commentaire} onChange={(e) => setValid({ ...valid, commentaire: e.target.value })} /></label>
            <div className="actions"><button>Valider</button><button type="button" className="ghost" onClick={() => setValid(null)}>Annuler</button></div>
          </form>
        </div>
      )}
    </>
  )
}

export default function MesFMPA() {
  const { personnelId } = useAuth()
  return <FmpaAgent personnelId={personnelId} monEspace />
}

export function FmpaAgentRoute() {
  const { id } = useParams()
  return <FmpaAgent personnelId={id} />
}
