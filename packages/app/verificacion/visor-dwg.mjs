import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * El visor de planos en un navegador real: se importan juntos un DWG de
 * verdad (el ejemplo de LibreDWG, leído con WebAssembly en su trabajador) y
 * un DXF grande (60 000 líneas en coordenadas UTM). Los dos quedan en la
 * lista, el DWG se pinta en el canvas con sus capas, y arrastrar y
 * pellizcar el DXF grande va fluido (se mide el tiempo entre cuadros). En la
 * laptop y en el celular.
 *
 * Uso: node verificacion/visor-dwg.mjs <carpeta-de-salida>
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })
const ESPERADO = JSON.parse(readFileSync(new URL('./datos/obra-simulada.esperado.json', import.meta.url), 'utf8'))
const TOPO = fileURLToPath(new URL(ESPERADO.archivo.rutaDesdeGuion, import.meta.url))
const DWG = fileURLToPath(new URL('../src/pruebas/muestras/ejemplo-libredwg-2018.dwg', import.meta.url))

/** Un DXF grande: una urbanización de 240 × 250 lotes, con su texto cada tanto. */
function dxfGrande() {
  const l = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES']
  const X = 480000
  const Y = 8660000
  for (let i = 0; i < 240; i++)
    for (let j = 0; j < 250; j++) {
      const x = X + i * 12
      const y = Y + j * 20
      l.push('0', 'LWPOLYLINE', '8', i % 2 ? 'LOTES' : 'MANZANAS', '90', '4', '70', '1')
      for (const [a, b] of [[0, 0], [10, 0], [10, 18], [0, 18]]) l.push('10', String(x + a), '20', String(y + b))
      if ((i + j) % 25 === 0) l.push('0', 'TEXT', '8', 'TEXTOS', '10', String(x + 1), '20', String(y + 8), '40', '1.5', '1', `Lt ${i}-${j}`)
    }
  l.push('0', 'ENDSEC', '0', 'EOF')
  return l.join('\n')
}
const GRANDE = `${SALIDA}/urbanizacion-grande.dxf`
writeFileSync(GRANDE, dxfGrande())

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

/** Cuántos píxeles del canvas del fondo tienen algo pintado. */
async function pixelesPintados(pagina) {
  return pagina.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return -1
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
    return n
  })
}

const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const erroresConsola = []

for (const [nombre, ancho, alto, movil] of [['laptop', 1280, 800, false], ['celular', 390, 844, true]]) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: movil ? 3 : 1, hasTouch: movil })
  const pagina = await contexto.newPage()
  pagina.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.location().url ?? '')) erroresConsola.push(`${ancho}px: ${m.text()} ${m.location().url ?? ''}`) })
  pagina.on('pageerror', (e) => erroresConsola.push(`${ancho}px pageerror: ${e.message}`))
  await pagina.goto(BASE, { waitUntil: 'load' })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).setInputFiles(TOPO)
  await pagina.getByText(ESPERADO.nombresDeCalles[0], { exact: true }).first().waitFor({ timeout: 10000 })
  await pagina.getByRole('navigation', { name: 'Pantallas de la obra' }).getByRole('button', { name: 'Plano' }).click()

  await pagina.getByRole('button', { name: 'Más del plano' }).click()
  const t0 = Date.now()
  await pagina.getByLabel('Importar planos (DWG, DXF o PDF)').setInputFiles([GRANDE, DWG])
  await pagina.getByText(/2 planos importados/).waitFor({ timeout: 60000 })
  const tImportar = Date.now() - t0
  comprobar(`${nombre}: importa los dos de una vez`, true, `${tImportar} ms (DXF de 60 000 líneas + DWG)`)
  const opciones = await pagina.getByLabel('Plano a la vista').locator('option').allInnerTexts()
  comprobar(`${nombre}: el DWG queda en la lista y abierto`, opciones.some((o) => /ejemplo-libredwg-2018 \(DWG\)/.test(o)) && (await pagina.getByLabel('Plano a la vista').inputValue()) !== '', opciones.join(' | '))

  await pagina.waitForTimeout(400)
  const pintadosDwg = await pixelesPintados(pagina)
  comprobar(`${nombre}: el DWG se pinta en el canvas`, pintadosDwg > 500, `${pintadosDwg} píxeles`)
  // El menú «⋯» se cierra; el panel de capas está plegado: se abre.
  await pagina.keyboard.press('Escape')
  await pagina.locator('summary', { hasText: 'Capas del plano' }).click()
  const capas = pagina.getByRole('group', { name: 'Capas del plano' })
  comprobar(`${nombre}: el DWG trae sus capas`, await capas.getByRole('checkbox', { name: 'Tavolo 3' }).isVisible())
  await pagina.screenshot({ path: `${SALIDA}/visor-dwg-${nombre}.png` })

  // Apagar una capa repinta el canvas sin ella.
  await capas.getByRole('checkbox', { name: 'Tavolo 3' }).uncheck()
  await pagina.waitForTimeout(200)
  const sinCapa = await pixelesPintados(pagina)
  comprobar(`${nombre}: apagar «Tavolo 3» la quita del dibujo`, sinCapa < pintadosDwg, `${pintadosDwg} → ${sinCapa}`)
  await capas.getByRole('checkbox', { name: 'Tavolo 3' }).check()

  // El DXF grande: arrastrar y acercar, midiendo los cuadros.
  await pagina.getByLabel('Plano a la vista').selectOption({ label: 'urbanizacion-grande (DXF)' })
  await pagina.waitForTimeout(600)
  const visor = pagina.getByRole('application', { name: 'Visor del plano' })
  const caja = await visor.boundingBox()
  const cx = caja.x + caja.width / 2
  const cy = caja.y + caja.height / 2
  await pagina.evaluate(() => {
    window.__cuadros = []
    let antes = performance.now()
    const medir = (t) => {
      window.__cuadros.push(t - antes)
      antes = t
      if (window.__cuadros.length < 400) requestAnimationFrame(medir)
    }
    requestAnimationFrame(medir)
  })
  await pagina.mouse.move(cx, cy)
  await pagina.mouse.down()
  for (let i = 0; i < 40; i++) await pagina.mouse.move(cx + Math.sin(i / 6) * caja.width * 0.3, cy + Math.cos(i / 6) * caja.height * 0.2)
  await pagina.mouse.up()
  for (let i = 0; i < 12; i++) await pagina.mouse.wheel(0, -120)
  await pagina.waitForTimeout(300)
  for (let i = 0; i < 12; i++) await pagina.mouse.wheel(0, 120)
  await pagina.waitForTimeout(400)
  const cuadros = await pagina.evaluate(() => window.__cuadros.slice(1))
  const ordenados = [...cuadros].sort((a, b) => a - b)
  const p95 = ordenados[Math.floor(ordenados.length * 0.95)] ?? 0
  const peor = ordenados[ordenados.length - 1] ?? 0
  comprobar(`${nombre}: arrastrar y acercar 60 000 líneas va fluido (95 % de cuadros < 50 ms)`, p95 < 50, `p95 ${p95.toFixed(1)} ms · peor ${peor.toFixed(1)} ms · ${cuadros.length} cuadros`)
  const pintadosGrande = await pixelesPintados(pagina)
  comprobar(`${nombre}: el DXF grande se ve`, pintadosGrande > 1000, `${pintadosGrande} píxeles`)
  await pagina.screenshot({ path: `${SALIDA}/visor-grande-${nombre}.png` })

  // En UTM, lo que se pone sobre el plano no tiembla: un punto puesto y
  // acercado 4000 veces sigue exactamente donde se puso.
  const viewBox = (await visor.getAttribute('viewBox')).split(/\s+/).map(Number)
  comprobar(`${nombre}: el SVG trabaja con números chicos aunque el plano esté en UTM`, viewBox.every((v) => Math.abs(v) < 1e5), viewBox.join(' '))
  await pagina.getByRole('button', { name: 'Encuadrar' }).click()
  await pagina.getByRole('group', { name: 'Herramientas del plano' }).getByRole('button', { name: 'Niveles' }).click()
  const caja2 = await visor.boundingBox()
  // En píxeles enteros: el navegador redondea la posición de la rueda, no la del toque.
  const px = Math.round(caja2.x + caja2.width * 0.43)
  const py = Math.round(caja2.y + caja2.height * 0.47)
  await pagina.mouse.click(px, py)
  const marca = visor.locator('[data-punto-nivel] circle').nth(1)
  // Al aparecer el panel la página puede reacomodarse: se acerca sobre donde quedó el punto.
  await pagina.waitForTimeout(250)
  const b0 = await marca.boundingBox()
  const cx0 = Math.round(b0.x + b0.width / 2)
  const cy0 = Math.round(b0.y + b0.height / 2)
  const desvios = []
  for (let i = 0; i < 6; i++) {
    await pagina.mouse.move(cx0, cy0)
    for (let k = 0; k < 8; k++) await pagina.mouse.wheel(0, -100)
    await pagina.waitForTimeout(250)
    const b = await marca.boundingBox()
    desvios.push(Math.hypot(b.x + b.width / 2 - cx0, b.y + b.height / 2 - cy0))
  }
  const escala = await pagina.getByText(/^Escala: /).first().innerText().catch(() => '')
  comprobar(`${nombre}: el punto puesto queda clavado en su sitio al acercar mucho (< 1.5 px)`, Math.max(...desvios) < 1.5, `desvíos ${desvios.map((d) => d.toFixed(2)).join(', ')} px · ${escala}`)
  const pintadoDeCerca = await pixelesPintados(pagina)
  comprobar(`${nombre}: de muy cerca el plano sigue pintado debajo`, pintadoDeCerca > 100, `${pintadoDeCerca} px`)

  // Pantalla completa.
  await pagina.getByRole('button', { name: 'Pantalla completa' }).click()
  await pagina.waitForTimeout(300)
  const enCompleta = await visor.boundingBox()
  comprobar(`${nombre}: en pantalla completa el plano ocupa toda la pantalla`, enCompleta.width >= ancho - 2 && enCompleta.height >= alto - 2, `${Math.round(enCompleta.width)}×${Math.round(enCompleta.height)}`)
  comprobar(`${nombre}: …con sus herramientas a mano`, await pagina.getByRole('group', { name: 'Herramientas del plano' }).isVisible())
  await pagina.screenshot({ path: `${SALIDA}/visor-completa-${nombre}.png` })
  await pagina.getByRole('button', { name: 'Salir de pantalla completa' }).click()
  await pagina.waitForTimeout(200)
  comprobar(`${nombre}: al salir vuelve a su lugar`, (await visor.boundingBox()).height < alto - 50)
  await contexto.close()
}

comprobar('sin errores en la consola', erroresConsola.length === 0, erroresConsola.slice(0, 5).join(' / '))
await navegador.close()
const fallas = resultados.filter((r) => !r.ok).length
console.log(`\n${resultados.length - fallas}/${resultados.length} comprobaciones pasaron`)
process.exit(fallas ? 1 : 0)
