export const DOMAINES = { SAP: 'Secours à personne', INC: 'Incendie', SPE: 'Spécialités', AUTRE: 'Autre' }
export const TYPES_SESSION = { FMPA: 'FMPA', FI: 'Formation initiale', RECYCLAGE: 'Recyclage', MANOEUVRE: 'Manœuvre', AUTRE: 'Autre' }
export const STATUTS_PART = { INSCRIT: 'Inscrit', PRESENT: 'Présent', ABSENT: 'Absent', EXCUSE: 'Excusé' }
export const ETATS = {
  VALIDE: { label: 'À jour', cls: 'ok' },
  A_RECYCLER: { label: 'À recycler (< 60 j)', cls: 'warn' },
  EXPIRE: { label: 'Expiré', cls: 'ko' },
  SUSPENDU: { label: 'Suspendu', cls: 'muted' },
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—')
export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
export const nomComplet = (p) => (p ? `${p.grade ? p.grade + ' ' : ''}${p.nom?.toUpperCase()} ${p.prenom}` : '')

// Convertit une date ISO en valeur pour <input type="datetime-local">
export const toLocalInput = (d) => {
  if (!d) return ''
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 16)
}

export function exportCSV(filename, rows) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}
