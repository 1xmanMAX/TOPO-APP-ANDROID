import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, unzipSync, zipSync } from 'fflate'

/**
 * El archivo de la obra, de punta a punta, en un navegador real: lo que
 * Max guarda tiene que volver entero, planos incluidos, y con los mismos
 * resultados (no solo con los mismos nombres).
 *
 * 0. Abre la obra simulada tal cual y anota sus resultados: cierre de
 *    Av. Sol, conteos y diferencias de Revisar, el «no comprobado» de
 *    Jr. Lima, las cotas de los BMs y la escala de los planos. Se comparan
 *    con ESPERADO y sirven de huella para los pasos siguientes.
 * 1. Abre la obra simulada, le cambia el nombre y la guarda (.topo descargado).
 * 2. Recarga la página cuando el borrador ya está en el navegador: el
 *    autoguardado la recupera con el cambio, los planos (los bytes, no solo
 *    su nombre) y los mismos resultados.
 * 3. Abre el .topo descargado por dentro (fflate): planos idénticos byte a
 *    byte, y las 79 lecturas idénticas (valor, destino y orden) a las del
 *    original, sin cotas calculadas en ningún sitio del JSON.
 * 4. Lo abre en un navegador limpio, sin borrador: la obra, sus planos y los
 *    mismos resultados.
 * 5. Abre dos .topo viejos, sin nada de la ola 2 (uno con calles y lecturas,
 *    otro mínimo): el viejo da las mismas cuentas que el original (el
 *    instrumento de fábrica da la misma tolerancia), y cada pantalla llega
 *    de verdad (señal positiva) sin que la app se detenga.
 * 6. Si el aviso de recuperación está a la vista y Max abre otro archivo,
 *    lo que trabaja desde ahí también se autoguarda.
 *
 * Uso: node verificacion/archivo.mjs [carpeta-de-salida]
 * Sin carpeta, deja todo en verificacion/salida/archivo (ignorado por git).
 * La URL sale de BASE (por defecto http://localhost:4173/).
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? join(fileURLToPath(new URL('./salida/', import.meta.url)), 'archivo')
mkdirSync(SALIDA, { recursive: true })

const ESPERADO = JSON.parse(readFileSync(new URL('./datos/obra-simulada.esperado.json', import.meta.url), 'utf8'))
const TOPO = fileURLToPath(new URL(ESPERADO.archivo.rutaDesdeGuion, import.meta.url))
const SELECTOR_ABRIR = ESPERADO.archivo.selectorAbrir
const SOL = ESPERADO.avSol
const LIMA = ESPERADO.jrLima
const S = ESPERADO.textos.simbolos
const NO_COMPROBADO = new RegExp(ESPERADO.textos.noComprobado, 'i')

/** El nombre nuevo lleva tilde a propósito: el archivo descargado se llama así. */
const NOMBRE_NUEVO = 'Obra simulada — Pavimentación Las Lomas'

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

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
/** «−4,0» o «5.88» → número (menos tipográfico y coma decimal incluidos). */
function numero(texto) {
  return Number(String(texto).replace('−', '-').replace(',', '.'))
}
const plano = (texto) => texto.replace(/\s+/g, ' ').trim()

const navegador = await chromium.launch()
const erroresConsola = []

function escucharConsola(pagina, ancho) {
  pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(`${ancho}px: ${m.text()}`) })
  pagina.on('pageerror', (e) => erroresConsola.push(`${ancho}px pageerror: ${e.message}`))
}

/** Una pestaña en un navegador limpio (su propio almacenamiento) o en uno dado. */
async function nuevaPagina(ancho, alto, contexto = null) {
  const ctx = contexto ?? (await navegador.newContext({ viewport: { width: ancho, height: alto }, acceptDownloads: true }))
  const pagina = await ctx.newPage()
  escucharConsola(pagina, ancho)
  await pagina.goto(BASE, { waitUntil: 'load', timeout: 120000 })
  await pagina.locator(SELECTOR_ABRIR).waitFor({ state: 'attached', timeout: 30000 })
  return { ctx, pagina }
}

async function abrirArchivo(pagina, ruta) {
  await pagina.locator(SELECTOR_ABRIR).setInputFiles(ruta)
}

/** Espera a que la barra de arriba diga el nombre de la obra (abrir es asíncrono). */
async function esperarObra(pagina, nombre) {
  await pagina.getByRole('banner').getByText(nombre).first().waitFor({ timeout: 15000 }).catch(() => {})
  return (await pagina.getByRole('banner').innerText()).includes(nombre)
}

/** Pulsa un botón de una barra de navegación y espera a que quede marcado. */
async function pulsarEnNav(pagina, nav, nombre) {
  const boton = pagina.getByRole('navigation', { name: nav }).getByRole('button', { name: nombre, exact: true })
  await boton.click()
  await pagina.getByRole('navigation', { name: nav }).locator('button[aria-pressed="true"]', { hasText: new RegExp(`^${nombre}$`) })
    .waitFor({ timeout: 10000 }).catch(() => {})
  return (await boton.getAttribute('aria-pressed')) === 'true'
}

async function irA(pagina, espacio) {
  return pulsarEnNav(pagina, 'Espacios', espacio)
}

async function irAPlano(pagina) {
  await irA(pagina, 'Obra')
  const ok = await pulsarEnNav(pagina, 'Pantallas de la obra', 'Plano')
  await pagina.getByRole('heading', { name: 'Plano de obra', level: 2 }).waitFor({ timeout: 10000 }).catch(() => {})
  return ok && (await pagina.getByRole('heading', { name: 'Plano de obra', level: 2 }).count()) === 1
}

async function irACalles(pagina) {
  await irA(pagina, 'Obra')
  return pulsarEnNav(pagina, 'Pantallas de la obra', 'Calles')
}

async function irACalle(pagina) {
  const ok = await irA(pagina, 'Calle')
  await pagina.getByRole('navigation', { name: 'Modos de la calle' }).waitFor({ timeout: 10000 }).catch(() => {})
  return ok && (await pagina.getByRole('navigation', { name: 'Modos de la calle' }).count()) === 1
}

/** Calle › modo: el botón queda marcado y la ficha muestra su título. */
async function irAModo(pagina, modo) {
  const marcado = await pulsarEnNav(pagina, 'Modos de la calle', modo)
  const titulo = pagina.getByRole('heading', { name: modo, exact: true, level: 2 })
  await titulo.waitFor({ timeout: 10000 }).catch(() => {})
  return marcado && (await titulo.count()) > 0
}

async function irAInformes(pagina) {
  const ok = await irA(pagina, 'Informes')
  const titulo = pagina.getByRole('heading', { name: 'Informes', exact: true, level: 2 })
  await titulo.waitFor({ timeout: 10000 }).catch(() => {})
  return ok && (await titulo.count()) === 1
}

/** La app no se detuvo (RedDeSeguridad no salió). Se mira después de una señal positiva. */
async function sinCaida(pagina) {
  return (await pagina.getByText('La aplicación se detuvo').count()) === 0
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

async function elegirCalle(pagina, nombre) {
  await pagina.getByLabel('Calle activa').selectOption({ label: nombre })
}

/** Elige la toma por el texto de su opción («SUBRASANTE · 2026-09-14»). */
async function elegirCapa(pagina, capa, fecha) {
  const selector = pagina.getByLabel('Capa activa')
  const opciones = await selector.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })))
  const opcion = opciones.find((o) => o.t.includes(capa) && o.t.includes(fecha))
  if (!opcion) return false
  await selector.selectOption(opcion.v)
  await pagina.waitForFunction(({ v }) => [...document.querySelectorAll('select')].some((s) => s.value === v), { v: opcion.v }, { timeout: 10000 }).catch(() => {})
  return true
}

/**
 * El borrador del autoguardado (idb-keyval: base «keyval-store», almacén
 * «keyval») ya lleva la obra con este nombre y, si se piden, los bytes de
 * estos planos. Se llama con la app ya cargada: ella crea la base al leer
 * el borrador, así que aquí solo se abre.
 */
async function esperarBorrador(pagina, nombre, idsPlanos = [], tiempo = 20000) {
  // Un solo evaluate que pregunta a IndexedDB hasta que se cumple o se acaba
  // el tiempo y devuelve true o false (waitForFunction daría por buena la
  // promesa misma, sin mirar lo que resuelve).
  return pagina.evaluate(({ nombre, idsPlanos, tiempo }) => {
    const leer = () => new Promise((resolver) => {
      const pedido = indexedDB.open('keyval-store')
      pedido.onerror = () => resolver(false)
      pedido.onsuccess = () => {
        const base = pedido.result
        if (!base.objectStoreNames.contains('keyval')) { base.close(); resolver(false); return }
        const tx = base.transaction('keyval', 'readonly')
        const almacen = tx.objectStore('keyval')
        const borrador = almacen.get('topo:borrador')
        const planos = almacen.get('topo:borrador:planos')
        tx.oncomplete = () => {
          base.close()
          const archivos = planos.result ?? {}
          resolver(borrador.result?.proyecto?.meta?.nombre === nombre &&
            idsPlanos.every((id) => archivos[id] && archivos[id].length > 0))
        }
        tx.onerror = () => { base.close(); resolver(false) }
      }
    })
    const limite = Date.now() + tiempo
    return new Promise((resolver) => {
      const mirar = async () => {
        if (await leer()) resolver(true)
        else if (Date.now() > limite) resolver(false)
        else setTimeout(mirar, 200)
      }
      mirar()
    })
  }, { nombre, idsPlanos, tiempo })
}

/**
 * En Obra › Plano: los dos planos de la obra, cada uno pintado de sus bytes
 * (sin el aviso «Falta el archivo») y con su escala: el DXF a 1 m por unidad
 * y con sus ejes; el PDF sin escala y pintado dentro del visor del plano.
 */
async function comprobarPlanos(pagina, donde, captura) {
  comprobar(`${donde}: Obra › Plano se abre`, await irAPlano(pagina))
  const selector = pagina.getByLabel('Plano a la vista')
  await selector.waitFor({ timeout: 10000 }).catch(() => {})
  const opciones = await selector.locator('option').allInnerTexts()
  comprobar(`${donde}: están los dos planos`, ESPERADO.planos.every((p) => opciones.some((o) => o.includes(p.nombre))) && opciones.length === 2, opciones.join(' | '))

  const visor = pagina.locator('svg[aria-label="Visor del plano"]')
  const dxf = ESPERADO.planos.find((p) => p.formato === 'dxf')
  const pdf = ESPERADO.planos.find((p) => p.formato === 'pdf')
  await selector.selectOption(dxf.id)
  await pagina.getByRole('region', { name: 'Ejes del DXF' }).waitFor({ timeout: 10000 }).catch(() => {})
  comprobar(`${donde}: el DXF se dibuja de sus bytes (ofrece sus ejes)`, (await pagina.getByRole('region', { name: 'Ejes del DXF' }).count()) > 0)
  comprobar(`${donde}: el DXF no pide su archivo`, (await pagina.getByText(/Falta el archivo de este plano/).count()) === 0)
  const escalaDxf = await pagina.getByText(/^Escala: /).first().innerText().catch(() => '')
  comprobar(`${donde}: el DXF sigue calibrado a ${dxf.metrosPorUnidad} m por unidad`, dxf.calibrado && new RegExp(`= ${dxf.metrosPorUnidad} m$`).test(escalaDxf.trim()), escalaDxf)
  if (captura) await pagina.screenshot({ path: `${SALIDA}/${captura}-dxf.png`, fullPage: true })

  await selector.selectOption(pdf.id)
  const imagenPdf = visor.locator('image')
  await imagenPdf.first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  const href = (await imagenPdf.count()) > 0 ? (await imagenPdf.first().getAttribute('href')) ?? '' : ''
  comprobar(`${donde}: el PDF se pinta como imagen dentro del visor del plano`, href.length > 0, href.slice(0, 40))
  comprobar(`${donde}: el PDF no pide su archivo`, (await pagina.getByText(/Falta el archivo de este plano/).count()) === 0)
  comprobar(`${donde}: el PDF sigue sin escala y lo dice`, !pdf.calibrado && (await pagina.getByText('△ Sin escala').count()) === 1)
  if (captura) await pagina.screenshot({ path: `${SALIDA}/${captura}-pdf.png`, fullPage: true })
}

/**
 * El nombre de la obra en «Datos de la obra» (Obra › Calles). Si se le da
 * el que se espera, aguarda hasta 10 s a que el campo lo diga.
 */
async function nombreEnDatosDeObra(pagina, esperado = null) {
  await irACalles(pagina)
  const apartado = pagina.getByRole('button', { name: 'Datos de la obra', exact: true })
  if ((await apartado.getAttribute('aria-expanded')) !== 'true') await apartado.click()
  const campo = pagina.getByLabel('Nombre del proyecto')
  await campo.waitFor({ timeout: 10000 })
  if (esperado !== null) {
    await campo.evaluate((el, v) => new Promise((resolver) => {
      const t0 = Date.now()
      const mirar = () => (el.value === v || Date.now() - t0 > 10000 ? resolver() : requestAnimationFrame(mirar))
      mirar()
    }), esperado)
  }
  return campo.inputValue()
}

/**
 * Los resultados de la obra, leídos de la pantalla: BMs, Revisar y Cierre
 * de Av. Sol (subrasante) y de Jr. Lima. Cada uno se compara con ESPERADO
 * y se devuelve la huella (los textos leídos) para comparar entre pasos.
 */
async function resultadosDeLaObra(pagina, donde) {
  const huella = {}
  // Obra › Calles: los BMs con su cota.
  await irACalles(pagina)
  const regionBms = pagina.getByRole('region', { name: 'Bancos de nivel de la obra' })
  await regionBms.waitFor({ timeout: 10000 }).catch(() => {})
  huella.bms = (await regionBms.count()) > 0 ? plano(await regionBms.innerText()) : ''
  comprobar(`${donde}: los tres BMs con su cota (${ESPERADO.bms.map((b) => `${b.nombre} ${b.cota.toFixed(3)}`).join(', ')})`,
    ESPERADO.bms.every((b) => huella.bms.includes(`${b.nombre} ${b.cota.toFixed(3)}`)), huella.bms.slice(0, 160))

  // Calle › Revisar · Av. Sol, subrasante.
  comprobar(`${donde}: Calle se abre`, await irACalle(pagina))
  await elegirCalle(pagina, SOL.nombre)
  const hayCapa = await elegirCapa(pagina, 'SUBRASANTE', SOL.subrasante.fecha)
  comprobar(`${donde}: Av. Sol tiene su subrasante del ${SOL.subrasante.fecha}`, hayCapa)
  comprobar(`${donde}: Calle › Revisar se abre`, await irAModo(pagina, 'Revisar'))
  await pagina.getByRole('heading', { name: 'Cotas compensadas' }).waitFor({ timeout: 10000 }).catch(() => {})
  comprobar(`${donde}: Revisar de Av. Sol dice «Cotas compensadas» (la nivelación cerró)`,
    (await pagina.getByRole('heading', { name: 'Cotas compensadas' }).count()) === 1)
  const resumen = pagina.getByRole('region', { name: 'Resumen de la calle' })
  huella.resumenSol = (await resumen.count()) > 0 ? plano(await resumen.innerText()) : ''
  const c = SOL.subrasante.conteo
  comprobar(`${donde}: Av. Sol ${S.conforme} ${c.conformes}, ${S.alLimite} ${c.alLimite}, ${S.fuera} ${c.fuera}, ${S.sinMedir} ${c.sinMedir}`,
    huella.resumenSol.includes(`${S.conforme} ${c.conformes} conformes`) && huella.resumenSol.includes(`${S.alLimite} ${c.alLimite} al límite`) &&
    huella.resumenSol.includes(`${S.fuera} ${c.fuera} fuera de tolerancia`) && huella.resumenSol.includes(`${S.sinMedir} ${c.sinMedir} sin medir`) &&
    !NO_COMPROBADO.test(huella.resumenSol), huella.resumenSol)

  // Las 21 celdas del mapa: diferencia en mm, acción y símbolo.
  const celdas = await pagina.getByRole('region', { name: 'Mapa de la calle' }).getByRole('button')
    .evaluateAll((bs) => bs.map((b) => ({ nombre: b.getAttribute('aria-label') ?? '', simbolo: b.textContent.trim() })))
  const mal = []
  for (const [clave, d] of Object.entries(SOL.subrasante.diferenciasMm)) {
    const [pr, id] = clave.split('/')
    const cabeza = `${prog(Number(pr))} ${NOMBRE_PUNTO[id]}`
    const celda = celdas.find((x) => x.nombre.startsWith(`${cabeza}:`) || x.nombre.startsWith(`${cabeza},`))
    const accion = d > 0 ? 'cortar' : d < 0 ? 'rellenar' : 'clavado'
    const sim = Math.abs(d) <= 20 ? S.conforme : Math.abs(d) <= 40 ? S.alLimite : S.fuera
    if (!celda || !celda.nombre.includes(mm(d)) || !celda.nombre.includes(accion) || celda.simbolo !== sim) {
      mal.push(`${clave}: ${celda ? `«${celda.nombre}» [${celda.simbolo}]` : 'no está'}; esperaba ${mm(d)} ${accion} ${sim}`)
    }
  }
  huella.celdasSol = celdas.map((x) => `${x.nombre}[${x.simbolo}]`).join(' | ')
  comprobar(`${donde}: las 21 diferencias de Av. Sol (0+080 Eje ${mm(SOL.subrasante.fuera.diferenciaMm)} ${S.fuera} corta, 0+040 Borde derecho ${mm(SOL.subrasante.alLimite.diferenciaMm)} ${S.alLimite} rellena)`,
    mal.length === 0, mal.slice(0, 3).join(' | ') || '21/21')

  // Calle › Cierre · Av. Sol, subrasante.
  await pulsarEnNav(pagina, 'Pantallas de la calle', 'Cierre')
  const cierre = pagina.getByRole('region', { name: 'Cierre', exact: true })
  const veredicto = cierre.getByRole('region', { name: 'Veredicto del cierre' })
  await veredicto.waitFor({ timeout: 10000 }).catch(() => {})
  huella.veredictoSol = (await veredicto.count()) > 0 ? plano(await veredicto.innerText()) : ''
  const barra = (await cierre.getByRole('img', { name: /^Error / }).count()) > 0
    ? (await cierre.getByRole('img', { name: /^Error / }).first().getAttribute('aria-label')) ?? '' : ''
  huella.barraSol = barra
  const [, err, tol] = barra.match(/^Error (\S+) mm contra una tolerancia de ±(\S+) mm$/) ?? []
  const ci = SOL.subrasante.cierre
  comprobar(`${donde}: Av. Sol «${S.conforme} Cierra» con ${mm(ci.errorMm)} contra ±${ci.toleranciaMm} mm`,
    /^✓ Cierra/.test(huella.veredictoSol) && Math.round(numero(err)) === ci.errorMm && Math.abs(numero(tol) - ci.toleranciaMm) <= 0.05,
    `${huella.veredictoSol.slice(0, 40)} · ${barra}`)

  // Jr. Lima: Cierre y Revisar dicen «no comprobado».
  await elegirCalle(pagina, LIMA.nombre)
  await cierre.getByText(NO_COMPROBADO).first().waitFor({ timeout: 10000 }).catch(() => {})
  const textoCierreLima = (await cierre.count()) > 0 ? await cierre.innerText() : ''
  huella.cierreLima = (textoCierreLima.split('\n').find((l) => NO_COMPROBADO.test(l)) ?? '').trim()
  comprobar(`${donde}: el Cierre de Jr. Lima dice «no comprobado» y no da veredicto`,
    NO_COMPROBADO.test(textoCierreLima) && (await veredicto.count()) === 0 && textoCierreLima.includes(`Falta cerrar en ${LIMA.subrasante.cierre.bmQueFalta}`),
    huella.cierreLima)
  await irAModo(pagina, 'Revisar')
  await pagina.getByRole('heading', { name: 'Cotas sin compensar' }).waitFor({ timeout: 10000 }).catch(() => {})
  huella.resumenLima = (await resumen.count()) > 0 ? plano(await resumen.innerText()) : ''
  const cl = LIMA.subrasante.conteo
  comprobar(`${donde}: Revisar de Jr. Lima: ${cl.conformes} conformes sin comprobar, ${S.fuera} ${cl.fuera} fuera`,
    (await pagina.getByRole('heading', { name: 'Cotas sin compensar' }).count()) === 1 && NO_COMPROBADO.test(huella.resumenLima) &&
    huella.resumenLima.includes(`${cl.conformes} conformes sin comprobar`) && huella.resumenLima.includes(`${cl.fuera} fuera de tolerancia`),
    huella.resumenLima)
  return huella
}

/** Compara dos huellas campo por campo; devuelve lo que difiere. */
function diferenciasDeHuella(a, b) {
  return Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => `${k}: «${String(a[k]).slice(0, 60)}» ≠ «${String(b[k]).slice(0, 60)}»`)
}

// ---------------------------------------------------------------------------
// 0. La obra simulada tal cual: la huella de referencia
// ---------------------------------------------------------------------------

const { ctx: ctxReferencia, pagina: referencia } = await nuevaPagina(1280, 800)
await abrirArchivo(referencia, TOPO)
comprobar('referencia: la obra simulada se abre', await esperarObra(referencia, ESPERADO.obra.nombre))
const HUELLA = await resultadosDeLaObra(referencia, 'referencia')
await ctxReferencia.close()

// ---------------------------------------------------------------------------
// 1. Laptop: abrir, cambiar el nombre, guardar
// ---------------------------------------------------------------------------

const { ctx: ctxLaptop, pagina } = await nuevaPagina(1280, 800)
await abrirArchivo(pagina, TOPO)
// Un navegador limpio ya muestra el proyecto de ejemplo, que también tiene
// una «Av. Sol»: se espera al nombre de la obra, no a una calle.
comprobar('la obra simulada se abre', await esperarObra(pagina, ESPERADO.obra.nombre))

await nombreEnDatosDeObra(pagina)
await pagina.getByLabel('Nombre del proyecto').fill(NOMBRE_NUEVO)
comprobar('el nombre nuevo sale en la barra de arriba', await esperarObra(pagina, NOMBRE_NUEVO))

await pagina.getByRole('button', { name: 'Archivo', exact: true }).click()
const grupoArchivo = pagina.getByRole('group', { name: 'Archivo del proyecto' })
await grupoArchivo.waitFor({ timeout: 10000 })
await pagina.screenshot({ path: `${SALIDA}/archivo-menu-1280.png` })
const [descarga] = await Promise.all([
  pagina.waitForEvent('download', { timeout: 10000 }),
  grupoArchivo.getByRole('button', { name: 'Guardar', exact: true }).click(),
])
const RUTA_DESCARGADO = `${SALIDA}/archivo-descargado.topo`
await descarga.saveAs(RUTA_DESCARGADO)
const nombreArchivo = descarga.suggestedFilename()
comprobar('el .topo se descarga con el nombre de la obra, tildes incluidas', nombreArchivo === 'Obra simulada  Pavimentación Las Lomas.topo', nombreArchivo)
await pagina.keyboard.press('Escape')

// ---------------------------------------------------------------------------
// 2. Recargar: el autoguardado lo recupera todo, planos incluidos
// ---------------------------------------------------------------------------

// Se recarga cuando el borrador ya está en el navegador, no tras un tiempo fijo.
comprobar('el autoguardado deja en el navegador la obra renombrada y los bytes de sus planos',
  await esperarBorrador(pagina, NOMBRE_NUEVO, ESPERADO.planos.map((p) => p.id)))
await pagina.reload({ waitUntil: 'load' })
const aviso = pagina.getByText(/Recuperé tu trabajo/)
await aviso.waitFor({ timeout: 10000 }).catch(() => {})
const textoAviso = (await aviso.count()) > 0 ? await aviso.innerText() : ''
comprobar('al recargar se ofrece recuperar el trabajo', textoAviso !== '', textoAviso)
comprobar('el aviso nombra la obra con el cambio', textoAviso.includes(NOMBRE_NUEVO), textoAviso)
comprobar('el aviso cuenta las lecturas (no cero)', /, [1-9]\d* lecturas/.test(textoAviso), textoAviso)
await pagina.screenshot({ path: `${SALIDA}/archivo-recuperar-1280.png` })
await pagina.getByRole('button', { name: 'Recuperar', exact: true }).click()
comprobar('tras recuperar, la barra dice el nombre nuevo', await esperarObra(pagina, NOMBRE_NUEVO))
for (const calle of ESPERADO.nombresDeCalles) {
  comprobar(`tras recuperar, la calle «${calle}» sigue`, await pagina.getByText(calle, { exact: true }).first().isVisible())
}
await comprobarPlanos(pagina, 'recuperado del autoguardado', 'archivo-recuperado')
const huellaRecuperada = await resultadosDeLaObra(pagina, 'recuperado')
const difRecuperada = diferenciasDeHuella(HUELLA, huellaRecuperada)
comprobar('lo recuperado da los mismos resultados que la obra original (textos idénticos)', difRecuperada.length === 0, difRecuperada.join(' | '))

// ---------------------------------------------------------------------------
// 3. El .topo descargado por dentro
// ---------------------------------------------------------------------------

const original = unzipSync(new Uint8Array(readFileSync(TOPO)))
const descargado = unzipSync(new Uint8Array(readFileSync(RUTA_DESCARGADO)))
const entradas = Object.keys(descargado).sort()
const entradasPlanos = ESPERADO.planos.map((p) => `planos/${p.id}.${p.formato}`)
comprobar('el .topo trae proyecto.json y los dos planos', ['proyecto.json', ...entradasPlanos].every((e) => entradas.includes(e)), entradas.join(', '))
for (const entrada of entradasPlanos) {
  const a = original[entrada]
  const b = descargado[entrada]
  const iguales = !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i])
  comprobar(`${entrada} sale idéntico byte a byte`, iguales, `${a?.length ?? 0} → ${b?.length ?? 0} bytes`)
}
const jsonOriginal = JSON.parse(new TextDecoder().decode(original['proyecto.json']))
const json = JSON.parse(new TextDecoder().decode(descargado['proyecto.json']))
comprobar('dentro, el proyecto lleva el nombre nuevo', json.meta?.nombre === NOMBRE_NUEVO, json.meta?.nombre)
comprobar('dentro, las tres calles, los dos planos y las dos pistas',
  json.calles?.length === 3 && json.planos?.length === 2 && json.pistas?.length === 2,
  `${json.calles?.length} calles, ${json.planos?.length} planos, ${json.pistas?.length} pistas`)

/** Cada lectura con dónde está (calle, toma, estación, tipo): el orden importa. */
function lecturasDe(proyecto) {
  return (proyecto.calles ?? []).flatMap((c) => c.nivelaciones.flatMap((n) => n.tomas.flatMap((t) =>
    t.estaciones.flatMap((e) => [
      { ...e.vistaAtras, donde: `${c.id}/${t.id}/${e.id}/atras` },
      ...e.intermedias.map((l) => ({ ...l, donde: `${c.id}/${t.id}/${e.id}/intermedia` })),
      ...(e.vistaAdelante ? [{ ...e.vistaAdelante, donde: `${c.id}/${t.id}/${e.id}/adelante` }] : []),
    ]))))
}
const lecturasOriginal = lecturasDe(jsonOriginal)
const lecturas = lecturasDe(json)
comprobar('dentro van solo lecturas de mira (id, destino, valor)',
  lecturas.length > 0 && lecturas.every((l) => typeof l.valor === 'number' && Object.keys(l).every((k) => ['id', 'destino', 'valor', 'donde'].includes(k))),
  `${lecturas.length} lecturas`)
const lecturasDistintas = lecturasOriginal
  .map((l, i) => [l, lecturas[i]])
  .filter(([a, b]) => !b || a.id !== b.id || a.donde !== b.donde || a.valor !== b.valor || JSON.stringify(a.destino) !== JSON.stringify(b.destino))
comprobar(`las ${lecturasOriginal.length} lecturas vuelven idénticas al original: valor al milímetro, destino, estación y orden`,
  lecturasOriginal.length > 0 && lecturas.length === lecturasOriginal.length && lecturasDistintas.length === 0,
  lecturasDistintas.length > 0
    ? lecturasDistintas.slice(0, 2).map(([a, b]) => `${a.donde} ${a.id} ${a.valor} → ${b ? `${b.donde} ${b.id} ${b.valor}` : 'falta'}`).join(' | ')
    : `${lecturas.length} de ${lecturasOriginal.length}`)

/** Las rutas del JSON cuyas claves suenan a cota o altura (con [] por índice). */
function rutasDeCotas(objeto) {
  const rutas = new Set()
  ;(function recorrer(o, ruta) {
    if (Array.isArray(o)) o.forEach((x) => recorrer(x, `${ruta}[]`))
    else if (o && typeof o === 'object') {
      for (const k of Object.keys(o)) {
        if (/cota|altura|elevaci|^ai$|^z$/i.test(k)) rutas.add(`${ruta}.${k}`)
        recorrer(o[k], `${ruta}.${k}`)
      }
    }
  })(objeto, '')
  return [...rutas].sort()
}
// Las únicas cotas que se guardan son datos de partida, no resultados: la del
// BM, la de arranque de la rasante y la altura del instrumento (de fábrica).
const COTAS_PERMITIDAS = ['.bms[].cota', '.calles[].rasante.cotaArranque', '.instrumento.alturaInstrumento']
const cotasGuardadas = rutasDeCotas(json)
comprobar('en ningún sitio del JSON hay cotas calculadas: solo las de BMs, arranque de rasante e instrumento',
  cotasGuardadas.every((r) => COTAS_PERMITIDAS.includes(r)), cotasGuardadas.join(', '))
comprobar('dentro, los BMs llevan las cotas de ESPERADO',
  ESPERADO.bms.every((b) => json.bms.some((x) => x.nombre === b.nombre && x.cota === b.cota)),
  json.bms.map((b) => `${b.nombre} ${b.cota}`).join(', '))

// ---------------------------------------------------------------------------
// 4. El descargado en un navegador limpio
// ---------------------------------------------------------------------------

const { ctx: ctxLimpio, pagina: limpia } = await nuevaPagina(1280, 800)
comprobar('un navegador limpio no ofrece recuperar nada', (await limpia.getByText(/Recuperé tu trabajo/).count()) === 0)
await abrirArchivo(limpia, RUTA_DESCARGADO)
// Un navegador limpio ya muestra el proyecto de ejemplo, que también tiene
// una «Av. Sol»: se espera al nombre de la obra, no a una calle.
comprobar('el .topo descargado se abre con el nombre nuevo', await esperarObra(limpia, NOMBRE_NUEVO))
await comprobarPlanos(limpia, 'abierto del .topo descargado', null)
const huellaReabierta = await resultadosDeLaObra(limpia, 'reabierto')
const difReabierta = diferenciasDeHuella(HUELLA, huellaReabierta)
comprobar('el .topo reabierto da los mismos resultados que la obra original (textos idénticos)', difReabierta.length === 0, difReabierta.join(' | '))
await ctxLimpio.close()

// ---------------------------------------------------------------------------
// 5. Un .topo viejo, sin nada de la ola 2
// ---------------------------------------------------------------------------

/** La obra simulada tal como la habría guardado la app antes de la ola 2. */
const proyectoViejo = JSON.parse(new TextDecoder().decode(original['proyecto.json']))
delete proyectoViejo.instrumento
delete proyectoViejo.planos
delete proyectoViejo.pistas
proyectoViejo.meta.nombre = 'Obra vieja — antes de la ola 2'
for (const calle of proyectoViejo.calles) {
  delete calle.notas
  delete calle.planControles
}
const RUTA_VIEJO = `${SALIDA}/archivo-viejo.topo`
writeFileSync(RUTA_VIEJO, zipSync({ 'proyecto.json': strToU8(JSON.stringify(proyectoViejo, null, 2)) }))

/** Lo mínimo que la app ha sabido abrir siempre: sin calles, sin BMs, sin capas. */
const minimo = {
  version: 1,
  meta: { nombre: 'Obra vieja mínima', obra: '', cliente: '', ubicacion: '', responsable: '', creado: '2025-01-10T12:00:00.000Z', modificado: '2025-01-10T12:00:00.000Z' },
  bms: [],
  calles: [],
  capas: [],
}
const RUTA_MINIMO = `${SALIDA}/archivo-minimo.topo`
writeFileSync(RUTA_MINIMO, zipSync({ 'proyecto.json': strToU8(JSON.stringify(minimo)) }))

const { ctx: ctxCelular, pagina: celular } = await nuevaPagina(390, 844)
await abrirArchivo(celular, RUTA_VIEJO)
comprobar('el .topo viejo se abre: Datos de la obra dice su nombre', (await nombreEnDatosDeObra(celular, proyectoViejo.meta.nombre)) === proyectoViejo.meta.nombre)
for (const calle of ESPERADO.nombresDeCalles) {
  comprobar(`el .topo viejo trae la calle «${calle}»`, (await celular.getByText(calle, { exact: true }).count()) > 0)
}
await celular.screenshot({ path: `${SALIDA}/archivo-viejo-calles-390.png`, fullPage: true })

// Las mismas cuentas que el original: con el instrumento de fábrica, la misma
// tolerancia; el mismo «no comprobado» en Jr. Lima; los mismos conteos.
const huellaVieja = await resultadosDeLaObra(celular, '.topo viejo')
const difVieja = diferenciasDeHuella(HUELLA, huellaVieja)
comprobar('el .topo viejo da los mismos resultados que la obra original (textos idénticos)', difVieja.length === 0, difVieja.join(' | '))

comprobar('el .topo viejo: Obra › Plano llega, sin planos', (await irAPlano(celular)) &&
  (await celular.getByText(/Todavía no hay planos/).count()) === 1)
comprobar('el .topo viejo: Obra › Plano sin caerse', await sinCaida(celular))
await celular.screenshot({ path: `${SALIDA}/archivo-viejo-plano-390.png`, fullPage: true })
comprobar('el .topo viejo: Calle llega', await irACalle(celular))
await elegirCalle(celular, SOL.nombre)
for (const modo of ['Medir', 'Revisar', 'Replantear']) {
  comprobar(`el .topo viejo: Calle › ${modo} llega (marcado y con su título)`, await irAModo(celular, modo))
  comprobar(`el .topo viejo: Calle › ${modo} sin caerse`, await sinCaida(celular))
  const ancho = await anchoDePagina(celular)
  comprobar(`el .topo viejo: en el celular, Calle › ${modo} no se desplaza a lo ancho`, ancho <= 390, `scrollWidth ${ancho}`)
  await celular.screenshot({ path: `${SALIDA}/archivo-viejo-${modo.toLowerCase()}-390.png`, fullPage: true })
}
comprobar('el .topo viejo: Informes llega', await irAInformes(celular))
comprobar('el .topo viejo: Informes sin caerse', await sinCaida(celular))
const anchoViejo = await anchoDePagina(celular)
comprobar('el .topo viejo: en el celular, Informes no se desplaza a lo ancho', anchoViejo <= 390, `scrollWidth ${anchoViejo}`)

await abrirArchivo(celular, RUTA_MINIMO)
comprobar('el .topo mínimo se abre: Datos de la obra dice su nombre', (await nombreEnDatosDeObra(celular, minimo.meta.nombre)) === minimo.meta.nombre)
await celular.screenshot({ path: `${SALIDA}/archivo-minimo-390.png`, fullPage: true })
comprobar('el .topo mínimo: Calle llega y dice que no hay calles',
  (await irA(celular, 'Calle')) && (await celular.getByText('Todavía no hay calles: créalas en Obra.').count()) === 1)
comprobar('el .topo mínimo: Calle sin caerse', await sinCaida(celular))
comprobar('el .topo mínimo: Informes llega', await irAInformes(celular))
comprobar('el .topo mínimo: Informes sin caerse', await sinCaida(celular))
comprobar('el .topo mínimo: Obra › Plano llega, sin planos', (await irAPlano(celular)) &&
  (await celular.getByText(/Todavía no hay planos/).count()) === 1)
comprobar('el .topo mínimo: Obra › Plano sin caerse', await sinCaida(celular))

// Un archivo que no es .topo: se dice, en español, y la obra abierta sigue.
await celular.getByRole('button', { name: 'Archivo', exact: true }).click()
const grupoCelular = celular.getByRole('group', { name: 'Archivo del proyecto' })
await grupoCelular.waitFor({ timeout: 10000 })
await abrirArchivo(celular, fileURLToPath(new URL('./datos/obra-simulada.esperado.json', import.meta.url)))
const mensajeMalo = celular.getByText(/No se pudo leer el archivo \.topo/)
await mensajeMalo.waitFor({ timeout: 5000 }).catch(() => {})
comprobar('un archivo que no es .topo se rechaza con un mensaje claro', (await mensajeMalo.count()) > 0)
const alerta = grupoCelular.getByRole('alert')
comprobar('el rechazo lleva su ✗ y se anuncia (role=alert)', (await alerta.count()) > 0 && (await alerta.innerText()).startsWith('✗'))
await celular.screenshot({ path: `${SALIDA}/archivo-menu-error-390.png` })
const botonesMenu = await grupoCelular.getByRole('button').evaluateAll((bs) => bs.map((b) => [b.textContent, Math.round(b.getBoundingClientRect().height)]))
comprobar('en el celular, los botones del menú Archivo (Nuevo, Abrir, Guardar…) miden ≥ 44 px',
  botonesMenu.length >= 3 && botonesMenu.every(([, alto]) => alto >= 44), JSON.stringify(botonesMenu))
const anchoMenu = await anchoDePagina(celular)
comprobar('con el menú abierto y el error, la página no se desplaza a lo ancho', anchoMenu <= 390, `scrollWidth ${anchoMenu}`)
await celular.keyboard.press('Escape')
comprobar('tras el rechazo, la obra abierta sigue', (await nombreEnDatosDeObra(celular, minimo.meta.nombre)) === minimo.meta.nombre)
await ctxCelular.close()

// ---------------------------------------------------------------------------
// 6. Con el aviso de recuperar a la vista, Max abre otro archivo
// ---------------------------------------------------------------------------

// ctxLaptop ya tiene un borrador (la obra simulada renombrada).
const otra = await ctxLaptop.newPage()
escucharConsola(otra, 1280)
await pagina.close()
await otra.goto(BASE, { waitUntil: 'load', timeout: 120000 })
await otra.getByText(/Recuperé tu trabajo/).waitFor({ timeout: 10000 }).catch(() => {})
comprobar('con un borrador guardado, al abrir la app sale el aviso de recuperar', (await otra.getByText(/Recuperé tu trabajo/).count()) === 1)
await abrirArchivo(otra, RUTA_MINIMO)
comprobar('el archivo se abre con el aviso a la vista', await esperarObra(otra, minimo.meta.nombre))
const seFue = await otra.getByText(/Recuperé tu trabajo/).waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false)
comprobar('al abrir otro archivo, el aviso de recuperar el anterior se va', seFue)
await nombreEnDatosDeObra(otra, minimo.meta.nombre)
const NOMBRE_OTRA = 'Obra abierta con el aviso a la vista'
await otra.getByLabel('Nombre del proyecto').fill(NOMBRE_OTRA)
comprobar('lo trabajado sobre el archivo abierto también se autoguarda (llega al borrador del navegador)',
  await esperarBorrador(otra, NOMBRE_OTRA, [], 8000))
await otra.reload({ waitUntil: 'load' })
const avisoOtra = otra.getByText(/Recuperé tu trabajo/)
await avisoOtra.waitFor({ timeout: 10000 }).catch(() => {})
const textoOtra = (await avisoOtra.count()) > 0 ? await avisoOtra.innerText() : ''
comprobar('al recargar, lo que se ofrece recuperar es lo trabajado después, no el borrador viejo',
  textoOtra.includes(NOMBRE_OTRA), textoOtra)
await ctxLaptop.close()

await navegador.close()

comprobar('sin errores en la consola del navegador', erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 ? 0 : 1)
