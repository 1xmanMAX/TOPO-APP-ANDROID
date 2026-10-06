import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Recorrido «calle» de la ola 3: Calle › Medir / Revisar / Replantear sobre
 * la obra simulada (Av. Sol y Jr. Lima), en un navegador real, con los
 * números contra verificacion/datos/obra-simulada.esperado.json.
 *
 * - Medir: el aviso al anotar salta al instante con una lectura fuera de la
 *   mira (0.100, 4.900, 5.200); las de 0.10 y 4.90 escritas sin el tercer
 *   decimal avisan al anotarlas; una buena se anota con su diferencia y su
 *   acción; el cierre en vivo cambia mientras se escribe la vista adelante.
 * - Revisar: diferencia en mm con corta/rellena y semáforo con símbolo en las
 *   21 celdas de Av. Sol; el 0+080 Eje con ✗; Jr. Lima «no comprobado».
 * - Replantear: lectura objetivo = AI − cota de proyecto y la acción correcta
 *   para una lectura escrita, «De la libreta» y «Desde un BM» (oficial =
 *   comprobado; auxiliar = no comprobado).
 * - La AI con la que cuentan Medir y Replantear es la COMPENSADA cuando el
 *   circuito cerró (la misma que respalda las cotas de Revisar): se calcula
 *   aquí desde la AI de la libreta y el error de cierre de ESPERADO.
 * - El cierre en vivo de Jr. Lima: la lectura que cerraría en BM-2 contra
 *   AI − cota del BM, y el error y la tolerancia al escribirla.
 * - En el celular (390×844): nada se desplaza a lo ancho; botones y campos
 *   (también los de la barra superior) miden 44 px o más de alto Y de ancho;
 *   el mapa sin cerrar avisa «no comprobado» encima de la rejilla, y la
 *   leyenda del semáforo se ve entera.
 *
 * Uso: node verificacion/calle.mjs <carpeta-de-salida>
 * La URL sale de BASE (por defecto http://localhost:4173/).
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })

const ESPERADO = JSON.parse(readFileSync(new URL('./datos/obra-simulada.esperado.json', import.meta.url), 'utf8'))
const TOPO = fileURLToPath(new URL(ESPERADO.archivo.rutaDesdeGuion, import.meta.url))
const SOL = ESPERADO.avSol
const LIMA = ESPERADO.jrLima
const S = ESPERADO.textos.simbolos

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

// ---------------------------------------------------------------------------
// Cuentas de referencia, sacadas de ESPERADO (nada copiado a mano)
// ---------------------------------------------------------------------------

const NOMBRE_PUNTO = { 'p-borde-i': 'Borde izquierdo', 'p-eje': 'Eje', 'p-borde-d': 'Borde derecho' }

/** 0+080, como lo escribe la app. */
function prog(p) {
  const km = Math.floor(p / 1000)
  return `${km}+${String(Math.round(p - km * 1000)).padStart(3, '0')}`
}
/** +54 mm, −26 mm, 0 mm: el menos tipográfico, como `formatearDiferencia`. */
function mm(d) {
  return `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)} mm`
}
const r3 = (x) => Math.round(x * 1000) / 1000
const f3 = (x) => r3(x).toFixed(3)

function cotaRasante(rasante, p) {
  return rasante.cotaArranque + (rasante.pendiente / 100) * (p - rasante.progresivaArranque)
}
// Lo que baja cada punto de la sección y cada capa respecto a la rasante,
// deducido de las cotas de proyecto que trae ESPERADO.
const bajaBorde = r3(SOL.subrasante.alLimite.cotaProyecto - (cotaRasante(SOL.rasante, SOL.subrasante.alLimite.progresiva) - (cotaRasante(SOL.rasante, SOL.subrasante.fuera.progresiva) - SOL.subrasante.fuera.cotaProyecto)))
const bajaSubrasante = r3(cotaRasante(SOL.rasante, SOL.subrasante.fuera.progresiva) - SOL.subrasante.fuera.cotaProyecto)
const bajaBase = r3(cotaRasante(SOL.rasante, SOL.base.lecturaObjetivo.progresiva) - SOL.base.lecturaObjetivo.cotaProyecto)
function cotaProyecto(rasante, bajaCapa, p, punto) {
  return r3(cotaRasante(rasante, p) - bajaCapa + (punto === 'Eje' ? 0 : bajaBorde))
}
/**
 * La AI compensada de la estación i (desde 0) de una toma que cerró: la de la
 * libreta (ESPERADO.alturasInstrumentales) más la parte del error de cierre
 * que le toca, −error·(i+1)/n (un solo circuito, desde la estación 1). Es la
 * que respalda las cotas de Revisar, y con la que tienen que contar el aviso
 * al anotar y el replanteo. Sin cerrar, la de la libreta tal cual.
 */
function aiCompensada(toma, i) {
  const ai = toma.alturasInstrumentales[i]
  if (toma.cierre.pasa !== true) return ai
  return ai - ((toma.cierre.errorMm / 1000) * (i + 1)) / toma.alturasInstrumentales.length
}
const BM = Object.fromEntries(ESPERADO.bms.map((b) => [b.nombre, b]))
/** Tolerancia de cierre: 12·√K mm. */
const tolerancia = (k) => 12 * Math.sqrt(k)
/** K de Jr. Lima: fijo en 0.2 km en la obra simulada (src/pruebas/obraSimulada.ts, TOMA_LIMA_SUBRASANTE); ESPERADO no lo trae. */
const K_LIMA = 0.2

// ---------------------------------------------------------------------------
// Página y navegación
// ---------------------------------------------------------------------------

const navegador = await chromium.launch()
const erroresConsola = []

async function abrirObra(ancho, alto) {
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } })
  pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(`${ancho}px: ${m.text()}`) })
  pagina.on('pageerror', (e) => erroresConsola.push(`${ancho}px pageerror: ${e.message}`))
  await pagina.goto(BASE, { waitUntil: 'load', timeout: 120000 })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).waitFor({ state: 'attached', timeout: 30000 })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).setInputFiles(TOPO)
  await pagina.getByText(ESPERADO.nombresDeCalles[0], { exact: true }).first().waitFor({ timeout: 10000 })
  await pagina.getByRole('navigation', { name: 'Espacios' }).getByRole('button', { name: 'Calle', exact: true }).click()
  await pagina.getByRole('navigation', { name: 'Modos de la calle' }).waitFor({ timeout: 10000 })
  return pagina
}

async function irAModo(pagina, nombre) {
  await pagina.getByRole('navigation', { name: 'Modos de la calle' }).getByRole('button', { name: nombre, exact: true }).click()
  await pagina.getByRole('heading', { name: nombre, exact: true, level: 2 }).waitFor({ timeout: 10000 })
}
async function elegirCalle(pagina, nombre) {
  await pagina.getByLabel('Calle activa').selectOption({ label: nombre })
}
/** Elige la toma por el texto de su opción («BASE · 2026-09-28»). */
async function elegirCapa(pagina, capa, fecha) {
  const selector = pagina.getByLabel('Capa activa')
  const opciones = await selector.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })))
  const opcion = opciones.find((o) => o.t.includes(capa) && o.t.includes(fecha))
  if (!opcion) throw new Error(`no hay capa ${capa} · ${fecha}: ${opciones.map((o) => o.t).join(' | ')}`)
  await selector.selectOption(opcion.v)
}
async function texto(locator) {
  return (await locator.innerText()).replace(/\s+/g, ' ').trim()
}
/** Celda del mapa por su nombre accesible («0+080 Eje: +54 mm, …»). */
function celdaMapa(pagina, p, punto) {
  const nombre = new RegExp(`^${prog(p).replace('+', '\\+')} ${punto}[:,]`)
  return pagina.getByRole('button', { name: nombre })
}
async function anchoDePagina(pagina) {
  return pagina.evaluate(() => {
    // El contenido se desplaza dentro de <main class="overflow-auto">: si se
    // sale a lo ancho, el documento sigue midiendo lo mismo. Se suma lo que
    // main se desplaza de lado.
    const main = document.querySelector('main')
    const deMain = main ? Math.max(0, main.scrollWidth - main.clientWidth) : 0
    return Math.max(document.documentElement.scrollWidth, window.innerWidth + deMain)
  })
}
/**
 * Botones, campos y desplegables visibles por debajo de 44 px de alto O de
 * ancho: la barra superior (Obra / Calle / Informes / Calcular y el resto de
 * la cabecera), las sub-barras de la calle y el contenido.
 */
async function controlesChicos(pagina) {
  return pagina.evaluate(() => {
    const raiz = [...document.querySelectorAll('header, main, nav[aria-label="Modos de la calle"], nav[aria-label="Pantallas de la calle"]')]
    const vistos = new Set()
    const chicos = []
    for (const r of raiz) {
      for (const el of r.querySelectorAll('button, select, input:not([type="range"]):not([type="file"])')) {
        if (vistos.has(el)) continue
        vistos.add(el)
        const caja = el.getBoundingClientRect()
        if (caja.width === 0 || caja.height === 0) continue
        if (caja.height < 43.5 || caja.width < 43.5) {
          const nombre = el.getAttribute('aria-label') || el.textContent.trim() || el.tagName
          chicos.push(`${nombre.slice(0, 40)} (${Math.round(caja.width)}×${Math.round(caja.height)} px)`)
        }
      }
    }
    return chicos
  })
}

/** La región «Mapa de la calle» (lleva el aviso, la rejilla y la leyenda). */
function regionMapa(pagina) {
  return pagina.getByRole('region', { name: 'Mapa de la calle' })
}
/**
 * ¿La leyenda del semáforo se ve entera? Null si se ve; si no, por qué: no
 * está, o alguna caja que la contiene con desplazamiento la corta (habría
 * que desplazar dentro de esa caja para leerla).
 */
async function leyendaRecortada(pagina) {
  return pagina.evaluate(() => {
    const leyenda = document.querySelector('ul[aria-label="Qué significa cada color del mapa"]')
    if (!leyenda) return 'no hay leyenda'
    const caja = leyenda.getBoundingClientRect()
    if (caja.height === 0) return 'leyenda sin alto'
    for (let el = leyenda.parentElement; el && el !== document.body; el = el.parentElement) {
      const estilo = getComputedStyle(el)
      if (estilo.overflowY === 'visible' && estilo.overflowX === 'visible') continue
      const c = el.getBoundingClientRect()
      if (caja.top < c.top - 1 || caja.bottom > c.bottom + 1) {
        return `la corta una caja con overflow ${estilo.overflowY} (${Math.round(c.height)} px de alto; la leyenda acaba en ${Math.round(caja.bottom - c.top)} px)`
      }
    }
    return null
  })
}

// ===========================================================================
// 1. LAPTOP 1280×800
// ===========================================================================

const p = await abrirObra(1280, 800)

const calleAlAbrir = await p.getByLabel('Calle activa').evaluate((s) => s.options[s.selectedIndex]?.textContent)
comprobar('al entrar a Calle está activa Av. Sol', calleAlAbrir === ESPERADO.alAbrir.calle, calleAlAbrir)
const capaAlAbrir = await p.getByLabel('Capa activa').evaluate((s) => s.options[s.selectedIndex]?.textContent)
comprobar('y su capa activa es la SUBRASANTE del 14/09', capaAlAbrir.includes('SUBRASANTE') && capaAlAbrir.includes(SOL.subrasante.fecha), capaAlAbrir)

// ---------------------------------------------------------------------------
// 1.1 Revisar · Av. Sol subrasante
// ---------------------------------------------------------------------------

await irAModo(p, 'Revisar')
const fichaRevisar = p.getByRole('complementary')
comprobar('Revisar de Av. Sol: «Cotas compensadas» (la nivelación cerró)',
  (await p.getByRole('heading', { name: 'Cotas compensadas' }).count()) === 1)
comprobar('Revisar de Av. Sol: diferencias verificadas, no «no comprobado»',
  /DIFERENCIAS VERIFICADAS/.test(await texto(fichaRevisar)) && !/no comprobad/i.test(await texto(fichaRevisar)))

comprobar('el mapa de Av. Sol (cerrada) no se marca como no comprobado', !/no comprobad/i.test(await texto(regionMapa(p))))

// Las 21 celdas del mapa: diferencia, acción y estado con su símbolo.
let celdasBien = 0
const celdasMal = []
for (const [clave, d] of Object.entries(SOL.subrasante.diferenciasMm)) {
  const [pr, id] = clave.split('/')
  const punto = NOMBRE_PUNTO[id]
  const boton = celdaMapa(p, Number(pr), punto)
  if ((await boton.count()) !== 1) { celdasMal.push(`${clave}: no está en el mapa`); continue }
  const nombre = await boton.getAttribute('aria-label')
  const simbolo = (await boton.innerText()).trim()
  const accion = d > 0 ? 'cortar' : d < 0 ? 'rellenar' : 'clavado'
  const estado = Math.abs(d) <= 20 ? 'conforme' : Math.abs(d) <= 40 ? 'al límite' : 'fuera de tolerancia'
  const sim = estado === 'conforme' ? S.conforme : estado === 'al límite' ? S.alLimite : S.fuera
  if (nombre.includes(mm(d)) && nombre.includes(accion) && nombre.includes(estado) && simbolo === sim) celdasBien++
  else celdasMal.push(`${clave}: «${nombre}» [${simbolo}] esperaba ${mm(d)} ${accion} ${estado} ${sim}`)
}
comprobar('las 21 celdas del mapa dicen su diferencia en mm, corta/rellena y su estado con símbolo',
  celdasBien === 21, celdasMal.slice(0, 3).join(' | ') || `${celdasBien}/21`)

// El punto fuera de tolerancia: 0+080 Eje.
const fuera = SOL.subrasante.fuera
const botonFuera = celdaMapa(p, fuera.progresiva, fuera.punto)
comprobar(`el 0+080 Eje aparece en el mapa con ${S.fuera}`, (await botonFuera.innerText()).trim() === S.fuera)
await botonFuera.click()
const puntoElegido = p.getByRole('region', { name: 'Punto elegido' })
const tPunto = await texto(puntoElegido)
comprobar('al tocarlo, la ficha dice ✗ fuera de tolerancia · corta 54 mm',
  tPunto.includes(`${S.fuera} fuera de tolerancia · corta ${fuera.diferenciaMm} mm`), tPunto.slice(0, 120))
comprobar('cota medida, de proyecto y diferencia del 0+080 Eje',
  tPunto.includes(`Cota medida ${f3(fuera.cotaMedida)}`) && tPunto.includes(`Cota de proyecto ${f3(fuera.cotaProyecto)}`) &&
  tPunto.includes(`Diferencia ${mm(fuera.diferenciaMm)}`), tPunto)
comprobar('diferencia = medida − proyecto (positivo = corta)',
  Math.round((fuera.cotaMedida - fuera.cotaProyecto) * 1000) === fuera.diferenciaMm && fuera.accion === 'corta')

// El al límite: 0+040 Borde derecho, −26 mm, rellena.
const limite = SOL.subrasante.alLimite
await celdaMapa(p, limite.progresiva, limite.punto).click()
const tLimite = await texto(puntoElegido)
comprobar('el 0+040 Borde derecho: △ al límite · rellena 26 mm, −26 mm',
  tLimite.includes(`${S.alLimite} al límite de tolerancia · rellena ${Math.abs(limite.diferenciaMm)} mm`) &&
  tLimite.includes(`Diferencia ${mm(limite.diferenciaMm)}`), tLimite.slice(0, 160))

const resumen = await texto(p.getByRole('region', { name: 'Resumen de la calle' }))
const c = SOL.subrasante.conteo
comprobar('resumen de Av. Sol: 19 ✓, 1 △, 1 ✗, 0 ·',
  resumen.includes(`${S.conforme} ${c.conformes} conformes`) && resumen.includes(`${S.alLimite} ${c.alLimite} al límite`) &&
  resumen.includes(`${S.fuera} ${c.fuera} fuera de tolerancia`) && resumen.includes(`${S.sinMedir} ${c.sinMedir} sin medir`), resumen)

await p.getByRole('button', { name: 'Ir al peor punto' }).click()
comprobar('«Ir al peor punto» lleva al 0+080 Eje', (await texto(puntoElegido)).startsWith(`${prog(fuera.progresiva)} ${fuera.punto}`),
  (await texto(puntoElegido)).slice(0, 40))
await p.screenshot({ path: `${SALIDA}/calle-revisar-sol-1280.png`, fullPage: true })

// ---------------------------------------------------------------------------
// 1.2 Revisar · Jr. Lima (sin cerrar)
// ---------------------------------------------------------------------------

await elegirCalle(p, LIMA.nombre)
await p.getByRole('heading', { name: /Cotas (sin )?compensar/ }).waitFor({ timeout: 10000 })
const tLima = await texto(fichaRevisar)
comprobar('Revisar de Jr. Lima: «Cotas sin compensar»', (await p.getByRole('heading', { name: 'Cotas sin compensar' }).count()) === 1)
comprobar('Revisar de Jr. Lima dice «no comprobado»', new RegExp(ESPERADO.textos.noComprobado, 'i').test(tLima), tLima.slice(0, 140))
// El mapa visto solo no puede parecer aprobado: el aviso va en su propia región, antes de la rejilla.
const tMapaLima = await texto(regionMapa(p))
comprobar('el mapa de Jr. Lima (sin cerrar) dice él mismo «no comprobado»',
  new RegExp(ESPERADO.textos.noComprobado, 'i').test(tMapaLima.split(prog(LIMA.progresivas[0]))[0]), tMapaLima.slice(0, 160))
const tResumenLima0 = await texto(p.getByRole('region', { name: 'Resumen de la calle' }))
comprobar('el resumen de Jr. Lima dice que sus conteos no están comprobados',
  /no comprobad/i.test(tResumenLima0) && tResumenLima0.includes(`${LIMA.subrasante.conteo.conformes} conformes sin comprobar`), tResumenLima0)
const fueraLima = LIMA.subrasante.fuera
const botonFueraLima = celdaMapa(p, fueraLima.progresiva, fueraLima.punto)
comprobar(`el 0+140 Eje de Jr. Lima aparece con ${S.fuera}`, (await botonFueraLima.innerText()).trim() === S.fuera)
await botonFueraLima.click()
const tPuntoLima = await texto(puntoElegido)
comprobar('0+140 Eje: ✗ fuera · rellena 60 mm, −60 mm, y «no comprobada»',
  tPuntoLima.includes(`${S.fuera} fuera de tolerancia · rellena ${Math.abs(fueraLima.diferenciaMm)} mm`) &&
  tPuntoLima.includes(`Diferencia ${mm(fueraLima.diferenciaMm)}`) && /no comprobada/i.test(tPuntoLima), tPuntoLima)
const resumenLima = await texto(p.getByRole('region', { name: 'Resumen de la calle' }))
comprobar('resumen de Jr. Lima: 17 ✓, 0 △, 1 ✗',
  resumenLima.includes(`${LIMA.subrasante.conteo.conformes} conformes`) && resumenLima.includes(`${LIMA.subrasante.conteo.alLimite} al límite`) &&
  resumenLima.includes(`${LIMA.subrasante.conteo.fuera} fuera de tolerancia`), resumenLima)
await p.screenshot({ path: `${SALIDA}/calle-revisar-lima-1280.png`, fullPage: true })

// ---------------------------------------------------------------------------
// 1.3 Replantear · Av. Sol base, estación 1
// ---------------------------------------------------------------------------

await elegirCalle(p, SOL.nombre)
await elegirCapa(p, 'BASE', SOL.base.fecha)
const objetivo = SOL.base.lecturaObjetivo
// La estación se elige en Medir (la de Replantear «de la libreta» es la activa).
await irAModo(p, 'Medir')
await p.getByRole('button', { name: `Estación ${objetivo.estacion}`, exact: true }).click()
await irAModo(p, 'Replantear')
await celdaMapa(p, objetivo.progresiva, objetivo.punto).click()
const fichaRep = p.getByRole('complementary')
const tAI = await texto(fichaRep.getByRole('group', { name: 'Altura del instrumento' }))
// La base cerró con +4 mm en 4 estaciones: a la estación 1 le toca −1 mm.
// ESPERADO.lecturaObjetivo trae la AI de la libreta (3246.467 → 2.437); la
// que vale es la compensada, la misma con la que Revisar juzgará la estaca.
const aiBase = aiCompensada(SOL.base, objetivo.estacion - 1)
const objetivoComp = r3(aiBase - objetivo.cotaProyecto)
comprobar(`Replantear: AI compensada de la estación 1 de la base = ${f3(aiBase)} (${f3(objetivo.alturaInstrumental)} de la libreta − 1 mm)`,
  tAI.includes(`AI ${f3(aiBase)} compensada`) && tAI.includes('−1.0 mm') && tAI.includes('estación 1'), tAI.slice(-120))
const estaca = p.getByRole('region', { name: 'Estaca actual' })
const tEstaca = await texto(estaca)
comprobar('la estaca es el 0+020 Eje', tEstaca.includes(`${prog(objetivo.progresiva)} ${objetivo.punto}`), tEstaca.slice(0, 50))
comprobar(`lectura objetivo = AI compensada − cota de proyecto = ${f3(aiBase)} − ${f3(objetivo.cotaProyecto)} = ${f3(objetivoComp)}`,
  tEstaca.includes(`Lectura objetivo ${f3(objetivoComp)}`) && f3(objetivo.alturaInstrumental - objetivo.cotaProyecto) === f3(objetivo.lectura) &&
  tEstaca.includes(`Cota de proyecto ${f3(objetivo.cotaProyecto)}`), tEstaca.slice(0, 160))
comprobar('la base cerró: el replanteo no se marca como no comprobado', !/no comprobad/i.test(await texto(fichaRep)))

// Las tres estacas de la hoja: objetivo = AI − proyecto en cada una.
const hoja = p.getByRole('region', { name: 'Hoja de replanteo' })
const malHoja = []
for (const punto of ['Borde izquierdo', 'Eje', 'Borde derecho']) {
  const esperado = f3(aiBase - cotaProyecto(SOL.rasante, bajaBase, objetivo.progresiva, punto))
  const n = await hoja.getByRole('button', { name: `Estaca ${punto}, objetivo ${esperado}`, exact: true }).count()
  if (n !== 1) malHoja.push(`${punto} ≠ ${esperado}: ${(await hoja.getByRole('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')))).join(' | ')}`)
}
comprobar('la hoja de 0+020: objetivo = AI − proyecto en las tres estacas', malHoja.length === 0, malHoja[0] ?? '')

const veredicto = p.getByRole('status', { name: 'Veredicto' })
const leida = p.getByLabel('Lectura leída', { exact: true })
// La mira marca más que el objetivo: falta material, rellena.
await leida.fill(f3(objetivoComp + 0.013))
let tVer = await texto(veredicto)
comprobar(`lectura ${f3(objetivoComp + 0.013)} (13 mm más que el objetivo): △ RELLENA 13 mm, al límite (tol 10)`,
  tVer.includes(`${S.alLimite} RELLENA 13 mm`) && tVer.includes('al límite'), tVer)
await leida.fill(f3(objetivoComp - 0.007))
tVer = await texto(veredicto)
comprobar(`lectura ${f3(objetivoComp - 0.007)} (7 mm menos): ✓ CORTA 7 mm, conforme`, tVer.includes(`${S.conforme} CORTA 7 mm`) && tVer.includes('conforme'), tVer)
await leida.fill(f3(objetivoComp - 0.025))
tVer = await texto(veredicto)
comprobar(`lectura ${f3(objetivoComp - 0.025)} (25 mm menos): ✗ CORTA 25 mm, fuera`, tVer.includes(`${S.fuera} CORTA 25 mm`) && tVer.includes('fuera de tolerancia'), tVer)
await leida.fill(f3(objetivoComp))
await p.getByRole('button', { name: '+1 mm', exact: true }).click()
tVer = await texto(veredicto)
comprobar('el objetivo exacto y luego +1 mm: ✓ RELLENA 1 mm', (await leida.inputValue()) === f3(objetivoComp + 0.001) && tVer.includes(`${S.conforme} RELLENA 1 mm`), tVer)
await leida.fill(f3(objetivoComp))
tVer = await texto(veredicto)
comprobar('el objetivo exacto: ✓ EN COTA', tVer.includes(`${S.conforme} EN COTA`), tVer)
await p.screenshot({ path: `${SALIDA}/calle-replantear-sol-1280.png`, fullPage: true })

// ---------------------------------------------------------------------------
// 1.3b Replantear «Desde un BM»: AI = cota del BM + vista atrás escrita.
// Comprobado solo si el BM es oficial (BM-1); BM-2 y BM-3 son auxiliares.
// ---------------------------------------------------------------------------

const grupoAI = fichaRep.getByRole('group', { name: 'Altura del instrumento' })
await fichaRep.getByRole('button', { name: 'Desde un BM', exact: true }).click()
const VISTA_ATRAS = 1.287
for (const nombreBm of ['BM-1', 'BM-2', 'BM-3']) {
  const bm = BM[nombreBm]
  await fichaRep.getByLabel('BM de partida').selectOption({ label: `${bm.nombre} · ${f3(bm.cota)}` })
  await fichaRep.getByLabel('Vista atrás al BM').fill(f3(VISTA_ATRAS))
  const aiBm = r3(bm.cota + VISTA_ATRAS)
  const tGrupo = await texto(grupoAI)
  const tEst = await texto(estaca)
  const objBm = f3(aiBm - objetivo.cotaProyecto)
  comprobar(`Desde ${nombreBm} (${bm.tipo}) con vista atrás ${f3(VISTA_ATRAS)}: AI ${f3(aiBm)} = ${f3(bm.cota)} + ${f3(VISTA_ATRAS)} y objetivo ${objBm} = AI − ${f3(objetivo.cotaProyecto)}`,
    tGrupo.includes(`AI ${f3(aiBm)}`) && tEst.includes(`Lectura objetivo ${objBm}`), `${tGrupo.slice(-80)} | ${tEst.slice(0, 80)}`)
  const tFicha = await texto(fichaRep)
  const dice = new RegExp(ESPERADO.textos.noComprobado, 'i').test(tFicha)
  if (bm.tipo === 'oficial') {
    comprobar(`desde ${nombreBm}, oficial, el replanteo está comprobado (no dice «no comprobado»)`, !dice, tFicha.slice(0, 200))
  } else {
    comprobar(`desde ${nombreBm}, auxiliar, el replanteo dice «no comprobado» y que el BM es auxiliar`,
      dice && tFicha.includes(`${nombreBm} es un BM auxiliar`), tFicha.slice(0, 260))
  }
  // Con la lectura que da el objetivo, en cota; con 25 mm más, rellena 25 (fuera: tol 10, al límite hasta 20).
  await leida.fill(objBm)
  const tV0 = await texto(veredicto)
  await leida.fill(f3(Number(objBm) + 0.025))
  const tV1 = await texto(veredicto)
  comprobar(`desde ${nombreBm}: el objetivo da EN COTA y 25 mm más da ✗ RELLENA 25 mm`,
    tV0.includes('EN COTA') && tV1.includes(`${S.fuera} RELLENA 25 mm`), `${tV0} | ${tV1}`)
}
await p.screenshot({ path: `${SALIDA}/calle-replantear-desde-bm-1280.png`, fullPage: true })
await fichaRep.getByRole('button', { name: 'De la libreta', exact: true }).click()

// ---------------------------------------------------------------------------
// 1.4 Replantear · Jr. Lima (sin cerrar): no comprobado
// ---------------------------------------------------------------------------

await elegirCalle(p, LIMA.nombre)
await celdaMapa(p, fueraLima.progresiva, fueraLima.punto).click()
const aiLima = LIMA.subrasante.alturasInstrumentales.at(-1)
const tRepLima = await texto(fichaRep)
comprobar('Replantear de Jr. Lima: AI de su última estación', tRepLima.includes(`AI ${f3(aiLima)}`), tRepLima.slice(0, 120))
comprobar('Replantear de Jr. Lima dice «no comprobadas»', new RegExp(ESPERADO.textos.noComprobado, 'i').test(tRepLima))
const objLima = f3(aiLima - fueraLima.cotaProyecto)
comprobar(`0+140 Eje de Jr. Lima: objetivo ${objLima} = AI − ${f3(fueraLima.cotaProyecto)}`,
  (await texto(estaca)).includes(`Lectura objetivo ${objLima}`), (await texto(estaca)).slice(0, 120))
await leida.fill(f3(aiLima - fueraLima.cotaMedida))
tVer = await texto(veredicto)
comprobar('con la lectura que se midió allí: ✗ RELLENA 60 mm, y no comprobado',
  tVer.includes(`${S.fuera} RELLENA ${Math.abs(fueraLima.diferenciaMm)} mm`) && /no comprobad/i.test(tVer), tVer)
await p.screenshot({ path: `${SALIDA}/calle-replantear-lima-1280.png`, fullPage: true })

// ---------------------------------------------------------------------------
// 1.5 Medir · Av. Sol subrasante: aviso al anotar
// ---------------------------------------------------------------------------

await elegirCalle(p, SOL.nombre)
await elegirCapa(p, 'SUBRASANTE', SOL.subrasante.fecha)
await irAModo(p, 'Medir')
const cierreVivo = p.getByRole('region', { name: 'Cierre en vivo' })
const tCierreSol = await texto(cierreVivo)
const errSol = SOL.subrasante.cierre
comprobar('cierre en vivo de Av. Sol: ✓ Cierra, −4.0 mm de ±5.9 mm',
  tCierreSol.includes('Cierra') && tCierreSol.includes(`${errSol.errorMm < 0 ? '−' : '+'}${Math.abs(errSol.errorMm).toFixed(1)} mm de ±${errSol.toleranciaMm.toFixed(1)} mm`),
  tCierreSol)
const campo = p.getByLabel('Lectura de mira', { exact: true })
comprobar('con la grilla llena, Anotar no se puede pulsar', await p.getByRole('button', { name: 'Anotar', exact: true }).isDisabled())

// Una progresiva nueva para tener dónde anotar.
await p.getByLabel('Añadir progresiva', { exact: true }).fill('0+010')
await p.getByRole('button', { name: 'Añadir', exact: true }).click()
const celdaActiva = p.getByText(/^Celda activa:/)
await p.getByText('Celda activa: 0+010', { exact: false }).waitFor({ timeout: 5000 }).catch(() => {})
const tCelda = await texto(celdaActiva)
comprobar('al añadir 0+010 la libreta se pone en su primera celda', tCelda.startsWith('Celda activa: 0+010'), tCelda)
const nombreCelda = tCelda.replace('Celda activa: 0+010 ', '')
const iUltima = SOL.subrasante.alturasInstrumentales.length - 1
// Av. Sol subrasante cerró con −4 mm: a su última estación le tocan +4 mm (3245.924 → 3245.928).
const aiSol = aiCompensada(SOL.subrasante, iUltima)
const proyecto010 = cotaProyecto(SOL.rasante, bajaSubrasante, 10, nombreCelda)
const esperada010 = f3(aiSol - proyecto010)
const aviso = p.getByRole('region', { name: 'Aviso al anotar' })
const tAviso0 = await texto(aviso)
comprobar(`antes de escribir: lectura esperada ${esperada010} = AI compensada ${f3(aiSol)} − ${f3(proyecto010)}`,
  tAviso0.includes(`Lectura esperada ${esperada010}`), tAviso0)
const tNotaAI = await texto(p.getByText(/el aviso cuenta con la AI compensada/))
comprobar(`Medir dice con qué AI cuenta: la compensada ${f3(aiSol)}, +4.0 mm sobre la CI de la libreta ${f3(SOL.subrasante.alturasInstrumentales[iUltima])}`,
  tNotaAI.includes(`AI compensada ${f3(aiSol)}`) && tNotaAI.includes('+4.0 mm'), tNotaAI)

for (const [lectura, dice] of [['0.100', 'poco precisa'], ['4.900', 'poco precisa'], ['5.200', 'no cabe en una mira de 5 m']]) {
  await campo.fill(lectura)
  const tA = await texto(aviso)
  comprobar(`al escribir ${lectura} el aviso salta al instante: «${dice}» y ¿Leíste bien?`,
    tA.includes(dice) && tA.includes('¿Leíste bien?') && /[✗?]/.test(tA), tA.slice(0, 200))
}
// 5.200 no cabe: no se anota.
const llenadas0 = await texto(p.getByText(/^llenadas \d+ de \d+/))
await campo.press('Enter')
const rechazo = p.getByRole('alert').filter({ hasText: 'no se anotó' })
comprobar('5.200 no se anota: alerta «no se anotó» y la cuenta no cambia',
  (await rechazo.count()) === 1 && (await texto(p.getByText(/^llenadas \d+ de \d+/))) === llenadas0, llenadas0)

// 0.10 y 4.90, sin el tercer decimal: avisan al anotarlas, y se borran.
for (const lectura of ['0.10', '4.90']) {
  await campo.fill(lectura)
  await p.getByRole('button', { name: 'Anotar', exact: true }).click()
  const ultima = p.getByRole('region', { name: /^Última lectura anotada/ })
  const tU = await texto(ultima)
  const alerta = ultima.getByRole('alert')
  comprobar(`${lectura} anotada: la última lectura avisa ✗ ¿Leíste bien? y «poco precisa»`,
    (await alerta.count()) === 1 && tU.includes('poco precisa'), tU.slice(0, 200))
  await p.getByRole('button', { name: 'Borrar y volver a leer' }).click()
  comprobar(`«Borrar y volver a leer» quita la ${lectura} y vuelve a su celda`,
    (await texto(p.getByText(/^llenadas \d+ de \d+/))) === llenadas0 && (await texto(celdaActiva)) === tCelda)
}

// Una buena: 8 mm más de lectura que la esperada = 8 mm bajo el proyecto, rellena 8 mm, conforme.
const buena = f3(aiSol - proyecto010 + 0.008)
await campo.fill(buena)
const tBuena = await texto(aviso)
comprobar(`al escribir ${buena}: ✓ conforme, −8 mm, rellena 8 mm, cota ${f3(proyecto010 - 0.008)}`,
  tBuena.includes(`${S.conforme} conforme`) && tBuena.includes('−8 mm') && tBuena.includes('rellena 8 mm') &&
  tBuena.includes(`Cota ${f3(proyecto010 - 0.008)}`), tBuena.slice(0, 200))
await campo.press('Enter')
const tUltima = await texto(p.getByRole('region', { name: /^Última lectura anotada/ }))
comprobar('anotada: queda a la vista como última lectura, sin alerta', tUltima.toLowerCase().includes(`0+010 ${nombreCelda}`.toLowerCase()) && tUltima.includes('rellena 8 mm') &&
  (await p.getByRole('region', { name: /^Última lectura anotada/ }).getByRole('alert').count()) === 0, tUltima.slice(0, 160))
const llenadas1 = await texto(p.getByText(/^llenadas \d+ de \d+/))
comprobar('la cuenta sube una y la libreta salta a la siguiente celda',
  Number(llenadas1.match(/llenadas (\d+)/)[1]) === Number(llenadas0.match(/llenadas (\d+)/)[1]) + 1 && (await texto(celdaActiva)) !== tCelda,
  `${llenadas0} → ${llenadas1}`)
comprobar('el cierre en vivo sigue diciendo que Av. Sol cierra', (await texto(cierreVivo)).includes('Cierra'))
await p.screenshot({ path: `${SALIDA}/calle-medir-sol-1280.png`, fullPage: true })
// La misma lectura, en Revisar: la misma cota y la misma diferencia que dio el aviso al anotar.
await irAModo(p, 'Revisar')
await celdaMapa(p, 10, nombreCelda).click()
const tRev010 = await texto(p.getByRole('region', { name: 'Punto elegido' }))
comprobar(`Revisar da la misma cota que el aviso al anotar para la lectura ${buena}: ${f3(proyecto010 - 0.008)}, −8 mm`,
  tRev010.includes(`Cota medida ${f3(proyecto010 - 0.008)}`) && tRev010.includes('Diferencia −8 mm'), tRev010)
await irAModo(p, 'Medir')

// ---------------------------------------------------------------------------
// 1.6 Medir · Jr. Lima: el cierre en vivo mientras se anota la vista adelante
// ---------------------------------------------------------------------------

await elegirCalle(p, LIMA.nombre)
const tAbierto = await texto(cierreVivo)
comprobar('cierre en vivo de Jr. Lima: △ sin cerrar, nada comprobado',
  tAbierto.includes('Sin cerrar') && /nada comprobado/.test(tAbierto) && tAbierto.includes(LIMA.subrasante.cierre.bmQueFalta), tAbierto)
const lecturaCierre = tAbierto.match(/lee (\d+\.\d{3})/)?.[1]
// Cuenta independiente: AI de la última estación − cota del BM-2 (todo de ESPERADO).
const aiUltimaLima = LIMA.subrasante.alturasInstrumentales.at(-1)
const bmCierre = BM[LIMA.subrasante.cierre.bmQueFalta]
const cierreEsperado = f3(aiUltimaLima - bmCierre.cota)
const tolLima = tolerancia(K_LIMA).toFixed(1)
comprobar(`la lectura que cerraría en ${bmCierre.nombre} es ${cierreEsperado} = AI ${f3(aiUltimaLima)} − ${f3(bmCierre.cota)}, tolerancia ±${tolLima} mm (12·√${K_LIMA})`,
  lecturaCierre === cierreEsperado && tAbierto.includes(`tolerancia ±${tolLima} mm`), `${lecturaCierre ?? '—'} | ${tAbierto.slice(-120)}`)
// Con la grilla llena no hay celda activa: se toca una del mapa para volver a medirla.
await celdaMapa(p, fueraLima.progresiva, fueraLima.punto).click()
const avisoLima = await texto(p.getByRole('region', { name: 'Aviso al anotar' }))
comprobar('el aviso al anotar de Jr. Lima dice «no comprobada»', /no comprobad/i.test(avisoLima), avisoLima.slice(-80))

await p.getByRole('button', { name: 'Cerrar el circuito' }).click()
const adelante = p.getByLabel('Vista adelante a BM', { exact: true })
// 25 mm de más en el BM: el circuito no cierra.
// 25 mm más de lectura en el BM = se llega 25 mm más abajo: error −25 mm.
await adelante.fill(f3(Number(cierreEsperado) + 0.025))
const tMal = await texto(cierreVivo)
comprobar(`vista adelante 25 mm de más: ✗ No cierra, −25.0 mm, máximo ±${tolLima} mm, al instante`,
  tMal.includes('No cierra') && tMal.includes('fuera de tolerancia') && tMal.includes(`−25.0 mm, máximo ±${tolLima} mm`), tMal)
await adelante.fill(cierreEsperado)
const tBien = await texto(cierreVivo)
comprobar(`vista adelante ${cierreEsperado}: ✓ Cierra, 0.0 mm de ±${tolLima} mm, al instante`,
  tBien.includes('Cierra') && !tBien.includes('No cierra') && tBien.includes(`Circuito cerrado · 0.0 mm de ±${tolLima} mm`), tBien)
await p.screenshot({ path: `${SALIDA}/calle-medir-lima-cerrado-1280.png`, fullPage: true })
await irAModo(p, 'Revisar')
comprobar('y Revisar de Jr. Lima pasa a «Cotas compensadas»', (await p.getByRole('heading', { name: 'Cotas compensadas' }).count()) === 1)
comprobar('y su mapa deja de decir «no comprobado»', !/no comprobad/i.test(await texto(regionMapa(p))))

comprobar('laptop: la página no se desplaza a lo ancho', (await anchoDePagina(p)) <= 1280, `${await anchoDePagina(p)}`)

// ===========================================================================
// 2. CELULAR 390×844
// ===========================================================================

const m = await abrirObra(390, 844)
const chicosPorModo = {}
for (const modo of ['Medir', 'Revisar', 'Replantear']) {
  await irAModo(m, modo)
  if (modo === 'Revisar') await celdaMapa(m, fuera.progresiva, fuera.punto).click()
  const ancho = await anchoDePagina(m)
  comprobar(`celular, ${modo}: la página no se desplaza a lo ancho`, ancho <= 390, `scrollWidth ${ancho}`)
  chicosPorModo[modo] = await controlesChicos(m)
  comprobar(`celular, ${modo}: botones y campos de la calle de 44 px o más`, chicosPorModo[modo].length === 0,
    `${chicosPorModo[modo].length}: ${chicosPorModo[modo].join(' · ')}`)
  if (modo === 'Revisar') {
    const corte = await leyendaRecortada(m)
    comprobar('celular, Revisar de Av. Sol: la leyenda del semáforo se ve entera', corte === null, corte ?? '')
  }
  await m.screenshot({ path: `${SALIDA}/calle-${modo.toLowerCase()}-sol-390.png`, fullPage: true })
  await m.screenshot({ path: `${SALIDA}/calle-${modo.toLowerCase()}-sol-390-pantalla.png` })
}
// Revisar en el celular: el punto fuera y su acción.
await irAModo(m, 'Revisar')
await celdaMapa(m, fuera.progresiva, fuera.punto).click()
comprobar('celular, Revisar: 0+080 Eje ✗ fuera · corta 54 mm',
  (await texto(m.getByRole('region', { name: 'Punto elegido' }))).includes(`${S.fuera} fuera de tolerancia · corta 54 mm`))
// Jr. Lima en el celular: no comprobado.
await elegirCalle(m, LIMA.nombre)
await m.getByRole('heading', { name: 'Cotas sin compensar' }).waitFor({ timeout: 10000 })
comprobar('celular, Revisar de Jr. Lima: «no comprobado» a la vista',
  await m.getByText(/no comprobad/i).first().isVisible())
// En el celular el mapa sale antes que la ficha: su aviso tiene que estar en
// el mapa, encima de la rejilla, y no fuera de la pantalla al llegar a él.
const avisoMapaM = regionMapa(m).getByText(/no comprobad/i).first()
const hayAvisoMapaM = (await avisoMapaM.count()) === 1
let posAviso = null
if (hayAvisoMapaM) {
  await regionMapa(m).scrollIntoViewIfNeeded()
  posAviso = await m.evaluate(() => {
    const region = [...document.querySelectorAll('section')].find((s) => s.querySelector('h2')?.textContent === 'Mapa de la calle')
    const aviso = [...region.querySelectorAll('p')].find((p) => /no comprobad/i.test(p.textContent))
    const rejilla = region.querySelector('table')
    const a = aviso.getBoundingClientRect()
    return { avisoArriba: a.top, rejillaArriba: rejilla.getBoundingClientRect().top, alto: window.innerHeight, avisoAbajo: a.bottom }
  })
}
comprobar('celular, el mapa de Jr. Lima avisa «no comprobado» encima de la rejilla y dentro de la pantalla',
  hayAvisoMapaM && posAviso.avisoAbajo <= posAviso.rejillaArriba && posAviso.avisoArriba >= 0 && posAviso.avisoAbajo <= posAviso.alto,
  JSON.stringify(posAviso))
const corteLeyendaM = await leyendaRecortada(m)
comprobar('celular, Revisar: la leyenda del semáforo se ve entera, fuera de la caja que se desplaza', corteLeyendaM === null, corteLeyendaM ?? '')
await m.screenshot({ path: `${SALIDA}/calle-revisar-lima-390.png`, fullPage: true })
// Medir de Jr. Lima en el celular: circuito abierto, con «Trasladar» y «Cerrar el circuito» a la vista.
await irAModo(m, 'Medir')
const chicosLima = await controlesChicos(m)
comprobar('celular, Medir de Jr. Lima (abierto): botones de 44 px o más', chicosLima.length === 0, chicosLima.join(' · '))
comprobar('celular, Medir de Jr. Lima: la página no se desplaza a lo ancho', (await anchoDePagina(m)) <= 390, `${await anchoDePagina(m)}`)
await m.getByRole('region', { name: 'Cierre en vivo' }).scrollIntoViewIfNeeded()
await m.screenshot({ path: `${SALIDA}/calle-medir-lima-390.png` })
// Replantear en el celular: un objetivo y su veredicto.
await elegirCalle(m, SOL.nombre)
await elegirCapa(m, 'SUBRASANTE', SOL.subrasante.fecha)
await irAModo(m, 'Replantear')
await celdaMapa(m, fuera.progresiva, fuera.punto).click()
const aiM = aiCompensada(SOL.subrasante, iUltima)
const objM = f3(aiM - fuera.cotaProyecto)
comprobar(`celular, Replantear 0+080 Eje: objetivo ${objM} = AI compensada ${f3(aiM)} − ${f3(fuera.cotaProyecto)}`, (await texto(m.getByRole('region', { name: 'Estaca actual' }))).includes(`Lectura objetivo ${objM}`))
await m.getByLabel('Lectura leída', { exact: true }).fill(f3(aiM - fuera.cotaMedida))
const tVerM = await texto(m.getByRole('status', { name: 'Veredicto' }))
comprobar('celular, con la lectura medida allí: ✗ CORTA 54 mm', tVerM.includes(`${S.fuera} CORTA 54 mm`), tVerM)
await m.getByRole('status', { name: 'Veredicto' }).scrollIntoViewIfNeeded()
await m.screenshot({ path: `${SALIDA}/calle-replantear-veredicto-390.png` })
comprobar('celular, Replantear: la página no se desplaza a lo ancho', (await anchoDePagina(m)) <= 390, `${await anchoDePagina(m)}`)

await navegador.close()

comprobar('sin errores en la consola del navegador', erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 ? 0 : 1)
