import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Obra › Plano en un navegador real, con la obra simulada de la ola 3:
 *
 * - importar los dos planos de muestra (el DXF y el PDF) por el selector de
 *   archivo, además de los dos que ya trae la obra, y que se pinten de verdad
 *   (se cuentan los píxeles con tinta del visor, no basta con que exista);
 * - acercar, alejar, girar la rueda, arrastrar y volver a encuadrar;
 * - ocultar una capa del DXF y ver que se deja de dibujar;
 * - calibrar el PDF con la barra de escala de 20 m que trae dibujada;
 * - dibujar una pista en croquis con toques y crear su calle;
 * - ver las pendientes por tramo redondeadas al centésimo (las de Las Lomas
 *   salen de las cotas del DXF);
 * - tocar una pista en el plano abre su ficha (tramo, largo y estacas
 *   contra el ESPERADO) y la ficha lleva a sus cálculos;
 * - tomar la rasante de las cotas del plano: sin quiebres va de la primera a
 *   la última cota, dice cuánto se aparta cada una y lo que cambia la cota
 *   de proyecto; luego se lee en la calle;
 * - la ficha de Jr. Lima dice su subrasante sin cerrar con «·» y «no
 *   comprobada», nunca con △;
 * - convertir un eje del DXF en calle;
 * - la cota final del croquis y la rasante de su calle, comparadas con el
 *   número (3250.000 − 2.5 % del largo), no solo con el formato.
 *
 * Todo en laptop (1280×800) y en celular (390×844): en el celular, además,
 * que la página no se desplace a lo ancho y que los botones midan ≥ 44 px.
 *
 * Uso: node verificacion/plano.mjs <carpeta-de-salida>
 * La URL sale de BASE (por defecto http://localhost:4173/).
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })

const ESPERADO = JSON.parse(readFileSync(new URL('./datos/obra-simulada.esperado.json', import.meta.url), 'utf8'))
const TOPO = fileURLToPath(new URL(ESPERADO.archivo.rutaDesdeGuion, import.meta.url))
const DXF = fileURLToPath(new URL('../src/pruebas/muestras/expediente-pistas.dxf', import.meta.url))
const PDF = fileURLToPath(new URL('../src/pruebas/muestras/plano-expediente.pdf', import.meta.url))
const BARRA = ESPERADO.planos.find((p) => p.formato === 'pdf').barraDeEscala
const PISTA_DXF = ESPERADO.pistas.find((p) => p.origen === 'dxf')

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

const navegador = await chromium.launch()
const erroresConsola = []

/** «+7.37 %»: el formato del motor, con signo y dos decimales. */
const PENDIENTE = /[+-]\d+\.\d{2} %|0\.00 %/g

/** Pendiente esperada de un tramo, en %, desde dos cotas. */
function pendiente(a, b) {
  return ((b.cota - a.cota) / (b.progresiva - a.progresiva)) * 100
}

/** Lo mismo que formatearPendiente del motor, para comparar el texto. */
function textoPendiente(p) {
  const c = Math.round(Number((p * 100).toPrecision(12)))
  return c === 0 ? '0.00 %' : `${c > 0 ? '+' : '-'}${(Math.abs(c) / 100).toFixed(2)} %`
}

async function abrirObra(ancho, alto) {
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } })
  pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(`${ancho}px: ${m.text()}`) })
  pagina.on('pageerror', (e) => erroresConsola.push(`${ancho}px pageerror: ${e.message}`))
  await pagina.goto(BASE, { waitUntil: 'load' })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).waitFor({ state: 'attached', timeout: 30000 })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).setInputFiles(TOPO)
  await pagina.getByText(ESPERADO.nombresDeCalles[0], { exact: true }).first().waitFor({ timeout: 10000 })
  return pagina
}

/** Píxeles del visor que no son blancos, sin los botones de zoom encima. */
async function tintaDelVisor(pagina, { soloMarco = false } = {}) {
  const visor = pagina.getByRole('application', { name: 'Visor del plano' })
  const estilo = [
    '[aria-label="Visor del plano"] ~ div { visibility: hidden !important; }',
    soloMarco ? '[aria-label="Visor del plano"] > * { visibility: hidden !important; }' : '',
  ].join('\n')
  const png = await visor.screenshot({ style: estilo })
  return pagina.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob()
    const imagen = await createImageBitmap(blob)
    const lienzo = new OffscreenCanvas(imagen.width, imagen.height)
    const ctx = lienzo.getContext('2d')
    ctx.drawImage(imagen, 0, 0)
    const d = ctx.getImageData(0, 0, imagen.width, imagen.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) n++
    return { n, total: imagen.width * imagen.height }
  }, png.toString('base64'))
}

/** El viewBox del visor: x, y, ancho, alto. */
async function caja(pagina) {
  const vb = await pagina.getByRole('application', { name: 'Visor del plano' }).getAttribute('viewBox')
  const [x, y, ancho, alto] = vb.split(/\s+/).map(Number)
  return { x, y, ancho, alto }
}

/** Un punto del plano (Y hacia arriba) a coordenadas de la ventana. */
async function aPantalla(pagina, x, y) {
  return pagina.getByRole('application', { name: 'Visor del plano' }).evaluate((svg, [px, py]) => {
    const p = svg.createSVGPoint()
    p.x = px
    p.y = -py
    const q = p.matrixTransform(svg.getScreenCTM())
    return { x: q.x, y: q.y }
  }, [x, y])
}

/** El punto medio del primer segmento visible de una pista, en la ventana. */
async function puntoDePista(pagina, nombre) {
  return pagina.evaluate((nombrePista) => {
    const grupos = [...document.querySelectorAll('[data-pista]')]
    const g = grupos.find((x) => x.querySelector('title')?.textContent === `Pista ${nombrePista}`)
    if (!g) return null
    const linea = g.querySelector('polyline')
    const largo = linea.getTotalLength()
    const p = linea.getPointAtLength(largo / 2)
    const q = new DOMPoint(p.x, p.y).matrixTransform(linea.getScreenCTM())
    return { x: q.x, y: q.y }
  }, nombre)
}

/** Espera a que el viewBox del visor deje de ser `antes` (tras la rueda, que lo cambia en el siguiente evento). */
async function esperarOtraCaja(pagina, antes) {
  await pagina.waitForFunction((vb) => document.querySelector('svg[aria-label="Visor del plano"]')?.getAttribute('viewBox') !== vb,
    `${antes.x} ${antes.y} ${antes.ancho} ${antes.alto}`, { timeout: 5000 }).catch(() => {})
}

/** Espera a que la página deje de moverse (el desplazamiento suave termina): el scrollY igual en 5 cuadros seguidos. */
async function esperarQuieta(pagina) {
  await pagina.waitForFunction(() => {
    const w = window
    if (w.__ultimoScroll === w.scrollY) w.__cuadrosQuieta = (w.__cuadrosQuieta ?? 0) + 1
    else w.__cuadrosQuieta = 0
    w.__ultimoScroll = w.scrollY
    return w.__cuadrosQuieta >= 5
  }, null, { polling: 'raf', timeout: 10000 }).catch(() => {})
}

/** Mm enteros, como los redondea la app. */
const aMm = (m) => Math.round(Number((m * 1000).toPrecision(12))) + 0
const textoMm = (mm) => `${mm > 0 ? '+' : ''}${mm} mm`
/** «2026-10-02» → «02/10/2026». */
const fechaDma = (iso) => iso.split('-').reverse().join('/')
/** Cota de la rasante de una sola pendiente en una progresiva (redondeada al mm, como cotaEjeRasante). */
const cotaRasante = (r, progresiva) => Math.round((r.cotaArranque + ((progresiva - r.progresivaArranque) * r.pendiente) / 100) * 1000) / 1000

async function mensaje(pagina) {
  return (await pagina.getByRole('status').filter({ hasText: /\S/ }).allInnerTexts()).join(' | ')
}

async function irAlPlano(pagina) {
  await pagina.getByRole('navigation', { name: 'Espacios' }).getByRole('button', { name: 'Obra', exact: true }).click()
  await pagina.getByRole('navigation', { name: 'Pantallas de la obra' }).getByRole('button', { name: 'Plano', exact: true }).click()
  await pagina.getByRole('heading', { name: 'Plano de obra' }).waitFor({ timeout: 10000 })
}

async function sinDesplazamientoLateral(pagina, ancho, cuando) {
  if (ancho > 500) return
  const w = await pagina.evaluate(() => {
    // El contenido se desplaza dentro de <main class="overflow-auto">: si se
    // sale a lo ancho, el documento sigue midiendo lo mismo. Se suma lo que
    // main se desplaza de lado.
    const main = document.querySelector('main')
    const deMain = main ? Math.max(0, main.scrollWidth - main.clientWidth) : 0
    return Math.max(document.documentElement.scrollWidth, window.innerWidth + deMain)
  })
  comprobar(`[${ancho}] ${cuando}: la página no se desplaza a lo ancho`, w <= ancho, `scrollWidth ${w}`)
}

/** Botones visibles de la pantalla del plano que miden menos de 44 px de alto o de ancho. */
async function botonesChicos(pagina) {
  return pagina.locator('section[aria-labelledby]').first().evaluate((s) =>
    [...s.querySelectorAll('button, select, label:has(> input[type="file"])')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ t: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 30), r: b.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 43.5 || r.width < 43.5)
      .map(({ t, r }) => `${t} ${Math.round(r.width)}×${Math.round(r.height)}`),
  )
}

async function recorrido(ancho, alto) {
  const pre = `[${ancho}]`
  const celular = ancho < 500
  const pagina = await abrirObra(ancho, alto)
  await irAlPlano(pagina)
  const selector = pagina.getByLabel('Plano a la vista')
  const opciones = async () => selector.locator('option').allInnerTexts()
  comprobar(`${pre} la obra trae sus dos planos`, (await opciones()).length === 2, (await opciones()).join(' | '))
  await sinDesplazamientoLateral(pagina, ancho, 'al entrar al plano')

  // ── 1. Tocar la pista del DXF abre su ficha, con pendientes redondeadas ──
  const visor = pagina.getByRole('application', { name: 'Visor del plano' })
  await visor.scrollIntoViewIfNeeded()
  await pagina.locator(`[data-pista] title`).first().waitFor({ state: 'attached', timeout: 10000 })
  const enPista = await puntoDePista(pagina, PISTA_DXF.nombre)
  comprobar(`${pre} la pista «${PISTA_DXF.nombre}» está dibujada en el visor`, enPista !== null)
  if (enPista) await pagina.mouse.click(enPista.x, enPista.y)
  const tituloFicha = pagina.getByRole('heading', { name: PISTA_DXF.nombre, exact: true, level: 3 })
  const fichaAbierta = await tituloFicha.waitFor({ timeout: 5000 }).then(() => true, () => false)
  comprobar(`${pre} tocar la pista en el plano abre su ficha`, fichaAbierta)
  if (celular) {
    await esperarQuieta(pagina)
    const r = await tituloFicha.boundingBox()
    comprobar(`${pre} en el celular la ficha se trae a la vista`, r !== null && r.y >= -1 && r.y < alto, r ? `y=${Math.round(r.y)}` : 'sin caja')
    comprobar(`${pre} el rótulo «elegida · ver ficha» aparece sobre el visor`, (await pagina.getByRole('button', { name: /elegida · ver ficha/ }).count()) === 1)
  }
  const cotas = ESPERADO.lasLomas.cotasDelPlano
  const esperadas = cotas.slice(1).map((c, i) => textoPendiente(pendiente(cotas[i], c)))
  const lista = pagina.getByRole('list', { name: 'Pendientes por tramo' })
  const textoLista = (await lista.count()) ? await lista.innerText() : ''
  const leidas = textoLista.match(PENDIENTE) ?? []
  comprobar(`${pre} la ficha da una pendiente por tramo, con dos decimales`, leidas.length === esperadas.length, leidas.join(' ; '))
  comprobar(`${pre} las pendientes son las de las cotas del DXF (${esperadas.join(', ')})`,
    esperadas.every((e, i) => leidas[i] === e), textoLista.replace(/\n/g, ' ; '))
  comprobar(`${pre} la ficha dice de dónde salen («Según las cotas del plano»)`, (await pagina.getByText('Según las cotas del plano').count()) > 0)
  comprobar(`${pre} los tramos empinados llevan △ y palabra`, /△ empinada/.test(textoLista) === pendiente(cotas[0], cotas[1]) >= 5, textoLista.slice(0, 80))

  // Tramo y largo: los números con que Max estaca. Si se rompe la escala o la progresiva de inicio, se nota aquí.
  const fichaLomas = pagina.getByRole('region', { name: PISTA_DXF.nombre, exact: true })
  const datosFicha = await fichaLomas.locator('dl').first().evaluate((dl) => {
    const salida = {}
    for (const dt of dl.querySelectorAll('dt')) salida[dt.textContent.trim()] = dt.nextElementSibling?.textContent.trim()
    return salida
  }).catch(() => ({}))
  const pistaLomas = ESPERADO.lasLomas.pista
  const prog = (m) => `${Math.floor(m / 1000)}+${String(Math.round(m % 1000)).padStart(3, '0')}`
  comprobar(`${pre} la ficha da el tramo ${prog(pistaLomas.desde)} → ${prog(pistaLomas.hasta)}`,
    datosFicha.Tramo === `${prog(pistaLomas.desde)} → ${prog(pistaLomas.hasta)}`, String(datosFicha.Tramo))
  comprobar(`${pre} la ficha da el largo ${PISTA_DXF.largoM.toFixed(3)} m`, datosFicha.Largo === `${PISTA_DXF.largoM.toFixed(3)} m`, String(datosFicha.Largo))
  const estacasDibujadas = await pagina.evaluate((nombrePista) => {
    const g = [...document.querySelectorAll('[data-pista]')].find((x) => x.querySelector('title')?.textContent === `Pista ${nombrePista}`)
    return g ? [...g.querySelectorAll('text')].map((t) => t.textContent.trim()).filter((t) => /^\d+\+\d{3}$/.test(t)) : []
  }, PISTA_DXF.nombre)
  const estacasEsperadas = []
  for (let p = pistaLomas.desde; p <= pistaLomas.hasta + 1e-9; p += 20) estacasEsperadas.push(prog(p))
  comprobar(`${pre} el plano dibuja las estacas ${estacasEsperadas[0]} … ${estacasEsperadas.at(-1)} cada 20 m`,
    JSON.stringify(estacasDibujadas) === JSON.stringify(estacasEsperadas), estacasDibujadas.join(' '))
  const capasLomas = await fichaLomas.innerText()
  comprobar(`${pre} Las Lomas, sin mediciones, lo dice en «Capas medidas»`, capasLomas.includes('Sin nivelaciones todavía.'))
  await pagina.screenshot({ path: `${SALIDA}/plano-${ancho}-1-ficha-pista.png`, fullPage: true })

  // ── 1b. Tomar la rasante de las cotas del plano ──
  // Sin quiebres (+7.37 % y +7.40 % se llevan menos de 0.5 %), la pendiente
  // va de la primera a la última cota; tomar solo el primer tramo dejaba
  // 20 mm de error en 0+120. Cada cota dice cuánto se aparta y la que pasa
  // de 5 mm se avisa.
  const primera = cotas[0]
  const ultima = cotas.at(-1)
  const nueva = { progresivaArranque: primera.progresiva, cotaArranque: primera.cota, pendiente: pendiente(primera, ultima) }
  const residuos = cotas.map((c) => ({ progresiva: c.progresiva, mm: aMm(c.cota - cotaRasante(nueva, c.progresiva)) }))
  const mayor = residuos.reduce((m, r) => (Math.abs(r.mm) > Math.abs(m.mm) ? r : m))
  const actual = ESPERADO.lasLomas.rasante
  const cambios = cotas.map((c) => ({ progresiva: c.progresiva, mm: aMm(cotaRasante(nueva, c.progresiva) - cotaRasante(actual, c.progresiva)) }))
  const mayorCambio = cambios.reduce((m, r) => (Math.abs(r.mm) > Math.abs(m.mm) ? r : m))
  const textoNueva = `${primera.cota.toFixed(3)} m en ${prog(primera.progresiva)}, ${textoPendiente(nueva.pendiente)}`
  await fichaLomas.getByRole('button', { name: 'Tomar la rasante de las cotas del plano' }).click()
  const tomar = pagina.getByRole('region', { name: 'Rasante desde las cotas del plano' })
  await tomar.waitFor({ timeout: 5000 })
  const textoTomar = await tomar.innerText()
  comprobar(`${pre} la rasante tomada va de la primera a la última cota: «${textoNueva}»`, textoTomar.includes(`Nueva: ${textoNueva}`), textoTomar.match(/Nueva: [^\n]*/)?.[0] ?? '')
  const filas = await tomar.getByRole('listitem').allInnerTexts()
  comprobar(`${pre} cada cota dice cuánto se aparta de la nueva (${residuos.map((r) => textoMm(r.mm)).join(', ')})`,
    filas.length === residuos.length && residuos.every((r, i) => filas[i].includes(`${textoMm(r.mm)} de la nueva`) && filas[i].startsWith(prog(r.progresiva))),
    filas.join(' ; '))
  comprobar(`${pre} la cota que se aparta ${textoMm(mayor.mm)} (≥ 5 mm) lleva △ y se avisa`,
    Math.abs(mayor.mm) >= 5 && filas.some((f) => f.includes(`△ ${textoMm(mayor.mm)} de la nueva`)) && textoTomar.includes(`la de ${prog(mayor.progresiva)} queda a ${textoMm(mayor.mm)}`),
    textoTomar.replace(/\n/g, ' ; ').slice(0, 400))
  comprobar(`${pre} dice cuánto cambia la cota de proyecto contra la rasante de la calle: ${textoMm(mayorCambio.mm)} en ${prog(mayorCambio.progresiva)}`,
    textoTomar.includes(`cambia hasta ${textoMm(mayorCambio.mm)} (en ${prog(mayorCambio.progresiva)})`), textoTomar.match(/cambia hasta[^\n.]*/)?.[0] ?? '')
  await pagina.screenshot({ path: `${SALIDA}/plano-${ancho}-1b-tomar-rasante.png`, fullPage: true })
  await tomar.getByRole('button', { name: 'Sí, reemplazar la rasante' }).click()
  const mr = await mensaje(pagina)
  comprobar(`${pre} al reemplazar, el aviso lleva △ y la rasante «${textoNueva}», no la del primer tramo`,
    mr.includes(`△ Rasante tomada: ${textoNueva}.`) && !mr.includes('✓ Rasante tomada'), mr)

  await pagina.getByRole('button', { name: 'Abrir sus cálculos' }).click()
  const espacios = pagina.getByRole('navigation', { name: 'Espacios' })
  await pagina.getByRole('navigation', { name: 'Modos de la calle' }).waitFor({ timeout: 5000 }).catch(() => {})
  const calleActiva = await pagina.locator('select').filter({ has: pagina.locator('option', { hasText: PISTA_DXF.calle }) }).first()
    .evaluate((s) => s.options[s.selectedIndex]?.text).catch(() => null)
  comprobar(`${pre} «Abrir sus cálculos» lleva a la calle «${PISTA_DXF.calle}»`, calleActiva === PISTA_DXF.calle, String(calleActiva))
  comprobar(`${pre} …en el modo Revisar`,
    (await pagina.getByRole('navigation', { name: 'Modos de la calle' }).getByRole('button', { name: 'Revisar', exact: true }).getAttribute('aria-pressed')) === 'true')
  comprobar(`${pre} …y la barra de arriba marca Calle`,
    (await espacios.getByRole('button', { name: 'Calle', exact: true }).getAttribute('aria-pressed')) === 'true')
  await irAlPlano(pagina)

  // ── 1c. La pista de Jr. Lima: su subrasante no cerró (falta la vista al BM-2) ──
  // Lo calculado sobre ella no está comprobado, y se dice con «·» y con esas
  // palabras; el △ es «al límite» y aquí confundiría.
  const PISTA_CROQUIS = ESPERADO.pistas.find((p) => p.origen === 'croquis')
  const subLima = ESPERADO.jrLima.subrasante
  await pagina.getByRole('region', { name: 'Pistas de la obra' })
    .getByRole('button', { name: new RegExp(`^${PISTA_CROQUIS.nombre.replace(/[.()]/g, '\\$&')}`) }).click()
  const fichaLima = pagina.getByRole('region', { name: PISTA_CROQUIS.nombre, exact: true })
  await fichaLima.waitFor({ timeout: 5000 })
  const capasLima = fichaLima.getByRole('list', { name: 'Capas medidas' })
  const filasLima = (await capasLima.count()) ? await capasLima.getByRole('listitem').allInnerTexts() : []
  const filaSub = filasLima.find((f) => f.includes(`SUBRASANTE · ${fechaDma(subLima.fecha)}`)) ?? ''
  comprobar(`${pre} la ficha de «${PISTA_CROQUIS.nombre}» lista su subrasante del ${fechaDma(subLima.fecha)} (fecha dd/mm/aaaa)`,
    subLima.cierre.pasa === null && filaSub !== '', filasLima.join(' ; '))
  comprobar(`${pre} …sin cerrar, se dice «${ESPERADO.textos.noComprobado}…»`, new RegExp(ESPERADO.textos.noComprobado, 'i').test(filaSub), filaSub)
  comprobar(`${pre} …con el símbolo «·», no con △ (al límite) ni ✓`, filaSub.trim().startsWith('·') && !/[△✓✗]/.test(filaSub), filaSub)
  await pagina.screenshot({ path: `${SALIDA}/plano-${ancho}-1c-ficha-jr-lima.png`, fullPage: true })

  // ── 2. Importar el DXF ──
  await pagina.getByLabel('Importar plano (DXF o PDF)').setInputFiles(DXF)
  await pagina.waitForFunction(() => document.querySelectorAll('option').length > 0 &&
    [...document.querySelectorAll('label')].some((l) => l.textContent?.includes('Plano a la vista') && l.querySelectorAll('option').length === 3), null, { timeout: 15000 }).catch(() => {})
  const tras1 = await opciones()
  comprobar(`${pre} el DXF importado se suma a la lista (3 planos)`, tras1.length === 3, tras1.join(' | '))
  const elegido = await selector.evaluate((s) => s.options[s.selectedIndex]?.text)
  comprobar(`${pre} queda a la vista el plano recién importado`, /expediente-pistas.*DXF/.test(elegido ?? ''), elegido)
  comprobar(`${pre} el aviso dice «Plano importado»`, /Plano importado/.test(await mensaje(pagina)), await mensaje(pagina))
  const escalaDxf = await pagina.getByText(/^Escala: /).first().innerText().catch(() => '')
  comprobar(`${pre} el DXF llega calibrado a 1 m por unidad`, /= 1 m$/.test(escalaDxf), escalaDxf)
  await pagina.locator('svg[aria-label="Visor del plano"] g[aria-hidden="true"] polyline').first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => {})
  const marco = await tintaDelVisor(pagina, { soloMarco: true })
  const tintaDxf = await tintaDelVisor(pagina)
  comprobar(`${pre} el DXF se pinta (no queda en blanco)`, tintaDxf.n - marco.n > tintaDxf.total * 0.005,
    `${tintaDxf.n - marco.n} px con tinta de ${tintaDxf.total}`)
  await pagina.screenshot({ path: `${SALIDA}/plano-${ancho}-2-dxf-importado.png`, fullPage: true })

  // ── 3. Ocultar una capa ──
  const capas = pagina.getByRole('group', { name: 'Capas del plano' }).getByRole('checkbox')
  const nCapas = await capas.count()
  comprobar(`${pre} el panel de capas lista las capas del DXF`, nCapas > 0, `${nCapas} capas`)
  const dibujado = () => pagina.locator('svg[aria-label="Visor del plano"] g[aria-hidden="true"] > *').count()
  const antes = await dibujado()
  let oculta = null
  for (let i = 0; i < nCapas && oculta === null; i++) {
    const casilla = capas.nth(i)
    if (!(await casilla.isChecked())) continue
    await casilla.uncheck()
    const ahora = await dibujado()
    if (ahora < antes) {
      oculta = { i, nombre: (await casilla.locator('xpath=..').innerText()).trim(), ahora }
    } else {
      await casilla.check()
    }
  }
  comprobar(`${pre} ocultar una capa deja de dibujar lo suyo`, oculta !== null, oculta ? `«${oculta.nombre}»: ${antes} → ${oculta.ahora} elementos` : `${antes} elementos, ninguna capa los cambió`)
  if (oculta) {
    const tintaOculta = await tintaDelVisor(pagina)
    comprobar(`${pre} con la capa oculta hay menos tinta en el visor`, tintaOculta.n < tintaDxf.n, `${tintaDxf.n} → ${tintaOculta.n}`)
    await pagina.screenshot({ path: `${SALIDA}/plano-${ancho}-3-capa-oculta.png`, fullPage: true })
    await capas.nth(oculta.i).check()
    comprobar(`${pre} volver a marcarla la dibuja de nuevo`, (await dibujado()) === antes)
  }

  // ── 4. Zoom y desplazamiento ──
  await visor.scrollIntoViewIfNeeded()
  const inicial = await caja(pagina)
  await pagina.getByRole('button', { name: 'Acercar' }).click()
  const acercada = await caja(pagina)
  comprobar(`${pre} «Acercar» achica la vista 1.5 veces`, Math.abs(inicial.ancho / acercada.ancho - 1.5) < 0.01, `${inicial.ancho.toFixed(1)} → ${acercada.ancho.toFixed(1)}`)
  await pagina.getByRole('button', { name: 'Alejar' }).click()
  const alejada = await caja(pagina)
  comprobar(`${pre} «Alejar» la deja como estaba`, Math.abs(alejada.ancho - inicial.ancho) < inicial.ancho * 0.001)
  const rv = await visor.boundingBox()
  const centro = { x: rv.x + rv.width / 2, y: rv.y + rv.height / 2 }
  await pagina.mouse.move(centro.x, centro.y)
  await pagina.mouse.wheel(0, -400)
  await esperarOtraCaja(pagina, alejada)
  const conRueda = await caja(pagina)
  comprobar(`${pre} la rueda acerca`, conRueda.ancho < inicial.ancho * 0.8, `${inicial.ancho.toFixed(1)} → ${conRueda.ancho.toFixed(1)}`)
  await pagina.mouse.move(centro.x, centro.y)
  await pagina.mouse.down()
  await pagina.mouse.move(centro.x + 60, centro.y + 40, { steps: 6 })
  await pagina.mouse.up()
  const movida = await caja(pagina)
  const upp = conRueda.ancho / rv.width
  comprobar(`${pre} arrastrar mueve el plano con el dedo`,
    Math.abs((conRueda.x - movida.x) / upp - 60) < 8 && Math.abs((conRueda.y - movida.y) / upp - 40) < 8 && movida.ancho === conRueda.ancho,
    `Δx ${((conRueda.x - movida.x) / upp).toFixed(1)} px, Δy ${((conRueda.y - movida.y) / upp).toFixed(1)} px`)
  comprobar(`${pre} arrastrar no elige nada ni abre una ficha`, (await pagina.getByRole('heading', { name: /^Eje del plano/ }).count()) === 0)
  await pagina.screenshot({ path: `${SALIDA}/plano-${ancho}-4-zoom.png`, fullPage: true })
  await pagina.getByRole('button', { name: 'Encuadrar' }).click()
  const encuadrada = await caja(pagina)
  comprobar(`${pre} «Encuadrar» vuelve a la vista de todo el plano`,
    Math.abs(encuadrada.ancho - inicial.ancho) < inicial.ancho * 0.001 && Math.abs(encuadrada.x - inicial.x) < inicial.ancho * 0.001)

  // ── 5. Un eje del DXF se convierte en calle ──
  const ejes = pagina.getByRole('region', { name: 'Ejes del DXF' }).getByRole('button')
  const nEjes = await ejes.count()
  comprobar(`${pre} el DXF nuevo ofrece sus ejes sin calle`, nEjes >= ESPERADO.ejesDxfSinPista.length, `${nEjes} ejes`)
  let calleDelEje = null
  if (nEjes > 0) {
    await ejes.first().click()
    await pagina.getByRole('heading', { name: /^Eje del plano \d+/ }).waitFor({ timeout: 5000 })
    calleDelEje = (await pagina.getByLabel('Nombre de la calle').inputValue()).trim()
    comprobar(`${pre} la ficha del eje propone el nombre que trae el plano`, ESPERADO.ejesDxfSinPista.concat(PISTA_DXF.nombre).includes(calleDelEje), calleDelEje)
    calleDelEje = `${calleDelEje} (${ancho})`
    await pagina.getByLabel('Nombre de la calle').fill(calleDelEje)
    await pagina.getByRole('button', { name: 'Usar como eje de una calle' }).click()
    const m = await mensaje(pagina)
    comprobar(`${pre} «Usar como eje de una calle» crea la calle`, m.includes(`Calle «${calleDelEje}» creada con el eje del plano`), m)
    comprobar(`${pre} …y abre la ficha de su pista nueva`, (await pagina.getByRole('heading', { name: calleDelEje, exact: true, level: 3 }).count()) === 1)
    comprobar(`${pre} …que ya figura en la lista de pistas`,
      (await pagina.getByRole('region', { name: 'Pistas de la obra' }).getByRole('button', { name: new RegExp(`^${calleDelEje.replace(/[.()]/g, '\\$&')}`) }).count()) === 1)
    comprobar(`${pre} …y el eje ya no se ofrece como eje sin calle`, (await ejes.count()) === nEjes - 1)
  }
  await sinDesplazamientoLateral(pagina, ancho, 'con la ficha de un eje abierta')

  // ── 6. Importar el PDF y calibrarlo con la barra de escala ──
  await pagina.getByLabel('Importar plano (DXF o PDF)').setInputFiles(PDF)
  await pagina.waitForFunction(() =>
    [...document.querySelectorAll('label')].some((l) => l.textContent?.includes('Plano a la vista') && l.querySelectorAll('option').length === 4), null, { timeout: 15000 }).catch(() => {})
  const tras2 = await opciones()
  comprobar(`${pre} el PDF importado se suma a la lista (4 planos)`, tras2.length === 4, tras2.join(' | '))
  comprobar(`${pre} un PDF llega sin escala y lo dice`, (await pagina.getByText('△ Sin escala').count()) === 1)
  comprobar(`${pre} tras importar un PDF se pasa solo a «Calibrar escala»`,
    (await pagina.getByRole('button', { name: 'Calibrar escala' }).getAttribute('aria-pressed')) === 'true')
  await pagina.locator('svg[aria-label="Visor del plano"] image').waitFor({ state: 'attached', timeout: 20000 }).catch(() => {})
  // Se espera a que la imagen de la página esté decodificada y pintada (dos cuadros), no un tiempo fijo.
  await pagina.locator('svg[aria-label="Visor del plano"] image').first().evaluate(async (im) => {
    const img = new Image()
    img.src = im.getAttribute('href') ?? im.getAttribute('xlink:href') ?? ''
    await img.decode().catch(() => {})
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  }).catch(() => {})
  const tintaPdf = await tintaDelVisor(pagina)
  comprobar(`${pre} el PDF se pinta como imagen (no en blanco)`, tintaPdf.n - marco.n > tintaPdf.total * 0.005,
    `${tintaPdf.n - marco.n} px con tinta de ${tintaPdf.total}`)
  await pagina.screenshot({ path: `${SALIDA}/plano-${ancho}-5-pdf-importado.png`, fullPage: true })

  // Se arrastra el plano hasta dejar la barra en el centro y se acerca con la
  // rueda sobre ella, como haría Max, hasta que ocupe la mitad del visor.
  await visor.scrollIntoViewIfNeeded()
  const medioBarra = () => aPantalla(pagina, (BARRA.desde.x + BARRA.hasta.x) / 2, BARRA.desde.y)
  for (let i = 0; i < 12; i++) {
    const rvv = await visor.boundingBox()
    const centroVisor = { x: rvv.x + rvv.width / 2, y: rvv.y + rvv.height / 2 }
    const m2 = await medioBarra()
    // Un arrastre de menos de 6 px sería un toque, y en «Calibrar» pondría un punto.
    if (Math.hypot(m2.x - centroVisor.x, m2.y - centroVisor.y) > 20) {
      await pagina.mouse.move(m2.x, m2.y)
      await pagina.mouse.down()
      await pagina.mouse.move(centroVisor.x, centroVisor.y, { steps: 5 })
      await pagina.mouse.up()
    }
    const a0 = await aPantalla(pagina, BARRA.desde.x, BARRA.desde.y)
    const b0 = await aPantalla(pagina, BARRA.hasta.x, BARRA.hasta.y)
    if (b0.x - a0.x > rvv.width * 0.45) break
    const antesRueda = await caja(pagina)
    await pagina.mouse.wheel(0, -150)
    await esperarOtraCaja(pagina, antesRueda)
  }
  const a = await aPantalla(pagina, BARRA.desde.x, BARRA.desde.y)
  const b = await aPantalla(pagina, BARRA.hasta.x, BARRA.hasta.y)
  comprobar(`${pre} la barra de escala queda grande en pantalla para tocarla`, b.x - a.x > 150, `${Math.round(b.x - a.x)} px`)
  await pagina.mouse.click(a.x, a.y)
  await pagina.mouse.click(b.x, b.y)
  comprobar(`${pre} los dos puntos tocados se marcan`, (await pagina.getByText('Punto 2', { exact: true }).count()) === 1)
  await pagina.getByLabel('Distancia real').fill(String(BARRA.metros))
  await pagina.screenshot({ path: `${SALIDA}/plano-${ancho}-6-calibrando.png`, fullPage: true })
  await pagina.getByRole('button', { name: 'Fijar escala' }).click()
  const textoEsc = await pagina.getByText(/^Escala: 1 punto del PDF = /).first().innerText().catch(() => '')
  const mpu = Number(textoEsc.match(/= ([\d.]+) m/)?.[1])
  comprobar(`${pre} calibrar con la barra de ${BARRA.metros} m da ${BARRA.metrosPorUnidad} m por punto (±1 %)`,
    Math.abs(mpu / BARRA.metrosPorUnidad - 1) < 0.01, textoEsc)
  comprobar(`${pre} al fijar la escala vuelve a «Ver»`, (await pagina.getByRole('button', { name: 'Ver', exact: true }).getAttribute('aria-pressed')) === 'true')
  comprobar(`${pre} el aviso confirma la escala`, /✓ Escala fijada/.test(await mensaje(pagina)), await mensaje(pagina))

  // ── 7. Croquis de una pista nueva sobre el PDF ──
  await pagina.getByRole('button', { name: 'Encuadrar' }).click()
  await pagina.getByRole('button', { name: 'Dibujar croquis' }).click()
  await visor.scrollIntoViewIfNeeded()
  // Cada vértice se toca donde caiga en pantalla; se guarda también su punto
  // del plano, porque en el celular la página se mueve al tocar los botones.
  const enMundo = async (p) => visor.evaluate((svg, q) => {
    const w = new DOMPoint(q.x, q.y).matrixTransform(svg.getScreenCTM().inverse())
    return { x: w.x, y: w.y }
  }, p)
  const FRACCIONES = [[0.2, 0.7], [0.45, 0.55], [0.7, 0.45]]
  const tocarVertice = async ([fx, fy]) => {
    await visor.scrollIntoViewIfNeeded()
    const rc = await visor.boundingBox()
    const p = { x: rc.x + rc.width * fx, y: rc.y + rc.height * fy }
    await pagina.mouse.click(p.x, p.y)
    return enMundo(p)
  }
  const vertices = []
  for (const f of FRACCIONES) vertices.push(await tocarVertice(f))
  const contador = pagina.getByText(/^\d+ vértices?/)
  comprobar(`${pre} cada toque pone un vértice (3)`, /^3 vértices · [\d.]+ m$/.test(await contador.innerText()), await contador.innerText())
  await pagina.getByRole('button', { name: 'Deshacer' }).click()
  comprobar(`${pre} «Deshacer» quita el último`, /^2 vértices/.test(await contador.innerText()), await contador.innerText())
  vertices[2] = await tocarVertice(FRACCIONES[2])
  const largoCroquis = Number((await contador.innerText()).match(/· ([\d.]+) m/)?.[1])
  // Largo esperado: los tres toques pasados al plano con la escala recién fijada.
  let largoEsperado = 0
  for (let i = 1; i < vertices.length; i++) largoEsperado += Math.hypot(vertices[i].x - vertices[i - 1].x, vertices[i].y - vertices[i - 1].y) * mpu
  comprobar(`${pre} el largo del croquis sale de la escala fijada`, Math.abs(largoCroquis - largoEsperado) < 0.5, `${largoCroquis} m, se esperaba ≈ ${largoEsperado.toFixed(3)} m`)
  const calleCroquis = `Croquis prueba ${ancho}`
  await pagina.getByLabel('Nombre de la calle').fill(calleCroquis)
  await pagina.getByLabel('Cota de arranque').fill('3250.000')
  await pagina.getByLabel('Pendiente', { exact: true }).fill('-2.5')
  // La cota final se compara con el número: 3250.000 − 2.5 % del largo. Con
  // el signo cambiado saldría por encima de 3250 y fallaría.
  const resultadoCroquis = await pagina.locator('dl[aria-label="Resultado del croquis"] dd').allInnerTexts().catch(() => [])
  const cotaFinal = Number(resultadoCroquis[0]?.match(/^(\d{4}\.\d{3}) m$/)?.[1])
  const desnivel = Number(resultadoCroquis[1]?.match(/^([+\-−]?\d+\.\d{3}) m/)?.[1]?.replace('−', '-'))
  const finalEsperada = 3250 - 0.025 * largoCroquis
  // El largo en pantalla va redondeado: se deja medio milímetro de cota más lo que aporta su redondeo.
  comprobar(`${pre} la cota final del croquis es 3250.000 − 2.5 % × ${largoCroquis} m = ${finalEsperada.toFixed(3)} m`,
    Math.abs(cotaFinal - finalEsperada) <= 0.0015 && cotaFinal < 3250, resultadoCroquis.join(' ; '))
  comprobar(`${pre} …y con los toques del plano (≈ ${(3250 - 0.025 * largoEsperado).toFixed(3)} m, ±0.5 m de largo)`,
    Math.abs(cotaFinal - (3250 - 0.025 * largoEsperado)) <= 0.025 * 0.5 + 0.001)
  comprobar(`${pre} el desnivel del croquis es negativo: la calle baja`, desnivel < 0 && Math.abs(desnivel - (cotaFinal - 3250)) < 0.0015, resultadoCroquis[1] ?? '')
  await pagina.screenshot({ path: `${SALIDA}/plano-${ancho}-7-croquis.png`, fullPage: true })
  await pagina.getByRole('button', { name: 'Crear calle con este croquis' }).click()
  const mc = await mensaje(pagina)
  comprobar(`${pre} «Crear calle con este croquis» crea la calle con su rasante`,
    mc.includes(`Calle «${calleCroquis}» creada con el croquis`) && mc.includes('-2.50 %'), mc)
  const fichaCroquis = pagina.getByRole('heading', { name: calleCroquis, exact: true, level: 3 })
  comprobar(`${pre} la ficha de la pista nueva se abre sola`, (await fichaCroquis.count()) === 1)
  const listaC = pagina.getByRole('list', { name: 'Pendientes por tramo' })
  const textoC = (await listaC.count()) ? await listaC.innerText() : ''
  comprobar(`${pre} sus pendientes por tramo, redondeadas: «-2.50 % baja»`, /-2\.50 % baja/.test(textoC), textoC.replace(/\n/g, ' ; '))
  comprobar(`${pre} …según la rasante de la calle`, (await pagina.getByText('Según la rasante de la calle').count()) > 0)
  comprobar(`${pre} la pista nueva dibuja su rótulo de pendiente en el plano`,
    (await pagina.locator('svg[aria-label="Visor del plano"] text').filter({ hasText: '-2.50 %' }).count()) >= 1)
  await pagina.screenshot({ path: `${SALIDA}/plano-${ancho}-8-ficha-croquis.png`, fullPage: true })
  await sinDesplazamientoLateral(pagina, ancho, 'con la ficha del croquis')

  if (celular) {
    const chicos = await botonesChicos(pagina)
    comprobar(`${pre} todos los botones del plano miden ≥ 44 px`, chicos.length === 0, chicos.slice(0, 6).join(' ; '))
  }

  await pagina.getByRole('button', { name: 'Abrir sus cálculos' }).click()
  await pagina.getByRole('navigation', { name: 'Modos de la calle' }).waitFor({ timeout: 5000 }).catch(() => {})
  const activaC = await pagina.locator('select').filter({ has: pagina.locator('option', { hasText: calleCroquis }) }).first()
    .evaluate((s) => s.options[s.selectedIndex]?.text).catch(() => null)
  comprobar(`${pre} la calle del croquis existe y «Abrir sus cálculos» lleva a ella`, activaC === calleCroquis, String(activaC))
  await pagina.screenshot({ path: `${SALIDA}/plano-${ancho}-9-calle-del-croquis.png`, fullPage: true })

  // ── 8. Lo creado sigue ahí al volver: las calles nuevas están en Obra › Calles ──
  await pagina.getByRole('navigation', { name: 'Espacios' }).getByRole('button', { name: 'Obra', exact: true }).click()
  await pagina.getByRole('navigation', { name: 'Pantallas de la obra' }).getByRole('button', { name: 'Calles', exact: true }).click()
  for (const nombre of [calleCroquis, calleDelEje].filter(Boolean)) {
    comprobar(`${pre} la calle «${nombre}» aparece en Obra › Calles`, (await pagina.getByText(nombre, { exact: true }).count()) > 0)
  }
  // La rasante se lee en la calle misma, no en el aviso: cota en 0+000 y signo de la pendiente.
  const rasanteDeCalle = async (calle) => {
    const volver = pagina.getByRole('button', { name: /Volver a la obra/ })
    if (await volver.isVisible().catch(() => false)) await volver.click()
    await pagina.getByRole('button', { name: `Abrir ${calle}`, exact: true }).click()
    const panel = pagina.getByRole('region', { name: `Panel de ${calle}`, exact: true })
    await panel.waitFor({ timeout: 5000 })
    const boton = panel.getByRole('button', { name: 'Rasante', exact: true })
    const id = await boton.getAttribute('aria-describedby')
    return id ? (await pagina.locator(`[id="${id}"]`).innerText()).trim() : ''
  }
  const rCroquis = await rasanteDeCalle(calleCroquis)
  comprobar(`${pre} la calle del croquis guarda su rasante: 3250.000 en 0+000, −2.50 % (baja)`, /^3250\.000 en 0\+000 · [-−]2\.50 %/.test(rCroquis), rCroquis)
  const rLomas = await rasanteDeCalle(PISTA_DXF.calle)
  const esperadaLomas = `${primera.cota.toFixed(3)} en ${prog(primera.progresiva)} · ${textoPendiente(nueva.pendiente)}`
  comprobar(`${pre} Psje. Las Lomas quedó con la rasante tomada del plano: ${esperadaLomas}`, rLomas.startsWith(esperadaLomas), rLomas)
  await pagina.screenshot({ path: `${SALIDA}/plano-${ancho}-10-calles.png`, fullPage: true })
  await irAlPlano(pagina)
  comprobar(`${pre} al volver al plano siguen los 4 planos`, (await opciones()).length === 4)
  await pagina.close()
}

await recorrido(1280, 800)
await recorrido(390, 844)
await navegador.close()

comprobar('sin errores en la consola del navegador', erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 ? 0 : 1)
