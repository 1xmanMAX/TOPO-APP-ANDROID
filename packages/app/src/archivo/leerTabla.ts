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
    celdas.push(filasPorNumero.get(fila) ?? [])
  }
  return celdas
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

  return filas
}

/** Lee un texto en formato CSV (separado por comas) como una sola hoja. */
export function leerCsv(texto: string, nombreHoja: string): HojaLeida {
  return { nombre: nombreHoja, celdas: partirTextoDelimitado(texto, ',') }
}

/**
 * Lee lo pegado desde una hoja de cálculo (Excel o Google Sheets): llega como
 * texto separado por tabuladores, una fila por línea. Si no trae ningún
 * tabulador, es texto suelto y no una tabla copiada de celdas.
 */
export function leerPegado(texto: string, nombreHoja: string): HojaLeida {
  if (!texto.includes('\t')) throw new Error(ERROR_PEGADO)

  const filas = partirTextoDelimitado(texto, '\t').filter(
    (fila) => !(fila.length === 1 && fila[0] === ''),
  )

  return { nombre: nombreHoja, celdas: filas }
}
