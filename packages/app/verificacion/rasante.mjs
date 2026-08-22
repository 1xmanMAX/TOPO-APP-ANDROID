import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'

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

// 1. Definir la rasante de la calle desde la interfaz, con el flujo real.
//
// Cota de arranque 3244.85. Con el paquete de capas del proyecto de ejemplo
// completo (SUBRASANTE, con BASE 0.20 m y CARPETA 0.05 m encima — 0.25 m en
// total), esta cota hace que las tres celdas que mide la campaña activa
// (0+000 BOR-I, 0+000 EJE, 0+020 EJE) caigan una en cada clase de estado
// —conforme, al límite y fuera—, que es lo que hace útil la comprobación.
// (Antes de completar el paquete de capas, este mismo efecto salía con
// 3244.60; con las capas completas la cota teórica de SUBRASANTE resta
// 0.25 m más, así que la cota de arranque sube esos mismos 0.25 m.)
await pagina.getByRole('button', { name: 'Calle' }).click()
await pagina.getByRole('button', { name: /definir la rasante/i }).first().click()
const cota = pagina.getByLabel('Cota de arranque')
await cota.click()
await cota.fill('3244.85')
await cota.blur()
await pagina.waitForTimeout(200)

await pagina.screenshot({ path: `${SALIDA}/rasante-definida.png`, fullPage: true })

// 2. Comprobar que el corte tipo se dibuja mientras se define: un quiebre
// por cada tramo, con su nombre accesible ("Quiebre a X m del eje: ...").
const quiebres = await pagina.getByLabel(/^Quiebre a [\d.]+ m del eje/i).count()
comprobar('el corte tipo dibuja los quiebres de la sección al escribir la cota de arranque',
  quiebres > 0, `${quiebres} quiebres`)

// 3. Ir a Resultados.
await pagina.getByRole('button', { name: 'Resultados' }).click()
await pagina.waitForTimeout(200)

// 4. La tabla de diferencias muestra milímetros con signo, qué hacer y el
// estado — los tres datos que antes solo llevaba el color.
const encabezadoDiferencias = pagina.getByRole('heading', { name: /^Diferencias/ })
comprobar('la sección de diferencias aparece con su encabezado',
  await encabezadoDiferencias.count() > 0)

const etiquetaEje = await pagina.getByLabel(/0\+000 EJE: [+\-−]?\d+ mm/).first().getAttribute('aria-label')
comprobar('la celda 0+000 EJE de la tabla lleva milímetros con signo, verbo y estado',
  /mm/.test(etiquetaEje ?? '') && /(cortar|rellenar)/.test(etiquetaEje ?? ''), etiquetaEje ?? '(no encontrada)')

// Con la cota de arranque elegida, las tres clases de estado deben
// aparecer a la vez: conforme (0+020 EJE), al límite (0+000 EJE) y fuera
// (0+000 BOR-I). Que salgan las tres es justo lo que hace útil esta
// comprobación: no basta con ver un semáforo en un solo color. (El texto
// de cada estado termina la etiqueta, así que "$" evita que "al límite de
// tolerancia" o "fuera de tolerancia" cuenten como "conforme".)
comprobar('aparece al menos una celda conforme',
  (await pagina.getByLabel(/, conforme$/).count()) > 0)
comprobar('aparece al menos una celda al límite de tolerancia',
  (await pagina.getByLabel(/al límite de tolerancia$/).count()) > 0)
comprobar('aparece al menos una celda fuera de tolerancia',
  (await pagina.getByLabel(/fuera de tolerancia$/).count()) > 0)

// 5. El mapa de la calle colorea las celdas — el color nunca es la única
// pista (cada celda también lleva símbolo y texto), pero tiene que estar.
// La misma celda tiene la misma etiqueta accesible en la tabla de arriba y
// en el mapa (a propósito, ver `estadoRasante.ts`), así que hay que acotar
// la búsqueda a la sección del mapa: si no, `getByLabel` encontraría antes
// la fila de la tabla.
const seccionMapa = pagina.locator('section', {
  has: pagina.getByRole('heading', { name: 'Mapa de la calle' }),
})
await seccionMapa.scrollIntoViewIfNeeded()

const celdaMapaConforme = seccionMapa.getByLabel(/, conforme$/).first()
const claseConforme = await celdaMapaConforme.getAttribute('class').catch(() => null)
comprobar('el mapa pinta la celda conforme con su color (verde)',
  /bg-pasa/.test(claseConforme ?? ''), claseConforme ?? '(no encontrada)')

const celdaMapaFuera = seccionMapa.getByLabel(/fuera de tolerancia$/).first()
const claseFuera = await celdaMapaFuera.getAttribute('class').catch(() => null)
comprobar('el mapa pinta la celda fuera de tolerancia con su color (rojo)',
  /bg-falla/.test(claseFuera ?? ''), claseFuera ?? '(no encontrada)')

comprobar('el mapa lleva su leyenda de colores',
  (await pagina.getByLabel('Qué significa cada color del mapa').count()) > 0)

await pagina.screenshot({ path: `${SALIDA}/mapa-estado.png`, fullPage: true })

// 6. El corte transversal sombrea contra la rasante.
//
// OJO: con los tres puntos medidos en 0+000 (BOR-I y EJE, los únicos que
// mide esta campaña ahí), los dos caen del mismo lado de la rasante con la
// cota elegida arriba —los dos con exceso de material, "cortar"— así que
// en este proyecto de ejemplo solo aparece sombreado de CORTE en 0+000, no
// de relleno: con solo dos puntos medidos y tan cerca en cota, no hay una
// cota de arranque que a la vez reparta las tres clases de tolerancia
// arriba Y cruce de corte a relleno entre esos dos puntos. La leyenda,
// que no depende de los datos, sí muestra las dos entradas.
const zonasCorte = await pagina.locator('[data-zona="corte"]').count()
comprobar('el corte transversal sombrea la zona de corte contra la rasante',
  zonasCorte > 0, `${zonasCorte} zonas de corte`)

const zonasRelleno = await pagina.locator('[data-zona="relleno"]').count()
console.log(`(informativo, no cuenta como fallo) zonas de relleno visibles en 0+000: ${zonasRelleno}`)

comprobar('la leyenda del corte explica la trama de corte y de relleno',
  (await pagina.getByText(/^Corte:/).count()) > 0 && (await pagina.getByText(/^Relleno:/).count()) > 0)

await pagina.screenshot({ path: `${SALIDA}/corte-transversal.png`, fullPage: true })

// 7. Descargar el Excel de diferencias y comprobar qué dice de verdad.
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

// Una progresiva sin rasante definida ahí (SAR-I, VER-I, SAR-D, VER-D: la
// sección solo llega hasta el borde de calzada, 4.20 m) tiene que salir
// vacía, no en 0 — la regla que más ha costado en este proyecto.
comprobar('hay al menos una celda de diferencia vacía en el Excel (fuera de la sección definida)',
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
