import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { TYPES_SESSION, fmtDateTime } from '../lib'
import { useAuth } from '../auth'

export const VIDE_SESSION = { titre: '', type: 'FMPA', referentiel_id: '', formateur_id: '', date_debut: '', date_fin: '', duree_heures: 3, lieu: '', formateur: '', places_max: '', description: '' }

export function SessionForm({ initial, refs, onSaved, onCancel }) {
  const [f, setF] = useState({ ...VIDE_SESSION, ...initial })
  const [err, setErr] = useState(null)
  const [agents, setAgents] = useState([])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  useEffect(() => {
    supabase.from('personnel').select('id, nom, prenom, grade, email').eq('actif', true).order('nom')
      .then(({ data }) => setAgents(data || []))
  }, [])

  async function save(e) {
    e.preventDefault()
    const p = {
      titre: f.titre, type: f.type, referentiel_id: f.referentiel_id || null, formateur_id: f.formateur_id || null,
      date_debut: new Date(f.date_debut).toISOString(),
      date_fin: f.date_fin ? new Date(f.date_fin).toISOString() : null,
      duree_heures: Number(f.duree_heures) || 0, lieu: f.lieu || null, formateur: f.formateur || null,
      places_max: f.places_max ? Number(f.places_max) : null, description: f.description || null,
    }
    const { data, error } = f.id
      ? await supabase.from('sessions_formation').update(p).eq('id', f.id).select().single()
      : await supabase.from('sessions_formation').insert(p).select().single()
    if (error) return setErr(error.message)
    onSaved(data)
  }

  return (
    <form className="card form" onSubmit={save}>
      <div className="row">
        <label style={{ flex: 3 }}>Intitulé<input value={f.titre} onChange={set('titre')} required placeholder="FMPA SAP — bilan & RCP" /></label>
        <label>Type
          <select value={f.type} onChange={set('type')}>
            {Object.entries(TYPES_SESSION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Référentiel lié
          <select value={f.referentiel_id ?? ''} onChange={set('referentiel_id')}>
            <option value="">—</option>
            {refs.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
          </select>
        </label>
      </div>
      <div className="row">
        <label>Début<input type="datetime-local" value={f.date_debut} onChange={set('date_debut')} required /></label>
        <label>Fin<input type="datetime-local" value={f.date_fin ?? ''} onChange={set('date_fin')} /></label>
        <label>Durée (h)<input type="number" step="0.5" min="0" value={f.duree_heures} onChange={set('duree_heures')} /></label>
        <label>Places max<input type="number" min="0" value={f.places_max ?? ''} onChange={set('places_max')} /></label>
      </div>
      <div className="row">
        <label>Lieu<input value={f.lieu ?? ''} onChange={set('lieu')} /></label>
        <label>Formateur responsable (fait l'appel)
          <select value={f.formateur_id ?? ''} onChange={set('formateur_id')}>
            <option value="">—</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.grade} {a.nom.toUpperCase()} {a.prenom}{a.email ? '' : ' (sans email)'}</option>)}
          </select>
        </label>
        <label>Autres formateurs / intervenants<input value={f.formateur ?? ''} onChange={set('formateur')} /></label>
      </div>
      <label>Description / objectifs<textarea rows="2" value={f.description ?? ''} onChange={set('description')} /></label>
      {err && <div className="alert ko">{err}</div>}
      <div className="actions"><button>Enregistrer</button><button type="button" className="ghost" onClick={onCancel}>Annuler</button></div>
    </form>
  )
}

export default function Planning() {
  const { d, personnelId } = useAuth()
  const [mesSessions, setMesSessions] = useState(false)
  const [sessions, setSessions] = useState([])
  const [refs, setRefs] = useState([])
  const [ajout, setAjout] = useState(false)
  const [periode, setPeriode] = useState('avenir')
  const [type, setType] = useState('')

  async function load() {
    let req = supabase.from('sessions_formation').select('*, referentiels(code), participations(statut)')
    const now = new Date().toISOString()
    req = periode === 'avenir' ? req.gte('date_debut', now).order('date_debut') : req.lt('date_debut', now).order('date_debut', { ascending: false })
    if (type) req = req.eq('type', type)
    if (mesSessions && personnelId) req = req.eq('formateur_id', personnelId)
    const [{ data }, r] = await Promise.all([req, supabase.from('referentiels').select('id, code').eq('actif', true).order('ordre')])
    setSessions(data || []); setRefs(r.data || [])
  }
  useEffect(() => { load() }, [periode, type, mesSessions])

  // Regroupement par mois
  const parMois = {}
  for (const s of sessions) {
    const k = new Date(s.date_debut).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    ;(parMois[k] ||= []).push(s)
  }

  return (
    <>
      <div className="page-head">
        <h1>Planning de formation & FMPA</h1>
        {d.gererFormation && <button onClick={() => setAjout(true)}>+ Nouvelle session</button>}
      </div>
      {ajout && <SessionForm refs={refs} onSaved={() => { setAjout(false); load() }} onCancel={() => setAjout(false)} />}
      <div className="filters">
        <div className="tabs">
          <button className={periode === 'avenir' ? '' : 'ghost'} onClick={() => setPeriode('avenir')}>À venir</button>
          <button className={periode === 'passe' ? '' : 'ghost'} onClick={() => setPeriode('passe')}>Passées</button>
        </div>
        {personnelId && <label className="check"><input type="checkbox" checked={mesSessions} onChange={(e) => setMesSessions(e.target.checked)} /> Seulement les sessions que j'anime</label>}
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tous types</option>
          {Object.entries(TYPES_SESSION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {Object.keys(parMois).length === 0 && <p className="muted">Aucune session.</p>}
      {Object.entries(parMois).map(([mois, liste]) => (
        <section className="card" key={mois}>
          <h2 className="cap">{mois}</h2>
          <table>
            <thead><tr><th>Date</th><th>Intitulé</th><th>Type</th><th>Réf.</th><th>Durée</th><th>Lieu</th><th>Inscrits</th></tr></thead>
            <tbody>
              {liste.map((s) => (
                <tr key={s.id}>
                  <td className="nowrap">{fmtDateTime(s.date_debut)}</td>
                  <td><Link to={`/planning/${s.id}`}>{s.titre}</Link></td>
                  <td><span className={`badge type-${s.type}`}>{TYPES_SESSION[s.type]}</span></td>
                  <td>{s.referentiels?.code || '—'}</td>
                  <td>{s.duree_heures} h</td>
                  <td>{s.lieu || '—'}</td>
                  <td>{s.participations.length}{s.places_max ? ` / ${s.places_max}` : ''}
                    {periode === 'passe' && ` (${s.participations.filter((p) => p.statut === 'PRESENT').length} présents)`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  )
}
