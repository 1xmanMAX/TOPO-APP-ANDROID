import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Recorrido «herramientas» de la ola 3, sobre la obra simulada:
 *
 * - El camino de obra: en Medir se toca un punto, se abre Calcular y llega
 *   sola (o con «cambiar», si ya estaba abierta) la AI de la estación activa, la de la estación
 *   que leyó el punto, su lectura, la cota de proyecto y la tolerancia de la
 *   capa; todo se compara con ESPERADO. Los dos puntos fuera de tolerancia de
 *   la obra pasan por la tarjeta de «Lectura objetivo» (corte o relleno): Av. Sol 0+080 Eje (corta, ✗) y
 *   Jr. Lima 0+140 Eje (rellena, ✗, no comprobado).
 * - Calcular: la calculadora se abre encima de cualquier pantalla (en el
 *   celular a pantalla completa, en la laptop como panel a la derecha) y da
 *   resultados correctos con valores conocidos: altura instrumental desde un
 *   punto conocido, lectura objetivo (AI − cota de proyecto) con corta/rellena
 *   y semáforo con símbolo, pendiente, interpolación, conversión
 *   % ↔ grados ↔ relación y volumen por áreas medias.
 * - Reglas de la mira (diseño §2): lectura objetivo fuera de 0.30–4.70 m o que
 *   no cabe en la mira de 5 m, con las cotas de Psje. Las Lomas (+7.38 %).
 * - Lo calculado sobre una nivelación sin cerrar (Jr. Lima) o con una AI
 *   escrita a mano dice «no comprobado».
 * - En el celular, al escribir la lectura de la mira, el corte o relleno queda
 *   a la vista por encima del teclado.
 * - Notas por progresiva: se agregan con texto y foto, se ven en Revisar y se
 *   borran; la nota que guarda la calculadora va a la progresiva del punto
 *   elegido, sin preguntarla, y también aparece en Revisar.
 * - Tema sol (alto contraste): se activa y se mantiene al recargar.
 * - Botones ≥ 44 px y nada se desplaza a lo ancho a 390 px.
 *
 * Uso: node verificacion/herramientas.mjs [carpeta-de-salida]
 * Sin carpeta deja las capturas en verificacion/salida/herramientas/, que git
 * ignora. La URL sale de BASE (por defecto http://localhost:4173/).
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? fileURLToPath(new URL('./salida/herramientas/', import.meta.url))
mkdirSync(SALIDA, { recursive: true })

const ESPERADO = JSON.parse(readFileSync(new URL('./datos/obra-simulada.esperado.json', import.meta.url), 'utf8'))
const TOPO = fileURLToPath(new URL(ESPERADO.archivo.rutaDesdeGuion, import.meta.url))
const SOL = ESPERADO.avSol
const LIMA = ESPERADO.jrLima
const TOL_SUBRASANTE = ESPERADO.capas.find((c) => c.nombre === 'SUBRASANTE').toleranciaMm
const NO_COMPROBADO = new RegExp(ESPERADO.textos.noComprobado, 'i')

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

function prog(m) {
  const km = Math.floor(m / 1000)
  return `${km}+${String(Math.round(m - km * 1000)).padStart(3, '0')}`
}

const f3 = (x) => x.toFixed(3)
/** «+54 mm» / «−60 mm», como lo escribe la app. */
const mm = (d) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)} mm`
/**
 * AI compensada de la estación i (desde 0): la libreta reparte el error de
 * cierre por igual entre las estaciones, y así salen las cotas de ESPERADO.
 */
function aiCompensada(toma, i) {
  const ai = toma.alturasInstrumentales[i]
  if (toma.cierre.pasa !== true) return ai
  return ai - ((toma.cierre.errorMm / 1000) * (i + 1)) / toma.alturasInstrumentales.length
}

/**
 * Espera a que fn() dé un valor que cumpla ok, reintentando hasta ms. Se usa
 * después de cada click o tecla: React puede tardar un render en pintar.
 * Devuelve el último valor leído, cumpla o no, para el detalle del fallo.
 */
async function hasta(fn, ok, ms = 5000) {
  const fin = Date.now() + ms
  let valor
  for (;;) {
    try { valor = await fn() } catch { valor = undefined }
    if (valor !== undefined && ok(valor)) return valor
    if (Date.now() > fin) return valor
    await new Promise((r) => setTimeout(r, 100))
  }
}
/** Si el locator llega al estado pedido (visible, detached…) antes de ms. */
async function llega(locator, state, ms = 5000) {
  return locator.waitFor({ state, timeout: ms }).then(() => true, () => false)
}

const navegador = await chromium.launch()
const erroresConsola = []

async function nuevaPagina(ancho, alto) {
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } })
  pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(`${ancho}px: ${m.text()}`) })
  pagina.on('pageerror', (e) => erroresConsola.push(`${ancho}px pageerror: ${e.message}`))
  return pagina
}

async function abrirObra(ancho, alto) {
  const pagina = await nuevaPagina(ancho, alto)
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
async function texto(locator) {
  return (await locator.innerText()).replace(/\s+/g, ' ').trim()
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

function calculadora(pagina) {
  return pagina.getByRole('dialog', { name: 'Calculadora de campo' })
}
async function abrirCalculadora(pagina) {
  const boton = pagina.getByRole('banner').getByRole('button', { name: 'Calcular', exact: true })
  if ((await boton.getAttribute('aria-pressed')) !== 'true') await boton.click()
  await calculadora(pagina).waitFor({ timeout: 10000 })
}
async function pestana(pagina, nombre) {
  await calculadora(pagina).getByRole('tab', { name: nombre, exact: true }).click()
}
async function escribir(pagina, etiqueta, valor) {
  await calculadora(pagina).getByRole('textbox', { name: etiqueta, exact: true }).fill(valor)
}
/** La tarjeta de resultado: «Resultado · <título>». */
function tarjeta(pagina, titulo) {
  return calculadora(pagina).getByRole('region', { name: `Resultado · ${titulo}`, exact: true })
}
async function resultado(pagina, titulo) {
  return (await tarjeta(pagina, titulo).locator('output').innerText()).trim()
}
/** El resultado de una tarjeta una vez que llega al esperado (o el último leído). */
async function resultadoQue(pagina, titulo, ok) {
  return (await hasta(() => resultado(pagina, titulo), ok)) ?? ''
}
/** El texto entero de una tarjeta una vez que cumple ok (o el último leído). */
async function tarjetaQue(pagina, titulo, ok) {
  return (await hasta(() => texto(tarjeta(pagina, titulo)), ok)) ?? ''
}
async function casillero(pagina, etiqueta) {
  return calculadora(pagina).getByRole('textbox', { name: etiqueta, exact: true }).inputValue()
}
/** Celda del mapa de la calle por su nombre accesible («0+080 Eje: +54 mm, …»). */
function celdaMapa(pagina, pr, punto) {
  return pagina.getByRole('button', { name: new RegExp(`^${prog(pr).replace('+', '\\+')} ${punto}[:,]`) })
}
async function elegirEstacion(pagina, n) {
  const boton = pagina.getByRole('button', { name: `Estación ${n}`, exact: true })
  await boton.click()
  await hasta(() => boton.getAttribute('aria-pressed'), (v) => v === 'true')
}
/**
 * Pulsa «cambiar» (junto a «Con datos de…», bajo el título) para traer los
 * datos del punto elegido ahora, pasa a la pestaña Cota y espera a que la
 * calculadora cumpla ok. Devuelve su texto.
 */
async function traerDeLaLibreta(pagina, ok) {
  await calculadora(pagina).getByRole('button', { name: 'cambiar', exact: true }).click()
  await pestana(pagina, 'Cota')
  return (await hasta(() => texto(calculadora(pagina)), ok)) ?? ''
}
/** «Con datos de Av. Sol · 0+080 · Eje»: la línea bajo el título. */
function conDatosDe(calle, pr, punto) {
  return `Con datos de ${calle} · ${prog(pr)} · ${punto}`
}
/** Lo que dice la fila de la AI en la pestaña Cota: «Estación 3, la que leyó el punto · ✓ comprobada». */
async function filaAi(pagina) {
  const casilla = calculadora(pagina).getByRole('textbox', { name: 'Altura instrumental', exact: true })
  return texto(casilla.locator('xpath=ancestor::label[1]'))
}
/** Número de la estación que leyó el punto, según la fila de la AI en Cota; null si fue la activa. */
function estacionQueLeyo(textoCalculadora) {
  const m = textoCalculadora.match(/Estación (\d+), la que leyó el punto/)
  return m ? Number(m[1]) : null
}

/**
 * Controles visibles dentro de la raíz (un locator, que tiene que existir) por
 * debajo de 44 px de alto. Devuelve también cuántos midió: una raíz vacía no
 * puede pasar por «todo bien».
 */
async function controlesChicos(raiz) {
  return raiz.evaluate((nodo) => {
    const chicos = []
    let medidos = 0
    for (const el of nodo.querySelectorAll('button, select, textarea, input:not([type="range"]):not([type="file"]), summary')) {
      const caja = el.getBoundingClientRect()
      if (caja.width === 0 || caja.height === 0) continue
      medidos++
      if (caja.height < 43.5) {
        const nombre = el.getAttribute('aria-label') || el.textContent.trim() || el.tagName
        chicos.push(`${nombre.slice(0, 40)} (${Math.round(caja.height)} px)`)
      }
    }
    return { medidos, chicos }
  })
}

/** Una imagen PNG pequeña hecha en el propio navegador, como la que saldría de la cámara. */
async function imagenPequena(pagina) {
  const base64 = await pagina.evaluate(() => {
    const lienzo = document.createElement('canvas')
    lienzo.width = 48
    lienzo.height = 32
    const pincel = lienzo.getContext('2d')
    pincel.fillStyle = '#c2410c'
    pincel.fillRect(0, 0, 48, 32)
    pincel.fillStyle = '#fde047'
    pincel.fillRect(12, 8, 24, 16)
    return lienzo.toDataURL('image/png').split(',')[1]
  })
  return { name: 'buzon.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') }
}

function formularioNota(pagina) {
  return pagina.getByRole('form', { name: 'Nueva nota' })
}
/** Abre el plegable «Notas de la calle (n)» de Revisar si está cerrado. */
async function abrirNotas(pagina) {
  const resumen = pagina.locator('summary', { hasText: /^Notas de la calle/ }).first()
  if (!(await resumen.evaluate((s) => s.parentElement.open))) await resumen.click()
}
function grupoNotas(pagina, p) {
  return pagina.getByRole('list', { name: `Notas en ${prog(p)}`, exact: true })
}

// ===========================================================================
// 1. LAPTOP 1280×800
// ===========================================================================

const p = await abrirObra(1280, 800)

// ---------------------------------------------------------------------------
// 1.1 Notas en Revisar: las tres de Av. Sol, agregar con texto y foto, borrar
// ---------------------------------------------------------------------------

await irAModo(p, 'Revisar')
// Las notas van plegadas al final de Revisar: se abren.
await abrirNotas(p)
await p.getByRole('heading', { name: 'Notas de la calle' }).waitFor({ timeout: 10000 })
for (const nota of SOL.notas) {
  const grupo = grupoNotas(p, nota.progresiva)
  const visto = (await llega(grupo, 'visible')) && (await texto(grupo)).includes(nota.texto)
  comprobar(`Revisar de Av. Sol: la nota de ${prog(nota.progresiva)} está a la vista`, visto, nota.texto)
}

const TEXTO_NOTA = 'Tapa de buzón hundida 3 cm (prueba de herramientas)'
const form = formularioNota(p)
await form.getByRole('textbox', { name: 'Progresiva', exact: true }).fill('0+060')
await form.getByRole('textbox', { name: 'Texto de la nota' }).fill(TEXTO_NOTA)
await form.getByLabel('Tomar foto de la nota').setInputFiles(await imagenPequena(p))
await form.getByRole('img', { name: 'Foto por guardar' }).waitFor({ timeout: 10000 })
comprobar('la foto elegida se ve antes de guardar', await form.getByRole('img', { name: 'Foto por guardar' }).isVisible())
await form.getByRole('button', { name: 'Guardar nota' }).click()
const g60 = grupoNotas(p, 60)
comprobar('la nota nueva aparece en Revisar bajo 0+060 con su texto',
  (await llega(g60, 'visible')) && (await texto(g60)).includes(TEXTO_NOTA))
const fotoNota = g60.getByRole('img', { name: 'Foto de la nota en 0+060' })
// La imagen tarda en decodificarse: se reintenta hasta que el navegador la pinta.
const fotoCargada = (await hasta(
  () => fotoNota.evaluate((img) => img.complete && img.naturalWidth > 0 && img.src.startsWith('data:image/')),
  (ok) => ok === true,
)) === true
comprobar('y lleva su foto (dataURL que el navegador pinta)', fotoCargada)
comprobar('el aviso dice dónde se guardó',
  ((await hasta(() => texto(form.getByRole('status')), (t) => t.includes('Nota guardada en 0+060'))) ?? '').includes('Nota guardada en 0+060'))
// Las notas van en orden de progresiva: 0+040, 0+060, 0+080, 0+120.
const titulos = await p.getByRole('list', { name: 'Notas por progresiva' }).locator(':scope > li > h3').allInnerTexts()
comprobar('las notas se ordenan por progresiva', titulos.join(',') === '0+040,0+060,0+080,0+120', titulos.join(','))
await g60.scrollIntoViewIfNeeded()
await p.screenshot({ path: `${SALIDA}/herramientas-notas-1280.png`, fullPage: true })

// Borrar pide confirmación.
await g60.getByRole('button', { name: /^Borrar la nota/ }).click()
const siBorrar = g60.getByRole('button', { name: 'Sí, borrar' })
comprobar('borrar pide confirmar', await llega(siBorrar, 'visible'))
await siBorrar.click()
comprobar('la nota borrada desaparece de Revisar', await llega(grupoNotas(p, 60), 'detached'))
const grupos = p.getByRole('list', { name: 'Notas por progresiva' }).locator(':scope > li')
comprobar('las tres notas de la obra siguen ahí', (await hasta(() => grupos.count(), (n) => n === 3)) === 3)

// ---------------------------------------------------------------------------
// 1.2 Calcular en la laptop: panel a la derecha, sin tapar la calle
// ---------------------------------------------------------------------------

await abrirCalculadora(p)
const caja = await calculadora(p).boundingBox()
comprobar('en la laptop la calculadora es un panel a la derecha',
  caja && Math.round(caja.x + caja.width) === 1280 && caja.width <= 420 && caja.x >= 800,
  caja ? `x ${Math.round(caja.x)}, ancho ${Math.round(caja.width)}` : 'sin caja')
await abrirNotas(p)
const notasVisibles = await p.getByRole('heading', { name: 'Notas de la calle' }).boundingBox()
comprobar('y la calle se corre a su izquierda en vez de quedar tapada',
  notasVisibles && caja && notasVisibles.x + notasVisibles.width <= caja.x + 1,
  notasVisibles ? `notas hasta x ${Math.round(notasVisibles.x + notasVisibles.width)}` : '')
const cabeceraCalc = await texto(calculadora(p))
comprobar('la calculadora se titula «Calcular» y dice de qué calle son los datos',
  (await calculadora(p).getByRole('heading', { name: 'Calcular', exact: true }).isVisible()) && cabeceraCalc.includes(`Con datos de ${SOL.nombre}`),
  cabeceraCalc.slice(0, 120))
const filaAiSol = await filaAi(p)
comprobar('Av. Sol cerró: al lado de la AI se dice comprobada (✓)', filaAiSol.includes('✓ comprobada'), filaAiSol)

// ---------------------------------------------------------------------------
// 1.3 El camino de obra: Medir › tocar 0+080 Eje › Calcular › Traer datos
// ---------------------------------------------------------------------------

const fuera = SOL.subrasante.fuera
const AIS = SOL.subrasante.alturasInstrumentales
const nActiva = AIS.length // al abrir queda activa la última estación
await irAModo(p, 'Medir')
// Con la calculadora abierta, tocar otro punto no mezcla datos: lo avisa. Se
// toca el mismo punto 20 m antes, que no es el de los datos de ahora.
const otraProg = fuera.progresiva - 20
await celdaMapa(p, otraProg, fuera.punto).click()
const avisoOtro = (await hasta(() => texto(calculadora(p)), (t) => t.includes(`ahora tienes ${prog(otraProg)} · ${fuera.punto} elegido`))) ?? ''
comprobar('tocar otro punto con la calculadora abierta avisa en ámbar «Con datos de … · ahora tienes … elegido · cambiar»',
  avisoOtro.includes(`△ Con datos de `) && avisoOtro.includes(`ahora tienes ${prog(otraProg)} · ${fuera.punto} elegido · cambiar`), avisoOtro.slice(0, 160))
await celdaMapa(p, fuera.progresiva, fuera.punto).click()
let cab = await traerDeLaLibreta(p, (t) => t.includes(conDatosDe(SOL.nombre, fuera.progresiva, fuera.punto)) && !t.includes('ahora tienes'))
comprobar(`«cambiar»: los datos son de ${SOL.nombre} ${prog(fuera.progresiva)} ${fuera.punto}, el punto tocado`,
  cab.includes(`${conDatosDe(SOL.nombre, fuera.progresiva, fuera.punto)} · cambiar`), cab.slice(0, 120))
const nLeyo = estacionQueLeyo(cab)
comprobar('y al lado de la AI dice qué estación leyó el punto y que está comprobada',
  nLeyo !== null && nLeyo !== nActiva && (await filaAi(p)).includes(`Estación ${nLeyo}, la que leyó el punto · ✓ comprobada`),
  await filaAi(p))
const iLeyo = (nLeyo ?? nActiva) - 1

// Pestaña Cota: la AI de la estación que leyó, la lectura de la libreta y la
// cota sin repartir el error de cierre (Revisar y ESPERADO sí lo reparten).
await pestana(p, 'Cota')
const aiCotaTraida = await casillero(p, 'Altura instrumental')
const lecturaTraida = await casillero(p, 'Lectura')
const lecturaEsperada = f3(aiCompensada(SOL.subrasante, iLeyo) - fuera.cotaMedida)
comprobar(`Cota: trae la AI de la estación ${iLeyo + 1} (${f3(AIS[iLeyo])}), no la de la activa`, aiCotaTraida === f3(AIS[iLeyo]), aiCotaTraida)
comprobar(`y la lectura anotada en ${prog(fuera.progresiva)} ${fuera.punto} (${lecturaEsperada} = AI compensada − ${f3(fuera.cotaMedida)})`,
  lecturaTraida === lecturaEsperada, lecturaTraida)
const cotaSinRepartir = f3(AIS[iLeyo] - Number(lecturaEsperada))
const correccionMm = Math.round((aiCompensada(SOL.subrasante, iLeyo) - AIS[iLeyo]) * 1000)
const tCotaObra = await tarjetaQue(p, 'Cota', (t) => t.includes(`${cotaSinRepartir} m`))
comprobar(`la cota sale ${cotaSinRepartir} m: la de ESPERADO (${f3(fuera.cotaMedida)}) sin los ${correccionMm} mm del reparto, y lo dice`,
  tCotaObra.includes(`${cotaSinRepartir} m`) && tCotaObra.includes('sin repartir el error de cierre') &&
    Math.round((fuera.cotaMedida - Number(cotaSinRepartir)) * 1000) === correccionMm && !NO_COMPROBADO.test(tCotaObra),
  tCotaObra.slice(0, 140))

// Lectura objetivo con la estación activa: AI de la activa, cota de proyecto
// del punto y la tolerancia de la capa (SUBRASANTE). La lectura anotada es de
// otra estación, así que no se junta con la AI de la activa.
await pestana(p, 'Lectura objetivo')
const aiObj = await casillero(p, 'Altura instrumental')
const proyObj = await casillero(p, 'Cota de proyecto')
const tolObj = await casillero(p, 'Tolerancia')
const filaAiObj = await filaAi(p)
comprobar(`Lectura objetivo: AI de la activa ${f3(AIS[nActiva - 1])} (estación ${nActiva}, ✓), cota de proyecto ${f3(fuera.cotaProyecto)} y tolerancia ${TOL_SUBRASANTE} mm de la capa`,
  aiObj === f3(AIS[nActiva - 1]) && proyObj === f3(fuera.cotaProyecto) && tolObj === String(TOL_SUBRASANTE) &&
    filaAiObj.includes(`Estación ${nActiva} · ✓ comprobada`),
  `${aiObj} · ${proyObj} · ${tolObj} · ${filaAiObj}`)
const objActiva = f3(AIS[nActiva - 1] - fuera.cotaProyecto)
comprobar(`lectura objetivo = ${aiObj} − ${proyObj} = ${objActiva} m`,
  (await resultadoQue(p, 'Lectura objetivo', (r) => r === `${objActiva} m`)) === `${objActiva} m`)
comprobar('la lectura de la mira queda vacía: la anotada es de otra estación',
  (await casillero(p, 'Lectura en la mira')) === '' && (await texto(calculadora(p).getByRole('tabpanel'))).includes(`es de la estación ${iLeyo + 1}, no de la activa`))

// Con la estación que leyó el punto como activa: el corte o relleno con
// los datos reales del punto fuera de tolerancia.
await elegirEstacion(p, iLeyo + 1)
const avisoEstacion = (await hasta(() => texto(calculadora(p)), (t) => t.includes(`ahora tienes la estación ${iLeyo + 1} activa`))) ?? ''
comprobar(`activando la estación ${iLeyo + 1} en el mismo punto, avisa «ahora tienes la estación ${iLeyo + 1} activa»`,
  avisoEstacion.includes(`${conDatosDe(SOL.nombre, fuera.progresiva, fuera.punto)} · estación ${nActiva} · ahora tienes la estación ${iLeyo + 1} activa · cambiar`), avisoEstacion.slice(0, 160))
cab = await traerDeLaLibreta(p, (t) => t.includes(`Estación ${iLeyo + 1} · ✓ comprobada`))
comprobar(`y con «cambiar» la AI ${f3(AIS[iLeyo])} es la de la estación ${iLeyo + 1}, ahora activa, comprobada`,
  cab.includes(`${conDatosDe(SOL.nombre, fuera.progresiva, fuera.punto)} · cambiar`) &&
    (await filaAi(p)).includes(`Estación ${iLeyo + 1} · ✓ comprobada`) && (await casillero(p, 'Altura instrumental')) === f3(AIS[iLeyo]),
  `${cab.slice(0, 100)} · ${await filaAi(p)}`)
await pestana(p, 'Lectura objetivo')
const miraTraida = await casillero(p, 'Lectura en la mira')
const difSinRepartir = Math.round((AIS[iLeyo] - Number(lecturaEsperada) - fuera.cotaProyecto) * 1000)
comprobar(`la mira trae la lectura anotada (${lecturaEsperada}) y la diferencia es la de ESPERADO menos el reparto: ${mm(fuera.diferenciaMm)} − ${correccionMm} mm = ${mm(difSinRepartir)}`,
  miraTraida === lecturaEsperada && difSinRepartir === fuera.diferenciaMm - correccionMm, miraTraida)
const accionFuera = fuera.accion === 'corta' ? 'Cortar' : 'Rellenar'
let control = await tarjetaQue(p, 'Lectura objetivo', (t) => t.includes(`${accionFuera} ${Math.abs(difSinRepartir)} mm`))
comprobar(`Av. Sol ${prog(fuera.progresiva)} ${fuera.punto}: «${accionFuera} ${Math.abs(difSinRepartir)} mm» y ✗ fuera (${mm(difSinRepartir)}) con la tolerancia ${TOL_SUBRASANTE} de SUBRASANTE`,
  control.includes(`${accionFuera} ${Math.abs(difSinRepartir)} mm`) && control.includes('✗') &&
    control.includes(`Fuera de tolerancia (${mm(difSinRepartir)})`) && control.includes('sin repartir el error de cierre') && !NO_COMPROBADO.test(control),
  control.slice(0, 200))
await p.screenshot({ path: `${SALIDA}/herramientas-obra-sol-1280.png` })
// Se deja la activa como estaba al abrir.
await elegirEstacion(p, nActiva)

// ---------------------------------------------------------------------------
// 1.4 A mano: AI desde un BM, reglas de la mira y el resto de las cuentas
// ---------------------------------------------------------------------------

// Altura instrumental desde un punto conocido: BM-1 3245.180 + 1.452 = 3246.632.
const bm1 = ESPERADO.bms.find((b) => b.nombre === 'BM-1')
const aiEst1 = AIS[0]
const vistaAtras = (aiEst1 - bm1.cota).toFixed(3)
await pestana(p, 'Cota')
await calculadora(p).getByText('Altura instrumental desde un punto conocido').click()
await escribir(p, 'Cota del punto conocido', bm1.cota.toFixed(3))
await escribir(p, 'Vista atrás', vistaAtras)
const textoAi = (await hasta(() => texto(calculadora(p).locator('details')), (t) => t.includes(`AI = ${f3(aiEst1)} m`))) ?? ''
comprobar(`AI = BM-1 ${bm1.cota.toFixed(3)} + ${vistaAtras} = ${aiEst1.toFixed(3)}`, textoAi.includes(`AI = ${aiEst1.toFixed(3)} m`), textoAi.slice(-40))
await calculadora(p).getByRole('button', { name: 'Usar esta altura instrumental' }).click()
const aiCota = await hasta(() => casillero(p, 'Altura instrumental'), (v) => v === f3(aiEst1))
comprobar('«Usar esta altura instrumental» la pasa al casillero', aiCota === aiEst1.toFixed(3), aiCota)

// Una cota con esa AI: la aritmética (AI − lectura), y que se marca como no
// comprobada aunque Av. Sol cerró, porque esa AI no la respalda ningún cierre.
const LECTURA_A_MANO = '2.958'
await escribir(p, 'Lectura', LECTURA_A_MANO)
const cotaAMano = f3(aiEst1 - Number(LECTURA_A_MANO))
const tCotaAMano = await tarjetaQue(p, 'Cota', (t) => t.includes(`${cotaAMano} m`))
comprobar(`cota = ${f3(aiEst1)} − ${LECTURA_A_MANO} = ${cotaAMano} m`, tCotaAMano.includes(`${cotaAMano} m`), tCotaAMano.slice(0, 80))
const filaAiAMano = await filaAi(p)
comprobar('con la AI sacada de un BM la cota lleva △ «No comprobado: AI escrita a mano…», y la AI ya no lleva ✓',
  tCotaAMano.includes('△') && /No comprobado: AI escrita a mano o sacada de un punto conocido/.test(tCotaAMano) &&
    filaAiAMano.includes('Escrita a mano') && !filaAiAMano.includes('✓'), `${tCotaAMano.slice(0, 160)} · ${filaAiAMano}`)

// Lectura objetivo: AI 3246.467 − 3244.030 = 2.437 (base de Av. Sol).
const lo = SOL.base.lecturaObjetivo
await pestana(p, 'Lectura objetivo')
await escribir(p, 'Altura instrumental', lo.alturaInstrumental.toFixed(3))
await escribir(p, 'Cota de proyecto', lo.cotaProyecto.toFixed(3))
await escribir(p, 'Lectura en la mira', '')
const objetivo = await resultadoQue(p, 'Lectura objetivo', (r) => r === `${f3(lo.lectura)} m`)
comprobar(`lectura objetivo = AI ${lo.alturaInstrumental.toFixed(3)} − ${lo.cotaProyecto.toFixed(3)} = ${lo.lectura.toFixed(3)} m`,
  objetivo === `${lo.lectura.toFixed(3)} m`, objetivo)
const tObjAMano = await texto(tarjeta(p, 'Lectura objetivo'))
comprobar('con la AI escrita a mano el número grande lleva △ «No comprobado» y por qué',
  tObjAMano.includes('△') && /No comprobado: AI escrita a mano/.test(tObjAMano), tObjAMano.slice(0, 200))
// La mira marca menos que el objetivo: sobra material, corta. 2.400 → +37 mm, fuera con tol 10 (2×tol = 20).
await escribir(p, 'Tolerancia', '10')
await escribir(p, 'Lectura en la mira', (lo.lectura - 0.037).toFixed(3))
control = await tarjetaQue(p, 'Lectura objetivo', (t) => t.includes('Cortar 37 mm'))
comprobar('mira 37 mm por debajo del objetivo: «Cortar 37 mm» y ✗ fuera (+37 mm)',
  control.includes('Cortar 37 mm') && control.includes('✗') && /Fuera de tolerancia \(\+37 mm\)/.test(control), control.slice(0, 160))
// Marca más: falta material, rellena. +8 mm de lectura → −8 mm, conforme.
await escribir(p, 'Lectura en la mira', (lo.lectura + 0.008).toFixed(3))
control = await tarjetaQue(p, 'Lectura objetivo', (t) => t.includes('Rellenar 8 mm'))
comprobar('mira 8 mm por encima: «Rellenar 8 mm» y ✓ conforme (−8 mm)',
  control.includes('Rellenar 8 mm') && control.includes('✓') && /Conforme \(−8 mm\)/.test(control), control.slice(0, 160))
// Al límite: −15 mm con tol 10 está entre tol y 2×tol.
await escribir(p, 'Lectura en la mira', (lo.lectura + 0.015).toFixed(3))
control = await tarjetaQue(p, 'Lectura objetivo', (t) => t.includes('Rellenar 15 mm'))
comprobar('mira 15 mm por encima con tol 10: △ al límite (−15 mm)',
  control.includes('Rellenar 15 mm') && control.includes('△') && /Al límite de tolerancia \(−15 mm\)/.test(control), control.slice(0, 160))
// AI escrita a mano: el motor no la ve respaldada por un cierre y lo dice.
comprobar('con la AI escrita a mano, la lectura se dice no comprobada y por qué', NO_COMPROBADO.test(control) && control.includes('escrita a mano'))
await p.screenshot({ path: `${SALIDA}/herramientas-calc-objetivo-1280.png` })

// Reglas de la mira (diseño §2) con las cotas de Psje. Las Lomas, +7.38 %:
// desde una estación con AI 3249.200, el arranque (0+000) da 5.200, que no
// cabe en la mira de 5 m; 0+005 da 4.831 y 0+070 da 0.034, fuera de
// 0.30–4.70; 0+010 da 4.462, legible.
const lomas = ESPERADO.lasLomas
const cotaLomas = (x) => lomas.rasante.cotaArranque + (lomas.rasante.pendiente / 100) * x
const AI_LOMAS = 3249.2
await escribir(p, 'Lectura en la mira', '')
await escribir(p, 'Altura instrumental', f3(AI_LOMAS))
const casosMira = [
  { x: 0, aviso: 'no cabe en una mira de 5 m' },
  { x: 5, aviso: 'fuera de 0.300 … 4.700 m: poco precisa, mejor cambiar de estación' },
  { x: 70, aviso: 'fuera de 0.300 … 4.700 m: poco precisa, mejor cambiar de estación' },
  { x: 10, aviso: null },
]
for (const caso of casosMira) {
  const proy = f3(cotaLomas(caso.x))
  const obj = f3(AI_LOMAS - Number(proy))
  await escribir(p, 'Cota de proyecto', proy)
  const t = await tarjetaQue(p, 'Lectura objetivo', (x) => x.includes(`${obj} m`))
  const ok = caso.aviso
    ? t.includes(`${obj} m`) && t.includes(`△ Objetivo: La lectura ${obj} `) && t.includes(caso.aviso)
    : t.includes(`${obj} m`) && !t.includes('Objetivo: La lectura')
  comprobar(`Las Lomas ${prog(caso.x)} (${proy}) desde AI ${f3(AI_LOMAS)}: objetivo ${obj} m ${caso.aviso ? `avisa △ «${caso.aviso}»` : 'sin aviso'}`,
    ok, t.slice(0, 200))
}
// La lectura que se escribe en la mira también se juzga con las mismas reglas.
await escribir(p, 'Lectura en la mira', '4.850')
control = await tarjetaQue(p, 'Lectura objetivo', (t) => t.includes('4.850'))
comprobar('una lectura en la mira de 4.850 avisa △ que está fuera de 0.300 … 4.700 m',
  control.includes('△') && control.includes('La lectura 4.850 está fuera de 0.300 … 4.700 m'), control.slice(0, 220))
await escribir(p, 'Lectura en la mira', '5.200')
control = await tarjetaQue(p, 'Lectura objetivo', (t) => t.includes('5.200'))
comprobar('y una de 5.200 avisa que no cabe en la mira de 5 m, sin juzgar corte ni relleno',
  control.includes('no cabe en una mira de 5 m') && !/Cortar|Rellenar/.test(control), control.slice(0, 220))
await escribir(p, 'Lectura en la mira', '')
await p.screenshot({ path: `${SALIDA}/herramientas-calc-mira-1280.png` })

// Pendiente: rasante de Av. Sol, 3244.100 → 3243.680 en 120 m = −0.35 %.
await pestana(p, 'Pendiente')
await escribir(p, 'Cota inicial', SOL.rasante.cotaArranque.toFixed(3))
await escribir(p, 'Cota final', SOL.rasante.cotaFin.toFixed(3))
await escribir(p, 'Distancia', '120')
const pend = await resultadoQue(p, 'Pendiente', (r) => r === '−0.35 %')
const pendTarjeta = await texto(tarjeta(p, 'Pendiente'))
comprobar('pendiente 3244.100 → 3243.680 en 120 m = −0.35 % (baja 0.420 m)',
  pend === '−0.35 %' && pendTarjeta.includes('Baja') && pendTarjeta.includes('desnivel −0.420 m'), `${pend} · ${pendTarjeta.slice(0, 120)}`)

// Interpolar: Psje. Las Lomas, +7.38 % desde 3244.000: en 0+060 da 3248.428.
await pestana(p, 'Interpolar')
await escribir(p, 'Progresiva A', '0+000')
await escribir(p, 'Cota A', cotaLomas(0).toFixed(3))
await escribir(p, 'Progresiva B', '0+120')
await escribir(p, 'Cota B', cotaLomas(120).toFixed(3))
await escribir(p, 'Progresiva buscada', '0+060')
const interp = await resultadoQue(p, 'Cota interpolada', (r) => r === `${cotaLomas(60).toFixed(3)} m`)
comprobar(`interpolar en 0+060 entre ${cotaLomas(0).toFixed(3)} y ${cotaLomas(120).toFixed(3)} = ${cotaLomas(60).toFixed(3)} m`,
  interp === `${cotaLomas(60).toFixed(3)} m`, interp)
await escribir(p, 'Progresiva buscada', '0+150')
const extra = await tarjetaQue(p, 'Cota interpolada', (t) => /extrapolación/.test(t))
comprobar('fuera del tramo A–B avisa que es extrapolación', /extrapolación/.test(extra) && extra.includes('△'), extra.slice(0, 120))

// Volumen por áreas medias: (10 + 14) / 2 × 20 = 240 m³.
await pestana(p, 'Volumen')
await escribir(p, 'Área inicial', '10')
await escribir(p, 'Área final', '14')
await escribir(p, 'Distancia entre secciones', '20')
const vol = await resultadoQue(p, 'Volumen', (r) => r === '240.000 m³')
comprobar('volumen por áreas medias (10 + 14)/2 × 20 = 240.000 m³', vol === '240.000 m³', vol)

// Conversión: 100 % = 45° = 1:1; 5° = 8.749 %; 1:50 = 2 %.
await pestana(p, 'Conversión')
const conv = calculadora(p).getByRole('group', { name: 'Convertir desde' })
await conv.getByRole('button', { name: 'Porcentaje' }).click()
await escribir(p, 'Pendiente a convertir', '100')
let c = await resultadoQue(p, 'Conversión', (r) => r.includes('+45.000°'))
comprobar('100 % = 45° = 1:1', c.includes('+100.000 %') && c.includes('+45.000°') && /1:1(\s|$)/.test(c), c)
await conv.getByRole('button', { name: 'Grados' }).click()
await escribir(p, 'Pendiente a convertir', '5')
c = await resultadoQue(p, 'Conversión', (r) => r.includes('+8.749 %'))
comprobar('5° = 8.749 %', c.includes('+8.749 %') && c.includes('+5.000°'), c)
await conv.getByRole('button', { name: 'Relación 1:n' }).click()
await escribir(p, 'Pendiente a convertir', '1:50')
c = await resultadoQue(p, 'Conversión', (r) => r.includes('+2.000 %'))
comprobar('1:50 = 2 % = 1.146°', c.includes('+2.000 %') && c.includes('+1.146°') && c.includes('1:50'), c)
await p.screenshot({ path: `${SALIDA}/herramientas-calc-conversion-1280.png` })

// La cota calculada se guarda como nota en la progresiva del punto de los
// datos (0+080 Eje), sin preguntarla, y aparece en Revisar detrás del panel.
await pestana(p, 'Cota')
const tCota = tarjeta(p, 'Cota')
comprobar('con un punto elegido no se pregunta la progresiva de la nota',
  (await tCota.getByRole('textbox', { name: 'Progresiva de la nota' }).count()) === 0)
await tCota.getByRole('button', { name: 'Guardar como nota' }).click()
const avisoNota = (await hasta(() => texto(calculadora(p)), (t) => t.includes('Nota guardada'))) ?? ''
comprobar(`«Guardar como nota» dice que la guardó en ${prog(fuera.progresiva)}`,
  avisoNota.includes(`Nota guardada en ${prog(fuera.progresiva)}.`), avisoNota.slice(-160))
await irAModo(p, 'Revisar')
await abrirNotas(p)
const gNota = grupoNotas(p, fuera.progresiva)
const tGNota = (await llega(gNota, 'visible')) ? await texto(gNota) : `sin grupo ${prog(fuera.progresiva)}`
comprobar(`«Guardar como nota» de la calculadora aparece en Revisar bajo ${prog(fuera.progresiva)}`,
  tGNota.includes(`Cota: ${cotaAMano} m`), tGNota.slice(0, 160))
comprobar('y la nota dice que la cota no está comprobada (AI escrita a mano)',
  tGNota.includes('no comprobado, AI escrita a mano'), tGNota.slice(0, 200))
await p.screenshot({ path: `${SALIDA}/herramientas-calc-nota-1280.png` })

// Encima de cualquier pantalla: también en Obra.
await p.getByRole('navigation', { name: 'Espacios' }).getByRole('button', { name: 'Obra', exact: true }).click()
// Primero se espera a que Calle se vaya (sus modos desaparecen): si no, se
// vería el panel todavía abierto antes de que Obra se monte.
const salioDeCalle = await llega(p.getByRole('navigation', { name: 'Modos de la calle' }), 'detached')
comprobar('la calculadora sigue abierta encima de Obra', salioDeCalle && (await calculadora(p).isVisible()))
await p.keyboard.press('Escape')
comprobar('Escape la cierra', await llega(calculadora(p), 'detached'))
await p.getByRole('navigation', { name: 'Espacios' }).getByRole('button', { name: 'Calle', exact: true }).click()

// ---------------------------------------------------------------------------
// 1.3 Jr. Lima sin cerrar: lo calculado con la libreta es «no comprobado»
// ---------------------------------------------------------------------------

await elegirCalle(p, LIMA.nombre)
await irAModo(p, 'Medir')
const fueraLima = LIMA.subrasante.fuera
const AIS_LIMA = LIMA.subrasante.alturasInstrumentales
await celdaMapa(p, fueraLima.progresiva, fueraLima.punto).click()
await abrirCalculadora(p)
// Al abrir, los casilleros llegan solos con el punto elegido: sin pulsar nada.
await pestana(p, 'Cota')
let cabLima = (await hasta(() => texto(calculadora(p)), (t) => t.includes(conDatosDe(LIMA.nombre, fueraLima.progresiva, fueraLima.punto)))) ?? ''
const filaAiLima = await filaAi(p)
comprobar(`Jr. Lima: al abrir ya trae ${prog(fueraLima.progresiva)} ${fueraLima.punto} y al lado de la AI dice △ sin comprobar`,
  cabLima.includes(`${conDatosDe(LIMA.nombre, fueraLima.progresiva, fueraLima.punto)} · cambiar`) && filaAiLima.includes('△ sin comprobar'),
  `${cabLima.slice(0, 100)} · ${filaAiLima}`)
// Si leyó el punto otra estación, se activa esa: así la mira se juzga con su AI.
const nLima = estacionQueLeyo(cabLima) ?? AIS_LIMA.length
if (nLima !== AIS_LIMA.length) {
  await elegirEstacion(p, nLima)
  cabLima = await traerDeLaLibreta(p, (t) => t.includes(`Estación ${nLima} · △ sin comprobar`))
}
await pestana(p, 'Lectura objetivo')
const aiLima = await casillero(p, 'Altura instrumental')
const proyLima = await casillero(p, 'Cota de proyecto')
const miraLima = await casillero(p, 'Lectura en la mira')
const miraLimaEsperada = f3(AIS_LIMA[nLima - 1] - fueraLima.cotaMedida)
comprobar(`Jr. Lima ${prog(fueraLima.progresiva)} ${fueraLima.punto}: trae la AI de la estación ${nLima} (${f3(AIS_LIMA[nLima - 1])}), la cota de proyecto ${f3(fueraLima.cotaProyecto)}, la lectura ${miraLimaEsperada} y la tolerancia ${TOL_SUBRASANTE}`,
  aiLima === f3(AIS_LIMA[nLima - 1]) && proyLima === f3(fueraLima.cotaProyecto) && miraLima === miraLimaEsperada &&
    (await casillero(p, 'Tolerancia')) === String(TOL_SUBRASANTE),
  `${aiLima} · ${proyLima} · ${miraLima}`)
const objLima = f3(AIS_LIMA[nLima - 1] - fueraLima.cotaProyecto)
const tObj = await tarjetaQue(p, 'Lectura objetivo', (t) => t.includes(`${objLima} m`))
comprobar(`Jr. Lima: lectura objetivo = ${aiLima} − ${proyLima} = ${objLima} m`, tObj.includes(`${objLima} m`), tObj.slice(0, 80))
comprobar('y el resultado se dice «no comprobado» con su símbolo △', NO_COMPROBADO.test(tObj) && tObj.includes('△'), tObj.slice(0, 200))
const accionLima = fueraLima.accion === 'corta' ? 'Cortar' : 'Rellenar'
const controlLima = await tarjetaQue(p, 'Lectura objetivo', (t) => t.includes(`${accionLima} ${Math.abs(fueraLima.diferenciaMm)} mm`))
comprobar(`Jr. Lima: «${accionLima} ${Math.abs(fueraLima.diferenciaMm)} mm», ✗ fuera (${mm(fueraLima.diferenciaMm)}) y △ no comprobado`,
  controlLima.includes(`${accionLima} ${Math.abs(fueraLima.diferenciaMm)} mm`) && controlLima.includes('✗') &&
    controlLima.includes(`Fuera de tolerancia (${mm(fueraLima.diferenciaMm)})`) && NO_COMPROBADO.test(controlLima) && controlLima.includes('△'),
  controlLima.slice(0, 220))
await p.screenshot({ path: `${SALIDA}/herramientas-calc-lima-1280.png` })
await calculadora(p).getByRole('button', { name: 'Cerrar calculadora' }).click()
comprobar('«Cerrar calculadora» la cierra', await llega(calculadora(p), 'detached'))

// ---------------------------------------------------------------------------
// 1.6 Tema sol: se activa y se mantiene al recargar
// ---------------------------------------------------------------------------

// El modo sol es un botón de un toque en la cabecera (lienzo ModoSol).
const botonTema = p.getByRole('button', { name: 'Modo sol' })
if ((await botonTema.getAttribute('aria-pressed')) !== 'true') await botonTema.click()
comprobar('el botón «Modo sol» queda pulsado', (await botonTema.getAttribute('aria-pressed')) === 'true')
const clases = await p.evaluate(() => document.documentElement.className)
comprobar('el tema sol se activa (html lleva sol y dark)', /\bsol\b/.test(clases) && /\bdark\b/.test(clases), clases)
comprobar('y se guarda', (await p.evaluate(() => localStorage.getItem('topo:tema'))) === 'sol')
const fondo = await p.evaluate(() => getComputedStyle(document.body).backgroundColor)
comprobar('en modo sol el fondo es negro', /rgb\(0, 0, 0\)|rgba\(0, 0, 0/.test(fondo) || fondo === 'rgb(0, 0, 0)', fondo)
await abrirCalculadora(p)
await p.screenshot({ path: `${SALIDA}/herramientas-sol-1280.png` })
await p.reload({ waitUntil: 'load', timeout: 120000 })
await botonTema.waitFor({ timeout: 30000 })
const clasesTras = (await hasta(() => p.evaluate(() => document.documentElement.className), (c) => /\bsol\b/.test(c))) ?? ''
const pulsadoTras = (await hasta(() => botonTema.getAttribute('aria-pressed'), (v) => v === 'true')) ?? ''
comprobar('al recargar sigue en sol, con el botón pulsado y guardado',
  /\bsol\b/.test(clasesTras) && pulsadoTras === 'true' && (await p.evaluate(() => localStorage.getItem('topo:tema'))) === 'sol',
  `${clasesTras} · aria-pressed=${pulsadoTras}`)
await p.screenshot({ path: `${SALIDA}/herramientas-sol-recargado-1280.png` })
await p.close()

// ===========================================================================
// 2. CELULAR 390×844
// ===========================================================================

const m = await abrirObra(390, 844)
await irAModo(m, 'Medir')
// El camino de obra en el celular: la estación que leyó 0+080 Eje, tocar el
// punto y abrir Calcular; los casilleros llegan llenos de la libreta.
await elegirEstacion(m, iLeyo + 1)
await celdaMapa(m, fuera.progresiva, fuera.punto).click()
await abrirCalculadora(m)
const cajaM = await calculadora(m).boundingBox()
// Ocupa todo lo que queda bajo la barra de arriba, que sigue a mano (antes la
// barra le tapaba «Cerrar calculadora»).
const barraArriba = await m.getByRole('banner').boundingBox()
const finBarra = barraArriba ? barraArriba.y + barraArriba.height : -1
// Abajo queda la barra de los espacios (Obra · Calle · Calcular · Informes):
// la calculadora llega hasta ella, para que «Calcular» siga a mano y la cierre.
const barraAbajo = await m.getByRole('navigation', { name: 'Espacios' }).boundingBox()
const inicioBarraAbajo = barraAbajo ? barraAbajo.y : 844
comprobar('en el celular la calculadora ocupa toda la pantalla entre la barra de arriba y la de abajo',
  cajaM && cajaM.x === 0 && Math.round(cajaM.width) === 390 && Math.abs(cajaM.y - finBarra) <= 1 && Math.abs(cajaM.y + cajaM.height - inicioBarraAbajo) <= 1,
  cajaM ? `${Math.round(cajaM.x)},${Math.round(cajaM.y)} ${Math.round(cajaM.width)}×${Math.round(cajaM.height)}, barra hasta ${Math.round(finBarra)}, barra de abajo desde ${Math.round(inicioBarraAbajo)}` : 'sin caja')
await pestana(m, 'Lectura objetivo')
comprobar(`celular: llega la AI ${f3(AIS[iLeyo])} y la lectura ${lecturaEsperada} de ${prog(fuera.progresiva)} ${fuera.punto}`,
  (await casillero(m, 'Altura instrumental')) === f3(AIS[iLeyo]) && (await casillero(m, 'Lectura en la mira')) === lecturaEsperada)
// Al escribir la lectura de la mira se abre el teclado del teléfono, que tapa
// la mitad de abajo (aquí, todo lo que quede más abajo de 844 × 0.55 = 464 px).
// El corte o relleno tiene que verse entre la barra de arriba y el teclado.
const ALTO_SIN_TECLADO = Math.round(844 * 0.55)
await calculadora(m).evaluate((d) => { d.scrollTop = 0 })
await escribir(m, 'Lectura en la mira', lecturaEsperada)
const salidaControl = tarjeta(m, 'Lectura objetivo').locator('output')
await hasta(() => salidaControl.innerText(), (t) => t.includes(accionFuera))
const cajaSalida = await hasta(() => salidaControl.boundingBox(), (b) => b && b.y + b.height <= ALTO_SIN_TECLADO, 2000)
const cajaMira = await calculadora(m).getByRole('textbox', { name: 'Lectura en la mira', exact: true }).boundingBox()
const barraM = await m.getByRole('banner').boundingBox()
comprobar(`celular: al escribir la lectura, «${accionFuera} ${Math.abs(difSinRepartir)} mm» queda a la vista sobre el teclado (por encima de ${ALTO_SIN_TECLADO} px), sin desplazarse`,
  cajaSalida && cajaMira && barraM && cajaSalida.y + cajaSalida.height <= ALTO_SIN_TECLADO &&
    cajaMira.y >= barraM.y + barraM.height && cajaSalida.y > cajaMira.y &&
    (await salidaControl.innerText()).includes(`${accionFuera} ${Math.abs(difSinRepartir)} mm`),
  `casillero en y ${Math.round(cajaMira?.y ?? -1)}, resultado de y ${Math.round(cajaSalida?.y ?? -1)} a ${Math.round((cajaSalida?.y ?? 0) + (cajaSalida?.height ?? 0))}, barra hasta ${Math.round((barraM?.y ?? 0) + (barraM?.height ?? 0))}`)
await m.screenshot({ path: `${SALIDA}/herramientas-calc-teclado-390.png` })
// Con valores de la base, como antes. Sin lectura de mira: así lo grande
// de la tarjeta es la lectura objetivo y no el corte o relleno.
await escribir(m, 'Lectura en la mira', '')
await escribir(m, 'Altura instrumental', lo.alturaInstrumental.toFixed(3))
await escribir(m, 'Cota de proyecto', lo.cotaProyecto.toFixed(3))
comprobar('celular: lectura objetivo 2.437 m',
  (await resultadoQue(m, 'Lectura objetivo', (r) => r === `${f3(lo.lectura)} m`)) === `${lo.lectura.toFixed(3)} m`)
await escribir(m, 'Lectura en la mira', (lo.lectura - 0.037).toFixed(3))
await m.screenshot({ path: `${SALIDA}/herramientas-calc-390.png`, fullPage: true })
const chicosCalc = []
for (const id of ['Cota', 'Lectura objetivo', 'Pendiente', 'Interpolar', 'Volumen', 'Conversión']) {
  await pestana(m, id)
  if (id === 'Cota') await calculadora(m).getByText('Altura instrumental desde un punto conocido').click()
  const { medidos, chicos } = await controlesChicos(calculadora(m))
  if (medidos < 8) chicosCalc.push(`${id}: solo ${medidos} controles medidos`)
  for (const ch of chicos) chicosCalc.push(`${id}: ${ch}`)
  const a = await anchoDePagina(m)
  if (a > 390) chicosCalc.push(`${id}: la página mide ${a} px de ancho`)
}
comprobar('celular: todos los controles de la calculadora miden ≥ 44 px y nada se sale a lo ancho', chicosCalc.length === 0, chicosCalc.slice(0, 6).join(' | '))
await pestana(m, 'Conversión')
await m.screenshot({ path: `${SALIDA}/herramientas-calc-conversion-390.png`, fullPage: true })
// El botón de cerrar tiene que poder tocarse: lo que hay en su centro es él.
const cerrarM = calculadora(m).getByRole('button', { name: 'Cerrar calculadora' })
await cerrarM.evaluate((b) => b.scrollIntoView({ block: 'nearest' }))
const encima = await cerrarM.evaluate((b) => {
  const r = b.getBoundingClientRect()
  const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
  return el === b || b.contains(el) ? '' : (el?.closest('header') ? 'la barra de arriba' : el?.tagName ?? 'nada')
})
comprobar('celular: «Cerrar calculadora» se puede tocar (nada lo tapa)', encima === '', encima ? `lo tapa ${encima}` : '')
if (encima === '') await cerrarM.click()
else await m.getByRole('banner').getByRole('button', { name: 'Calcular', exact: true }).click()
await calculadora(m).waitFor({ state: 'detached', timeout: 5000 })
await elegirEstacion(m, nActiva)

// Nota con foto desde el celular, en Revisar.
await irAModo(m, 'Revisar')
await abrirNotas(m)
const formM = formularioNota(m)
await formM.scrollIntoViewIfNeeded()
await formM.getByRole('textbox', { name: 'Progresiva', exact: true }).fill('0+020')
await formM.getByRole('button', { name: 'Agua empozada' }).click()
await formM.getByLabel('Tomar foto de la nota').setInputFiles(await imagenPequena(m))
await formM.getByRole('img', { name: 'Foto por guardar' }).waitFor({ timeout: 10000 })
await formM.getByRole('button', { name: 'Guardar nota' }).click()
const g20 = grupoNotas(m, 20)
comprobar('celular: la nota con frase rápida y foto aparece en Revisar bajo 0+020',
  (await llega(g20, 'visible')) && (await texto(g20)).includes('Agua empozada') && (await g20.getByRole('img').count()) === 1)
const notasM = await controlesChicos(m.getByRole('main'))
comprobar('celular: los controles de Revisar y sus notas miden ≥ 44 px',
  notasM.medidos >= 10 && notasM.chicos.length === 0, `${notasM.medidos} medidos · ${notasM.chicos.slice(0, 6).join(' | ')}`)
comprobar('celular: Revisar con notas no se desplaza a lo ancho', (await anchoDePagina(m)) <= 390, `${await anchoDePagina(m)}`)
await g20.scrollIntoViewIfNeeded()
await m.screenshot({ path: `${SALIDA}/herramientas-notas-390.png`, fullPage: true })

// Tema sol en el celular, con la calculadora abierta.
const temaM = m.getByRole('button', { name: 'Modo sol' })
if ((await temaM.getAttribute('aria-pressed')) !== 'true') await temaM.click()
await abrirCalculadora(m)
comprobar('celular: modo sol activo',
  /\bsol\b/.test((await hasta(() => m.evaluate(() => document.documentElement.className), (c) => /\bsol\b/.test(c))) ?? ''))
await m.screenshot({ path: `${SALIDA}/herramientas-sol-390.png` })
await m.close()

await navegador.close()

comprobar('sin errores en la consola del navegador', erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 ? 0 : 1)
