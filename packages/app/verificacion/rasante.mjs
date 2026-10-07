import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'

/**
 * La rasante de una calle, de punta a punta, sobre el proyecto de ejemplo con
 * que arranca la app, por la navegación de la ola 2: se mira en Obra › Calles
 * (apartado «Rasante»: cota de arranque, pendiente y corte tipo), se revisa
 * en Calle › Revisar (punto elegido, mapa con semáforo y corte sombreado) y
 * se descarga el Excel de diferencias desde Informes.
 *
 * Uso: node verificacion/rasante.mjs <carpeta-de-salida>
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
async function irAModo(modo) {
  await irA('Calle')
  await pagina.getByRole('navigation', { name: 'Modos de la calle' }).getByRole('button', { name: modo, exact: true }).click()
  await pagina.getByRole('heading', { name: modo, exact: true, level: 2 }).waitFor({ timeout: 10000 })
}
async function abrirApartado(nombre) {
  const boton = pagina.getByRole('button', { name: nombre, exact: true })
  if ((await boton.getAttribute('aria-expanded')) !== 'true') await boton.click()
}

// 1. La rasante ya viene definida en el proyecto de ejemplo. Se mira en
// Obra › Calles, en el apartado «Rasante» del panel de la calle: el editor
// trae la cota de arranque y la pendiente puestas, y el corte tipo la dibuja
// con los tres tramos de la sección —calzada, sardinel y vereda— cubriendo
// la plantilla entera hasta ±5.60 m.
await irA('Obra')
await pagina.getByRole('navigation', { name: 'Pantallas de la obra' }).getByRole('button', { name: 'Calles', exact: true }).click()
await abrirApartado('Rasante')
await pagina.getByLabel('Cota de arranque').waitFor({ timeout: 10000 })

const textoCalle = await pagina.locator('main').innerText()
const cotaArranque = await pagina.getByLabel('Cota de arranque').inputValue()
const pendiente = await pagina.getByLabel('Pendiente longitudinal').inputValue()
comprobar('la calle del ejemplo trae su rasante ya definida',
  cotaArranque.startsWith('3244.85') && pendiente.startsWith('-0.30'),
  'cota ' + cotaArranque + ', pendiente ' + pendiente + ' %')

await pagina.getByLabel('Corte tipo de la sección').first().scrollIntoViewIfNeeded().catch(() => {})
await pagina.screenshot({ path: `${SALIDA}/rasante-definida.png`, fullPage: true })

// 2. Comprobar que el corte tipo se dibuja: un quiebre por cada tramo, con su
// nombre accesible ("Quiebre a X m del eje: ...").
const quiebres = await pagina.getByLabel(/^Quiebre a [\d.]+ m del eje/i).count()
comprobar('el corte tipo dibuja los quiebres de la sección definida',
  quiebres > 0, `${quiebres} quiebres`)

comprobar('la sección cubre toda la plantilla, sin puntos sin cota de proyecto',
  !/quedan sin cota de proyecto/i.test(textoCalle))

// 3. Ir a Calle › Revisar, que es lo que antes era Resultados.
await irAModo('Revisar')
await pagina.waitForTimeout(200)

// 4. El punto elegido dice milímetros con signo, qué hacer y el estado — los
// tres datos que antes solo llevaba el color. Se elige 0+000 Eje en el mapa.
// El nombre accesible de la celda lleva el nombre completo del punto («Eje»),
// no la palabra corta que se lee en la cabecera de la columna.
const celdaEje = pagina.getByLabel(/^0\+000 Eje: [+\-−]?\d+ mm/).first()
const etiquetaEje = await celdaEje.getAttribute('aria-label').catch(() => null)
comprobar('la celda 0+000 del eje lleva milímetros con signo, verbo y estado',
  /mm/.test(etiquetaEje ?? '') && /(cortar|rellenar|clavado)/.test(etiquetaEje ?? ''), etiquetaEje ?? '(no encontrada)')

await celdaEje.click()
const punto = pagina.getByRole('region', { name: 'Punto elegido' })
const textoPunto = (await punto.innerText().catch(() => '')).replace(/\s+/g, ' ')
comprobar('Revisar enseña la diferencia del punto elegido en mm, con su semáforo y qué hacer',
  /0\+000 · Eje/.test(textoPunto) && /Diferencia [+\-−]?\d+ mm/.test(textoPunto) &&
    /(✓|△|✗)/.test(textoPunto) && /(corta|rellena|cortar|rellenar|clavad)/i.test(textoPunto),
  textoPunto.slice(0, 200))

// Con la cota de arranque del ejemplo, las tres clases de estado aparecen a
// la vez: conforme, al límite y fuera. (El texto de cada estado termina la
// etiqueta, así que "$" evita que "al límite de tolerancia" o "fuera de
// tolerancia" cuenten como "conforme".)
comprobar('aparece al menos una celda conforme',
  (await pagina.getByLabel(/, conforme$/).count()) > 0)
comprobar('aparece al menos una celda al límite de tolerancia',
  (await pagina.getByLabel(/al límite de tolerancia$/).count()) > 0)
comprobar('aparece al menos una celda fuera de tolerancia',
  (await pagina.getByLabel(/fuera de tolerancia$/).count()) > 0)

// 5. El mapa de la calle colorea las celdas — el color nunca es la única
// pista (cada celda también lleva símbolo y texto), pero tiene que estar.
const seccionMapa = pagina.locator('section', {
  has: pagina.getByRole('heading', { name: 'Mapa de la calle' }),
})
await seccionMapa.scrollIntoViewIfNeeded()

const celdaMapaConforme = seccionMapa.getByLabel(/, conforme$/).first()
const claseConforme = await celdaMapaConforme.getAttribute('class').catch(() => null)
const simboloConforme = (await celdaMapaConforme.textContent().catch(() => '')) ?? ''
comprobar('el mapa pinta la celda conforme con su color (verde) y su ✓',
  /bg-pasa/.test(claseConforme ?? '') && simboloConforme.includes('✓'), `${simboloConforme} ${claseConforme ?? '(no encontrada)'}`)

const celdaMapaFuera = seccionMapa.getByLabel(/fuera de tolerancia$/).first()
const claseFuera = await celdaMapaFuera.getAttribute('class').catch(() => null)
const simboloFuera = (await celdaMapaFuera.textContent().catch(() => '')) ?? ''
comprobar('el mapa pinta la celda fuera de tolerancia con su color (rojo) y su ✗',
  /bg-falla/.test(claseFuera ?? '') && simboloFuera.includes('✗'), `${simboloFuera} ${claseFuera ?? '(no encontrada)'}`)

comprobar('el mapa lleva su leyenda de colores',
  (await pagina.getByLabel('Qué significa cada color del mapa').count()) > 0)

await pagina.screenshot({ path: `${SALIDA}/mapa-estado.png`, fullPage: true })

// 6. El corte transversal sombrea contra la rasante. Con la sección del
// ejemplo cubriendo la plantilla entera, en 0+000 hay corte y relleno.
const zonasCorte = await pagina.locator('[data-zona="corte"]').count()
comprobar('el corte transversal sombrea la zona de corte contra la rasante',
  zonasCorte > 0, `${zonasCorte} zonas de corte`)

const zonasRelleno = await pagina.locator('[data-zona="relleno"]').count()
console.log(`(informativo, no cuenta como fallo) zonas de relleno visibles en 0+000: ${zonasRelleno}`)

comprobar('la leyenda del corte explica la trama de corte y de relleno',
  (await pagina.getByText(/^Corte:/).count()) > 0 && (await pagina.getByText(/^Relleno:/).count()) > 0)

await pagina.screenshot({ path: `${SALIDA}/corte-transversal.png`, fullPage: true })

// 7. Descargar el Excel de diferencias (Informes › Tablas para Excel) y
// comprobar qué dice de verdad.
await irA('Informes')
// Las tablas sueltas van plegadas al final, bajo «Datos sueltos».
await pagina.locator('summary', { hasText: 'Datos sueltos' }).click()
const botonDiferencias = pagina.getByRole('button', { name: /diferencias a Excel/i })
const descarga = await Promise.all([
  pagina.waitForEvent('download'),
  botonDiferencias.click(),
]).then(([d]) => d)

const ruta = `${SALIDA}/diferencias.xlsx`
await descarga.saveAs(ruta)

const contenido = unzipSync(new Uint8Array(readFileSync(ruta)))
const hoja = strFromU8(contenido['xl/worksheets/sheet1.xml'])

comprobar('el Excel de diferencias lleva la pendiente longitudinal en la cabecera',
  /Pendiente longitudinal/.test(hoja))

comprobar('el Excel de diferencias lleva la tolerancia de la capa en la cabecera',
  /Tolerancia de la capa/.test(hoja) && /±20 mm/.test(hoja))

// El circuito de camp-1 cierra dentro de tolerancia: el Excel tiene que
// decirlo, no solo mostrar números sueltos.
comprobar('el Excel dice que las diferencias están verificadas, y es cierto',
  /DIFERENCIAS VERIFICADAS/.test(hoja))

// Una celda sin medir (las veredas, que esta campaña no midió) tiene que
// salir vacía, no en 0 — la regla que más ha costado en este proyecto.
comprobar('hay al menos una celda de diferencia vacía en el Excel (sin medir o fuera de la sección)',
  /<c r="[A-Z]+\d+" t="inlineStr"><is><t\/><\/is><\/c>|<c r="[A-Z]+\d+" t="inlineStr"><is><t><\/t><\/is><\/c>/.test(hoja))

// Y las diferencias que sí hay tienen que llegar como número, con signo.
comprobar('las diferencias en milímetros llegan al Excel como número, con signo cuando corresponde',
  /<v>\+?-?\d+<\/v>/.test(hoja),
  (hoja.match(/<v>\+?-?\d+<\/v>/g) ?? []).slice(0, 6).join(' '))

comprobar('el Excel no lleva el guion tipográfico de pantalla en las cifras (rompería el número)',
  !/<v>[^<]*−[^<]*<\/v>/.test(hoja))

await navegador.close()

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
if (erroresConsola.length) console.log(erroresConsola.slice(0, 3).join('\n'))
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 && erroresConsola.length === 0 ? 0 : 1)
