import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' : fonctionne sur GitHub Pages quel que soit le nom du dépôt
export default defineConfig({ plugins: [react()], base: './' })
