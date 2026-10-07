import { chromium } from 'playwright'
import { unzipSync, strFromU8 } from 'fflate'
import { readFileSync, mkdirSync } from 'node:fs'

/**
 * El recorrido de punta a punta sobre el proyecto de ejemplo con que arranca
 * la app (Av. Sol, SUBRASANTE y BASE), por la navegación de la ola 2:
 * Obra › Calles (sección y bancos de nivel), Calle › Medir y Revisar,
 * Informes (tablas para Excel) y el menú Archivo.
 *
 * Uso: node verificacion/recorrido.mjs <carpeta-de-salida>
 * La URL sale de BASE (por defecto http://localhost:4173/).
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } })
const pagina = await contexto.newPage()

const erroresConsola = []
pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(m.text()) })
pagina.on('pageerror', (e) => erroresConsola.push('pageerror: ' + e.message))

// Con el servidor de desarrollo, 'networkidle' no llega nunca: se espera a 'load'.
await pagina.goto(BASE, { waitUntil: 'load', timeout: 120000 })

// Atajos de la navegación nueva: la barra de espacios y las sub-barras.
const espacios = pagina.getByRole('navigation', { name: 'Espacios' })
async function irA(espacio) {
  await espacios.getByRole('button', { name: espacio, exact: true }).click()
}
async function irAModo(modo) {
  await irA('Calle')
  await pagina.getByRole('navigation', { name: 'Modos de la calle' }).getByRole('button', { name: modo, exact: true }).click()
  await pagina.getByRole('heading', { name: modo, exact: true, level: 2 }).waitFor({ timeout: 10000 })
}
async function irAObraCalles() {
  await irA('Obra')
  await pagina.getByRole('navigation', { name: 'Pantallas de la obra' }).getByRole('button', { name: 'Calles', exact: true }).click()
}
/** Abre un apartado plegable de Obra › Calles si está cerrado (se pliegan al salir de Obra). */
async function abrirApartado(nombre) {
  const boton = pagina.getByRole('button', { name: nombre, exact: true })
  if ((await boton.getAttribute('aria-expanded')) !== 'true') await boton.click()
}
/** El corte nombra cada punto dibujado con su cota: «0+000 Eje · cota 3244.597 m». */
async function cotaEnElCorte(progresiva, punto) {
  const nombre = `${progresiva} ${punto} · cota`
  return pagina
    .getByRole('img', { name: /Corte transversal/ })
    .locator(`circle[aria-label^="${nombre}"]`)
    .first()
    .getAttribute('aria-label')
    .catch(() => null)
}

// 1. La app arranca y muestra la navegación: Obra · Calle · Informes.
const botonesEspacio = (await espacios.getByRole('button').allTextContents()).map((t) => t.trim())
comprobar('la app arranca y muestra la navegación',
  ['Obra', 'Calle', 'Informes'].every((n) => botonesEspacio.includes(n)), botonesEspacio.join(' · '))

// 2. RIESGO ABIERTO: el foco al reordenar la sección por distancia.
// La sección vive en Obra › Calles, en el panel de la calle (el apartado
// «Sección» viene plegado y se abre), y es esa lista la que se reordena sola.
await irAObraCalles()
await abrirApartado('Sección')
const distanciaVereda = pagina.getByLabel('Distancia al eje de Vereda izquierda')
await distanciaVereda.click()
await distanciaVereda.fill('')
await distanciaVereda.type('10', { delay: 40 })
// Aquí el campo cierra el cambio, y la vereda izquierda salta a ser el punto
// más a la derecha de la lista: es el momento en que el foco se puede perder.
await distanciaVereda.press('Enter')
const foco = await pagina.evaluate(() => document.activeElement?.getAttribute('aria-label'))
const valorTrasEscribir = await distanciaVereda.inputValue()
comprobar('el foco se mantiene al reordenar la sección en un navegador real',
  foco === 'Distancia al eje de Vereda izquierda', `foco en "${foco}", valor "${valorTrasEscribir}"`)

// Devolver la sección a su estado: Enter cierra el cambio.
await distanciaVereda.fill('-5.60')
await distanciaVereda.press('Enter')
await distanciaVereda.blur()

// 3. Corregir la cota de un BM recalcula. La cota se lee en el corte de
// Calle › Revisar, que nombra cada punto con su cota; el BM se corrige en
// Obra › Calles › Bancos de nivel.
await irAModo('Revisar')
const cotaAntes = await cotaEnElCorte('0+000', 'Eje')
await irAObraCalles()
await abrirApartado('Bancos de nivel')
const campoCota = pagina.getByLabel('Cota de BM-1')
await campoCota.fill('3245.280')
await campoCota.blur()
await irAModo('Revisar')
const cotaDespues = await cotaEnElCorte('0+000', 'Eje')
comprobar('corregir la cota del BM recalcula todo el proyecto',
  cotaAntes !== cotaDespues && /cota 3244\.697/.test(cotaDespues ?? ''),
  `${cotaAntes} -> ${cotaDespues}`)
await irAObraCalles()
await abrirApartado('Bancos de nivel')
await pagina.getByLabel('Cota de BM-1').fill('3245.180')
await pagina.getByLabel('Cota de BM-1').blur()

// 4. La libreta (Calle › Medir): escribir una lectura con Enter.
await irAModo('Medir')
const llenasAntes = await pagina.getByText(/llenadas \d+ de \d+/).textContent()
const campoLectura = pagina.getByLabel('Lectura de mira')
await campoLectura.click()
await campoLectura.type('2.100')
await campoLectura.press('Enter')
const llenasDespues = await pagina.getByText(/llenadas \d+ de \d+/).textContent()
comprobar('escribir una lectura y pulsar Enter la registra',
  llenasAntes !== llenasDespues, `${llenasAntes} -> ${llenasDespues}`)

// 5. El cierre en vivo da el veredicto, con su símbolo.
// El cierre en detalle va plegado al final de la ficha de Medir.
const plegableCierre = pagina.locator('summary', { hasText: 'Cierre del circuito' }).first()
if (!(await plegableCierre.evaluate((s) => s.parentElement.open))) await plegableCierre.click()
const barra = (await pagina.getByRole('region', { name: 'Cierre en vivo' }).innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
comprobar('el cierre en vivo da un veredicto con su símbolo',
  /^(✓ Cierra|✗ No cierra|△ Sin cerrar|✗ No se puede calcular)/.test(barra), barra.slice(0, 120))

await pagina.screenshot({ path: `${SALIDA}/libreta.png`, fullPage: true })

// 6. El corte transversal se dibuja en Medir.
const corte = pagina.getByRole('img', { name: /Corte transversal/ })
comprobar('el corte transversal se dibuja en la libreta', await corte.isVisible(),
  await corte.getAttribute('aria-label'))

// 7. Las flechas de la progresiva mueven el corte (en Revisar).
await irAModo('Revisar')
await pagina.getByRole('button', { name: /^0\+000 Eje:/ }).click()
await pagina.getByRole('button', { name: 'Progresiva siguiente', exact: true }).click()
const corteTras = await pagina.getByRole('img', { name: /Corte transversal/ }).getAttribute('aria-label')
comprobar('la flecha «Progresiva siguiente» mueve el corte de progresiva', /0\+0[24]0/.test(corteTras ?? ''), corteTras)

// 8. Una celda sin medir se enseña como tal, y el corte no se la inventa.
// En Revisar el mapa nombra cada celda con su estado; la vereda derecha no
// la midió nadie en el ejemplo.
const celdaSinMedir = pagina.getByRole('button', { name: /^0\+080 Vereda derecha/ })
const etiquetaSinMedir = await celdaSinMedir.getAttribute('aria-label')
await celdaSinMedir.click()
comprobar('una celda sin medir se anuncia como sin medir, no con un número',
  /sin medir$/.test(etiquetaSinMedir ?? ''), etiquetaSinMedir)

const puntosDelCorte = await pagina
  .getByRole('img', { name: /Corte transversal/ })
  .locator('circle[role="button"]')
  .evaluateAll((es) => es.map((e) => e.getAttribute('aria-label')))
comprobar('el corte no dibuja ningún punto para la celda sin medir',
  puntosDelCorte.length > 0 && !puntosDelCorte.some((n) => n?.includes('Vereda derecha')),
  puntosDelCorte.join(' | '))

// 8b. Volver a una progresiva medida devuelve el corte.
await pagina.getByRole('button', { name: /^0\+020 Eje:/ }).click()
const corteVuelta = await pagina.getByRole('img', { name: /Corte transversal/ }).getAttribute('aria-label')
comprobar('volver a una progresiva medida devuelve el corte', /0\+020/.test(corteVuelta ?? ''), corteVuelta)

await pagina.screenshot({ path: `${SALIDA}/resultados.png`, fullPage: true })

// 9. RIESGO ABIERTO: exportar a Excel y validar el archivo. Las tablas para
// Excel están ahora en Informes, plegadas al final bajo «Datos sueltos».
await irA('Informes')
await pagina.locator('summary', { hasText: 'Datos sueltos' }).click()
const descarga = await Promise.all([
  pagina.waitForEvent('download'),
  pagina.getByRole('button', { name: 'Exportar cotas a Excel' }).click(),
]).then(([d]) => d)
const rutaXlsx = `${SALIDA}/exportado.xlsx`
await descarga.saveAs(rutaXlsx)

const contenido = unzipSync(new Uint8Array(readFileSync(rutaXlsx)))
const partes = Object.keys(contenido).sort()
comprobar('el .xlsx descargado trae las cinco partes del formato',
  partes.length === 5 && partes.includes('xl/worksheets/sheet1.xml'), partes.join(', '))

const hoja = strFromU8(contenido['xl/worksheets/sheet1.xml'])
comprobar('la hoja contiene las cotas como número',
  /<c r="[A-Z]+\d+"><v>3244\.\d{3}<\/v><\/c>/.test(hoja),
  (hoja.match(/<c r="[A-Z]+2"[^>]*>.{0,40}/g) ?? []).slice(0, 3).join(' | '))

// 10. Descargar el .topo desde el menú Archivo.
await pagina.getByRole('button', { name: 'Archivo', exact: true }).click()
const descargaTopo = await Promise.all([
  pagina.waitForEvent('download'),
  pagina.getByRole('group', { name: 'Archivo del proyecto' }).getByRole('button', { name: 'Guardar', exact: true }).click(),
]).then(([d]) => d)
const rutaTopo = `${SALIDA}/proyecto.topo`
await descargaTopo.saveAs(rutaTopo)
const contenidoTopo = unzipSync(new Uint8Array(readFileSync(rutaTopo)))
const proyecto = JSON.parse(strFromU8(contenidoTopo['proyecto.json']))
// Las tomas cuelgan de la nivelación de su calle.
const tomas = proyecto.calles.flatMap((calle) => calle.nivelaciones.flatMap((n) => n.tomas))
comprobar('el .topo guarda el proyecto con sus lecturas',
  tomas.length > 0 && tomas[0].estaciones[0].intermedias.length >= 2,
  `${tomas.length} tomas, ${tomas[0]?.estaciones.length} estaciones, ${proyecto.meta.nombre}`)
await pagina.keyboard.press('Escape')

// 11. Modo oscuro: el botón de tema pasa de «Sistema» a «Oscuro». Vive dentro del menú Archivo.
await pagina.getByRole('banner').getByRole('button', { name: 'Archivo', exact: true }).click()
const botonTema = pagina.getByRole('button', { name: 'Cambiar tema' })
const temaInicial = await botonTema.textContent()
await botonTema.click()
const oscuroActivo = await pagina.evaluate(() => document.documentElement.classList.contains('dark'))
comprobar('el botón de tema activa el modo oscuro', oscuroActivo,
  `${temaInicial} -> ${await botonTema.textContent()}`)
await pagina.keyboard.press('Escape')
await pagina.screenshot({ path: `${SALIDA}/oscuro.png`, fullPage: true })

// 12. Sin errores de consola.
comprobar('la app no produce errores en la consola del navegador',
  erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

await navegador.close()

const fallos = resultados.filter((r) => !r.ok)
console.log(`\n=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 ? 0 : 1)
