import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, strFromU8 } from 'fflate'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

/**
 * Los seis informes PDF y el Excel, con la obra simulada de la ola 3, en un
 * navegador real: se eligen en la pantalla de Informes, se descargan como lo
 * haría Max y se lee el texto de cada PDF con pdfjs.
 *
 * No basta con que «aparezca algo»: cada fila se compara con lo que dice
 * obra-simulada.esperado.json. La diferencia con su signo (medida − proyecto,
 * positivo = corta), el estado de cada punto en SU fila, los conteos, el
 * error y la tolerancia del cierre, los espesores, las áreas y volúmenes del
 * metrado (recalculados aquí desde las diferencias) y la lectura objetivo
 * (AI − cota de proyecto). Además, que lo de Jr. Lima (sin cerrar) dice
 * «no comprobado», que no hay NaN, undefined ni Infinity, y que ningún
 * carácter salió como «?» o como un cuadro vacío.
 *
 * Uso: node verificacion/informes.mjs [carpeta-de-salida]
 * Sin carpeta deja todo en verificacion/salida/informes, que git ignora.
 * La URL sale de BASE (por defecto http://localhost:4173/).
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? join(fileURLToPath(new URL('./salida/', import.meta.url)), 'informes')
mkdirSync(SALIDA, { recursive: true })

const ESPERADO = JSON.parse(readFileSync(new URL('./datos/obra-simulada.esperado.json', import.meta.url), 'utf8'))
const TOPO = fileURLToPath(new URL(ESPERADO.archivo.rutaDesdeGuion, import.meta.url))

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}
/** Lo que se sabe que está mal fuera de esta carpeta: se dice, pero no cuenta como comprobación. */
const avisos = []
function avisar(texto) {
  avisos.push(texto)
  console.log(`AVISO ${texto}`)
}

const navegador = await chromium.launch()
const erroresConsola = []

/** Abre la obra en una página nueva del tamaño pedido y va a Informes. */
async function abrirEnInformes(ancho, alto) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: alto }, acceptDownloads: true })
  const pagina = await contexto.newPage()
  pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(`${ancho}px: ${m.text()}`) })
  pagina.on('pageerror', (e) => erroresConsola.push(`${ancho}px pageerror: ${e.message}`))
  // vite dev compila al vuelo la primera vez: se le da su tiempo.
  await pagina.goto(BASE, { waitUntil: 'load', timeout: 90000 })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).waitFor({ state: 'attached', timeout: 30000 })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).setInputFiles(TOPO)
  await pagina.getByText(ESPERADO.nombresDeCalles[0], { exact: true }).first().waitFor({ timeout: 10000 })
  await pagina.getByRole('banner').getByRole('button', { name: 'Informes', exact: true }).click()
  await pagina.getByRole('heading', { name: 'Informes', exact: true }).waitFor({ timeout: 10000 })
  return pagina
}

/**
 * La calle, la jornada y el tramo van plegados debajo de los chips de lo ya
 * elegido («Cambiar calle, jornada o tramo»): se abre antes de tocarlos. Si ya
 * está abierto no se toca, que un clic en el summary lo volvería a cerrar.
 */
async function abrirAlcance(pagina) {
  const resumen = pagina.locator('summary', { hasText: 'Cambiar calle, jornada o tramo' })
  const abierto = await resumen.evaluate((s) => s.parentElement.open)
  if (!abierto) await resumen.click()
}

async function elegirInforme(pagina, titulo) {
  await pagina.getByRole('group', { name: 'Tipo de informe' }).getByRole('button', { name: titulo, exact: true }).click()
}

async function elegirCalle(pagina, nombre) {
  await abrirAlcance(pagina)
  await pagina.getByRole('combobox', { name: 'Calle', exact: true }).selectOption({ label: nombre })
}

/** Elige la opción de un desplegable cuyo texto contiene `trozo` (las jornadas llevan capa · fecha · nivelación). */
async function elegirOpcionQueDiga(pagina, etiqueta, trozo) {
  await abrirAlcance(pagina)
  const lista = pagina.getByRole('combobox', { name: etiqueta, exact: true })
  const opciones = await lista.locator('option').evaluateAll((os) => os.map((o) => ({ valor: o.value, texto: o.textContent ?? '' })))
  const opcion = opciones.find((o) => o.texto.includes(trozo))
  if (!opcion) throw new Error(`«${etiqueta}» no tiene una opción con «${trozo}»: ${opciones.map((o) => o.texto).join(' | ')}`)
  await lista.selectOption(opcion.valor)
}

/**
 * Espera a que la vista previa sea la del PDF pedido: la imagen lleva en
 * data-archivo el nombre del PDF (informe — calle — capa — fecha). Se espera
 * por eso y no por tiempo: tras cambiar de calle, la imagen vieja tiene el
 * mismo nombre accesible y no sirve para saber que ya está la nueva.
 */
async function esperarVistaPrevia(pagina, titulo, calle, capa) {
  await pagina.waitForFunction(
    ({ titulo, calle, capa }) =>
      [...document.querySelectorAll('img[data-archivo]')].some((img) => {
        const a = img.getAttribute('data-archivo') ?? ''
        return (
          img.getAttribute('alt') === `Primera página: ${titulo}` &&
          a.startsWith(`${titulo} — ${calle} — `) &&
          (!capa || a.includes(` — ${capa} — `))
        )
      }),
    { titulo, calle, capa },
    { timeout: 30000 },
  )
}

/** Lo que dice la línea del veredicto encima de los botones. */
async function veredicto(pagina) {
  return (await pagina.locator('p[aria-live="polite"]').first().innerText()).trim()
}

/** Espera a que el veredicto diga `trozo` (tras escribir, el informe se rehace con antirrebote). */
async function esperarVeredictoQueDiga(pagina, trozo) {
  await pagina.waitForFunction(
    (t) => (document.querySelector('p[aria-live="polite"]')?.textContent ?? '').includes(t),
    trozo,
    { timeout: 30000 },
  )
}

/** Pulsa un botón de descarga y devuelve los bytes y el nombre del archivo. */
async function descargar(pagina, nombreBoton) {
  const [descarga] = await Promise.all([
    pagina.waitForEvent('download', { timeout: 15000 }),
    pagina.getByRole('button', { name: nombreBoton, exact: true }).first().click(),
  ])
  const ruta = join(SALIDA, descarga.suggestedFilename())
  await descarga.saveAs(ruta)
  return { nombre: descarga.suggestedFilename(), bytes: new Uint8Array(readFileSync(ruta)), ruta }
}

/** El texto de cada página del PDF, como lo lee pdfjs (lo mismo que copiaría quien lo abre). */
async function textoDelPdf(bytes) {
  const tarea = getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false, verbosity: 0 })
  const doc = await tarea.promise
  const paginas = []
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n)
    const contenido = await pagina.getTextContent()
    paginas.push(contenido.items.map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : '')).join(''))
  }
  await tarea.destroy()
  const todo = paginas.join('\n')
  // Cada renglón del PDF con los espacios juntados: así se amarra una fila entera.
  const renglones = todo.split('\n').map((r) => r.replace(/\s+/g, ' ').trim()).filter(Boolean)
  return { paginas, todo, renglones, numPaginas: paginas.length }
}

/** En el PDF las rayas largas salen como guion (fuentes Latin-1). */
const sinRayas = (s) => s.replace(/[—–−]/g, '-')
const enUnaLinea = (s) => s.replace(/\s+/g, ' ')
const escaparRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// --- Lo que se espera, traducido a lo que imprime el PDF ---------------------

const NOMBRE_PUNTO = { 'p-borde-i': 'Borde izquierdo', 'p-eje': 'Eje', 'p-borde-d': 'Borde derecho' }
const COLUMNA_XLSX = { 'p-borde-i': 'BI', 'p-eje': 'EJE', 'p-borde-d': 'BD' }
/** Obra simulada: sección de tres puntos, bordes a ±3.60 m del eje. */
const OFFSET = { 'p-borde-i': -3.6, 'p-eje': 0, 'p-borde-d': 3.6 }
/** Instrumento de fábrica de la obra simulada. */
const LARGO_MIRA = 5

const redondear3 = (x) => Math.round(x * 1000) / 1000
function progresiva(m) {
  const km = Math.floor(m / 1000)
  return `${km}+${String(Math.round(m - km * 1000)).padStart(3, '0')}`
}
/** Diferencia en mm como la imprime el PDF: con signo, y 0 sin signo. */
const conSigno = (mm) => (mm > 0 ? `+${mm}` : `${mm}`)
function celda(clave) {
  const [prog, punto] = clave.split('/')
  return { m: Number(prog), prog: progresiva(Number(prog)), puntoId: punto, punto: NOMBRE_PUNTO[punto] }
}
/** El renglón del PDF que empieza por «progresiva punto», o null. */
function renglonDe(texto, prog, punto) {
  const inicio = `${prog} ${punto} `
  return texto.renglones.find((r) => r.startsWith(inicio)) ?? null
}

/**
 * Protocolo: cada celda de la jornada en su fila, con su diferencia con signo
 * y su estado. `fuera` y `alLimite` vienen de ESPERADO; el resto, CONFORME.
 */
function comprobarFilasDelProtocolo(etiqueta, texto, jornada) {
  const malas = []
  for (const [clave, mm] of Object.entries(jornada.diferenciasMm)) {
    const c = celda(clave)
    const estado =
      jornada.fuera?.celda === clave ? 'FUERA' : jornada.alLimite?.celda === clave ? 'AL LÍMITE' : 'CONFORME'
    const re = new RegExp(`^${escaparRe(`${c.prog} ${c.punto} `)}\\d+\\.\\d{3} \\d+\\.\\d{3} ${escaparRe(conSigno(mm))} ${estado}$`)
    const r = renglonDe(texto, c.prog, c.punto)
    if (!r || !re.test(r)) malas.push(`${clave}: esperaba ${conSigno(mm)} ${estado}, sale «${r}»`)
  }
  const n = Object.keys(jornada.diferenciasMm).length
  comprobar(`${etiqueta}: las ${n} filas llevan la diferencia con signo (medida − proyecto) y el estado en su fila`, malas.length === 0, malas.slice(0, 3).join(' | '))
  for (const [p, estado] of [[jornada.fuera, 'FUERA'], [jornada.alLimite, 'AL LÍMITE']]) {
    if (!p) continue
    const fila = `${progresiva(p.progresiva)} ${p.punto} ${p.cotaProyecto.toFixed(3)} ${p.cotaMedida.toFixed(3)} ${conSigno(p.diferenciaMm)} ${estado}`
    comprobar(`${etiqueta}: la fila «${fila}»`, texto.renglones.includes(fila), renglonDe(texto, progresiva(p.progresiva), p.punto) ?? '')
  }
  const k = jornada.conteo
  const total = k.conformes + k.alLimite + k.fuera + k.sinMedir
  const resumen = `${total} puntos: ${k.conformes} conforme, ${k.alLimite} al límite, ${k.fuera} fuera, 0 sin rasante, ${k.sinMedir} sin medir`
  comprobar(`${etiqueta}: el conteo «${resumen}»`, texto.renglones.includes(resumen), texto.renglones.find((r) => / puntos: /.test(r)) ?? '')
}

/** Control contra proyecto: la fila del punto dice qué hacer y su estado, en la misma fila. */
function filaDeControl(p, estado) {
  const accion = p.diferenciaMm > 0 ? 'corta' : 'rellena'
  return `${progresiva(p.progresiva)} ${p.punto} ${p.cotaProyecto.toFixed(3)} ${p.cotaMedida.toFixed(3)} ${accion} ${Math.abs(p.diferenciaMm)} mm ${estado}`
}

/** Área de corte y de relleno (m²) de una sección, con las diferencias en mm y el cruce por cero partido. */
function areasDeSeccion(difs) {
  let corte = 0
  let relleno = 0
  for (let i = 0; i + 1 < difs.length; i++) {
    const [x1, d1] = difs[i]
    const [x2, d2] = difs[i + 1]
    const L = x2 - x1
    if (d1 >= 0 && d2 >= 0) corte += ((d1 + d2) / 2) * L
    else if (d1 <= 0 && d2 <= 0) relleno += ((-d1 - d2) / 2) * L
    else {
      // Cruza el cero: cada lado es un triángulo.
      const x = (L * Math.abs(d1)) / (Math.abs(d1) + Math.abs(d2))
      const a1 = (Math.abs(d1) * x) / 2
      const a2 = (Math.abs(d2) * (L - x)) / 2
      if (d1 > 0) { corte += a1; relleno += a2 } else { relleno += a1; corte += a2 }
    }
  }
  return { corte: redondear3(corte / 1000), relleno: redondear3(relleno / 1000) }
}

/** El metrado de una jornada, recalculado desde sus diferencias: áreas por sección y áreas medias por tramo. */
function metradoEsperado(jornada) {
  const porProg = new Map()
  for (const [clave, mm] of Object.entries(jornada.diferenciasMm)) {
    const c = celda(clave)
    if (!porProg.has(c.m)) porProg.set(c.m, [])
    porProg.get(c.m).push([OFFSET[c.puntoId], mm])
  }
  const secciones = [...porProg.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([m, difs]) => ({ m, ...areasDeSeccion(difs.sort((a, b) => a[0] - b[0])) }))
  const tramos = []
  for (let i = 0; i + 1 < secciones.length; i++) {
    const a = secciones[i]
    const b = secciones[i + 1]
    const L = redondear3(b.m - a.m)
    tramos.push({ desde: a.m, hasta: b.m, L, corte: redondear3(((a.corte + b.corte) / 2) * L), relleno: redondear3(((a.relleno + b.relleno) / 2) * L) })
  }
  const total = {
    L: redondear3(secciones.at(-1).m - secciones[0].m),
    corte: redondear3(tramos.reduce((s, t) => s + t.corte, 0)),
    relleno: redondear3(tramos.reduce((s, t) => s + t.relleno, 0)),
  }
  return { secciones, tramos, total }
}

function comprobarMetrado(etiqueta, texto, jornada) {
  const m = metradoEsperado(jornada)
  const malas = []
  for (const s of m.secciones) {
    const fila = `${progresiva(s.m)} ${s.corte.toFixed(3)} ${s.relleno.toFixed(3)}`
    if (!texto.renglones.some((r) => r === fila || r.startsWith(fila + ' '))) {
      malas.push(`sección «${fila}» ≠ «${texto.renglones.find((r) => r.startsWith(progresiva(s.m) + ' ')) ?? ''}»`)
    }
  }
  comprobar(`${etiqueta}: las áreas de corte y relleno de cada sección salen de las diferencias`, malas.length === 0, malas.slice(0, 3).join(' | '))
  const malosTramos = []
  for (const t of m.tramos) {
    const fila = `${progresiva(t.desde)} ${progresiva(t.hasta)} ${t.L.toFixed(2)} ${t.corte.toFixed(3)} ${t.relleno.toFixed(3)}`
    if (!texto.renglones.some((r) => r === fila || r.startsWith(fila + ' '))) malosTramos.push(`tramo «${fila}»`)
  }
  comprobar(`${etiqueta}: el volumen de cada tramo es (A1 + A2) / 2 × distancia`, malosTramos.length === 0, malosTramos.slice(0, 3).join(' | '))
  const total = `TOTAL ${m.total.L.toFixed(2)} ${m.total.corte.toFixed(3)} ${m.total.relleno.toFixed(3)}`
  comprobar(`${etiqueta}: «${total}»`, texto.renglones.includes(total), texto.renglones.find((r) => r.startsWith('TOTAL')) ?? '')
  return m
}

/**
 * Lo que vale para todos los PDF: la obra, la calle, ni un número roto y
 * ningún carácter perdido (lo que la fuente no sabe escribir sale «?»).
 */
function comprobarComunes(etiqueta, texto, calle) {
  const plano = enUnaLinea(texto.todo)
  comprobar(`${etiqueta}: dice la obra`, plano.includes(sinRayas(ESPERADO.obra.obra)), plano.slice(0, 160))
  comprobar(`${etiqueta}: dice la calle «${calle}»`, plano.includes(`Calle: ${calle}`))
  const roto = /\bNaN\b|undefined|Infinity|null\b/.exec(plano)
  comprobar(`${etiqueta}: sin NaN, undefined, null ni Infinity`, roto === null, roto ? plano.slice(Math.max(0, roto.index - 60), roto.index + 40) : '')
  // «?» solo aparece si textoSeguro no supo escribir un carácter; U+FFFD o
  // un control, si la fuente no tenía el glifo.
  const raros = [...plano.matchAll(/[?�\u0000-\u0008□☐]/g)].map((m) => plano.slice(Math.max(0, m.index - 30), m.index + 10))
  comprobar(`${etiqueta}: ningún carácter salió como «?» o cuadro vacío`, raros.length === 0, raros.slice(0, 3).join(' | '))
  const simbolosCrudos = /[✓✗△]/.test(plano)
  comprobar(`${etiqueta}: los símbolos del semáforo no van como texto que la fuente no tiene`, !simbolosCrudos)
  comprobar(`${etiqueta}: tiene «Página 1 de»`, /Página 1 de \d+/.test(plano))
}

/** Las celdas de la hoja de un .xlsx, por fila y por la columna de cada celda. */
function tablaDelXlsx(partes) {
  const hoja = partes['xl/worksheets/sheet1.xml'] ? strFromU8(partes['xl/worksheets/sheet1.xml']) : ''
  const filas = []
  for (const fila of hoja.matchAll(/<row\b[^>]*>(.*?)<\/row>/gs)) {
    const celdas = {}
    for (const c of fila[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(.*?)<\/c>/gs)) {
      const texto = /<t[^>]*>(.*?)<\/t>/s.exec(c[3])?.[1]
      const valor = /<v>(.*?)<\/v>/s.exec(c[3])?.[1]
      celdas[c[1]] = texto !== undefined ? { tipo: 'texto', v: texto } : { tipo: 'numero', v: valor }
    }
    filas.push(celdas)
  }
  return { hoja, filas }
}

/** Las diferencias del Excel: la fila de cabecera «Progresiva BI EJE BD» y debajo una fila por progresiva. */
function comprobarDiferenciasDelXlsx(etiqueta, partes, jornada) {
  const { filas } = tablaDelXlsx(partes)
  const iCab = filas.findIndex((f) => f.A?.v === 'Progresiva')
  if (iCab < 0) return comprobar(`${etiqueta}: el .xlsx tiene la cabecera «Progresiva»`, false)
  const columnaDe = Object.fromEntries(Object.entries(filas[iCab]).map(([col, c]) => [c.v, col]))
  const valorDe = (clave) => {
    const c = celda(clave)
    const fila = filas.slice(iCab + 1).find((f) => f.A?.v === c.prog)
    return fila?.[columnaDe[COLUMNA_XLSX[c.puntoId]]]
  }
  const malas = []
  for (const [clave, mm] of Object.entries(jornada.diferenciasMm)) {
    const valor = valorDe(clave)
    // Número de verdad (Excel lo suma) y con el signo de la convención.
    if (!valor || valor.tipo !== 'numero' || Number(valor.v) !== mm) malas.push(`${clave}: esperaba ${conSigno(mm)}, hay ${JSON.stringify(valor)}`)
  }
  const n = Object.keys(jornada.diferenciasMm).length
  comprobar(`${etiqueta}: las ${n} diferencias del .xlsx son números con su signo (positivo = corta) en su celda`, malas.length === 0, malas.slice(0, 3).join(' | '))
  const f = jornada.fuera
  const v = valorDe(f.celda)
  comprobar(`${etiqueta}: en el .xlsx, ${progresiva(f.progresiva)} ${f.punto} vale ${conSigno(f.diferenciaMm)} (${f.accion})`, v?.tipo === 'numero' && Number(v.v) === f.diferenciaMm, JSON.stringify(v))
}

const pdfs = {}

// ---------------------------------------------------------------------------
// 1. Laptop (1280×800): los seis informes
// ---------------------------------------------------------------------------

const pagina = await abrirEnInformes(1280, 800)
const SOL = ESPERADO.avSol
const LIMA = ESPERADO.jrLima
const LOMAS = ESPERADO.lasLomas

await abrirAlcance(pagina)
comprobar('al entrar a Informes la calle es la activa (Av. Sol)',
  (await pagina.getByRole('combobox', { name: 'Calle', exact: true }).locator('option:checked').innerText()) === SOL.nombre)

// --- 1.1 Protocolo de nivelación, Av. Sol subrasante (cierra) ---
await elegirInforme(pagina, 'Protocolo de nivelación')
await elegirCalle(pagina, SOL.nombre)
await elegirOpcionQueDiga(pagina, 'Jornada', 'SUBRASANTE')
await esperarVistaPrevia(pagina, 'Protocolo de nivelación', SOL.nombre, 'SUBRASANTE')
{
  const v = await veredicto(pagina)
  comprobar('protocolo Av. Sol: la pantalla dice ✓ Comprobado', v.startsWith('✓') && v.includes('Comprobado'), v)
  await pagina.screenshot({ path: join(SALIDA, 'informes-protocolo-1280.png'), fullPage: true })
  const d = await descargar(pagina, 'Descargar PDF')
  comprobar('protocolo: se descarga un .pdf', d.nombre.endsWith('.pdf'), d.nombre)
  const t = await textoDelPdf(d.bytes)
  pdfs.protocoloSol = t
  comprobarComunes('protocolo Av. Sol', t, SOL.nombre)
  comprobar('protocolo Av. Sol: no lleva la franja de «no comprobadas»', !/no están comprobadas/i.test(enUnaLinea(t.todo)))
  comprobarFilasDelProtocolo('protocolo Av. Sol', t, SOL.subrasante)
}

// --- 1.2 Protocolo de Jr. Lima (sin cerrar) ---
await elegirCalle(pagina, LIMA.nombre)
await esperarVistaPrevia(pagina, 'Protocolo de nivelación', LIMA.nombre, 'SUBRASANTE')
{
  const v = await veredicto(pagina)
  comprobar('protocolo Jr. Lima: la pantalla dice △ No comprobado', v.startsWith('△') && /no comprobad/i.test(v), v)
  await pagina.screenshot({ path: join(SALIDA, 'informes-protocolo-lima-1280.png'), fullPage: true })
  const d = await descargar(pagina, 'Descargar PDF')
  const t = await textoDelPdf(d.bytes)
  pdfs.protocoloLima = t
  comprobarComunes('protocolo Jr. Lima', t, LIMA.nombre)
  const cadaPagina = t.paginas.every((p) => /no (están )?comprobad/i.test(enUnaLinea(p)))
  comprobar('protocolo Jr. Lima: cada página dice «no comprobado»', cadaPagina, `${t.numPaginas} páginas`)
  comprobarFilasDelProtocolo('protocolo Jr. Lima', t, LIMA.subrasante)
}

// --- 1.3 Libreta con cierre, Av. Sol subrasante y Jr. Lima ---
await elegirInforme(pagina, 'Libreta con cierre')
await elegirCalle(pagina, SOL.nombre)
await elegirOpcionQueDiga(pagina, 'Jornada', 'SUBRASANTE')
await esperarVistaPrevia(pagina, 'Libreta con cierre', SOL.nombre, 'SUBRASANTE')
{
  await pagina.screenshot({ path: join(SALIDA, 'informes-libreta-1280.png'), fullPage: true })
  const d = await descargar(pagina, 'Descargar PDF')
  const t = await textoDelPdf(d.bytes)
  pdfs.libretaSol = t
  comprobarComunes('libreta Av. Sol', t, SOL.nombre)
  const plano = enUnaLinea(t.todo)
  comprobar('libreta Av. Sol: lleva las alturas instrumentales', SOL.subrasante.alturasInstrumentales.every((ai) => plano.includes(ai.toFixed(3))),
    SOL.subrasante.alturasInstrumentales.filter((ai) => !plano.includes(ai.toFixed(3))).join(', '))
  const cierre = SOL.subrasante.cierre
  const reError = new RegExp(`^Error de cierre en BM-1: \\d+\\.\\d{3} - \\d+\\.\\d{3} = ${escaparRe(conSigno(cierre.errorMm))} mm$`)
  comprobar(`libreta Av. Sol: «Error de cierre … = ${conSigno(cierre.errorMm)} mm»`, t.renglones.some((r) => reError.test(r)), t.renglones.find((r) => r.startsWith('Error de cierre')) ?? '')
  const tol = `Tolerancia: ±${cierre.toleranciaMm.toFixed(1)} mm (${cierre.longitudK.toFixed(2)} km)`
  comprobar(`libreta Av. Sol: «${tol}»`, t.renglones.includes(tol), t.renglones.find((r) => r.startsWith('Tolerancia: ±') && r.includes('km')) ?? '')
  comprobar('libreta Av. Sol: «Dentro de tolerancia.»', t.renglones.includes('Dentro de tolerancia.'))
  comprobar('libreta Av. Sol: la comprobación aritmética cuadra', t.renglones.some((r) => r.startsWith('Comprobación correcta')) && !/No cuadra/.test(plano))
}
await elegirCalle(pagina, LIMA.nombre)
await esperarVistaPrevia(pagina, 'Libreta con cierre', LIMA.nombre, 'SUBRASANTE')
{
  const d = await descargar(pagina, 'Descargar PDF')
  const t = await textoDelPdf(d.bytes)
  pdfs.libretaLima = t
  comprobarComunes('libreta Jr. Lima', t, LIMA.nombre)
  const plano = enUnaLinea(t.todo)
  comprobar('libreta Jr. Lima: cada página dice «no comprobado»', t.paginas.every((p) => /no (están )?comprobad/i.test(enUnaLinea(p))))
  comprobar(`libreta Jr. Lima: dice que falta la vista adelante a ${LIMA.subrasante.cierre.bmQueFalta}`,
    plano.includes(`falta la vista adelante a ${LIMA.subrasante.cierre.bmQueFalta}`))
  comprobar('libreta Jr. Lima: lleva las alturas instrumentales', LIMA.subrasante.alturasInstrumentales.every((ai) => plano.includes(ai.toFixed(3))))
  // La vista atrás del último PC aún no tiene su adelante: no entra en la suma.
  comprobar('libreta Jr. Lima: la comprobación aritmética cuadra sin la vista atrás suelta',
    plano.includes('Comprobación correcta') && !/No cuadra/.test(plano) && plano.includes('No entra en la suma atrás'),
    t.renglones.find((r) => r.startsWith('No cuadra') || r.startsWith('Comprobación')) ?? '')
}

// --- 1.4 Control contra proyecto ---
await elegirInforme(pagina, 'Control contra proyecto')
await elegirCalle(pagina, SOL.nombre)
await elegirOpcionQueDiga(pagina, 'Jornada', 'SUBRASANTE')
await esperarVistaPrevia(pagina, 'Control contra proyecto', SOL.nombre, 'SUBRASANTE')
{
  await pagina.screenshot({ path: join(SALIDA, 'informes-control-1280.png'), fullPage: true })
  const d = await descargar(pagina, 'Descargar PDF')
  const t = await textoDelPdf(d.bytes)
  pdfs.controlSol = t
  comprobarComunes('control Av. Sol', t, SOL.nombre)
  const fuera = filaDeControl(SOL.subrasante.fuera, 'FUERA')
  comprobar(`control Av. Sol: la fila «${fuera}»`, t.renglones.includes(fuera), renglonDe(t, '0+080', 'Eje') ?? '')
  const lim = filaDeControl(SOL.subrasante.alLimite, 'AL LÍMITE')
  comprobar(`control Av. Sol: la fila «${lim}»`, t.renglones.includes(lim), renglonDe(t, '0+040', 'Borde derecho') ?? '')
  const k = SOL.subrasante.conteo
  comprobar(`control Av. Sol: lista solo ${k.alLimite + k.fuera} puntos y no lista ${k.conformes} conformes`,
    t.renglones.filter((r) => /^\d\+\d{3} /.test(r)).length === k.alLimite + k.fuera &&
      t.renglones.some((r) => r.startsWith(`No se listan ${k.conformes} puntos conformes`)))

  // El Excel que acompaña al control.
  const boton = pagina.getByRole('button', { name: 'Descargar Excel', exact: true })
  comprobar('control: el botón «Descargar Excel» está activo', await boton.isEnabled())
  if (await boton.isEnabled()) {
    const x = await descargar(pagina, 'Descargar Excel')
    comprobar('control: el Excel se llama .xlsx', x.nombre.endsWith('.xlsx'), x.nombre)
    let partes = {}
    try { partes = unzipSync(x.bytes) } catch (e) { comprobar('control: el .xlsx es un zip válido', false, e.message) }
    const { hoja } = tablaDelXlsx(partes)
    comprobar('control: el .xlsx trae su hoja', hoja.length > 0, Object.keys(partes).join(', '))
    comprobar('control: el .xlsx nombra la calle', hoja.includes(`<t>${SOL.nombre}</t>`))
    comprobarDiferenciasDelXlsx('control Av. Sol', partes, SOL.subrasante)
    comprobar('control: el .xlsx sin NaN, undefined ni Infinity', !/NaN|undefined|Infinity/.test(hoja))
  }
}
await elegirCalle(pagina, LIMA.nombre)
await esperarVistaPrevia(pagina, 'Control contra proyecto', LIMA.nombre, 'SUBRASANTE')
{
  const d = await descargar(pagina, 'Descargar PDF')
  const t = await textoDelPdf(d.bytes)
  pdfs.controlLima = t
  comprobarComunes('control Jr. Lima', t, LIMA.nombre)
  comprobar('control Jr. Lima: cada página dice «no comprobado»', t.paginas.every((p) => /no (están )?comprobad/i.test(enUnaLinea(p))))
  const fuera = filaDeControl(LIMA.subrasante.fuera, 'FUERA')
  comprobar(`control Jr. Lima: la fila «${fuera}»`, t.renglones.includes(fuera), renglonDe(t, '0+140', 'Eje') ?? '')
  const k = LIMA.subrasante.conteo
  comprobar(`control Jr. Lima: lista solo ${k.alLimite + k.fuera} punto y no lista ${k.conformes} conformes`,
    t.renglones.filter((r) => /^\d\+\d{3} /.test(r)).length === k.alLimite + k.fuera &&
      t.renglones.some((r) => r.startsWith(`No se listan ${k.conformes} puntos conformes`)))
  const x = await descargar(pagina, 'Descargar Excel')
  const partes = unzipSync(x.bytes)
  const todoXlsx = Object.entries(partes).filter(([n]) => n.endsWith('.xml')).map(([, b]) => strFromU8(b)).join('')
  comprobar('control Jr. Lima: el .xlsx dice «no comprobado»', /no comprobad/i.test(todoXlsx), x.nombre)
  comprobarDiferenciasDelXlsx('control Jr. Lima', partes, LIMA.subrasante)
}

// --- 1.5 Control de espesores: Av. Sol, base sobre subrasante ---
await elegirInforme(pagina, 'Control de espesores')
await elegirCalle(pagina, SOL.nombre)
await elegirOpcionQueDiga(pagina, 'Capa de arriba', 'BASE')
await elegirOpcionQueDiga(pagina, 'Capa de abajo', 'SUBRASANTE')
await esperarVistaPrevia(pagina, 'Control de espesores', SOL.nombre, 'BASE sobre SUBRASANTE')
{
  const v = await veredicto(pagina)
  comprobar('espesores Av. Sol: la pantalla dice ✓ Comprobado (las dos cierran)', v.startsWith('✓'), v)
  await pagina.screenshot({ path: join(SALIDA, 'informes-espesores-1280.png'), fullPage: true })
  const d = await descargar(pagina, 'Descargar PDF')
  const t = await textoDelPdf(d.bytes)
  pdfs.espesoresSol = t
  comprobarComunes('espesores Av. Sol', t, SOL.nombre)
  const E = SOL.espesores
  const diseno = E.disenioM.toFixed(3)
  // Progresiva, punto, cota abajo, cota arriba, espesor, proyecto, dif. (mm), estado.
  const re = /^(\d\+\d{3}) (Borde izquierdo|Eje|Borde derecho) (\d+\.\d{3}) (\d+\.\d{3}) (\d+\.\d{3}) (\d+\.\d{3}) ([+-]?\d+) (CONFORME|AL LÍMITE|FUERA)$/
  const filas = t.renglones.map((r) => re.exec(r)).filter(Boolean)
  comprobar(`espesores Av. Sol: ${E.comparables} filas comparables`, filas.length === E.comparables, `${filas.length}`)
  comprobar(`espesores Av. Sol: el proyecto es ${diseno} m en cada fila`, filas.length > 0 && filas.every((f) => f[6] === diseno))
  // Cada fila cuadra por dentro: espesor = arriba − abajo; dif. = espesor − proyecto, en mm.
  const descuadres = filas.filter((f) => {
    const espesor = redondear3(Number(f[4]) - Number(f[3]))
    return espesor.toFixed(3) !== f[5] || Math.round((Number(f[5]) - E.disenioM) * 1000) !== Number(f[7])
  })
  comprobar('espesores Av. Sol: espesor = cota arriba − cota abajo y dif. = espesor − proyecto, con signo', descuadres.length === 0, descuadres.slice(0, 2).map((f) => f[0]).join(' | '))
  const espesoresM = filas.map((f) => Number(f[5]))
  comprobar(`espesores Av. Sol: mínimo ${E.minimoM.toFixed(3)} y máximo ${E.maximoM.toFixed(3)} m`,
    Math.min(...espesoresM) === E.minimoM && Math.max(...espesoresM) === E.maximoM, `${Math.min(...espesoresM)} / ${Math.max(...espesoresM)}`)
  const filaEsperada = (p, estado) => {
    const c = celda(p.celda)
    return {
      c,
      texto: `${c.prog} ${c.punto} … ${p.espesorM.toFixed(3)} ${diseno} ${conSigno(p.diferenciaMm)} ${estado}`,
      ok: filas.some((f) => f[1] === c.prog && f[2] === c.punto && f[5] === p.espesorM.toFixed(3) && f[6] === diseno && f[7] === conSigno(p.diferenciaMm) && f[8] === estado),
    }
  }
  for (const p of E.fuera) {
    const { c, texto, ok } = filaEsperada(p, 'FUERA')
    comprobar(`espesores Av. Sol: la fila «${texto}» (${p.delgada ? 'delgada' : 'gruesa'})`, ok, renglonDe(t, c.prog, c.punto) ?? '')
  }
  for (const p of E.alLimite) {
    const { c, texto, ok } = filaEsperada(p, 'AL LÍMITE')
    comprobar(`espesores Av. Sol: la fila «${texto}»`, ok, renglonDe(t, c.prog, c.punto) ?? '')
  }
  comprobar(`espesores Av. Sol: ${E.fuera.length} FUERA y ${E.alLimite.length} AL LÍMITE, ninguno más`,
    filas.filter((f) => f[8] === 'FUERA').length === E.fuera.length && filas.filter((f) => f[8] === 'AL LÍMITE').length === E.alLimite.length)
}

// --- 1.6 Metrado: Av. Sol subrasante y Jr. Lima ---
await elegirInforme(pagina, 'Metrado')
await elegirCalle(pagina, SOL.nombre)
await elegirOpcionQueDiga(pagina, 'Jornada', 'SUBRASANTE')
await esperarVistaPrevia(pagina, 'Metrado', SOL.nombre, 'SUBRASANTE')
{
  await pagina.screenshot({ path: join(SALIDA, 'informes-metrado-1280.png'), fullPage: true })
  const d = await descargar(pagina, 'Descargar PDF')
  const t = await textoDelPdf(d.bytes)
  pdfs.metradoSol = t
  comprobarComunes('metrado Av. Sol', t, SOL.nombre)
  const m = comprobarMetrado('metrado Av. Sol', t, SOL.subrasante)
  // El punto fuera (Eje 0+080, +54 corta) da la sección de más corte: (14+54)/2·3.6 + (54+17)/2·3.6 mm·m.
  const s80 = m.secciones.find((s) => s.m === 80)
  comprobar('metrado Av. Sol: el área de corte de 0+080 es 0.250 m²', s80?.corte === 0.25 && t.renglones.some((r) => r.startsWith('0+080 0.250 0.000')))
}
await elegirCalle(pagina, LIMA.nombre)
await esperarVistaPrevia(pagina, 'Metrado', LIMA.nombre, 'SUBRASANTE')
{
  const d = await descargar(pagina, 'Descargar PDF')
  const t = await textoDelPdf(d.bytes)
  pdfs.metradoLima = t
  comprobarComunes('metrado Jr. Lima', t, LIMA.nombre)
  comprobar('metrado Jr. Lima: cada página dice «no comprobado»', t.paginas.every((p) => /no (están )?comprobad/i.test(enUnaLinea(p))))
  comprobarMetrado('metrado Jr. Lima', t, LIMA.subrasante)
}

// --- 1.7 Hoja de estacas: Psje. Las Lomas (sin medir, con rasante) ---
const VISTA_LOMAS = 1.425
const bmOficial = ESPERADO.bms.find((b) => b.tipo === 'oficial')
const aiLomas = redondear3(bmOficial.cota + VISTA_LOMAS)
await elegirInforme(pagina, 'Hoja de estacas')
await elegirCalle(pagina, LOMAS.nombre)
await pagina.getByRole('textbox', { name: 'Vista atrás al BM (m)', exact: true }).fill(String(VISTA_LOMAS))
await pagina.getByRole('textbox', { name: 'Progresiva de la estación', exact: true }).fill('0+040')
// Se espera a que el informe se rehaga con lo escrito: el veredicto nombra la AI nueva.
await esperarVeredictoQueDiga(pagina, aiLomas.toFixed(3))
await esperarVistaPrevia(pagina, 'Hoja de estacas', LOMAS.nombre, 'SUBRASANTE')
{
  const v = await veredicto(pagina)
  await pagina.screenshot({ path: join(SALIDA, 'informes-estacas-1280.png'), fullPage: true })
  const d = await descargar(pagina, 'Descargar PDF')
  const t = await textoDelPdf(d.bytes)
  pdfs.estacasLomas = t
  comprobarComunes('estacas Las Lomas', t, LOMAS.nombre)
  const plano = enUnaLinea(t.todo)
  comprobar('estacas Las Lomas: sin jornadas, replantea la SUBRASANTE (no el terreno existente)', plano.includes('Capa: SUBRASANTE'), plano.match(/Capa: \S+/)?.[0] ?? '')
  comprobar('estacas Las Lomas: dice que las estacas salen de la pista del plano', plano.includes('a lo largo de la pista «PSJE. LAS LOMAS» (0+000 a 0+120)'))
  comprobar('estacas Las Lomas: estacas de 0+000 a 0+120 cada 20 m',
    ['0+000', '0+020', '0+040', '0+060', '0+080', '0+100', '0+120'].every((p) => renglonDe(t, p, 'Eje') !== null))
  comprobar(`estacas Las Lomas: altura instrumental ${aiLomas.toFixed(3)} = ${bmOficial.nombre} ${bmOficial.cota.toFixed(3)} + ${VISTA_LOMAS}`,
    t.renglones.includes(`Altura instrumental: ${aiLomas.toFixed(3)}`) && plano.includes(`BM: ${bmOficial.nombre}`))
  // Cada fila: lectura objetivo = AI − cota de proyecto.
  // Las que la mira no puede marcar salen sin número («sin lectura (…)»), para
  // que nadie copie en campo un -0.075 como si valiera.
  const re = /^(\d\+\d{3}) (Borde izquierdo|Eje|Borde derecho) (\d+\.\d{3}) (-?\d+\.\d{3}|sin lectura)/
  const filas = t.renglones.map((r) => re.exec(r)).filter(Boolean)
  const fueraDeLaMira = (l) => l <= 0 || l > LARGO_MIRA
  const malas = filas.filter((f) => {
    const objetivo = redondear3(aiLomas - Number(f[3]))
    return f[4] === 'sin lectura' ? !fueraDeLaMira(objetivo) : fueraDeLaMira(objetivo) || objetivo.toFixed(3) !== f[4]
  })
  comprobar(`estacas Las Lomas: en las ${filas.length} filas, lectura objetivo = AI − cota de proyecto`, filas.length === 21 && malas.length === 0, malas.slice(0, 2).map((f) => f[0]).join(' | '))
  // La subrasante va bajo los 0.20 m de base: en 0+000, 3244.000 − 0.200 = 3243.800.
  const espesorBase = ESPERADO.capas.find((c) => c.nombre === 'BASE').espesor
  const cotaSub0 = redondear3(LOMAS.rasante.cotaArranque - espesorBase)
  const fila0 = `0+000 Eje ${cotaSub0.toFixed(3)} ${redondear3(aiLomas - cotaSub0).toFixed(3)}`
  comprobar(`estacas Las Lomas: la fila «${fila0}»`, t.renglones.includes(fila0), renglonDe(t, '0+000', 'Eje') ?? '')
  // Con lecturas fuera de la mira, la hoja no se replanta desde esta estación: nada de ✓.
  const noCaben = filas.filter((f) => f[4] === 'sin lectura').length
  comprobar('estacas Las Lomas: las lecturas que la mira no marca salen sin número', !/ -\d+\.\d{3}/.test(plano), (plano.match(/ -\d+\.\d{3}[^)]*\)/) ?? [''])[0])
  comprobar('estacas Las Lomas: la pantalla NO dice ✓: va con △ y «cambie de estación»', v.startsWith('△') && v.includes('cambie de estación'), v)
  comprobar(`estacas Las Lomas: el veredicto cuenta las ${noCaben} de ${filas.length} lecturas que no caben`,
    noCaben > 0 && v.includes(`${noCaben} de ${filas.length} lecturas objetivo no caben`), v)
  comprobar('estacas Las Lomas: el PDF también lo dice, con «cambie de estación»',
    plano.includes(`${noCaben} de ${filas.length} lecturas objetivo no caben`) && plano.includes('cambie de estación'))
  comprobar('estacas Las Lomas: la pantalla no promete una franja que el PDF no lleva', !v.includes('franja') || /no están comprobadas/i.test(plano), v)
}

// --- 1.8 Hoja de estacas: Av. Sol, lectura objetivo de la base ---
// La AI de la primera estación de la base sale de BM-1 con la vista atrás que la da.
const LO = SOL.base.lecturaObjetivo
const vistaSol = redondear3(LO.alturaInstrumental - bmOficial.cota)
await elegirCalle(pagina, SOL.nombre)
await pagina.getByRole('textbox', { name: 'Vista atrás al BM (m)', exact: true }).fill(vistaSol.toFixed(3))
await pagina.getByRole('textbox', { name: 'Progresiva de la estación', exact: true }).fill(progresiva(LO.progresiva))
await esperarVeredictoQueDiga(pagina, LO.alturaInstrumental.toFixed(3))
await esperarVistaPrevia(pagina, 'Hoja de estacas', SOL.nombre, 'BASE')
{
  const d = await descargar(pagina, 'Descargar PDF')
  const t = await textoDelPdf(d.bytes)
  pdfs.estacasSol = t
  comprobarComunes('estacas Av. Sol', t, SOL.nombre)
  comprobar('estacas Av. Sol: replantea la BASE', enUnaLinea(t.todo).includes('Capa: BASE'))
  comprobar(`estacas Av. Sol: altura instrumental ${LO.alturaInstrumental.toFixed(3)} = BM-1 + ${vistaSol.toFixed(3)}`,
    t.renglones.includes(`Altura instrumental: ${LO.alturaInstrumental.toFixed(3)}`))
  const fila = `${progresiva(LO.progresiva)} ${LO.punto} ${LO.cotaProyecto.toFixed(3)} ${LO.lectura.toFixed(3)}`
  comprobar(`estacas Av. Sol: lectura objetivo = AI ${LO.alturaInstrumental.toFixed(3)} − ${LO.cotaProyecto.toFixed(3)} → «${fila}»`,
    t.renglones.includes(fila), renglonDe(t, progresiva(LO.progresiva), LO.punto) ?? '')
}

// Copia del texto de cada PDF, para mirarlo a mano.
writeFileSync(join(SALIDA, 'informes-texto.txt'), Object.entries(pdfs).map(([n, t]) => `===== ${n} (${t.numPaginas} pág.)\n${t.todo}`).join('\n\n'))

// ---------------------------------------------------------------------------
// 2. Celular (390×844): la pantalla cabe y los botones son grandes
// ---------------------------------------------------------------------------

const celular = await abrirEnInformes(390, 844)
await elegirInforme(celular, 'Control contra proyecto')
await elegirCalle(celular, LIMA.nombre)
await esperarVistaPrevia(celular, 'Control contra proyecto', LIMA.nombre, 'SUBRASANTE')
{
  const ancho = await celular.evaluate(() => {
    // El contenido se desplaza dentro de <main class="overflow-auto">: si se
    // sale a lo ancho, el documento sigue midiendo lo mismo. Se suma lo que
    // main se desplaza de lado.
    const main = document.querySelector('main')
    const deMain = main ? Math.max(0, main.scrollWidth - main.clientWidth) : 0
    return Math.max(document.documentElement.scrollWidth, window.innerWidth + deMain)
  })
  comprobar('celular: la página no se desplaza a lo ancho', ancho <= 390, `scrollWidth ${ancho}`)
  // Lo que se desplaza es el contenido de la pantalla, no la página: si la
  // página se alargara, la barra fija de abajo se movería con el dedo.
  const alto = await celular.evaluate(() => document.documentElement.scrollHeight)
  comprobar('celular: la página no se alarga por debajo de la pantalla', alto <= 844, `scrollHeight ${alto}`)
  const chicos = await celular.evaluate(() =>
    [...document.querySelectorAll('main button, main label:has(input[type=file]), [role=group][aria-label="Tipo de informe"] button')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ t: (b.textContent ?? '').trim().slice(0, 30), h: b.getBoundingClientRect().height }))
      .filter((b) => b.h < 44),
  )
  comprobar('celular: todos los botones de Informes miden ≥ 44 px de alto', chicos.length === 0, chicos.map((b) => `${b.t} (${b.h}px)`).join(', '))
  const v = await veredicto(celular)
  comprobar('celular: el veredicto de Jr. Lima va con △ y «No comprobado»', v.startsWith('△') && /no comprobad/i.test(v), v)
  const barra = celular.getByRole('button', { name: 'Descargar PDF', exact: true })
  const caja = await barra.boundingBox()
  comprobar('celular: «Descargar PDF» queda a la vista sin bajar', caja !== null && caja.y + caja.height <= 844, caja ? `y=${Math.round(caja.y)}` : '')
  await celular.screenshot({ path: join(SALIDA, 'informes-control-390.png') })
  await celular.screenshot({ path: join(SALIDA, 'informes-control-390-entera.png'), fullPage: true })
  const d = await descargar(celular, 'Descargar PDF')
  comprobar('celular: el PDF también se descarga', d.nombre.endsWith('.pdf'), d.nombre)
}
await elegirInforme(celular, 'Hoja de estacas')
await elegirCalle(celular, LOMAS.nombre)
await esperarVistaPrevia(celular, 'Hoja de estacas', LOMAS.nombre, 'SUBRASANTE')
await celular.screenshot({ path: join(SALIDA, 'informes-estacas-390.png'), fullPage: true })

await navegador.close()

comprobar('sin errores en la consola del navegador', erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
if (avisos.length > 0) console.log(`avisos de fuera de esta carpeta (no cuentan): ${avisos.length}`)
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 ? 0 : 1)
