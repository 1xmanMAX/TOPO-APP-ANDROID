import {
  esPalabraDe,
  formatearProgresiva,
  ladoDe,
  parsearProgresiva,
  puntoPorPalabraYLado,
  puntosConPalabra,
  type Id,
  type Lado,
  type PuntoSeccion,
  type Seccion,
} from '@topo/core'
import type { HojaLeida } from '../archivo/leerTabla'
import { letraDeColumna } from '../archivo/xlsx'

/** Una columna de la hoja que quedó colocada sobre un punto de la sección. */
export interface ColumnaLeida {
  indice: number
  palabra: string
  puntoId: Id
  lado: Lado
}

/** Una lectura de mira de un punto en una progresiva. */
export interface LecturaLeida {
  progresiva: number
  puntoId: Id
  valor: number
}

/** Una lectura sobre algo existente y fijo, que no pertenece a ninguna progresiva. */
export interface ReferenciaLeida {
  elemento: string
  distancia: number
  valor: number
}

/** Una columna con título que la sección no reconoce: se enseña para colocarla a mano. */
export interface ColumnaSinAsignar {
  indice: number
  palabra: string
  muestra: string[]
  /**
   * Si en la columna hay escrito algún número, mirando la columna **entera** y
   * no solo la muestra. Es lo que distingue una columna medida —que no se
   * puede dejar fuera sin perder trabajo de campo— de una de puras notas.
   *
   * Se decide aquí y no en la pantalla porque la muestra son tres valores: una
   * columna con dos observaciones escritas arriba y las lecturas debajo
   * parecería de texto vista desde fuera.
   */
  traeNumeros: boolean
}

/** Algo que estaba en la hoja y no entró. Nunca se descarta en silencio. */
export interface NoImportado {
  que: string
  contenido: string[]
}

/** Algo que la app no puede decidir sola y tiene que resolver quien midió. */
export interface Conflicto {
  que: string
}

export interface HojaInterpretada {
  columnas: ColumnaLeida[]
  columnaProgresiva: number | null
  vistaAtras: number | null
  lecturas: LecturaLeida[]
  referencias: ReferenciaLeida[]
  sinAsignar: ColumnaSinAsignar[]
  noImportado: NoImportado[]
  conflictos: Conflicto[]
}

/** Cuántos valores se enseñan de una columna que está sin colocar. */
const VALORES_DE_MUESTRA = 3

/**
 * El número que lleva una celda, o null si está vacía o no es un número.
 *
 * Solo vale un número suelto, con coma o con punto. Una celda con texto
 * —«cuneta», «existente»— no es una lectura de mira, y una vacía es un punto
 * sin medir: las dos devuelven null, que es lo que dice «aquí no hay lectura».
 */
function numeroDeCelda(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null
  return Number(limpio)
}

/** El texto de una celda tal como se escribió, sin los espacios de los lados. */
function textoDeCelda(texto: string): string {
  return texto.trim()
}

/** Dónde cae un lado, escrito para meterlo en un aviso: «hay dos lecturas en …». */
function nombreDeLado(lado: Lado): string {
  if (lado === 'izquierda') return 'el lado izquierdo'
  if (lado === 'derecha') return 'el lado derecho'
  return 'el eje'
}

/** «Una fila quedó fuera» o «8 filas quedaron fuera», según cuántas sean. */
function cuantasFilasFuera(cuantas: number): string {
  return cuantas === 1 ? 'Una fila quedó fuera' : `${cuantas} filas quedaron fuera`
}

/** El lado en el que cae una columna según dónde esté respecto a la del eje. */
function ladoPorPosicion(indice: number, indiceEje: number): Lado {
  if (indice < indiceEje) return 'izquierda'
  if (indice > indiceEje) return 'derecha'
  return 'eje'
}

/** Lo que hay escrito en una columna, de la cabecera para abajo. */
function valoresBajoLaColumna(filas: string[][], indice: number): string[] {
  return filas.map((fila) => textoDeCelda(fila[indice] ?? '')).filter((valor) => valor !== '')
}

/** Todo lo que hay escrito en una fila, en el orden en el que está. */
function contenidoDeFila(fila: string[]): string[] {
  return fila.map(textoDeCelda).filter((valor) => valor !== '')
}

/**
 * La vista atrás del preámbulo y lo que queda suelto encima de la tabla.
 *
 * La vista atrás es el número que va justo detrás de la palabra del punto de
 * control (`PC 1.45`). Lo demás que haya escrito ahí arriba no se importa
 * —nadie sabe qué es— pero se devuelve para enseñarlo: en la hoja de Max es
 * el `2.11`, que él dijo que mete aparte.
 */
function leerPreambulo(
  filas: string[][],
  seccion: Seccion,
): { vistaAtras: number | null; sobrante: string[] } {
  let vistaAtras: number | null = null
  const usadas = new Set<string>()

  for (let f = 0; f < filas.length && vistaAtras === null; f++) {
    const fila = filas[f]!
    for (let c = 0; c < fila.length; c++) {
      if (!esPalabraDe(seccion.palabrasPuntoControl, fila[c] ?? '')) continue
      const numero = numeroDeCelda(fila[c + 1] ?? '')
      if (numero === null) continue

      vistaAtras = numero
      usadas.add(`${f}:${c}`)
      usadas.add(`${f}:${c + 1}`)
      break
    }
  }

  const sobrante: string[] = []
  filas.forEach((fila, f) => {
    fila.forEach((celda, c) => {
      const texto = textoDeCelda(celda)
      if (texto === '' || usadas.has(`${f}:${c}`)) return
      sobrante.push(texto)
    })
  })

  return { vistaAtras, sobrante }
}

/** Una columna de la cabecera cuya palabra está declarada en la sección. */
interface Candidata {
  indice: number
  palabra: string
  punto: PuntoSeccion | null
  lado: Lado
}

/**
 * Reparte las columnas de la cabecera entre los puntos de la sección.
 *
 * El lado no sale del nombre sino de la posición: «vereda» a la izquierda de
 * la columna del eje es la vereda izquierda, y a su derecha, la derecha. Por
 * eso la misma palabra puede estar escrita dos veces sin que se confundan.
 *
 * Si dos columnas caen en el mismo punto —«BORDE» dos veces del mismo lado—
 * la app no elige: las dos quedan fuera y se dice cuáles eran.
 */
function repartirColumnas(
  cabecera: string[],
  indiceEje: number,
  seccion: Seccion,
): { columnas: ColumnaLeida[]; conflictos: Conflicto[] } {
  const candidatas: Candidata[] = []

  cabecera.forEach((celda, indice) => {
    const palabra = textoDeCelda(celda)
    if (puntosConPalabra(seccion, palabra).length === 0) return

    const lado = ladoPorPosicion(indice, indiceEje)
    candidatas.push({ indice, palabra, punto: puntoPorPalabraYLado(seccion, palabra, lado), lado })
  })

  const colocadas = candidatas.filter(
    (c): c is Candidata & { punto: PuntoSeccion } => c.punto !== null,
  )
  const conflictos: Conflicto[] = []
  const columnas: ColumnaLeida[] = []

  for (const punto of seccion.puntos) {
    const grupo = colocadas.filter((c) => c.punto.id === punto.id)
    if (grupo.length === 0) continue

    if (grupo.length > 1) {
      const cuales = grupo
        .map((c) => `«${c.palabra}» (columna ${letraDeColumna(c.indice)})`)
        .join(' y ')
      conflictos.push({
        que:
          `${grupo.length} columnas caen en «${punto.nombre}»: ${cuales}.` +
          ' No se sabe cuál es cuál, así que ninguna de ellas se ha colocado.',
      })
      continue
    }

    const unica = grupo[0]!
    columnas.push({
      indice: unica.indice,
      palabra: unica.palabra,
      puntoId: punto.id,
      lado: unica.lado,
    })
  }

  columnas.sort((a, b) => a.indice - b.indice)
  return { columnas, conflictos }
}

/**
 * La columna donde están las progresivas.
 *
 * Primero se busca la palabra declarada. Si no la lleva ninguna —el caso de la
 * hoja de Max, donde esa columna no tiene título— se toma la columna con
 * números más cercana por la izquierda a la primera columna de la sección.
 */
function buscarColumnaProgresiva(
  cabecera: string[],
  filasDeDatos: string[][],
  primeraDeLaSeccion: number,
  seccion: Seccion,
): number | null {
  const conTitulo = cabecera.findIndex((celda) => esPalabraDe(seccion.palabrasProgresiva, celda))
  if (conTitulo >= 0) return conTitulo

  for (let indice = primeraDeLaSeccion - 1; indice >= 0; indice--) {
    const tieneNumeros = filasDeDatos.some((fila) => parsearProgresiva(fila[indice] ?? '') !== null)
    if (tieneNumeros) return indice
  }

  return null
}

/**
 * Las lecturas de una fila de referencia, cada una con la distancia que le da
 * su columna. El elemento lo dice la fila —«cuneta», «calzada»— y es texto
 * libre; la columna solo aporta el lado y la distancia.
 *
 * Si en un mismo lado caen dos números, uno de los dos no es una lectura: en
 * la hoja de Max el `0.23` es la resta que dejó en una celda. La app no elige
 * cuál: no entra ninguna de las dos y el conflicto las enseña las dos.
 */
function leerFilaDeReferencia(
  fila: string[],
  indiceMarcador: number,
  columnas: ColumnaLeida[],
  seccion: Seccion,
): {
  elemento: string
  referencias: ReferenciaLeida[]
  conflictos: Conflicto[]
  sinLeer: string[]
} {
  let indiceElemento = -1
  for (let c = indiceMarcador + 1; c < fila.length; c++) {
    if (textoDeCelda(fila[c] ?? '') !== '') {
      indiceElemento = c
      break
    }
  }

  if (indiceElemento < 0) {
    // La fila no lleva nada detrás de la marca, así que lo único escrito en
    // ella es la marca misma: el conflicto ya la nombra y no hay nada más que
    // enseñar aparte.
    return {
      elemento: '',
      referencias: [],
      conflictos: [
        {
          que:
            `Una fila marcada como «${textoDeCelda(fila[indiceMarcador] ?? '')}» no dice de qué` +
            ' elemento es, así que no se ha guardado ninguna referencia de ella.',
        },
      ],
      sinLeer: [],
    }
  }

  const elemento = textoDeCelda(fila[indiceElemento] ?? '')
  const distanciaPorPunto = new Map(seccion.puntos.map((p) => [p.id, p.distancia]))

  const medidas: { lado: Lado; distancia: number; texto: string; valor: number }[] = []
  const conflictos: Conflicto[] = []
  const sinLeer: string[] = []

  for (const col of columnas) {
    if (col.indice === indiceElemento) continue

    const texto = textoDeCelda(fila[col.indice] ?? '')
    const valor = numeroDeCelda(texto)

    if (valor === null) {
      // Escrito pero no es un número: no es una lectura, pero tampoco es una
      // celda vacía. Se devuelve para enseñarlo con el resto de la fila.
      if (texto !== '') sinLeer.push(texto)
      continue
    }

    const distancia = distanciaPorPunto.get(col.puntoId)
    if (distancia === undefined) {
      // No se le pone la distancia del eje por salir del paso: eso guardaría
      // una referencia falsa justo en el centro de la calle.
      conflictos.push({
        que:
          `La lectura ${texto} de la columna ${letraDeColumna(col.indice)} no se ha guardado:` +
          ' su punto ya no está en la sección de esta calle.',
      })
      continue
    }

    medidas.push({ lado: col.lado, distancia, texto, valor })
  }

  const referencias: ReferenciaLeida[] = []

  for (const lado of ['izquierda', 'eje', 'derecha'] as const) {
    const delLado = medidas.filter((m) => m.lado === lado)
    if (delLado.length === 0) continue

    // Aquí la app no elige. Una cosa existente solo tiene una lectura por
    // lado, y cuando caen dos no hay forma de saber cuál es: quedarse con una
    // por corazonada dejaría una referencia falsa que nadie vuelve a mirar.
    // Se enseñan las dos y se resuelve de un clic en la vista previa.
    if (delLado.length > 1) {
      conflictos.push({
        que:
          `En la fila de «${elemento}» hay ${delLado.length} lecturas en` +
          ` ${nombreDeLado(lado)} (${delLado.map((m) => m.texto).join(', ')}). Una cosa` +
          ' existente solo tiene una por lado y no se sabe cuál de ellas es, así que no se ha' +
          ' guardado ninguna: di cuál vale y entrará.',
      })
      continue
    }

    const unica = delLado[0]!
    referencias.push({ elemento, distancia: unica.distancia, valor: unica.valor })
  }

  return { elemento, referencias, conflictos, sinLeer }
}

/**
 * Lee una hoja de campo con la sección declarada de su calle: qué columna es
 * cada punto, qué fila es cada progresiva, y —sobre todo— qué había en la hoja
 * que no se entendió.
 *
 * Nada se descarta en silencio: lo que no casa sale en `sinAsignar` para
 * colocarlo de un clic, en `noImportado` con su contenido, o en `conflictos`
 * para que lo resuelva quien midió. Una lectura de campo perdida sin que nadie
 * se entere no se nota hasta que la obra está mal.
 */
export function interpretarHoja(hoja: HojaLeida, seccion: Seccion): HojaInterpretada {
  const vacio: HojaInterpretada = {
    columnas: [],
    columnaProgresiva: null,
    vistaAtras: null,
    lecturas: [],
    referencias: [],
    sinAsignar: [],
    noImportado: [],
    conflictos: [],
  }

  // 1. La cabecera es la primera fila con alguna palabra de algún punto de la
  //    sección. Todo lo que esté encima es preámbulo.
  const filaCabecera = hoja.celdas.findIndex((fila) =>
    fila.some((celda) => puntosConPalabra(seccion, textoDeCelda(celda)).length > 0),
  )

  if (filaCabecera < 0) {
    return {
      ...vacio,
      conflictos: [
        {
          que:
            'No encontré en la hoja ninguna de las palabras de la sección de esta calle, así que' +
            ' no leí nada. Comprueba que sea la hoja correcta, o escribe en la sección las' +
            ' palabras con las que anotaste cada punto.',
        },
      ],
    }
  }

  const cabecera = hoja.celdas[filaCabecera] ?? []
  const filasDeDatos = hoja.celdas.slice(filaCabecera + 1)

  // 2 y 3. La vista atrás sale del preámbulo; lo que quede ahí arriba se enseña.
  const { vistaAtras, sobrante } = leerPreambulo(hoja.celdas.slice(0, filaCabecera), seccion)

  const noImportado: NoImportado[] = []
  if (sobrante.length > 0) {
    noImportado.push({
      que: 'Encima de la tabla había esto escrito, sin nada que dijera qué era.',
      contenido: sobrante,
    })
  }

  // 5. Las columnas de puntos, con su lado sacado de la posición del eje.
  const indiceEje = cabecera.findIndex((celda) =>
    puntosConPalabra(seccion, textoDeCelda(celda)).some((p) => ladoDe(p.distancia) === 'eje'),
  )

  const reparto =
    indiceEje >= 0
      ? repartirColumnas(cabecera, indiceEje, seccion)
      : {
          columnas: [] as ColumnaLeida[],
          conflictos: [
            {
              que:
                'En la fila de títulos no aparece el eje. Sin él no se sabe qué queda a la izquierda' +
                ' y qué a la derecha, así que no se ha colocado ninguna columna: señala cuál es la' +
                ' del eje o escribe su palabra en la sección.',
            },
          ],
        }

  const columnas = reparto.columnas
  const conflictos: Conflicto[] = [...reparto.conflictos]

  // 4. La columna de progresivas: por su palabra, o la que tenga números más
  //    cerca por la izquierda de la primera columna con palabra de la sección.
  const primeraDeLaSeccion = cabecera.findIndex(
    (celda) => puntosConPalabra(seccion, textoDeCelda(celda)).length > 0,
  )
  const columnaProgresiva = buscarColumnaProgresiva(
    cabecera,
    filasDeDatos,
    primeraDeLaSeccion,
    seccion,
  )

  if (columnaProgresiva === null) {
    conflictos.push({
      que:
        'No encontré la columna de las progresivas. Señálala en la vista previa o escribe su' +
        ' palabra en la sección: sin ella no se sabe a qué punto de la calle va cada fila.',
    })
  }

  // 6. Lo que no es de nadie: con título, para colocarlo; sin título, para verlo.
  const indicesColocados = new Set(columnas.map((col) => col.indice))
  const sinAsignar: ColumnaSinAsignar[] = []

  cabecera.forEach((celda, indice) => {
    if (indice === columnaProgresiva || indicesColocados.has(indice)) return

    const valores = valoresBajoLaColumna(filasDeDatos, indice)
    if (valores.length === 0) return

    const palabra = textoDeCelda(celda)
    if (palabra !== '') {
      sinAsignar.push({
        indice,
        palabra,
        muestra: valores.slice(0, VALORES_DE_MUESTRA),
        traeNumeros: valores.some((valor) => numeroDeCelda(valor) !== null),
      })
      return
    }

    noImportado.push({
      que: `La columna ${letraDeColumna(indice)} no lleva título y se ha dejado fuera.`,
      contenido: valores,
    })
  })

  // 7 y 8. Las filas: las de referencia por su palabra, y las de datos solo si
  //        traen progresiva y alguna lectura bajo una columna de la sección.
  const lecturas: LecturaLeida[] = []
  const referencias: ReferenciaLeida[] = []
  const sinProgresiva: string[] = []
  const sinLecturas: string[] = []
  let cuantasSinProgresiva = 0
  let cuantasSinLecturas = 0

  for (const fila of filasDeDatos) {
    // La marca de referencia solo vale al principio de la fila, como dice el
    // spec. Si valiera en cualquier celda, una fila medida que llevara escrito
    // «REF» en una esquina se convertiría en referencia y perdería su
    // progresiva y sus lecturas.
    const primeraEscrita = fila.findIndex((celda) => textoDeCelda(celda) !== '')
    const esReferencia =
      primeraEscrita >= 0 && esPalabraDe(seccion.palabrasReferencia, fila[primeraEscrita] ?? '')

    if (esReferencia) {
      const leida = leerFilaDeReferencia(fila, primeraEscrita, columnas, seccion)
      referencias.push(...leida.referencias)
      conflictos.push(...leida.conflictos)

      if (leida.sinLeer.length > 0) {
        noImportado.push({
          que:
            `En la fila de «${leida.elemento}» había esto escrito y no era una lectura, así que` +
            ' no entró.',
          contenido: leida.sinLeer,
        })
      }
      continue
    }

    const progresiva =
      columnaProgresiva === null ? null : parsearProgresiva(fila[columnaProgresiva] ?? '')

    const medidas: { puntoId: Id; valor: number }[] = []
    const sinLeer: string[] = []

    for (const col of columnas) {
      const texto = textoDeCelda(fila[col.indice] ?? '')
      const valor = numeroDeCelda(texto)

      if (valor === null) {
        // Una celda vacía es un punto sin medir, y eso es información. Una
        // celda escrita que no es un número —«1.88 m», una nota a mano— es
        // otra cosa: es trabajo de campo que no se puede leer, y callarlo lo
        // haría indistinguible de un punto que nadie midió.
        if (texto !== '') sinLeer.push(texto)
        continue
      }

      medidas.push({ puntoId: col.puntoId, valor })
    }

    if (progresiva !== null && medidas.length > 0) {
      for (const medida of medidas) {
        lecturas.push({ progresiva, puntoId: medida.puntoId, valor: medida.valor })
      }

      if (sinLeer.length > 0) {
        noImportado.push({
          que:
            `En la fila de la progresiva ${formatearProgresiva(progresiva)} había esto escrito y` +
            ' no era un número, así que no entró.',
          contenido: sinLeer,
        })
      }
      continue
    }

    // Una fila del todo vacía no es nada que se haya perdido: no se nombra.
    const contenido = contenidoDeFila(fila)
    if (contenido.length === 0) continue

    // El motivo se separa porque no es el mismo, y un aviso que dice un motivo
    // falso es peor que uno genérico.
    if (progresiva === null) {
      cuantasSinProgresiva++
      sinProgresiva.push(...contenido)
    } else {
      cuantasSinLecturas++
      sinLecturas.push(...contenido)
    }
  }

  if (cuantasSinProgresiva > 0) {
    noImportado.push({
      que:
        `${cuantasFilasFuera(cuantasSinProgresiva)} por no llevar progresiva: sin ella no se sabe` +
        ' a qué punto de la calle pertenece lo que hay escrito.',
      contenido: sinProgresiva,
    })
  }

  if (cuantasSinLecturas > 0) {
    noImportado.push({
      que: `${cuantasFilasFuera(cuantasSinLecturas)} por no traer ninguna lectura bajo las columnas de la sección.`,
      contenido: sinLecturas,
    })
  }

  return {
    columnas,
    columnaProgresiva,
    vistaAtras,
    lecturas,
    referencias,
    sinAsignar,
    noImportado,
    conflictos,
  }
}
