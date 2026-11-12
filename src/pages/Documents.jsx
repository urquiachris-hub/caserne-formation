import { useEffect, useState } from 'react'
import { NavLink, useParams, Navigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { CATEGORIES_DOC, fmtDate } from '../lib'

const VIDE = { titre: '', theme: '', description: '', version: '', date_maj: '', ordre: 100, actif: true, visibilite: 'tous' }
const VISIBILITES = { tous: 'Tous les agents', chefs: "Chefs d'agrès", formateurs: 'Formateurs' }

function nomFichier(nom) {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_')
}

export default function Documents() {
  const { cat } = useParams()
  const { d } = useAuth()
  const [docs, setDocs] = useState([])
  const [q, setQ] = useState('')
  const [form, setForm] = useState(null)
  const [fichier, setFichier] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = () =>
    supabase.from('documents').select('*').eq('categorie', cat).order('theme').order('ordre').order('titre')
      .then(({ data }) => setDocs(data || []))
  useEffect(() => { if (CATEGORIES_DOC[cat]) { load(); setForm(null); setQ('') } }, [cat])

  if (!CATEGORIES_DOC[cat]) return <Navigate to="/referentiels/SUAP" />

  async function ouvrir(doc) {
    const { data, error } = await supabase.storage.from('referentiels').createSignedUrl(doc.fichier_path, 3600)
    if (error) return setMsg({ type: 'ko', text: "Impossible d'ouvrir le fichier : " + error.message })
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    let fichier_path = form.fichier_path ?? null
    let fichier_nom = form.fichier_nom ?? null
    if (fichier) {
      const chemin = `${cat}/${Date.now()}_${nomFichier(fichier.name)}`
      const { error } = await supabase.storage.from('referentiels').upload(chemin, fichier, { contentType: 'application/pdf' })
      if (error) { setBusy(false); return setMsg({ type: 'ko', text: 'Envoi du PDF impossible : ' + error.message }) }
      if (form.fichier_path) await supabase.storage.from('referentiels').remove([form.fichier_path])
      fichier_path = chemin; fichier_nom = fichier.name
    }
    if (!fichier_path) { setBusy(false); return setMsg({ type: 'ko', text: 'Joignez un fichier PDF.' }) }
    const p = {
      categorie: cat, titre: form.titre, theme: form.theme || null, description: form.description || null,
      version: form.version || null, date_maj: form.date_maj || null, ordre: Number(form.ordre) || 100, visibilite: form.visibilite || 'tous',
      actif: form.actif, fichier_path, fichier_nom,
    }
    const { error } = form.id
      ? await supabase.from('documents').update(p).eq('id', form.id)
      : await supabase.from('documents').insert(p)
    setBusy(false)
    if (error) return setMsg({ type: 'ko', text: error.message })
    setForm(null); setFichier(null); setMsg({ type: 'ok', text: 'Référentiel enregistré.' }); load()
  }

  async function supprimer(doc) {
    if (!confirm(`Supprimer « ${doc.titre} » et son fichier ?`)) return
    if (doc.fichier_path) await supabase.storage.from('referentiels').remove([doc.fichier_path])
    await supabase.from('documents').delete().eq('id', doc.id); load()
  }

  const filtre = docs.filter((x) => `${x.titre} ${x.theme ?? ''} ${x.description ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  const parTheme = {}
  for (const x of filtre) (parTheme[x.theme || 'Général'] ||= []).push(x)
  const themes = [...new Set(docs.map((x) => x.theme).filter(Boolean))]

  return (
    <>
      <div className="page-head">
        <h1>Référentiels</h1>
        {d.gererFormation && !form && <button className="ghost" onClick={() => { setForm({ ...VIDE }); setFichier(null) }}>+ Ajouter hors Drive</button>}
      </div>
      <div className="tabs big">
        {Object.entries(CATEGORIES_DOC).map(([k, v]) => <NavLink key={k} to={`/referentiels/${k}`} className="tab">{v}</NavLink>)}
      </div>

      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      {d.gererFormation && <p className="muted">Les référentiels se déposent dans le Drive « Application Ornano » (voir le LISEZ-MOI) : l'application les récupère chaque nuit ou via « Synchronisation Drive ».</p>}

      {form && (
        <form className="card form" onSubmit={save}>
          <h2>{form.id ? 'Modifier' : 'Nouveau référentiel'} — {CATEGORIES_DOC[cat]}</h2>
          <div className="row">
            <label style={{ flex: 3 }}>Titre<input value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} required /></label>
            <label>Thème
              <input list="themes" value={form.theme ?? ''} onChange={(e) => setForm({ ...form, theme: e.target.value })} placeholder="ex. Bilans, ARI…" />
              <datalist id="themes">{themes.map((t) => <option key={t} value={t} />)}</datalist>
            </label>
          </div>
          <div className="row">
            <label>Version<input value={form.version ?? ''} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="Édition 2026" /></label>
            <label>Date de mise à jour<input type="date" value={form.date_maj ?? ''} onChange={(e) => setForm({ ...form, date_maj: e.target.value })} /></label>
            <label>Visible par
              <select value={form.visibilite ?? 'tous'} onChange={(e) => setForm({ ...form, visibilite: e.target.value })}>
                {Object.entries(VISIBILITES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Ordre<input type="number" value={form.ordre} onChange={(e) => setForm({ ...form, ordre: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })} /> Visible</label>
          </div>
          <label>Description<textarea rows="2" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Fichier PDF {form.fichier_nom && <span className="muted">(actuel : {form.fichier_nom} — laisser vide pour le conserver)</span>}
            <input type="file" accept="application/pdf" onChange={(e) => setFichier(e.target.files[0] || null)} />
          </label>
          <div className="actions">
            <button disabled={busy}>{busy ? 'Envoi…' : 'Enregistrer'}</button>
            <button type="button" className="ghost" onClick={() => setForm(null)}>Annuler</button>
          </div>
        </form>
      )}

      <div className="filters">
        <input placeholder={`Rechercher dans ${CATEGORIES_DOC[cat]}…`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {filtre.length === 0 && <p className="muted">Aucun référentiel {q ? 'trouvé' : 'pour le moment'}.</p>}
      {Object.entries(parTheme).map(([theme, liste]) => (
        <section className="card" key={theme}>
          <h2>{theme}</h2>
          <div className="doc-list">
            {liste.map((x) => (
              <div key={x.id} className={`doc ${x.actif ? '' : 'inactive'}`}>
                <button className="doc-open" onClick={() => ouvrir(x)} title="Ouvrir le PDF">
                  <span className="doc-icon">📄</span>
                  <span>
                    <b>{x.titre}</b>
                    <small className="muted">{[x.version, x.date_maj && `MAJ ${fmtDate(x.date_maj)}`].filter(Boolean).join(' · ')}
                      {x.visibilite !== 'tous' && <span className="badge" style={{ marginLeft: 6 }}>{VISIBILITES[x.visibilite]}</span>}</small>
                    {x.description && <small>{x.description}</small>}
                  </span>
                </button>
                {d.gererFormation && !x.drive_file_id && (
                  <span className="nowrap">
                    <button className="link" onClick={() => { setForm({ ...x }); setFichier(null); window.scrollTo(0, 0) }}>Modifier</button>
                    <button className="link danger" onClick={() => supprimer(x)}>Suppr.</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
