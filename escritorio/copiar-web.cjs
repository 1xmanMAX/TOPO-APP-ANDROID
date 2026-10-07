// Copia la compilación de la app web (packages/app/dist) dentro del escritorio.
const fs = require('node:fs')
const path = require('node:path')

const origen = path.join(__dirname, '..', 'packages', 'app', 'dist')
const destino = path.join(__dirname, 'web')

if (!fs.existsSync(path.join(origen, 'index.html'))) {
  console.error('Falta la compilación web: npm run build --workspace packages/app')
  process.exit(1)
}
fs.rmSync(destino, { recursive: true, force: true })
fs.cpSync(origen, destino, { recursive: true })
console.log(`Web copiada a ${destino}`)
