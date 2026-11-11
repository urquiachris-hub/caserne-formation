import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { SessionForm } from './Planning'
import { useAuth } from '../auth'
import { TYPES_SESSION, STATUTS_PART, fmtDateTime, toLocalInput, exportCSV } from '../lib'

export default function SessionDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { d, personnelId } = useAuth()
  const [s, setS] = useState(null)
  const [parts, setParts] = useState([])
  const [agents, setAgents] = useState([])
  const [refs, setRefs] = useState([])
  const [edit, setEdit] = useState(false)
  const [ajoutId, setAjoutId] = useState('')
  const [msg, setMsg] = useState(null)

  async function load() {
    const [a, b, c, d] = await Promise.all([
      supabase.from('sessions_formation').select('*, referentiels(*), fmpa_modules!sessions_formation_fmpa_module_id_fkey(code, libelle), formateur_p:personnel!sessions_formation_formateur_id_fkey(nom, prenom, grade)').eq('id', id).single(),
      supabase.from('participations').select('*, personnel(id, nom, prenom, grade)').eq('session_id', id),
      supabase.from('personnel').select('id, nom, prenom, grade').eq('actif', true).order('nom'),
      supabase.from('referentiels').select('id, code').eq('actif', true).order('ordre'),
    ])
    setS(a.data)
    setParts((b.data || []).sort((x, y) => x.personnel.nom.localeCompare(y.personnel.nom)))
    setAgents(c.data || []); setRefs(d.data || [])
  }
  useEffect(() => { load() }, [id])

  async function inscrire(personnelIds) {
    if (!personnelIds.length) return
    await supabase.from('participations').upsert(personnelIds.map((pid) => ({ session_id: id, personnel_id: pid })), { ignoreDuplicates: true })
    setAjoutId(''); load()
  }
  async function setStatut(pid, statut) {
    await supabase.from('participations').update({ statut }).eq('session_id', id).eq('personnel_id', pid); load()
  }
  async function setHeures(pid, v) {
    await supabase.from('participations').update({ heures_validees: v === '' ? null : Number(v) }).eq('session_id', id).eq('personnel_id', pid)
  }
  async function retirer(pid) {
    await supabase.from('participations').delete().eq('session_id', id).eq('personnel_id', pid); load()
  }
  async function supprimer() {
    if (!confirm('Supprimer cette session et ses inscriptions ?')) return
    await supabase.from('sessions_formation').delete().eq('id', id); nav('/planning')
  }

  // Met à jour les qualifications des agents présents (recyclage ou obtention)
  async function validerQualifs() {
    const presents = parts.filter((p) => p.statut === 'PRESENT').map((p) => p.personnel_id)
    if (!s.referentiel_id || !presents.length) return
    const date = s.date_debut.slice(0, 10)
    const { data: existantes } = await supabase.from('qualifications').select('id, personnel_id')
      .eq('referentiel_id', s.referentiel_id).in('personnel_id', presents)
    const dejaIds = (existantes || []).map((q) => q.personnel_id)
    const nouveaux = presents.filter((p) => !dejaIds.includes(p))
    let errors = []
    if (existantes?.length) {
      const { error } = await supabase.from('qualifications').update({ date_dernier_recyclage: date }).in('id', existantes.map((q) => q.id))
      if (error) errors.push(error.message)
    }
    if (s.type === 'FI' && nouveaux.length) {
      const { error } = await supabase.from('qualifications').insert(nouveaux.map((pid) => ({ personnel_id: pid, referentiel_id: s.referentiel_id, date_obtention: date })))
      if (error) errors.push(error.message)
    }
    setMsg(errors.length ? { type: 'ko', text: errors.join(' ; ') } : {
      type: 'ok',
      text: `${existantes?.length || 0} recyclage(s) mis à jour` + (s.type === 'FI' ? `, ${nouveaux.length} qualification(s) créée(s).` : (nouveaux.length ? ` — ${nouveaux.length} présent(s) ne détenaient pas ${s.referentiels.code} (non modifiés).` : '.')),
    })
  }

  if (!s) return <p>Chargement…</p>
  const gerer = d.gererFormation
  const appel = gerer || (personnelId && s.formateur_id === personnelId)
  const dispo = agents.filter((a) => !parts.some((p) => p.personnel_id === a.id))
  const passee = new Date(s.date_debut) < new Date()

  return (
    <>
      <p><Link to="/planning">← Planning</Link></p>
      <div className="page-head">
        <h1>{s.titre}</h1>
        <div className="actions">
          {gerer && <button className="ghost" onClick={() => setEdit(!edit)}>Modifier</button>}
          {appel && <button className="ghost" onClick={() => exportCSV(`emargement-${s.date_debut.slice(0, 10)}.csv`,
            parts.map((p) => ({ Nom: p.personnel.nom, Prénom: p.personnel.prenom, Grade: p.personnel.grade ?? '', Statut: STATUTS_PART[p.statut], Signature: '' })))}>Feuille d'émargement</button>}
          {gerer && <button className="ghost danger" onClick={supprimer}>Supprimer</button>}
        </div>
      </div>
      {edit ? (
        <SessionForm refs={refs} initial={{ ...s, date_debut: toLocalInput(s.date_debut), date_fin: toLocalInput(s.date_fin) }}
          onSaved={() => { setEdit(false); load() }} onCancel={() => setEdit(false)} />
      ) : (
        <div className="card infos">
          <span><b>Type</b> {TYPES_SESSION[s.type]}</span>
          <span><b>Début</b> {fmtDateTime(s.date_debut)}</span>
          {s.date_fin && <span><b>Fin</b> {fmtDateTime(s.date_fin)}</span>}
          <span><b>Durée</b> {s.duree_heures} h</span>
          <span><b>Module FMPA</b> {s.fmpa_modules ? `${s.fmpa_modules.code} — ${s.fmpa_modules.libelle}` : '—'}</span>
          {s.referentiels && <span><b>Emploi recyclé</b> {s.referentiels.code}</span>}
          <span><b>Lieu</b> {s.lieu || '—'}</span>
          <span><b>Formateur</b> {s.formateur_p ? `${s.formateur_p.grade ?? ''} ${s.formateur_p.nom.toUpperCase()} ${s.formateur_p.prenom}` : '—'}</span>
          {s.formateur && <span><b>Intervenants</b> {s.formateur}</span>}
          {s.description && <p style={{ width: '100%' }}>{s.description}</p>}
        </div>
      )}

      <section className="card">
        <div className="page-head">
          <h2>Participants ({parts.length}{s.places_max ? ` / ${s.places_max}` : ''})</h2>
          {gerer && <div className="actions">
            <select value={ajoutId} onChange={(e) => setAjoutId(e.target.value)}>
              <option value="">— ajouter un agent —</option>
              {dispo.map((a) => <option key={a.id} value={a.id}>{a.nom.toUpperCase()} {a.prenom}</option>)}
            </select>
            <button disabled={!ajoutId} onClick={() => inscrire([ajoutId])}>Inscrire</button>
            <button className="ghost" disabled={!dispo.length} onClick={() => inscrire(dispo.map((a) => a.id))}>Inscrire tous les actifs</button>
          </div>}
        </div>
        {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
        {s.fmpa_modules && appel && <p className="muted">Les agents marqués « Présent » ont automatiquement le module {s.fmpa_modules.code} validé.</p>}
        <table>
          <thead><tr><th>Agent</th><th>Présence</th><th>Heures validées</th><th></th></tr></thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.personnel_id}>
                <td><Link to={`/personnel/${p.personnel_id}`}>{p.personnel.grade} {p.personnel.nom.toUpperCase()} {p.personnel.prenom}</Link></td>
                <td>
                  <div className="seg">
                    {Object.entries(STATUTS_PART).map(([k, v]) => (
                      <button key={k} disabled={!appel} className={p.statut === k ? `on st-${k}` : ''} onClick={() => setStatut(p.personnel_id, k)}>{v}</button>
                    ))}
                  </div>
                </td>
                <td><input type="number" step="0.5" min="0" className="small" placeholder={s.duree_heures} disabled={!appel}
                  defaultValue={p.heures_validees ?? ''} onBlur={(e) => setHeures(p.personnel_id, e.target.value)} /></td>
                <td>{gerer && <button className="link danger" onClick={() => retirer(p.personnel_id)}>Retirer</button>}</td>
              </tr>
            ))}
            {parts.length === 0 && <tr><td colSpan="4" className="muted">Aucun inscrit.</td></tr>}
          </tbody>
        </table>
        {gerer && passee && s.referentiel_id && (
          <div className="actions" style={{ marginTop: 12 }}>
            <button onClick={validerQualifs}>
              {s.type === 'FI' ? `Attribuer ${s.referentiels.code} aux présents` : `Valider le recyclage ${s.referentiels.code} des présents`}
            </button>
          </div>
        )}
      </section>
    </>
  )
}
