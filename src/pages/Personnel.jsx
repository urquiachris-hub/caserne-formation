import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { exportCSV } from '../lib'
import { useAuth } from '../auth'

export const VIDE_AGENT = { matricule: '', nom: '', prenom: '', grade: '', statut: 'SPV', date_entree: '', email: '', telephone: '', actif: true }

export function AgentForm({ initial, onSaved, onCancel }) {
  const [f, setF] = useState({ ...VIDE_AGENT, ...initial })
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function save(e) {
    e.preventDefault()
    const payload = { ...f, date_entree: f.date_entree || null, matricule: f.matricule || null }
    delete payload.qualifications
    const { error } = f.id
      ? await supabase.from('personnel').update(payload).eq('id', f.id)
      : await supabase.from('personnel').insert(payload)
    if (error) return setErr(error.message)
    onSaved()
  }

  return (
    <form className="card form" onSubmit={save}>
      <div className="row">
        <label>Nom<input value={f.nom} onChange={set('nom')} required /></label>
        <label>Prénom<input value={f.prenom} onChange={set('prenom')} required /></label>
        <label>Grade<input value={f.grade ?? ''} onChange={set('grade')} placeholder="SAP, CPL, SGT…" /></label>
      </div>
      <div className="row">
        <label>Statut
          <select value={f.statut} onChange={set('statut')}>
            <option>SPV</option><option>SPP</option><option>PATS</option><option>JSP</option>
          </select>
        </label>
        <label>Matricule<input value={f.matricule ?? ''} onChange={set('matricule')} /></label>
        <label>Date d'entrée<input type="date" value={f.date_entree ?? ''} onChange={set('date_entree')} /></label>
      </div>
      <div className="row">
        <label>Email<input type="email" value={f.email ?? ''} onChange={set('email')} /></label>
        <label>Téléphone<input value={f.telephone ?? ''} onChange={set('telephone')} /></label>
        <label className="check"><input type="checkbox" checked={f.actif} onChange={set('actif')} /> Actif</label>
      </div>
      {err && <div className="alert ko">{err}</div>}
      <div className="actions">
        <button>Enregistrer</button>
        <button type="button" className="ghost" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  )
}

export default function Personnel() {
  const { d } = useAuth()
  const [agents, setAgents] = useState([])
  const [q, setQ] = useState('')
  const [inactifs, setInactifs] = useState(false)
  const [ajout, setAjout] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = () =>
    supabase.from('personnel').select('*, qualifications(count)').order('nom')
      .then(({ data }) => setAgents(data || []))
  useEffect(() => { load() }, [])

  const liste = agents.filter((a) =>
    (inactifs || a.actif) &&
    `${a.nom} ${a.prenom} ${a.matricule ?? ''} ${a.grade ?? ''}`.toLowerCase().includes(q.toLowerCase()))

  // Import CSV : colonnes nom;prenom;grade;statut;matricule;email;telephone;date_entree (AAAA-MM-JJ)
  async function importer(e) {
    const file = e.target.files[0]
    if (!file) return
    const text = await file.text()
    const lignes = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
    const sep = lignes[0].includes(';') ? ';' : ','
    const entetes = lignes[0].split(sep).map((h) => h.trim().toLowerCase())
    const rows = lignes.slice(1).map((l) => {
      const v = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''))
      const o = {}
      entetes.forEach((h, i) => { if (Object.keys(VIDE_AGENT).includes(h) && v[i]) o[h] = v[i] })
      return o
    }).filter((o) => o.nom && o.prenom)
    const { error } = await supabase.from('personnel').insert(rows)
    setMsg(error ? { type: 'ko', text: error.message } : { type: 'ok', text: `${rows.length} agent(s) importé(s).` })
    e.target.value = ''
    load()
  }

  return (
    <>
      <div className="page-head">
        <h1>Personnel</h1>
        <div className="actions">
          {d.admin && <button onClick={() => setAjout(true)}>+ Ajouter un agent</button>}
          {d.admin && <label className="button ghost">Importer CSV<input type="file" accept=".csv" hidden onChange={importer} /></label>}
          <button className="ghost" onClick={() => exportCSV('personnel.csv', liste.map(({ qualifications, user_id, ...r }) => r))}>Exporter</button>
        </div>
      </div>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      {ajout && <AgentForm onSaved={() => { setAjout(false); load() }} onCancel={() => setAjout(false)} />}
      <div className="filters">
        <input placeholder="Rechercher (nom, matricule, grade)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check"><input type="checkbox" checked={inactifs} onChange={(e) => setInactifs(e.target.checked)} /> Afficher les inactifs</label>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Nom</th><th>Prénom</th><th>Grade</th><th>Statut</th><th>Matricule</th><th>Qualifs</th></tr></thead>
          <tbody>
            {liste.map((a) => (
              <tr key={a.id} className={a.actif ? '' : 'inactive'}>
                <td><Link to={`/personnel/${a.id}`}>{a.nom.toUpperCase()}</Link></td>
                <td>{a.prenom}</td><td>{a.grade}</td><td>{a.statut}</td><td>{a.matricule}</td>
                <td>{a.qualifications?.[0]?.count ?? 0}</td>
              </tr>
            ))}
            {liste.length === 0 && <tr><td colSpan="6" className="muted">Aucun agent.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
