import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Barrido de celular: abre la obra simulada a 390×844 y a 360×740 y recorre
 * todas las pantallas y estados de la app (cada espacio, cada modo, cada
 * pantalla de la calle, la calculadora, el menú de archivo, una ficha de pista
 * y la guía de campo). En cada estado comprueba lo que en obra importa:
 *
 *   - que la página no se desplaza a lo ancho (ni el documento ni el <main>);
 *   - que todo botón, enlace, pestaña o selector visible mide ≥ 44×44 px;
 *   - que el texto de lo principal no baja de 12 px (y cuenta el de 12–13 px);
 *   - que nada queda tapado por una barra fija: cada control, llevado al centro
 *     de lo que se desplaza, recibe el toque él mismo;
 *   - que el foco se ve al recorrer con el teclado.
 *
 * Al final repite el recorrido a 1280×800 solo para sacar capturas y vigilar
 * el desplazamiento a lo ancho. Deja en la carpeta de salida las capturas y un
 * `movil-informe.json` con cada control que no cumple.
 *
 * Uso: node verificacion/movil.mjs <carpeta-de-salida>
 * La URL sale de BASE (por defecto http://localhost:4173/).
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })

const ESPERADO = JSON.parse(readFileSync(new URL('./datos/obra-simulada.esperado.json', import.meta.url), 'utf8'))
const TOPO = fileURLToPath(new URL(ESPERADO.archivo.rutaDesdeGuion, import.meta.url))
const [AV_SOL, JR_LIMA, LAS_LOMAS] = ESPERADO.nombresDeCalles

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

const informe = []
const erroresConsola = []
const navegador = await chromium.launch()

/** Abre la obra en un contexto nuevo del tamaño pedido. */
async function abrirObra(ancho, alto) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 640, isMobile: ancho < 640 })
  // El perfil digitado de Las Lomas (con sus quiebres) para que Planificar y la guía tengan qué enseñar.
  const { clave, valor } = ESPERADO.lasLomas.planConQuiebres.localStorage
  await contexto.addInitScript(([k, v]) => {
    try { localStorage.setItem(k, v) } catch { /* sin almacenamiento: Planificar sale con la rasante */ }
  }, [clave, valor])
  const pagina = await contexto.newPage()
  pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(`${ancho}px: ${m.text()}`) })
  pagina.on('pageerror', (e) => erroresConsola.push(`${ancho}px pageerror: ${e.message}`))
  await pagina.goto(BASE, { waitUntil: 'load', timeout: 120000 })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).waitFor({ state: 'attached', timeout: 30000 })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).setInputFiles(TOPO)
  await pagina.getByText(AV_SOL, { exact: true }).first().waitFor({ timeout: 10000 })
  return { contexto, pagina }
}

// ---------------------------------------------------------------------------
// La auditoría de un estado, dentro del navegador
// ---------------------------------------------------------------------------

/**
 * Mide el estado que está a la vista. `alcance` es un selector CSS: con la
 * calculadora abierta solo cuenta lo que está en ella y en la barra de arriba
 * (lo de debajo está tapado a propósito).
 */
async function medir(pagina, alcance) {
  return pagina.evaluate((alcance) => {
    const raices = alcance ? [...document.querySelectorAll(alcance)] : [document.body]
    const describir = (el) => {
      const nombre = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 50)
      const etiqueta = el.tagName.toLowerCase() + (el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : '')
      return `${etiqueta} «${nombre}»`
    }
    const visible = (el) => {
      if (!el.isConnected || el.closest('[hidden],[aria-hidden="true"],[inert]')) return false
      // Lo de dentro de un plegable cerrado no se ve ni se toca (aunque Chrome le dé caja).
      const plegable = el.closest('details:not([open])')
      if (plegable && !(el.closest('summary')?.parentElement === plegable)) return false
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return false
      const e = getComputedStyle(el)
      if (e.visibility === 'hidden' || e.display === 'none' || Number(e.opacity) === 0) return false
      // Los textos solo para lector de pantalla (sr-only) no se tocan.
      if (r.width <= 1 && r.height <= 1) return false
      return true
    }

    // 1. Desplazamiento a lo ancho
    const doc = document.documentElement
    const main = document.querySelector('main')
    const anchoPagina = { scroll: doc.scrollWidth, cliente: doc.clientWidth }
    const anchoMain = main ? { scroll: main.scrollWidth, cliente: main.clientWidth } : null
    // Qué se sale: los elementos cuyo borde derecho pasa del ancho de la ventana
    // sin estar dentro de algo que se desplace por su cuenta.
    const salidos = []
    if (anchoPagina.scroll > anchoPagina.cliente || (anchoMain && anchoMain.scroll > anchoMain.cliente)) {
      const limite = doc.clientWidth
      for (const el of document.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect()
        if (r.right <= limite + 0.5 || r.width === 0) continue
        let p = el.parentElement, dentroDeDesplazable = false
        while (p && p !== main && p !== document.body) {
          const ox = getComputedStyle(p).overflowX
          if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') { dentroDeDesplazable = true; break }
          p = p.parentElement
        }
        if (dentroDeDesplazable) continue
        // Solo el más externo de cada rama.
        if (el.parentElement && el.parentElement.getBoundingClientRect().right > limite + 0.5 && el.parentElement !== main) continue
        salidos.push(`${describir(el)} llega a ${Math.round(r.right)} px`)
        if (salidos.length >= 8) break
      }
    }

    // 2. Controles: tamaño y si algo los tapa
    const SELECTOR = 'button, a[href], [role="button"], [role="tab"], select, summary, input[type="checkbox"], input[type="radio"]'
    const controles = new Set()
    for (const raiz of raices) for (const el of raiz.querySelectorAll(SELECTOR)) controles.add(el)
    const chicos = []
    const tapados = []
    const enDibujo = []
    let total = 0
    for (const el of controles) {
      // Una casilla dentro de su etiqueta se toca por la etiqueta entera.
      const objetivo = (el.matches('input') && el.closest('label')) || el
      if (!visible(objetivo)) continue
      if (el.disabled) continue
      total++
      const r = objetivo.getBoundingClientRect()
      const esDibujo = el instanceof SVGElement
      if (r.width < 43.5 || r.height < 43.5) {
        const linea = `${describir(el)} ${Math.round(r.width)}×${Math.round(r.height)}`
        ;(esDibujo ? enDibujo : chicos).push(linea)
      }
      // Lo llevo al centro de lo que se desplaza y miro quién recibe el toque.
      objetivo.scrollIntoView({ block: 'center', inline: 'center' })
      const c = objetivo.getBoundingClientRect()
      const x = Math.min(Math.max(c.left + c.width / 2, 1), window.innerWidth - 1)
      const y = Math.min(Math.max(c.top + c.height / 2, 1), window.innerHeight - 1)
      const encima = document.elementFromPoint(x, y)
      if (encima && !objetivo.contains(encima) && !encima.contains(objetivo) && !(encima.closest('label') && encima.closest('label') === objetivo.closest('label'))) {
        tapados.push(`${describir(el)} tapado por ${describir(encima)}`)
      }
    }
    if (main) main.scrollTop = 0

    // 3. Texto chico en lo principal (y en la calculadora si está abierta)
    const raicesTexto = alcance ? raices.filter((r) => r.matches('[role="dialog"]')) : [main].filter(Boolean)
    const muyChico = new Map()
    const chico = new Map()
    for (const raiz of raicesTexto) {
      const andador = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
      while (andador.nextNode()) {
        const nodo = andador.currentNode
        const texto = nodo.textContent.trim()
        if (!texto || !nodo.parentElement) continue
        const el = nodo.parentElement
        if (el.closest('svg')) continue // rótulos de los dibujos: van aparte
        if (!visible(el)) continue
        const tam = parseFloat(getComputedStyle(el).fontSize)
        const clave = `${Math.round(tam * 10) / 10}px «${texto.slice(0, 40)}»`
        if (tam < 12) muyChico.set(clave, true)
        else if (tam < 14) chico.set(clave, true)
      }
    }

    return {
      anchoPagina, anchoMain, salidos, total,
      chicos, tapados, enDibujo,
      muyChico: [...muyChico.keys()], chico: [...chico.keys()],
    }
  }, alcance ?? null)
}

/** Recorre con Tab desde el principio de lo principal y mira si el foco se ve. */
async function revisarFoco(pagina, alcance, pasos = 30) {
  await pagina.evaluate((alcance) => {
    const raiz = document.querySelector(alcance ?? 'main')
    if (!raiz) return
    raiz.setAttribute('data-foco-inicio', '')
    if (!raiz.hasAttribute('tabindex')) { raiz.setAttribute('tabindex', '-1'); raiz.setAttribute('data-quitar-tabindex', '') }
    raiz.focus({ preventScroll: true })
  }, alcance ?? null)
  const sinFoco = []
  const vistos = new Set()
  for (let i = 0; i < pasos; i++) {
    await pagina.keyboard.press('Tab')
    const r = await pagina.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const e = getComputedStyle(el)
      const transparente = (c) => c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c)
      const contorno = e.outlineStyle !== 'none' && parseFloat(e.outlineWidth) > 0 && !transparente(e.outlineColor)
      const sombra = e.boxShadow && e.boxShadow !== 'none'
      const nombre = (el.getAttribute('aria-label') || el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 40)
      return { clave: el.tagName + nombre, texto: `${el.tagName.toLowerCase()} «${nombre}»`, ok: Boolean(contorno || sombra) }
    })
    if (!r || vistos.has(r.clave)) continue
    vistos.add(r.clave)
    if (!r.ok) sinFoco.push(r.texto)
  }
  await pagina.evaluate(() => {
    for (const el of document.querySelectorAll('[data-quitar-tabindex]')) { el.removeAttribute('tabindex'); el.removeAttribute('data-quitar-tabindex') }
    for (const el of document.querySelectorAll('[data-foco-inicio]')) el.removeAttribute('data-foco-inicio')
    document.activeElement?.blur?.()
  })
  return { vistos: vistos.size, sinFoco }
}

/** Audita el estado a la vista y deja la captura. */
async function auditar(pagina, ancho, estado, { alcance = null, raizFoco = null, completo = true } = {}) {
  await pagina.waitForTimeout(250)
  const archivo = `movil-${ancho}-${estado.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
  await pagina.screenshot({ path: `${SALIDA}/${archivo}` })
  const m = await medir(pagina, alcance)
  const p = `${ancho}px · ${estado}`
  const anchoOk = m.anchoPagina.scroll <= m.anchoPagina.cliente && (!m.anchoMain || m.anchoMain.scroll <= m.anchoMain.cliente)
  comprobar(`${p}: no se desplaza a lo ancho`, anchoOk,
    `página ${m.anchoPagina.scroll}/${m.anchoPagina.cliente}` + (m.anchoMain ? `, main ${m.anchoMain.scroll}/${m.anchoMain.cliente}` : '') + (m.salidos.length ? ` · ${m.salidos.join(' | ')}` : ''))
  const registro = { ancho, estado, captura: archivo, ...m }
  if (completo) {
    comprobar(`${p}: los ${m.total} controles miden ≥ 44×44 px`, m.chicos.length === 0, m.chicos.slice(0, 6).join(' | ') + (m.chicos.length > 6 ? ` … y ${m.chicos.length - 6} más` : ''))
    comprobar(`${p}: ningún control queda tapado`, m.tapados.length === 0, m.tapados.slice(0, 4).join(' | '))
    comprobar(`${p}: ningún texto principal baja de 12 px`, m.muyChico.length === 0, m.muyChico.slice(0, 4).join(' | '))
    const foco = await revisarFoco(pagina, raizFoco)
    comprobar(`${p}: el foco se ve al recorrer con Tab (${foco.vistos} controles)`, foco.vistos > 0 && foco.sinFoco.length === 0, foco.sinFoco.slice(0, 4).join(' | '))
    registro.foco = foco
    if (m.chico.length) console.log(`      nota: ${m.chico.length} textos de 12–13 px (p. ej. ${m.chico.slice(0, 3).join(' | ')})`)
    if (m.enDibujo.length) console.log(`      nota: ${m.enDibujo.length} objetivos chicos dentro de dibujos (p. ej. ${m.enDibujo.slice(0, 2).join(' | ')})`)
  }
  informe.push(registro)
}

// ---------------------------------------------------------------------------
// El recorrido, igual para cada tamaño
// ---------------------------------------------------------------------------

const espacio = (pagina, nombre) =>
  pagina.getByRole('navigation', { name: 'Espacios' }).getByRole('button', { name: nombre, exact: true }).click()
const subObra = (pagina, nombre) =>
  pagina.getByRole('navigation', { name: 'Pantallas de la obra' }).getByRole('button', { name: nombre, exact: true }).click()
const modoCalle = (pagina, nombre) =>
  pagina.getByRole('navigation', { name: 'Modos de la calle' }).getByRole('button', { name: nombre, exact: true }).click()
const pantallaCalle = (pagina, nombre) =>
  pagina.getByRole('navigation', { name: 'Pantallas de la calle' }).getByRole('button', { name: nombre, exact: true }).click()
const elegirCalle = (pagina, nombre) => pagina.getByLabel('Calle activa').selectOption({ label: nombre })

async function recorrer(ancho, alto, completo) {
  const { contexto, pagina } = await abrirObra(ancho, alto)
  const a = (estado, opciones = {}) => auditar(pagina, ancho, estado, { completo, ...opciones })
  const intentar = async (estado, accion) => {
    try { await accion() } catch (e) {
      comprobar(`${ancho}px · ${estado}: se puede llegar`, false, e.message.split('\n')[0])
      return false
    }
    return true
  }

  // Obra › Calles
  await a('obra-calles')
  if (await intentar('obra-calles-jr-lima', async () => {
    await pagina.getByRole('button', { name: `Abrir ${JR_LIMA}` }).click()
    // Despliega todos los apartados plegados del panel de la calle. Los «⋯»
    // de las jornadas no: un menú abierto tapa por diseño lo que hay debajo.
    for (let i = 0; i < 10; i++) {
      const plegado = pagina.locator('main button[aria-expanded="false"]:visible:not([aria-label^="Más de la jornada"])').first()
      if ((await plegado.count()) === 0) break
      await plegado.click({ timeout: 5000 })
      await pagina.waitForTimeout(100)
    }
  })) await a('obra-calles-jr-lima-desplegada')

  // Obra › Plano (DXF), ficha de pista, herramientas y PDF
  await subObra(pagina, 'Plano')
  await pagina.getByLabel('Plano a la vista').waitFor({ timeout: 10000 })
  await pagina.waitForTimeout(800)
  await a('plano-dxf')
  if (await intentar('plano-ficha-pista', async () => {
    await pagina.getByRole('region', { name: 'Pistas de la obra' }).getByRole('button', { name: new RegExp(ESPERADO.pistas.find((p) => p.origen === 'dxf').nombre) }).click()
    await pagina.waitForTimeout(400)
  })) await a('plano-ficha-pista')
  const herramientas = pagina.getByRole('group', { name: 'Herramientas del plano' })
  if (await intentar('plano-calibrar', () => herramientas.getByRole('button', { name: 'Calibrar escala' }).click())) await a('plano-calibrar')
  if (await intentar('plano-croquis', () => herramientas.getByRole('button', { name: 'Dibujar croquis' }).click())) await a('plano-croquis')
  await herramientas.getByRole('button', { name: 'Ver', exact: true }).click().catch(() => {})
  if (await intentar('plano-pdf', async () => {
    await pagina.getByLabel('Plano a la vista').selectOption(ESPERADO.planos.find((p) => p.formato === 'pdf').id)
    await pagina.waitForTimeout(1500)
  })) await a('plano-pdf')

  // Calle: Av. Sol en sus tres modos
  await espacio(pagina, 'Calle')
  await elegirCalle(pagina, AV_SOL)
  for (const modo of ['Medir', 'Revisar', 'Replantear']) {
    if (await intentar(`calle-${modo}`, () => modoCalle(pagina, modo))) await a(`calle-sol-${modo}`)
    if (modo === 'Medir' && completo) {
      // Dónde queda el campo de la lectura al entrar a Medir, con lo principal arriba del todo:
      // en obra es lo primero que se busca.
      const y = await pagina.evaluate(() => {
        const main = document.querySelector('main')
        if (main) main.scrollTop = 0
        const campo = document.querySelector('input[aria-label="Lectura de mira"]')
        return campo ? Math.round(campo.getBoundingClientRect().top) : null
      })
      console.log(`      nota: ${ancho}px · en Medir el campo «Lectura de mira» empieza a ${y} px de arriba (la ventana mide ${alto})`)
      informe.push({ ancho, estado: 'medir-posicion-lectura', y, alto })
    }
  }
  // Jr. Lima (sin cerrar) en Medir y Revisar
  await elegirCalle(pagina, JR_LIMA)
  for (const modo of ['Medir', 'Revisar']) {
    if (await intentar(`calle-lima-${modo}`, () => modoCalle(pagina, modo))) await a(`calle-lima-${modo}`)
  }

  // Análisis: cada pestaña, en Av. Sol
  await elegirCalle(pagina, AV_SOL)
  await pantallaCalle(pagina, 'Análisis')
  const pestanas = pagina.getByRole('tablist', { name: 'Qué analizar' }).getByRole('tab')
  const cuantas = await pestanas.count()
  for (let i = 0; i < cuantas; i++) {
    const nombre = (await pestanas.nth(i).innerText()).trim()
    await pestanas.nth(i).click()
    await a(`analisis-${nombre}`)
  }

  // Cierre, de la que cierra y de la que no
  await pantallaCalle(pagina, 'Cierre')
  await a('cierre-sol')
  await elegirCalle(pagina, JR_LIMA)
  await a('cierre-lima')

  // Planificar y Guía en Las Lomas
  await elegirCalle(pagina, LAS_LOMAS)
  await pantallaCalle(pagina, 'Planificar')
  await pagina.waitForTimeout(300)
  await a('planificar-lomas')
  if (await intentar('guia', () => pagina.getByRole('button', { name: 'Guía de campo' }).click())) await a('guia-lomas')

  // La calculadora, abierta encima de la libreta
  await elegirCalle(pagina, AV_SOL)
  await modoCalle(pagina, 'Medir')
  await pagina.getByRole('banner').getByRole('button', { name: 'Calcular' }).click()
  await pagina.getByRole('dialog', { name: 'Calculadora de campo' }).waitFor()
  await a('calculadora', { alcance: 'header, [role="dialog"]', raizFoco: '[role="dialog"]' })
  // En el celular «Cerrar calculadora» queda debajo de la barra de arriba (se informa
  // como tapado); se cierra con el mismo botón «Calcular», que sí se alcanza.
  await pagina.getByRole('banner').getByRole('button', { name: 'Calcular' }).click()
  await pagina.getByRole('dialog', { name: 'Calculadora de campo' }).waitFor({ state: 'detached' })

  // Informes: cada tipo
  await espacio(pagina, 'Informes')
  const tipos = pagina.getByRole('group', { name: 'Tipo de informe' }).getByRole('button')
  const nTipos = await tipos.count()
  for (let i = 0; i < nTipos; i++) {
    const nombre = await tipos.nth(i).getAttribute('aria-label')
    await tipos.nth(i).click()
    await a(`informes-${nombre}`)
  }

  // El menú de archivo abierto
  await pagina.getByRole('banner').getByRole('button', { name: 'Archivo' }).click()
  await a('menu-archivo', { alcance: 'header', raizFoco: '#menu-archivo' })
  await pagina.keyboard.press('Escape')

  await contexto.close()
}

await recorrer(390, 844, true)
await recorrer(360, 740, true)
await recorrer(1280, 800, false)

await navegador.close()

comprobar('sin errores en la consola del navegador', erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

writeFileSync(`${SALIDA}/movil-informe.json`, JSON.stringify(informe, null, 2))

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 ? 0 : 1)
