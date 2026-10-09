import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

/**
 * Corre todos los guiones de verificación en serie contra la misma BASE y
 * resume cuántas comprobaciones pasó cada uno.
 *
 * Uso (desde packages/app):
 *   BASE=http://localhost:5173/ node verificacion/todos.mjs [carpeta-de-salida] [guion ...]
 *
 * - La carpeta de salida es opcional: por defecto verificacion/salida/, que
 *   está ignorada por git. Cada guion deja sus capturas y descargas en su
 *   propia subcarpeta, y su salida de consola en <guion>.txt.
 * - Detrás se pueden nombrar solo algunos guiones (sin .mjs):
 *   `node verificacion/todos.mjs salida capas rasante`.
 * - Sale con código 1 si algún guion falla.
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const AQUI = fileURLToPath(new URL('.', import.meta.url))

/** El orden: primero la obra simulada (si no abre, lo demás no tiene sentido), luego la ola 3 y al final los guiones viejos. */
const GUIONES = [
  'obra-simulada',
  'obra',
  'calle',
  'analisis-cierre',
  'niveles',
  'hoja-niveles',
  'niveles-plano',
  'visor-dwg',
  'informes',
  'plano',
  'planificador',
  'herramientas',
  'archivo',
  'movil',
  'recorrido',
  'importar',
  'capas',
  'rasante',
  'visor3d',
  'vista3d',
  'guiones-viejos',
]

const [carpeta, ...pedidos] = process.argv.slice(2)
const SALIDA = carpeta ?? join(AQUI, 'salida')
mkdirSync(SALIDA, { recursive: true })

const desconocidos = pedidos.filter((n) => !GUIONES.includes(n))
if (desconocidos.length > 0) {
  console.error(`No conozco estos guiones: ${desconocidos.join(', ')}. Los que hay: ${GUIONES.join(', ')}.`)
  process.exit(2)
}
const aCorrer = pedidos.length > 0 ? GUIONES.filter((n) => pedidos.includes(n)) : GUIONES

// Un guion nuevo que nadie añadió a la lista se avisa, para que no quede sin correr.
const sueltos = readdirSync(AQUI)
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && f !== 'todos.mjs')
  .map((f) => f.replace(/\.mjs$/, ''))
  .filter((n) => !GUIONES.includes(n))
if (sueltos.length > 0) console.log(`△ Hay guiones que esta lista no corre: ${sueltos.join(', ')}. Añádelos a GUIONES en todos.mjs.\n`)

/** Corre un guion y devuelve su código de salida y lo que escribió. */
function correr(nombre) {
  return new Promise((resolver) => {
    const inicio = Date.now()
    const hijo = spawn(process.execPath, [join(AQUI, `${nombre}.mjs`), join(SALIDA, nombre)], {
      env: { ...process.env, BASE },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let texto = ''
    hijo.stdout.on('data', (d) => { texto += d })
    hijo.stderr.on('data', (d) => { texto += d })
    hijo.on('close', (codigo) => resolver({ codigo: codigo ?? 1, texto, segundos: (Date.now() - inicio) / 1000 }))
  })
}

console.log(`Corriendo ${aCorrer.length} guiones contra ${BASE}`)
console.log(`Salida en ${SALIDA}\n`)

const resumen = []
for (const nombre of aCorrer) {
  if (!existsSync(join(AQUI, `${nombre}.mjs`))) {
    console.log(`✗ ${nombre}: no existe ${nombre}.mjs`)
    resumen.push({ nombre, ok: false, cuenta: 'no existe', segundos: 0, fallas: [] })
    continue
  }
  if (process.stdout.isTTY) process.stdout.write(`… ${nombre} `)
  const { codigo, texto, segundos } = await correr(nombre)
  writeFileSync(join(SALIDA, `${nombre}.txt`), texto)
  const marcador = texto.match(/=== (\d+)\/(\d+) comprobaciones superadas ===/)
  const cuenta = marcador ? `${marcador[1]}/${marcador[2]}` : 'sin resumen (se cortó)'
  const fallas = texto.split('\n').filter((l) => l.startsWith('FALLA'))
  const ok = codigo === 0
  // Un guion que se cae a medias no llega a escribir su resumen: se enseña el error.
  const error = !marcador ? (texto.trim().split('\n').find((l) => /Error|error/.test(l)) ?? '').trim() : ''
  console.log(`${process.stdout.isTTY ? '\r' : ''}${ok ? '✓' : '✗'} ${nombre.padEnd(16)} ${cuenta.padEnd(24)} ${segundos.toFixed(0)} s`)
  for (const falla of fallas.slice(0, 5)) console.log(`    ${falla.slice(0, 160)}`)
  if (fallas.length > 5) console.log(`    … y ${fallas.length - 5} más (ver ${nombre}.txt)`)
  if (error) console.log(`    ${error.slice(0, 160)}`)
  resumen.push({ nombre, ok, cuenta, segundos, fallas })
}

const malos = resumen.filter((r) => !r.ok)
const totales = resumen.reduce(
  (t, r) => {
    const m = /^(\d+)\/(\d+)$/.exec(r.cuenta)
    return m ? { pasan: t.pasan + Number(m[1]), total: t.total + Number(m[2]) } : t
  },
  { pasan: 0, total: 0 },
)
console.log(`\n=== ${resumen.length - malos.length}/${resumen.length} guiones en verde · ${totales.pasan}/${totales.total} comprobaciones ===`)
if (malos.length > 0) console.log(`Fallan: ${malos.map((r) => r.nombre).join(', ')}`)
process.exit(malos.length === 0 ? 0 : 1)
