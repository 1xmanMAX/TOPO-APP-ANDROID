import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * El modelo 3D en modo Estado, sobre el proyecto de ejemplo con que arranca
 * la app, por la navegación de la ola 2: la rasante se confirma en
 * Obra › Calles y el modelo se abre en Calle › Revisar con el botón «3D» de
 * la vista de la calle. Que se dibuja, que sus controles están montados, y
 * que gira, secciona y resume de verdad.
 *
 * Uso: node verificacion/vista3d.mjs <carpeta-de-salida>
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

const espacios = pagina.getByRole('navigation', { name: 'Espacios' })
async function irA(espacio) {
  await espacios.getByRole('button', { name: espacio, exact: true }).click()
}

// 1. La rasante ya viene definida en el proyecto de ejemplo (igual que
// comprueba `rasante.mjs`): sin ella, el modelo por estado no dibuja nada.
// Se confirma en Obra › Calles, apartado «Rasante», antes de seguir.
await irA('Obra')
await pagina.getByRole('navigation', { name: 'Pantallas de la obra' }).getByRole('button', { name: 'Calles', exact: true }).click()
const botonRasante = pagina.getByRole('button', { name: 'Rasante', exact: true })
if ((await botonRasante.getAttribute('aria-expanded')) !== 'true') await botonRasante.click()
const cotaArranque = await pagina.getByLabel('Cota de arranque').inputValue()
comprobar('la calle trae su rasante ya definida, condición para que el modelo 3D levante algo',
  cotaArranque.startsWith('3244.85'), 'cota ' + cotaArranque)

// 2. Ir a Calle › Revisar y pasar la vista de la calle a «3D».
await irA('Calle')
await pagina.getByRole('navigation', { name: 'Modos de la calle' }).getByRole('button', { name: 'Revisar', exact: true }).click()
await pagina.getByRole('group', { name: 'Vista de la calle' }).getByRole('button', { name: '3D', exact: true }).click()
await pagina.waitForTimeout(200)

const seccionModelo = pagina.getByRole('region', { name: 'Dibujo de la calle' })
await seccionModelo.scrollIntoViewIfNeeded()

// 3. El modelo se dibuja.
const modelo = seccionModelo.getByRole('img', { name: /Modelo en volumen de la calle/ })
comprobar('el modelo 3D se dibuja', (await modelo.count()) > 0)

const carasAntes = await modelo.locator('polygon[data-cara]').count()
comprobar('el modelo dibuja al menos una cara (zona con sus cuatro esquinas medidas)',
  carasAntes > 0, `${carasAntes} caras`)

await pagina.screenshot({ path: `${SALIDA}/modelo-3d.png`, fullPage: true })

// 4. Los controles del visor están montados y alcanzables desde Revisar.
comprobar('el interruptor Estado/Capas está montado', (await seccionModelo.getByRole('button', { name: 'Estado' }).count()) > 0)
comprobar('el botón de vista Planta está montado', (await seccionModelo.getByRole('button', { name: 'Planta' }).count()) > 0)
comprobar('el botón de vista Alzado está montado', (await seccionModelo.getByRole('button', { name: 'Alzado' }).count()) > 0)
comprobar('el botón de vista Isométrico está montado', (await seccionModelo.getByRole('button', { name: 'Isométrico' }).count()) > 0)
comprobar('el deslizador de inclinación está montado', (await seccionModelo.getByLabel('Inclinación').count()) > 0)
comprobar('el deslizador de exageración está montado', (await seccionModelo.getByLabel('Exageración').count()) > 0)

// 5. Girar arrastrando cambia el dibujo. Esto solo se puede comprobar en un
// navegador real: se compara la lista de coordenadas de los polígonos antes
// y después de un arrastre real con el ratón.
const puntosAntes = await modelo.locator('polygon[data-cara]').evaluateAll((es) => es.map((e) => e.getAttribute('points')))

const caja = await modelo.boundingBox()
const centroY = caja.y + caja.height / 2
await pagina.mouse.move(caja.x + caja.width * 0.3, centroY)
await pagina.mouse.down()
await pagina.mouse.move(caja.x + caja.width * 0.8, centroY, { steps: 10 })
await pagina.mouse.up()
await pagina.waitForTimeout(200)

const puntosDespues = await modelo.locator('polygon[data-cara]').evaluateAll((es) => es.map((e) => e.getAttribute('points')))
comprobar('girar arrastrando sobre el modelo cambia el dibujo (las coordenadas de las caras cambian)',
  JSON.stringify(puntosAntes) !== JSON.stringify(puntosDespues))

await pagina.screenshot({ path: `${SALIDA}/modelo-girado.png`, fullPage: true })

// 6. El deslizador de progresiva secciona el modelo (menos caras al recortar
// el tramo). Es el mismo deslizador de la vista de la calle, compartido por
// el corte, el perfil y el 3D. Se lleva al principio y un paso a la derecha.
const deslizador = seccionModelo.getByRole('slider', { name: 'Progresiva' })
const carasTodo = await (async () => {
  await deslizador.focus()
  await deslizador.press('End')
  await pagina.waitForTimeout(200)
  return modelo.locator('polygon[data-cara]').count()
})()
await deslizador.press('Home')
await deslizador.press('ArrowRight')
await pagina.waitForTimeout(200)

const carasDespuesDelCorte = await modelo.locator('polygon[data-cara]').count()
comprobar('el deslizador de progresiva secciona el modelo 3D (menos caras al recortar el tramo)',
  carasDespuesDelCorte > 0 && carasDespuesDelCorte < carasTodo, `${carasTodo} -> ${carasDespuesDelCorte}`)

await pagina.screenshot({ path: `${SALIDA}/modelo-seccionado.png`, fullPage: true })

// 7. La exageración aparece escrita junto al modelo, no solo en el
// deslizador: el relieve real de una calle es casi plano, y sin este aviso
// alguien podría creer que la pendiente que ve es la real.
comprobar('la exageración vertical aparece escrita junto al modelo',
  (await seccionModelo.getByText(/^Alturas exageradas \d+×$/).count()) > 0)

await seccionModelo.getByLabel('Exageración').fill('10')
await pagina.waitForTimeout(200)
comprobar('el texto de exageración sigue al deslizador cuando se mueve',
  (await seccionModelo.getByText('Alturas exageradas 10×').count()) > 0)

await seccionModelo.getByLabel('Exageración').fill('25')

// 8. El resumen en texto nombra la peor zona: es la única forma de
// enterarse de dónde está el problema para quien no ve el modelo o no
// distingue sus colores. El resumen cuenta solo las caras dibujadas, así
// que antes se quita el recorte (deslizador al final).
await deslizador.focus()
await deslizador.press('End')
await pagina.waitForTimeout(300)
const resumen = seccionModelo.getByText(/^El modelo dibuja \d+ tramos/)
comprobar('el resumen en texto del modelo aparece', (await resumen.count()) > 0)

const textoResumen = (await resumen.first().textContent().catch(() => '')) ?? ''
comprobar('el resumen nombra la peor zona con su progresiva, elemento y diferencia en milímetros',
  /La mayor diferencia está en .+: [+\-−]?\d+ mm\./.test(textoResumen), textoResumen)

comprobar('la app no produce errores en la consola del navegador',
  erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

await navegador.close()

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
if (erroresConsola.length) console.log(erroresConsola.slice(0, 3).join('\n'))
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 && erroresConsola.length === 0 ? 0 : 1)
