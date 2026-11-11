import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { DOMAINES_FMPA } from '../lib'
import { useAnnees } from './MesFMPA'

const VIDE = { code: '', libelle: '', domaine: 'SUAP', duree_heures: '', description: '', tous_agents: false, ordre: 100, actif: true, emplois: [] }

export default function ModulesFMPA() {
  const annees = useAnnees()
  const [annee, setAnnee] = useState(new Date().getFullYear())
  const [modules, setModules] = useState([])
  const [emplois, setEmplois] = useState([])
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState(null)

  async function load() {
    const [m, e] = await Promise.all([
      supabase.from('fmpa_modules').select('*, fmpa_module_emplois(referentiel_id)').eq('annee', annee).order('domaine').order('ordre').order('code'),
      supabase.from('referentiels').select('id, code, libelle').eq('actif', true).order('ordre'),
    ])
    setModules(m.data || []); setEmplois(e.data || [])
  }
  useEffect(() => { load(); setForm(null) }, [annee])

  async function save(e) {
    e.preventDefault()
    setMsg(null)
    const p = {
      annee, code: form.code.trim(), libelle: form.libelle, domaine: form.domaine,
      duree_heures: form.duree_heures === '' || form.duree_heures == null ? null : Number(form.duree_heures),
      description: form.description || null, tous_agents: form.tous_agents, ordre: Number(form.ordre) || 100, actif: form.actif,
    }
    const { data, error } = form.id
      ? await supabase.from('fmpa_modules').update(p).eq('id', form.id).select().single()
      : await supabase.from('fmpa_modules').insert(p).select().single()
    if (error) return setMsg({ type: 'ko', text: error.code === '23505' ? `Le code ${p.code} existe déjà pour ${annee}.` : error.message })
    await supabase.from('fmpa_module_emplois').delete().eq('module_id', data.id)
    if (!form.tous_agents && form.emplois.length)
      await supabase.from('fmpa_module_emplois').insert(form.emplois.map((rid) => ({ module_id: data.id, referentiel_id: rid })))
    setForm(null); setMsg({ type: 'ok', text: `Module ${p.code} enregistré.` }); load()
  }

  async function supprimer(m) {
    if (!confirm(`Supprimer le module ${m.code} ? Les validations associées seront aussi supprimées.`)) return
    await supabase.from('fmpa_modules').delete().eq('id', m.id); load()
  }

  async function copierAnnee() {
    const source = annee - 1
    const { data: src } = await supabase.from('fmpa_modules').select('*, fmpa_module_emplois(referentiel_id)').eq('annee', source)
    if (!src?.length) return setMsg({ type: 'warn', text: `Aucun module en ${source} à copier.` })
    for (const m of src) {
      const { id, fmpa_module_emplois, ...rest } = m
      const { data } = await supabase.from('fmpa_modules').insert({ ...rest, annee }).select().single()
      if (data && fmpa_module_emplois.length)
        await supabase.from('fmpa_module_emplois').insert(fmpa_module_emplois.map((x) => ({ module_id: data.id, referentiel_id: x.referentiel_id })))
    }
    setMsg({ type: 'ok', text: `${src.length} module(s) copié(s) depuis ${source}.` }); load()
  }

  const toggleEmploi = (rid) =>
    setForm({ ...form, emplois: form.emplois.includes(rid) ? form.emplois.filter((x) => x !== rid) : [...form.emplois, rid] })

  return (
    <>
      <div className="page-head">
        <h1>Modules FMPA</h1>
        <div className="actions">
          <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} style={{ width: 'auto' }}>
            {[...new Set([...annees, new Date().getFullYear() + 1])].sort((a, b) => b - a).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {!form && <button onClick={() => setForm({ ...VIDE })}>+ Nouveau module</button>}
          {!form && modules.length === 0 && <button className="ghost" onClick={copierAnnee}>Copier les modules de {annee - 1}</button>}
        </div>
      </div>
      <p className="muted">Un module est attendu pour un agent s'il détient l'un des emplois cochés (ou pour tous les agents si « Tous les agents » est coché). Une session du planning liée au module le valide automatiquement pour les présents.</p>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      {form && (
        <form className="card form" onSubmit={save}>
          <h2>{form.id ? `Modifier ${form.code}` : `Nouveau module ${annee}`}</h2>
          <div className="row">
            <label>Code<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder="SUAP-01" /></label>
            <label style={{ flex: 3 }}>Intitulé<input value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} required placeholder="Arrêt cardio-respiratoire" /></label>
            <label>Domaine
              <select value={form.domaine} onChange={(e) => setForm({ ...form, domaine: e.target.value })}>
                {Object.entries(DOMAINES_FMPA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <div className="row">
            <label>Durée (h)<input type="number" step="0.5" min="0" value={form.duree_heures ?? ''} onChange={(e) => setForm({ ...form, duree_heures: e.target.value })} /></label>
            <label>Ordre<input type="number" value={form.ordre} onChange={(e) => setForm({ ...form, ordre: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={form.tous_agents} onChange={(e) => setForm({ ...form, tous_agents: e.target.checked })} /> Tous les agents</label>
            <label className="check"><input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })} /> Actif</label>
          </div>
          <label>Description / objectifs<textarea rows="2" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          {!form.tous_agents && (
            <fieldset className="emplois">
              <legend>Obligatoire pour les agents détenant :</legend>
              {emplois.map((r) => (
                <label key={r.id} className="check"><input type="checkbox" checked={form.emplois.includes(r.id)} onChange={() => toggleEmploi(r.id)} /> {r.code}</label>
              ))}
            </fieldset>
          )}
          <div className="actions"><button>Enregistrer</button><button type="button" className="ghost" onClick={() => setForm(null)}>Annuler</button></div>
        </form>
      )}

      {Object.entries(DOMAINES_FMPA).map(([k, lib]) => {
        const l = modules.filter((m) => m.domaine === k)
        if (!l.length) return null
        return (
          <section className="card" key={k}>
            <h2>{lib}</h2>
            <table>
              <thead><tr><th>Code</th><th>Intitulé</th><th>Durée</th><th>Obligatoire pour</th><th></th></tr></thead>
              <tbody>
                {l.map((m) => (
                  <tr key={m.id} className={m.actif ? '' : 'inactive'}>
                    <td><b>{m.code}</b></td>
                    <td>{m.libelle}</td>
                    <td>{m.duree_heures ? `${m.duree_heures} h` : '—'}</td>
                    <td>{m.tous_agents ? 'Tous les agents' : m.fmpa_module_emplois.map((x) => emplois.find((r) => r.id === x.referentiel_id)?.code).filter(Boolean).join(', ') || <span className="danger">aucun emploi</span>}</td>
                    <td className="nowrap">
                      <button className="link" onClick={() => setForm({ ...m, emplois: m.fmpa_module_emplois.map((x) => x.referentiel_id) })}>Modifier</button>
                      <button className="link danger" onClick={() => supprimer(m)}>Suppr.</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
      {modules.length === 0 && !form && <p className="muted">Aucun module pour {annee}.</p>}
    </>
  )
}
