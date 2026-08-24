import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

const navegador = await chromium.launch()
const pagina = await navegador.newPage()

const erroresConsola = []
pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(m.text()) })
pagina.on('pageerror', (e) => erroresConsola.push('pageerror: ' + e.message))

await pagina.goto(BASE, { waitUntil: 'networkidle' })

// El proyecto de ejemplo ya trae dos campañas completas sobre la misma
// calle — SUBRASANTE y BASE, cada una con su grilla entera de 0+000 a
// 0+080 — así que no hace falta registrar nada nuevo para comprobar la
// Tarea V7 (visor 3D: capas apiladas y corte vivo).
await pagina.getByRole('button', { name: 'Resultados', exact: true }).click()
await pagina.waitForTimeout(200)

// 1. Marcar las dos capas en el selector que ya usa el corte transversal:
// el modo capas del modelo 3D dibuja justo las que estén marcadas ahí.
const casillas = pagina.getByRole('checkbox')
const cuantasCasillas = await casillas.count()
for (let i = 0; i < cuantasCasillas; i += 1) {
  const casilla = casillas.nth(i)
  const nombre = await casilla.getAttribute('aria-label')
  if (nombre && /SUBRASANTE|BASE/.test(nombre)) await casilla.check()
}

// 2. Cambiar el modelo 3D a modo Capas.
await pagina.getByRole('button', { name: 'Capas', exact: true }).click()
await pagina.waitForTimeout(200)
await pagina.screenshot({ path: `${SALIDA}/modelo-capas.png`, fullPage: true })

const capasEnModelo = new Set(
  await pagina
    .locator('svg polygon[data-capa-id]')
    .evaluateAll((es) => es.map((e) => e.getAttribute('data-capa-id'))),
)
comprobar('en modo capas el modelo 3D dibuja una superficie por cada campaña marcada',
  capasEnModelo.size === 2, `${capasEnModelo.size} capas en el modelo`)

const rotulosModelo = await pagina.getByText(/^(SUBRASANTE|BASE)$/).count()
comprobar('cada superficie del modelo 3D lleva el nombre de su capa junto al dibujo, no solo el color',
  rotulosModelo >= 2, `${rotulosModelo} rótulos`)

// 3. El corte vivo: mover el deslizador de progresiva tiene que reducir el
// modelo (filtrar antes de proyectar), no dibujarlo entero y taparlo.
const carasAntes = await pagina.locator('svg polygon[data-cara]').count()

// Un solo paso a la derecha, igual que ya hace `recorrido.mjs` para el
// corte transversal: en un range al mínimo, `Home` no cambia el valor y por
// tanto no dispara el evento — con nada tocado todavía en esta página el
// deslizador arranca en la primera progresiva (0+000), así que un paso a la
// derecha lo deja en la segunda (0+020) y sí dispara el cambio.
const deslizador = pagina.getByLabel('Progresiva')
await deslizador.focus()
await deslizador.press('ArrowRight')
await pagina.waitForTimeout(200)

const carasDespues = await pagina.locator('svg polygon[data-cara]').count()
comprobar('el deslizador de progresiva secciona el modelo 3D (menos caras al recortar el tramo)',
  carasDespues > 0 && carasDespues < carasAntes, `${carasAntes} -> ${carasDespues}`)

const progresivasFueraDeCorte = await pagina
  .locator('svg polygon[data-cara]')
  .evaluateAll((es) => es.map((e) => Number(e.getAttribute('data-progresiva-desde'))))
comprobar('ninguna cara dibujada empieza después de la progresiva del deslizador (0+020)',
  progresivasFueraDeCorte.length > 0 && progresivasFueraDeCorte.every((p) => p <= 20),
  progresivasFueraDeCorte.join(', '))

await pagina.screenshot({ path: `${SALIDA}/modelo-seccionado.png`, fullPage: true })

// 4. Devolver el deslizador al final y el interruptor a Estado, para no
// dejar la página en un estado sorprendente si algo más corre después.
await deslizador.press('End')
await pagina.getByRole('button', { name: 'Estado', exact: true }).click()

comprobar('la app no produce errores en la consola del navegador',
  erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

await navegador.close()

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
if (erroresConsola.length) console.log(erroresConsola.slice(0, 3).join('\n'))
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 && erroresConsola.length === 0 ? 0 : 1)
