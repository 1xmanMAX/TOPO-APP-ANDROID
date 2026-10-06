/**
 * Lector de planos DXF: convierte el texto de un archivo DXF en un plano
 * vectorial sencillo —capas, polilíneas y textos— que la app puede dibujar
 * debajo de las pistas.
 *
 * El análisis de grupos lo hace `dxf-parser` (MIT). Aquí se decide qué se
 * dibuja y cómo: los arcos y círculos se aproximan con segmentos, los textos
 * se limpian de códigos de formato y las cotas se leen como número.
 *
 * Nada se pierde en silencio: lo que no se dibuja (bloques insertados,
 * rayados, cotas acotadas de CAD, entidades en espacio papel…) se cuenta en
 * `ignoradas` por tipo y en `ignoradasDetalle` con su motivo, para que la
 * pantalla pueda decir «no se mostraron 3 INSERT». `dxf-parser` descarta sin
 * avisar los tipos que no conoce (HATCH, por ejemplo) y no lee algunos grupos
 * que hacen falta (la extrusión del CIRCLE y del TEXT, la elevación de la
 * POLYLINE), por eso además se recorren los grupos crudos de la sección
 * ENTITIES.
 *
 * Sin coordenadas UTM ni conversión de unidades: el plano queda en su propio
 * sistema y las distancias se calibran después (`unidades`, si el archivo la
 * declara, sirve para prellenar esa calibración).
 */
import DxfParser from 'dxf-parser'
import type {
  IArcEntity,
  ICircleEntity,
  IDxf,
  IEntity,
  ILineEntity,
  ILwpolylineEntity,
  IMtextEntity,
  IPolylineEntity,
  ITextEntity,
} from 'dxf-parser'
import { valorDeCota } from './cotas'

/**
 * La regla de cotas es una sola para DXF y PDF y vive en cotas.ts; se
 * reexporta para quien ya la importaba desde aquí.
 */
export { valorDeCota }

// ─── Tipos del plano ──────────────────────────────────────────────────────

export interface PuntoPlano {
  x: number
  y: number
}

export interface CapaPlano {
  nombre: string
  /** Color de la capa en hexadecimal, "#rrggbb". */
  color: string
  /** Falso si la capa está apagada o congelada en el archivo. */
  visible: boolean
}

export interface PolilineaPlano {
  capa: string
  /** Si `cerrada`, el primer punto NO se repite al final. */
  puntos: PuntoPlano[]
  cerrada: boolean
  /** Color propio de la entidad, "#rrggbb"; si no está, se dibuja con el de su capa. */
  color?: string
  /**
   * Elevación de la polilínea (la cota de una curva de nivel). Solo si el
   * archivo la trae distinta de 0: 0 es lo que escriben los programas
   * cuando no hay cota.
   */
  elevacion?: number
}

/**
 * Punto del rótulo que coincide con (x, y): fila (base de la letra, abajo,
 * medio, arriba) y columna. Así la pantalla puede dibujar un texto centrado
 * o alineado a la derecha donde el proyectista lo puso.
 */
export type AnclaTexto = `${'base' | 'abajo' | 'medio' | 'arriba'}-${'izquierda' | 'centro' | 'derecha'}`

export interface TextoPlano {
  capa: string
  /** Texto ya limpio de códigos de formato. */
  texto: string
  /** El punto del texto que indica `ancla`. */
  x: number
  y: number
  altura: number
  /**
   * Giro en grados contra el reloj desde +X, en el sistema del dibujo. El
   * lector DXF siempre lo pone; es opcional porque el lector PDF comparte
   * este tipo y puede no saberlo (si falta: 0).
   */
  rotacion?: number
  /** Qué punto del rótulo es (x, y). Igual que `rotacion`: si falta, 'base-izquierda'. */
  ancla?: AnclaTexto
  /** La cota, si el texto es una cota; si no, null. */
  valor: number | null
  /** Color propio de la entidad, "#rrggbb"; si no está, el de su capa. */
  color?: string
  /**
   * Si el texto se lee como número pero NO se tomó por cota, el porqué
   * (p. ej. un «3.60» de ancho entre cotas de 3244 m). Así no se pierde
   * en silencio: la pantalla puede listarlo.
   */
  descarteCota?: string
}

export interface LimitesPlano {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Unidades de dibujo declaradas en $INSUNITS. */
export type UnidadesPlano = 'm' | 'cm' | 'mm' | 'km' | 'pulg' | 'pie'

/** Por qué una entidad no se dibujó. */
export type MotivoIgnorada =
  | 'no soportada'
  | 'espacio papel'
  | 'degenerada'
  | 'coordenada inválida'
  | 'malla'
  | 'spline sin curva'
  | 'vacío'
  | 'sin posición'
  | 'no leída'

export interface IgnoradaPlano {
  tipo: string
  motivo: MotivoIgnorada
  cantidad: number
}

export interface PlanoVectorial {
  capas: CapaPlano[]
  polilineas: PolilineaPlano[]
  textos: TextoPlano[]
  limites: LimitesPlano
  /** Cantidad de entidades no dibujadas, por tipo de entidad (sea cual sea el motivo). */
  ignoradas: Record<string, number>
  /** Las mismas, separadas por tipo y motivo, en el orden en que aparecieron. */
  ignoradasDetalle: IgnoradaPlano[]
  /** Unidades de dibujo, si el archivo las declara ($INSUNITS); si no, no se adivinan. */
  unidades?: UnidadesPlano
}

export interface EjeCandidato extends PolilineaPlano {
  largo: number
  /** De cuántas entidades del archivo se armó (1 si venía entera). */
  piezas: number
}

/** Error con un mensaje en español que se puede mostrar tal cual a Max. */
export class ErrorDxf extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorDxf'
  }
}

// ─── Constantes ───────────────────────────────────────────────────────────

/**
 * Paso angular con que se aproximan arcos y círculos. Con 2° la cuerda
 * difiere del arco en 1 − sen(1°)/(π/180) ≈ 5·10⁻⁵: 5 mm en 100 m de eje
 * curvo, por debajo de lo que se lee en una mira.
 */
const PASO_ARCO = (2 * Math.PI) / 180

/** Dos extremos a menos de 1 mm se consideran el mismo punto (planos en metros). */
const TOLERANCIA_UNION = 0.001

/**
 * Giro máximo entre dos piezas para unirlas en un solo eje. Una tangente y
 * su curva se tocan sin giro (la primera cuerda de 2° se desvía 1°); dos
 * calles que se encuentran en una esquina giran mucho más.
 */
const GIRO_MAXIMO_UNION = 30

/**
 * Un número suelto (sin prefijo de cota) que se aleja más que esto de las
 * cotas del plano no se toma por cota: en un plano de pistas las cotas
 * difieren unas decenas de metros, y un «3.60» de ancho o un «120.50» de
 * área junto al eje falsearían las pendientes.
 */
const ALEJAMIENTO_MAXIMO_COTA = 100

const TIPOS_SOPORTADOS = new Set(['LINE', 'LWPOLYLINE', 'POLYLINE', 'TEXT', 'MTEXT', 'ARC', 'CIRCLE'])

/**
 * Entidades que no son de primer nivel: pertenecen a la anterior (los
 * vértices y el fin de una POLYLINE, los atributos de un INSERT).
 */
const SUBENTIDADES = new Set(['VERTEX', 'SEQEND', 'ATTRIB'])

/**
 * Colores ACI con nombre propio, en la versión clásica de la paleta. El resto
 * de los 255 sale de la paleta de dxf-parser. El 7 es «blanco o negro según
 * el fondo»: aquí blanco, y la pantalla lo invierte si dibuja sobre fondo
 * claro.
 */
const ACI_HEX: Record<number, string> = {
  1: '#ff0000',
  2: '#ffff00',
  3: '#00ff00',
  4: '#00ffff',
  5: '#0000ff',
  6: '#ff00ff',
  7: '#ffffff',
  8: '#808080',
  9: '#c0c0c0',
  250: '#333333',
  251: '#505050',
  252: '#696969',
  253: '#828282',
  254: '#bebebe',
  255: '#ffffff',
}
const GRIS = '#808080'

/** Color de una capa que se usa en el dibujo pero no está en la tabla: el 7, como hace AutoCAD. */
const COLOR_CAPA_SIN_TABLA = 7

/** $INSUNITS → unidades. 0 es «sin unidades» y los demás códigos (yardas, millas, ángstrom…) no se usan en obra. */
const UNIDADES_INSUNITS: Record<number, UnidadesPlano> = { 1: 'pulg', 2: 'pie', 4: 'mm', 5: 'cm', 6: 'm', 7: 'km' }

// ─── Funciones públicas sueltas ───────────────────────────────────────────

/** Índice de color de AutoCAD → "#rrggbb". 0 (por bloque) y 256 (por capa) no son colores: gris. */
export function aciAHex(indice: number): string {
  const propio = ACI_HEX[indice]
  if (propio) return propio
  if (!Number.isInteger(indice) || indice < 1 || indice > 255) return GRIS
  const rgb = paletaDeLaLibreria()[indice]
  return rgb === undefined ? GRIS : rgbAHex(rgb)
}

function rgbAHex(rgb: number): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`
}

let paletaEnMemoria: Record<number, number> | null = null

/**
 * La paleta ACI completa tal como la trae dxf-parser. La librería no la
 * exporta, pero sí la usa para el color de las capas: se le da a leer una
 * tabla con las 255 capas una sola vez y se guarda lo que devuelve. Así el
 * color de una capa y el de `aciAHex` nunca difieren.
 */
function paletaDeLaLibreria(): Record<number, number> {
  if (paletaEnMemoria) return paletaEnMemoria
  let tabla = '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n'
  for (let i = 1; i <= 255; i++) tabla += `0\nLAYER\n2\nC${i}\n70\n0\n62\n${i}\n`
  tabla += '0\nENDTAB\n0\nENDSEC\n0\nEOF\n'
  const paleta: Record<number, number> = {}
  const capas = new DxfParser().parseSync(tabla)?.tables?.layer?.layers ?? {}
  for (const capa of Object.values(capas)) if (capa?.colorIndex) paleta[capa.colorIndex] = capa.color
  paletaEnMemoria = paleta
  return paleta
}

/**
 * Quita los códigos de formato de un MTEXT y deja el texto que se ve.
 *
 * \P (salto de párrafo) y \~ (espacio duro) quedan como espacio; \S1^2;
 * (apilado) queda "1/2"; \\ \{ \} son los caracteres literales; \U+XXXX es
 * el carácter Unicode; las llaves sueltas agrupan formato y se van; los
 * códigos con argumento (\f…; \H…; \C…; \W…; \Q…; \T…; \A…; \p…;) se borran
 * enteros, y los conmutadores \L \l \O \o \K \k también.
 */
export function limpiarMtext(crudo: string): string {
  let salida = ''
  let i = 0
  while (i < crudo.length) {
    const c = crudo[i]!
    if (c === '{' || c === '}') {
      i++
      continue
    }
    if (c !== '\\') {
      salida += c
      i++
      continue
    }
    const codigo = crudo[i + 1]
    if (codigo === undefined) {
      i++
      continue
    }
    if (codigo === '\\' || codigo === '{' || codigo === '}') {
      salida += codigo
      i += 2
    } else if (codigo === 'P' || codigo === 'X' || codigo === '~') {
      salida += ' '
      i += 2
    } else if (codigo === 'U' && /^\+[0-9A-Fa-f]{4}/.test(crudo.slice(i + 2))) {
      salida += String.fromCodePoint(parseInt(crudo.slice(i + 3, i + 7), 16))
      i += 7
    } else if (codigo === 'S') {
      const fin = crudo.indexOf(';', i)
      const apilado = fin < 0 ? crudo.slice(i + 2) : crudo.slice(i + 2, fin)
      salida += apilado.replace(/[\^#]/, '/')
      i = fin < 0 ? crudo.length : fin + 1
    } else if ('LlOoKkNn'.includes(codigo)) {
      i += 2
    } else if ('fFHWQTACcp'.includes(codigo)) {
      const fin = crudo.indexOf(';', i)
      i = fin < 0 ? crudo.length : fin + 1
    } else {
      // Un código que no se conoce: se deja la letra, que es más honesto que borrarla.
      salida += codigo
      i += 2
    }
  }
  return salida.replace(/\s+/g, ' ').trim()
}

/** Los códigos %% de un TEXT de una línea, más \U+XXXX que también aparece ahí. */
function limpiarTexto(crudo: string): string {
  return crudo
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/%%[uUoOkK]/g, '')
    .replace(/%%%/g, '%')
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .trim()
}

/** Largo de una polilínea, contando el lado de cierre si está cerrada. */
export function largoPolilinea(p: Pick<PolilineaPlano, 'puntos' | 'cerrada'>): number {
  let largo = 0
  for (let i = 1; i < p.puntos.length; i++) largo += distancia(p.puntos[i - 1]!, p.puntos[i]!)
  if (p.cerrada && p.puntos.length > 2) largo += distancia(p.puntos[p.puntos.length - 1]!, p.puntos[0]!)
  return largo
}

// ─── Lector ───────────────────────────────────────────────────────────────

/** Lo que se saca de los grupos crudos de una entidad y dxf-parser no lee. */
interface DatosCrudos {
  /** Grupo 230: Z de la dirección de extrusión. */
  extrusionZ?: number
  /** Grupo 30 de la entidad (en la cabeza de una POLYLINE es su elevación). */
  z?: number
}

interface LecturaCruda {
  /** Entidades de primer nivel de ENTITIES, por tipo. */
  cuenta: Record<string, number>
  /** Los datos crudos de cada entidad, por tipo y en el orden del archivo. */
  datos: Record<string, DatosCrudos[]>
}

/**
 * Lee un DXF en texto (ASCII). Lanza `ErrorDxf` con un mensaje en español si
 * el archivo está vacío, no es DXF, es DXF binario, está cortado o no tiene
 * nada que dibujar.
 */
export function leerDxf(texto: string): PlanoVectorial {
  if (texto.trim() === '') throw new ErrorDxf('El archivo está vacío.')
  if (texto.startsWith('AutoCAD Binary DXF')) {
    throw new ErrorDxf(
      'Es un DXF binario y la app solo lee DXF en texto. Ábralo en su programa de CAD y guárdelo como «DXF ASCII».',
    )
  }
  const crudas = leerGruposCrudos(texto)
  if (crudas === null) {
    throw new ErrorDxf('El archivo no es un DXF: no empieza con una sección (0 / SECTION). Si es un DWG, conviértalo a DXF.')
  }

  let dxf: IDxf | null
  try {
    dxf = new DxfParser().parseSync(texto)
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    throw new ErrorDxf(`El DXF está incompleto o dañado y no se pudo leer (${detalle}).`)
  }
  if (!dxf) throw new ErrorDxf('El DXF está incompleto o dañado y no se pudo leer.')

  const ignoradas: Record<string, number> = {}
  const ignoradasDetalle: IgnoradaPlano[] = []
  const anotar = (tipo: string, motivo: MotivoIgnorada, n = 1) => {
    ignoradas[tipo] = (ignoradas[tipo] ?? 0) + n
    const fila = ignoradasDetalle.find((f) => f.tipo === tipo && f.motivo === motivo)
    if (fila) fila.cantidad += n
    else ignoradasDetalle.push({ tipo, motivo, cantidad: n })
  }

  // Lo que la librería ni siquiera lee, o lee pero aquí no se dibuja.
  for (const [tipo, n] of Object.entries(crudas.cuenta)) if (!TIPOS_SOPORTADOS.has(tipo)) anotar(tipo, 'no soportada', n)

  const entidades = (dxf.entities ?? []).filter((e) => TIPOS_SOPORTADOS.has(e.type))
  const leidasPorTipo: Record<string, number> = {}
  for (const e of entidades) leidasPorTipo[e.type] = (leidasPorTipo[e.type] ?? 0) + 1

  const polilineas: PolilineaPlano[] = []
  const textos: TextoPlano[] = []
  const ordinal: Record<string, number> = {}

  for (const e of entidades) {
    const k = ordinal[e.type] ?? 0
    ordinal[e.type] = k + 1
    // Los datos crudos se emparejan por orden dentro de cada tipo, y solo si
    // la librería leyó todas las de ese tipo; si no, el orden ya no cuadra.
    const datos = crudas.cuenta[e.type] === leidasPorTipo[e.type] ? crudas.datos[e.type]?.[k] ?? {} : {}
    if (e.inPaperSpace) {
      // El espacio papel es la lámina de impresión (rótulo, marcos), en otra
      // escala: mezclarlo con el dibujo del modelo lo deformaría.
      anotar(e.type, 'espacio papel')
      continue
    }
    const resultado = convertir(e, e.layer ?? '0', datos)
    if (typeof resultado === 'string') {
      anotar(e.type, resultado)
      continue
    }
    const color = colorPropio(e)
    if (color) resultado.color = color
    if ('texto' in resultado) textos.push(resultado)
    else polilineas.push(resultado)
  }

  // Si la librería leyó menos entidades de las que hay en el archivo, la
  // diferencia también se dice.
  for (const tipo of TIPOS_SOPORTADOS) {
    const faltan = (crudas.cuenta[tipo] ?? 0) - (leidasPorTipo[tipo] ?? 0)
    if (faltan > 0) anotar(tipo, 'no leída', faltan)
  }

  if (polilineas.length === 0 && textos.length === 0) {
    const lista = ignoradasDetalle
      .map((f) => (f.motivo === 'no soportada' ? `${f.tipo}: ${f.cantidad}` : `${f.tipo} (${f.motivo}): ${f.cantidad}`))
      .join(', ')
    throw new ErrorDxf(`El DXF está vacío: no tiene nada que dibujar${lista ? ` (se ignoraron ${lista})` : ''}.`)
  }

  const plano: PlanoVectorial = {
    capas: armarCapas(dxf, polilineas, textos),
    polilineas,
    textos: descartarNumerosAjenos(textos),
    limites: calcularLimites(polilineas, textos),
    ignoradas,
    ignoradasDetalle,
  }
  const unidades = UNIDADES_INSUNITS[Number(dxf.header?.['$INSUNITS'])]
  if (unidades) plano.unidades = unidades
  return plano
}

/**
 * Recorre los pares código/valor sin interpretar nada: cuenta las entidades
 * de primer nivel de la sección ENTITIES por tipo y guarda de cada una los
 * grupos que dxf-parser no lee. Devuelve null si el texto no empieza como un
 * DXF.
 */
function leerGruposCrudos(texto: string): LecturaCruda | null {
  const lineas = texto.split(/\r\n|\r|\n/)
  const cuenta: Record<string, number> = {}
  const datos: Record<string, DatosCrudos[]> = {}
  let i = 0
  // Los comentarios (999) pueden ir antes de la primera sección.
  while (i + 1 < lineas.length && lineas[i]!.trim() === '999') i += 2
  if (lineas[i]?.trim() !== '0' || lineas[i + 1]?.trim() !== 'SECTION') return null

  let seccion = ''
  let esperandoNombre = false
  /** Los datos de la entidad de primer nivel que se está leyendo (null dentro de un VERTEX). */
  let actual: DatosCrudos | null = null
  for (; i + 1 < lineas.length; i += 2) {
    const codigo = lineas[i]!.trim()
    const valor = lineas[i + 1]!.trim()
    if (esperandoNombre && codigo === '2') {
      seccion = valor
      esperandoNombre = false
      continue
    }
    if (codigo !== '0') {
      if (actual && codigo === '230') actual.extrusionZ = Number(valor)
      else if (actual && codigo === '30') actual.z = Number(valor)
      continue
    }
    actual = null
    if (valor === 'SECTION') {
      esperandoNombre = true
    } else if (valor === 'ENDSEC') {
      seccion = ''
    } else if (valor === 'EOF') {
      break
    } else if (seccion === 'ENTITIES' && !SUBENTIDADES.has(valor)) {
      cuenta[valor] = (cuenta[valor] ?? 0) + 1
      actual = {}
      ;(datos[valor] ??= []).push(actual)
    }
  }
  return { cuenta, datos }
}

/** Una entidad soportada → polilínea o texto; o el motivo por el que no sirve. */
function convertir(e: IEntity, capa: string, crudos: DatosCrudos): PolilineaPlano | TextoPlano | MotivoIgnorada {
  switch (e.type) {
    case 'LINE': {
      const v = (e as ILineEntity).vertices ?? []
      return polilineaValida(capa, v.slice(0, 2).map(xy), false)
    }
    case 'LWPOLYLINE': {
      const lw = e as ILwpolylineEntity
      const puntos = conBulges(lw.vertices ?? [], lw.shape === true)
      return conElevacion(polilineaValida(capa, espejoOcs(puntos, lw.extrusionDirectionZ), lw.shape === true), lw.elevation)
    }
    case 'POLYLINE': {
      const pl = e as IPolylineEntity
      // Las mallas (de caras o de polígonos) son superficies 3D, no líneas.
      if (pl.isPolyfaceMesh || pl.is3dPolygonMesh) return 'malla'
      let vertices = pl.vertices ?? []
      if (pl.includesSplineFitVertices) {
        // Una POLYLINE con ajuste spline trae dos juegos de vértices: el
        // marco de control (bandera 16) y los puntos de la curva (bandera 8).
        // Lo que se ve es la curva; el marco es un polígono de ayuda.
        vertices = vertices.filter((v) => !v.splineControlPoint)
        // Sin puntos de curva habría que calcular la spline, y un marco
        // dibujado como si fuera la curva daría largos y progresivas falsos.
        if (vertices.length === 0) return 'spline sin curva'
      }
      const puntos = conBulges(vertices, pl.shape === true)
      const resultado = polilineaValida(capa, espejoOcs(puntos, pl.extrusionDirection?.z), pl.shape === true)
      // En una polilínea 3D cada vértice tiene su Z: no hay una sola elevación.
      return pl.is3dPolyline ? resultado : conElevacion(resultado, crudos.z)
    }
    case 'ARC': {
      const a = e as IArcEntity
      if (!a.center || !(a.radius > 0)) return 'degenerada'
      let barrido = (a.endAngle ?? 0) - (a.startAngle ?? 0)
      if (barrido <= 0) barrido += 2 * Math.PI
      const puntos = puntosDeArco(xy(a.center), a.radius, a.startAngle ?? 0, barrido, true)
      return polilineaValida(capa, espejoOcs(puntos, a.extrusionDirectionZ), false)
    }
    case 'CIRCLE': {
      const c = e as ICircleEntity
      if (!c.center || !(c.radius > 0)) return 'degenerada'
      // Cerrada: el último punto (igual al primero) no se repite.
      const puntos = puntosDeArco(xy(c.center), c.radius, 0, 2 * Math.PI, false)
      // dxf-parser no lee la extrusión del círculo: viene de los grupos crudos.
      return polilineaValida(capa, espejoOcs(puntos, crudos.extrusionZ), true)
    }
    case 'TEXT':
      return convertirText(e as ITextEntity, capa, crudos)
    case 'MTEXT': {
      const t = e as IMtextEntity
      // El punto 10 del MTEXT está en el sistema del dibujo: no se espeja.
      const d = t.directionVector
      const rotacion = d && (d.x !== 0 || d.y !== 0) ? grados(Math.atan2(d.y, d.x)) : t.rotation ?? 0
      return textoValido(capa, limpiarTexto(limpiarMtext(t.text ?? '')), t.position, t.height, rotacion, anclaMtext(t.attachmentPoint))
    }
  }
  return 'no soportada'
}

/**
 * TEXT de una línea. Qué punto manda depende de la justificación (72 = h,
 * 73 = v): con «izquierda/base» el 10; con «alineado» (3) o «ajustado» (5)
 * el texto va del 10 al 11, así que manda el 10 y el giro sale de esa línea;
 * con las demás, el 11.
 */
function convertirText(t: ITextEntity, capa: string, crudos: DatosCrudos): TextoPlano | MotivoIgnorada {
  const h = t.halign ?? 0
  const v = t.valign ?? 0
  const entreDosPuntos = h === 3 || h === 5
  let p = t.startPoint
  let rotacion = t.rotation ?? 0
  let ancla: AnclaTexto = 'base-izquierda'
  if (entreDosPuntos) {
    if (t.startPoint && t.endPoint) {
      rotacion = grados(Math.atan2(t.endPoint.y - t.startPoint.y, t.endPoint.x - t.startPoint.x))
    }
  } else if (h === 4) {
    // «Medio»: el centro del texto, a lo alto y a lo ancho.
    p = t.endPoint ?? t.startPoint
    ancla = 'medio-centro'
  } else if (h !== 0 || v !== 0) {
    p = t.endPoint ?? t.startPoint
    const fila = (['base', 'abajo', 'medio', 'arriba'] as const)[v] ?? 'base'
    const columna = (['izquierda', 'centro', 'derecha'] as const)[h] ?? 'izquierda'
    ancla = `${fila}-${columna}`
  }
  // Con extrusión −Z el TEXT está espejado como un arco: x cambia de signo y
  // el giro θ se ve como 180° − θ.
  if (p && crudos.extrusionZ !== undefined && crudos.extrusionZ < 0) {
    p = { ...p, x: -p.x }
    rotacion = 180 - rotacion
  }
  return textoValido(capa, limpiarTexto(t.text ?? ''), p, t.textHeight, rotacion, ancla)
}

/** Grupo 71 del MTEXT: 1-3 arriba, 4-6 medio, 7-9 abajo; izquierda, centro, derecha. Por defecto 1. */
function anclaMtext(adjunto: number | undefined): AnclaTexto {
  const i = adjunto !== undefined && adjunto >= 1 && adjunto <= 9 ? adjunto - 1 : 0
  const fila = (['arriba', 'medio', 'abajo'] as const)[Math.floor(i / 3)]!
  const columna = (['izquierda', 'centro', 'derecha'] as const)[i % 3]!
  return `${fila}-${columna}`
}

/**
 * Valida y limpia los puntos. Si alguna coordenada no es un número, se
 * rechaza la entidad entera: quitar solo ese vértice cambiaría la forma sin
 * que nadie se entere.
 */
function polilineaValida(capa: string, puntos: PuntoPlano[], cerrada: boolean): PolilineaPlano | MotivoIgnorada {
  if (!puntos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return 'coordenada inválida'
  // Los repetidos seguidos no dibujan nada y estorban al calcular direcciones.
  // Se compara con el último que quedó, no con el anterior del archivo.
  const limpios: PuntoPlano[] = []
  for (const p of puntos) {
    const ultimo = limpios[limpios.length - 1]
    if (!ultimo || distancia(p, ultimo) > 0) limpios.push(p)
  }
  if (cerrada && limpios.length > 1 && distancia(limpios[0]!, limpios[limpios.length - 1]!) === 0) limpios.pop()
  if (limpios.length < 2) return 'degenerada'
  return { capa, puntos: limpios, cerrada }
}

function conElevacion(
  resultado: PolilineaPlano | MotivoIgnorada,
  elevacion: number | undefined,
): PolilineaPlano | MotivoIgnorada {
  if (typeof resultado !== 'string' && elevacion !== undefined && Number.isFinite(elevacion) && elevacion !== 0) {
    resultado.elevacion = elevacion
  }
  return resultado
}

function textoValido(
  capa: string,
  texto: string,
  p: { x: number; y: number } | undefined,
  altura: number | undefined,
  rotacion: number,
  ancla: AnclaTexto,
): TextoPlano | MotivoIgnorada {
  if (texto === '') return 'vacío'
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return 'sin posición'
  return {
    capa,
    texto,
    x: p.x,
    y: p.y,
    altura: altura ?? 0,
    rotacion: Number.isFinite(rotacion) ? redondearGiro(rotacion) : 0,
    ancla,
    valor: valorDeCota(texto),
  }
}

/**
 * Color propio de la entidad, o undefined si se dibuja con el de su capa.
 * dxf-parser deja en `colorIndex` el grupo 62 y en `color` el RGB (el del
 * índice, o el del grupo 420 de color verdadero, que manda si está).
 */
function colorPropio(e: IEntity): string | undefined {
  const indice = e.colorIndex
  // 0 = por bloque, 256 = por capa: no son un color de la entidad.
  if (indice === 0 || indice === 256) return undefined
  if (e.color === undefined) return undefined
  if (indice !== undefined && indice >= 1 && indice <= 255 && paletaDeLaLibreria()[indice] === e.color) {
    return aciAHex(indice)
  }
  return rgbAHex(e.color)
}

// ─── Cotas plausibles ─────────────────────────────────────────────────────

/** El texto lleva letras delante del número (NTN, COTA:, BM-1…): el proyectista dijo que es cota. */
function tienePrefijo(texto: string): boolean {
  return /^\s*[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(texto)
}

function esCapaDeCotas(nombre: string): boolean {
  return /COTA|NIVEL|ELEV|RASANT|NTN|NPT/.test(normalizar(nombre))
}

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 === 1 ? v[m]! : (v[m - 1]! + v[m]!) / 2
}

/**
 * Los números sueltos (sin prefijo) que quedan muy lejos de las cotas del
 * plano no son cotas: anchos de calzada, espesores, áreas. La referencia es
 * la mediana de las cotas seguras (con prefijo o en una capa de cotas); si
 * no hay ninguna, la de todos los números. El texto queda en la lista, sin
 * valor y con el motivo.
 */
function descartarNumerosAjenos(textos: TextoPlano[]): TextoPlano[] {
  const conValor = textos.filter((t) => t.valor !== null)
  if (conValor.length === 0) return textos
  const seguras = conValor.filter((t) => tienePrefijo(t.texto) || esCapaDeCotas(t.capa))
  const referencia = mediana((seguras.length > 0 ? seguras : conValor).map((t) => t.valor!))
  for (const t of conValor) {
    if (tienePrefijo(t.texto) || Math.abs(t.valor! - referencia) <= ALEJAMIENTO_MAXIMO_COTA) continue
    t.descarteCota =
      `número lejos de las demás cotas del plano (mediana ${referencia.toFixed(3)} m): ` +
      'se deja sin valor de cota; si lo es, escríbalo con prefijo (NTN, COTA…)'
    t.valor = null
  }
  return textos
}

// ─── Geometría ────────────────────────────────────────────────────────────

function xy(p: { x: number; y: number }): PuntoPlano {
  return { x: p.x, y: p.y }
}

function distancia(a: PuntoPlano, b: PuntoPlano): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function grados(radianes: number): number {
  return (radianes * 180) / Math.PI
}

/** Giro a 1e-6 grados: quita colas como 90.00000000000001 sin perder nada que se vea. */
function redondearGiro(g: number): number {
  return Number(g.toFixed(6)) || 0
}

/**
 * Puntos de un arco desde `inicio` barriendo `barrido` radianes (positivo =
 * contra el reloj), uno cada PASO_ARCO como máximo. `conFinal` decide si se
 * incluye el último punto (no en un círculo, donde coincide con el primero).
 */
function puntosDeArco(
  centro: PuntoPlano,
  radio: number,
  inicio: number,
  barrido: number,
  conFinal: boolean,
): PuntoPlano[] {
  // El redondeo evita que 90°/2° dé 45.0000001 y salga un segmento de más.
  const n = Math.max(1, Math.ceil(Number((Math.abs(barrido) / PASO_ARCO).toFixed(9))))
  const puntos: PuntoPlano[] = []
  for (let k = 0; k <= (conFinal ? n : n - 1); k++) {
    const a = inicio + (barrido * k) / n
    puntos.push({ x: centro.x + radio * Math.cos(a), y: centro.y + radio * Math.sin(a) })
  }
  return puntos
}

/**
 * Vértices con bulge → puntos, con los tramos curvos aproximados.
 *
 * bulge = tan(θ/4), con θ el ángulo del arco entre un vértice y el
 * siguiente; positivo gira contra el reloj. Con media cuerda s y flecha
 * h = bulge·s, el radio (con signo) es r = (s² + h²) / (2h), y el centro
 * está sobre la mediatriz, a (r − h) del punto medio hacia la izquierda del
 * avance. Así el signo lleva solo el centro al lado correcto, también en
 * arcos de más de media vuelta.
 */
function conBulges(
  vertices: readonly { x: number; y: number; bulge?: number }[],
  cerrada: boolean,
): PuntoPlano[] {
  const puntos: PuntoPlano[] = []
  const n = vertices.length
  for (let i = 0; i < n; i++) {
    const v = vertices[i]!
    puntos.push(xy(v))
    const esUltimo = i === n - 1
    if (esUltimo && !cerrada) break
    const sig = vertices[esUltimo ? 0 : i + 1]!
    const bulge = v.bulge ?? 0
    if (bulge === 0) continue
    const s = distancia(v, sig) / 2
    if (!(s > 0)) continue
    const h = bulge * s
    const r = (s * s + h * h) / (2 * h)
    const medio = { x: (v.x + sig.x) / 2, y: (v.y + sig.y) / 2 }
    const izq = { x: -(sig.y - v.y) / (2 * s), y: (sig.x - v.x) / (2 * s) }
    const centro = { x: medio.x + izq.x * (r - h), y: medio.y + izq.y * (r - h) }
    const inicio = Math.atan2(v.y - centro.y, v.x - centro.x)
    const barrido = 4 * Math.atan(bulge)
    const arco = puntosDeArco(centro, Math.abs(r), inicio, barrido, false)
    // Se salta el primero (es el vértice, ya puesto); el final lo pone el siguiente vértice.
    puntos.push(...arco.slice(1))
    if (esUltimo) break
  }
  // En una cerrada, el arco del último vértice al primero ya quedó sin repetir el primero.
  return puntos
}

/**
 * Las entidades planas con extrusión (0, 0, −1) están en un sistema espejado
 * —lo deja así el comando «simetría» de AutoCAD—: su X es la −X del dibujo.
 */
function espejoOcs(puntos: PuntoPlano[], extrusionZ: number | undefined): PuntoPlano[] {
  return extrusionZ !== undefined && extrusionZ < 0 ? puntos.map((p) => ({ x: -p.x, y: p.y })) : puntos
}

function calcularLimites(polilineas: PolilineaPlano[], textos: TextoPlano[]): LimitesPlano {
  const l = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const sumar = (p: PuntoPlano) => {
    l.minX = Math.min(l.minX, p.x)
    l.minY = Math.min(l.minY, p.y)
    l.maxX = Math.max(l.maxX, p.x)
    l.maxY = Math.max(l.maxY, p.y)
  }
  for (const p of polilineas) p.puntos.forEach(sumar)
  for (const t of textos) sumar(t)
  return l
}

// ─── Capas ────────────────────────────────────────────────────────────────

/**
 * Las capas de la tabla, en su orden, y después las que el dibujo usa sin
 * haberlas declarado (pasa en DXF hechos por programas sencillos).
 */
function armarCapas(dxf: IDxf, polilineas: PolilineaPlano[], textos: TextoPlano[]): CapaPlano[] {
  const capas: CapaPlano[] = []
  const vistas = new Set<string>()
  for (const capa of Object.values(dxf.tables?.layer?.layers ?? {})) {
    if (!capa?.name || vistas.has(capa.name)) continue
    vistas.add(capa.name)
    capas.push({
      nombre: capa.name,
      color: aciAHex(capa.colorIndex ?? COLOR_CAPA_SIN_TABLA),
      visible: capa.visible !== false && capa.frozen !== true,
    })
  }
  for (const { capa } of [...polilineas, ...textos]) {
    if (vistas.has(capa)) continue
    vistas.add(capa)
    capas.push({ nombre: capa, color: aciAHex(COLOR_CAPA_SIN_TABLA), visible: true })
  }
  return capas
}

// ─── Ejes ─────────────────────────────────────────────────────────────────

/**
 * Palabras que delatan una capa de eje: español (EJE, CENTRO), inglés (AXIS,
 * CL = center line, CENTERLINE) y la norma de Civil 3D (C-ROAD-CNTR), con un
 * número detrás o no (EJE1, EJE01, CL2), y EJE pegado a VIA, CALLE o PISTA.
 * Se comparan palabras enteras para que CICLOVIA no pase por CL ni EJECUTADA
 * por EJE.
 */
const PALABRA_EJE =
  /^(?:(?:EJES?|AXIS|AXES|CL|LC|CENTRO|CENTERLINE|CENTRELINE|CNTR)|EJE(?:VIAS?|CALLES?|PISTAS?))\d*$/

function normalizar(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

function esCapaDeEje(nombre: string): boolean {
  return normalizar(nombre)
    .split(/[^A-Z0-9]+/)
    .some((p) => PALABRA_EJE.test(p))
}

/**
 * Polilíneas que pueden ser el eje de una calle, de la más larga a la más
 * corta.
 *
 * En los planos el eje suele venir en pedazos (una LINE por tangente, un ARC
 * por curva). Las piezas abiertas de la misma capa cuyos extremos se tocan
 * se unen en una sola, pero solo donde se tocan exactamente dos y sin giro
 * brusco: en un cruce de tres o más no se puede saber por dónde sigue el
 * eje, y en una esquina terminan dos calles distintas. Ahí se deja que la
 * persona elija. `piezas` dice de cuántas entidades se armó cada candidato.
 */
export function ejesCandidatos(plano: PlanoVectorial): EjeCandidato[] {
  const porCapa = new Map<string, PolilineaPlano[]>()
  for (const p of plano.polilineas) {
    if (!esCapaDeEje(p.capa)) continue
    const lista = porCapa.get(p.capa) ?? []
    lista.push(p)
    porCapa.set(p.capa, lista)
  }
  const candidatos: EjeCandidato[] = []
  for (const piezas of porCapa.values()) {
    for (const { polilinea, piezas: n } of unirPiezas(piezas)) {
      candidatos.push({ ...polilinea, largo: largoPolilinea(polilinea), piezas: n })
    }
  }
  // Orden estable: a igual largo se respeta el orden del archivo.
  return candidatos.sort((a, b) => b.largo - a.largo)
}

interface ExtremoIndexado {
  pieza: PolilineaPlano
  punto: PuntoPlano
}

/**
 * Índice de los extremos por celda de TOLERANCIA_UNION: buscar quién toca un
 * punto mira solo las 9 celdas de alrededor, no todas las piezas. Con miles
 * de tramos (un alineamiento explotado) la unión sigue siendo inmediata.
 */
function indexarExtremos(abiertas: PolilineaPlano[]) {
  const celdas = new Map<string, ExtremoIndexado[]>()
  const clave = (i: number, j: number) => `${i},${j}`
  const celda = (p: PuntoPlano) => [Math.round(p.x / TOLERANCIA_UNION), Math.round(p.y / TOLERANCIA_UNION)] as const
  for (const pieza of abiertas) {
    for (const punto of [pieza.puntos[0]!, pieza.puntos[pieza.puntos.length - 1]!]) {
      const [i, j] = celda(punto)
      const lista = celdas.get(clave(i, j)) ?? []
      lista.push({ pieza, punto })
      celdas.set(clave(i, j), lista)
    }
  }
  /** Todos los extremos a TOLERANCIA_UNION o menos de q. */
  return (q: PuntoPlano): ExtremoIndexado[] => {
    const [i, j] = celda(q)
    const cerca: ExtremoIndexado[] = []
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const e of celdas.get(clave(i + di, j + dj)) ?? []) {
          if (distancia(e.punto, q) <= TOLERANCIA_UNION) cerca.push(e)
        }
      }
    }
    return cerca
  }
}

/** Giro en grados entre la dirección a→b y la c→d (0 = siguen derechas). */
function giro(a: PuntoPlano, b: PuntoPlano, c: PuntoPlano, d: PuntoPlano): number {
  const u = Math.atan2(b.y - a.y, b.x - a.x)
  const v = Math.atan2(d.y - c.y, d.x - c.x)
  let diferencia = Math.abs(grados(v - u)) % 360
  if (diferencia > 180) diferencia = 360 - diferencia
  return diferencia
}

function unirPiezas(piezas: PolilineaPlano[]): { polilinea: PolilineaPlano; piezas: number }[] {
  const abiertas = piezas.filter((p) => !p.cerrada)
  const tocan = indexarExtremos(abiertas)

  const usadas = new Set<PolilineaPlano>()
  const resultado: { polilinea: PolilineaPlano; piezas: number }[] = []
  for (const p of piezas) {
    if (usadas.has(p)) continue
    usadas.add(p)
    if (p.cerrada) {
      resultado.push({ polilinea: p, piezas: 1 })
      continue
    }
    let puntos = [...p.puntos]
    let n = 1
    // Se extiende hacia adelante y luego, dando la vuelta, hacia atrás.
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      for (;;) {
        const fin = puntos[puntos.length - 1]!
        const enFin = tocan(fin)
        // Solo donde se tocan exactamente dos extremos (esta pieza y otra).
        if (enFin.length !== 2) break
        const sig = enFin.find((e) => !usadas.has(e.pieza))?.pieza
        if (!sig) break
        const alDerecho = distancia(sig.puntos[0]!, fin) <= TOLERANCIA_UNION
        const resto = alDerecho ? sig.puntos.slice(1) : [...sig.puntos].reverse().slice(1)
        const antes = puntos[puntos.length - 2]!
        if (giro(antes, fin, fin, resto[0]!) > GIRO_MAXIMO_UNION) break
        usadas.add(sig)
        n++
        for (const q of resto) puntos.push(q)
      }
      puntos = puntos.reverse()
    }
    // Una pieza sola conserva su color y su elevación; una unida, solo la capa.
    const polilinea: PolilineaPlano = n === 1 ? { ...p, puntos } : { capa: p.capa, puntos, cerrada: false }
    resultado.push({ polilinea, piezas: n })
  }
  return resultado
}
