import { strFromU8, unzipSync } from 'fflate'
import { letraDeColumna } from './xlsx'

/** Una hoja leída de un archivo o de un pegado: su nombre y su tabla de celdas. */
export interface HojaLeida {
  nombre: string
  celdas: string[][]
}

const ERROR_XLSX =
  'No se pudo leer el archivo: no parece ser un libro de Excel (.xlsx) válido.' +
  ' Comprueba que sea el archivo correcto.'

const ERROR_PEGADO =
  'Lo pegado no parece una tabla. Copia las celdas directamente de Excel o de' +
  ' Google Sheets y vuelve a pegar.'

/**
 * Índice de columna (base cero) para una letra de columna tipo "B" o "AA".
 * Es la conversión al revés de `letraDeColumna`, y se apoya en ella en vez de
 * repetir la aritmética de base 26 por su cuenta.
 */
function indiceDeColumna(letras: string): number {
  for (let indice = 0; indice < 100000; indice++) {
    if (letraDeColumna(indice) === letras) return indice
  }
  return -1
}

/** Separa una referencia de celda tipo "B3" en su columna y su fila (base cero y base uno). */
function partirReferencia(referencia: string): { columna: number; fila: number } | null {
  const coincide = /^([A-Za-z]+)(\d+)$/.exec(referencia)
  if (!coincide) return null

  const columna = indiceDeColumna(coincide[1]!.toUpperCase())
  if (columna < 0) return null

  return { columna, fila: Number(coincide[2]) }
}

/** Junta el texto de una celda de texto: uno solo o varios tramos con formato distinto. */
function textoDeNodo(nodo: Element): string {
  return Array.from(nodo.getElementsByTagName('t'))
    .map((t) => t.textContent ?? '')
    .join('')
}

/** Los textos del libro, en el orden en que Excel los guarda para reutilizarlos entre celdas. */
function analizarCadenasCompartidas(xml: string): string[] {
  const documento = new DOMParser().parseFromString(xml, 'application/xml')
  return Array.from(documento.getElementsByTagName('si')).map(textoDeNodo)
}

/**
 * El valor de una celda según su tipo: `s` sale del listado de textos
 * compartidos, `inlineStr` de su propio `<is><t>`, y sin tipo (un número) del
 * `<v>` tal cual viene.
 */
function valorDeCelda(celdaXml: Element, cadenas: string[]): string {
  const tipo = celdaXml.getAttribute('t')

  if (tipo === 'inlineStr') {
    const enLinea = celdaXml.getElementsByTagName('is')[0]
    return enLinea ? textoDeNodo(enLinea) : ''
  }

  const v = celdaXml.getElementsByTagName('v')[0]
  const contenido = v ? (v.textContent ?? '') : ''

  if (tipo === 's') {
    const indice = Number(contenido)
    return Number.isFinite(indice) ? (cadenas[indice] ?? '') : ''
  }

  return contenido
}

/**
 * Empareja el ancho de todas las filas al de la más ancha, rellenando lo que
 * falte con celdas vacías al final.
 *
 * La pieza que interpreta esta tabla casa cada columna con su cabecera por
 * posición, así que una fila más angosta desplazaría o perdería lecturas en
 * silencio. La causa más común es la última columna sin medir (por ejemplo,
 * la vereda derecha): Excel, un .csv o un pegado se saltan por completo esa
 * celda final en vez de dejarla en blanco. Rellenar el hueco no inventa un
 * dato — la celda de relleno es una celda vacía, un punto no medido, que es
 * justo lo que era. Una fila más ancha que las demás nunca se recorta.
 */
function rellenarAnchoParejo(filas: string[][]): string[][] {
  const anchoMaximo = filas.reduce((maximo, fila) => Math.max(maximo, fila.length), 0)

  return filas.map((fila) =>
    fila.length < anchoMaximo ? [...fila, ...new Array(anchoMaximo - fila.length).fill('')] : fila,
  )
}

/**
 * Convierte el XML de una hoja en su tabla de celdas.
 *
 * Excel se salta las celdas vacías al escribir una fila: un hueco en medio no
 * deja un elemento `<c>` para esa columna. Por eso cada celda se coloca por su
 * referencia ("B3"), no se van apilando en el orden en que aparecen — si no,
 * todo lo que viene después de un hueco se corre de columna, y un punto sin
 * medir termina leyéndose como si perteneciera a otra medición.
 */
function analizarHoja(xml: string, cadenas: string[]): string[][] {
  const documento = new DOMParser().parseFromString(xml, 'application/xml')
  const filasPorNumero = new Map<number, string[]>()
  let filaMaxima = 0

  for (const filaXml of Array.from(documento.getElementsByTagName('row'))) {
    const numeroFila = Number(filaXml.getAttribute('r'))
    if (!Number.isFinite(numeroFila) || numeroFila < 1) continue

    const valoresPorColumna = new Map<number, string>()
    let columnaMaxima = -1

    for (const celdaXml of Array.from(filaXml.getElementsByTagName('c'))) {
      const referencia = celdaXml.getAttribute('r')
      const posicion = referencia ? partirReferencia(referencia) : null
      if (!posicion) continue

      columnaMaxima = Math.max(columnaMaxima, posicion.columna)
      valoresPorColumna.set(posicion.columna, valorDeCelda(celdaXml, cadenas))
    }

    const fila: string[] = []
    for (let columna = 0; columna <= columnaMaxima; columna++) {
      fila.push(valoresPorColumna.get(columna) ?? '')
    }

    filasPorNumero.set(numeroFila, fila)
    filaMaxima = Math.max(filaMaxima, numeroFila)
  }

  const celdas: string[][] = []
  for (let fila = 1; fila <= filaMaxima; fila++) {
    const valores = filasPorNumero.get(fila) ?? []
    // Una fila sin ningún <c>: no hay ni una celda real, así que es una línea
    // vacía (un separador o un final de hoja de sobra), no una fila de datos.
    // Se descarta igual que en los otros dos caminos de lectura, para no
    // dejar una fila hueca que rompa el ancho parejo del resto de la tabla.
    if (valores.length === 0) continue
    celdas.push(valores)
  }
  return rellenarAnchoParejo(celdas)
}

/** La ruta dentro del paquete .xlsx para el destino de una relación (relativo a "xl/"). */
function rutaDesdeDestino(destino: string): string {
  return destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`
}

/**
 * Lee un archivo .xlsx (un libro de Excel) y devuelve todas sus hojas, en el
 * mismo orden en que están en el libro.
 */
export function leerXlsx(datos: Uint8Array): HojaLeida[] {
  let contenido: Record<string, Uint8Array>
  try {
    contenido = unzipSync(datos)
  } catch {
    throw new Error(ERROR_XLSX)
  }

  const libroXml = contenido['xl/workbook.xml']
  if (!libroXml) throw new Error(ERROR_XLSX)

  const documentoLibro = new DOMParser().parseFromString(strFromU8(libroXml), 'application/xml')
  const hojasDelLibro = Array.from(documentoLibro.getElementsByTagName('sheet'))
  if (hojasDelLibro.length === 0) throw new Error(ERROR_XLSX)

  const destinoPorId = new Map<string, string>()
  const relacionesXml = contenido['xl/_rels/workbook.xml.rels']
  if (relacionesXml) {
    const documentoRelaciones = new DOMParser().parseFromString(
      strFromU8(relacionesXml),
      'application/xml',
    )
    for (const relacion of Array.from(documentoRelaciones.getElementsByTagName('Relationship'))) {
      const id = relacion.getAttribute('Id')
      const destino = relacion.getAttribute('Target')
      if (id && destino) destinoPorId.set(id, destino)
    }
  }

  const cadenasXml = contenido['xl/sharedStrings.xml']
  const cadenas = cadenasXml ? analizarCadenasCompartidas(strFromU8(cadenasXml)) : []

  return hojasDelLibro.map((sheetXml, indice) => {
    const nombre = sheetXml.getAttribute('name') ?? `Hoja${indice + 1}`
    const idRelacion = sheetXml.getAttribute('r:id')
    const destino = idRelacion ? destinoPorId.get(idRelacion) : undefined
    const ruta = destino ? rutaDesdeDestino(destino) : `xl/worksheets/sheet${indice + 1}.xml`

    const hojaXml = contenido[ruta]
    if (!hojaXml) throw new Error(ERROR_XLSX)

    return { nombre, celdas: analizarHoja(strFromU8(hojaXml), cadenas) }
  })
}

/**
 * Parte un texto separado por un delimitador (coma o tabulador) en filas y
 * celdas, respetando los valores que van entre comillas —que pueden traer el
 * propio delimitador o un salto de línea— y las comillas dobles escapadas
 * como `""`.
 *
 * Una línea completamente vacía (sin ni un delimitador ni contenido) no es
 * una fila de datos: es un separador o una línea final de sobra, y se
 * descarta. Eso es distinto de una celda vacía dentro de una fila con
 * contenido (`a,,c`), que sí se conserva: esa es un punto no medido.
 *
 * Una fila a la que le faltan delimitadores al final (por ejemplo, la última
 * columna sin medir) sale más angosta que las demás; se rellena con celdas
 * vacías hasta el ancho de la fila más ancha, para que la tabla resultante
 * sea siempre rectangular.
 */
function partirTextoDelimitado(texto: string, delimitador: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let dentroDeComillas = false
  let indice = 0

  while (indice < texto.length) {
    const caracter = texto[indice]!

    if (dentroDeComillas) {
      if (caracter === '"') {
        if (texto[indice + 1] === '"') {
          celda += '"'
          indice += 2
          continue
        }
        dentroDeComillas = false
        indice++
        continue
      }
      celda += caracter
      indice++
      continue
    }

    if (caracter === '"') {
      dentroDeComillas = true
      indice++
      continue
    }

    if (caracter === delimitador) {
      fila.push(celda)
      celda = ''
      indice++
      continue
    }

    if (caracter === '\r') {
      indice++
      continue
    }

    if (caracter === '\n') {
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
      indice++
      continue
    }

    celda += caracter
    indice++
  }

  // La última línea puede no traer un salto final.
  if (celda !== '' || fila.length > 0) {
    fila.push(celda)
    filas.push(fila)
  }

  const sinLineasVacias = filas.filter((fila) => !(fila.length === 1 && fila[0] === ''))
  return rellenarAnchoParejo(sinLineasVacias)
}

/** Lee un texto en formato CSV (separado por comas) como una sola hoja. */
export function leerCsv(texto: string, nombreHoja: string): HojaLeida {
  return { nombre: nombreHoja, celdas: partirTextoDelimitado(texto, ',') }
}

/**
 * Lee lo pegado desde una hoja de cálculo (Excel o Google Sheets): llega como
 * texto separado por tabuladores, una fila por línea.
 *
 * Una sola columna copiada (por ejemplo, solo las lecturas de mira) no trae
 * ningún tabulador y sigue siendo una tabla válida, de varias filas de una
 * celda cada una. Lo que se rechaza es el texto suelto: ni un tabulador y una
 * sola línea, que no puede ser una tabla copiada de celdas.
 */
export function leerPegado(texto: string, nombreHoja: string): HojaLeida {
  const filas = partirTextoDelimitado(texto, '\t')

  const esTextoSuelto = !texto.includes('\t') && filas.length <= 1
  if (esTextoSuelto) throw new Error(ERROR_PEGADO)

  return { nombre: nombreHoja, celdas: filas }
}
