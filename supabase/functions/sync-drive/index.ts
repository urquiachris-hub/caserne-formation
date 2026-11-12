// =====================================================================
// Synchronisation Drive « Application Ornano » → base Supabase
//   - tableau « Ornano Formation – Données » : agents, accès, emplois,
//     compétences, modules FMPA
//   - dossiers 1-Secourisme / 2-Incendie / 3-Formation : PDF copiés dans
//     le stockage privé, visibilité selon le sous-dossier
// Appel : tâche nocturne (en-tête x-sync-secret) ou bouton de l'appli
// (administrateur ou responsable formation connecté).
// Secret requis : GOOGLE_SA_KEY (clé JSON du compte de service, lecture seule)
// =====================================================================
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

const SHEET_ID = Deno.env.get('GOOGLE_SHEET_ID') ?? '1RIbzQUzgtz4LlM9XlBKml7fpR2FB2xWCeBntRZ3tfHQ'
const FOLDER_ID = Deno.env.get('GOOGLE_FOLDER_ID') ?? '1F9kO4nrQLRfaaif0_5THPoVpEPf_aGKX'
const MAX_PDF_PAR_PASSAGE = 25
const BUDGET_MS = 110_000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ---------------------------------------------------------------------
// Utilitaires de lecture (exportés pour les tests)
// ---------------------------------------------------------------------
export const RE_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/
export const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())
export const oui = (v: unknown) => /^(oui|o|yes|true|vrai|x)$/i.test(txt(v))
export const estExemple = (email: string) => email.endsWith('@exemple.fr')

// « 15/03/2018 », « 2018-03-15 » ou numéro de série Sheets → « 2018-03-15 »
export function dateIso(v: unknown): string | null {
  const s = txt(v)
  if (!s) return null
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  if (/^\d+(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  return null
}

export function categorieDossier(nom: string): string | null {
  const n = nom.toLowerCase()
  if (n.includes('archive')) return null
  if (n.includes('secour') || n.includes('suap')) return 'SUAP'
  if (n.includes('incendie')) return 'INC'
  if (n.includes('formation')) return 'FDC'
  return null
}

export function visibiliteDossier(nom: string): string | null {
  const n = nom.toLowerCase()
  if (n.includes('formateur')) return 'formateurs'
  if (n.includes('chef')) return 'chefs'
  if (n.includes('tous')) return 'tous'
  return null
}

// « GDO - Ventilation opérationnelle - 2017.pdf » → thème GDO, titre, version 2017
export function analyserNom(nomFichier: string) {
  const base = nomFichier.replace(/\.pdf$/i, '').trim()
  const parts = base.split(/\s+[-–]\s+/).map((p) => p.trim()).filter(Boolean)
  let version: string | null = null
  if (parts.length >= 2 && /^\d{4}$/.test(parts[parts.length - 1])) version = parts.pop()!
  if (parts.length >= 2) return { theme: parts[0], titre: parts.slice(1).join(' - '), version }
  return { theme: null, titre: parts[0] ?? base, version }
}

// ---------------------------------------------------------------------
// Accès Google (compte de service, lecture seule)
// ---------------------------------------------------------------------
const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function jetonGoogle(): Promise<string> {
  const brut = Deno.env.get('GOOGLE_SA_KEY')
  if (!brut) throw new Error("Secret GOOGLE_SA_KEY absent : collez la clé JSON du compte de service dans Supabase > Edge Functions > Secrets.")
  const cle = JSON.parse(brut)
  const maintenant = Math.floor(Date.now() / 1000)
  const entete = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const contenu = b64url(JSON.stringify({
    iss: cle.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: maintenant,
    exp: maintenant + 3600,
  }))
  const pem = cle.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const k = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', k, new TextEncoder().encode(`${entete}.${contenu}`))
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${entete}.${contenu}.${b64url(signature)}`,
    }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`Connexion Google refusée : ${j.error_description ?? j.error ?? r.status}`)
  return j.access_token
}

async function google(jeton: string, url: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${jeton}` } })
  if (!r.ok) throw new Error(`Google ${r.status} : ${(await r.text()).slice(0, 200)}`)
  return r
}

async function lireTableau(jeton: string) {
  const onglets = ['Agents!A2:I', 'Emplois!A2:E', "'Compétences'!A2:D", 'FMPA!A2:G']
  const q = onglets.map((o) => `ranges=${encodeURIComponent(o)}`).join('&')
  const r = await google(jeton,
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?${q}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`)
  const j = await r.json()
  const [agents, emplois, competences, fmpa]: unknown[][][] = j.valueRanges.map((v: { values?: unknown[][] }) => v.values ?? [])
  return { agents, emplois, competences, fmpa }
}

type FichierDrive = { id: string; name: string; mimeType: string; modifiedTime: string }

async function listerDossier(jeton: string, parent: string): Promise<FichierDrive[]> {
  const out: FichierDrive[] = []
  let page = ''
  do {
    const q = encodeURIComponent(`'${parent}' in parents and trashed = false`)
    const r = await google(jeton,
      `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1000&fields=nextPageToken,files(id,name,mimeType,modifiedTime)&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? `&pageToken=${page}` : ''}`)
    const j = await r.json()
    out.push(...j.files)
    page = j.nextPageToken ?? ''
  } while (page)
  return out
}

const DOSSIER = 'application/vnd.google-apps.folder'

// Parcourt Rubrique / Visibilité / (sous-dossiers = thèmes) / fichiers.pdf
async function inventaireDrive(jeton: string) {
  const pdfs: (FichierDrive & { categorie: string; visibilite: string; themeDossier: string | null })[] = []
  for (const rubrique of (await listerDossier(jeton, FOLDER_ID)).filter((f) => f.mimeType === DOSSIER)) {
    const categorie = categorieDossier(rubrique.name)
    if (!categorie) continue
    for (const niveau of (await listerDossier(jeton, rubrique.id)).filter((f) => f.mimeType === DOSSIER)) {
      const visibilite = visibiliteDossier(niveau.name)
      if (!visibilite) continue
      const pile: { id: string; theme: string | null }[] = [{ id: niveau.id, theme: null }]
      while (pile.length) {
        const { id, theme } = pile.pop()!
        for (const f of await listerDossier(jeton, id)) {
          if (f.mimeType === DOSSIER) pile.push({ id: f.id, theme: theme ?? f.name })
          else if (f.mimeType === 'application/pdf') pdfs.push({ ...f, categorie, visibilite, themeDossier: theme })
        }
      }
    }
  }
  return pdfs
}

// ---------------------------------------------------------------------
// Synchronisation
// ---------------------------------------------------------------------
async function synchroniser(db: SupabaseClient, origine: string) {
  const t0 = Date.now()
  const erreurs: string[] = []
  const resume: Record<string, number | string> = {}
  const { data: journal } = await db.from('synchro_journal').insert({ origine }).select('id').single()

  try {
    const jeton = await jetonGoogle()
    const t = await lireTableau(jeton)

    // ---- Emplois ----
    const emplois = t.emplois
      .map((r) => ({ code: txt(r[0]).toUpperCase(), libelle: txt(r[1]), domaine: txt(r[2]).toUpperCase(), periodicite_mois: txt(r[3]) ? Number(r[3]) : null, heures_fc_annuelles: txt(r[4]) ? Number(r[4]) : null }))
      .filter((e) => e.code && e.libelle)
      .map((e) => ({ ...e, domaine: ['SAP', 'INC', 'SPE', 'AUTRE'].includes(e.domaine) ? e.domaine : 'AUTRE', actif: true }))
    if (emplois.length) {
      const { error } = await db.from('referentiels').upsert(emplois, { onConflict: 'code' })
      if (error) erreurs.push(`Emplois : ${error.message}`)
    }
    resume.emplois = emplois.length

    // ---- Agents ----
    const { data: existants } = await db.from('personnel').select('id, email, source')
    const parEmail = new Map((existants ?? []).filter((p) => p.email).map((p) => [p.email.toLowerCase(), p]))
    const vus = new Set<string>()
    let crees = 0, maj = 0
    const actifsDrive: { email: string; profil: string }[] = []
    for (const [i, r] of t.agents.entries()) {
      const email = txt(r[4]).toLowerCase()
      if (!email && !txt(r[0])) continue
      if (estExemple(email)) continue
      if (!RE_EMAIL.test(email)) { erreurs.push(`Agents ligne ${i + 2} : email invalide « ${txt(r[4])} »`); continue }
      if (vus.has(email)) { erreurs.push(`Agents ligne ${i + 2} : doublon ${email}`); continue }
      vus.add(email)
      const statut = txt(r[3]).toUpperCase()
      const fiche = {
        nom: txt(r[0]).toUpperCase(), prenom: txt(r[1]), grade: txt(r[2]) || null,
        statut: ['SPV', 'SPP', 'PATS', 'JSP'].includes(statut) ? statut : 'SPV',
        email, chef_agres: oui(r[6]), formateur: oui(r[7]), actif: txt(r[8]) === '' ? true : oui(r[8]), source: 'drive',
      }
      if (!fiche.nom || !fiche.prenom) { erreurs.push(`Agents ligne ${i + 2} : nom ou prénom manquant`); continue }
      const ex = parEmail.get(email)
      const { error } = ex
        ? await db.from('personnel').update(fiche).eq('id', ex.id)
        : await db.from('personnel').insert(fiche)
      if (error) { erreurs.push(`Agents ligne ${i + 2} : ${error.message}`); continue }
      ex ? maj++ : crees++
      if (fiche.actif) actifsDrive.push({ email, profil: txt(r[5]).toLowerCase() || 'agent' })
    }
    // Agents venant du Drive et retirés du tableau : désactivés (historique conservé)
    const retires = (existants ?? []).filter((p) => p.source === 'drive' && p.email && !vus.has(p.email.toLowerCase()))
    if (retires.length && t.agents.length) await db.from('personnel').update({ actif: false }).in('id', retires.map((p) => p.id))
    resume.agents_crees = crees; resume.agents_maj = maj; resume.agents_desactives = retires.length

    // ---- Accès (le profil admin n'est jamais donné ni retiré par le Drive) ----
    const { data: acces } = await db.from('acces_autorises').select('email, role, source')
    const accesParEmail = new Map((acces ?? []).map((a) => [a.email, a]))
    const PROFILS = ['agent', 'formateur', 'resp_formation', 'encadrement']
    const aGarder = new Set<string>()
    for (const a of actifsDrive) {
      aGarder.add(a.email)
      if (accesParEmail.get(a.email)?.role === 'admin') continue
      const role = PROFILS.includes(a.profil) ? a.profil : 'agent'
      const { error } = await db.from('acces_autorises').upsert({ email: a.email, role, source: 'drive' }, { onConflict: 'email' })
      if (error) erreurs.push(`Accès ${a.email} : ${error.message}`)
    }
    const accesRetires = (acces ?? []).filter((a) => a.source === 'drive' && a.role !== 'admin' && !aGarder.has(a.email))
    if (accesRetires.length && t.agents.length) await db.from('acces_autorises').delete().in('email', accesRetires.map((a) => a.email))
    resume.acces_actifs = aGarder.size; resume.acces_retires = accesRetires.length

    // ---- Compétences ----
    const [{ data: pers }, { data: refs }, { data: quals }] = await Promise.all([
      db.from('personnel').select('id, email, source'),
      db.from('referentiels').select('id, code'),
      db.from('qualifications').select('id, personnel_id, referentiel_id, date_dernier_recyclage'),
    ])
    const idAgent = new Map((pers ?? []).filter((p) => p.email).map((p) => [p.email.toLowerCase(), p.id]))
    const idEmploi = new Map((refs ?? []).map((r) => [r.code.toUpperCase(), r.id]))
    const qualExist = new Map((quals ?? []).map((q) => [`${q.personnel_id}|${q.referentiel_id}`, q]))
    const qualVues = new Set<string>()
    let nbQual = 0
    for (const [i, r] of t.competences.entries()) {
      const email = txt(r[0]).toLowerCase()
      if (!email || estExemple(email)) continue
      const pid = idAgent.get(email), rid = idEmploi.get(txt(r[1]).toUpperCase())
      if (!pid) { erreurs.push(`Compétences ligne ${i + 2} : agent inconnu ${email}`); continue }
      if (!rid) { erreurs.push(`Compétences ligne ${i + 2} : emploi inconnu « ${txt(r[1])} »`); continue }
      const obtention = dateIso(r[2])
      if (!obtention) { erreurs.push(`Compétences ligne ${i + 2} : date d'obtention manquante ou invalide`); continue }
      const cle = `${pid}|${rid}`
      qualVues.add(cle)
      let recyclage = dateIso(r[3])
      const ex = qualExist.get(cle)
      // une date de recyclage plus récente saisie dans l'appli (appel) est conservée
      if (ex?.date_dernier_recyclage && (!recyclage || ex.date_dernier_recyclage > recyclage)) recyclage = ex.date_dernier_recyclage
      const { error } = await db.from('qualifications').upsert(
        { personnel_id: pid, referentiel_id: rid, date_obtention: obtention, date_dernier_recyclage: recyclage },
        { onConflict: 'personnel_id,referentiel_id' })
      if (error) erreurs.push(`Compétences ligne ${i + 2} : ${error.message}`); else nbQual++
    }
    const agentsDrive = new Set((pers ?? []).filter((p) => p.source === 'drive').map((p) => p.id))
    const qualRetirees = (quals ?? []).filter((q) => agentsDrive.has(q.personnel_id) && !qualVues.has(`${q.personnel_id}|${q.referentiel_id}`))
    if (qualRetirees.length && t.competences.length) await db.from('qualifications').delete().in('id', qualRetirees.map((q) => q.id))
    resume.competences = nbQual; resume.competences_retirees = qualRetirees.length

    // ---- Modules FMPA ----
    let nbMod = 0
    for (const [i, r] of t.fmpa.entries()) {
      const annee = Number(txt(r[0])), code = txt(r[1]).toUpperCase()
      if (!annee || !code || code.startsWith('EXEMPLE')) continue
      const domaine = txt(r[3]).toUpperCase()
      const obligatoire = txt(r[5])
      const mod = {
        annee, code, libelle: txt(r[2]) || code,
        domaine: ['SUAP', 'INC', 'TOP', 'AUTRE'].includes(domaine) ? domaine : 'AUTRE',
        duree_heures: txt(r[4]) ? Number(r[4]) : null,
        tous_agents: /^tous$/i.test(obligatoire),
        actif: txt(r[6]) === '' ? true : oui(r[6]),
      }
      const { data: m, error } = await db.from('fmpa_modules').upsert(mod, { onConflict: 'annee,code' }).select('id').single()
      if (error) { erreurs.push(`FMPA ligne ${i + 2} : ${error.message}`); continue }
      await db.from('fmpa_module_emplois').delete().eq('module_id', m.id)
      if (!mod.tous_agents) {
        const codes = obligatoire.split(/[,;]/).map((c) => c.trim().toUpperCase()).filter(Boolean)
        const inconnus = codes.filter((c) => !idEmploi.has(c))
        if (inconnus.length) erreurs.push(`FMPA ${code} : emploi(s) inconnu(s) ${inconnus.join(', ')}`)
        const liens = codes.filter((c) => idEmploi.has(c)).map((c) => ({ module_id: m.id, referentiel_id: idEmploi.get(c) }))
        if (liens.length) await db.from('fmpa_module_emplois').insert(liens)
      }
      nbMod++
    }
    resume.modules_fmpa = nbMod

    // ---- Documents PDF ----
    const pdfs = await inventaireDrive(jeton)
    const { data: docs } = await db.from('documents').select('id, drive_file_id, drive_modified, fichier_path').not('drive_file_id', 'is', null)
    const docParFichier = new Map((docs ?? []).map((d) => [d.drive_file_id, d]))
    let copies = 0, inchanges = 0, restants = 0
    for (const f of pdfs) {
      const ex = docParFichier.get(f.id)
      const nom = analyserNom(f.name)
      const fiche = {
        categorie: f.categorie, visibilite: f.visibilite,
        theme: f.themeDossier ?? nom.theme, titre: nom.titre, version: nom.version,
        fichier_nom: f.name, drive_file_id: f.id, drive_modified: f.modifiedTime, actif: true,
      }
      const aJour = ex && ex.drive_modified && new Date(ex.drive_modified).getTime() === new Date(f.modifiedTime).getTime()
      if (aJour) {
        // fichier identique : on met seulement à jour le classement (déplacement de dossier, renommage)
        await db.from('documents').update(fiche).eq('id', ex.id)
        inchanges++
        continue
      }
      if (copies >= MAX_PDF_PAR_PASSAGE || Date.now() - t0 > BUDGET_MS) { restants++; continue }
      try {
        const contenu = await (await google(jeton, `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`)).arrayBuffer()
        const chemin = `drive/${f.id}.pdf`
        const { error: e1 } = await db.storage.from('referentiels').upload(chemin, contenu, { contentType: 'application/pdf', upsert: true })
        if (e1) throw e1
        const { error: e2 } = ex
          ? await db.from('documents').update({ ...fiche, fichier_path: chemin }).eq('id', ex.id)
          : await db.from('documents').insert({ ...fiche, fichier_path: chemin })
        if (e2) throw e2
        copies++
      } catch (e) {
        erreurs.push(`PDF « ${f.name} » : ${(e as Error).message}`)
      }
    }
    // PDF supprimés du Drive ou rangés dans 0-Archives : retirés de l'appli
    const presents = new Set(pdfs.map((f) => f.id))
    const disparus = (docs ?? []).filter((d) => !presents.has(d.drive_file_id))
    if (disparus.length) {
      await db.storage.from('referentiels').remove(disparus.map((d) => d.fichier_path).filter(Boolean))
      await db.from('documents').delete().in('id', disparus.map((d) => d.id))
    }
    resume.pdf_copies = copies; resume.pdf_inchanges = inchanges; resume.pdf_retires = disparus.length; resume.pdf_restants = restants
  } catch (e) {
    erreurs.unshift((e as Error).message)
    resume.echec = 'oui'
  }

  const statut = resume.echec ? 'erreur' : (erreurs.length || Number(resume.pdf_restants) > 0) ? 'partiel' : 'ok'
  if (journal) await db.from('synchro_journal').update({ fin: new Date().toISOString(), statut, resume, erreurs }).eq('id', journal.id)
  return { statut, resume, erreurs }
}

// ---------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------
if (!Deno.env.get('SYNC_TEST')) Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  let origine = ''
  const secret = req.headers.get('x-sync-secret')
  if (secret) {
    const { data } = await db.rpc('sync_secret_valide', { p: secret })
    if (data === true) origine = 'nuit'
  } else {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data } = await db.auth.getUser(jwt)
    const email = data?.user?.email?.toLowerCase()
    if (email) {
      const { data: a } = await db.from('acces_autorises').select('role').eq('email', email).maybeSingle()
      if (a && ['admin', 'resp_formation'].includes(a.role)) origine = `manuel (${email})`
    }
  }
  if (!origine) return json({ erreur: 'Non autorisé' }, 401)

  const r = await synchroniser(db, origine)
  return json(r)
})
