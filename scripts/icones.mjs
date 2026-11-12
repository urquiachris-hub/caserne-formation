// Génère les icônes PNG (écran d'accueil iPhone / Android) à partir de public/icon.svg
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync('public/icon.svg', 'utf8')
for (const [taille, nom] of [[180, 'apple-touch-icon.png'], [192, 'icon-192.png'], [512, 'icon-512.png']]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: taille }, font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' } }).render().asPng()
  writeFileSync(`public/${nom}`, png)
  console.log(`icône ${nom} (${taille}px) générée`)
}
