import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { fmtDateTime } from '../lib'

const LIBELLES = {
  emplois: 'Emplois lus', agents_crees: 'Agents créés', agents_maj: 'Agents mis à jour', agents_desactives: 'Agents désactivés',
  acces_actifs: 'Accès actifs', acces_retires: 'Accès retirés', competences: 'Compétences', competences_retirees: 'Compétences retirées',
  modules_fmpa: 'Modules FMPA', pdf_copies: 'PDF copiés', pdf_inchanges: 'PDF inchangés', pdf_retires: 'PDF retirés', pdf_restants: 'PDF restant à copier',
}
const STATUTS = { ok: ['ok', 'Réussie'], partiel: ['warn', 'Avec remarques'], erreur: ['ko', 'Échec'], 'en cours': ['muted', 'En cours'] }

export default function Synchro() {
  const [journal, setJournal] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = () => supabase.from('synchro_journal').select('*').order('debut', { ascending: false }).limit(15)
    .then(({ data }) => setJournal(data || []))
  useEffect(() => { load() }, [])

  async function lancer() {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.functions.invoke('sync-drive', { body: {} })
    setBusy(false)
    if (error) setMsg({ type: 'ko', text: 'La synchronisation n\'a pas pu démarrer : ' + error.message })
    else setMsg({ type: data.statut === 'ok' ? 'ok' : data.statut === 'partiel' ? 'warn' : 'ko', text: data.statut === 'ok' ? 'Synchronisation terminée.' : data.statut === 'partiel' ? 'Synchronisation terminée avec des remarques (voir ci-dessous).' : 'La synchronisation a échoué (voir ci-dessous).' })
    load()
  }

  const dernier = journal[0]
  return (
    <>
      <div className="page-head">
        <h1>Synchronisation du Drive</h1>
        <button onClick={lancer} disabled={busy}>{busy ? 'Synchronisation en cours…' : 'Synchroniser maintenant'}</button>
      </div>
      <p className="muted">L'application se met à jour chaque nuit à partir du Drive « Application Ornano » : tableau « Ornano Formation – Données » (agents, accès, emplois, compétences, modules FMPA) et PDF des dossiers Secourisme, Incendie et Formation. Le bouton lance la mise à jour tout de suite.</p>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      {dernier && (
        <section className="card">
          <h2>Dernière synchronisation — {fmtDateTime(dernier.debut)} <span className={`badge ${STATUTS[dernier.statut]?.[0]}`}>{STATUTS[dernier.statut]?.[1]}</span></h2>
          {dernier.resume && (
            <div className="infos">
              {Object.entries(dernier.resume).filter(([k]) => LIBELLES[k]).map(([k, v]) => <span key={k}><b>{LIBELLES[k]}</b> {v}</span>)}
            </div>
          )}
          {dernier.erreurs?.length > 0 && (
            <>
              <h2 style={{ marginTop: 16 }}>À corriger dans le Drive</h2>
              <ul>{dernier.erreurs.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </>
          )}
        </section>
      )}

      <section className="card">
        <h2>Historique</h2>
        <table>
          <thead><tr><th>Date</th><th>Origine</th><th>Résultat</th><th>Remarques</th></tr></thead>
          <tbody>
            {journal.map((j) => (
              <tr key={j.id}>
                <td className="nowrap">{fmtDateTime(j.debut)}</td>
                <td>{j.origine}</td>
                <td><span className={`badge ${STATUTS[j.statut]?.[0]}`}>{STATUTS[j.statut]?.[1]}</span></td>
                <td>{j.erreurs?.length || 0}</td>
              </tr>
            ))}
            {journal.length === 0 && <tr><td colSpan="4" className="muted">Aucune synchronisation pour le moment.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  )
}
