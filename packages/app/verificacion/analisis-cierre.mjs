import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { strFromU8, unzipSync } from 'fflate'

/**
 * Calle › Análisis y Calle › Cierre sobre la obra simulada, en un navegador
 * real, a 1280×800 (gabinete) y a 390×844 (el celular en obra).
 *
 * - Espesores de Av. Sol (base 28/09 sobre subrasante 14/09): mínimo, máximo,
 *   la celda delgada de 0+080 Eje y las dos al límite, como dice ESPERADO;
 *   las 21 celdas y el volumen colocado contra los espesores que se rehacen
 *   aquí desde las lecturas del .topo (no desde lo que enseña el mapa).
 * - Volúmenes de Av. Sol, subrasante medida contra la de proyecto: corte y
 *   relleno se vuelven a sacar aquí con las diferencias de ESPERADO.
 * - Drenaje de Av. Sol: dice qué capa analiza; bombeo de la subrasante y,
 *   al elegir la base, el de la base, fila a fila contra la cuenta propia.
 * - Drenaje de Jr. Lima: no comprobado, empozamiento en 0+140, punto bajo en
 *   el extremo 0+100, contrapendiente de 0+120 a 0+140 (−0.10 %), pendiente
 *   de cada tramo y bombeo (0+140 tumbado por el eje hundido).
 * - Cierre de Av. Sol (subrasante y base): error, tolerancia 12·√K, símbolo,
 *   compensación por estación y el botón que la aplica; y de Jr. Lima, que
 *   no cerró: la lectura de cierre en BM-2, su rango y el campo de prueba.
 *
 * Uso: node verificacion/analisis-cierre.mjs <carpeta-de-salida>
 * La URL sale de BASE (por defecto http://localhost:4173/).
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })

const ESPERADO = JSON.parse(readFileSync(new URL('./datos/obra-simulada.esperado.json', import.meta.url), 'utf8'))
const TOPO = fileURLToPath(new URL(ESPERADO.archivo.rutaDesdeGuion, import.meta.url))
const SOL = ESPERADO.avSol
const LIMA = ESPERADO.jrLima
const NO_COMPROBADO = new RegExp(ESPERADO.textos.noComprobado, 'i')

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

/** El texto de la app trae el menos tipográfico: se pasa a número. */
function numero(texto) {
  return Number(String(texto).replace('−', '-').replace(/[^\d.+-]/g, ''))
}

const progresiva = (p) => `${Math.floor(p / 1000)}+${String(p % 1000).padStart(3, '0')}`
const nombrePunto = (clave) => ({ 'p-borde-i': 'Borde izquierdo', 'p-eje': 'Eje', 'p-borde-d': 'Borde derecho' })[clave]

// ---------------------------------------------------------------------------
// Cuentas propias (no se importa el motor: se rehacen a mano para contrastar)
// ---------------------------------------------------------------------------

const OFFSETS = { 'p-borde-i': -3.6, 'p-eje': 0, 'p-borde-d': 3.6 }

/**
 * Área de corte y de relleno de una sección: la diferencia (arriba − abajo)
 * en cada offset, por trapecios; un trapecio con signos opuestos se parte en
 * el cruce, igual que el metrado.
 */
function areas(difPorOffset) {
  let corte = 0
  let relleno = 0
  for (let i = 0; i + 1 < difPorOffset.length; i += 1) {
    const [x1, d1] = difPorOffset[i]
    const [x2, d2] = difPorOffset[i + 1]
    const ancho = x2 - x1
    if (d1 >= 0 && d2 >= 0) corte += ((d1 + d2) / 2) * ancho
    else if (d1 <= 0 && d2 <= 0) relleno += (-(d1 + d2) / 2) * ancho
    else {
      const xc = (Math.abs(d1) / (Math.abs(d1) + Math.abs(d2))) * ancho
      const a1 = (Math.abs(d1) * xc) / 2
      const a2 = (Math.abs(d2) * (ancho - xc)) / 2
      if (d1 > 0) { corte += a1; relleno += a2 } else { relleno += a1; corte += a2 }
    }
  }
  return { corte, relleno }
}

/** Volumen por áreas medias, con la diferencia en metros por clave «prog/punto». */
function volumenes(difPorCelda, progresivas) {
  const secciones = progresivas.map((p) =>
    areas(Object.entries(OFFSETS).map(([clave, x]) => [x, difPorCelda[`${p}/${clave}`]])),
  )
  let corte = 0
  let relleno = 0
  for (let i = 0; i + 1 < progresivas.length; i += 1) {
    const largo = progresivas[i + 1] - progresivas[i]
    corte += ((secciones[i].corte + secciones[i + 1].corte) / 2) * largo
    relleno += ((secciones[i].relleno + secciones[i + 1].relleno) / 2) * largo
  }
  return { corte, relleno }
}

/**
 * Cotas de una toma rehechas a mano desde la libreta del .topo: AI = cota
 * atrás + vista atrás, cota = AI − lectura, y si cierra la compensación
 * lineal por estación (la estación i de n recibe −error·i/n). Así los
 * espesores y el bombeo de la base salen de las lecturas, no de la pantalla.
 */
function cotasDeLaLibreta(toma, bms) {
  const cotaBm = (id) => bms.find((b) => b.id === id).cota
  const cambios = {}
  const crudas = []
  const ais = []
  let llegada = null
  toma.estaciones.forEach((e, i) => {
    const d = e.vistaAtras.destino
    const ai = (d.tipo === 'bm' ? cotaBm(d.bmId) : cambios[d.nombre]) + e.vistaAtras.valor
    ais.push(ai)
    for (const l of e.intermedias) {
      if (l.destino.tipo === 'celda') crudas.push({ clave: `${l.destino.celda.progresiva}/${l.destino.celda.elementoClave}`, cota: ai - l.valor, i })
    }
    const a = e.vistaAdelante
    if (a?.destino.tipo === 'cambio') cambios[a.destino.nombre] = ai - a.valor
    if (a?.destino.tipo === 'bm') llegada = ai - a.valor - cotaBm(a.destino.bmId)
  })
  const n = toma.estaciones.length
  const correccion = (i) => (llegada === null ? 0 : (-llegada * (i + 1)) / n)
  return {
    ais,
    errorMm: llegada === null ? null : llegada * 1000,
    cotas: Object.fromEntries(crudas.map((c) => [c.clave, c.cota + correccion(c.i)])),
  }
}

const PROYECTO_TOPO = JSON.parse(strFromU8(unzipSync(readFileSync(TOPO))['proyecto.json']))
const tomaDelTopo = (id) =>
  PROYECTO_TOPO.calles.flatMap((c) => c.nivelaciones.flatMap((n) => n.tomas)).find((t) => t.id === id)
const LIBRETA_SOL_SUB = cotasDeLaLibreta(tomaDelTopo(SOL.subrasante.toma), PROYECTO_TOPO.bms)
const LIBRETA_SOL_BASE = cotasDeLaLibreta(tomaDelTopo(SOL.base.toma), PROYECTO_TOPO.bms)

/** Bombeo de proyecto (2 % hacia los bordes) y media calzada: lo del modelo de la obra. */
const BOMBEO_PROYECTO = 2
const MEDIA_CALZADA = 3.6
/** Cota de proyecto de una celda: rasante del eje − bombeo en los bordes − lo que la capa va bajo la rasante. */
function cotaProyecto(rasante, progresivaM, clave, bajoRasanteM) {
  const eje = rasante.cotaArranque + (rasante.pendiente / 100) * (progresivaM - rasante.progresivaArranque) - bajoRasanteM
  return clave === 'p-eje' ? eje : eje - (BOMBEO_PROYECTO / 100) * MEDIA_CALZADA
}
/** Diferencia medida − proyecto en mm de cada celda de una libreta. */
function diferenciasDeLibreta(libreta, rasante, bajoRasanteM) {
  return Object.fromEntries(
    Object.entries(libreta.cotas).map(([clave, cota]) => {
      const [p, punto] = clave.split('/')
      return [clave, (cota - cotaProyecto(rasante, Number(p), punto, bajoRasanteM)) * 1000]
    }),
  )
}
const DIF_SOL_SUB = diferenciasDeLibreta(LIBRETA_SOL_SUB, SOL.rasante, SOL.espesores.disenioM)
const DIF_SOL_BASE = diferenciasDeLibreta(LIBRETA_SOL_BASE, SOL.rasante, 0)

/** Espesor de la base en cada celda, desde las dos libretas. */
const ESPESOR_LIBRETA = Object.fromEntries(
  Object.keys(LIBRETA_SOL_SUB.cotas).map((k) => [k, LIBRETA_SOL_BASE.cotas[k] - LIBRETA_SOL_SUB.cotas[k]]),
)

/**
 * Bombeo esperado en cada progresiva y lado: (cota eje − cota borde) / 3.60 · 100,
 * que con las diferencias queda 2 % + (dif eje − dif borde) / 36. Positivo =
 * baja al alejarse del eje. Estado contra ±0.5 puntos: conforme, al límite hasta
 * el doble, fuera más allá.
 */
function bombeosEsperados(difMm, progresivas) {
  const filas = []
  for (const p of progresivas) {
    for (const [lado, borde] of [['izquierda', 'p-borde-i'], ['derecha', 'p-borde-d']]) {
      const medido = BOMBEO_PROYECTO + (difMm[`${p}/p-eje`] - difMm[`${p}/${borde}`]) / 36
      const desvio = Math.abs(Math.round((medido - BOMBEO_PROYECTO) * 1000) / 1000)
      filas.push({ p, lado, medido, simbolo: desvio <= 0.5 ? '✓' : desvio <= 1 ? '△' : '✗' })
    }
  }
  return filas
}

const subrasanteContraProyecto = volumenes(
  Object.fromEntries(Object.entries(SOL.subrasante.diferenciasMm).map(([k, mm]) => [k, mm / 1000])),
  SOL.progresivas,
)

// ---------------------------------------------------------------------------
// El navegador
// ---------------------------------------------------------------------------

const navegador = await chromium.launch()
const erroresConsola = []

async function abrirObra(ancho, alto) {
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } })
  pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(`${ancho}px: ${m.text()}`) })
  pagina.on('pageerror', (e) => erroresConsola.push(`${ancho}px pageerror: ${e.message}`))
  await pagina.goto(BASE, { waitUntil: 'load' })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).waitFor({ state: 'attached', timeout: 30000 })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).setInputFiles(TOPO)
  await pagina.getByText(ESPERADO.nombresDeCalles[0], { exact: true }).first().waitFor({ timeout: 10000 })
  await pagina.getByRole('navigation', { name: 'Espacios' }).getByRole('button', { name: 'Calle', exact: true }).click()
  return pagina
}

const pantallaCalle = (pagina, nombre) =>
  pagina.getByRole('navigation', { name: 'Pantallas de la calle' }).getByRole('button', { name: nombre, exact: true }).click()

async function elegirCalle(pagina, nombre) {
  await pagina.getByLabel('Calle activa').selectOption({ label: nombre })
}

/**
 * Pasa a una pestaña de Análisis y espera a que esté pintada: la pestaña
 * marcada y algo que solo tiene ella. Sin esto, leer justo después del clic
 * puede leer la pestaña anterior.
 */
async function pestana(pagina, nombre) {
  await pagina.getByRole('tab', { name: nombre, exact: true }).click()
  await pagina.locator('[role=tab][aria-selected=true]', { hasText: new RegExp(`^${nombre}$`) }).waitFor({ timeout: 10000 })
  const panel = pagina.getByRole('tabpanel')
  const propio = {
    Espesores: panel.getByLabel('Capa de abajo en la comparación').or(panel.getByText(/hacen falta dos nivelaciones de esta calle/)),
    Volúmenes: panel.getByLabel('Superficie de arriba'),
    Drenaje: panel.getByLabel('Capa analizada'),
  }[nombre]
  await propio.first().waitFor({ timeout: 10000 })
}

/** La pantalla abierta (Análisis o Cierre): la sección que lleva su título. */
const seccion = (pagina, titulo) => pagina.getByRole('region', { name: titulo, exact: true })

async function sinDesplazarALoAncho(pagina, donde) {
  const ancho = await pagina.evaluate(() => {
    // El contenido se desplaza dentro de <main class="overflow-auto">: si se
    // sale a lo ancho, el documento sigue midiendo lo mismo. Se suma lo que
    // main se desplaza de lado.
    const main = document.querySelector('main')
    const deMain = main ? Math.max(0, main.scrollWidth - main.clientWidth) : 0
    return Math.max(document.documentElement.scrollWidth, window.innerWidth + deMain)
  })
  const vista = pagina.viewportSize().width
  comprobar(`${donde}: la página no se desplaza a lo ancho`, ancho <= vista, `scrollWidth ${ancho} de ${vista}`)
}

/**
 * Captura de la página entera. La app desplaza dentro de <main> (la página
 * mide lo que la ventana), así que `fullPage` cortaría la pantalla: mientras
 * se captura, <main> y sus contenedores crecen a todo su contenido, y luego
 * vuelven como estaban.
 */
async function capturar(pagina, ruta) {
  await pagina.evaluate(() => {
    for (let el = document.querySelector('main'); el; el = el.parentElement) {
      el.dataset.estiloAntes = el.getAttribute('style') ?? ''
      el.style.height = 'auto'
      el.style.maxHeight = 'none'
      el.style.overflow = 'visible'
    }
  })
  await pagina.screenshot({ path: ruta, fullPage: true })
  await pagina.evaluate(() => {
    for (let el = document.querySelector('main'); el; el = el.parentElement) {
      el.setAttribute('style', el.dataset.estiloAntes ?? '')
      delete el.dataset.estiloAntes
    }
  })
}

/** Botones, pestañas, selectores y campos visibles de la pantalla que miden menos de 44 px de alto. */
async function controlesBajos(pagina, titulo) {
  return seccion(pagina, titulo).evaluate((raiz) => {
    const bajos = []
    for (const el of raiz.querySelectorAll('button, select, input:not([type=checkbox]), [role=tab]')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.height < 43.5) bajos.push(`${el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 30)} (${Math.round(r.height)} px)`)
    }
    return bajos
  })
}

/** Elige la base sobre la subrasante de Av. Sol en el selector de Espesores. */
async function compararBaseSobreSubrasante(pagina) {
  await pagina.getByLabel('Capa de abajo en la comparación').selectOption({ label: `SUBRASANTE · ${SOL.subrasante.fecha}` })
  await pagina.getByLabel('Capa de arriba en la comparación').selectOption({ label: `BASE · ${SOL.base.fecha}` })
  await pagina.getByRole('heading', { name: 'Volumen colocado' }).waitFor({ timeout: 10000 })
}

// ===========================================================================
// 1. Laptop · Av. Sol · Análisis › Espesores
// ===========================================================================

const pagina = await abrirObra(1280, 800)
comprobar('al abrir, la calle activa es Av. Sol',
  (await pagina.getByLabel('Calle activa').locator('option:checked').innerText()) === ESPERADO.alAbrir.calle)

await pantallaCalle(pagina, 'Análisis')
const analisis = seccion(pagina, 'Análisis')
await analisis.waitFor({ timeout: 10000 })
comprobar('Calle › Análisis abre con sus tres pestañas',
  (await analisis.getByRole('tab').allInnerTexts()).join('|') === 'Espesores|Volúmenes|Drenaje')

await compararBaseSobreSubrasante(pagina)

const dato = async (titulo) =>
  (await analisis.locator('dl > div').filter({ has: pagina.locator('dt', { hasText: new RegExp(`^${titulo}$`) }) }).locator('dd').innerText()).trim()
const minimo = await dato('Mínimo')
const maximo = await dato('Máximo')
const disenio = await dato('De diseño')
comprobar('espesor mínimo = el de ESPERADO', numero(minimo) === SOL.espesores.minimoM, minimo)
comprobar('espesor máximo = el de ESPERADO', numero(maximo) === SOL.espesores.maximoM, maximo)
comprobar('espesor de diseño 0.200 m ± 10 mm', disenio.startsWith(SOL.espesores.disenioM.toFixed(3)) && disenio.includes('10 mm'), disenio)

// Las 21 celdas del mapa, por su nombre accesible.
const espesorPorCelda = {}
for (const p of SOL.progresivas) {
  for (const clave of Object.keys(OFFSETS)) {
    const celda = analisis.getByRole('button', { name: new RegExp(`^Espesor en ${progresiva(p).replace('+', '\\+')} ${nombrePunto(clave)}: `) })
    const etiqueta = (await celda.count()) === 1 ? await celda.getAttribute('aria-label') : null
    espesorPorCelda[`${p}/${clave}`] = etiqueta ? { etiqueta, texto: await celda.innerText(), m: numero(etiqueta.split(': ')[1].split(' m')[0]) } : null
  }
}
const celdasLeidas = Object.values(espesorPorCelda).filter(Boolean)
comprobar('el mapa de espesores trae las 21 celdas comparables', celdasLeidas.length === SOL.espesores.comparables, `${celdasLeidas.length}`)

const fuera = SOL.espesores.fuera[0]
const celdaFuera = espesorPorCelda[fuera.celda]
comprobar('0+080 Eje: 0.152 m, ✗ fuera y delgada',
  !!celdaFuera && celdaFuera.m === fuera.espesorM && /fuera de tolerancia, delgada$/.test(celdaFuera.etiqueta) && celdaFuera.texto.startsWith('✗'),
  celdaFuera ? `${celdaFuera.etiqueta} · «${celdaFuera.texto}»` : 'sin celda')
for (const limite of SOL.espesores.alLimite) {
  const c = espesorPorCelda[limite.celda]
  comprobar(`${limite.celda}: ${limite.espesorM.toFixed(3)} m, △ al límite${limite.delgada ? ' y delgada' : ''}`,
    !!c && c.m === limite.espesorM && c.etiqueta.includes('al límite') && c.etiqueta.endsWith(', delgada') === limite.delgada && c.texto.startsWith('△'),
    c ? `${c.etiqueta} · «${c.texto}»` : 'sin celda')
}
const conformes = celdasLeidas.filter((c) => c.texto.startsWith('✓')).length
comprobar('el resto de las celdas, ✓ conformes', conformes === SOL.espesores.comparables - 1 - SOL.espesores.alLimite.length, `${conformes}`)

const delgadas = await analisis.getByRole('region', { name: 'Celdas delgadas' }).getByRole('button').allInnerTexts()
comprobar('la lista de celdas delgadas nombra 0+080 Eje con los 48 mm que faltan',
  delgadas.some((t) => t.includes('0+080 Eje') && t.includes('0.152 m') && t.includes('faltan 48 mm')), delgadas.join(' | '))
// La delgada al límite (△) no va en el rojo de «fuera»: el mismo color que en el mapa.
const colores = await analisis.getByRole('region', { name: 'Celdas delgadas' }).getByRole('button').evaluateAll((l) =>
  l.map((b) => ({ texto: b.textContent.trim(), color: getComputedStyle(b).color })))
const colorFuera = colores.find((c) => c.texto.startsWith('✗'))?.color
const colorLimite = colores.find((c) => c.texto.startsWith('△'))?.color
comprobar('en la lista de delgadas, △ al límite y ✗ fuera no comparten color',
  !!colorFuera && !!colorLimite && colorFuera !== colorLimite, `✗ ${colorFuera} · △ ${colorLimite}`)

// Las 21 celdas contra el espesor que sale de las dos libretas del .topo
// (cota de la base − cota de la subrasante, las dos compensadas), no contra
// lo que dice el propio mapa.
const celdasDistintas = Object.entries(ESPESOR_LIBRETA).filter(([k, m]) => !espesorPorCelda[k] || Math.abs(espesorPorCelda[k].m - m) > 0.0006)
comprobar('las 21 celdas del mapa = cota base − cota subrasante sacadas de la libreta (±0.5 mm)',
  Object.keys(ESPESOR_LIBRETA).length === SOL.espesores.comparables && celdasDistintas.length === 0,
  celdasDistintas.slice(0, 4).map(([k, m]) => `${k}: pantalla ${espesorPorCelda[k]?.m}, libreta ${m.toFixed(4)}`).join('; '))
// La libreta rehecha a mano también tiene que dar lo de ESPERADO: si no, la cuenta propia estaría mal.
const difSubDistintas = Object.entries(SOL.subrasante.diferenciasMm).filter(([k, mm]) => Math.abs(DIF_SOL_SUB[k] - mm) > 0.5)
comprobar('la libreta rehecha a mano da las diferencias de la subrasante de ESPERADO',
  difSubDistintas.length === 0, difSubDistintas.map(([k, mm]) => `${k}: ${DIF_SOL_SUB[k]?.toFixed(1)} vs ${mm}`).join('; '))
comprobar('la libreta rehecha a mano da el espesor fuera y los al límite de ESPERADO',
  [...SOL.espesores.fuera, ...SOL.espesores.alLimite].every((c) => Math.abs(ESPESOR_LIBRETA[c.celda] - c.espesorM) <= 0.0006))

// Volumen colocado: áreas medias con los espesores de la libreta.
const volColocado = volumenes(ESPESOR_LIBRETA, SOL.progresivas)
const textoVolumen = await analisis.getByRole('region', { name: 'Volumen colocado' }).innerText()
const volPantalla = numero(textoVolumen.match(/([\d.]+) m³/)?.[1] ?? 'NaN')
comprobar('volumen colocado = áreas medias de los espesores de la libreta',
  Math.abs(volPantalla - volColocado.corte) <= 0.051 && volColocado.relleno === 0,
  `pantalla ${volPantalla} m³, cuenta propia ${volColocado.corte.toFixed(2)} m³ (diseño ${(0.2 * 7.2 * 120).toFixed(1)})`)
comprobar('con las dos tomas cerradas, el volumen colocado no se marca «no comprobado»', !NO_COMPROBADO.test(textoVolumen), textoVolumen.split('\n').slice(1, 2).join(''))

await capturar(pagina, `${SALIDA}/analisis-espesores-1280.png`)

// ===========================================================================
// 2. Laptop · Av. Sol · Análisis › Volúmenes (subrasante contra proyecto)
// ===========================================================================

await pestana(pagina, 'Volúmenes')
const arriba = await analisis.getByLabel('Superficie de arriba').locator('option:checked').innerText()
const abajo = await analisis.getByLabel('Superficie de abajo').locator('option:checked').innerText()
comprobar('Volúmenes arranca con lo medido de la toma activa contra su capa de proyecto',
  arriba === `Medido · SUBRASANTE · ${SOL.subrasante.fecha}` && abajo === 'Proyecto · SUBRASANTE', `${arriba} / ${abajo}`)
const total = async (rotulo) => numero(await analisis.locator('dl > div').filter({ hasText: rotulo }).locator('dd').first().innerText())
const corte = await total('Corte (sobra)')
const relleno = await total('Relleno (falta)')
comprobar('corte = el que sale de las diferencias de ESPERADO',
  Math.abs(corte - subrasanteContraProyecto.corte) <= 0.051, `pantalla ${corte} m³, cuenta propia ${subrasanteContraProyecto.corte.toFixed(3)} m³`)
comprobar('relleno = el que sale de las diferencias de ESPERADO',
  Math.abs(relleno - subrasanteContraProyecto.relleno) <= 0.051, `pantalla ${relleno} m³, cuenta propia ${subrasanteContraProyecto.relleno.toFixed(3)} m³`)
comprobar('seis tramos de 20 m en «Volumen por tramo»',
  (await analisis.getByRole('list', { name: 'Volumen por tramo' }).getByRole('listitem').count()) === SOL.progresivas.length - 1)
comprobar('la subrasante de Av. Sol cerró: sus volúmenes no se marcan «no comprobado»', !NO_COMPROBADO.test(await analisis.innerText()))
comprobar('los viajes de volquete van en singular cuando es uno', !/\b1 viajes\b/.test(await analisis.innerText()))
await capturar(pagina, `${SALIDA}/analisis-volumenes-1280.png`)

// ===========================================================================
// 2b. Laptop · Av. Sol · Análisis › Drenaje: qué capa se analiza y su bombeo
// ===========================================================================

/** Lee la tabla de bombeo y la compara fila a fila con la cuenta propia. */
async function revisarBombeo(analisis, esperados, nombre) {
  const filas = await analisis.getByRole('table', { name: 'Bombeo por progresiva' }).locator('tbody tr').evaluateAll((trs) =>
    trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())))
  const malas = []
  for (const e of esperados) {
    const fila = filas.find((f) => f[0] === progresiva(e.p) && f[1] === e.lado)
    if (!fila) { malas.push(`${progresiva(e.p)} ${e.lado}: sin fila`); continue }
    const ok = Math.abs(numero(fila[2]) - e.medido) <= 0.006 && numero(fila[3]) === BOMBEO_PROYECTO && fila[4].startsWith(e.simbolo)
    if (!ok) malas.push(`${progresiva(e.p)} ${e.lado}: pantalla ${fila[2]} / ${fila[3]} «${fila[4]}», cuenta ${e.medido.toFixed(2)} ${e.simbolo}`)
  }
  comprobar(`${nombre}: las ${esperados.length} filas del bombeo = 2 % + (dif eje − dif borde)/36, con su símbolo`,
    filas.length === esperados.length && malas.length === 0, malas.slice(0, 4).join(' | ') || `${filas.length} filas`)
  return filas
}

await pestana(pagina, 'Drenaje')
const capaAnalizada = analisis.getByLabel('Capa analizada')
comprobar('Drenaje dice qué capa analiza: la subrasante de Av. Sol, la toma activa al abrir',
  (await capaAnalizada.locator('option:checked').innerText()) === `SUBRASANTE · ${SOL.subrasante.fecha}`,
  await capaAnalizada.locator('option:checked').innerText())
const bombeoSub = bombeosEsperados(SOL.subrasante.diferenciasMm, SOL.progresivas)
const filasSub = await revisarBombeo(analisis, bombeoSub, 'bombeo de la subrasante de Av. Sol')
const fila080 = filasSub.filter((f) => f[0] === '0+080').map((f) => `${f[1]} ${f[2]} ${f[4]}`)
comprobar('subrasante de Av. Sol: el bombeo de 0+080 sale ✗ fuera a los dos lados (eje alto 54 mm)',
  filasSub.filter((f) => f[0] === '0+080').every((f) => f[4].startsWith('✗')), fila080.join(' | '))
comprobar('subrasante de Av. Sol: 0+040 derecha △ al límite (borde bajo 26 mm)',
  filasSub.find((f) => f[0] === '0+040' && f[1] === 'derecha')?.[4].startsWith('△') === true)

await capaAnalizada.selectOption({ label: `BASE · ${SOL.base.fecha}` })
await analisis.getByLabel('Capa analizada').locator('option:checked', { hasText: 'BASE' }).waitFor({ state: 'attached', timeout: 10000 })
comprobar('elegir la base en «Capa analizada» la hace la capa activa (la cabecera de Cierre la nombra)',
  await (async () => {
    await pantallaCalle(pagina, 'Cierre')
    const ok = (await pagina.getByText(`${SOL.nombre} · BASE · ${SOL.base.fecha}`).count()) === 1
    await pantallaCalle(pagina, 'Análisis')
    await pestana(pagina, 'Drenaje')
    return ok
  })())
comprobar('al volver, Drenaje sigue en la base',
  (await analisis.getByLabel('Capa analizada').locator('option:checked').innerText()) === `BASE · ${SOL.base.fecha}`)
await revisarBombeo(analisis, bombeosEsperados(DIF_SOL_BASE, SOL.progresivas), 'bombeo de la base de Av. Sol (desde la libreta)')
await capturar(pagina, `${SALIDA}/analisis-drenaje-sol-base-1280.png`)

// ===========================================================================
// 3. Laptop · Jr. Lima · Análisis › Drenaje, Volúmenes y Espesores
// ===========================================================================

await elegirCalle(pagina, LIMA.nombre)
await analisis.getByText(LIMA.nombre, { exact: true }).waitFor()
await pestana(pagina, 'Drenaje')
await analisis.getByRole('list', { name: 'Resumen del drenaje' }).waitFor({ timeout: 10000 })
const textoDrenaje = await analisis.innerText()
comprobar('el drenaje de Jr. Lima se dice NO COMPROBADO (la nivelación no cerró)',
  NO_COMPROBADO.test(textoDrenaje) && textoDrenaje.includes('no se ha cerrado contra un BM'))
comprobar('drenaje por el eje de fábrica',
  (await analisis.getByLabel('Punto del perfil').locator('option:checked').innerText()) === 'Eje')
comprobar('Drenaje de Jr. Lima nombra su capa: la subrasante del 02/10',
  (await analisis.getByLabel('Capa analizada').locator('option:checked').innerText()) === `SUBRASANTE · ${LIMA.subrasante.fecha}`)

// Bombeo: el eje hundido 60 mm en 0+140 tumba el bombeo a los dos lados.
const filasLima = await revisarBombeo(analisis, bombeosEsperados(LIMA.subrasante.diferenciasMm, LIMA.progresivas), 'bombeo de Jr. Lima')
const lima140 = filasLima.filter((f) => f[0] === progresiva(LIMA.drenaje.empozamiento.progresiva))
comprobar('Jr. Lima 0+140: bombeo +0.67 % y +0.58 % contra +2.00 %, ✗ fuera y más tendido',
  lima140.length === 2 && lima140.every((f) => f[4].startsWith('✗') && f[4].includes('más tendido')) &&
    lima140.map((f) => f[2]).join('|') === '+0.67 %|+0.58 %',
  lima140.map((f) => `${f[1]} ${f[2]} ${f[4]}`).join(' | '))

// Pendiente por tramo del eje: 0.20 % de proyecto + (dif siguiente − dif anterior) / 200.
const tramosEje = await analisis.getByRole('list', { name: 'Sentido del agua por tramo' }).getByRole('listitem').evaluateAll((l) => l.map((e) => e.getAttribute('aria-label')))
const pendientesMalas = []
for (let i = 0; i + 1 < LIMA.progresivas.length; i += 1) {
  const [a, b] = [LIMA.progresivas[i], LIMA.progresivas[i + 1]]
  const esperada = LIMA.rasante.pendiente + (LIMA.subrasante.diferenciasMm[`${b}/p-eje`] - LIMA.subrasante.diferenciasMm[`${a}/p-eje`]) / ((b - a) * 10)
  const etiqueta = tramosEje.find((t) => t.startsWith(`${progresiva(a)} a ${progresiva(b)}:`))
  const leida = etiqueta ? numero(etiqueta.split(': ')[1].match(/[−+]?\d+\.\d+ %/)?.[0] ?? 'NaN') : NaN
  const proyecto = etiqueta?.match(/proyecto ([−+]?\d+\.\d+) %/)?.[1]
  if (!(Math.abs(leida - esperada) <= 0.006) || numero(proyecto ?? 'NaN') !== LIMA.rasante.pendiente) {
    pendientesMalas.push(`${progresiva(a)}–${progresiva(b)}: pantalla «${etiqueta}», cuenta ${esperada.toFixed(2)} %`)
  }
}
comprobar('pendiente de cada tramo del eje = 0.20 % + (dif siguiente − dif anterior)/200; la contrapendiente da −0.10 %',
  tramosEje.length === LIMA.progresivas.length - 1 && pendientesMalas.length === 0 &&
    tramosEje.some((t) => t.startsWith('0+120 a 0+140:') && t.includes('−0.10 %') && t.includes('contrapendiente')),
  pendientesMalas.join(' | ') || `${tramosEje.length} tramos`)

const bajos = await analisis.getByRole('list', { name: 'Puntos bajos' }).getByRole('listitem').allInnerTexts()
const emp = LIMA.drenaje.empozamiento
const bajoExtremo = LIMA.drenaje.puntoBajoExtremo
comprobar('el empozamiento de 0+140 sale con su cota y sus 20 mm',
  bajos.some((t) => t.startsWith('✗') && t.includes(progresiva(emp.progresiva)) && t.includes(emp.cota.toFixed(3)) && t.includes(`${emp.profundidadMm} mm`)), bajos.join(' | '))
comprobar('el punto bajo del extremo 0+100 se marca con △ y pide mirar más allá',
  bajos.some((t) => t.startsWith('△') && t.includes(progresiva(bajoExtremo.progresiva)) && t.includes(bajoExtremo.cota.toFixed(3)) && t.includes('extremo')), bajos.join(' | '))
const tramos = await analisis.getByRole('list', { name: 'Sentido del agua por tramo' }).getByRole('listitem').evaluateAll((l) => l.map((e) => e.getAttribute('aria-label')))
const contra = LIMA.drenaje.contrapendiente
const tramoContra = tramos.filter((t) => t.includes('contrapendiente'))
comprobar('el único tramo a contrapendiente es 0+120 a 0+140',
  tramoContra.length === 1 && tramoContra[0].startsWith(`${progresiva(contra.desde)} a ${progresiva(contra.hasta)}`), tramoContra.join(' | '))
const resumen = await analisis.getByRole('list', { name: 'Resumen del drenaje' }).innerText()
comprobar('el resumen dice 1 empozamiento, 1 tramo a contrapendiente y 2 puntos bajos',
  resumen.includes('1 empozamiento') && resumen.includes('1 tramo a contrapendiente') && resumen.includes('2 puntos bajos'), resumen.replace(/\n/g, ' | '))
await capturar(pagina, `${SALIDA}/analisis-drenaje-lima-1280.png`)

await pestana(pagina, 'Volúmenes')
comprobar('los volúmenes de Jr. Lima se dicen NO COMPROBADOS',
  (await analisis.getByRole('tabpanel').getByText(/VOLÚMENES NO COMPROBADOS/).count()) === 1)
await pestana(pagina, 'Espesores')
comprobar('Jr. Lima tiene una sola toma: Espesores dice que falta la otra capa',
  (await analisis.getByRole('tabpanel').getByText(/hacen falta dos nivelaciones de esta calle/).count()) === 1)

// ===========================================================================
// 4. Laptop · Cierre de Jr. Lima (no cerró)
// ===========================================================================

await pantallaCalle(pagina, 'Cierre')
const cierre = seccion(pagina, 'Cierre')
await cierre.waitFor({ timeout: 10000 })
const textoLima = await cierre.innerText()
comprobar('el cierre de Jr. Lima dice que lo medido queda NO COMPROBADO', NO_COMPROBADO.test(textoLima), textoLima.split('\n').find((l) => NO_COMPROBADO.test(l)) ?? '')
// Es un circuito cerrado al que le falta su BM: no se le llama «abierto».
comprobar(`dice «△ Falta cerrar en ${LIMA.subrasante.cierre.bmQueFalta}», no «circuito abierto»`,
  textoLima.includes(`△ Falta cerrar en ${LIMA.subrasante.cierre.bmQueFalta}`) && !/circuito abierto/i.test(textoLima))
// El veredicto «✓ Cierra» vive en la región «Veredicto del cierre»: sin cierre no se pinta.
comprobar('Jr. Lima no se da por cerrada (ni veredicto «Cierra» ni compensación)',
  (await cierre.getByRole('region', { name: 'Veredicto del cierre' }).count()) === 0 &&
    !/✓ Cierra/.test(textoLima) &&
    (await cierre.getByRole('table', { name: 'Corrección por estación' }).count()) === 0)
const recorridoLima = await cierre.getByRole('list', { name: 'Recorrido de la nivelación' }).innerText()
comprobar(`el recorrido de Jr. Lima dice que falta visar el ${LIMA.subrasante.cierre.bmQueFalta}`,
  recorridoLima.includes(`${LIMA.subrasante.cierre.bmQueFalta} (falta visar)`), recorridoLima.replace(/\n/g, ' '))
comprobar(`ofrece la lectura de cierre en ${LIMA.subrasante.cierre.bmQueFalta}`,
  (await cierre.getByRole('heading', { name: `Lectura de cierre en ${LIMA.subrasante.cierre.bmQueFalta}` }).count()) === 1)
const aisLima = (await cierre.getByRole('list', { name: 'Recorrido de la nivelación' }).getByText(/^AI /).allInnerTexts()).map(numero)
comprobar('el recorrido de Jr. Lima trae sus alturas instrumentales',
  JSON.stringify(aisLima) === JSON.stringify(LIMA.subrasante.alturasInstrumentales), aisLima.join(', '))

// Lo que Max lleva a la obra para cerrar Jr. Lima: lectura exacta = AI de la
// última estación − cota del BM-2, y el rango ± 12·√K (K de la pantalla).
const bmQueFalta = ESPERADO.bms.find((b) => b.nombre === LIMA.subrasante.cierre.bmQueFalta)
const aiUltima = LIMA.subrasante.alturasInstrumentales.at(-1)
const exacta = aiUltima - bmQueFalta.cota
const kmLima = numero(await cierre.getByLabel('Longitud K').inputValue())
const holguraM = (12 * Math.sqrt(kmLima)) / 1000
const lecturaCierre = cierre.getByRole('region', { name: 'Lectura de cierre' })
const datoCierre = async (rotulo) =>
  (await lecturaCierre.locator('dl > div').filter({ has: pagina.locator('dt', { hasText: new RegExp(`^${rotulo}$`) }) }).locator('dd').innerText()).trim()
const textoExacta = await datoCierre('Para cerrar exacto')
const textoRango = await datoCierre('Pasa si lees entre')
comprobar(`para cerrar exacto en ${bmQueFalta.nombre}: ${aiUltima.toFixed(3)} − ${bmQueFalta.cota.toFixed(3)} = ${exacta.toFixed(3)}`,
  textoExacta === exacta.toFixed(3) && (await datoCierre('Cota del BM')) === bmQueFalta.cota.toFixed(3), textoExacta)
// Los límites son lecturas al mm que el cierre acepta: redondeados hacia dentro.
const rangoMin = (Math.ceil((exacta - holguraM) * 1000 - 1e-6) / 1000).toFixed(3)
const rangoMax = (Math.floor((exacta + holguraM) * 1000 + 1e-6) / 1000).toFixed(3)
comprobar(`pasa si lee entre ${rangoMin} y ${rangoMax} (12·√${kmLima} = ±${(holguraM * 1000).toFixed(1)} mm, al mm hacia dentro)`,
  kmLima > 0 && textoRango === `${rangoMin} y ${rangoMax}`, textoRango)
// Cada límite del rango, probado en el campo, cierra.
await probarLectura(Number(rangoMin))
await probarLectura(Number(rangoMax))
/** Prueba una lectura en el campo y compara el veredicto con la cuenta propia. */
async function probarLectura(valor) {
  await lecturaCierre.getByLabel('Lectura en el BM de cierre').fill(valor.toFixed(3))
  const errorMm = (aiUltima - valor - bmQueFalta.cota) * 1000
  const pasa = Math.abs(errorMm) <= holguraM * 1000
  const mm = Math.abs(errorMm).toFixed(1)
  const errorTexto = Number(mm) === 0 ? `${mm} mm` : `${errorMm < 0 ? '−' : '+'}${mm} mm`
  const esperado = `${pasa ? '✓ ' : '✗ '}Con ${valor.toFixed(3)}: ${pasa ? 'cierra' : 'no cierra'}, error ${errorTexto}`
  const linea = lecturaCierre.getByText(new RegExp(`^${pasa ? '✓' : '✗'} Con ${valor.toFixed(3).replace('.', '\\.')}:`))
  await linea.waitFor({ timeout: 10000 }).catch(() => {})
  const leida = (await linea.count()) === 1 ? (await linea.innerText()).trim() : '(no aparece)'
  comprobar(`probar ${valor.toFixed(3)} en ${bmQueFalta.nombre}: «${esperado}»`, leida.startsWith(esperado), leida)
}
await probarLectura(Number(exacta.toFixed(3)))
await probarLectura(Number((exacta + 0.007).toFixed(3)))
await lecturaCierre.getByLabel('Lectura en el BM de cierre').fill('')
await capturar(pagina, `${SALIDA}/cierre-lima-1280.png`)

// ===========================================================================
// 5. Laptop · Cierre de Av. Sol: subrasante (al abrir otra vez) y base
// ===========================================================================

/** Lo común a las dos tomas cerradas de Av. Sol. */
async function revisarCierreCerrado(cierre, toma, nombre) {
  const c = toma.cierre
  await cierre.getByRole('region', { name: 'Veredicto del cierre' }).waitFor({ timeout: 10000 })
  const veredicto = await cierre.getByRole('region', { name: 'Veredicto del cierre' }).innerText()
  comprobar(`${nombre}: «✓ Cierra» con su símbolo`, /^✓ Cierra/.test(veredicto.trim()), veredicto.split('\n')[0])
  const barra = await cierre.getByRole('img', { name: /^Error / }).getAttribute('aria-label')
  const [, err, tol] = barra.match(/^Error (\S+) mm contra una tolerancia de ±(\S+) mm$/) ?? []
  comprobar(`${nombre}: error ${c.errorMm} mm`, Math.round(numero(err)) === c.errorMm, barra)
  comprobar(`${nombre}: tolerancia 12·√${c.longitudK} = ±${c.toleranciaMm} mm`,
    Math.abs(numero(tol) - 12 * Math.sqrt(c.longitudK)) <= 0.05 && Math.abs(numero(tol) - c.toleranciaMm) <= 0.05, barra)
  comprobar(`${nombre}: k = 12 elegido y K = ${c.longitudK} km`,
    (await cierre.getByRole('button', { name: 'k = 12' }).getAttribute('aria-pressed')) === 'true' &&
      Math.abs(numero(await cierre.getByLabel('Longitud K').inputValue()) - c.longitudK) < 0.0005,
    await cierre.getByLabel('Longitud K').inputValue())

  const filas = await cierre.getByRole('table', { name: 'Corrección por estación' }).locator('tbody tr').evaluateAll((trs) =>
    trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())))
  comprobar(`${nombre}: la compensación trae una fila por estación`, filas.length === toma.alturasInstrumentales.length, `${filas.length}`)
  const ais = filas.map((f) => numero(f[1]))
  comprobar(`${nombre}: las alturas instrumentales son las de ESPERADO (±1 mm)`,
    ais.every((ai, i) => Math.abs(ai - toma.alturasInstrumentales[i]) <= 0.0011), ais.join(', '))
  const correcciones = filas.map((f) => numero(f[2]))
  const ultima = correcciones.at(-1)
  comprobar(`${nombre}: la última corrección anula el error (${-c.errorMm} mm)`, Math.round(ultima) === -c.errorMm, filas.map((f) => f[2]).join(', '))
  comprobar(`${nombre}: la corrección se reparte creciendo estación por estación`,
    correcciones.every((v, i) => i === 0 || Math.abs(v) >= Math.abs(correcciones[i - 1])), correcciones.join(', '))
  comprobar(`${nombre}: sin «no comprobado» en el cierre`, !NO_COMPROBADO.test(await cierre.innerText()))
}

await elegirCalle(pagina, SOL.nombre) // activa su última toma: la base
await pagina.getByText(`${SOL.nombre} · BASE · ${SOL.base.fecha}`).waitFor({ timeout: 10000 })
await revisarCierreCerrado(cierre, SOL.base, 'base de Av. Sol')

// La base se abre ya compensada con k = 12 y K = 0.240. Para probar la
// acción se cambia K: deja de estar aplicada y aparece el botón; al pulsarlo
// se guarda y vuelve a decir «aplicada», con la tolerancia del K nuevo.
const aplicada = cierre.getByText(/Compensación aplicada/)
const aplicar = cierre.getByRole('button', { name: 'Aplicar compensación' })
comprobar('base de Av. Sol: al abrir, la compensación guardada se dice «aplicada» y no hay botón',
  (await aplicada.count()) === 1 && (await aplicar.count()) === 0)
await cierre.getByLabel('Longitud K').fill('0.25')
await aplicar.waitFor({ timeout: 10000 })
comprobar('con otro K, la compensación ya no se dice aplicada y aparece «Aplicar compensación»',
  (await aplicada.count()) === 0 && (await aplicar.count()) === 1)
await aplicar.click()
await aplicada.waitFor({ timeout: 10000 })
const barraNueva = await cierre.getByRole('img', { name: /^Error / }).getAttribute('aria-label')
comprobar('al aplicar se guarda: dice «Compensación aplicada», sin botón, y la tolerancia es 12·√0.25 = ±6.0 mm',
  (await aplicada.count()) === 1 && (await aplicar.count()) === 0 && barraNueva.endsWith('±6.0 mm'), barraNueva)
await capturar(pagina, `${SALIDA}/cierre-sol-base-1280.png`)

// La subrasante es la primera toma de Av. Sol: la que queda activa al abrir.
const pagina2 = await abrirObra(1280, 800)
await pantallaCalle(pagina2, 'Cierre')
const cierre2 = seccion(pagina2, 'Cierre')
await cierre2.waitFor({ timeout: 10000 })
comprobar('al abrir la obra, Cierre es el de la subrasante de Av. Sol',
  (await cierre2.getByText(`${SOL.nombre} · SUBRASANTE · ${SOL.subrasante.fecha}`).count()) === 1)
await revisarCierreCerrado(cierre2, SOL.subrasante, 'subrasante de Av. Sol')
await capturar(pagina2, `${SALIDA}/cierre-sol-subrasante-1280.png`)
await pagina2.close()

// ===========================================================================
// 6. Celular (390×844)
// ===========================================================================

const celular = await abrirObra(390, 844)
await pantallaCalle(celular, 'Análisis')
await seccion(celular, 'Análisis').waitFor({ timeout: 10000 })
await compararBaseSobreSubrasante(celular)
await sinDesplazarALoAncho(celular, 'Análisis › Espesores en el celular')
const bajosEsp = await controlesBajos(celular, 'Análisis')
comprobar('Análisis › Espesores en el celular: botones y selectores de ≥ 44 px', bajosEsp.length === 0,
  `${bajosEsp.length} bajos: ${bajosEsp.slice(0, 6).join('; ')}`)
await capturar(celular, `${SALIDA}/analisis-espesores-390.png`)

await pestana(celular, 'Volúmenes')
await sinDesplazarALoAncho(celular, 'Análisis › Volúmenes en el celular')
const bajosVol = await controlesBajos(celular, 'Análisis')
comprobar('Análisis › Volúmenes en el celular: controles de ≥ 44 px', bajosVol.length === 0, bajosVol.join('; '))
await capturar(celular, `${SALIDA}/analisis-volumenes-390.png`)

await elegirCalle(celular, LIMA.nombre)
await pestana(celular, 'Drenaje')
await seccion(celular, 'Análisis').getByRole('list', { name: 'Resumen del drenaje' }).waitFor({ timeout: 10000 })
await sinDesplazarALoAncho(celular, 'Análisis › Drenaje en el celular')
const bajosDren = await controlesBajos(celular, 'Análisis')
comprobar('Análisis › Drenaje en el celular: controles de ≥ 44 px', bajosDren.length === 0, bajosDren.join('; '))
await capturar(celular, `${SALIDA}/analisis-drenaje-lima-390.png`)

await pantallaCalle(celular, 'Cierre')
await seccion(celular, 'Cierre').waitFor({ timeout: 10000 })
comprobar('en el celular, el cierre de Jr. Lima dice NO COMPROBADO', NO_COMPROBADO.test(await seccion(celular, 'Cierre').innerText()))
await sinDesplazarALoAncho(celular, 'Cierre de Jr. Lima en el celular')
const bajosCierreLima = await controlesBajos(celular, 'Cierre')
comprobar('Cierre de Jr. Lima en el celular: controles de ≥ 44 px', bajosCierreLima.length === 0, bajosCierreLima.join('; '))
await capturar(celular, `${SALIDA}/cierre-lima-390.png`)

await elegirCalle(celular, SOL.nombre)
await seccion(celular, 'Cierre').getByRole('region', { name: 'Veredicto del cierre' }).waitFor({ timeout: 10000 })
comprobar('en el celular, la base de Av. Sol «✓ Cierra»',
  /^✓ Cierra/.test((await seccion(celular, 'Cierre').getByRole('region', { name: 'Veredicto del cierre' }).innerText()).trim()))
await sinDesplazarALoAncho(celular, 'Cierre de Av. Sol en el celular')
const bajosCierreSol = await controlesBajos(celular, 'Cierre')
comprobar('Cierre de Av. Sol en el celular: controles de ≥ 44 px', bajosCierreSol.length === 0, bajosCierreSol.join('; '))
await capturar(celular, `${SALIDA}/cierre-sol-390.png`)

await navegador.close()

comprobar('sin errores en la consola del navegador', erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 ? 0 : 1)
