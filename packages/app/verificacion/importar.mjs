import { chromium } from 'playwright'
import { unzipSync, strFromU8 } from 'fflate'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })

/**
 * El archivo real que mandó Max, el mismo que usan las pruebas. Se resuelve
 * desde este archivo y no desde donde se lance el comando: así el guion se
 * puede correr con `node packages/app/verificacion/importar.mjs` o desde
 * dentro de `packages/app` y encuentra la muestra igual.
 */
const MUESTRA = fileURLToPath(new URL('../src/pruebas/muestras/detras-del-colegio.xlsx', import.meta.url))

const CALLE = 'detras-del-colegio'

/**
 * La misma hoja, celda por celda, tal como llegaría por el portapapeles:
 * texto separado por tabuladores, una línea por fila. Los valores son los que
 * el .xlsx guarda de verdad (`2.0`, `0.1`), no los que Google Sheets enseña
 * formateados, para que las dos entradas sean comparables valor a valor.
 *
 * La primera celda de cada fila va vacía porque en la hoja de Max la tabla
 * empieza en la columna B. Las ocho filas de un solo `0` son el arrastre de
 * la fórmula `C−G` de las filas 12 a 19: no son puntos medidos y la app tiene
 * que dejarlas fuera por los dos caminos igual.
 */
const FILAS_PEGADAS = [
  ['', 'PC', '1.45'],
  ['', '', '', '', '2.11'],
  ['', '', 'vereda ', 'IZQ', 'EJE', 'DER', 'vereda '],
  ['', '6', '2.12', '2.24', '2.27', '2.12', '1.93'],
  ['', '10', '2.07', '2.17', '2.14', '2.15', '1.84'],
  ['', '20', '1.88', '2.135', '2.07', '2.02', '1.755', '0.125'],
  ['', '30', '1.82', '2.105', '2.035', '2.0', '1.675', '0.145'],
  ['', '40', '1.67', '1.935', '1.92', '1.935', '1.65', '0.02'],
  ['', '50', '1.67', '1.78', '1.75', '1.76', '1.57', '0.1'],
  ['', '60', '1.56', '1.52', '1.49', '1.38', '1.42', '0.14'],
  ['', '', '', '', '', '', '', '0'],
  ['', '', '', '', '', '', '', '0'],
  ['', '', '', '', '', '', '', '0'],
  ['', '', '', '', '', '', '', '0'],
  ['', '', '', '', '', '', '', '0'],
  ['', '', '', '', '', '', '', '0'],
  ['', '', '', '', '', '', '', '0'],
  ['', '', '', '', '', '', '', '0'],
  ['', 'existente ', 'cuneta ', '2.185', '', '1.955', '0.23'],
  ['', 'existente ', 'calzada ', '2.41', '', '2.06'],
]
const PEGADO = FILAS_PEGADAS.map((fila) => fila.join('\t')).join('\n')

const resultados = []
function comprobar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`)
}

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } })
const pagina = await contexto.newPage()

const erroresConsola = []
pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(m.text()) })
pagina.on('pageerror', (e) => erroresConsola.push('pageerror: ' + e.message))

// Con el servidor de desarrollo, 'networkidle' no llega nunca: se espera a 'load'.
await pagina.goto(BASE, { waitUntil: 'load', timeout: 120000 })

// Atajos de la pantalla, para no repetir el selector en cada paso.
const campoCalle = pagina.getByRole('combobox', { name: /a qué calle/i })
const botonImportar = pagina.getByRole('button', { name: /^Importar la hoja$/ })
// Lo que se lee de la hoja, solo dentro de la zona de subir: el resto de
// Obra › Calles también habla de lecturas y progresivas de otras calles.
const zonaSubir = pagina.getByTestId('zona-subir-hoja')

// Atajos de la navegación de la ola 2.
const espacios = pagina.getByRole('navigation', { name: 'Espacios' })
async function irA(espacio) {
  await espacios.getByRole('button', { name: espacio, exact: true }).click()
}
async function irAObraCalles() {
  await irA('Obra')
  await pagina.getByRole('navigation', { name: 'Pantallas de la obra' }).getByRole('button', { name: 'Calles', exact: true }).click()
}
async function abrirApartado(nombre) {
  const boton = pagina.getByRole('button', { name: nombre, exact: true })
  if ((await boton.getAttribute('aria-expanded')) !== 'true') await boton.click()
}

// ---------------------------------------------------------------------------
// 1. Subir el archivo real de Max: Obra › Calles, apartado «Subir una hoja
//    de campo» del panel de la calle (viene plegado y se abre).
// ---------------------------------------------------------------------------

await irAObraCalles()
await abrirApartado('Subir una hoja de campo')
comprobar('el apartado de subir datos se abre en Obra › Calles',
  await pagina.getByRole('heading', { name: 'Subir datos' }).isVisible())

await pagina.getByLabel(/archivo de la hoja/i).setInputFiles(MUESTRA)
await pagina.getByRole('heading', { name: /Qué columna cayó en qué punto/ }).waitFor()

comprobar('propone el nombre del archivo como nombre de calle',
  (await campoCalle.inputValue()) === CALLE, await campoCalle.inputValue())

const cuentas = await pagina.getByText(/\d+ progresivas/).first().textContent()
comprobar('la vista previa cuenta 7 progresivas', /7 progresivas/.test(cuentas ?? ''), cuentas?.trim())

const textoPrevia = await zonaSubir.innerText()
comprobar('saca la vista atrás 1.45 del preámbulo, sin cabecera que la nombre',
  /Vista atrás al punto de control:\s*1\.450/.test(textoPrevia),
  (textoPrevia.match(/Vista atrás al punto de control:[^\n]*/) ?? [''])[0])
comprobar('encuentra la columna de progresivas aunque no tenga título',
  /progresivas salen de la columna B/.test(textoPrevia),
  (textoPrevia.match(/progresivas salen de la columna[^\n]*/) ?? [''])[0])

// ---------------------------------------------------------------------------
// 2. Lo que no entendió se enseña con su contenido, y bloquea si trae medidas
// ---------------------------------------------------------------------------

const noImportado = await pagina.getByRole('list', { name: /no import/i })
  .locator('[data-valor]')
  .evaluateAll((es) => es.map((e) => e.getAttribute('data-valor')))
comprobar('enseña lo que no importó, con su contenido',
  noImportado.includes('2.11') && noImportado.includes('0.125') && noImportado.includes('0'),
  noImportado.join(' · '))

comprobar('no deja importar mientras IZQ y DER sigan sin colocar',
  await botonImportar.isDisabled(),
  (textoPrevia.match(/Hay \d+ columnas? sin colocar[^\n]*/) ?? [''])[0])

await pagina.screenshot({ path: `${SALIDA}/antes-de-colocar.png`, fullPage: true })

// ---------------------------------------------------------------------------
// 3. Colocar IZQ y DER, que son etiquetas de lado y no van de fábrica
// ---------------------------------------------------------------------------

await pagina.getByLabel(/Dónde va la columna IZQ/i).selectOption('p-borde-i')
await pagina.getByLabel(/Dónde va la columna DER/i).selectOption('p-borde-d')
await pagina.waitForTimeout(200)

const trasColocar = await zonaSubir.innerText()
comprobar('con las dos columnas colocadas salen 35 lecturas',
  /35 lecturas/.test(trasColocar), (trasColocar.match(/\d+ lecturas/) ?? [''])[0])

const referencias = await pagina.getByRole('list', { name: /referencias/i }).getByRole('listitem').count()
comprobar('encuentra 3 referencias, no 4: la cuneta derecha queda sin resolver',
  referencias === 3, `${referencias} referencias`)

comprobar('la app no elige entre dos lecturas del mismo lado: lo dice y espera',
  /2 lecturas en el lado derecho/.test(trasColocar),
  (trasColocar.match(/En la fila de[^\n]*/) ?? [''])[0])

comprobar('avisa de que las distancias son las de fábrica',
  /Las distancias son las de fábrica/.test(trasColocar))
comprobar('avisa de que esta toma no cierra', /no cierra/.test(trasColocar))

comprobar('ahora sí deja importar', await botonImportar.isEnabled())

await pagina.screenshot({ path: `${SALIDA}/vista-previa.png`, fullPage: true })

// ---------------------------------------------------------------------------
// 4. Aceptar la hoja
// ---------------------------------------------------------------------------

await botonImportar.click()
// El párrafo entero, no el «Hoja aceptada» en negrita que va dentro: las
// cuentas están en el texto que lo rodea.
const aceptada = await pagina.locator('p', { hasText: 'Hoja aceptada' }).first().innerText()
comprobar('la hoja entra con sus cuentas a la vista',
  /7 progresivas/.test(aceptada) && /35 lecturas/.test(aceptada) && /3 referencias/.test(aceptada),
  aceptada.trim())

// ---------------------------------------------------------------------------
// 5. La palabra colocada queda guardada en la sección de la calle
// ---------------------------------------------------------------------------

// Al aceptar, la calle que recibe la hoja pasa a ser la activa y el panel de
// Obra › Calles cambia a ella: su apartado «Sección» es el de esa calle.
comprobar('el panel de la obra pasa a la calle que recibió la hoja',
  (await pagina.getByRole('region', { name: `Panel de ${CALLE}` }).count()) === 1)
await abrirApartado('Sección')
comprobar('la sección es la de la calle que se acaba de subir',
  (await pagina.getByText(new RegExp(`${CALLE}: los puntos que mides`)).count()) > 0)

comprobar('IZQ quedó guardada en el borde izquierdo',
  (await pagina.getByRole('button', { name: 'Quitar la palabra IZQ de Borde izquierdo' }).count()) === 1)
comprobar('DER quedó guardada en el borde derecho',
  (await pagina.getByRole('button', { name: 'Quitar la palabra DER de Borde derecho' }).count()) === 1)

// El aviso de las distancias de fábrica se va solo cuando no queda ninguna
// sin medir: confirmar una lo baja de siete a seis, no lo apaga.
const avisoSiete = await pagina.getByText(/Quedan \d+ puntos con la distancia puesta por la app/).textContent()
await pagina.getByRole('button', { name: 'Confirmar la distancia de Eje' }).click()
await pagina.waitForTimeout(200)
const avisoSeis = await pagina.getByText(/Quedan \d+ puntos con la distancia puesta por la app/).textContent()
comprobar('el aviso de distancias de fábrica sigue mientras quede una sola sin medir',
  /Quedan 7 puntos/.test(avisoSiete ?? '') && /Quedan 6 puntos/.test(avisoSeis ?? ''),
  `${avisoSiete?.trim()} -> ${avisoSeis?.trim()}`)

await pagina.screenshot({ path: `${SALIDA}/seccion.png`, fullPage: true })

// ---------------------------------------------------------------------------
// 6. Después de importar hay cotas, perfil y modelo
// ---------------------------------------------------------------------------

// Calle › Revisar, con la calle recién subida activa.
await irA('Calle')
await pagina.getByRole('navigation', { name: 'Modos de la calle' }).getByRole('button', { name: 'Revisar', exact: true }).click()
await pagina.getByRole('heading', { name: 'Revisar', exact: true, level: 2 }).waitFor({ timeout: 10000 })
const calleActiva = await pagina.getByLabel('Calle activa').locator('option:checked').textContent()
comprobar('la calle activa es la que recibió la hoja', calleActiva === CALLE, calleActiva)

// Cota del eje en la primera progresiva: BM-1 (3245.180) + vista atrás 1.45
// − lectura 2.27 = 3244.360. Si la vista atrás no se hubiera leído del
// preámbulo, esta cifra sería otra. Sin rasante, el mapa de Revisar marca lo
// medido; se elige la celda y el corte nombra el punto con su cota.
await pagina.getByRole('button', { name: /^0\+006 Eje: medida$/ }).click()
const cotaEje = await pagina
  .getByRole('img', { name: /Corte transversal/ })
  .locator('circle[aria-label^="0+006 Eje · cota"]')
  .first()
  .getAttribute('aria-label')
  .catch(() => null)
const puntoElegido = (await pagina.getByRole('region', { name: 'Punto elegido' }).innerText().catch(() => '')).replace(/\s+/g, ' ')
comprobar('las cotas salen calculadas desde la vista atrás de la hoja (corte y punto elegido)',
  /3244\.360/.test(cotaEje ?? '') && /Cota medida 3244\.360/.test(puntoElegido), `${cotaEje} · ${puntoElegido.slice(0, 120)}`)

const vistaDeLaCalle = pagina.getByRole('group', { name: 'Vista de la calle' })
await vistaDeLaCalle.getByRole('button', { name: 'Perfil', exact: true }).click()
const perfil = pagina.getByRole('img', { name: /^Perfil longitudinal de/ })
comprobar('el perfil longitudinal se dibuja', await perfil.isVisible(),
  await perfil.getAttribute('aria-label'))
const puntosPerfil = await perfil.locator('circle[role="button"]').count()
comprobar('el perfil trae un punto por progresiva medida', puntosPerfil === 7, `${puntosPerfil} puntos`)

// El modelo arranca en modo Estado, y esta calle todavía no tiene rasante de
// proyecto: ahí lo correcto es que lo diga en vez de dibujar algo. En modo
// Capas dibuja la superficie medida tal cual, que es lo que hay que ver
// recién levantado el terreno.
await vistaDeLaCalle.getByRole('button', { name: '3D', exact: true }).click()
const seccionModelo = pagina.getByRole('region', { name: 'Dibujo de la calle' })
comprobar('sin rasante, el modelo por estado dice por qué no dibuja',
  (await seccionModelo.getByText(/Define la rasante del proyecto/).count()) > 0)

await seccionModelo.getByRole('button', { name: 'Capas', exact: true }).click()
await pagina.waitForTimeout(200)
const caras = await seccionModelo.locator('svg polygon[data-capa-id]').count()
comprobar('en modo Capas el modelo levanta la superficie medida', caras > 0, `${caras} caras`)

await pagina.screenshot({ path: `${SALIDA}/resultados-importados.png`, fullPage: true })

// ---------------------------------------------------------------------------
// 7. El camino del pegado: las mismas celdas, por el portapapeles
// ---------------------------------------------------------------------------

await irAObraCalles()
await abrirApartado('Subir una hoja de campo')
await pagina.getByLabel(/pegar/i).fill(PEGADO)
await pagina.getByRole('heading', { name: /Qué columna cayó en qué punto/ }).waitFor()

// La calle ya existe y su sección ya sabe qué son IZQ y DER: esta vez no hay
// nada que colocar. Es lo que el diseño promete — se declara una vez y la hoja
// entra sola la siguiente.
await campoCalle.fill(CALLE)
await pagina.waitForTimeout(200)

const trasPegar = await zonaSubir.innerText()
comprobar('lo pegado da las mismas cuentas que el archivo',
  /7 progresivas/.test(trasPegar) && /35 lecturas/.test(trasPegar),
  (trasPegar.match(/\d+ progresivas[^\n]*/) ?? [''])[0])
comprobar('lo pegado señala el mismo conflicto que el archivo',
  /2 lecturas en el lado derecho/.test(trasPegar))
comprobar('con la sección ya declarada no hay ninguna columna que colocar',
  (await pagina.getByText(/sin colocar con lecturas/).count()) === 0)
comprobar('lo pegado se puede importar sin tocar nada más', await botonImportar.isEnabled())

await pagina.screenshot({ path: `${SALIDA}/pegado.png`, fullPage: true })

await botonImportar.click()
const aceptadaPegado = await pagina.locator('p', { hasText: 'Hoja aceptada' }).first().innerText()
comprobar('lo pegado entra igual que el archivo',
  /35 lecturas/.test(aceptadaPegado) && /3 referencias/.test(aceptadaPegado), aceptadaPegado.trim())

// ---------------------------------------------------------------------------
// 8. Importar añade y nunca pisa: se comprueba dentro del .topo
// ---------------------------------------------------------------------------

// Guardar está en el menú Archivo de la barra superior.
await pagina.getByRole('button', { name: 'Archivo', exact: true }).click()
const descarga = await Promise.all([
  pagina.waitForEvent('download'),
  pagina.getByRole('group', { name: 'Archivo del proyecto' }).getByRole('button', { name: 'Guardar', exact: true }).click(),
]).then(([d]) => d)
await pagina.keyboard.press('Escape')
const rutaTopo = `${SALIDA}/importado.topo`
await descarga.saveAs(rutaTopo)

const contenidoTopo = unzipSync(new Uint8Array(readFileSync(rutaTopo)))
const proyecto = JSON.parse(strFromU8(contenidoTopo['proyecto.json']))
const calles = proyecto.calles.filter((calle) => calle.nombre === CALLE)
const tomas = calles.flatMap((calle) => calle.nivelaciones.flatMap((nivelacion) => nivelacion.tomas))

comprobar('las dos hojas fueron a una sola calle, no a dos',
  calles.length === 1, `${calles.length} calles llamadas «${CALLE}»`)
comprobar('la segunda hoja se añadió como otra toma, sin pisar la primera',
  tomas.length === 2, `${tomas.length} tomas`)

const intermediasDe = (toma, tipo) =>
  (toma.estaciones[0]?.intermedias ?? []).filter((lectura) => lectura.destino.tipo === tipo).length

const celdasPorToma = tomas.map((toma) => intermediasDe(toma, 'celda'))
comprobar('las dos tomas traen las mismas 35 lecturas de grilla',
  celdasPorToma.length === 2 && celdasPorToma.every((cuantas) => cuantas === 35),
  celdasPorToma.join(' y ') || '(ninguna toma)')

const sueltasPorToma = tomas.map((toma) => intermediasDe(toma, 'suelto'))
comprobar('las referencias viajan aparte de la grilla, 3 por toma',
  sueltasPorToma.length === 2 && sueltasPorToma.every((cuantas) => cuantas === 3),
  sueltasPorToma.join(' y ') || '(ninguna toma)')

const bordeIzquierdo = calles[0]?.seccion.puntos.find((punto) => punto.id === 'p-borde-i')
const palabrasDelBorde = bordeIzquierdo?.palabras ?? []
comprobar('la sección declarada viaja en el .topo con las palabras de Max',
  palabrasDelBorde.includes('IZQ'), palabrasDelBorde.join(' · ') || '(sin borde izquierdo)')

// ---------------------------------------------------------------------------
// 9. Sin errores de consola
// ---------------------------------------------------------------------------

comprobar('la app no produce errores en la consola del navegador',
  erroresConsola.length === 0, erroresConsola.slice(0, 3).join(' | '))

await navegador.close()

const fallos = resultados.filter((r) => !r.ok)
console.log(`\n=== ${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas ===`)
process.exit(fallos.length === 0 ? 0 : 1)
