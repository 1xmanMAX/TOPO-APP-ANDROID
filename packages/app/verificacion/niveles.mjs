import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Niveles de la capa siguiente (la herramienta «Pistas y veredas» de Max)
 * sobre la obra simulada, en un navegador real: Calle › Replantear › Desde
 * una capa medida y Calle › Niveles con lo medido enlazado, en la laptop y en el
 * celular. Comprueba que se dibuja, que el deslizador mueve la fila, que el
 * escáner lee la separación y que nada se sale de la pantalla del celular.
 *
 * Uso: node verificacion/niveles.mjs <carpeta-de-salida>
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

async function abrirObra(ancho, alto) {
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } })
  pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(`${ancho}px: ${m.text()} ${m.location().url ?? ''}`) })
  pagina.on('pageerror', (e) => erroresConsola.push(`${ancho}px pageerror: ${e.message}`))
  await pagina.goto(BASE, { waitUntil: 'load' })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).waitFor({ state: 'attached', timeout: 30000 })
  await pagina.locator(ESPERADO.archivo.selectorAbrir).setInputFiles(TOPO)
  await pagina.getByText(ESPERADO.nombresDeCalles[0], { exact: true }).first().waitFor({ timeout: 10000 })
  await pagina.getByRole('navigation', { name: 'Espacios' }).getByRole('button', { name: 'Calle', exact: true }).click()
  return pagina
}

/** Nada más ancho que la pantalla: en el celular no se desplaza de lado. */
async function sinDesbordeLateral(pagina) {
  return pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

for (const [nombre, ancho, alto] of [['laptop', 1280, 800], ['celular', 390, 844]]) {
  const pagina = await abrirObra(ancho, alto)

  // ---- Replantear › Desde una capa medida ----
  await pagina.getByRole('navigation', { name: 'Modos de la calle' }).getByRole('button', { name: 'Replantear' }).click()
  await pagina.getByRole('button', { name: 'Desde una capa medida' }).click()
  const titulo = pagina.getByText(/^BASE = SUBRASANTE \+ 0\.200 m$/)
  await titulo.waitFor({ timeout: 10000 })
  comprobar(`${nombre}: Replantear desde la subrasante da la base + 0.200 m`, await titulo.isVisible())

  const nivel = pagina.getByRole('region', { name: 'Nivel a registrar' })
  const grafico = pagina.getByRole('img', { name: /Perfil de SUBRASANTE medida y BASE a dar/ })
  comprobar(`${nombre}: se dibuja el perfil de la capa medida y la que se va a dar`, await grafico.isVisible())
  const antes = await nivel.innerText()
  const deslizador = pagina.getByRole('slider', { name: 'Progresiva' })
  await deslizador.focus()
  await pagina.keyboard.press('ArrowRight')
  await pagina.keyboard.press('ArrowRight')
  const despues = await nivel.innerText()
  comprobar(`${nombre}: el deslizador cambia la progresiva`, antes !== despues, despues.split('\n').slice(0, 2).join(' '))
  comprobar(`${nombre}: «La mira debe marcar» con un número`, /La mira debe marcar\s+\d+\.\d{3}/.test(despues))
  comprobar(`${nombre}: Replantear no se sale de lado`, await sinDesbordeLateral(pagina))
  await pagina.screenshot({ path: `${SALIDA}/niveles-replantear-${nombre}.png`, fullPage: true })

  // La hoja de estacas baja como PDF.
  const [descarga] = await Promise.all([
    pagina.waitForEvent('download', { timeout: 10000 }),
    pagina.getByRole('button', { name: 'Hoja de estacas' }).click(),
  ])
  comprobar(`${nombre}: la hoja de estacas baja en PDF`, descarga.suggestedFilename().endsWith('.pdf'), descarga.suggestedFilename())

  // ---- Calle › Niveles, desde el botón de Replantear, con lo medido enlazado ----
  await pagina.getByRole('button', { name: 'Comprobar separación' }).click()
  await pagina.getByRole('heading', { name: 'Niveles' }).waitFor({ timeout: 10000 })
  comprobar(`${nombre}: «Comprobar separación» abre Calle › Niveles`, true)
  const conjuntos = pagina.getByRole('region', { name: 'Conjuntos de datos' })
  for (const capa of ['BASE', 'SUBRASANTE']) {
    await conjuntos.getByRole('button', { name: 'Traer de lo medido' }).click()
    await conjuntos.getByLabel('Capa medida').selectOption({ label: capa })
    await conjuntos.getByLabel('Punto de la sección').selectOption({ label: 'Borde izquierdo' })
    await conjuntos.getByRole('button', { name: /^Enlazar \d+ puntos de la libreta$/ }).click()
  }
  const izquierdo = pagina.getByRole('region', { name: 'Lado izquierdo' })
  const veredicto = await izquierdo.getByRole('status').innerText()
  comprobar(`${nombre}: base sobre subrasante enlazadas dan la separación mínima`, /CUMPLE.*separación mínima \d+\.\d cm/s.test(veredicto), veredicto.replace(/\n/g, ' '))
  const lectura = izquierdo.locator('[aria-live=polite]')
  const antesEscaner = await lectura.innerText()
  await izquierdo.getByRole('slider').focus()
  await pagina.keyboard.press('End')
  comprobar(`${nombre}: el escáner lee otra progresiva`, antesEscaner !== (await lectura.innerText()), (await lectura.innerText()).replace(/\n/g, ' '))
  comprobar(`${nombre}: Niveles no se sale de lado`, await sinDesbordeLateral(pagina))
  await pagina.screenshot({ path: `${SALIDA}/niveles-separacion-${nombre}.png`, fullPage: true })
  await pagina.close()
}

// El navegador pide favicon.ico por su cuenta y la app no tiene: no es un error suyo.
const errores = erroresConsola.filter((e) => !e.includes('favicon.ico'))
comprobar('sin errores en la consola', errores.length === 0, errores.join(' | '))
await navegador.close()

const fallas = resultados.filter((r) => !r.ok).length
console.log(`\n${resultados.length - fallas} de ${resultados.length} comprobaciones pasan`)
process.exit(fallas ? 1 : 0)
