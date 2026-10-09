import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * Calle › Niveles (la hoja «Pistas y veredas» de Max) en un navegador real,
 * con el flujo de campo entero: una puesta, dos conjuntos escritos a mano
 * (vereda y base), la separación entre ellos, un replanteo 2 cm por debajo de
 * la vereda con su corte y relleno, y la lectura de mira en una progresiva.
 * Después se guarda el .topo, se abre en otra página y la hoja tiene que
 * seguir ahí. En la laptop y en dos celulares (390 y 360 px): nada se sale
 * de lado y las cuatro pestañas de la calle caben.
 *
 * Uso: node verificacion/hoja-niveles.mjs <carpeta-de-salida>
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

// CHROMIUM: otro ejecutable, si el que trae playwright no está instalado.
const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const erroresConsola = []

async function abrir(ancho, alto) {
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } })
  pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(`${ancho}px: ${m.text()} ${m.location().url ?? ''}`) })
  pagina.on('pageerror', (e) => erroresConsola.push(`${ancho}px pageerror: ${e.message}`))
  await pagina.goto(BASE, { waitUntil: 'load' })
  await pagina.getByRole('navigation', { name: 'Espacios' }).getByRole('button', { name: 'Calle', exact: true }).click()
  await pagina.getByRole('navigation', { name: 'Pantallas de la calle' }).getByRole('button', { name: 'Niveles', exact: true }).click()
  await pagina.getByRole('heading', { name: 'Niveles' }).waitFor({ timeout: 10000 })
  return pagina
}

const sinDesborde = (pagina) => pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

async function agregar(pagina, nombre, categoria, datos) {
  const conjuntos = pagina.getByRole('region', { name: 'Conjuntos de datos' })
  await conjuntos.getByRole('button', { name: '+ Agregar conjunto' }).click()
  await conjuntos.getByLabel('Nombre', { exact: true }).fill(nombre)
  await conjuntos.getByLabel('Categoría').fill(categoria)
  await conjuntos.getByLabel(/Datos de .*: progresiva, valor/).fill(datos)
}

for (const [nombre, ancho, alto] of [['laptop', 1280, 800], ['celular', 390, 844], ['celular360', 360, 740]]) {
  const pagina = await abrir(ancho, alto)
  comprobar(`${nombre}: la pestaña Niveles abre la hoja`, await pagina.getByRole('region', { name: 'Puestas del nivel' }).isVisible())
  const pestanas = pagina.getByRole('navigation', { name: 'Pantallas de la calle' })
  comprobar(`${nombre}: las pestañas de la calle caben`, await pestanas.evaluate((el) => [...el.querySelectorAll('button')].every((b) => b.scrollWidth <= b.clientWidth + 1)))

  // La puesta del ejemplo de su HTML: BM 100, atrás 1.5.
  const puestas = pagina.getByRole('region', { name: 'Puestas del nivel' })
  // Las puestas son del proyecto: se crea una vez y la usan las otras pantallas.
  await puestas.getByRole('button', { name: '+ Nueva puesta' }).click()
  await puestas.getByRole('button', { name: 'Cota escrita' }).click()
  await puestas.getByLabel('Cota BM (m)').fill('100')
  await puestas.getByLabel('Lectura atrás (m)').fill('1.5')
  await puestas.getByLabel('Lectura atrás (m)').blur()

  await agregar(pagina, 'Vereda izquierda', 'Vereda', '0, 1.250\n10, 1.260\n20, 1.275\n30, 1.290\n40, 1.300')
  await agregar(pagina, 'Base izquierda', 'Base', '0, 1.450\n10, 1.455\n20, 1.470\n30, 1.480\n40, 1.490')
  const izquierdo = pagina.getByRole('region', { name: 'Lado izquierdo' })
  const veredicto = await izquierdo.getByRole('status').innerText()
  comprobar(`${nombre}: separación como en su HTML (19.0 cm en 0+030)`, /CUMPLE.*19\.0 cm.*0\+030/s.test(veredicto), veredicto.replace(/\n/g, ' '))
  comprobar(`${nombre}: se dibuja la gráfica con pendientes`, (await izquierdo.locator('svg text', { hasText: '%' }).count()) > 0)
  await pagina.screenshot({ path: `${SALIDA}/hoja-${nombre}-1.png`, fullPage: true })

  // Replanteo 2 cm por debajo de la vereda, y corte y relleno.
  const conjuntos = pagina.getByRole('region', { name: 'Conjuntos de datos' })
  await conjuntos.getByRole('button', { name: '+ Nuevo replanteo' }).click()
  await conjuntos.getByLabel('Copiar de').selectOption({ label: 'Vereda izquierda' })
  await conjuntos.getByLabel('Subir (+) o bajar (−), cm').fill('-2')
  await conjuntos.getByLabel('Subir (+) o bajar (−), cm').blur()
  await conjuntos.getByRole('button', { name: 'Crear el replanteo' }).click()
  await izquierdo.getByRole('button', { name: 'Corte y relleno' }).click()
  await izquierdo.getByRole('combobox', { name: 'Lo que hay' }).selectOption({ label: 'Vereda izquierda (Vereda)' })
  const cr = await izquierdo.getByRole('status').innerText()
  comprobar(`${nombre}: corte y relleno contra el replanteo`, /Mayor corte: 2\.0 cm/.test(cr), cr.replace(/\n/g, ' '))

  const registrar = pagina.getByRole('region', { name: 'Nivel a registrar' })
  await registrar.getByLabel('Progresiva(s)').fill('10, 20, 30')
  const lectura = await registrar.getByRole('status', { name: 'Lectura a registrar' }).innerText()
  comprobar(`${nombre}: la mira debe marcar 1.280 en la 0+010 del replanteo`, /0\+010[\s\S]*100\.220[\s\S]*1\.280/.test(lectura), lectura.replace(/\n/g, ' '))
  comprobar(`${nombre}: nada se sale de lado`, await sinDesborde(pagina))
  await registrar.scrollIntoViewIfNeeded()
  await pagina.screenshot({ path: `${SALIDA}/hoja-${nombre}-2.png`, fullPage: true })

  if (nombre === 'laptop') {
    // Guardar el .topo y abrirlo en otra página: la hoja viaja con la calle.
    await pagina.getByRole('button', { name: 'Archivo', exact: true }).click()
    const grupo = pagina.getByRole('group', { name: 'Archivo del proyecto' })
    const [descarga] = await Promise.all([pagina.waitForEvent('download'), grupo.getByRole('button', { name: 'Guardar', exact: true }).click()])
    const ruta = `${SALIDA}/hoja-niveles.topo`
    await descarga.saveAs(ruta)
    const otra = await abrir(1280, 800)
    await otra.locator('input[type="file"][aria-label="Abrir archivo .topo"]').setInputFiles(ruta)
    await otra.getByRole('navigation', { name: 'Espacios' }).getByRole('button', { name: 'Calle', exact: true }).click()
    await otra.getByRole('navigation', { name: 'Pantallas de la calle' }).getByRole('button', { name: 'Niveles', exact: true }).click()
    const chips = await otra.getByRole('group', { name: 'Conjuntos' }).innerText().catch(() => '')
    comprobar('al abrir el .topo guardado, los tres conjuntos siguen ahí', /Vereda izquierda[\s\S]*Base izquierda[\s\S]*Replanteo de Vereda izquierda/.test(chips), chips.replace(/\n/g, ' | '))
    await otra.close()
  }
  await pagina.close()
}

const errores = erroresConsola.filter((e) => !e.includes('favicon.ico'))
comprobar('sin errores en la consola', errores.length === 0, errores.join(' | '))
await navegador.close()
const fallas = resultados.filter((r) => !r.ok).length
console.log(`\n${resultados.length - fallas} de ${resultados.length} comprobaciones pasan`)
process.exit(fallas ? 1 : 0)
