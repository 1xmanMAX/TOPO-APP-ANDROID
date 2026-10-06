import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Abre la obra simulada de la ola 3 (verificacion/datos/obra-simulada.topo)
 * en un navegador real, por el mismo campo por el que Max abre su archivo,
 * y comprueba que llegan las tres calles y los dos planos sin un error en la
 * consola. Es también el ejemplo de cómo la abren los demás guiones:
 *
 *   const ESPERADO = JSON.parse(readFileSync(new URL('./datos/obra-simulada.esperado.json', import.meta.url), 'utf8'))
 *   await pagina.locator(ESPERADO.archivo.selectorAbrir).setInputFiles(fileURLToPath(new URL(ESPERADO.archivo.rutaDesdeGuion, import.meta.url)))
 *
 * Uso: node verificacion/obra-simulada.mjs <carpeta-de-salida>
 * La URL sale de BASE (por defecto http://localhost:4173/).
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })

const ESPERADO = JSON.parse(readFileSync(new URL('./datos/obra-simulada.esperado.json', import.meta.url), 'utf8'))
const TOPO = fileURLToPath(new URL(ESPERADO.archivo.rutaDesdeGuion, import.meta.url))

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

const navegador = await chromium.launch()
const erroresConsola = []

/** Abre la obra en una página nueva del tamaño pedido y la deja en Obra › Calles. */
async function abrirObra(ancho, alto) {
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } })
  pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(`${ancho}px: ${m.text()}`) })
  pagina.on('pageerror', (e) => erroresConsola.push(`${ancho}px pageerror: ${e.message}`))
  // Con `vite` de desarrollo la red nunca queda quieta (la conexión de
  // recarga en caliente sigue abierta): basta con la carga y con que el
  // campo de abrir exista.
  await pagina.goto(BASE, { waitUntil: 'load' })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).waitFor({ state: 'attached', timeout: 30000 })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).setInputFiles(TOPO)
  await pagina.getByText(ESPERADO.nombresDeCalles[0], { exact: true }).first().waitFor({ timeout: 10000 })
  return pagina
}

// ---------------------------------------------------------------------------
// 1. Laptop (1280×800): las tres calles en Obra › Calles
// ---------------------------------------------------------------------------

const pagina = await abrirObra(1280, 800)

for (const nombre of ESPERADO.nombresDeCalles) {
  const visible = await pagina.getByText(nombre, { exact: true }).first().isVisible()
  comprobar(`la calle «${nombre}» aparece en Obra › Calles`, visible)
}

const cabecera = await pagina.getByRole('banner').innerText()
comprobar('la barra de arriba dice el nombre de la obra abierta', cabecera.includes(ESPERADO.obra.nombre), cabecera.split('\n')[0])

await pagina.screenshot({ path: `${SALIDA}/obra-simulada-calles-1280.png`, fullPage: true })

// ---------------------------------------------------------------------------
// 2. Obra › Plano: los dos planos y sus pistas
// ---------------------------------------------------------------------------

await pagina.getByRole('navigation', { name: 'Pantallas de la obra' }).getByRole('button', { name: 'Plano', exact: true }).click()
const selector = pagina.getByLabel('Plano a la vista')
await selector.waitFor({ timeout: 10000 })
const opciones = await selector.locator('option').allInnerTexts()
for (const plano of ESPERADO.planos) {
  comprobar(`el plano «${plano.nombre}» está en la lista`, opciones.some((o) => o.includes(plano.nombre)), opciones.join(' | '))
}
comprobar('son dos planos, ni uno más', opciones.length === ESPERADO.planos.length, `${opciones.length}`)

// El primero a la vista es el DXF: su pista de Las Lomas tiene que estar dibujada y nombrada.
const pistaDxf = ESPERADO.pistas.find((p) => p.origen === 'dxf')
await pagina.getByText(pistaDxf.nombre, { exact: true }).first().waitFor({ timeout: 10000 }).catch(() => {})
comprobar(`la pista «${pistaDxf.nombre}» del DXF aparece sobre su plano`,
  (await pagina.getByText(pistaDxf.nombre, { exact: true }).count()) > 0)
await pagina.screenshot({ path: `${SALIDA}/obra-simulada-plano-dxf.png`, fullPage: true })

// El PDF: se pinta (es asíncrono) y trae la pista dibujada a mano.
const planoPdf = ESPERADO.planos.find((p) => p.formato === 'pdf')
await selector.selectOption(planoPdf.id)
const pistaCroquis = ESPERADO.pistas.find((p) => p.origen === 'croquis')
await pagina.getByText(pistaCroquis.nombre, { exact: true }).first().waitFor({ timeout: 15000 }).catch(() => {})
comprobar(`la pista de croquis «${pistaCroquis.nombre}» aparece sobre el PDF`,
  (await pagina.getByText(pistaCroquis.nombre, { exact: true }).count()) > 0)
const imagenPdf = pagina.locator('image, img').first()
await imagenPdf.waitFor({ timeout: 15000 }).catch(() => {})
comprobar('el PDF se pinta como imagen', (await pagina.locator('image, img').count()) > 0)
comprobar('el PDF se declara sin escala (no está calibrado)', (await pagina.getByText(/sin escala/i).count()) > 0)
await pagina.screenshot({ path: `${SALIDA}/obra-simulada-plano-pdf.png`, fullPage: true })

// ---------------------------------------------------------------------------
// 3. Celular (390×844): las tres calles y nada se desplaza a lo ancho
// ---------------------------------------------------------------------------

const celular = await abrirObra(390, 844)
for (const nombre of ESPERADO.nombresDeCalles) {
  comprobar(`en el celular, la calle «${nombre}» aparece`, await celular.getByText(nombre, { exact: true }).first().isVisible())
}
const ancho = await celular.evaluate(() => {
    // El contenido se desplaza dentro de <main class="overflow-auto">: si se
    // sale a lo ancho, el documento sigue midiendo lo mismo. Se suma lo que
    // main se desplaza de lado.
    const main = document.querySelector('main')
    const deMain = main ? Math.max(0, main.scrollWidth - main.clientWidth) : 0
    return Math.max(document.documentElement.scrollWidth, window.innerWidth + deMain)
  })
comprobar('en el celular la página no se desplaza a lo ancho', ancho <= 390, `scrollWidth ${ancho}`)
await celular.screenshot({ path: `${SALIDA}/obra-simulada-calles-390.png`, fullPage: true })

await navegador.close()

comprobar('sin errores en la consola del navegador', erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 ? 0 : 1)
