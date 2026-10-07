import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * Tarea V7 —capas apiladas y corte vivo en el modelo 3D— por la navegación
 * de la ola 2, sobre el proyecto de ejemplo con que arranca la app (dos
 * campañas completas sobre Av. Sol: SUBRASANTE y BASE).
 *
 * Las capas que se dibujan juntas se marcan en Calle › Análisis › Espesores
 * (casillas «Dibujar …»); Calle › Revisar las respeta en el corte y en el
 * modelo 3D, que se abre con el botón «3D» de la vista de la calle.
 *
 * Uso: node verificacion/visor3d.mjs <carpeta-de-salida>
 * La URL sale de BASE (por defecto http://localhost:4173/).
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 800 } })

const erroresConsola = []
pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(m.text()) })
pagina.on('pageerror', (e) => erroresConsola.push('pageerror: ' + e.message))

await pagina.goto(BASE, { waitUntil: 'load', timeout: 120000 })

await pagina.getByRole('navigation', { name: 'Espacios' }).getByRole('button', { name: 'Calle', exact: true }).click()

// 1. Marcar las dos capas en el selector de Análisis › Espesores: el modo
// capas del modelo 3D dibuja justo las que estén marcadas ahí.
await pagina.getByRole('navigation', { name: 'Pantallas de la calle' }).getByRole('button', { name: 'Análisis', exact: true }).click()
await pagina.getByRole('tab', { name: 'Espesores' }).click()
const casillas = pagina.getByRole('checkbox', { name: /^Dibujar / })
await casillas.first().waitFor({ timeout: 10000 })
const cuantasCasillas = await casillas.count()
for (let i = 0; i < cuantasCasillas; i += 1) {
  const casilla = casillas.nth(i)
  const nombre = await casilla.getAttribute('aria-label')
  if (nombre && /SUBRASANTE|BASE/.test(nombre)) await casilla.check()
}

// 2. Volver a Revisar, abrir el 3D y cambiarlo a modo Capas.
await pagina.getByRole('navigation', { name: 'Modos de la calle' }).getByRole('button', { name: 'Revisar', exact: true }).click()
await pagina.getByRole('group', { name: 'Vista de la calle' }).getByRole('button', { name: '3D', exact: true }).click()
const dibujo = pagina.getByRole('region', { name: 'Dibujo de la calle' })
await dibujo.getByRole('button', { name: 'Capas', exact: true }).click()
await pagina.waitForTimeout(200)
await pagina.screenshot({ path: `${SALIDA}/modelo-capas.png`, fullPage: true })

const capasEnModelo = new Set(
  await dibujo
    .locator('svg polygon[data-capa-id]')
    .evaluateAll((es) => es.map((e) => e.getAttribute('data-capa-id'))),
)
comprobar('en modo capas el modelo 3D dibuja una superficie por cada campaña marcada',
  capasEnModelo.size === 2, `${capasEnModelo.size} capas en el modelo`)

const rotulosModelo = await dibujo.getByText(/^(SUBRASANTE|BASE)$/).count()
comprobar('cada superficie del modelo 3D lleva el nombre de su capa junto al dibujo, no solo el color',
  rotulosModelo >= 2, `${rotulosModelo} rótulos`)

// 3. El corte vivo: mover el deslizador de progresiva tiene que reducir el
// modelo (filtrar antes de proyectar), no dibujarlo entero y taparlo. Se
// cuenta con el deslizador al final (todo el tramo) y luego en 0+020.
// La progresiva se recorre con las flechas «Progresiva anterior / siguiente»
// de la cabecera del dibujo (ya no hay deslizador). Esto las pulsa como
// pulsaba antes las teclas del deslizador: End = la última, Home = la primera.
const deslizador = {
  async focus() {},
  async press(tecla) {
    const anterior = dibujo.getByRole('button', { name: 'Progresiva anterior', exact: true })
    const siguiente = dibujo.getByRole('button', { name: 'Progresiva siguiente', exact: true })
    if (tecla === 'ArrowRight') return siguiente.click()
    if (tecla === 'ArrowLeft') return anterior.click()
    const boton = tecla === 'End' ? siguiente : anterior
    while (await boton.isEnabled()) await boton.click()
  },
}
await deslizador.focus()
await deslizador.press('End')
await pagina.waitForTimeout(200)
const carasAntes = await dibujo.locator('svg polygon[data-cara]').count()

await deslizador.press('Home')
await deslizador.press('ArrowRight')
await pagina.waitForTimeout(200)

const carasDespues = await dibujo.locator('svg polygon[data-cara]').count()
comprobar('el deslizador de progresiva secciona el modelo 3D (menos caras al recortar el tramo)',
  carasDespues > 0 && carasDespues < carasAntes, `${carasAntes} -> ${carasDespues}`)

const progresivasFueraDeCorte = await dibujo
  .locator('svg polygon[data-cara]')
  .evaluateAll((es) => es.map((e) => Number(e.getAttribute('data-progresiva-desde'))))
comprobar('ninguna cara dibujada empieza después de la progresiva del deslizador (0+020)',
  progresivasFueraDeCorte.length > 0 && progresivasFueraDeCorte.every((p) => p <= 20),
  progresivasFueraDeCorte.join(', '))

await pagina.screenshot({ path: `${SALIDA}/modelo-seccionado.png`, fullPage: true })

// 4. Devolver el deslizador al final y el interruptor a Estado, para no
// dejar la página en un estado sorprendente si algo más corre después.
await deslizador.press('End')
await dibujo.getByRole('button', { name: 'Estado', exact: true }).click()

comprobar('la app no produce errores en la consola del navegador',
  erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

await navegador.close()

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
if (erroresConsola.length) console.log(erroresConsola.slice(0, 3).join('\n'))
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 && erroresConsola.length === 0 ? 0 : 1)
