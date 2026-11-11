import { createContext, useContext } from 'react'

export const ROLES = {
  admin: 'Administrateur',
  encadrement: 'Encadrement',
  resp_formation: 'Responsable formation',
  formateur: 'Formateur',
  agent: 'Agent',
}

export function droits(role) {
  return {
    admin: role === 'admin',
    lireTout: ['admin', 'encadrement', 'resp_formation'].includes(role),
    gererFormation: ['admin', 'resp_formation'].includes(role),
  }
}

export const AuthCtx = createContext({ role: null, personnelId: null, d: droits(null) })
export const useAuth = () => useContext(AuthCtx)
