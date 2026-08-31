import { chromium } from 'playwright'
import { unzipSync, strFromU8 } from 'fflate'
import { readFileSync, mkdirSync } from 'node:fs'

const BASE = 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ acceptDownloads: true })
const pagina = await contexto.newPage()

const erroresConsola = []
pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(m.text()) })
pagina.on('pageerror', (e) => erroresConsola.push('pageerror: ' + e.message))

await pagina.goto(BASE, { waitUntil: 'networkidle' })

// 1. La app arranca y muestra la navegación
comprobar('la app arranca y muestra la navegación',
  await pagina.getByRole('button', { name: 'Libreta', exact: true }).isVisible())

// 2. RIESGO ABIERTO: el foco al reordenar la sección por distancia.
// La pantalla «Plantilla» ya no existe: los puntos y sus distancias viven en
// la sección declarada de la calle, y es esa lista la que se reordena sola.
await pagina.getByRole('button', { name: 'Sección', exact: true }).click()
const distanciaVereda = pagina.getByLabel('Distancia al eje de Vereda izquierda')
await distanciaVereda.click()
await distanciaVereda.fill('')
await distanciaVereda.type('10', { delay: 40 })
// Aquí el campo cierra el cambio, y la vereda izquierda salta a ser el punto
// más a la derecha de la lista: es el momento en que el foco se puede perder.
await distanciaVereda.press('Enter')
const foco = await pagina.evaluate(() => document.activeElement?.getAttribute('aria-label'))
const valorTrasEscribir = await distanciaVereda.inputValue()
comprobar('el foco se mantiene al reordenar la sección en un navegador real',
  foco === 'Distancia al eje de Vereda izquierda', `foco en "${foco}", valor "${valorTrasEscribir}"`)

// Devolver la sección a su estado: salir del campo es lo que cierra el cambio.
await distanciaVereda.fill('-5.60')
await pagina.getByRole('button', { name: 'Proyecto', exact: true }).click()

// 3. Corregir la cota de un BM recalcula
await pagina.getByRole('button', { name: 'Resultados', exact: true }).click()
// El nombre accesible de la celda lleva el nombre completo del punto («Eje»),
// no la palabra corta de la cabecera: la sección permite la misma palabra a
// los dos lados, y dos celdas anunciadas igual no se distinguirían de oído.
const cotaAntes = await pagina.getByRole('button', { name: /^Cota en 0\+000 Eje/ }).textContent()
await pagina.getByRole('button', { name: 'Proyecto', exact: true }).click()
const campoCota = pagina.getByLabel('Cota').first()
await campoCota.fill('3245.280')
await campoCota.blur()
await pagina.getByRole('button', { name: 'Resultados', exact: true }).click()
const cotaDespues = await pagina.getByRole('button', { name: /^Cota en 0\+000 Eje/ }).textContent()
comprobar('corregir la cota del BM recalcula todo el proyecto',
  cotaAntes !== cotaDespues && cotaDespues.startsWith('3244.697'),
  `${cotaAntes} -> ${cotaDespues}`)
await pagina.getByRole('button', { name: 'Proyecto', exact: true }).click()
await pagina.getByLabel('Cota').first().fill('3245.180')
await pagina.getByLabel('Cota').first().blur()

// 4. La libreta: escribir una lectura con Enter
await pagina.getByRole('button', { name: 'Libreta', exact: true }).click()
const llenasAntes = await pagina.getByText(/llenadas \d+ de \d+/).textContent()
const campoLectura = pagina.getByLabel('Lectura de mira')
await campoLectura.click()
await campoLectura.type('2.100')
await campoLectura.press('Enter')
const llenasDespues = await pagina.getByText(/llenadas \d+ de \d+/).textContent()
comprobar('escribir una lectura y pulsar Enter la registra',
  llenasAntes !== llenasDespues, `${llenasAntes} -> ${llenasDespues}`)

// 5. La barra de cierre da el veredicto
const barra = await pagina.getByText(/PASA|FUERA DE TOLERANCIA|sin verificación|falta cerrar/).first().textContent()
comprobar('la barra de cierre da un veredicto', Boolean(barra), barra?.trim())

await pagina.screenshot({ path: `${SALIDA}/libreta.png`, fullPage: true })

// 6. El corte transversal se dibuja
const corte = pagina.getByRole('img', { name: /Corte transversal/ })
comprobar('el corte transversal se dibuja en la libreta', await corte.isVisible(),
  await corte.getAttribute('aria-label'))

// 7. El deslizador mueve la progresiva
await pagina.getByRole('button', { name: 'Resultados', exact: true }).click()
const deslizador = pagina.getByLabel('Progresiva')
await deslizador.focus()
await deslizador.press('ArrowRight')
const corteTras = await pagina.getByRole('img', { name: /Corte transversal/ }).getAttribute('aria-label')
comprobar('el deslizador mueve el corte de progresiva', /0\+0[24]0/.test(corteTras), corteTras)

// 8. Una celda sin medir se enseña como tal, y el corte no se la inventa.
//    Esto pulsaba 0+100, una progresiva que la calle traía configurada y que
//    nadie había medido, para ver el aviso de «no tiene lecturas». Ya no hay
//    forma de llegar ahí desde la tabla: se arma con las progresivas MEDIDAS,
//    así que una progresiva entera vacía no llega a salir en ella. Lo que sí
//    queda —y es lo mismo que se vigilaba: que no se enseñe un dato que no
//    existe— es la celda sin medir dentro de una progresiva que sí se midió.
const celdaSinMedir = pagina.getByRole('button', { name: /^Cota en 0\+080 Vereda derecha/ })
const etiquetaSinMedir = await celdaSinMedir.getAttribute('aria-label')
await celdaSinMedir.click()
comprobar('una celda sin medir se anuncia como sin medir, no con un número',
  /sin medir$/.test(etiquetaSinMedir ?? ''), etiquetaSinMedir)

const puntosDelCorte = await pagina
  .getByRole('img', { name: /Corte transversal/ })
  .locator('circle[role="button"]')
  .evaluateAll((es) => es.map((e) => e.getAttribute('aria-label')))
comprobar('el corte no dibuja ningún punto para la celda sin medir',
  puntosDelCorte.length > 0 && !puntosDelCorte.some((n) => n?.includes('Vereda derecha')),
  puntosDelCorte.join(' | '))

// 8b. Volver a una progresiva medida devuelve el corte
await pagina.getByRole('button', { name: /^Cota en 0\+020 Eje/ }).click()
const corteVuelta = await pagina.getByRole('img', { name: /Corte transversal/ }).getAttribute('aria-label')
comprobar('volver a una progresiva medida devuelve el corte', /0\+020/.test(corteVuelta), corteVuelta)

await pagina.screenshot({ path: `${SALIDA}/resultados.png`, fullPage: true })

// 9. RIESGO ABIERTO: exportar a Excel y validar el archivo
const descarga = await Promise.all([
  pagina.waitForEvent('download'),
  pagina.getByRole('button', { name: 'Exportar cotas a Excel' }).click(),
]).then(([d]) => d)
const rutaXlsx = `${SALIDA}/exportado.xlsx`
await descarga.saveAs(rutaXlsx)

const contenido = unzipSync(new Uint8Array(readFileSync(rutaXlsx)))
const partes = Object.keys(contenido).sort()
comprobar('el .xlsx descargado trae las cinco partes del formato',
  partes.length === 5 && partes.includes('xl/worksheets/sheet1.xml'), partes.join(', '))

const hoja = strFromU8(contenido['xl/worksheets/sheet1.xml'])
comprobar('la hoja contiene las cotas como número',
  /<c r="[A-Z]+\d+"><v>3244\.\d{3}<\/v><\/c>/.test(hoja),
  (hoja.match(/<c r="[A-Z]+2"[^>]*>.{0,40}/g) ?? []).slice(0, 3).join(' | '))

// 10. Descargar y reabrir el .topo
const descargaTopo = await Promise.all([
  pagina.waitForEvent('download'),
  pagina.getByRole('button', { name: 'Guardar' }).click(),
]).then(([d]) => d)
const rutaTopo = `${SALIDA}/proyecto.topo`
await descargaTopo.saveAs(rutaTopo)
const contenidoTopo = unzipSync(new Uint8Array(readFileSync(rutaTopo)))
const proyecto = JSON.parse(strFromU8(contenidoTopo['proyecto.json']))
// Las tomas ya no cuelgan del proyecto: cuelgan de la nivelación de su calle,
// que es lo que las agrupa desde que una calle puede tener varias.
const tomas = proyecto.calles.flatMap((calle) => calle.nivelaciones.flatMap((n) => n.tomas))
comprobar('el .topo guarda el proyecto con sus lecturas',
  tomas.length > 0 && tomas[0].estaciones[0].intermedias.length >= 2,
  `${tomas.length} tomas, ${tomas[0]?.estaciones.length} estaciones, ${proyecto.meta.nombre}`)

// 11. Modo oscuro
const botonTema = pagina.getByRole('button', { name: 'Cambiar tema' })
const temaInicial = await botonTema.textContent()
await botonTema.click()
const oscuroActivo = await pagina.evaluate(() => document.documentElement.classList.contains('dark'))
comprobar('el botón de tema activa el modo oscuro', oscuroActivo,
  `${temaInicial} -> ${await botonTema.textContent()}`)
await pagina.screenshot({ path: `${SALIDA}/oscuro.png`, fullPage: true })

// 12. Sin errores de consola
comprobar('la app no produce errores en la consola del navegador',
  erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

await navegador.close()

const fallos = resultados.filter((r) => !r.ok)
console.log(`\n=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 ? 0 : 1)
