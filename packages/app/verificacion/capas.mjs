import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'

/**
 * Entrega 2A por la navegación de la ola 2: registrar una segunda jornada
 * sobre la misma calle, en otra capa, y comparar las dos. Sobre el proyecto
 * de ejemplo con que arranca la app (Av. Sol, SUBRASANTE y BASE).
 *
 * - Obra › Calles: «Nueva jornada», y en «Jornadas y hojas» se le corrige la
 *   capa a TERRENO EXISTENTE y se abre en la libreta.
 * - Calle › Medir: vista atrás, progresivas declaradas y dos lecturas.
 * - Calle › Análisis › Espesores: la comparación de las dos capas y las
 *   casillas «Dibujar …»; Calle › Revisar dibuja las dos en el corte.
 * - Informes › Control de espesores: el Excel de espesores.
 *
 * Uso: node verificacion/capas.mjs <carpeta-de-salida>
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
const contexto = await navegador.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } })
const pagina = await contexto.newPage()

const erroresConsola = []
pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(m.text()) })
pagina.on('pageerror', (e) => erroresConsola.push('pageerror: ' + e.message))

await pagina.goto(BASE, { waitUntil: 'load', timeout: 120000 })

const espacios = pagina.getByRole('navigation', { name: 'Espacios' })
async function irA(espacio) {
  await espacios.getByRole('button', { name: espacio, exact: true }).click()
}
async function irAObraCalles() {
  await irA('Obra')
  await pagina.getByRole('navigation', { name: 'Pantallas de la obra' }).getByRole('button', { name: 'Calles', exact: true }).click()
}
async function abrirApartado(nombre) {
  const boton = pagina.getByRole('button', { name: nombre, exact: true })
  if ((await boton.getAttribute('aria-expanded')) !== 'true') await boton.click()
}
async function irAModo(modo) {
  await irA('Calle')
  await pagina.getByRole('navigation', { name: 'Modos de la calle' }).getByRole('button', { name: modo, exact: true }).click()
  await pagina.getByRole('heading', { name: modo, exact: true, level: 2 }).waitFor({ timeout: 10000 })
}
async function irAAnalisisEspesores() {
  await irA('Calle')
  await pagina.getByRole('navigation', { name: 'Pantallas de la calle' }).getByRole('button', { name: 'Análisis', exact: true }).click()
  await pagina.getByRole('tab', { name: 'Espesores' }).click()
}
// Cada jornada del historial es una fila con su botón de comparar; abrir y
// corregir van en su «⋯».
const jornadasDeLaCalle = () =>
  pagina.getByRole('button', { name: /^Comparar la jornada / }).evaluateAll((es) => es.map((e) => e.getAttribute('aria-label')))
async function menuDeJornada(senia) {
  const boton = pagina.getByRole('button', { name: `Más de la jornada ${senia}`, exact: true })
  if ((await boton.getAttribute('aria-expanded')) !== 'true') await boton.click()
}

// 1. Registrar una segunda jornada sobre la misma calle, en la capa de abajo.
// «Nueva jornada» salta sola a la libreta, así que se vuelve para contar.
await irAObraCalles()
await abrirApartado('Jornadas y hojas')
const antes = await jornadasDeLaCalle()
await pagina.getByRole('button', { name: 'Nueva jornada', exact: true }).click()
await pagina.getByRole('heading', { name: 'Medir', exact: true, level: 2 }).waitFor({ timeout: 10000 })
await irAObraCalles()
await abrirApartado('Jornadas y hojas')
const despues = await jornadasDeLaCalle()
comprobar('se puede registrar otra jornada sobre la misma calle',
  despues.length === antes.length + 1, `${antes.length} -> ${despues.length} jornadas`)

// La jornada nueva hereda la capa de la última de la calle (BASE); se le
// corrige a TERRENO EXISTENTE, la capa de abajo, desde su ficha.
const nueva = despues.find((n) => !antes.includes(n)) ?? ''
const senia = nueva.replace(/^Comparar la jornada /, '')
await menuDeJornada(senia)
await pagina.getByRole('button', { name: `Corregir la jornada ${senia}`, exact: true }).click()
await pagina.getByLabel(`Capa de la jornada ${senia}`).selectOption({ label: 'TERRENO EXISTENTE' })
const seniaTerreno = senia.replace(/ · .*$/, ' · TERRENO EXISTENTE')
await menuDeJornada(seniaTerreno)
await pagina.getByRole('button', { name: `Abrir la jornada ${seniaTerreno}`, exact: true }).click()

// 2. La libreta nueva nace con su estación, pero sin la visada al banco de
// nivel no hay altura de aparato y por tanto ninguna cota. Se escribe primero.
await pagina.getByRole('heading', { name: 'Medir', exact: true, level: 2 }).waitFor({ timeout: 10000 })
comprobar('la libreta nueva avisa de que falta la vista atrás',
  await pagina.getByText(/Falta la lectura de vista atrás/).isVisible())

const vistaAtras = pagina.getByLabel(/^Vista atrás a /).first()
await vistaAtras.fill('1.425')
await vistaAtras.blur()

// 2b. La jornada nueva nace sin ninguna fila: las progresivas se declaran
// según se mide. Se declaran 0+000, que va a medir, y 0+020, que deja
// declarada y sin medir a propósito, para comprobar más abajo que una
// progresiva sin pareja sale vacía en el Excel y no en cero.
const campoProgresiva = pagina.getByLabel('Añadir progresiva')
for (const progresiva of ['0+000', '0+020']) {
  await campoProgresiva.fill(progresiva)
  await pagina.getByRole('button', { name: 'Añadir', exact: true }).click()
}

// 3. Ahora sí, una lectura en la misma celda que midió la jornada de
// subrasante. En Medir el mapa dice qué está medido y qué falta; la celda se
// nombra con el nombre completo del punto («Eje»).
await pagina.getByRole('button', { name: /^0\+000 Eje([:,]|$)/ }).first().click()
const campo = pagina.getByLabel('Lectura de mira')
await campo.click()
await campo.type('2.230', { delay: 20 })
await campo.press('Enter')

const llenas = await pagina.getByText(/llenadas \d+ de \d+/).textContent()
comprobar('con la vista atrás escrita, la lectura produce cota',
  /llenadas 1 de/.test(llenas ?? ''), llenas?.trim())

// Una segunda celda de la misma progresiva, también medida en la subrasante:
// hacen falta dos puntos en común para que haya área que rellenar.
await pagina.getByRole('button', { name: /^0\+000 Borde izquierdo([:,]|$)/ }).first().click()
await campo.click()
await campo.type('2.290', { delay: 20 })
await campo.press('Enter')

const llenasDos = await pagina.getByText(/llenadas \d+ de \d+/).textContent()
comprobar('la segunda celda también se registra', /llenadas 2 de/.test(llenasDos ?? ''), llenasDos?.trim())

// 4. Elegir las dos capas a comparar en Calle › Análisis › Espesores.
await irAAnalisisEspesores()
await pagina.screenshot({ path: `${SALIDA}/antes-de-comparar.png`, fullPage: true })
// El cambio de capas va plegado bajo la línea «Comparando …»: se abre para usarlo.
{
  const comparando = pagina.locator('summary', { hasText: 'Comparando' }).first()
  await comparando.waitFor({ timeout: 10000 })
  if (!(await comparando.evaluate((s) => s.parentElement.open))) await comparando.click()
}

const selectorAbajo = pagina.getByLabel('Capa de abajo en la comparación')
const selectorArriba = pagina.getByLabel('Capa de arriba en la comparación')
comprobar('el selector de capas está en Análisis › Espesores',
  (await selectorAbajo.count()) === 1 && (await selectorArriba.count()) === 1)

const opcionesAbajo = await selectorAbajo.locator('option').allTextContents().catch(() => [])
comprobar('el selector ofrece las jornadas de la calle', opcionesAbajo.filter((o) => o !== '—').length >= 3,
  opcionesAbajo.join(' | '))

// Abajo el terreno (jornada nueva), arriba la subrasante (la del ejemplo).
const valores = await selectorAbajo.locator('option').evaluateAll((os) => os.map((o) => o.value))
const idTerreno = valores.find((_, i) => /TERRENO/.test(opcionesAbajo[i] ?? ''))
const opcionesArriba = await selectorArriba.locator('option').allTextContents()
const valoresArriba = await selectorArriba.locator('option').evaluateAll((os) => os.map((o) => o.value))
const idSubrasante = valoresArriba.find((_, i) => /SUBRASANTE/.test(opcionesArriba[i] ?? ''))

await selectorAbajo.selectOption(idTerreno)
await selectorArriba.selectOption(idSubrasante)
await pagina.waitForTimeout(200)

// Cota del terreno en 0+000 Eje: 3245.180 + 1.425 − 2.230 = 3244.375.
// La subrasante ahí está a 3244.597: el espesor colocado es 0.2xx m.
const espesor = await pagina.getByRole('button', { name: /^Espesor en 0\+000 Eje: 0\.2\d{2} m/ }).first().getAttribute('aria-label').catch(() => null)
comprobar('el mapa de espesores muestra el espesor colocado entre las dos capas',
  espesor !== null, `celda: ${espesor}`)

const resumen = await pagina.getByText(/^Mínimo$/).first().locator('..').innerText().catch(() => null)
comprobar('el resumen da el espesor mínimo de las celdas comparables', resumen !== null && /\d\.\d{3} m/.test(resumen),
  resumen?.replace(/\s+/g, ' ').trim())

await pagina.screenshot({ path: `${SALIDA}/espesores.png`, fullPage: true })

// 5. Dibujar las dos capas superpuestas en el corte: se marcan aquí y
// Calle › Revisar las dibuja juntas.
const casillas = pagina.getByRole('checkbox', { name: /^Dibujar / })
const cuantasCasillas = await casillas.count()
for (let i = 0; i < cuantasCasillas; i += 1) {
  const casilla = casillas.nth(i)
  const nombre = await casilla.getAttribute('aria-label')
  if (nombre && /TERRENO|SUBRASANTE/.test(nombre)) await casilla.check()
}
await irAModo('Revisar')
// El corte se lleva a 0+000 tocando su celda en el mapa.
await pagina.getByRole('region', { name: 'Mapa de la calle' }).getByRole('button', { name: /^0\+000 Eje[:,]/ }).click()
await pagina.waitForTimeout(200)

const corteRevisar = pagina.getByRole('img', { name: /Corte transversal/ })
const trazos = await corteRevisar.locator('polyline[data-capa-id]').count()
comprobar('el corte dibuja un trazo por cada capa visible', trazos >= 2, `${trazos} trazos`)

const rellenos = await corteRevisar.locator('polygon[data-relleno-capas]').count()
comprobar('hay relleno entre las capas', rellenos >= 1, `${rellenos} rellenos`)

await pagina.screenshot({ path: `${SALIDA}/capas-apiladas.png`, fullPage: true })

// 6. Descargar el Excel de espesores desde Informes y comprobar qué dice.
await irA('Informes')
await pagina.getByRole('button', { name: 'Control de espesores', exact: true }).click()
// Las capas van en el alcance, plegado bajo los chips de lo ya elegido.
const resumenAlcance = pagina.locator('summary', { hasText: 'Cambiar calle, jornada o tramo' })
if (!(await resumenAlcance.evaluate((s) => s.parentElement.open))) await resumenAlcance.click()
const arribaInforme = pagina.getByLabel('Capa de arriba', { exact: true })
const opcionesInforme = await arribaInforme.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })))
const subrasanteInforme = opcionesInforme.find((o) => /SUBRASANTE/.test(o.t ?? ''))
// Sin la opción, el Excel saldría de otra comparación y podría pasar por casualidad: se dice.
comprobar('en Informes se puede elegir SUBRASANTE como capa de arriba', Boolean(subrasanteInforme),
  opcionesInforme.map((o) => o.t).join(' | '))
if (subrasanteInforme) await arribaInforme.selectOption(subrasanteInforme.v)
const abajoInforme = pagina.getByLabel('Capa de abajo', { exact: true })
const opcionesAbajoInforme = await abajoInforme.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })))
const terrenoInforme = opcionesAbajoInforme.find((o) => /TERRENO/.test(o.t ?? ''))
comprobar('en Informes se puede elegir TERRENO como capa de abajo', Boolean(terrenoInforme),
  opcionesAbajoInforme.map((o) => o.t).join(' | '))
if (terrenoInforme) await abajoInforme.selectOption(terrenoInforme.v)

await pagina.locator('summary', { hasText: 'Datos sueltos' }).click()
const botonEspesores = pagina.getByRole('button', { name: /espesores a Excel/i })
const descarga = await Promise.all([
  pagina.waitForEvent('download'),
  botonEspesores.click(),
]).then(([d]) => d)

const ruta = `${SALIDA}/espesores.xlsx`
await descarga.saveAs(ruta)

const contenido = unzipSync(new Uint8Array(readFileSync(ruta)))
const hoja = strFromU8(contenido['xl/worksheets/sheet1.xml'])

comprobar('el Excel de espesores nombra las dos capas comparadas',
  /TERRENO EXISTENTE/.test(hoja) && /SUBRASANTE/.test(hoja))

// La jornada del terreno no cierra contra ningún banco de nivel, así que sus
// cotas no están comprobadas — y un espesor calculado sobre ellas, tampoco.
comprobar('el Excel avisa de que los espesores no están comprobados',
  /NO COMPROBADOS/.test(hoja),
  (hoja.match(/<t>[^<]*COMPROBAD[^<]*<\/t>/g) ?? []).join(' | ').slice(0, 160))

comprobar('el Excel lleva los espesores como número',
  /<c r="[A-Z]+\d+"><v>0\.2\d{2}<\/v><\/c>/.test(hoja),
  (hoja.match(/<v>0\.2\d{2}<\/v>/g) ?? []).join(' '))

// La progresiva 0+020 la midió la subrasante, y la jornada de terreno la dejó
// declarada sin medir: la fila está, pero de esta capa no hay cota. Tiene que
// salir vacía en el archivo real, no en 0.000. Se parte la hoja por filas
// antes de buscar, para no tragarse las filas de en medio.
const filaVeinte = hoja.split('</row>').find((f) => f.includes('0+020')) ?? ''
comprobar('la progresiva sin pareja en la otra capa sale vacía en el Excel, no en cero',
  filaVeinte !== '' && !/<v>/.test(filaVeinte),
  filaVeinte)

// 7. El corte de la libreta (Medir) tiene que dibujar siempre la jornada
// activa, nunca lo que haya quedado marcado en las casillas «Dibujar». Las
// dos casillas (TERRENO y SUBRASANTE) siguen marcadas desde el paso 5; si el
// corte de Medir las heredara, saldrían dos trazos con su etiqueta.
await irAModo('Medir')
await pagina.getByRole('region', { name: 'Mapa de la calle' }).getByRole('button', { name: /^0\+000 Eje([:,]|$)/ }).click()
await pagina.waitForTimeout(200)

const corteLibreta = pagina.getByRole('img', { name: /Corte transversal/ })
const trazosLibreta = await corteLibreta.locator('polyline[data-capa-id]').count()
comprobar('el corte de la libreta dibuja una sola jornada aunque haya dos marcadas para comparar',
  trazosLibreta === 1, `${trazosLibreta} trazos`)

const etiquetaCapaEnLibreta = await corteLibreta.getByText(/^(TERRENO EXISTENTE|SUBRASANTE)$/).count()
comprobar('el corte de la libreta no rotula la capa (una sola serie)',
  etiquetaCapaEnLibreta === 0, `${etiquetaCapaEnLibreta} etiquetas de capa`)

// Contar un solo trazo no basta: hay que comprobar que es el de la jornada
// ACTIVA. El borde izquierdo en 0+000 lo midió la jornada nueva y su cota
// (3245.180 + 1.425 − 2.290 = 3244.315) no es la de la subrasante.
const puntosLibreta = await corteLibreta
  .locator('[aria-label]')
  .evaluateAll((es) => es.map((e) => e.getAttribute('aria-label')))

comprobar('el corte de la libreta dibuja los puntos de la jornada que se está midiendo',
  puntosLibreta.some((n) => n?.includes('Borde izquierdo') && n.includes('3244.315')),
  puntosLibreta.join(' | ') || '(ningún punto)')

await navegador.close()

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
if (erroresConsola.length) console.log(erroresConsola.slice(0, 3).join('\n'))
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 && erroresConsola.length === 0 ? 0 : 1)
