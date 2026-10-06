import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Recorrido «obra» (ola 3): Obra › Calles con la obra simulada, en el celular
 * (390×844) y en la laptop (1280×800).
 *
 * Comprueba que las tres calles salen con el estado de cada capa y su símbolo
 * (el color nunca va solo), que lo que no cerró se dice «no comprobado», que
 * abrir una calle lleva a Calle con esa calle activa, y que funcionan los
 * bancos de nivel, los ajustes de la calle, las jornadas (historial,
 * comparar, corregir, abrir en la libreta), subir hoja con la muestra real de
 * Max y empezar una jornada nueva. En el celular, además, que ningún botón
 * baja de 44 px y que la página no se desplaza a lo ancho.
 *
 * Uso: node verificacion/obra.mjs <carpeta-de-salida>
 * La URL sale de BASE (por defecto http://localhost:4173/).
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })

const ESPERADO = JSON.parse(readFileSync(new URL('./datos/obra-simulada.esperado.json', import.meta.url), 'utf8'))
const TOPO = fileURLToPath(new URL(ESPERADO.archivo.rutaDesdeGuion, import.meta.url))
const MUESTRA = fileURLToPath(new URL('../src/pruebas/muestras/detras-del-colegio.xlsx', import.meta.url))
const SIMBOLOS = Object.values(ESPERADO.textos.simbolos)
const NO_COMPROBADO = new RegExp(ESPERADO.textos.noComprobado, 'i')
const [SOL, LIMA, LOMAS] = ESPERADO.nombresDeCalles

/** «0+080», como la app escribe las progresivas. */
function progresiva(metros) {
  const km = Math.floor(metros / 1000)
  return `${km}+${String(Math.round(metros - km * 1000)).padStart(3, '0')}`
}
/** «+54 mm», «−26 mm», con el menos tipográfico. */
function mm(valor) {
  return valor === 0 ? '0 mm' : `${valor > 0 ? '+' : '−'}${Math.abs(valor)} mm`
}

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

const navegador = await chromium.launch()
const erroresConsola = []

/** Abre la obra simulada por el campo de archivo, en una página nueva del tamaño pedido. */
async function abrirObra(ancho, alto) {
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } })
  pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(`${ancho}px: ${m.text()}`) })
  pagina.on('pageerror', (e) => erroresConsola.push(`${ancho}px pageerror: ${e.message}`))
  await pagina.goto(BASE, { waitUntil: 'load', timeout: 120000 })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).waitFor({ state: 'attached', timeout: 30000 })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).setInputFiles(TOPO)
  // El ejemplo de fábrica también tiene una «Av. Sol»: se espera al título de
  // la obra simulada, que es lo que dice que el archivo ya se cargó.
  await pagina.getByRole('heading', { level: 1, name: ESPERADO.obra.nombre, exact: true }).waitFor({ timeout: 15000 })
  return pagina
}

/**
 * Captura de la pantalla entera. La app ocupa la ventana y desplaza solo su
 * área principal, así que `fullPage` se quedaría en lo que cabe: se suelta
 * la altura un momento, se captura y se deja como estaba.
 */
async function captura(pagina, ruta) {
  await pagina.evaluate(() => {
    const main = document.querySelector('main')
    for (let nodo = main; nodo && nodo !== document.documentElement; nodo = nodo.parentElement) {
      nodo.dataset.estiloAntes = nodo.getAttribute('style') ?? ''
      nodo.style.height = 'auto'
      nodo.style.maxHeight = 'none'
      nodo.style.overflow = 'visible'
    }
  })
  await pagina.screenshot({ path: ruta, fullPage: true })
  await pagina.evaluate(() => {
    for (const nodo of document.querySelectorAll('[data-estilo-antes]')) {
      nodo.setAttribute('style', nodo.dataset.estiloAntes)
      delete nodo.dataset.estiloAntes
    }
  })
}

/** Ni la página ni el área principal se desplazan a lo ancho. */
async function sinDesplazamientoLateral(pagina) {
  return pagina.evaluate(() => {
    const main = document.querySelector('main')
    return {
      pagina: document.documentElement.scrollWidth,
      ventana: window.innerWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    }
  })
}

/**
 * Lo que se toca con el dedo en la zona dada y mide menos de 44 px de alto o
 * de ancho: botones, campos, selectores y casillas. Una casilla o un botón de
 * opción cuenta por su etiqueta si va dentro de una, que es lo que se pulsa.
 * Los campos de texto y los selectores se miden solo de alto: su ancho es el
 * de la columna. El campo de archivo nativo se queda fuera: lo dibuja el
 * navegador.
 */
async function controlesChicos(zona) {
  return zona.locator('button, input:not([type="hidden"]):not([type="file"]), select, textarea').evaluateAll((controles) =>
    controles
      .map((c) => {
        const marcable = c instanceof HTMLInputElement && (c.type === 'checkbox' || c.type === 'radio')
        const blanco = marcable ? (c.closest('label') ?? c) : c
        return { c, blanco, soloAlto: !marcable && c.tagName !== 'BUTTON' }
      })
      .filter(({ c, blanco }) => {
        const r = blanco.getBoundingClientRect()
        const estilo = getComputedStyle(c)
        return r.width > 0 && r.height > 0 && estilo.visibility !== 'hidden' && !c.closest('[hidden]') && !c.disabled
      })
      .filter(({ blanco, soloAlto }) => {
        const r = blanco.getBoundingClientRect()
        return r.height < 43.5 || (!soloAlto && r.width < 43.5)
      })
      .map(({ c, blanco }) => {
        const r = blanco.getBoundingClientRect()
        const nombre = c.getAttribute('aria-label') ?? (c.tagName === 'BUTTON' ? c.innerText : c.labels?.[0]?.innerText) ?? c.tagName
        return `${c.tagName.toLowerCase()} «${(nombre ?? '').trim().slice(0, 40)}» ${Math.round(r.width)}×${Math.round(r.height)}`
      }),
  )
}

/** Las casillas de capas de una calle: [{ etiqueta, texto }]. */
async function casillas(pagina, calle) {
  return pagina.getByRole('list', { name: `Capas de ${calle}`, exact: true }).getByRole('listitem').evaluateAll((items) =>
    items.map((li) => ({ etiqueta: li.getAttribute('aria-label') ?? '', texto: li.innerText.trim() })),
  )
}

/** La fila entera de la calle en la lista: nombre, tramo, casillas y frase. */
function filaDeCalle(pagina, calle) {
  return pagina.locator('li', { has: pagina.getByRole('button', { name: `Abrir ${calle}`, exact: true }) })
}

const espacios = (pagina) => pagina.getByRole('navigation', { name: 'Espacios' })
async function volverAObra(pagina) {
  await espacios(pagina).getByRole('button', { name: 'Obra', exact: true }).click()
  await pagina.getByRole('navigation', { name: 'Pantallas de la obra' }).waitFor()
}
async function calleActiva(pagina) {
  const selector = pagina.getByLabel('Calle activa')
  await selector.waitFor({ timeout: 5000 })
  return selector.evaluate((s) => s.options[s.selectedIndex]?.text ?? '')
}
async function modoPulsado(pagina) {
  const nav = pagina.getByRole('navigation', { name: 'Modos de la calle' })
  await nav.waitFor({ timeout: 5000 })
  return nav.getByRole('button', { pressed: true }).innerText().catch(() => '(ninguno)')
}

/**
 * Elige una calle en la lista. En el celular el panel tapa la lista; en la
 * laptop van lado a lado.
 */
async function elegirCalle(pagina, calle) {
  await pagina.getByRole('button', { name: `Abrir ${calle}`, exact: true }).click()
  await pagina.getByRole('region', { name: `Panel de ${calle}`, exact: true }).waitFor({ timeout: 5000 })
}
async function volverALaLista(pagina, celular) {
  if (!celular) return
  await pagina.getByRole('button', { name: /Volver a la obra/ }).click()
  await pagina.getByRole('button', { name: `Abrir ${SOL}`, exact: true }).waitFor({ timeout: 5000 })
}
/** Abre un apartado plegable si está cerrado. */
async function desplegar(zona, titulo) {
  const boton = zona.getByRole('button', { name: titulo, exact: true })
  if ((await boton.getAttribute('aria-expanded')) !== 'true') await boton.click()
  return boton
}

async function recorrer(ancho, alto) {
  const celular = ancho < 1024
  const t = celular ? `[${ancho}] ` : `[${ancho}] `
  const pagina = await abrirObra(ancho, alto)

  // -------------------------------------------------------------------------
  // 1. Obra › Calles al abrir: la obra, las tres calles y sus capas
  // -------------------------------------------------------------------------

  const subObra = pagina.getByRole('navigation', { name: 'Pantallas de la obra' })
  comprobar(`${t}al abrir, Obra › Calles es la pantalla a la vista`,
    (await subObra.getByRole('button', { name: 'Calles', exact: true }).getAttribute('aria-pressed')) === 'true')
  comprobar(`${t}el título es el nombre de la obra`,
    (await pagina.getByRole('heading', { level: 1 }).first().innerText()).trim() === ESPERADO.obra.nombre)
  comprobar(`${t}cuenta 3 calles y 3 bancos de nivel`,
    (await pagina.getByText('Obra · 3 calles · 3 bancos de nivel').count()) === 1)

  for (const calle of ESPERADO.nombresDeCalles) {
    const lista = await casillas(pagina, calle)
    comprobar(`${t}«${calle}» trae una casilla por capa (${ESPERADO.capas.length})`, lista.length === ESPERADO.capas.length,
      lista.map((c) => c.texto).join(' | '))
    comprobar(`${t}cada casilla de «${calle}» empieza con su símbolo`,
      lista.length > 0 && lista.every((c) => SIMBOLOS.includes(c.texto.charAt(0))), lista.map((c) => c.texto).join(' | '))
  }

  const sol = await casillas(pagina, SOL)
  const etiquetasSol = sol.map((c) => c.etiqueta)
  comprobar(`${t}Av. Sol: terreno · sin medir, subrasante ✗ con puntos fuera, base ✓ conforme`,
    etiquetasSol.join('|') === 'TERRENO EXISTENTE: sin medir|SUBRASANTE: con puntos fuera|BASE: conforme' &&
      sol.map((c) => c.texto.charAt(0)).join('') === '·✗✓',
    sol.map((c) => `${c.texto} (${c.etiqueta})`).join(' | '))
  const fraseSol = await filaDeCalle(pagina, SOL).locator('p').innerText()
  const { fuera: fueraSol, alLimite: limiteSol } = ESPERADO.avSol.subrasante
  const fueraSolTexto = `${fueraSol.punto} ${progresiva(fueraSol.progresiva)} ${mm(fueraSol.diferenciaMm)}, ${fueraSol.accion}`
  const limiteSolTexto = `${limiteSol.punto} ${progresiva(limiteSol.progresiva)} ${mm(limiteSol.diferenciaMm)}, ${limiteSol.accion}`
  comprobar(`${t}Av. Sol dice qué punto está fuera, cuánto y qué hacer: «${fueraSolTexto}»`,
    /✗/.test(fraseSol) && fraseSol.includes(`1 punto fuera de tolerancia: ${fueraSolTexto}`), fraseSol)
  comprobar(`${t}Av. Sol dice el punto al límite con su signo: «${limiteSolTexto}»`,
    fraseSol.includes(`1 punto al límite: ${limiteSolTexto}`), fraseSol)
  comprobar(`${t}Av. Sol muestra su tramo medido 0+000 – 0+120`,
    (await filaDeCalle(pagina, SOL).getByText('0+000 – 0+120').count()) === 1)

  const lima = await casillas(pagina, LIMA)
  const subLima = lima.find((c) => c.etiqueta.startsWith('SUBRASANTE'))
  comprobar(`${t}Jr. Lima: la subrasante sin cerrar sale △ en curso, nunca ✓ ni ✗`,
    subLima?.texto.startsWith('△') && /en curso/.test(subLima.etiqueta), subLima ? `${subLima.texto} (${subLima.etiqueta})` : 'sin casilla')
  const fraseLima = await filaDeCalle(pagina, LIMA).locator('p').innerText()
  comprobar(`${t}Jr. Lima dice que el circuito está sin cerrar y que no está comprobado`,
    /sin cerrar/.test(fraseLima) && NO_COMPROBADO.test(fraseLima), fraseLima)
  const fueraLima = ESPERADO.jrLima.subrasante.fuera
  const fueraLimaTexto = `${fueraLima.punto} ${progresiva(fueraLima.progresiva)} ${mm(fueraLima.diferenciaMm)}, ${fueraLima.accion}`
  comprobar(`${t}Jr. Lima avisa del posible punto fuera «${fueraLimaTexto}», no comprobado`,
    fraseLima.includes(`posible punto fuera: ${fueraLimaTexto}, no comprobado`), fraseLima)
  comprobar(`${t}Jr. Lima no lo da por «fuera de tolerancia» ni pone ✗ sin haber cerrado`,
    !/fuera de tolerancia/.test(fraseLima) && !lima.some((c) => c.texto.startsWith('✗')), fraseLima)

  const lomas = await casillas(pagina, LOMAS)
  comprobar(`${t}Psje. Las Lomas: las tres capas · sin medir`,
    lomas.every((c) => c.texto.startsWith('·') && /sin medir/.test(c.etiqueta)), lomas.map((c) => c.texto).join(' | '))
  comprobar(`${t}Psje. Las Lomas dice «sin medir» en lugar del tramo`,
    (await filaDeCalle(pagina, LOMAS).getByText('sin medir', { exact: true }).count()) === 1)

  const seguir = pagina.getByRole('region', { name: 'Seguir donde lo dejaste' })
  const textoSeguir = await seguir.innerText()
  const cierreSol = ESPERADO.avSol.subrasante.cierre
  const fraseCierreSol = `Circuito cerrado: ${mm(cierreSol.errorMm)} de error, tolerancia ±${cierreSol.toleranciaMm.toFixed(1)} mm`
  comprobar(`${t}«Seguir donde lo dejaste» está en Av. Sol · SUBRASANTE: «${fraseCierreSol}», como Cierre y los PDF`,
    textoSeguir.includes(`${SOL} · SUBRASANTE`) && /✓/.test(textoSeguir) && textoSeguir.includes(fraseCierreSol),
    textoSeguir.replace(/\n/g, ' / '))

  const textoBms = await pagina.getByRole('region', { name: 'Bancos de nivel de la obra' }).innerText()
  comprobar(`${t}los tres BMs con su cota a la vista`,
    ESPERADO.bms.every((b) => textoBms.includes(`${b.nombre} ${b.cota.toFixed(3)}`)), textoBms.replace(/\n/g, ' '))

  const lateral = await sinDesplazamientoLateral(pagina)
  comprobar(`${t}la lista no se desplaza a lo ancho`, lateral.pagina <= lateral.ventana && lateral.main <= 0, JSON.stringify(lateral))
  if (celular) {
    const chicos = await controlesChicos(pagina.locator('main'))
    comprobar(`${t}todos los botones y campos de Obra › Calles miden ≥ 44 px`, chicos.length === 0, chicos.join(', '))
  }
  await captura(pagina, `${SALIDA}/obra-calles-${ancho}.png`)

  // -------------------------------------------------------------------------
  // 2. Bancos de nivel: se ven, uno en uso no se borra, se agrega y se edita
  // -------------------------------------------------------------------------

  const ajustesObra = pagina.getByRole('region', { name: 'De toda la obra' })
  await desplegar(ajustesObra, 'Bancos de nivel')
  const cotaBm1 = await pagina.getByLabel('Cota de BM-1').inputValue()
  comprobar(`${t}la cota de BM-1 es ${ESPERADO.bms[0].cota.toFixed(3)}`, Number(cotaBm1) === ESPERADO.bms[0].cota, cotaBm1)
  comprobar(`${t}BM-1 es oficial`, (await pagina.getByLabel('Tipo de BM-1').inputValue()) === 'oficial')
  await pagina.getByRole('button', { name: 'Eliminar BM-1', exact: true }).click()
  const avisoBm = await ajustesObra.getByRole('alert').innerText().catch(() => '')
  comprobar(`${t}BM-1 está en uso y no se deja borrar`, /No se puede borrar BM-1/.test(avisoBm), avisoBm)
  comprobar(`${t}BM-1 sigue en la obra`, (await pagina.getByLabel('Cota de BM-1').count()) === 1)

  await pagina.getByRole('button', { name: 'Agregar banco de nivel', exact: true }).click()
  const cotaBm4 = pagina.getByLabel('Cota de BM-4')
  await cotaBm4.waitFor({ timeout: 3000 })
  await cotaBm4.fill('3240.5')
  await cotaBm4.blur()
  const resumenBms = await ajustesObra.getByRole('button', { name: 'Bancos de nivel', exact: true }).innerText()
  comprobar(`${t}agregar un BM y escribir su cota llega al resumen`, resumenBms.includes('BM-4 3240.500'), resumenBms.replace(/\n/g, ' '))
  comprobar(`${t}la cuenta de la obra sube a 4 bancos de nivel`, (await pagina.getByText('Obra · 3 calles · 4 bancos de nivel').count()) === 1)
  if (celular) {
    await captura(pagina, `${SALIDA}/obra-bms-${ancho}.png`)
    const chicosBms = await controlesChicos(ajustesObra)
    comprobar(`${t}los bancos de nivel en edición (botones, cotas y tipos) miden ≥ 44 px`, chicosBms.length === 0, chicosBms.join(', '))
  }
  await pagina.getByRole('button', { name: 'Eliminar BM-4', exact: true }).click()
  await pagina.getByRole('button', { name: 'Confirmar eliminación de BM-4', exact: true }).click()
  comprobar(`${t}un BM sin usar se borra tras confirmar`, (await pagina.getByLabel('Cota de BM-4').count()) === 0)
  await ajustesObra.getByRole('button', { name: 'Bancos de nivel', exact: true }).click()

  // -------------------------------------------------------------------------
  // 3. Ajustes de la calle y su historial: Jr. Lima (sin cerrar)
  // -------------------------------------------------------------------------

  await elegirCalle(pagina, LIMA)
  const panelLima = pagina.getByRole('region', { name: `Panel de ${LIMA}`, exact: true })
  if (celular) {
    comprobar(`${t}en el celular el panel de la calle tapa la lista`,
      !(await pagina.getByRole('button', { name: `Abrir ${SOL}`, exact: true }).isVisible()) &&
        (await pagina.getByRole('button', { name: /Volver a la obra/ }).isVisible()))
  }
  const describir = async (zona, titulo) => {
    const boton = zona.getByRole('button', { name: titulo, exact: true })
    const id = await boton.getAttribute('aria-describedby')
    return id ? (await pagina.locator(`[id="${id}"]`).innerText()).trim() : ''
  }
  const resumenSeccion = await describir(panelLima, 'Sección')
  comprobar(`${t}la sección de Jr. Lima: 3 puntos de −3.60 a +3.60 m`, resumenSeccion.startsWith('3 puntos · de −3.60 a +3.60 m'), resumenSeccion)
  const resumenRasante = await describir(panelLima, 'Rasante')
  comprobar(`${t}la rasante de Jr. Lima arranca en 3243.900 en 0+100 con +0.20 %`,
    resumenRasante.includes('3243.900 en 0+100') && resumenRasante.includes('+0.20 %'), resumenRasante)
  const resumenJornadasLima = await describir(panelLima, 'Jornadas y hojas')
  comprobar(`${t}el resumen de jornadas de Jr. Lima dice △ sin cerrar`,
    /1 jornada · la última 2026-10-02, SUBRASANTE: △ sin cerrar/.test(resumenJornadasLima), resumenJornadasLima)

  await desplegar(panelLima, 'Jornadas y hojas')
  const jornadaLima = panelLima.getByRole('button', { name: 'Comparar la jornada 2026-10-02 · SUBRASANTE', exact: true })
  const descJornadaLima = await jornadaLima.evaluate((b) =>
    (b.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.innerText ?? '').join(' · '))
  comprobar(`${t}el historial de Jr. Lima lista su jornada con △ sin cerrar`, /△ sin cerrar/.test(descJornadaLima), descJornadaLima)

  // Cambiar el nombre de la calle llega a la lista y se deshace.
  const campoNombre = panelLima.getByRole('textbox', { name: 'Nombre de la calle', exact: true })
  await campoNombre.fill('Jr. Lima Norte')
  comprobar(`${t}renombrar la calle cambia el título del panel`,
    (await pagina.getByRole('heading', { name: 'Jr. Lima Norte', exact: true }).count()) === 1)
  if (!celular) {
    comprobar(`${t}el nombre nuevo llega a la lista de calles`,
      (await pagina.getByRole('button', { name: 'Abrir Jr. Lima Norte', exact: true }).count()) === 1)
  }
  await pagina.getByRole('textbox', { name: 'Nombre de la calle', exact: true }).fill(LIMA)
  await pagina.getByRole('region', { name: `Panel de ${LIMA}`, exact: true }).waitFor()
  await captura(pagina, `${SALIDA}/obra-panel-lima-${ancho}.png`)

  // Abrir la calle lleva a Calle con esa calle activa.
  await pagina.getByRole('button', { name: 'Abrir la calle ›', exact: true }).click()
  comprobar(`${t}«Abrir la calle» lleva a Calle con Jr. Lima activa`, (await calleActiva(pagina)) === LIMA, await calleActiva(pagina))
  await pagina.screenshot({ path: `${SALIDA}/obra-abrir-lima-${ancho}.png` })
  await volverAObra(pagina)
  const seguirLima = await pagina.getByRole('region', { name: 'Seguir donde lo dejaste' }).innerText()
  comprobar(`${t}de vuelta en Obra, «Seguir» está en Jr. Lima y dice que no está comprobado`,
    seguirLima.includes(`${LIMA} · SUBRASANTE`) && /△/.test(seguirLima) && NO_COMPROBADO.test(seguirLima),
    seguirLima.replace(/\n/g, ' / '))
  await volverALaLista(pagina, celular && (await pagina.getByRole('button', { name: /Volver a la obra/ }).isVisible()))

  // -------------------------------------------------------------------------
  // 4. Historial de Av. Sol: comparar, corregir, celda por celda, libreta
  // -------------------------------------------------------------------------

  await elegirCalle(pagina, SOL)
  const panelSol = pagina.getByRole('region', { name: `Panel de ${SOL}`, exact: true })
  const resumenJornadasSol = await describir(panelSol, 'Jornadas y hojas')
  comprobar(`${t}Av. Sol: 2 jornadas, la última 2026-09-28 BASE ✓ cerró +4 mm`,
    /2 jornadas · la última 2026-09-28, BASE: ✓ cerró \+4 mm/.test(resumenJornadasSol), resumenJornadasSol)
  await desplegar(panelSol, 'Jornadas y hojas')
  const jornadasSol = await panelSol.getByRole('button', { name: /^Comparar la jornada / }).evaluateAll((bs) =>
    bs.map((b) => `${b.getAttribute('aria-label')} [${(b.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.innerText ?? '').join(' · ')}]`))
  comprobar(`${t}el historial va de la más reciente a la más antigua, cada una con su cierre`,
    jornadasSol.length === 2 && /2026-09-28 · BASE/.test(jornadasSol[0]) && /✓ cerró \+4 mm/.test(jornadasSol[0]) &&
      /2026-09-14 · SUBRASANTE/.test(jornadasSol[1]) && /✓ cerró −4 mm/.test(jornadasSol[1]),
    jornadasSol.join(' | '))

  await panelSol.getByRole('button', { name: 'Comparar la jornada 2026-09-14 · SUBRASANTE', exact: true }).click()
  await panelSol.getByRole('button', { name: 'Comparar la jornada 2026-09-28 · BASE', exact: true }).click()
  const comparacion = pagina.getByRole('region', { name: 'Comparación de las dos jornadas' })
  await comparacion.waitFor({ timeout: 5000 })
  const textoCmp = await comparacion.innerText()
  const esp = ESPERADO.avSol.espesores
  const minimo = Math.round(esp.minimoM * 1000)
  const maximo = Math.round(esp.maximoM * 1000)
  comprobar(`${t}comparar subrasante y base da el espesor colocado, de ${minimo} a ${maximo} mm`,
    /Espesor colocado/.test(textoCmp) && /SUBRASANTE → BASE/.test(textoCmp) &&
      textoCmp.includes(String(minimo)) && textoCmp.includes(String(maximo)),
    textoCmp.replace(/\n/g, ' / ').slice(0, 300))
  comprobar(`${t}la lectura del espesor sigue el semáforo: ${esp.fuera.length} fuera ✗ y ${esp.alLimite.length} al límite △`,
    new RegExp(`✗ ${esp.fuera.length} celda`).test(textoCmp) && new RegExp(`△ ${esp.alLimite.length} celdas? al límite`).test(textoCmp),
    (textoCmp.match(/Proyecto[^\n]*/) ?? [''])[0])
  comprobar(`${t}la comparación cuenta las ${esp.comparables} celdas medidas en las dos`,
    textoCmp.includes(`${esp.comparables} celdas medidas en las dos`))
  comprobar(`${t}la comparación entre dos jornadas cerradas no se dice «no comprobada»`, !NO_COMPROBADO.test(textoCmp))
  comprobar(`${t}el rótulo verde dice que lo comprobado son los circuitos, no «espesores verificados»`,
    /Circuitos comprobados/.test(textoCmp) && !/espesores verificados/i.test(textoCmp), (textoCmp.match(/[^\n]*comprobad[^\n]*/i) ?? [''])[0])
  await captura(pagina, `${SALIDA}/obra-historial-sol-${ancho}.png`)

  await panelSol.getByRole('button', { name: 'Corregir la jornada 2026-09-14 · SUBRASANTE', exact: true }).click()
  const fecha = panelSol.getByLabel('Fecha de la jornada 2026-09-14 · SUBRASANTE')
  comprobar(`${t}«Corregir» abre la fecha, la capa, el BM y la calle de la jornada`,
    (await fecha.inputValue()) === '2026-09-14' &&
      (await panelSol.getByLabel('BM de la jornada 2026-09-14 · SUBRASANTE').evaluate((s) => s.options[s.selectedIndex].text)) === 'BM-1' &&
      (await panelSol.getByLabel('Calle de la jornada 2026-09-14 · SUBRASANTE').evaluate((s) => s.options[s.selectedIndex].text)) === SOL)
  if (celular) {
    // El panel entero, con lo que más se toca abierto: la sección (viene
    // abierta), la rasante, las jornadas con la comparación y el corregir.
    await desplegar(panelSol, 'Sección')
    await desplegar(panelSol, 'Rasante')
    const chicosPanel = await controlesChicos(panelSol)
    comprobar(`${t}el panel de Av. Sol (sección, rasante, jornadas, comparar y corregir) mide ≥ 44 px`,
      chicosPanel.length === 0, chicosPanel.join(', '))
    const lateralPanel = await sinDesplazamientoLateral(pagina)
    comprobar(`${t}el panel abierto no se desplaza a lo ancho`, lateralPanel.pagina <= lateralPanel.ventana && lateralPanel.main <= 0, JSON.stringify(lateralPanel))
    await captura(pagina, `${SALIDA}/obra-panel-sol-abierto-${ancho}.png`)
  }
  await panelSol.getByRole('button', { name: 'Corregir la jornada 2026-09-14 · SUBRASANTE', exact: true }).click()

  await comparacion.getByRole('button', { name: 'Ver celda por celda', exact: true }).click()
  comprobar(`${t}«Ver celda por celda» lleva a Calle › Revisar en Av. Sol`,
    (await modoPulsado(pagina)) === 'Revisar' && (await calleActiva(pagina)) === SOL, `${await modoPulsado(pagina)} · ${await calleActiva(pagina)}`)
  await volverAObra(pagina)
  if (celular && !(await pagina.getByRole('region', { name: `Panel de ${SOL}`, exact: true }).isVisible())) await elegirCalle(pagina, SOL)
  await desplegar(pagina.getByRole('region', { name: `Panel de ${SOL}`, exact: true }), 'Jornadas y hojas')
  await pagina.getByRole('button', { name: 'Abrir la jornada 2026-09-14 · SUBRASANTE', exact: true }).click()
  comprobar(`${t}«Abrir en la libreta» lleva a Calle › Medir en Av. Sol`,
    (await modoPulsado(pagina)) === 'Medir' && (await calleActiva(pagina)) === SOL, `${await modoPulsado(pagina)} · ${await calleActiva(pagina)}`)
  await volverAObra(pagina)
  if (celular && (await pagina.getByRole('button', { name: /Volver a la obra/ }).isVisible())) await volverALaLista(pagina, true)

  // -------------------------------------------------------------------------
  // 5. Nueva jornada en Psje. Las Lomas (que no tiene ninguna)
  // -------------------------------------------------------------------------

  await elegirCalle(pagina, LOMAS)
  const panelLomas = pagina.getByRole('region', { name: `Panel de ${LOMAS}`, exact: true })
  comprobar(`${t}Las Lomas no tiene jornadas y lo dice`, (await describir(panelLomas, 'Jornadas y hojas')) === 'Ninguna jornada todavía')
  await volverALaLista(pagina, celular)
  const detalleNueva = await pagina.locator('#detalle-nueva-jornada').innerText()
  comprobar(`${t}«Nueva jornada» dice que va a Las Lomas, desde BM-1`, detalleNueva.includes(`Nueva jornada en ${LOMAS}`) && detalleNueva.includes('desde BM-1'), detalleNueva)
  await pagina.getByRole('button', { name: 'Nueva jornada', exact: true }).click()
  comprobar(`${t}«Nueva jornada» lleva a Calle › Medir en Las Lomas`,
    (await modoPulsado(pagina)) === 'Medir' && (await calleActiva(pagina)) === LOMAS, `${await modoPulsado(pagina)} · ${await calleActiva(pagina)}`)
  await volverAObra(pagina)
  if (celular && (await pagina.getByRole('button', { name: /Volver a la obra/ }).isVisible())) await volverALaLista(pagina, true)
  const lomasDespues = await casillas(pagina, LOMAS)
  comprobar(`${t}una jornada sin lecturas no cambia el · sin medir de Las Lomas`,
    lomasDespues.every((c) => c.texto.startsWith('·')), lomasDespues.map((c) => c.etiqueta).join(' | '))

  // -------------------------------------------------------------------------
  // 6. Subir hoja: la muestra real de Max
  // -------------------------------------------------------------------------

  await pagina.getByRole('button', { name: 'Subir hoja', exact: true }).click()
  const zona = pagina.getByTestId('zona-subir-hoja')
  await zona.waitFor({ state: 'visible', timeout: 5000 })
  await zona.getByLabel(/archivo de la hoja/i).setInputFiles(MUESTRA)
  await pagina.getByRole('heading', { name: /Qué columna cayó en qué punto/ }).waitFor({ timeout: 10000 })
  const campoCalle = zona.getByLabel(/a qué calle/i)
  comprobar(`${t}la hoja propone el nombre del archivo como calle`, (await campoCalle.inputValue()) === 'detras-del-colegio', await campoCalle.inputValue())
  for (const [palabra, lado] of [['IZQ', /izquierd/i], ['DER', /derech/i]]) {
    const selector = zona.getByLabel(`Dónde va la columna ${palabra}`)
    const opciones = await selector.locator('option').evaluateAll((os) => os.map((o) => ({ valor: o.value, texto: o.textContent ?? '' })))
    const opcion = opciones.find((o) => lado.test(o.texto) && /borde/i.test(o.texto)) ?? opciones.find((o) => lado.test(o.texto))
    if (opcion) await selector.selectOption(opcion.valor)
  }
  const importar = zona.getByRole('button', { name: 'Importar la hoja', exact: true })
  comprobar(`${t}con IZQ y DER colocadas la hoja se deja importar`, await importar.isEnabled())
  if (celular) {
    const chicosSubir = await controlesChicos(zona)
    comprobar(`${t}los botones, campos y selectores de subir hoja miden ≥ 44 px`, chicosSubir.length === 0, chicosSubir.join(', '))
    const lateralSubir = await sinDesplazamientoLateral(pagina)
    comprobar(`${t}subir hoja no se desplaza a lo ancho`, lateralSubir.pagina <= lateralSubir.ventana && lateralSubir.main <= 0, JSON.stringify(lateralSubir))
  }
  await captura(pagina, `${SALIDA}/obra-subir-${ancho}.png`)
  await importar.click()
  const aceptada = await zona.locator('p', { hasText: 'Hoja aceptada' }).first().innerText().catch(() => '')
  comprobar(`${t}la hoja entra: 7 progresivas y 35 lecturas`, /7 progresivas/.test(aceptada) && /35 lecturas/.test(aceptada), aceptada)
  comprobar(`${t}la hoja aceptada avisa de que no cierra`, /no cierra|sin vuelta|no comprobad/i.test(await zona.innerText()))
  await volverALaLista(pagina, celular)
  comprobar(`${t}la calle nueva aparece en la lista`, (await pagina.getByRole('button', { name: 'Abrir detras-del-colegio', exact: true }).count()) === 1)
  comprobar(`${t}la obra cuenta ya 4 calles`, (await pagina.getByText(/^Obra · 4 calles/).count()) === 1)
  const nueva = await casillas(pagina, 'detras-del-colegio')
  const medida = nueva.find((c) => !c.texto.startsWith('·'))
  comprobar(`${t}la capa de la hoja importada sale △ «no comprobada», con símbolo`,
    !!medida && medida.texto.startsWith('△') && NO_COMPROBADO.test(medida.etiqueta), nueva.map((c) => `${c.texto} (${c.etiqueta})`).join(' | '))
  const fraseNueva = await filaDeCalle(pagina, 'detras-del-colegio').locator('p').innerText()
  comprobar(`${t}la frase de la calle importada dice «no comprobada»`, NO_COMPROBADO.test(fraseNueva), fraseNueva)
  const lateralFin = await sinDesplazamientoLateral(pagina)
  comprobar(`${t}con cuatro calles sigue sin desplazarse a lo ancho`, lateralFin.pagina <= lateralFin.ventana && lateralFin.main <= 0, JSON.stringify(lateralFin))
  await captura(pagina, `${SALIDA}/obra-tras-subir-${ancho}.png`)

  await pagina.close()
}

await recorrer(390, 844)
await recorrer(1280, 800)
await navegador.close()

comprobar('sin errores en la consola del navegador', erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 ? 0 : 1)
