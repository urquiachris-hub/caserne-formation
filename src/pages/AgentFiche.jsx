import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { AgentForm } from './Personnel'
import { fmtDate, fmtDateTime, ETATS, DOMAINES, TYPES_SESSION, STATUTS_PART, nomComplet } from '../lib'

const VIDE_Q = { referentiel_id: '', date_obtention: '', date_dernier_recyclage: '', suspendu: false, commentaire: '' }

export default function AgentFiche() {
  const { id } = useParams()
  const nav = useNavigate()
  const [agent, setAgent] = useState(null)
  const [quals, setQuals] = useState([])
  const [refs, setRefs] = useState([])
  const [parts, setParts] = useState([])
  const [heures, setHeures] = useState([])
  const [edit, setEdit] = useState(false)
  const [qForm, setQForm] = useState(null)
  const [err, setErr] = useState(null)
  const annee = new Date().getFullYear()

  async function load() {
    const [a, q, r, p, h] = await Promise.all([
      supabase.from('personnel').select('*').eq('id', id).single(),
      supabase.from('v_qualifications').select('*').eq('personnel_id', id),
      supabase.from('referentiels').select('*').eq('actif', true).order('ordre'),
      supabase.from('participations').select('*, sessions_formation(*)').eq('personnel_id', id),
      supabase.from('v_heures_annuelles').select('*').eq('personnel_id', id).eq('annee', annee),
    ])
    setAgent(a.data); setQuals(q.data || []); setRefs(r.data || [])
    setParts((p.data || []).sort((x, y) => y.sessions_formation.date_debut.localeCompare(x.sessions_formation.date_debut)))
    setHeures(h.data || [])
  }
  useEffect(() => { load() }, [id])

  async function saveQ(e) {
    e.preventDefault()
    const payload = {
      personnel_id: id, referentiel_id: qForm.referentiel_id, date_obtention: qForm.date_obtention,
      date_dernier_recyclage: qForm.date_dernier_recyclage || null, suspendu: qForm.suspendu, commentaire: qForm.commentaire || null,
    }
    const { error } = qForm.id
      ? await supabase.from('qualifications').update(payload).eq('id', qForm.id)
      : await supabase.from('qualifications').insert(payload)
    if (error) return setErr(error.code === '23505' ? 'Cet agent possède déjà cette qualification.' : error.message)
    setQForm(null); setErr(null); load()
  }

  async function delQ(q) {
    if (!confirm(`Supprimer la qualification ${q.code} ?`)) return
    await supabase.from('qualifications').delete().eq('id', q.id); load()
  }

  async function delAgent() {
    if (!confirm('Supprimer définitivement cet agent et tout son historique ? (Préférez « inactif » pour conserver l\'historique.)')) return
    await supabase.from('personnel').delete().eq('id', id); nav('/personnel')
  }

  if (!agent) return <p>Chargement…</p>
  const totalH = heures.reduce((s, h) => s + Number(h.heures), 0)
  const fmpaH = heures.filter((h) => h.type === 'FMPA').reduce((s, h) => s + Number(h.heures), 0)
  const heuresAttendues = quals.reduce((s, q) => s + Number(refs.find((r) => r.id === q.referentiel_id)?.heures_fc_annuelles || 0), 0)

  return (
    <>
      <p><Link to="/personnel">← Personnel</Link></p>
      <div className="page-head">
        <h1>{nomComplet(agent)} {!agent.actif && <span className="badge muted">Inactif</span>}</h1>
        <div className="actions">
          <button className="ghost" onClick={() => setEdit(!edit)}>Modifier</button>
          <button className="ghost danger" onClick={delAgent}>Supprimer</button>
        </div>
      </div>
      {edit ? <AgentForm initial={agent} onSaved={() => { setEdit(false); load() }} onCancel={() => setEdit(false)} /> : (
        <div className="card infos">
          <span><b>Statut</b> {agent.statut}</span>
          <span><b>Matricule</b> {agent.matricule || '—'}</span>
          <span><b>Entrée</b> {fmtDate(agent.date_entree)}</span>
          <span><b>Email</b> {agent.email || '—'}</span>
          <span><b>Tél.</b> {agent.telephone || '—'}</span>
        </div>
      )}

      <div className="kpis">
        <div className="card kpi"><div className="kpi-value">{totalH} h</div><div className="kpi-label">Formation {annee} (présences)</div></div>
        <div className="card kpi"><div className="kpi-value">{fmpaH} h</div><div className="kpi-label">dont FMPA</div></div>
        <div className={`card kpi ${heuresAttendues && totalH < heuresAttendues ? 'warn' : 'ok'}`}>
          <div className="kpi-value">{heuresAttendues || '—'} h</div><div className="kpi-label">Formation continue attendue</div>
        </div>
      </div>

      <section className="card">
        <div className="page-head">
          <h2>Qualifications</h2>
          <button onClick={() => setQForm({ ...VIDE_Q })}>+ Ajouter</button>
        </div>
        {qForm && (
          <form className="form sub" onSubmit={saveQ}>
            <div className="row">
              <label>Référentiel
                <select value={qForm.referentiel_id} onChange={(e) => setQForm({ ...qForm, referentiel_id: e.target.value })} required disabled={!!qForm.id}>
                  <option value="">— choisir —</option>
                  {Object.entries(DOMAINES).map(([k, lib]) => (
                    <optgroup key={k} label={lib}>
                      {refs.filter((r) => r.domaine === k).map((r) => <option key={r.id} value={r.id}>{r.code} — {r.libelle}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>Obtention<input type="date" value={qForm.date_obtention} onChange={(e) => setQForm({ ...qForm, date_obtention: e.target.value })} required /></label>
              <label>Dernier recyclage<input type="date" value={qForm.date_dernier_recyclage ?? ''} onChange={(e) => setQForm({ ...qForm, date_dernier_recyclage: e.target.value })} /></label>
            </div>
            <div className="row">
              <label>Commentaire<input value={qForm.commentaire ?? ''} onChange={(e) => setQForm({ ...qForm, commentaire: e.target.value })} /></label>
              <label className="check"><input type="checkbox" checked={qForm.suspendu} onChange={(e) => setQForm({ ...qForm, suspendu: e.target.checked })} /> Suspendue</label>
            </div>
            {err && <div className="alert ko">{err}</div>}
            <div className="actions"><button>Enregistrer</button><button type="button" className="ghost" onClick={() => { setQForm(null); setErr(null) }}>Annuler</button></div>
          </form>
        )}
        <table>
          <thead><tr><th>Code</th><th>Libellé</th><th>Obtention</th><th>Dernier recyclage</th><th>Échéance</th><th>État</th><th></th></tr></thead>
          <tbody>
            {quals.sort((a, b) => a.code.localeCompare(b.code)).map((q) => (
              <tr key={q.id}>
                <td><b>{q.code}</b></td><td>{q.libelle}</td><td>{fmtDate(q.date_obtention)}</td>
                <td>{fmtDate(q.date_dernier_recyclage)}</td><td>{fmtDate(q.date_echeance)}</td>
                <td><span className={`badge ${ETATS[q.etat].cls}`}>{ETATS[q.etat].label}</span></td>
                <td className="nowrap">
                  <button className="link" onClick={() => setQForm({ ...q })}>Modifier</button>
                  <button className="link danger" onClick={() => delQ(q)}>Suppr.</button>
                </td>
              </tr>
            ))}
            {quals.length === 0 && <tr><td colSpan="7" className="muted">Aucune qualification enregistrée.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Historique de formation</h2>
        <table>
          <thead><tr><th>Date</th><th>Session</th><th>Type</th><th>Durée</th><th>Statut</th></tr></thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.session_id}>
                <td>{fmtDateTime(p.sessions_formation.date_debut)}</td>
                <td><Link to={`/planning/${p.session_id}`}>{p.sessions_formation.titre}</Link></td>
                <td>{TYPES_SESSION[p.sessions_formation.type]}</td>
                <td>{p.heures_validees ?? p.sessions_formation.duree_heures} h</td>
                <td>{STATUTS_PART[p.statut]}</td>
              </tr>
            ))}
            {parts.length === 0 && <tr><td colSpan="5" className="muted">Aucune participation.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  )
}
