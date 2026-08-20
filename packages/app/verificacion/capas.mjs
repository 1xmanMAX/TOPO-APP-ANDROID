import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'

const BASE = 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

const navegador = await chromium.launch()
const pagina = await navegador.newPage()

const erroresConsola = []
pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(m.text()) })
pagina.on('pageerror', (e) => erroresConsola.push('pageerror: ' + e.message))

await pagina.goto(BASE, { waitUntil: 'networkidle' })

// 1. Registrar una segunda campaña sobre la misma calle, en la capa de abajo.
// Al crearla, la app salta sola a la libreta, así que se vuelve para contar.
await pagina.getByRole('button', { name: 'Campañas' }).click()
await pagina.getByRole('button', { name: /nueva campaña/i }).click()
await pagina.getByRole('button', { name: 'Campañas' }).click()
comprobar('se puede registrar una segunda campaña sobre la misma calle',
  (await pagina.getByRole('button', { name: /Abrir campaña del/ }).count()) >= 2)

// 2. La libreta nueva nace con su estación, pero sin la visada al banco de
// nivel no hay altura de aparato y por tanto ninguna cota. Se escribe primero.
await pagina.getByRole('button', { name: 'Libreta' }).click()
comprobar('la libreta nueva avisa de que falta la vista atrás',
  await pagina.getByText(/Falta la lectura de vista atrás/).isVisible())

const vistaAtras = pagina.getByLabel(/Vista atrás|^Lectura de BM$/).first()
await vistaAtras.fill('1.425')
await vistaAtras.blur()

// 3. Ahora sí, una lectura en la misma celda que midió la campaña anterior.
// En la libreta la celda pertenece al mapa de grilla, que conserva su nombre
// corto: ahí la celda muestra si está medida o no, no una cifra.
await pagina.getByRole('button', { name: '0+000 EJE', exact: true }).first().click()
const campo = pagina.getByLabel('Lectura de mira')
await campo.click()
await campo.type('2.230', { delay: 20 })
await campo.press('Enter')

const llenas = await pagina.getByText(/llenadas \d+ de \d+/).textContent()
comprobar('con la vista atrás escrita, la lectura produce cota',
  /llenadas 1 de/.test(llenas), llenas?.trim())

// Una segunda celda de la misma progresiva, también medida por la campaña
// anterior: hacen falta dos puntos en común para que haya área que rellenar.
await pagina.getByRole('button', { name: '0+000 BOR-I', exact: true }).first().click()
await campo.click()
await campo.type('2.290', { delay: 20 })
await campo.press('Enter')

const llenasDos = await pagina.getByText(/llenadas \d+ de \d+/).textContent()
comprobar('la segunda celda también se registra', /llenadas 2 de/.test(llenasDos), llenasDos?.trim())

// 3. Elegir las dos capas a comparar en la pantalla de resultados.
await pagina.getByRole('button', { name: 'Resultados' }).click()
await pagina.screenshot({ path: `${SALIDA}/antes-de-comparar.png`, fullPage: true })

const desplegables = pagina.locator('select')
const cuantos = await desplegables.count()
comprobar('el selector de capas está en la pantalla de resultados', cuantos >= 2,
  `${cuantos} desplegables`)

const selectorAbajo = pagina.getByLabel(/capa de abajo|inferior/i).first()
const opcionesAbajo = await selectorAbajo.locator('option').allTextContents().catch(() => [])
comprobar('el selector ofrece las campañas de la calle', opcionesAbajo.length >= 2,
  opcionesAbajo.join(' | '))

// 4. Comparar las dos capas y comprobar que sale el espesor colocado.
// Abajo el terreno (campaña nueva), arriba la subrasante (campaña del ejemplo).
const valores = await selectorAbajo.locator('option').evaluateAll((os) => os.map((o) => o.value))
const idTerreno = valores.find((_, i) => /TERRENO/.test(opcionesAbajo[i] ?? ''))
const selectorArriba = pagina.getByLabel(/capa de arriba|superior/i).first()
const opcionesArriba = await selectorArriba.locator('option').allTextContents()
const valoresArriba = await selectorArriba.locator('option').evaluateAll((os) => os.map((o) => o.value))
const idSubrasante = valoresArriba.find((_, i) => /SUBRASANTE/.test(opcionesArriba[i] ?? ''))

await selectorAbajo.selectOption(idTerreno)
await selectorArriba.selectOption(idSubrasante)
await pagina.waitForTimeout(200)

// Cota del terreno en 0+000 EJE: 3245.180 + 1.425 − 2.230 = 3244.375
// Cota de la subrasante ahí: 3244.628 → espesor ≈ 0.253 m
const espesor = await pagina.getByText(/^0\.2\d{2}$/).first().textContent().catch(() => null)
comprobar('la tabla muestra el espesor colocado entre las dos capas',
  espesor !== null, `espesor mostrado: ${espesor}`)

const resumen = await pagina.getByText(/mínimo|comparables/i).first().textContent().catch(() => null)
comprobar('el resumen dice cuántas celdas son comparables', resumen !== null, resumen?.trim())

await pagina.screenshot({ path: `${SALIDA}/espesores.png`, fullPage: true })

// 5. Dibujar las dos capas superpuestas en el corte.
const casillas = pagina.getByRole('checkbox')
const cuantasCasillas = await casillas.count()
for (let i = 0; i < cuantasCasillas; i += 1) {
  const casilla = casillas.nth(i)
  const nombre = await casilla.getAttribute('aria-label')
  if (nombre && /TERRENO|SUBRASANTE/.test(nombre)) await casilla.check()
}
await pagina.waitForTimeout(200)

const trazos = await pagina.locator('polyline').count()
comprobar('el corte dibuja un trazo por cada capa visible', trazos >= 2, `${trazos} trazos`)

const rellenos = await pagina.locator('polygon, path[fill]:not([fill="none"])').count()
comprobar('hay relleno entre las capas', rellenos >= 1, `${rellenos} rellenos`)

await pagina.screenshot({ path: `${SALIDA}/capas-apiladas.png`, fullPage: true })

// 6. Descargar el Excel de espesores y comprobar qué dice de verdad.
const botonEspesores = pagina.getByRole('button', { name: /espesores a Excel/i })
const descarga = await Promise.all([
  pagina.waitForEvent('download'),
  botonEspesores.click(),
]).then(([d]) => d)

const ruta = `${SALIDA}/espesores.xlsx`
await descarga.saveAs(ruta)

const contenido = unzipSync(new Uint8Array(readFileSync(ruta)))
const hoja = strFromU8(contenido['xl/worksheets/sheet1.xml'])

comprobar('el Excel de espesores nombra las dos capas comparadas',
  /TERRENO EXISTENTE/.test(hoja) && /SUBRASANTE/.test(hoja))

// La campaña del terreno no cierra contra ningún banco de nivel, así que sus
// cotas no están comprobadas — y un espesor calculado sobre ellas, tampoco.
comprobar('el Excel avisa de que los espesores no están comprobados',
  /NO COMPROBADOS/.test(hoja),
  (hoja.match(/<t>[^<]*COMPROBAD[^<]*<\/t>/g) ?? []).join(' | ').slice(0, 160))

comprobar('el Excel lleva los espesores como número',
  /<c r="[A-Z]+\d+"><v>0\.2\d{2}<\/v><\/c>/.test(hoja),
  (hoja.match(/<v>0\.2\d{2}<\/v>/g) ?? []).join(' '))

// La progresiva 0+020 solo la midió la campaña de subrasante (la del
// ejemplo): la campaña nueva de terreno no pasó de 0+000. Esa fila tiene que
// salir vacía en el archivo real, no en 0.000 — un cero ahí diría que no se
// colocó material, cuando lo que pasa es que no hay con qué compararla.
const filaVeinte = (hoja.match(/<row r="\d+">[^]*?0\+020[^]*?<\/row>/) ?? [''])[0]
comprobar('la progresiva sin pareja en la otra capa sale vacía en el Excel, no en cero',
  filaVeinte !== '' && !/<v>/.test(filaVeinte),
  filaVeinte)

await navegador.close()

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
if (erroresConsola.length) console.log(erroresConsola.slice(0, 3).join('\n'))
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 && erroresConsola.length === 0 ? 0 : 1)
