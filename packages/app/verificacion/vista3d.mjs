import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

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

// 1. La rasante ya viene definida en el proyecto de ejemplo (igual que
// comprueba `rasante.mjs`): sin ella, Vista3D no dibuja nada — cae al
// mensaje "Define la rasante del proyecto...". Se confirma antes de seguir.
await pagina.getByRole('button', { name: 'Calle', exact: true }).click()
await pagina.waitForTimeout(300)
const cotaArranque = await pagina.getByLabel('Cota de arranque').inputValue()
comprobar('la calle trae su rasante ya definida, condición para que el modelo 3D levante algo',
  cotaArranque.startsWith('3244.85'), 'cota ' + cotaArranque)

// 2. Ir a Resultados.
await pagina.getByRole('button', { name: 'Resultados', exact: true }).click()
await pagina.waitForTimeout(200)

const seccionModelo = pagina.locator('section', {
  has: pagina.getByRole('heading', { name: 'Modelo 3D' }),
})
await seccionModelo.scrollIntoViewIfNeeded()

// 3. El modelo se dibuja.
const modelo = seccionModelo.getByRole('img', { name: /Modelo en volumen de la calle/ })
comprobar('el modelo 3D se dibuja', (await modelo.count()) > 0)

const carasAntes = await modelo.locator('polygon[data-cara]').count()
comprobar('el modelo dibuja al menos una cara (zona con sus cuatro esquinas medidas)',
  carasAntes > 0, `${carasAntes} caras`)

await pagina.screenshot({ path: `${SALIDA}/modelo-3d.png`, fullPage: true })

// 4. Los cinco controles del visor están montados y alcanzables desde
// Resultados — el arreglo de esta tarea: antes de montar `ControlesVista3D`
// en `VistaResultados`, cero de los cinco aparecían en pantalla.
comprobar('el interruptor Estado/Capas está montado', (await seccionModelo.getByRole('button', { name: 'Estado' }).count()) > 0)
comprobar('el botón de vista Planta está montado', (await seccionModelo.getByRole('button', { name: 'Planta' }).count()) > 0)
comprobar('el botón de vista Alzado está montado', (await seccionModelo.getByRole('button', { name: 'Alzado' }).count()) > 0)
comprobar('el botón de vista Isométrico está montado', (await seccionModelo.getByRole('button', { name: 'Isométrico' }).count()) > 0)
comprobar('el deslizador de inclinación está montado', (await seccionModelo.getByLabel('Inclinación').count()) > 0)
comprobar('el deslizador de exageración está montado', (await seccionModelo.getByLabel('Exageración').count()) > 0)

// 5. Girar arrastrando cambia el dibujo. Esto solo se puede comprobar en un
// navegador real: en un entorno simulado no hay eventos de puntero de
// verdad, así que se compara la lista de coordenadas de los polígonos antes
// y después de un arrastre real con el ratón.
const puntosAntes = await modelo.locator('polygon[data-cara]').evaluateAll((es) => es.map((e) => e.getAttribute('points')))

const caja = await modelo.boundingBox()
const centroY = caja.y + caja.height / 2
await pagina.mouse.move(caja.x + caja.width * 0.3, centroY)
await pagina.mouse.down()
await pagina.mouse.move(caja.x + caja.width * 0.8, centroY, { steps: 10 })
await pagina.mouse.up()
await pagina.waitForTimeout(200)

const puntosDespues = await modelo.locator('polygon[data-cara]').evaluateAll((es) => es.map((e) => e.getAttribute('points')))
comprobar('girar arrastrando sobre el modelo cambia el dibujo (las coordenadas de las caras cambian)',
  JSON.stringify(puntosAntes) !== JSON.stringify(puntosDespues))

await pagina.screenshot({ path: `${SALIDA}/modelo-girado.png`, fullPage: true })

// 6. El deslizador de progresiva secciona el modelo (menos caras al recortar
// el tramo) — el mismo corte vivo que ya usa el corte transversal, ahora
// también sobre el modelo en volumen. Con nada tocado todavía en esta
// página el deslizador arranca sin recorte (`seleccion.progresiva` en
// `null`, todas las caras se dibujan); un paso a la derecha fija la primera
// progresiva y activa el recorte.
// El deslizador de progresiva es COMPARTIDO: vive en el corte transversal y
// secciona tambien el modelo. No esta dentro de la seccion del modelo.
const deslizador = pagina.getByLabel('Progresiva').first()
await deslizador.focus()
await deslizador.press('ArrowRight')
await pagina.waitForTimeout(200)

const carasDespuesDelCorte = await modelo.locator('polygon[data-cara]').count()
comprobar('el deslizador de progresiva secciona el modelo 3D (menos caras al recortar el tramo)',
  carasDespuesDelCorte > 0 && carasDespuesDelCorte < carasAntes, `${carasAntes} -> ${carasDespuesDelCorte}`)

await pagina.screenshot({ path: `${SALIDA}/modelo-seccionado.png`, fullPage: true })

// 7. La exageración aparece escrita junto al modelo, no solo en el
// deslizador: el relieve real de una calle es casi plano, y sin este aviso
// alguien podría creer que la pendiente que ve es la real.
comprobar('la exageración vertical aparece escrita junto al modelo',
  (await seccionModelo.getByText(/^Alturas exageradas \d+×$/).count()) > 0)

// Cambiar el deslizador de exageración tiene que cambiar ese mismo texto: no
// es un rótulo fijo, sigue al valor real de la cámara.
await seccionModelo.getByLabel('Exageración').fill('10')
await pagina.waitForTimeout(200)
comprobar('el texto de exageración sigue al deslizador cuando se mueve',
  (await seccionModelo.getByText('Alturas exageradas 10×').count()) > 0)

// Se devuelve a 25×, la exageración con la que arranca la vista isométrica,
// para no dejar la página en un estado sorprendente si algo más corre después.
await seccionModelo.getByLabel('Exageración').fill('25')

// 8. El resumen en texto nombra la peor zona: es la única forma de
// enterarse de dónde está el problema para quien no ve el modelo o no
// distingue sus colores.
//
// Antes de comprobarlo se quita el recorte, y hay una razón: desde que el
// resumen respeta el corte vivo, cuenta SOLO las caras que el dibujo pinta.
// Con el recorte puesto en la primera progresiva, los tramos visibles del
// proyecto de ejemplo están todos dentro de tolerancia, así que el resumen
// dice —con razón— "todo dentro de tolerancia" y no nombra ninguna zona.
// El lomo de 0+040 BOR-I queda fuera del recorte.
await deslizador.focus()
for (let i = 0; i < 10; i += 1) await deslizador.press('ArrowRight')
await pagina.waitForTimeout(300)
const resumen = seccionModelo.getByText(/^El modelo dibuja \d+ tramos/)
comprobar('el resumen en texto del modelo aparece', (await resumen.count()) > 0)

const textoResumen = (await resumen.first().textContent()) ?? ''
comprobar('el resumen nombra la peor zona con su progresiva, elemento y diferencia en milímetros',
  /La mayor diferencia está en .+: [+\-−]?\d+ mm\./.test(textoResumen), textoResumen)

// 9. Devolver el deslizador de progresiva al final, para no dejar la página
// en un estado sorprendente si algo más corre después.
await deslizador.press('End')

comprobar('la app no produce errores en la consola del navegador',
  erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

await navegador.close()

const fallos = resultados.filter((r) => !r.ok)
console.log(`\nerrores de consola: ${erroresConsola.length}`)
if (erroresConsola.length) console.log(erroresConsola.slice(0, 3).join('\n'))
console.log(`=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 && erroresConsola.length === 0 ? 0 : 1)
