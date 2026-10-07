import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strFromU8, unzipSync } from 'fflate'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

/**
 * Lo que cubrían los seis guiones viejos (recorrido, importar, capas,
 * rasante, visor3d, vista3d), recorrido otra vez por la navegación de la
 * ola 2 sobre la obra simulada, en el celular (390×844) y en la laptop
 * (1280×800). Los seis guiones prueban el detalle con el proyecto de
 * ejemplo en la laptop; este comprueba que esas mismas pantallas se dejan
 * usar en obra, con el celular, y que dicen lo que la obra simulada espera:
 *
 * - Obra › Calles: el panel de Av. Sol (sección, rasante, jornadas, subir
 *   hoja) y los bancos de nivel.
 * - Calle › Medir: la libreta, el cierre en vivo y el aviso al anotar
 *   (lectura esperada, y el signo de la diferencia al escribir una lectura).
 * - Calle › Revisar: las 21 celdas de la subrasante de Av. Sol y las 18 de
 *   Jr. Lima, cada una con su diferencia (medida − proyecto), su acción y
 *   su símbolo; los conteos; la ficha del punto fuera (+54 mm, corta, ✗) y
 *   del al límite (−26 mm, rellena, △); corte, perfil y 3D.
 * - Jr. Lima, que no cerró, dice «no comprobado» en cada sitio donde se
 *   lee un resultado (aviso, ficha, resumen, Medir, Replantear); Av. Sol,
 *   que sí cierra, no lo dice y dice «verificadas».
 * - Calle › Replantear: la lectura objetivo del Eje 0+020 de la base desde
 *   la estación 1 (AI − cota de proyecto) y el veredicto CORTA/RELLENA.
 * - Calle › Análisis › Espesores: el 0+080 Eje entre subrasante y base,
 *   0.152 m, fuera y delgada.
 * - Informes: las tablas para Excel y, en la laptop, lo que dicen los
 *   archivos (diferencias con signo; «no comprobado» en el Excel y en cada
 *   página del PDF de Jr. Lima).
 *
 * En cada pantalla: que nada se desplaza ni se corta a lo ancho (ni la
 * página ni <main>, que es quien se desplaza en esta app) y, en el celular,
 * que todo lo que se toca (botones, enlaces, campos, deslizadores, casillas
 * y puntos tocables del dibujo) mide 44 px de alto y de ancho o más.
 *
 * Uso: node verificacion/guiones-viejos.mjs <carpeta-de-salida>
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
const NOMBRE_PUNTO = { 'p-borde-i': 'Borde izquierdo', 'p-eje': 'Eje', 'p-borde-d': 'Borde derecho' }
const COLUMNA_XLSX = { 'p-borde-i': 'BI', 'p-eje': 'EJE', 'p-borde-d': 'BD' }
/** El tiempo que se le da a la app para dibujar lo que se pidió (vite dev compila al vuelo). */
const ESPERA = 15000

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

/** 0+080, como lo escribe la app. */
function prog(p) {
  const km = Math.floor(p / 1000)
  return `${km}+${String(Math.round(p - km * 1000)).padStart(3, '0')}`
}
/** +54 mm, −26 mm: el menos tipográfico, como lo escribe la app. */
function mm(d) {
  return `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)} mm`
}
const escapar = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const enUnaLinea = (texto) => (texto ?? '').replace(/\s+/g, ' ').trim()
const redondear3 = (x) => Math.round(x * 1000) / 1000
/** «no comprobad», sin distinguir mayúsculas: no comprobado, no comprobada, NO COMPROBADAS… */
const NO_COMPROBADO = new RegExp(escapar(ESPERADO.textos.noComprobado), 'i')
/** El renglón de un texto donde dice «no comprobad…», para el detalle. */
const renglonNoComprobado = (texto) =>
  ((texto ?? '').split('\n').find((r) => NO_COMPROBADO.test(r)) ?? '(no lo dice)').trim().slice(0, 120)

/** La celda «80/p-eje» de ESPERADO, como la nombra la app. */
function celda(clave) {
  const [p, punto] = clave.split('/')
  return { progresiva: Number(p), prog: prog(Number(p)), puntoId: punto, punto: NOMBRE_PUNTO[punto] }
}
/** Lo que la app dice de una celda del mapa: acción y estado, según la diferencia y ESPERADO. */
function celdaEsperada(jornada, clave, mmDif) {
  const accion = mmDif > 0 ? 'cortar' : mmDif < 0 ? 'rellenar' : 'clavado en la cota del proyecto'
  const [estado, simbolo] =
    jornada.fuera?.celda === clave
      ? ['fuera de tolerancia', S.fuera]
      : jornada.alLimite?.celda === clave
        ? ['al límite de tolerancia', S.alLimite]
        : ['conforme', S.conforme]
  const c = celda(clave)
  return { etiqueta: `${c.prog} ${c.punto}: ${mm(mmDif)}, ${accion}, ${estado}`, simbolo }
}

const navegador = await chromium.launch()
const erroresConsola = []

async function abrirObra(ancho, alto) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: alto }, acceptDownloads: true })
  const pagina = await contexto.newPage()
  pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(`${ancho}px: ${m.text()}`) })
  pagina.on('pageerror', (e) => erroresConsola.push(`${ancho}px pageerror: ${e.message}`))
  // Con el servidor de desarrollo, 'networkidle' no llega nunca: se espera a 'load'.
  await pagina.goto(BASE, { waitUntil: 'load', timeout: 120000 })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).waitFor({ state: 'attached', timeout: 30000 })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).setInputFiles(TOPO)
  await pagina.getByText(ESPERADO.nombresDeCalles[0], { exact: true }).first().waitFor({ timeout: ESPERA })
  return { contexto, pagina }
}

/**
 * Lo que sobra a lo ancho. En esta app la página no crece: el contenido va
 * dentro de <main class="overflow-auto">, y si algo se sale de ancho es
 * <main> el que se desplaza por dentro. Por eso se mide el documento, <main>
 * y cualquier caja a la vista que esconda o desplace contenido a lo ancho
 * (lo que queda cortado y no se ve, como una fila que no cabe en su panel).
 * Los textos cortados a propósito con «…» y las tablas de datos que se
 * deslizan dentro de su caja no cuentan.
 */
async function anchoDeMas(pagina) {
  return pagina.evaluate(() => {
    const documento = document.documentElement.scrollWidth - window.innerWidth
    const main = document.querySelector('main')
    const enMain = main ? main.scrollWidth - main.clientWidth : 0
    const cortados = []
    for (const el of document.querySelectorAll('body *')) {
      if (el === main || el.closest('svg') || ['INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(el.tagName)) continue
      if (el.scrollWidth - el.clientWidth <= 1 || el.clientWidth === 0) continue
      const estilo = getComputedStyle(el)
      if (estilo.overflowX === 'visible' || estilo.textOverflow === 'ellipsis') continue
      const caja = el.getBoundingClientRect()
      // Lo sr-only mide 1 px y esconde a propósito: no es contenido cortado.
      if (caja.width < 2 || caja.height < 2 || estilo.visibility === 'hidden') continue
      // Una tabla de datos (el mapa de la calle, las tablas de diferencias)
      // crece con las progresivas y se desliza por dentro a propósito; una
      // fila de campos o un texto, no: tiene que caber o partirse.
      if (['auto', 'scroll'].includes(estilo.overflowX) && el.querySelector('table')) continue
      const nombre =
        el.getAttribute('aria-label') ||
        el.querySelector('h1,h2,h3,h4,legend,label')?.textContent ||
        el.textContent ||
        el.tagName
      cortados.push(`${nombre.replace(/\s+/g, ' ').trim().slice(0, 40)} (${el.scrollWidth - el.clientWidth} px ${estilo.overflowX})`)
    }
    return { documento, enMain, cortados }
  })
}

/**
 * Todo lo que se toca y está a la vista por debajo de 44 px de alto o de
 * ancho: botones, enlaces, desplegables, campos, deslizadores, pestañas,
 * casillas (se mide su etiqueta, que es lo que se toca) y lo que tiene
 * role=button, como los puntos del corte. En toda la página, no solo en
 * <main>: la sub-barra de la calle («Calle activa») va fuera.
 */
async function controlesChicos(pagina) {
  return pagina.evaluate(() => {
    const chicos = []
    const vistos = new Set()
    const selector = [
      'button', 'a[href]', 'select', 'textarea', 'summary',
      'input:not([type="hidden"]):not([type="file"])',
      '[role="button"]', '[role="link"]', '[role="tab"]', '[role="slider"]', '[role="checkbox"]',
      '[role="radio"]', '[role="switch"]', '[role="menuitem"]', '[role="option"]',
    ].join(', ')
    for (const el of document.querySelectorAll(selector)) {
      const casilla = el.matches('input[type="checkbox"], input[type="radio"]')
      // De una casilla se toca su etiqueta entera.
      const tocable = casilla ? (el.closest('label') ?? el) : el
      if (vistos.has(tocable)) continue
      vistos.add(tocable)
      const estilo = getComputedStyle(tocable)
      if (estilo.visibility === 'hidden' || estilo.display === 'none') continue
      const caja = tocable.getBoundingClientRect()
      // Lo sr-only (1 px) no se toca; lo que no tiene caja no está a la vista.
      if (caja.width < 2 || caja.height < 2) continue
      if (caja.height < 43.5 || caja.width < 43.5) {
        const nombre =
          el.getAttribute('aria-label') ||
          (casilla ? tocable.textContent : el.textContent)?.trim() ||
          el.getAttribute('placeholder') ||
          el.tagName
        chicos.push(`${nombre.replace(/\s+/g, ' ').slice(0, 40)} (${Math.round(caja.width)}×${Math.round(caja.height)} px)`)
      }
    }
    return chicos
  })
}

/**
 * Captura de la pantalla entera. fullPage no basta: la página no crece y lo
 * que no cabe queda dentro de <main>, que se desplaza. Mientras se captura,
 * <main> y sus contenedores se dejan crecer; después vuelven como estaban.
 */
async function capturar(pagina, archivo) {
  await pagina.evaluate(() => {
    const main = document.querySelector('main')
    window.__estilosCaptura = []
    for (let el = main; el && el !== document.documentElement; el = el.parentElement) {
      window.__estilosCaptura.push([el, el.getAttribute('style')])
      el.style.height = 'auto'
      el.style.maxHeight = 'none'
      el.style.minHeight = '0'
      el.style.overflow = 'visible'
    }
  })
  try {
    await pagina.screenshot({ path: join(SALIDA, archivo), fullPage: true })
  } finally {
    await pagina.evaluate(() => {
      for (const [el, estilo] of window.__estilosCaptura ?? []) {
        if (estilo === null) el.removeAttribute('style')
        else el.setAttribute('style', estilo)
      }
      delete window.__estilosCaptura
    })
  }
}

/** Las comprobaciones de cada pantalla, y su captura. Se llama ya con la pantalla dibujada. */
async function revisarPantalla(pagina, etiqueta, pantalla, celular) {
  const { documento, enMain, cortados } = await anchoDeMas(pagina)
  comprobar(`${etiqueta}: ${pantalla} no se desplaza a lo ancho (ni la página ni main)`, documento <= 0 && enMain <= 0,
    `página ${documento} px de más · main ${enMain} px de más`)
  comprobar(`${etiqueta}: en ${pantalla} nada queda cortado ni se desplaza a lo ancho por dentro`, cortados.length === 0,
    `${cortados.length}: ${cortados.slice(0, 6).join(' · ')}${cortados.length > 6 ? ' …' : ''}`)
  if (celular) {
    const chicos = await controlesChicos(pagina)
    comprobar(`${etiqueta}: en ${pantalla} todo lo que se toca mide 44 px o más`, chicos.length === 0,
      `${chicos.length} por debajo: ${chicos.slice(0, 8).join(' · ')}${chicos.length > 8 ? ' …' : ''}`)
  }
  const archivo = `${etiqueta}-${pantalla.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, '-').replace(/^-|-$/g, '')}.png`
  await capturar(pagina, archivo)
}

/** Lee el texto de un localizador esperando a que esté; '' si no aparece. */
async function textoDe(localizador) {
  try {
    await localizador.waitFor({ state: 'visible', timeout: ESPERA })
    return await localizador.innerText()
  } catch {
    return ''
  }
}
/** Si el localizador llega a verse (esperando, no al instante). */
async function seVe(localizador) {
  try {
    await localizador.waitFor({ state: 'visible', timeout: ESPERA })
    return true
  } catch {
    return false
  }
}

// --- Archivos descargados ----------------------------------------------------

async function descargar(pagina, boton, nombreGuardado) {
  const [descarga] = await Promise.all([pagina.waitForEvent('download', { timeout: ESPERA }), boton.click()])
  const ruta = join(SALIDA, nombreGuardado ?? descarga.suggestedFilename())
  await descarga.saveAs(ruta)
  return { nombre: descarga.suggestedFilename(), bytes: new Uint8Array(readFileSync(ruta)) }
}

/** Las filas de la primera hoja de un .xlsx: {A: {tipo, v}, B: …}. */
function filasDelXlsx(bytes) {
  const partes = unzipSync(bytes)
  const xml = Object.entries(partes).filter(([n]) => n.endsWith('.xml')).map(([, b]) => strFromU8(b)).join('')
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
  return { xml, filas }
}

/** Las diferencias del .xlsx de diferencias, contra las de ESPERADO: número, con su signo, en su celda. */
function comprobarDiferenciasDelXlsx(etiqueta, filas, jornada) {
  const iCab = filas.findIndex((f) => f.A?.v === 'Progresiva')
  comprobar(`${etiqueta}: el .xlsx de diferencias tiene la cabecera «Progresiva»`, iCab >= 0)
  if (iCab < 0) return
  const columnaDe = Object.fromEntries(Object.entries(filas[iCab]).map(([col, c]) => [c.v, col]))
  const valorDe = (clave) => {
    const c = celda(clave)
    return filas.slice(iCab + 1).find((f) => f.A?.v === c.prog)?.[columnaDe[COLUMNA_XLSX[c.puntoId]]]
  }
  const malas = Object.entries(jornada.diferenciasMm)
    .filter(([clave, d]) => { const v = valorDe(clave); return !v || v.tipo !== 'numero' || Number(v.v) !== d })
    .map(([clave, d]) => `${clave}: esperaba ${mm(d)}, hay ${JSON.stringify(valorDe(clave))}`)
  comprobar(`${etiqueta}: las ${Object.keys(jornada.diferenciasMm).length} diferencias del .xlsx son números con su signo (positivo = corta)`,
    malas.length === 0, malas.slice(0, 3).join(' | '))
  const f = jornada.fuera
  const v = valorDe(f.celda)
  comprobar(`${etiqueta}: en el .xlsx, ${prog(f.progresiva)} ${f.punto} vale ${mm(f.diferenciaMm)} (${f.accion})`,
    v?.tipo === 'numero' && Number(v.v) === f.diferenciaMm, JSON.stringify(v))
}

/** El texto de cada página de un PDF, como lo lee pdfjs. */
async function paginasDelPdf(bytes) {
  const tarea = getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false, verbosity: 0 })
  const doc = await tarea.promise
  const paginas = []
  for (let n = 1; n <= doc.numPages; n++) {
    const contenido = await (await doc.getPage(n)).getTextContent()
    paginas.push(enUnaLinea(contenido.items.map((i) => ('str' in i ? i.str : '')).join(' ')))
  }
  await tarea.destroy()
  return paginas
}

// -----------------------------------------------------------------------------

async function recorrer(ancho, alto) {
  const celular = ancho < 640
  const etiqueta = celular ? 'celular' : 'laptop'
  const { contexto, pagina } = await abrirObra(ancho, alto)
  const espacios = pagina.getByRole('navigation', { name: 'Espacios' })
  const irA = (espacio) => espacios.getByRole('button', { name: espacio, exact: true }).click()
  async function abrirApartado(nombre) {
    const boton = pagina.getByRole('button', { name: nombre, exact: true })
    if ((await boton.getAttribute('aria-expanded')) !== 'true') await boton.click()
  }
  async function irAModo(modo) {
    await irA('Calle')
    await pagina.getByRole('navigation', { name: 'Modos de la calle' }).getByRole('button', { name: modo, exact: true }).click()
    await pagina.getByRole('heading', { name: modo, exact: true, level: 2 }).waitFor({ timeout: ESPERA })
  }
  /** La columna de la ficha del modo (Medir, Revisar, Replantear): lo que va bajo su título. */
  const fichaDelModo = (modo) => pagina.getByRole('heading', { name: modo, exact: true, level: 2 }).locator('xpath=..')
  const capaActiva = () => pagina.getByLabel('Capa activa')
  /**
   * Cambia la calle activa y espera a que la pantalla sea de ella: el
   * desplegable de capas trae las jornadas de esa calle (con su fecha).
   */
  async function elegirCalle(calle) {
    await pagina.getByLabel('Calle activa').selectOption({ label: calle.nombre })
    await capaActiva().locator('option', { hasText: calle.subrasante.fecha }).waitFor({ state: 'attached', timeout: ESPERA })
  }
  /** Elige la jornada de una capa por su fecha. Si no está, lo dice: lo que viene después sería de otra capa. */
  async function elegirCapa(capa, fecha) {
    const selector = capaActiva()
    const opciones = await selector.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })))
    const opcion = opciones.find((o) => o.t.includes(capa) && o.t.includes(fecha))
    comprobar(`${etiqueta}: se puede elegir la capa ${capa} del ${fecha}`, Boolean(opcion), opciones.map((o) => o.t).join(' | '))
    if (!opcion) return false
    await selector.selectOption(opcion.v)
    await pagina.waitForFunction(
      ([texto]) => [...document.querySelectorAll('select')].some((s) => s.selectedOptions[0]?.textContent === texto),
      [opcion.t],
      { timeout: ESPERA },
    )
    return true
  }
  /** Toca algo de la pantalla. Si no está o no se deja tocar, lo dice. */
  async function tocar(nombre, localizador) {
    try {
      await localizador.click({ timeout: ESPERA })
      return true
    } catch (e) {
      comprobar(`${etiqueta}: se puede tocar ${nombre}`, false, e.message.split('\n')[0])
      return false
    }
  }
  /** Abre un apartado plegable (<details>) por su título si está cerrado. */
  async function abrirPlegable(titulo) {
    const resumen = pagina.locator('summary', { hasText: titulo }).first()
    if (!(await resumen.evaluate((s) => s.parentElement.open))) await resumen.click()
  }
  /** Las celdas del mapa a la vista, por su nombre accesible, con lo que muestran. */
  async function celdasDelMapa() {
    const lista = await pagina.locator('main button[aria-label]').evaluateAll((es) =>
      es.map((e) => [e.getAttribute('aria-label'), e.textContent.trim()]),
    )
    return new Map(lista.filter(([n]) => /^\d\+\d{3} [^:]+: /.test(n)))
  }
  async function comprobarMapa(calle, jornada) {
    await pagina.locator('main button[aria-label]', { hasText: S.fuera }).first().waitFor({ timeout: ESPERA }).catch(() => {})
    const mapa = await celdasDelMapa()
    const malas = []
    // Sobre una nivelación sin cerrar cada celda medida lo dice: «…, no comprobado».
    const sufijo = jornada.cierre.comprobado ? '' : ', no comprobado'
    for (const [clave, d] of Object.entries(jornada.diferenciasMm)) {
      const esperada = celdaEsperada(jornada, clave, d)
      const nombre = esperada.etiqueta + sufijo
      const simbolo = esperada.simbolo
      if ((mapa.get(nombre) ?? '').split(' ')[0] !== simbolo) {
        const c = celda(clave)
        const hay = [...mapa].find(([n]) => n.startsWith(`${c.prog} ${c.punto}: `))
        malas.push(`esperaba «${simbolo} ${nombre}», hay «${hay ? `${hay[1]} ${hay[0]}` : 'nada'}»`)
      }
    }
    comprobar(`${etiqueta}: el mapa de Revisar de ${calle.nombre} da las ${Object.keys(jornada.diferenciasMm).length} diferencias con su signo, acción y símbolo`,
      malas.length === 0, malas.slice(0, 3).join(' | '))
    const resumen = enUnaLinea(await textoDe(pagina.getByRole('region', { name: 'Resumen de la calle' })))
    const k = jornada.conteo
    const conteos = [
      `${S.conforme} ${k.conformes} conformes`, `${S.alLimite} ${k.alLimite} al límite`,
      `${S.fuera} ${k.fuera} fuera de tolerancia`, `${S.sinMedir} ${k.sinMedir} sin medir`,
    ]
    comprobar(`${etiqueta}: el resumen de ${calle.nombre} cuenta ${k.conformes} ✓, ${k.alLimite} △, ${k.fuera} ✗ y ${k.sinMedir} sin medir`,
      conteos.every((c) => resumen.includes(c)), resumen.slice(0, 140))
    return resumen
  }
  /** Toca la celda y lee la ficha «Punto elegido», esperando a que sea la de esa celda. */
  async function fichaDe(p) {
    const nombre = `${prog(p.progresiva)} ${p.punto}`
    const ok = await tocar(`la celda ${nombre}`, pagina.getByRole('button', { name: new RegExp(`^${escapar(nombre)}: `) }))
    if (!ok) return ''
    const ficha = pagina.getByRole('region', { name: 'Punto elegido' })
    await ficha.getByText(`${prog(p.progresiva)} · ${p.punto}`, { exact: true }).waitFor({ timeout: ESPERA }).catch(() => {})
    return enUnaLinea(await ficha.innerText())
  }
  function comprobarFicha(calle, p, simbolo, estado, ficha) {
    const accion = p.diferenciaMm > 0 ? 'corta' : 'rellena'
    comprobar(`${etiqueta}: la ficha de ${prog(p.progresiva)} ${p.punto} de ${calle.nombre} dice ${simbolo} ${estado}, ${accion} ${Math.abs(p.diferenciaMm)} mm, diferencia ${mm(p.diferenciaMm)}`,
      ficha.includes(simbolo) && ficha.includes(`${estado} · ${accion} ${Math.abs(p.diferenciaMm)} mm`) &&
        ficha.includes(`Diferencia ${mm(p.diferenciaMm)}`) &&
        ficha.includes(`Cota medida ${p.cotaMedida.toFixed(3)}`) &&
        ficha.includes(`Cota de proyecto ${p.cotaProyecto.toFixed(3)}`),
      ficha.slice(0, 160))
  }

  // --- Obra › Calles: el panel de la calle y los bancos de nivel -----------
  await irA('Obra')
  await pagina.getByRole('navigation', { name: 'Pantallas de la obra' }).getByRole('button', { name: 'Calles', exact: true }).click()
  // Bancos de nivel: en el celular están en la columna del inicio, que el
  // panel de la calle tapa; se miran antes de abrirlo.
  await abrirApartado('Bancos de nivel')
  const campoBm = pagina.getByLabel('Cota de BM-1')
  const cotaBm = (await seVe(campoBm)) ? await campoBm.inputValue() : ''
  comprobar(`${etiqueta}: los bancos de nivel están en Obra › Calles con su cota`,
    cotaBm === ESPERADO.bms[0].cota.toFixed(3), `BM-1 ${cotaBm}`)
  await revisarPantalla(pagina, etiqueta, 'Obra calles', celular)

  await pagina.getByRole('button', { name: `Abrir ${SOL.nombre}`, exact: true }).click()
  const panel = pagina.getByRole('region', { name: `Panel de ${SOL.nombre}` })
  await panel.waitFor({ timeout: ESPERA })
  const apartados = await Promise.all(
    ['Sección', 'Rasante', 'Jornadas y hojas', 'Subir una hoja de campo'].map(async (n) => (await panel.getByRole('button', { name: n, exact: true }).count()) === 1),
  )
  comprobar(`${etiqueta}: el panel de la calle tiene sección, rasante, jornadas y subir hoja`, apartados.every(Boolean),
    apartados.map(String).join(' '))
  await abrirApartado('Rasante')
  const campoArranque = panel.getByLabel('Cota de arranque')
  const cotaArranque = (await seVe(campoArranque)) ? await campoArranque.inputValue() : ''
  comprobar(`${etiqueta}: la rasante de ${SOL.nombre} se lee en su panel`,
    cotaArranque === SOL.rasante.cotaArranque.toFixed(3), `cota de arranque ${cotaArranque}`)
  await revisarPantalla(pagina, etiqueta, 'Panel de la calle', celular)

  // --- Calle › Medir: Av. Sol, subrasante ----------------------------------
  await irAModo('Medir')
  await elegirCalle(SOL)
  await elegirCapa('SUBRASANTE', SOL.subrasante.fecha)
  await abrirPlegable('Cierre del circuito')
  const cierre = enUnaLinea(await textoDe(pagina.getByRole('region', { name: 'Cierre en vivo' })))
  comprobar(`${etiqueta}: la libreta de la subrasante de ${SOL.nombre} dice que cierra, con su ✓`,
    cierre.startsWith(`${S.conforme} Cierra`), cierre.slice(0, 100))
  // Con la grilla llena no hay campo: en su lugar, «Grilla completa» y la progresiva nueva a la mano.
  comprobar(`${etiqueta}: el campo de lectura de mira (o, con la grilla llena, «Grilla completa» y Añadir progresiva) está a la mano`,
    (await seVe(pagina.getByLabel('Lectura de mira'))) ||
      ((await seVe(pagina.getByText('Grilla completa', { exact: true }))) && (await seVe(pagina.getByLabel('Añadir progresiva')))))
  await revisarPantalla(pagina, etiqueta, 'Medir', celular)

  // --- Calle › Revisar: Av. Sol, que cierra --------------------------------
  await irAModo('Revisar')
  const resumenSol = await comprobarMapa(SOL, SOL.subrasante)
  const fichaRevisarSol = await textoDe(fichaDelModo('Revisar'))
  comprobar(`${etiqueta}: en Revisar, ${SOL.nombre} (cierra) dice «Cotas compensadas» y «DIFERENCIAS VERIFICADAS», y no «no comprobado»`,
    /Cotas compensadas/i.test(fichaRevisarSol) && /DIFERENCIAS VERIFICADAS/.test(fichaRevisarSol) &&
      !NO_COMPROBADO.test(fichaRevisarSol) && !NO_COMPROBADO.test(resumenSol),
    NO_COMPROBADO.test(fichaRevisarSol) ? renglonNoComprobado(fichaRevisarSol) : enUnaLinea(fichaRevisarSol).slice(0, 120))

  const limite = SOL.subrasante.alLimite
  comprobarFicha(SOL, limite, S.alLimite, 'al límite de tolerancia', await fichaDe(limite))
  const fuera = SOL.subrasante.fuera
  const fichaFuera = await fichaDe(fuera)
  comprobarFicha(SOL, fuera, S.fuera, 'fuera de tolerancia', fichaFuera)
  comprobar(`${etiqueta}: la ficha de un punto de ${SOL.nombre} no dice «no comprobado»`,
    fichaFuera !== '' && !NO_COMPROBADO.test(fichaFuera), renglonNoComprobado(fichaFuera))
  // Tocar la celda lleva el corte a su progresiva.
  const corte = pagina.getByRole('img', { name: `Corte transversal en ${prog(fuera.progresiva)}`, exact: true })
  comprobar(`${etiqueta}: tocar la celda lleva el corte a su progresiva`, await seVe(corte),
    await pagina.getByRole('img', { name: /^Corte transversal/ }).first().getAttribute('aria-label').catch(() => '(sin corte)'))
  await revisarPantalla(pagina, etiqueta, 'Revisar corte', celular)

  const vista = pagina.getByRole('group', { name: 'Vista de la calle' })
  await vista.getByRole('button', { name: 'Perfil', exact: true }).click()
  comprobar(`${etiqueta}: el perfil longitudinal se dibuja`, await seVe(pagina.getByRole('img', { name: /^Perfil longitudinal de/ })))
  await revisarPantalla(pagina, etiqueta, 'Revisar perfil', celular)

  await vista.getByRole('button', { name: '3D', exact: true }).click()
  const modelo = pagina.getByRole('img', { name: /Modelo en volumen de la calle/ })
  await modelo.locator('polygon[data-cara]').first().waitFor({ state: 'attached', timeout: ESPERA }).catch(() => {})
  const caras = await modelo.locator('polygon[data-cara]').count()
  comprobar(`${etiqueta}: el modelo 3D se dibuja`, caras > 0, `${caras} caras`)
  await revisarPantalla(pagina, etiqueta, 'Revisar 3D', celular)
  await vista.getByRole('button', { name: 'Corte', exact: true }).click()

  // --- Calle › Revisar: Jr. Lima, que no cerró -----------------------------
  await elegirCalle(LIMA)
  comprobar(`${etiqueta}: al cambiar a ${LIMA.nombre}, la capa activa es su subrasante del ${LIMA.subrasante.fecha}`,
    ((await capaActiva().locator('option:checked').textContent()) ?? '').includes(LIMA.subrasante.fecha))
  const resumenLima = await comprobarMapa(LIMA, LIMA.subrasante)
  const fichaRevisarLima = await textoDe(fichaDelModo('Revisar'))
  comprobar(`${etiqueta}: en Revisar, ${LIMA.nombre} (sin cerrar) dice «Cotas sin compensar» y «diferencias no comprobadas», no «verificadas»`,
    /Cotas sin compensar/i.test(fichaRevisarLima) && /diferencias no comprobadas/i.test(fichaRevisarLima) &&
      !/VERIFICADAS/i.test(fichaRevisarLima),
    renglonNoComprobado(fichaRevisarLima))
  comprobar(`${etiqueta}: el aviso del mapa de ${LIMA.nombre} dice que no está comprobado`,
    await seVe(pagina.locator('main').getByText(/^△ Mapa no comprobado/)))
  comprobar(`${etiqueta}: el resumen de ${LIMA.nombre} dice que los conteos no están comprobados`,
    NO_COMPROBADO.test(resumenLima) && /sin comprobar/.test(resumenLima), resumenLima.slice(0, 160))
  const fueraLima = LIMA.subrasante.fuera
  const fichaLima = await fichaDe(fueraLima)
  comprobarFicha(LIMA, fueraLima, S.fuera, 'fuera de tolerancia', fichaLima)
  comprobar(`${etiqueta}: la ficha de ${prog(fueraLima.progresiva)} ${fueraLima.punto} de ${LIMA.nombre} va bajo «Cotas sin compensar» y la ficha lo dice no comprobado una vez, arriba`,
    /Cotas sin compensar/i.test(fichaLima) && NO_COMPROBADO.test(fichaRevisarLima), renglonNoComprobado(fichaRevisarLima))
  await revisarPantalla(pagina, etiqueta, 'Revisar sin cerrar', celular)

  // --- Calle › Medir y Replantear con Jr. Lima -----------------------------
  await irAModo('Medir')
  await abrirPlegable('Cierre del circuito')
  const cierreLima = enUnaLinea(await textoDe(pagina.getByRole('region', { name: 'Cierre en vivo' })))
  comprobar(`${etiqueta}: en Medir, el cierre de ${LIMA.nombre} dice «Sin cerrar» y que nada está comprobado`,
    /^△ Sin cerrar/.test(cierreLima) && /nada comprobado/i.test(cierreLima), cierreLima.slice(0, 100))
  if (await tocar(`la celda ${prog(fueraLima.progresiva)} ${fueraLima.punto} en Medir`,
    pagina.getByRole('button', { name: new RegExp(`^${escapar(`${prog(fueraLima.progresiva)} ${fueraLima.punto}`)}: `) }))) {
    const aviso = await textoDe(pagina.getByRole('region', { name: 'Aviso al anotar' }))
    comprobar(`${etiqueta}: en Medir, el aviso al anotar de ${LIMA.nombre} dice que la cota no está comprobada`,
      NO_COMPROBADO.test(aviso), renglonNoComprobado(aviso))
  }
  await irAModo('Replantear')
  const fichaReplantearLima = await textoDe(fichaDelModo('Replantear'))
  comprobar(`${etiqueta}: en Replantear, ${LIMA.nombre} dice que las cotas no están comprobadas`,
    NO_COMPROBADO.test(fichaReplantearLima), renglonNoComprobado(fichaReplantearLima))

  // --- Medir y Replantear con Av. Sol: la lectura objetivo -----------------
  // La base de Av. Sol, estación 1 de la libreta, Eje 0+020.
  const objetivo = SOL.base.lecturaObjetivo
  const nombreObjetivo = `${prog(objetivo.progresiva)} ${objetivo.punto}`
  await irAModo('Medir')
  await elegirCalle(SOL)
  await elegirCapa('BASE', SOL.base.fecha)
  await tocar(`la estación ${objetivo.estacion} de la libreta`,
    pagina.getByRole('group', { name: 'Estaciones' }).getByRole('button', { name: `Estación ${objetivo.estacion}`, exact: true }))
  await tocar(`la celda ${nombreObjetivo} en Medir`, pagina.getByRole('button', { name: new RegExp(`^${escapar(nombreObjetivo)}: `) }))

  await irAModo('Replantear')
  await tocar(`la celda ${nombreObjetivo} en Replantear`, pagina.getByRole('button', { name: new RegExp(`^${escapar(nombreObjetivo)}: `) }))
  const estaca = pagina.getByRole('region', { name: 'Estaca actual' })
  // La estaca se titula «0+020 · Eje».
  const tituloObjetivo = `${prog(objetivo.progresiva)} · ${objetivo.punto}`
  await estaca.getByRole('heading', { name: new RegExp(`${escapar(tituloObjetivo)}$`) }).waitFor({ timeout: ESPERA }).catch(() => {})
  const textoEstaca = enUnaLinea(await textoDe(estaca))
  const textoAltura = enUnaLinea(await textoDe(pagina.getByRole('group', { name: 'Altura del instrumento' })))
  const ai = /AI (\d+\.\d{3})(?: compensada \(([+−])(\d+(?:\.\d)?) mm sobre la CI de la libreta\))? · estación (\d+) de la libreta/.exec(textoAltura)
  const aiPantalla = ai ? Number(ai[1]) : Number.NaN
  const correccionMm = ai?.[3] ? (ai[2] === '−' ? -1 : 1) * Number(ai[3]) : 0
  const objetivoPantalla = Number(/La mira debe marcar (\d+\.\d{3})/.exec(textoEstaca)?.[1] ?? Number.NaN)
  const proyectoPantalla = Number(/para estar en (\d+\.\d{3})/.exec(textoEstaca)?.[1] ?? Number.NaN)
  comprobar(`${etiqueta}: Replantear parte de la estación ${objetivo.estacion} de la libreta de la base de ${SOL.nombre}, en ${nombreObjetivo}`,
    ai !== null && Number(ai[4]) === objetivo.estacion && textoEstaca.includes(tituloObjetivo), `${textoAltura.slice(0, 100)} | ${textoEstaca.slice(0, 50)}`)
  // El circuito de la base cierra con +4 mm: la app compensa la AI antes de
  // restar, para que el objetivo cuadre con lo que Revisar juzga después
  // (vistas/calle/comun.ts, alturaInstrumentalDeEstacion). La corrección va
  // contra el error y no pasa de él. La CI cruda sale de la libreta de
  // ESPERADO (alturasInstrumentales), no de lecturaObjetivo.
  const errorBase = SOL.base.cierre.errorMm
  const ciLibreta = SOL.base.alturasInstrumentales[objetivo.estacion - 1]
  const aiCompensada = redondear3(ciLibreta + correccionMm / 1000)
  comprobar(`${etiqueta}: la AI de Replantear es la CI de la libreta (${ciLibreta.toFixed(3)}) compensada contra el error de cierre (${mm(errorBase)})`,
    Math.abs(aiPantalla - aiCompensada) < 0.0006 && correccionMm !== 0 &&
      Math.sign(correccionMm) === -Math.sign(errorBase) && Math.abs(correccionMm) <= Math.abs(errorBase),
    `AI ${aiPantalla.toFixed(3)}, corrección ${correccionMm} mm`)
  comprobar(`${etiqueta}: la cota de proyecto de ${nombreObjetivo} en la base es ${objetivo.cotaProyecto.toFixed(3)}`,
    proyectoPantalla === objetivo.cotaProyecto, textoEstaca.slice(0, 120))
  // lectura objetivo = AI compensada − cota de proyecto. Con el signo al
  // revés saldría cota − AI (negativa); con la AI de otra estación, otro
  // número. ESPERADO.lecturaObjetivo hace la cuenta con la CI sin compensar
  // (2.437): la app tiene que quedar a la corrección (1 mm) de ese número.
  const objetivoEsperado = redondear3(aiCompensada - objetivo.cotaProyecto)
  comprobar(`${etiqueta}: la lectura objetivo de ${nombreObjetivo} es AI − cota de proyecto = ${objetivoEsperado.toFixed(3)} (ESPERADO, sin compensar: ${objetivo.lectura.toFixed(3)})`,
    objetivoPantalla === objetivoEsperado && objetivoPantalla === redondear3(aiPantalla - proyectoPantalla) &&
      Math.abs(objetivoPantalla - objetivo.lectura) <= Math.abs(correccionMm) / 1000 + 0.0001,
    `en pantalla ${objetivoPantalla.toFixed(3)} = ${aiPantalla.toFixed(3)} − ${proyectoPantalla.toFixed(3)}`)
  comprobar(`${etiqueta}: la hoja de ${prog(objetivo.progresiva)} da el mismo objetivo para el ${objetivo.punto}`,
    await seVe(pagina.getByRole('button', { name: `Estaca ${objetivo.punto}, objetivo ${objetivoPantalla.toFixed(3)}`, exact: true })))
  const fichaReplantearSol = await textoDe(fichaDelModo('Replantear'))
  comprobar(`${etiqueta}: en Replantear, la base de ${SOL.nombre} (cierra) no dice «no comprobado»`,
    fichaReplantearSol !== '' && !NO_COMPROBADO.test(fichaReplantearSol), renglonNoComprobado(fichaReplantearSol))
  // El veredicto: leer menos que el objetivo es que el punto está alto (corta).
  const leida = pagina.getByLabel('Lectura leída')
  const veredicto = pagina.getByRole('status', { name: 'Veredicto' })
  for (const [deltaMm, texto] of [[-12, 'CORTA 12 mm'], [25, 'RELLENA 25 mm'], [0, 'EN COTA']]) {
    const lectura = (objetivoPantalla + deltaMm / 1000).toFixed(3)
    await leida.fill(lectura)
    await veredicto.getByText(texto).waitFor({ timeout: ESPERA }).catch(() => {})
    const dice = enUnaLinea(await veredicto.innerText().catch(() => ''))
    comprobar(`${etiqueta}: en Replantear, leer ${lectura} con objetivo ${objetivoPantalla.toFixed(3)} da ${texto}`, dice.includes(texto), dice.slice(0, 80))
  }
  await leida.fill('')
  await revisarPantalla(pagina, etiqueta, 'Replantear', celular)

  // El aviso al anotar de Medir dice la misma lectura esperada, y el signo
  // de lo que se escribe: leer de más es que el punto está bajo (rellena).
  await irAModo('Medir')
  const avisoMedir = pagina.getByRole('region', { name: 'Aviso al anotar' })
  const textoAviso = enUnaLinea(await textoDe(avisoMedir))
  comprobar(`${etiqueta}: en Medir, la lectura esperada de ${nombreObjetivo} desde la estación ${objetivo.estacion} es la misma que el objetivo de Replantear`,
    textoAviso.includes(`Esperada cerca de ${objetivoPantalla.toFixed(3)}`), textoAviso.slice(0, 120))
  const campoMira = pagina.getByLabel('Lectura de mira')
  for (const [deltaMm, signo, accion, simbolo] of [[30, '−30 mm', 'rellena 30 mm', S.fuera], [-4, '+4 mm', 'corta 4 mm', S.conforme]]) {
    const lectura = (objetivoPantalla + deltaMm / 1000).toFixed(3)
    await campoMira.fill(lectura)
    await avisoMedir.getByText(accion).waitFor({ timeout: ESPERA }).catch(() => {})
    const dice = enUnaLinea(await avisoMedir.innerText())
    comprobar(`${etiqueta}: en Medir, escribir ${lectura} (sin anotar) da ${simbolo} ${signo}, ${accion}`,
      dice.includes(`${simbolo} `) && dice.includes(signo) && dice.includes(accion), dice.slice(0, 120))
  }
  await campoMira.fill('')

  // --- Calle › Análisis › Espesores ----------------------------------------
  await pagina.getByRole('navigation', { name: 'Pantallas de la calle' }).getByRole('button', { name: 'Análisis', exact: true }).click()
  await pagina.getByRole('tab', { name: 'Espesores' }).click()
  const abajo = pagina.getByLabel('Capa de abajo en la comparación')
  const arriba = pagina.getByLabel('Capa de arriba en la comparación')
  await abajo.waitFor({ timeout: ESPERA })
  const opciones = await abajo.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })))
  const sub = opciones.find((o) => /SUBRASANTE/.test(o.t))
  const base = opciones.find((o) => /BASE/.test(o.t))
  comprobar(`${etiqueta}: en Espesores se puede comparar BASE sobre SUBRASANTE`, Boolean(sub && base), opciones.map((o) => o.t).join(' | '))
  if (sub && base) {
    await abajo.selectOption(sub.v)
    await arriba.selectOption(base.v)
  }
  const delgada = SOL.espesores.fuera[0]
  const cDelgada = celda(delgada.celda)
  const botonDelgada = pagina.getByRole('button', { name: new RegExp(`^Espesor en ${escapar(cDelgada.prog)} ${cDelgada.punto}: `) })
  const celdaDelgada = (await seVe(botonDelgada)) ? await botonDelgada.getAttribute('aria-label') : null
  comprobar(`${etiqueta}: Espesores da ${cDelgada.prog} ${cDelgada.punto} en ${delgada.espesorM.toFixed(3)} m, fuera y delgada`,
    (celdaDelgada ?? '').includes(`${delgada.espesorM.toFixed(3)} m`) && /fuera de tolerancia, delgada$/.test(celdaDelgada ?? ''),
    celdaDelgada)
  await revisarPantalla(pagina, etiqueta, 'Espesores', celular)

  // --- Informes: las tablas para Excel -------------------------------------
  await irA('Informes')
  await pagina.getByRole('region', { name: 'Tablas para Excel' }).waitFor({ timeout: ESPERA })
  // Plegadas al final bajo «Datos sueltos»: se abren para usarlas.
  await pagina.locator('summary', { hasText: 'Datos sueltos' }).click()
  const exportar = await Promise.all(
    ['cotas', 'diferencias', 'espesores'].map((n) => pagina.getByRole('button', { name: `Exportar ${n} a Excel`, exact: true }).count()),
  )
  comprobar(`${etiqueta}: Informes ofrece las tablas para Excel de cotas, diferencias y espesores`,
    exportar.every((c) => c === 1), exportar.join(' '))
  await revisarPantalla(pagina, etiqueta, 'Informes', celular)

  // Lo que dicen los archivos: se descargan una vez, en la laptop.
  if (!celular) await revisarArchivos(pagina, etiqueta)

  await contexto.close()
}

/**
 * Informes, en los archivos: el Excel de diferencias de Av. Sol (cierra) y
 * de Jr. Lima (no cerró), y el PDF del control contra proyecto de cada una.
 * Lo que Max entrega a la supervisión tiene que llevar el signo de la
 * convención y decir «no comprobado» cuando la nivelación no cerró.
 */
async function revisarArchivos(pagina, etiqueta) {
  const calle = pagina.getByRole('combobox', { name: 'Calle', exact: true })
  async function elegirJornada(trozo) {
    const lista = pagina.getByRole('combobox', { name: 'Jornada', exact: true })
    const opciones = await lista.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent ?? '' })))
    const opcion = opciones.find((o) => o.t.includes(trozo))
    comprobar(`${etiqueta}: en Informes se puede elegir la jornada ${trozo}`, Boolean(opcion), opciones.map((o) => o.t).join(' | '))
    if (opcion) await lista.selectOption(opcion.v)
    return Boolean(opcion)
  }
  /** Espera a que la vista previa sea la del PDF de esta calle (no la de la anterior). */
  async function esperarVistaPrevia(titulo, nombreCalle) {
    await pagina.waitForFunction(
      ([titulo, nombreCalle]) =>
        [...document.querySelectorAll('img[data-archivo]')].some(
          (img) => img.getAttribute('alt') === `Primera página: ${titulo}` && (img.getAttribute('data-archivo') ?? '').startsWith(`${titulo} — ${nombreCalle} — `),
        ),
      [titulo, nombreCalle],
      { timeout: 30000 },
    )
  }
  const titulo = 'Control contra proyecto'
  await pagina.getByRole('group', { name: 'Tipo de informe' }).getByRole('button', { name: titulo, exact: true }).click()
  // La calle y la jornada van plegadas bajo los chips de lo ya elegido.
  const resumenAlcance = pagina.locator('summary', { hasText: 'Cambiar calle, jornada o tramo' })
  if (!(await resumenAlcance.evaluate((s) => s.parentElement.open))) await resumenAlcance.click()

  for (const [c, cierra] of [[SOL, true], [LIMA, false]]) {
    await calle.selectOption({ label: c.nombre })
    if (!(await elegirJornada('SUBRASANTE'))) continue
    try {
      await esperarVistaPrevia(titulo, c.nombre)
    } catch {
      comprobar(`${etiqueta}: Informes arma el ${titulo} de ${c.nombre}`, false, 'la vista previa no llegó')
      continue
    }
    const tablaDiferencias = pagina.getByRole('button', { name: 'Exportar diferencias a Excel', exact: true })
    const x = await descargar(pagina, tablaDiferencias, `diferencias-${c.id}.xlsx`)
    const { xml, filas } = filasDelXlsx(x.bytes)
    comprobar(`${etiqueta}: el Excel de diferencias de ${c.nombre} ${cierra ? 'no dice' : 'dice'} «no comprobado»`,
      NO_COMPROBADO.test(xml) === !cierra, x.nombre)
    comprobarDiferenciasDelXlsx(`${etiqueta}: ${c.nombre}`, filas, c.subrasante)

    const pdf = await descargar(pagina, pagina.getByRole('button', { name: 'Descargar PDF', exact: true }), `control-${c.id}.pdf`)
    const paginas = await paginasDelPdf(pdf.bytes)
    const conAviso = paginas.filter((p) => /no (están )?comprobad/i.test(p)).length
    comprobar(cierra
      ? `${etiqueta}: el PDF del ${titulo} de ${c.nombre} (cierra) no dice «no comprobado»`
      : `${etiqueta}: cada página del PDF del ${titulo} de ${c.nombre} dice «no comprobado»`,
    cierra ? conAviso === 0 : paginas.length > 0 && conAviso === paginas.length, `${conAviso} de ${paginas.length} páginas lo dicen`)
    const f = c.subrasante.fuera
    const fila = `${prog(f.progresiva)} ${f.punto} ${f.cotaProyecto.toFixed(3)} ${f.cotaMedida.toFixed(3)} ${f.accion} ${Math.abs(f.diferenciaMm)} mm FUERA`
    comprobar(`${etiqueta}: el PDF de ${c.nombre} lista «${fila}»`, paginas.some((p) => p.includes(fila)),
      (paginas.join(' ').match(new RegExp(`${escapar(prog(f.progresiva))} ${f.punto} \\d+\\.\\d{3} \\d+\\.\\d{3} \\S+ \\d+ mm \\S+`)) ?? ['(no está)'])[0])
  }
}

await recorrer(1280, 800)
await recorrer(390, 844)

await navegador.close()

comprobar('la app no produce errores en la consola del navegador',
  erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 ? 0 : 1)
