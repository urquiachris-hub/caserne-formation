import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { DOMAINES } from '../lib'
import { useAuth } from '../auth'

const VIDE = { code: '', libelle: '', domaine: 'SAP', periodicite_mois: 12, heures_fc_annuelles: '', prerequis_id: '', ordre: 100, actif: true }

export default function Referentiels() {
  const { d } = useAuth()
  const [refs, setRefs] = useState([])
  const [form, setForm] = useState(null)
  const [err, setErr] = useState(null)

  const load = () => supabase.from('referentiels').select('*').order('ordre').then(({ data }) => setRefs(data || []))
  useEffect(() => { load() }, [])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function save(e) {
    e.preventDefault()
    const p = {
      ...form,
      periodicite_mois: form.periodicite_mois === '' ? null : Number(form.periodicite_mois),
      heures_fc_annuelles: form.heures_fc_annuelles === '' || form.heures_fc_annuelles == null ? null : Number(form.heures_fc_annuelles),
      prerequis_id: form.prerequis_id || null,
      ordre: Number(form.ordre) || 100,
    }
    const { error } = form.id
      ? await supabase.from('referentiels').update(p).eq('id', form.id)
      : await supabase.from('referentiels').insert(p)
    if (error) return setErr(error.message)
    setForm(null); setErr(null); load()
  }

  return (
    <>
      <div className="page-head">
        <h1>Référentiels</h1>
        {d.admin && <button onClick={() => setForm({ ...VIDE })}>+ Nouveau référentiel</button>}
      </div>
      <p className="muted">Périodicités et heures de formation continue à aligner sur le règlement de formation de votre SDIS.</p>
      {form && (
        <form className="card form" onSubmit={save}>
          <div className="row">
            <label>Code<input value={form.code} onChange={set('code')} required /></label>
            <label style={{ flex: 3 }}>Libellé<input value={form.libelle} onChange={set('libelle')} required /></label>
            <label>Domaine
              <select value={form.domaine} onChange={set('domaine')}>
                {Object.entries(DOMAINES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <div className="row">
            <label>Validité (mois, vide = permanent)<input type="number" min="0" value={form.periodicite_mois ?? ''} onChange={set('periodicite_mois')} /></label>
            <label>Heures FC / an<input type="number" step="0.5" min="0" value={form.heures_fc_annuelles ?? ''} onChange={set('heures_fc_annuelles')} /></label>
            <label>Prérequis
              <select value={form.prerequis_id ?? ''} onChange={set('prerequis_id')}>
                <option value="">—</option>
                {refs.filter((r) => r.id !== form.id).map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
              </select>
            </label>
            <label>Ordre d'affichage<input type="number" value={form.ordre} onChange={set('ordre')} /></label>
            <label className="check"><input type="checkbox" checked={form.actif} onChange={set('actif')} /> Actif</label>
          </div>
          {err && <div className="alert ko">{err}</div>}
          <div className="actions"><button>Enregistrer</button><button type="button" className="ghost" onClick={() => setForm(null)}>Annuler</button></div>
        </form>
      )}
      {Object.entries(DOMAINES).map(([k, lib]) => {
        const l = refs.filter((r) => r.domaine === k)
        if (!l.length) return null
        return (
          <section className="card" key={k}>
            <h2>{lib}</h2>
            <table>
              <thead><tr><th>Code</th><th>Libellé</th><th>Validité</th><th>FC / an</th><th>Prérequis</th><th></th></tr></thead>
              <tbody>
                {l.map((r) => (
                  <tr key={r.id} className={r.actif ? '' : 'inactive'}>
                    <td><b>{r.code}</b></td><td>{r.libelle}</td>
                    <td>{r.periodicite_mois ? `${r.periodicite_mois} mois` : 'Permanent'}</td>
                    <td>{r.heures_fc_annuelles ? `${r.heures_fc_annuelles} h` : '—'}</td>
                    <td>{refs.find((x) => x.id === r.prerequis_id)?.code || '—'}</td>
                    <td>{d.admin && <button className="link" onClick={() => setForm({ ...r })}>Modifier</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
    </>
  )
}
