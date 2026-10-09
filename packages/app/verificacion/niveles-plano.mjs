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
  comprobar(`${nombre}: nada se sale de lado`, await pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  await pagina.screenshot({ path: `${SALIDA}/niveles-plano-${nombre}-2.png` })
  await panel.screenshot({ path: `${SALIDA}/niveles-plano-${nombre}-panel.png` }).catch(() => {})
  await pagina.close()
}

const errores = erroresConsola.filter((e) => !e.includes('favicon.ico'))
comprobar('sin errores en la consola', errores.length === 0, errores.join(' | '))
await navegador.close()
const fallas = resultados.filter((r) => !r.ok).length
console.log(`\n${resultados.length - fallas} de ${resultados.length} comprobaciones pasan`)
process.exit(fallas ? 1 : 0)
