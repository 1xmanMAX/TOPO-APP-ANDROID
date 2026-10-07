import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Calle › Planificar y su Guía de campo, con la pista empinada de la obra
 * simulada (Psje. Las Lomas, +7.38 %), en un navegador real:
 *
 *  - con la rasante: dos controles (inicio y fin), un tramo de 4 estaciones
 *    y 3 cambios que cumple; se guarda en la calle y la guía lo recorre paso
 *    a paso (dónde plantar, qué leer atrás y adelante, dónde clavar el PC);
 *  - con las cotas del plano: las tres cotas del DXF, y el aviso de que la
 *    calle guarda otro plan;
 *  - con el perfil digitado con quiebres (inyectado en localStorage como lo
 *    deja el planificador): controles en cada quiebre con su porqué, y los
 *    dos tramos que no cumplen el 2σ√(2n) ≤ k√K dichos en pantalla con el
 *    paso medio que haría falta, también en la guía;
 *  - en el celular, con 2 cambios como máximo: aparece un control «para no
 *    pasar de 2 cambios» y ningún tramo pasa de ese número.
 *
 * En todos: ningún tramo pasa del máximo de cambios, las visuales no pasan
 * de 50 m ni se desequilibran más de 5 m, y las lecturas quedan entre 0.30 y
 * 4.70 m. Todo se lee de la pantalla (al centímetro, como la muestra) y se
 * compara con ESPERADO.
 *
 * Uso: node verificacion/planificador.mjs <carpeta-de-salida>
 * La URL sale de BASE (por defecto http://localhost:4173/).
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })

const ESPERADO = JSON.parse(readFileSync(new URL('./datos/obra-simulada.esperado.json', import.meta.url), 'utf8'))
const TOPO = fileURLToPath(new URL(ESPERADO.archivo.rutaDesdeGuion, import.meta.url))
const LOMAS = ESPERADO.lasLomas

// Reglas de fábrica (sección 2 del diseño). Las lecturas se muestran al
// centímetro y las progresivas al centímetro: se deja 1 cm de holgura.
const VISUAL_MAX = 50
const DESEQUILIBRIO_MAX = 5
const LECTURA_MIN = 0.3
const LECTURA_MAX = 4.7
const MAX_CAMBIOS = 4
const HOLGURA = 0.011

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

const navegador = await chromium.launch()
const erroresConsola = []

/** «0+015.50» → 15.5; «1+020» → 1020. */
function metros(texto) {
  const m = /(\d+)\+(\d{3}(?:\.\d+)?)/.exec(texto)
  return m ? Number(m[1]) * 1000 + Number(m[2]) : NaN
}
function progresivas(texto) {
  return [...texto.matchAll(/\d+\+\d{3}(?:\.\d+)?/g)].map((m) => metros(m[0]))
}
function lecturas(texto) {
  return [...texto.matchAll(/≈\s*(\d+\.\d+)/g)].map((m) => Number(m[1]))
}
const casi = (a, b, tol = HOLGURA) => Math.abs(a - b) <= tol
/** «0+010 ≈ 1.87 · 0+020 ≈ 1.13» → [{ progresiva: 10, lectura: 1.87 }, …] */
function lecturasConProgresiva(texto) {
  return [...texto.matchAll(/(\d+\+\d{3}(?:\.\d+)?)\s*≈\s*(\d+\.\d+)/g)].map((m) => ({
    progresiva: metros(m[1]),
    lectura: Number(m[2]),
  }))
}

/** La cota del perfil en una progresiva: interpolación lineal entre vértices. */
function cotaEn(vertices, p) {
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1]
    const b = vertices[i]
    if (p <= b.progresiva + 1e-9 || i === vertices.length - 1)
      return a.cota + ((b.cota - a.cota) * (p - a.progresiva)) / (b.progresiva - a.progresiva)
  }
  return vertices[0].cota
}

// Los perfiles de Las Lomas, de ESPERADO: con ellos se calcula lo que debe marcar la mira.
const PERFIL_RASANTE = [
  { progresiva: LOMAS.pista.desde, cota: LOMAS.rasante.cotaArranque },
  { progresiva: LOMAS.pista.hasta, cota: LOMAS.rasante.cotaFin },
]
const PERFIL_PLANO = LOMAS.cotasDelPlano
const PERFIL_QUIEBRES = LOMAS.perfilConQuiebres
// Las lecturas se muestran al centímetro: ±2 cm cubren dos redondeos.
const TOL_LECTURA = 0.02

/**
 * Las lecturas de mira de una estación contra el perfil. Atrás − adelante =
 * cota(adelante) − cota(atrás) (al subir, atrás marca más que adelante), y
 * cada intermedia = AI − cota, con AI = cota(atrás) + atrás. Así una lectura
 * cambiada de lado o una pendiente al revés no pasa.
 */
function desviosDeLecturas(e, perfil) {
  const desvios = []
  const cAtras = cotaEn(perfil, e.atras.progresiva)
  const cAdelante = cotaEn(perfil, e.adelante.progresiva)
  const desnivel = e.atras.lectura - e.adelante.lectura
  if (!(Math.abs(desnivel - (cAdelante - cAtras)) <= TOL_LECTURA))
    desvios.push(`atrás−adelante ${desnivel.toFixed(2)} ≠ ${(cAdelante - cAtras).toFixed(3)}`)
  const ai = cAtras + e.atras.lectura
  for (const l of e.intermedias) {
    const esperada = ai - cotaEn(perfil, l.progresiva)
    if (!(Math.abs(l.lectura - esperada) <= TOL_LECTURA))
      desvios.push(`intermedia ${l.progresiva}: ${l.lectura} ≠ ${esperada.toFixed(3)}`)
  }
  return desvios
}

/**
 * Abre la obra en una página nueva (contexto propio: su localStorage no se
 * mezcla con el de las otras). `planificador` es lo que el planificador
 * tendría recordado en el navegador antes de abrir.
 */
async function abrirObra(ancho, alto, planificador = null) {
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } })
  pagina.on('console', (m) => {
    if (m.type() === 'error') erroresConsola.push(`${ancho}px: ${m.text()}`)
  })
  pagina.on('pageerror', (e) => erroresConsola.push(`${ancho}px pageerror: ${e.message}`))
  if (planificador)
    await pagina.addInitScript(([clave, valor]) => localStorage.setItem(clave, valor), [planificador.clave, planificador.valor])
  await pagina.goto(BASE, { waitUntil: 'load' })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).waitFor({ state: 'attached', timeout: 30000 })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).setInputFiles(TOPO)
  await pagina.getByText(ESPERADO.nombresDeCalles[0], { exact: true }).first().waitFor({ timeout: 10000 })
  return pagina
}

/**
 * Abre un plegable (<details>) por el texto de su summary, si está cerrado.
 * Un campo o un radio de un plegable cerrado no se ve y no se puede tocar.
 */
async function abrirPlegable(pagina, texto) {
  const resumen = pagina.locator('summary').filter({ hasText: texto }).first()
  if ((await resumen.count()) === 0) return false
  if (!(await resumen.locator('xpath=..').evaluate((d) => d.open))) await resumen.click()
  return true
}

/**
 * El perfil y las reglas del nivel van plegados en Planificar: se abren para
 * tocarlos. En el celular también las listas (estaciones, controles, tramos):
 * se abren para leerlas.
 */
async function abrirPlegablesDePlanificar(pagina) {
  await abrirPlegable(pagina, 'Perfil de la pista')
  await abrirPlegable(pagina, 'Reglas del nivel')
  await abrirPlegable(pagina, 'Estaciones')
  await abrirPlegable(pagina, 'Puntos de control')
  await abrirPlegable(pagina, 'Tramos entre controles')
}

/** Calle › (Psje. Las Lomas) › Planificar, con el perfil y las reglas abiertos. */
async function irAPlanificar(pagina) {
  await pagina.getByRole('navigation', { name: 'Espacios' }).getByRole('button', { name: 'Calle', exact: true }).click()
  await pagina.getByLabel('Calle activa').selectOption({ label: LOMAS.nombre })
  await pagina
    .getByRole('navigation', { name: 'Pantallas de la calle' })
    .getByRole('button', { name: 'Planificar', exact: true })
    .click()
  await pagina.getByRole('heading', { name: 'Planificar', level: 2 }).waitFor({ timeout: 10000 })
  await abrirPlegablesDePlanificar(pagina)
}

/** Lo que Planificar muestra del plan: estaciones de ida, controles, tramos y el veredicto. */
async function leerPlan(pagina) {
  const filas = pagina.getByRole('table', { name: 'Estaciones del plan' }).locator('tbody > tr')
  const estaciones = []
  for (let i = 0; i < (await filas.count()); i++) {
    const fila = filas.nth(i)
    const nombre = (await fila.locator('th').innerText()).trim()
    const celdas = fila.locator('td')
    const [plantar, atras, cubre, adelante] = await Promise.all([0, 1, 2, 3].map((j) => celdas.nth(j).innerText()))
    estaciones.push({
      nombre,
      estacion: progresivas(plantar)[0],
      atras: { progresiva: progresivas(atras)[0], lectura: lecturas(atras)[0], texto: atras },
      adelante: { progresiva: progresivas(adelante)[0], lectura: lecturas(adelante)[0], texto: adelante },
      intermedias: lecturas(cubre),
      intermediasConProgresiva: lecturasConProgresiva(cubre),
    })
  }
  const itemsControl = pagina.getByRole('list', { name: 'Puntos de control' }).locator(':scope > li')
  const controles = []
  for (let i = 0; i < (await itemsControl.count()); i++) {
    const texto = await itemsControl.nth(i).innerText()
    controles.push({ texto, progresiva: progresivas(texto)[0] })
  }
  const itemsTramo = pagina.getByRole('list', { name: 'Tramos entre controles' }).locator(':scope > li')
  const tramos = []
  for (let i = 0; i < (await itemsTramo.count()); i++) {
    const texto = await itemsTramo.nth(i).innerText()
    const [desde, hasta] = progresivas(texto)
    tramos.push({
      texto,
      desde,
      hasta,
      estaciones: Number(/(\d+) estaci/.exec(texto)?.[1]),
      cambios: Number(/(\d+) cambios?\b/.exec(texto)?.[1]),
      cumple: /✓\s*Cumple/.test(texto),
      noCumple: /✗\s*No cumple/.test(texto),
    })
  }
  const veredicto = await pagina
    .getByText(/El plan cumple|no cumplen?:|No se puede nivelar/)
    .first()
    .innerText()
    .catch(() => '')
  return { estaciones, controles, tramos, veredicto }
}

/** Reglas de la sección 2 sobre lo que se lee en pantalla. */
function comprobarReglas(etiqueta, plan, maxCambios = MAX_CAMBIOS) {
  const largas = []
  const desequilibradas = []
  const fueraDeMira = []
  for (const e of plan.estaciones) {
    const va = Math.abs(e.estacion - e.atras.progresiva)
    const vd = Math.abs(e.adelante.progresiva - e.estacion)
    if (Math.max(va, vd) > VISUAL_MAX + HOLGURA) largas.push(`${e.nombre} ${va.toFixed(2)}/${vd.toFixed(2)}`)
    if (Math.abs(va - vd) > DESEQUILIBRIO_MAX + HOLGURA) desequilibradas.push(`${e.nombre} ${va.toFixed(2)}/${vd.toFixed(2)}`)
    for (const l of [e.atras.lectura, e.adelante.lectura, ...e.intermedias])
      if (!(l >= LECTURA_MIN - 1e-9 && l <= LECTURA_MAX + 1e-9)) fueraDeMira.push(`${e.nombre} ${l}`)
  }
  comprobar(`${etiqueta}: hay estaciones en la tabla`, plan.estaciones.length > 0, `${plan.estaciones.length}`)
  comprobar(`${etiqueta}: ninguna visual pasa de ${VISUAL_MAX} m`, largas.length === 0, largas.join(' | '))
  comprobar(
    `${etiqueta}: atrás y adelante equilibradas a ≤ ${DESEQUILIBRIO_MAX} m`,
    desequilibradas.length === 0,
    desequilibradas.join(' | '),
  )
  const todas = plan.estaciones.flatMap((e) => [e.atras.lectura, e.adelante.lectura, ...e.intermedias])
  comprobar(
    `${etiqueta}: todas las lecturas entre ${LECTURA_MIN.toFixed(2)} y ${LECTURA_MAX.toFixed(2)} m`,
    fueraDeMira.length === 0 && todas.every(Number.isFinite),
    fueraDeMira.join(' | ') || `${todas.length} lecturas, de ${Math.min(...todas)} a ${Math.max(...todas)}`,
  )
  const muchos = plan.tramos.filter((t) => !(t.cambios <= maxCambios))
  comprobar(
    `${etiqueta}: ningún tramo pasa de ${maxCambios} cambios`,
    plan.tramos.length > 0 && muchos.length === 0,
    plan.tramos.map((t) => `${t.desde}-${t.hasta}: ${t.cambios}`).join(' | '),
  )
  // La cadena de ida es continua: cada estación lee atrás donde la anterior leyó adelante.
  const rotas = plan.estaciones.slice(1).filter((e, i) => !casi(e.atras.progresiva, plan.estaciones[i].adelante.progresiva, 1e-6))
  comprobar(`${etiqueta}: cada estación lee atrás donde la anterior leyó adelante`, rotas.length === 0, rotas.map((e) => e.nombre).join(', '))
}

/** Cada lectura de la tabla contra la que da el perfil, y el sentido de la pendiente. */
function comprobarLecturas(etiqueta, plan, perfil) {
  const malas = []
  let cuantas = 0
  for (const e of plan.estaciones) {
    cuantas += 2 + e.intermediasConProgresiva.length
    const sinProgresiva = e.intermedias.length !== e.intermediasConProgresiva.length
    if (sinProgresiva) malas.push(`${e.nombre}: intermedias sin progresiva`)
    for (const d of desviosDeLecturas({ ...e, intermedias: e.intermediasConProgresiva }, perfil))
      malas.push(`${e.nombre}: ${d}`)
  }
  comprobar(
    `${etiqueta}: cada lectura (atrás, adelante e intermedias) cuadra con el perfil a ±${TOL_LECTURA * 100} cm`,
    plan.estaciones.length > 0 && malas.length === 0,
    malas.slice(0, 4).join(' | ') || `${cuantas} lecturas`,
  )
  const suben = plan.estaciones.filter(
    (e) => cotaEn(perfil, e.adelante.progresiva) > cotaEn(perfil, e.atras.progresiva) + 0.05,
  )
  comprobar(
    `${etiqueta}: donde la pista sube, atrás marca más que adelante`,
    suben.length > 0 && suben.every((e) => e.atras.lectura > e.adelante.lectura),
    suben.map((e) => `${e.nombre} ${e.atras.lectura}/${e.adelante.lectura}`).join(' | '),
  )
}

/** El plan en pantalla contra el que da el motor (ESPERADO). */
function compararConEsperado(etiqueta, plan, esperado) {
  const progs = plan.controles.map((c) => c.progresiva)
  comprobar(
    `${etiqueta}: controles en ${esperado.controles.map((c) => c.progresiva).join(', ')}`,
    progs.length === esperado.controles.length && esperado.controles.every((c, i) => casi(c.progresiva, progs[i])),
    progs.join(', '),
  )
  const texto = { inicio: 'inicio de la pista', fin: 'fin de la pista' }
  esperado.controles.forEach((c, i) => {
    const visto = plan.controles[i]?.texto ?? ''
    for (const motivo of c.motivos) {
      const porque = c.texto ?? texto[motivo]
      comprobar(`${etiqueta}: el control en ${c.progresiva} dice su porqué «${porque}»`, visto.includes(porque), visto.replace(/\n/g, ' / '))
    }
    comprobar(
      `${etiqueta}: el control en ${c.progresiva} trae la cota prevista ${c.cota.toFixed(3)}, sin comprobar`,
      visto.includes(c.cota.toFixed(3)) && /sin comprobar/i.test(visto),
    )
  })
  comprobar(
    `${etiqueta}: ${esperado.tramos.length} tramo(s) entre controles`,
    plan.tramos.length === esperado.tramos.length,
    `${plan.tramos.length}`,
  )
  esperado.tramos.forEach((t, i) => {
    const visto = plan.tramos[i]
    if (!visto) return
    comprobar(
      `${etiqueta}: tramo ${t.desde}–${t.hasta} con ${t.estaciones} estaciones y ${t.cambios} cambios`,
      casi(visto.desde, t.desde) && casi(visto.hasta, t.hasta) && visto.estaciones === t.estaciones && visto.cambios === t.cambios,
      `${visto.desde}–${visto.hasta}, ${visto.estaciones} est, ${visto.cambios} PC`,
    )
    comprobar(
      `${etiqueta}: tramo ${t.desde}–${t.hasta} ${t.ok ? 'no se marca como falla' : 'se marca ✗ No cumple'}`,
      t.ok ? !visto.noCumple : visto.noCumple,
      visto.texto.split('\n').slice(-3).join(' / '),
    )
  })
  const totalEst = esperado.tramos.reduce((s, t) => s + t.estaciones, 0)
  comprobar(`${etiqueta}: la tabla trae las ${totalEst} estaciones de ida`, plan.estaciones.length === totalEst, `${plan.estaciones.length}`)
}

/**
 * Captura la pantalla entera. La app desplaza su contenido dentro de un
 * contenedor propio, así que `fullPage` se queda en lo que entra en la
 * ventana: se agranda la ventana a lo que mide el contenido, se captura y se
 * vuelve al tamaño de antes.
 */
async function capturar(pagina, ruta) {
  const tam = pagina.viewportSize()
  const alto = await pagina.evaluate(() =>
    Math.max(
      document.documentElement.scrollHeight,
      ...[...document.querySelectorAll('*')].map((e) => {
        const c = getComputedStyle(e).overflowY
        return (c === 'auto' || c === 'scroll') && e.scrollHeight > e.clientHeight
          ? e.scrollHeight - e.clientHeight + window.innerHeight
          : 0
      }),
    ),
  )
  await pagina.setViewportSize({ width: tam.width, height: Math.min(Math.max(alto, tam.height), 8000) })
  await pagina.screenshot({ path: ruta })
  await pagina.setViewportSize(tam)
}

/**
 * Lo que se desplaza a lo ancho: el documento, y todo elemento con overflow
 * auto o scroll cuyo contenido pase de su ancho. La app desplaza su contenido
 * dentro de <main class="overflow-auto">, así que medir solo el documento no
 * basta: un desborde lo absorbe <main> y el documento sigue en 390. Se deja
 * fuera, a propósito, el marco del dibujo del perfil (un div con su svg), que
 * se desliza de lado dentro de la página.
 */
async function desbordesAlAncho(pagina) {
  return pagina.evaluate(() => {
    const fuera = []
    const doc = document.documentElement
    if (doc.scrollWidth > doc.clientWidth) fuera.push(`documento ${doc.scrollWidth} > ${doc.clientWidth}`)
    for (const e of document.querySelectorAll('*')) {
      const ox = getComputedStyle(e).overflowX
      if (ox !== 'auto' && ox !== 'scroll') continue
      if (e.scrollWidth <= e.clientWidth + 1) continue
      if (e.children.length === 1 && e.firstElementChild.tagName.toLowerCase() === 'svg') continue
      const nombre = `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').slice(0, 2).join('.') : ''}`
      fuera.push(`${nombre} ${e.scrollWidth} > ${e.clientWidth}`)
    }
    return fuera
  })
}

/** Botones visibles de la pantalla con menos de 44 px de alto. */
async function botonesChicos(pagina, contenedor) {
  return contenedor.evaluate((raiz) =>
    [...raiz.querySelectorAll('button, label:has(input[type=radio]), input[type=text]')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ t: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 30), h: b.getBoundingClientRect().height }))
      .filter((b) => b.h < 43.5)
      .map((b) => `${b.t} (${b.h.toFixed(0)} px)`),
  )
}

/**
 * Recorre la guía de principio a fin. Compara cada paso de ida con la fila
 * de la tabla de Planificar y comprueba lo que se pide en cada uno.
 */
async function recorrerGuia(pagina, etiqueta, plan, captura, perfil) {
  const barra = pagina.getByRole('progressbar', { name: 'Avance de la guía' })
  await barra.waitFor({ timeout: 10000 })
  const total = Number(await barra.getAttribute('aria-valuemax'))
  const esperado = 2 * plan.estaciones.length
  comprobar(`${etiqueta}: la guía tiene ida y vuelta (${esperado} pasos)`, total === esperado, `${total}`)
  const antes = await pagina.getByRole('note').filter({ hasText: 'Antes de empezar' }).first().innerText().catch(() => '')
  comprobar(
    `${etiqueta}: el paso 1 recuerda llevar cota desde un BM con una nivelación cerrada`,
    /BM/.test(antes) && /nivelación cerrada/.test(antes),
    antes.replace(/\n/g, ' '),
  )

  const errores = []
  const llegadas = []
  const malasLecturas = []
  const noSeVen = []
  let idaVista = 0
  for (let i = 0; i < total; i++) {
    const tarjeta = pagina.getByRole('article')
    const texto = await tarjeta.innerText()
    const cabecera = /Estación (\d+) · tramo (\d+), (ida|vuelta)/.exec(texto)
    if (!cabecera) {
      errores.push(`paso ${i + 1}: sin cabecera`)
    } else {
      // Cada paso de la tarjeta es un bloque: «1 · Planta el nivel / ≈ 0+012», «2 · Mira atrás en … / Debería marcar ≈ …».
      const bloque = async (cual) => {
        const b = tarjeta.locator(`[data-paso="${cual}"]`)
        return (await b.count()) > 0 ? (await b.innerText()).replace(/\s+/g, ' ') : ''
      }
      const planta = await bloque('planta')
      const atras = await bloque('atras')
      const adelante = await bloque('adelante')
      if (!/Planta el nivel/.test(planta) || !/Mira atrás/.test(atras) || !/lee adelante/.test(adelante))
        errores.push(`paso ${i + 1}: faltan los pasos de la tarjeta`)
      const est = progresivas(planta)[0]
      const pa = progresivas(atras)[0]
      const pd = progresivas(adelante)[0]
      const la = lecturas(atras)[0]
      const ld = lecturas(adelante)[0]
      if (![est, pa, pd, la, ld].every(Number.isFinite)) errores.push(`paso ${i + 1}: faltan datos «${texto.replace(/\n/g, ' / ')}»`)
      for (const l of [la, ld]) if (!(l >= LECTURA_MIN && l <= LECTURA_MAX)) errores.push(`paso ${i + 1}: lectura ${l}`)
      if (Math.max(Math.abs(est - pa), Math.abs(pd - est)) > VISUAL_MAX + HOLGURA) errores.push(`paso ${i + 1}: visual larga`)
      if (Math.abs(Math.abs(est - pa) - Math.abs(pd - est)) > DESEQUILIBRIO_MAX + HOLGURA) errores.push(`paso ${i + 1}: desequilibrio`)
      if (cabecera[3] === 'ida') {
        const fila = plan.estaciones[idaVista++]
        if (
          !fila ||
          !casi(fila.estacion, est) ||
          !casi(fila.atras.progresiva, pa) ||
          !casi(fila.adelante.progresiva, pd) ||
          fila.atras.lectura !== la ||
          fila.adelante.lectura !== ld
        )
          errores.push(`paso ${i + 1} (ida) no coincide con ${fila?.nombre}: ${est} ${pa}/${la} ${pd}/${ld}`)
        // El siguiente cambio: dónde clavarlo, o el control donde se remata.
        if (!/Clava el PC \d+ en|Remata en el Control \d+/.test(adelante)) errores.push(`paso ${i + 1}: no dice dónde va el siguiente cambio`)
      } else if (!/Pon la mira en el PC \d+|Remata en el Control \d+/.test(adelante)) {
        errores.push(`paso ${i + 1} (vuelta): no dice dónde va la mira adelante`)
      }
      const llegada = /Llegaste (de vuelta )?al (Control \d+)/.exec(texto)
      if (llegada) llegadas.push(`${cabecera[3]}:${llegada[2]}`)
      // Lo que debe marcar la mira, de ida y de vuelta, contra el perfil.
      const lista = tarjeta.getByRole('list', { name: 'Lecturas esperadas' })
      const intermedias = (await lista.count()) > 0 ? lecturasConProgresiva(await lista.innerText()) : []
      for (const d of desviosDeLecturas(
        { atras: { progresiva: pa, lectura: la }, adelante: { progresiva: pd, lectura: ld }, intermedias },
        perfil,
      ))
        malasLecturas.push(`paso ${i + 1} (${cabecera[3]}): ${d}`)
      // En el celular, lo que hay que leer y la orden de cerrar se ven junto a «Hecho, siguiente», sin desplazar.
      if (pagina.viewportSize().width < 640) {
        const tapadas = await pagina.evaluate(() => {
          const barra = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().startsWith('Hecho, siguiente'))
          const tope = barra ? barra.parentElement.getBoundingClientRect().top : window.innerHeight
          const tarjeta = document.querySelector('article')
          const tapada = (el, hasta = tope) => {
            const r = el.getBoundingClientRect()
            return r.top < 0 || r.bottom > hasta + 0.5
          }
          const fuera = []
          if (tapada(tarjeta.querySelector('h3'))) fuera.push('cabecera')
          // La lectura adelante: en su paso, o repetida arriba en la tarjeta oscura con el mismo número.
          const adelante = tarjeta.querySelector('[data-paso="adelante"]')
          const enBarra = document.querySelector('[aria-label="Lectura adelante"]')
          const numero = (el) => /≈\s*(\d+\.\d+)/.exec(el?.innerText ?? '')?.[1]
          const seVeEnBarra = enBarra && !tapada(enBarra) && numero(enBarra) === numero(adelante)
          if (!adelante || (tapada(adelante) && !seVeEnBarra)) fuera.push('lectura adelante')
          // Al llegar a un control, la orden de cerrar con su tolerancia: en la tarjeta o junto al botón.
          const nota = tarjeta.querySelector('[role=note][aria-label="Cierre del tramo"]')
          if (nota) {
            const recordatorio = document.querySelector('[aria-label="Recordatorio de cierre"]')
            const conTolerancia = (el) => /cerrar el tramo|cierra el tramo/i.test(el.innerText) && /± \d+\.\d mm/.test(el.innerText)
            const seVeEnTarjeta = !tapada(nota) && conTolerancia(nota)
            const seVeJuntoAlBoton = recordatorio && !tapada(recordatorio) && conTolerancia(recordatorio)
            if (!seVeEnTarjeta && !seVeJuntoAlBoton) fuera.push('aviso de cierre')
          }
          return fuera
        })
        if (tapadas.length > 0) noSeVen.push(`paso ${i + 1}: ${tapadas.join(', ')}`)
      }
    }
    if (i === 0) await capturar(pagina, `${SALIDA}/${captura}-paso1.png`)
    await pagina.getByRole('button', { name: 'Hecho, siguiente' }).click()
  }
  comprobar(`${etiqueta}: cada paso dice dónde plantar, qué leer atrás y adelante y coincide con Planificar`, errores.length === 0, errores.slice(0, 4).join(' | '))
  comprobar(`${etiqueta}: la guía pasa por todas las estaciones de ida de la tabla`, idaVista === plan.estaciones.length, `${idaVista}`)
  comprobar(
    `${etiqueta}: en cada paso, de ida y de vuelta, las lecturas cuadran con el perfil a ±${TOL_LECTURA * 100} cm`,
    malasLecturas.length === 0,
    malasLecturas.slice(0, 4).join(' | '),
  )
  if (pagina.viewportSize().width < 640)
    comprobar(
      `${etiqueta}: en cada paso la lectura adelante y el aviso de cierre se ven sin desplazar, por encima del pie de «Hecho, siguiente»`,
      noSeVen.length === 0,
      noSeVen.slice(0, 4).join(' | '),
    )
  const tramos = plan.tramos.length
  comprobar(
    `${etiqueta}: al final de cada ida y de cada vuelta se llega a un control y se cierra el tramo`,
    llegadas.length === 2 * tramos,
    llegadas.join(', '),
  )
  await pagina.getByText(/Guía completa/).waitFor({ timeout: 5000 }).catch(() => {})
  comprobar(`${etiqueta}: al terminar dice «Guía completa» y pide revisar el cierre`, (await pagina.getByText(/Guía completa/).count()) > 0)
  await capturar(pagina, `${SALIDA}/${captura}-fin.png`)
}

// ---------------------------------------------------------------------------
// 1. Laptop (1280×800): Las Lomas con la rasante, guardar y la guía
// ---------------------------------------------------------------------------

const laptop = await abrirObra(1280, 800)
await irAPlanificar(laptop)
{
  const perfil = await laptop.locator('summary').filter({ hasText: 'Perfil de la pista' }).innerText()
  const reglas = await laptop.locator('summary').filter({ hasText: 'Reglas del nivel' }).innerText()
  comprobar(
    'Planificar: el perfil y las reglas dicen lo que tienen en la línea de su plegable',
    /Rasante · \+7\.38\s%/.test(perfil) && /Tu equipo: mira\s\d/.test(reglas),
    `${perfil.replace(/\n/g, ' ')} | ${reglas.replace(/\n/g, ' ')}`,
  )
}
const rasante = laptop.getByRole('radio', { name: 'Rasante' })
comprobar('Las Lomas planifica por defecto con su rasante', await rasante.isChecked())
comprobar(
  'el perfil va de 0+000 a 0+120 (la pista del DXF) con +7.38 %',
  (await laptop.getByRole('list', { name: 'Pendientes del perfil' }).innerText()).replace(/\s+/g, ' ').includes('0+000 a 0+120: +7.38 %'),
  await laptop.getByRole('list', { name: 'Pendientes del perfil' }).innerText(),
)
const planRasante = await leerPlan(laptop)
compararConEsperado('rasante', planRasante, LOMAS.planRasante)
comprobarReglas('rasante', planRasante)
comprobarLecturas('rasante', planRasante, PERFIL_RASANTE)
// «✗ 2 tramos no cumplen» también contiene «cumple»: se exige ✓ y «El plan cumple», y que no haya ✗.
comprobar(
  'rasante: el veredicto dice que el plan cumple, con ✓',
  /✓/.test(planRasante.veredicto) && /El plan cumple/.test(planRasante.veredicto) && !/✗|no cumple/.test(planRasante.veredicto),
  planRasante.veredicto,
)
comprobar(
  'las cotas de los controles se dicen sin comprobar (salen del perfil)',
  (await laptop.getByText(/Sin comprobar: las cotas de los controles/).count()) > 0,
)
comprobar('el dibujo del plan está en pantalla', (await laptop.locator('svg[aria-label]').count()) > 0)
await capturar(laptop, `${SALIDA}/planificador-rasante-1280.png`)

// Guardar en la calle (fijarPlanControles).
comprobar('antes de guardar dice que no está guardado en la calle', (await laptop.getByText('Todavía no se guardó en la calle.').count()) > 0)
await laptop.getByRole('button', { name: 'Guardar en la calle' }).click()
await laptop.getByText(/Guardado en la calle: sale en el plano y en la guía/).waitFor({ timeout: 5000 }).catch(() => {})
comprobar('al guardar dice ✓ guardado en la calle', (await laptop.getByText(/Guardado en la calle: sale en el plano y en la guía/).count()) > 0)
comprobar('el botón Guardar queda desactivado (ya está al día)', await laptop.getByRole('button', { name: 'Guardar en la calle' }).isDisabled())
comprobar('aparece «Quitar el plan guardado»', await laptop.getByRole('button', { name: 'Quitar el plan guardado' }).isVisible())

// Lo guardado sigue al cambiar de calle y volver.
await laptop.getByLabel('Calle activa').selectOption({ label: ESPERADO.nombresDeCalles[0] })
await laptop.getByLabel('Calle activa').selectOption({ label: LOMAS.nombre })
await laptop.getByRole('navigation', { name: 'Pantallas de la calle' }).getByRole('button', { name: 'Planificar', exact: true }).click()
await laptop.getByRole('heading', { name: 'Planificar', level: 2 }).waitFor({ timeout: 10000 })
comprobar(
  'tras ir a otra calle y volver, Las Lomas sigue con su plan guardado',
  (await laptop.getByText(/Guardado en la calle: sale en el plano y en la guía/).count()) > 0,
)

// La guía de campo, paso a paso.
await laptop.getByRole('button', { name: 'Guía de campo' }).click()
await laptop.getByRole('heading', { name: 'Guía de campo', level: 2 }).waitFor({ timeout: 10000 })
comprobar('la guía sigue el plan guardado (no avisa de plan sin guardar)', (await laptop.getByText(/Este plan no está guardado en la calle/).count()) === 0)
comprobar('la guía dice que las lecturas son aproximadas', (await laptop.getByText(/Lecturas aproximadas/).count()) > 0)
await recorrerGuia(laptop, 'guía (rasante)', planRasante, 'planificador-guia-1280', PERFIL_RASANTE)

// ---------------------------------------------------------------------------
// 2. Laptop: con las cotas del plano (DXF)
// ---------------------------------------------------------------------------

await laptop.getByRole('button', { name: 'Volver a Planificar' }).click()
await laptop.getByRole('heading', { name: 'Planificar', level: 2 }).waitFor({ timeout: 10000 })
await abrirPlegablesDePlanificar(laptop)
await laptop.getByRole('radio', { name: 'Cotas del plano' }).check()
await laptop.getByText(/cotas? leídas? del plano/).waitFor({ timeout: 10000 }).catch(() => {})
const textoCotas = await laptop.getByText(/cotas? leídas? del plano/).first().innerText().catch(() => '')
comprobar(`cotas del plano: ${LOMAS.cotasDelPlano.length} cotas leídas del DXF`, textoCotas.startsWith(`${LOMAS.cotasDelPlano.length} cotas leídas`), textoCotas)
const planPlano = await leerPlan(laptop)
compararConEsperado('cotas del plano', planPlano, LOMAS.planPlano)
comprobarReglas('cotas del plano', planPlano)
comprobarLecturas('cotas del plano', planPlano, PERFIL_PLANO)
const otroPlan = await laptop.getByText(/La calle guarda otro plan/).first().innerText().catch(() => '')
comprobar(
  'con otro perfil avisa que la calle guarda otro plan y en qué cambia',
  otroPlan.includes('cambia de cota prevista') || otroPlan.includes('Diferencias'),
  otroPlan,
)
await capturar(laptop, `${SALIDA}/planificador-plano-1280.png`)

// ---------------------------------------------------------------------------
// 3. Laptop: perfil digitado con quiebres (el que deja el planificador en el navegador)
// ---------------------------------------------------------------------------

const quiebres = await abrirObra(1280, 800, LOMAS.planConQuiebres.localStorage)
await irAPlanificar(quiebres)
comprobar('con el perfil recordado, la fuente es «Digitado»', await quiebres.getByRole('radio', { name: 'Digitado' }).isChecked())
comprobar(
  `el editor trae los ${LOMAS.perfilConQuiebres.length} vértices digitados`,
  (await quiebres.getByRole('list', { name: 'Vértices del perfil' }).locator(':scope > li').count()) === LOMAS.perfilConQuiebres.length,
)
const planQuiebres = await leerPlan(quiebres)
compararConEsperado('quiebres', planQuiebres, LOMAS.planConQuiebres)
comprobarReglas('quiebres', planQuiebres)
comprobarLecturas('quiebres', planQuiebres, PERFIL_QUIEBRES)
const malos = LOMAS.planConQuiebres.tramos.filter((t) => !t.ok).length
comprobar(
  `quiebres: el veredicto dice ✗ ${malos} tramos no cumplen`,
  planQuiebres.veredicto.includes(`${malos} tramos no cumplen`) && planQuiebres.veredicto.includes('✗'),
  planQuiebres.veredicto,
)
for (const t of planQuiebres.tramos.filter((t) => t.noCumple)) {
  comprobar(
    `quiebres: el tramo ${t.desde}–${t.hasta} dice el paso medio que tiene y el que haría falta`,
    /con un paso medio de [\d.]+ m haría falta al menos 27\.8 m/.test(t.texto) && /pasa de la tolerancia/.test(t.texto),
    t.texto.replace(/\n/g, ' / '),
  )
}
await capturar(quiebres, `${SALIDA}/planificador-quiebres-1280.png`)

// Sin guardar, la guía sigue el plan que se ve y lo dice; los tramos malos se ven también allí.
await quiebres.getByRole('button', { name: 'Guía de campo' }).click()
await quiebres.getByRole('heading', { name: 'Guía de campo', level: 2 }).waitFor({ timeout: 10000 })
const resumenAvisos = await quiebres.locator('summary').filter({ hasText: /no cumplen/ }).first().innerText().catch(() => '')
comprobar(
  `quiebres: los avisos de la guía caben en una línea plegada que dice «✗ ${malos} tramos no cumplen» y «△ plan sin guardar»`,
  resumenAvisos.includes(`✗ ${malos} tramos no cumplen`) && resumenAvisos.includes('△ plan sin guardar'),
  resumenAvisos.replace(/\n/g, ' '),
)
await abrirPlegable(quiebres, 'no cumplen')
comprobar('quiebres: la guía avisa que el plan no está guardado en la calle', await quiebres.getByText(/Este plan no está guardado en la calle/).isVisible())
const avisoGuia = await quiebres.getByText(/tramos? no cumplen?:/).first().locator('xpath=..').innerText().catch(() => '')
comprobar(
  `quiebres: la guía dice ✗ ${malos} tramos no cumplen, con el paso que haría falta`,
  avisoGuia.includes(`${malos} tramos no cumplen`) && avisoGuia.includes('haría falta al menos 27.8 m'),
  avisoGuia.replace(/\n/g, ' / ').slice(0, 200),
)
await recorrerGuia(quiebres, 'guía (quiebres)', planQuiebres, 'planificador-guia-quiebres-1280', PERFIL_QUIEBRES)

// Guardar el plan con quiebres también se puede (posible, aunque no cumpla).
await quiebres.getByRole('button', { name: 'Volver a Planificar' }).click()
await quiebres.getByRole('button', { name: 'Guardar en la calle' }).click()
comprobar(
  'quiebres: el plan se guarda en la calle aunque tenga tramos que no cumplen',
  await quiebres.getByText(/Guardado en la calle: sale en el plano y en la guía/).isVisible().catch(() => false),
)

// ---------------------------------------------------------------------------
// 4. Celular (390×844): rasante, máximo de 2 cambios, guía; ancho y botones
// ---------------------------------------------------------------------------

const celular = await abrirObra(390, 844)
await irAPlanificar(celular)
const seccionCel = celular.getByRole('region', { name: 'Planificar' })
let desbordes = await desbordesAlAncho(celular)
comprobar('celular: Planificar no se desplaza a lo ancho (ni la página ni su contenedor)', desbordes.length === 0, desbordes.join(' | '))
let chicos = await botonesChicos(celular, seccionCel)
comprobar('celular: botones y campos de Planificar de 44 px o más', chicos.length === 0, chicos.join(' | '))
const planCel = await leerPlan(celular)
compararConEsperado('celular rasante', planCel, LOMAS.planRasante)
comprobarLecturas('celular rasante', planCel, PERFIL_RASANTE)
await capturar(celular, `${SALIDA}/planificador-rasante-390.png`)

// Máximo 2 cambios por tramo: el tramo de 3 cambios se parte con un control «para no pasar de 2 cambios».
const campoMax = celular.getByRole('textbox', { name: 'Máx. cambios por tramo' })
await campoMax.fill('2')
await campoMax.press('Enter')
await campoMax.blur()
await celular.getByText(/para no pasar de 2 cambios/).first().waitFor({ timeout: 5000 }).catch(() => {})
const planMax = await leerPlan(celular)
comprobar(
  'celular, máx. 2 cambios: aparece un control «para no pasar de 2 cambios»',
  planMax.controles.some((c) => c.texto.includes('para no pasar de 2 cambios')),
  planMax.controles.map((c) => c.texto.replace(/\n/g, ' / ')).join(' || '),
)
comprobarReglas('celular, máx. 2 cambios', planMax, 2)
comprobarLecturas('celular, máx. 2 cambios', planMax, PERFIL_RASANTE)
await capturar(celular, `${SALIDA}/planificador-max2-390.png`)
await campoMax.fill('4')
await campoMax.press('Enter')
await campoMax.blur()

await celular.getByRole('button', { name: 'Guía de campo' }).click()
await celular.getByRole('heading', { name: 'Guía de campo', level: 2 }).waitFor({ timeout: 10000 })
desbordes = await desbordesAlAncho(celular)
comprobar('celular: la guía no se desplaza a lo ancho (ni la página ni su contenedor)', desbordes.length === 0, desbordes.join(' | '))
chicos = await botonesChicos(celular, celular.getByRole('region', { name: 'Guía de campo' }))
comprobar('celular: botones de la guía de 44 px o más', chicos.length === 0, chicos.join(' | '))
const siguiente = await celular.getByRole('button', { name: 'Hecho, siguiente' }).boundingBox()
comprobar('celular: «Hecho, siguiente» queda a la vista sin desplazar', !!siguiente && siguiente.y + siguiente.height <= 844, JSON.stringify(siguiente))
const planCel4 = await leerPlanDesdeGuia()
await recorrerGuia(celular, 'celular, guía', planCel4, 'planificador-guia-390', PERFIL_RASANTE)

/** En el celular la guía se compara con la tabla de Planificar de máximo 4 (la del principio). */
async function leerPlanDesdeGuia() {
  return planCel
}

await navegador.close()

comprobar('sin errores en la consola del navegador', erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 ? 0 : 1)
