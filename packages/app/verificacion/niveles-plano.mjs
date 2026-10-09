import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Obra › Plano › Niveles en un navegador real, sobre el plano DXF de la obra
 * simulada: se tocan cinco puntos en el plano (cuatro esquinas y un centro),
 * se escriben sus lecturas en la tabla, el plano enseña cotas y flechas y el
 * veredicto dice que el agua se empoza en el centro; marcado como sumidero,
 * toda el agua llega a él. En la laptop y en el celular.
 *
 * Uso: node verificacion/niveles-plano.mjs <carpeta-de-salida>
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })
const ESPERADO = JSON.parse(readFileSync(new URL('./datos/obra-simulada.esperado.json', import.meta.url), 'utf8'))
const TOPO = fileURLToPath(new URL(ESPERADO.archivo.rutaDesdeGuion, import.meta.url))

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

// CHROMIUM: otro ejecutable, si el que trae playwright no está instalado.
const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const erroresConsola = []

for (const [nombre, ancho, alto] of [['laptop', 1280, 800], ['celular', 390, 844]]) {
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } })
  pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(`${ancho}px: ${m.text()} ${m.location().url ?? ''}`) })
  pagina.on('pageerror', (e) => erroresConsola.push(`${ancho}px pageerror: ${e.message}`))
  await pagina.goto(BASE, { waitUntil: 'load' })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).setInputFiles(TOPO)
  await pagina.getByText(ESPERADO.nombresDeCalles[0], { exact: true }).first().waitFor({ timeout: 10000 })
  await pagina.getByRole('navigation', { name: 'Pantallas de la obra' }).getByRole('button', { name: 'Plano' }).click()
  await pagina.getByLabel('Plano a la vista').selectOption({ label: 'expediente-pistas.dxf (DXF)' })
  await pagina.getByRole('group', { name: 'Herramientas del plano' }).getByRole('button', { name: 'Niveles' }).click()

  const visor = pagina.getByRole('application', { name: 'Visor del plano' })
  await visor.waitFor()
  const caja = await visor.boundingBox()
  const cx = caja.x + caja.width / 2
  const cy = caja.y + caja.height / 2
  const d = Math.min(caja.width, caja.height) / 5
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) await pagina.mouse.click(cx + dx * d, cy + dy * d)

  const panel = pagina.getByRole('region', { name: 'Niveles del plano' })
  comprobar(`${nombre}: se pusieron los 5 puntos`, (await panel.getByRole('table', { name: 'Lecturas de los puntos' }).locator('tbody tr').count()) === 5)
  // La puesta se creó sola al poner el primer punto: BM-1 de la obra (3245.180) + 1.500, del proyecto.
  comprobar(`${nombre}: la puesta es del proyecto, sobre el BM-1`, await panel.getByRole('button', { name: 'Puesta 1 · AI 3246.680' }).isVisible())
  for (const [i, l] of ['1.2', '1.25', '1.3', '1.35', '1.4'].entries()) await panel.getByLabel(`Lectura del punto ${i + 1}`).fill(l)
  const veredicto = await panel.getByRole('status').innerText()
  comprobar(`${nombre}: dice que el agua se empoza en el 5`, /se empoza en 5/.test(veredicto), veredicto)
  comprobar(`${nombre}: el plano rotula la cota del 5`, await visor.getByText('3245.280').isVisible())
  comprobar(`${nombre}: el plano dibuja las flechas del agua`, (await visor.locator('g[transform*="rotate"] path').count()) >= 4)
  await pagina.screenshot({ path: `${SALIDA}/niveles-plano-${nombre}-1.png` })

  await panel.getByRole('table', { name: 'Lecturas de los puntos' }).getByRole('button', { name: '5', exact: true }).click()
  await panel.getByRole('checkbox', { name: /Es una salida del agua/ }).check()
  const conSumidero = await panel.getByRole('status').innerText()
  comprobar(`${nombre}: con el 5 de sumidero, toda el agua llega a una salida`, /Toda el agua llega a una salida/.test(conSumidero), conSumidero)
  // Una etiqueta fija en el plano junto al punto elegido (el 5).
  await panel.getByLabel('Etiqueta del punto elegido').fill('Buzón Lima / Sol')
  comprobar(`${nombre}: la etiqueta queda en el plano`, await visor.getByText('Buzón Lima / Sol').isVisible())
  comprobar(`${nombre}: …y en la tabla de lecturas`, await panel.getByRole('table', { name: 'Lecturas de los puntos' }).getByText('Buzón Lima / Sol').isVisible())

  // El modelo 3D del agua.
  await pagina.getByRole('button', { name: 'Ver el modelo 3D del agua' }).click()
  const modelo = pagina.getByRole('img', { name: /^Modelo 3D de 5 puntos/ })
  await modelo.scrollIntoViewIfNeeded()
  const etiquetaModelo = await modelo.getAttribute('aria-label')
  comprobar(`${nombre}: el modelo 3D dice que toda el agua llega a la salida`, /el agua de 5 llega a una salida/.test(etiquetaModelo), etiquetaModelo)
  comprobar(`${nombre}: el modelo 3D tiene sus 4 caras y el camino del agua de las 4 esquinas`,
    (await modelo.locator('polygon[data-cara]').count()) === 4 && (await modelo.locator('polyline.camino-agua').count()) === 4)
  comprobar(`${nombre}: el modelo 3D rotula la etiqueta`, await modelo.getByText(/5 ▼ · Buzón Lima \/ Sol/).isVisible())
  const cajaModelo = await modelo.boundingBox()
  const antesGiro = await modelo.locator('polygon[data-cara]').first().getAttribute('points')
  await pagina.mouse.move(cajaModelo.x + cajaModelo.width / 2, cajaModelo.y + cajaModelo.height / 2)
  await pagina.mouse.down()
  await pagina.mouse.move(cajaModelo.x + cajaModelo.width / 2 + 80, cajaModelo.y + cajaModelo.height / 2 + 20, { steps: 5 })
  await pagina.mouse.up()
  comprobar(`${nombre}: el modelo 3D gira al arrastrar`, (await modelo.locator('polygon[data-cara]').first().getAttribute('points')) !== antesGiro)
  await modelo.screenshot({ path: `${SALIDA}/niveles-plano-${nombre}-modelo3d.png` })

  // Lo medido en la libreta de las calles de este plano entra sin escribirlo otra vez.
  const sumar = panel.getByLabel('Sumar lo medido en las calles de este plano')
  if (await sumar.count()) {
    const opciones = await sumar.locator('option').allInnerTexts()
    await sumar.selectOption({ label: opciones.find((o) => /SUBRASANTE/.test(o)) ?? opciones[1] })
    const nota = await panel.getByText(/puntos de la libreta/).innerText()
    comprobar(`${nombre}: se puede sumar lo medido de las calles del plano (Las Lomas aún sin mediciones: el caso con puntos lo prueba enPlano.test)`, /^\d+ puntos de la libreta/.test(nota), nota)
    await pagina.screenshot({ path: `${SALIDA}/niveles-plano-${nombre}-medido.png` })
  } else comprobar(`${nombre}: el plano tiene pistas enlazadas a calles`, false)
  comprobar(`${nombre}: nada se sale de lado`, await pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  await pagina.screenshot({ path: `${SALIDA}/niveles-plano-${nombre}-2.png` })
  await panel.screenshot({ path: `${SALIDA}/niveles-plano-${nombre}-panel.png` }).catch(() => {})
  await pagina.close()
}

// En Android el selector deja en gris lo que no conoce (.dwg, .topo): allí no se filtra por tipo.
{
  const android = await navegador.newPage({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  })
  await android.goto(BASE, { waitUntil: 'load' })
  const abrir = android.locator(ESPERADO.archivo.selectorAbrir)
  comprobar('android: «Abrir» deja elegir el .topo (sin filtro de tipo)', (await abrir.getAttribute('accept')) === null)
  await abrir.setInputFiles(TOPO)
  await android.getByText(ESPERADO.nombresDeCalles[0], { exact: true }).first().waitFor({ timeout: 10000 })
  await android.getByRole('navigation', { name: 'Pantallas de la obra' }).getByRole('button', { name: 'Plano' }).click()
  const importar = android.getByLabel('Importar planos (DWG, DXF o PDF)')
  comprobar('android: «Importar planos» deja elegir los DWG (sin filtro de tipo)', (await importar.getAttribute('accept')) === null)
  await android.close()
}

const errores = erroresConsola.filter((e) => !e.includes('favicon.ico'))
comprobar('sin errores en la consola', errores.length === 0, errores.join(' | '))
await navegador.close()
const fallas = resultados.filter((r) => !r.ok).length
console.log(`\n${resultados.length - fallas} de ${resultados.length} comprobaciones pasan`)
process.exit(fallas ? 1 : 0)
