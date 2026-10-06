import { estadoDeDiferencia, formatearProgresiva, redondear3 } from '@topo/core'
import { jsPDF } from 'jspdf'
import { formatearCota } from '../formato'
import type { BaseInforme, EstadoInforme } from './tipos'

/*
 * La maquetación común de todos los informes: A4 vertical, encabezado de obra
 * en cada página, franja de aviso si las cotas no están comprobadas, tablas
 * con la cabecera repetida al cambiar de página, notas, firmas y el pie
 * «Página n de m». Cada informe solo arma sus secciones y llama a
 * `componerInforme`.
 */

/** Regla dura del proyecto: el informe dice en cada página que sus cotas no están comprobadas. */
export const AVISO_SIN_COMPROBAR =
  'Nivelación sin cerrar: las cotas de este informe no están comprobadas contra el banco de nivel'

export interface Columna {
  titulo: string
  /** Ancho en mm. La suma de una tabla no debe pasar de 180 (A4 menos márgenes). */
  ancho: number
  alinear?: 'izq' | 'der' | 'centro'
}

/** Una celda es texto, o un estado del semáforo (se escribe en palabras con su símbolo dibujado). */
export type Celda = string | { estado: EstadoInforme; texto?: string }

export type Seccion =
  | {
      tipo: 'tabla'
      titulo?: string
      columnas: Columna[]
      filas: Celda[][]
      /** Fila final en negrita (totales, sumas). */
      filaTotal?: Celda[]
    }
  | { tipo: 'parrafo'; texto: string; resaltado?: boolean }
  | { tipo: 'titulo'; texto: string }

export interface DefinicionInforme {
  titulo: string
  base: BaseInforme
  secciones: Seccion[]
}

// ---- Medidas de la página (mm) ----
const ANCHO_PAGINA = 210
const ALTO_PAGINA = 297
const MARGEN = 15
const ANCHO_UTIL = ANCHO_PAGINA - 2 * MARGEN
/** Por debajo de esto va el pie; el contenido no lo pisa. */
const LIMITE_INFERIOR = ALTO_PAGINA - 18
const LOGO = 18
const INTERLINEA = 3.8
const RELLENO_CELDA = 1.4

// ---- Texto ----

/*
 * Las fuentes estándar del PDF solo saben escribir Latin-1 (WinAnsi): las
 * tildes y la ñ salen bien, pero ≤, √ o ✓ saldrían como basura. Se cambian
 * por algo que se lea igual. Lo que no tiene equivalente queda como «?», a la
 * vista: un carácter que desaparece sin rastro podría cambiar el sentido.
 */
const REEMPLAZOS: Record<string, string> = {
  '≤': '<=',
  '≥': '>=',
  '–': '-',
  '—': '-',
  '−': '-',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '…': '...',
  '√': 'raíz ',
  σ: 'sigma',
  Δ: 'delta',
  '×': 'x',
  '€': 'EUR',
  // jsPDF no escapa bien la barra invertida y la pierde.
  '\\': '/',
}

export function textoSeguro(texto: string): string {
  let salida = ''
  // El salto de línea se conserva (`partir` lo convierte en otra línea) y el
  // tabulador pasa a espacios: una nota escrita en un cuadro de varias líneas
  // no debe salir como «linea1?linea2».
  const normalizado = texto.replace(/\r\n?/g, '\n').replace(/\t/g, '  ')
  for (const caracter of normalizado) {
    if (caracter === '\n') {
      salida += caracter
      continue
    }
    const reemplazo = REEMPLAZOS[caracter]
    if (reemplazo !== undefined) {
      salida += reemplazo
      continue
    }
    const codigo = caracter.codePointAt(0) ?? 0
    const imprimible = (codigo >= 0x20 && codigo <= 0x7e) || (codigo >= 0xa0 && codigo <= 0xff)
    salida += imprimible ? caracter : '?'
  }
  // «raíz » seguido de espacio dejaría dos espacios: «√ K» → «raíz K».
  return salida.replace(/raíz {2}/g, 'raíz ')
}

// ---- Números ----

/** Lo que se imprime en lugar de un número que no es número (NaN, Infinity, texto…). */
export const DATO_INVALIDO = 'dato inválido'

/** Un número de verdad: ni NaN, ni infinito, ni otra cosa que se coló como número. */
export function esNumero(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor)
}

/** `null` y `undefined` son «no hay dato» (sin medir); lo demás que no sea número es un dato roto. */
export function faltaDato(valor: unknown): valor is null | undefined {
  return valor === null || valor === undefined
}

/** Cota o lectura a 3 decimales; `vacio` si no hay dato, «dato inválido» si no es número. */
export function textoCota(valor: number | null | undefined, vacio = '-'): string {
  if (faltaDato(valor)) return vacio
  return esNumero(valor) ? formatearCota(valor) : DATO_INVALIDO
}

/** «0+020»; una progresiva que no es número no sale como «NaN+NaN». */
export function textoProgresiva(valor: number): string {
  return esNumero(valor) ? formatearProgresiva(valor) : DATO_INVALIDO
}

/**
 * Milímetros con un decimal como mucho: «±8.5 mm», «±10 mm». Las tolerancias
 * del circuito (12 mm·√K) casi nunca son enteras, y el número crudo
 * (8.485281374238571) no se puede leer en una hoja de obra.
 */
export function formatearMm(valor: number): string {
  if (!esNumero(valor)) return DATO_INVALIDO
  const redondeado = Math.round(valor * 10) / 10
  // Evita un «-0» cuando el valor es una pizca negativa.
  return String(redondeado === 0 ? 0 : redondeado)
}

// ---- Diferencias y estados ----

/**
 * Medida − proyecto, en milímetros enteros. Se redondea primero a 3 decimales
 * en metros: 100.046 − 100 da 0.04599999… en binario, que sin esto se
 * imprimiría como 45 mm en vez de 46. NaN si alguno no es número: quien
 * llama lo trata como dato inválido.
 */
export function diferenciaMm(medida: number, proyecto: number): number {
  if (!esNumero(medida) || !esNumero(proyecto)) return Number.NaN
  const mm = Math.round(redondear3(medida - proyecto) * 1000)
  return mm === 0 ? 0 : mm
}

/**
 * El mismo semáforo que la pantalla (`estadoDeDiferencia` del núcleo). Si la
 * diferencia o la tolerancia no son números, `'datoInvalido'`: el núcleo
 * daría FUERA para un NaN, y eso sería una orden falsa para la máquina.
 */
export function estadoDe(difMm: number, toleranciaMm: number): EstadoInforme | 'datoInvalido' {
  if (!esNumero(difMm) || !esNumero(toleranciaMm) || toleranciaMm < 0) return 'datoInvalido'
  return estadoDeDiferencia(difMm, toleranciaMm) as EstadoInforme
}

export function palabraEstado(estado: EstadoInforme): string {
  if (estado === 'conforme') return 'CONFORME'
  if (estado === 'alLimite') return 'AL LÍMITE'
  return 'FUERA'
}

/** Positivo = sobra = corta; negativo = falta = rellena. */
export function textoCortaRellena(difMm: number): string {
  // Un NaN no es «en cota»: no hay nada que ordenar sobre un dato roto.
  if (!esNumero(difMm)) return DATO_INVALIDO
  if (difMm > 0) return `corta ${difMm} mm`
  if (difMm < 0) return `rellena ${-difMm} mm`
  return 'en cota'
}

/** «+46», «-23», «0»: el signo siempre a la vista. */
export function conSigno(difMm: number): string {
  return difMm > 0 ? `+${difMm}` : String(difMm)
}

// ---- Composición ----

type Pdf = InstanceType<typeof jsPDF>

interface Estado {
  doc: Pdf
  def: DefinicionInforme
  y: number
  logoValido: boolean
}

export function componerInforme(def: DefinicionInforme): Uint8Array {
  const tol = def.base.encabezado.toleranciaMm
  // Con una tolerancia rota todos los puntos saldrían FUERA (o ninguno): el
  // informe entero sería falso. Mejor no hacerlo y decir por qué.
  if (!esNumero(tol) || tol < 0)
    throw new Error(`La tolerancia de obra no es un número válido (≥ 0 mm): ${String(tol)}`)
  // Sin compresión: el texto queda legible en el archivo y las pruebas lo leen.
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: false })
  doc.setProperties({ title: textoSeguro(def.titulo), creator: 'App de topografía' })
  const estado: Estado = { doc, def, y: 0, logoValido: def.base.encabezado.logo !== undefined }
  dibujarEncabezado(estado)

  for (const seccion of def.secciones) {
    if (seccion.tipo === 'tabla') dibujarTabla(estado, seccion)
    else if (seccion.tipo === 'titulo') dibujarTitulo(estado, seccion.texto)
    else dibujarParrafo(estado, seccion.texto, seccion.resaltado ?? false)
  }

  dibujarNotas(estado)
  dibujarFirmas(estado)
  dibujarPies(doc)
  return new Uint8Array(doc.output('arraybuffer'))
}

function nuevaPagina(estado: Estado): void {
  estado.doc.addPage('a4', 'portrait')
  dibujarEncabezado(estado)
}

/** Si lo que viene no cabe, pasa a otra página. Devuelve si pasó. */
function asegurarEspacio(estado: Estado, alto: number): boolean {
  if (estado.y + alto <= LIMITE_INFERIOR) return false
  nuevaPagina(estado)
  return true
}

function dibujarEncabezado(estado: Estado): void {
  const { doc, def } = estado
  const e = def.base.encabezado
  let x = MARGEN
  let avisoLogo = false

  if (e.logo !== undefined && estado.logoValido) {
    try {
      doc.addImage(e.logo, MARGEN, 10, LOGO, LOGO)
      x = MARGEN + LOGO + 4
    } catch {
      // Un logo roto no impide el informe, pero se dice: nada se pierde en silencio.
      estado.logoValido = false
    }
  }
  if (e.logo !== undefined && !estado.logoValido) avisoLogo = true
  const ancho = ANCHO_PAGINA - MARGEN - x

  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(textoSeguro(def.titulo.toLocaleUpperCase('es')), x, 15)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  let y = 21
  const lineas = [
    `Obra: ${e.obra}`,
    `Calle: ${e.calle}    Capa: ${e.capa}    Tramo: ${e.tramo}`,
    `Fecha: ${e.fecha}    BM: ${e.bm.nombre} (cota ${textoCota(e.bm.cota)})    Tolerancia: ±${formatearMm(e.toleranciaMm)} mm`,
  ]
  if (avisoLogo) lineas.push('(logo no válido: no se incluyó)')
  for (const linea of lineas) {
    for (const trozo of partir(doc, linea, ancho)) {
      doc.text(trozo, x, y)
      y += INTERLINEA + 0.4
    }
  }
  y = Math.max(y, 10 + LOGO + 2)
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)
  doc.line(MARGEN, y - 1.5, ANCHO_PAGINA - MARGEN, y - 1.5)
  y += 1

  if (!def.base.comprobado) {
    // La franja va en todas las páginas: una hoja suelta también debe avisar.
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    const trozos = partir(doc, AVISO_SIN_COMPROBAR, ANCHO_UTIL - 6)
    const alto = trozos.length * INTERLINEA + 3
    doc.setFillColor(253, 226, 196)
    doc.setDrawColor(190, 40, 30)
    doc.setLineWidth(0.6)
    doc.rect(MARGEN, y, ANCHO_UTIL, alto, 'FD')
    doc.setTextColor(150, 20, 10)
    let yTexto = y + 4.2
    for (const trozo of trozos) {
      doc.text(trozo, MARGEN + 3, yTexto)
      yTexto += INTERLINEA
    }
    doc.setTextColor(0, 0, 0)
    y += alto + 3
  }
  doc.setFont('helvetica', 'normal')
  estado.y = y + 1
}

function partir(doc: Pdf, texto: string, ancho: number): string[] {
  // Cada salto de línea del texto es una línea propia; dentro de cada una,
  // jsPDF parte por ancho.
  const lineas = textoSeguro(texto)
    .split('\n')
    .flatMap((trozo) => doc.splitTextToSize(trozo, ancho) as string[])
  return lineas.length > 0 ? lineas : ['']
}

function dibujarTitulo(estado: Estado, texto: string): void {
  const { doc } = estado
  asegurarEspacio(estado, 12)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  estado.y += 2
  doc.text(textoSeguro(texto), MARGEN, estado.y + 3)
  estado.y += 7
  doc.setFont('helvetica', 'normal')
}

function dibujarParrafo(estado: Estado, texto: string, resaltado: boolean): void {
  const { doc } = estado
  doc.setFont('helvetica', resaltado ? 'bold' : 'normal')
  doc.setFontSize(9)
  for (const trozo of partir(doc, texto, ANCHO_UTIL)) {
    asegurarEspacio(estado, INTERLINEA + 1)
    doc.setFont('helvetica', resaltado ? 'bold' : 'normal')
    doc.setFontSize(9)
    doc.text(trozo, MARGEN, estado.y + 3)
    estado.y += INTERLINEA + 0.6
  }
  estado.y += 2
  doc.setFont('helvetica', 'normal')
}

function textoDeCelda(celda: Celda): string {
  if (typeof celda === 'string') return celda
  return celda.texto ?? palabraEstado(celda.estado)
}

function dibujarTabla(estado: Estado, tabla: Extract<Seccion, { tipo: 'tabla' }>): void {
  const { doc } = estado
  if (tabla.titulo !== undefined) dibujarTitulo(estado, tabla.titulo)
  if (tabla.filas.length === 0 && tabla.filaTotal === undefined) {
    dibujarParrafo(estado, 'Sin filas que mostrar.', false)
    return
  }

  const cabecera = () => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    const alto = altoDeFila(doc, tabla.columnas, tabla.columnas.map((c) => c.titulo), 0)
    doc.setFillColor(225, 225, 225)
    doc.setDrawColor(120, 120, 120)
    doc.setLineWidth(0.2)
    doc.rect(MARGEN, estado.y, anchoTotal(tabla.columnas), alto, 'FD')
    escribirFila(doc, tabla.columnas, tabla.columnas.map((c) => c.titulo), estado.y, 0)
    estado.y += alto
    doc.setFont('helvetica', 'normal')
  }

  // La cabecera no se queda sola al pie de una página: si no cabe con una fila, pasa entera.
  asegurarEspacio(estado, 16)
  cabecera()

  const todas: { celdas: Celda[]; total: boolean }[] = tabla.filas.map((celdas) => ({ celdas, total: false }))
  if (tabla.filaTotal !== undefined) todas.push({ celdas: tabla.filaTotal, total: true })

  for (const { celdas, total } of todas) {
    doc.setFont('helvetica', total ? 'bold' : 'normal')
    doc.setFontSize(8)
    const textos = celdas.map(textoDeCelda)
    const sangria = celdas.map((c) => (typeof c === 'string' ? 0 : 5))
    const alto = altoDeFila(doc, tabla.columnas, textos, 5)
    if (asegurarEspacio(estado, alto)) {
      cabecera()
      doc.setFont('helvetica', total ? 'bold' : 'normal')
      doc.setFontSize(8)
    }
    if (total) {
      doc.setFillColor(242, 242, 242)
      doc.rect(MARGEN, estado.y, anchoTotal(tabla.columnas), alto, 'F')
    }
    doc.setDrawColor(190, 190, 190)
    doc.setLineWidth(0.15)
    doc.line(MARGEN, estado.y + alto, MARGEN + anchoTotal(tabla.columnas), estado.y + alto)
    escribirFila(doc, tabla.columnas, textos, estado.y, sangria)

    let x = MARGEN
    celdas.forEach((celda, i) => {
      if (typeof celda !== 'string') dibujarSimbolo(doc, celda.estado, x + RELLENO_CELDA, estado.y + RELLENO_CELDA + 3)
      x += tabla.columnas[i]?.ancho ?? 0
    })
    estado.y += alto
  }
  doc.setFont('helvetica', 'normal')
  estado.y += 4
}

function anchoTotal(columnas: Columna[]): number {
  return columnas.reduce((suma, c) => suma + c.ancho, 0)
}

function altoDeFila(doc: Pdf, columnas: Columna[], textos: string[], sangriaMaxima: number): number {
  let lineas = 1
  columnas.forEach((col, i) => {
    const n = partir(doc, textos[i] ?? '', col.ancho - 2 * RELLENO_CELDA - sangriaMaxima).length
    lineas = Math.max(lineas, n)
  })
  return lineas * INTERLINEA + 2 * RELLENO_CELDA
}

function escribirFila(
  doc: Pdf,
  columnas: Columna[],
  textos: string[],
  y: number,
  sangria: number | number[],
): void {
  let x = MARGEN
  columnas.forEach((col, i) => {
    const s = Array.isArray(sangria) ? (sangria[i] ?? 0) : sangria
    const util = col.ancho - 2 * RELLENO_CELDA - s
    const lineas = partir(doc, textos[i] ?? '', util)
    lineas.forEach((linea, n) => {
      const yLinea = y + RELLENO_CELDA + 2.9 + n * INTERLINEA
      if (col.alinear === 'der') doc.text(linea, x + col.ancho - RELLENO_CELDA, yLinea, { align: 'right' })
      else if (col.alinear === 'centro') doc.text(linea, x + col.ancho / 2 + s / 2, yLinea, { align: 'center' })
      else doc.text(linea, x + RELLENO_CELDA + s, yLinea)
    })
    x += col.ancho
  })
}

/**
 * El símbolo del semáforo dibujado con líneas: las fuentes estándar no
 * tienen ✓ △ ✗. La palabra va al lado, así que el estado se entiende aunque
 * se imprima en blanco y negro.
 */
function dibujarSimbolo(doc: Pdf, estado: EstadoInforme, x: number, yBase: number): void {
  doc.setLineWidth(0.45)
  if (estado === 'conforme') {
    doc.setDrawColor(20, 130, 50)
    doc.line(x, yBase - 1.4, x + 1.1, yBase - 0.2)
    doc.line(x + 1.1, yBase - 0.2, x + 3.2, yBase - 3)
  } else if (estado === 'alLimite') {
    doc.setDrawColor(200, 130, 0)
    doc.triangle(x, yBase, x + 3.2, yBase, x + 1.6, yBase - 3, 'S')
  } else {
    doc.setDrawColor(190, 30, 30)
    doc.line(x, yBase - 3, x + 3, yBase)
    doc.line(x, yBase, x + 3, yBase - 3)
  }
  doc.setDrawColor(0, 0, 0)
}

function dibujarNotas(estado: Estado): void {
  const notas = estado.def.base.notas ?? []
  if (notas.length === 0) return
  dibujarTitulo(estado, 'Notas de campo')
  for (const nota of notas) dibujarParrafo(estado, `- ${nota}`, false)
}

function dibujarFirmas(estado: Estado): void {
  const e = estado.def.base.encabezado
  const hayNombres = e.topografo !== undefined || e.supervisor !== undefined
  if (!(estado.def.base.firmas ?? hayNombres)) return
  const { doc } = estado
  asegurarEspacio(estado, 32)
  const yLinea = estado.y + 20
  const firmas: [string, string | undefined][] = [
    ['Topógrafo', e.topografo],
    ['Supervisor', e.supervisor],
  ]
  firmas.forEach(([cargo, nombre], i) => {
    const x = MARGEN + 10 + i * 95
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.3)
    doc.line(x, yLinea, x + 65, yLinea)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(textoSeguro(cargo), x + 32.5, yLinea + 4.5, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    // Un nombre con saltos de línea iría encima de la firma de al lado: en una línea.
    if (nombre !== undefined)
      doc.text(textoSeguro(nombre).replace(/\n/g, ' '), x + 32.5, yLinea + 9, { align: 'center' })
  })
  estado.y = yLinea + 12
}

function dibujarPies(doc: Pdf): void {
  const total = doc.getNumberOfPages()
  for (let pagina = 1; pagina <= total; pagina++) {
    doc.setPage(pagina)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(0, 0, 0)
    doc.text(textoSeguro(`Página ${pagina} de ${total}`), ANCHO_PAGINA - MARGEN, ALTO_PAGINA - 10, {
      align: 'right',
    })
  }
}
