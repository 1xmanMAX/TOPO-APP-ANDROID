/**
 * Lector de planos DWG: convierte la base de datos que entrega LibreDWG
 * (GPL-3, compilado a WebAssembly por @mlightcad/libredwg-web) en el mismo
 * plano vectorial del lector DXF, para que la pantalla no sepa de qué
 * formato vino.
 *
 * La idea de cómo dibujar un DWG la sigue LibreCAD (expandir los bloques
 * con su transformación, heredar capa «0» y color «por bloque» del INSERT,
 * dibujar las cotas desde su bloque anónimo, dejar fuera el espacio papel),
 * pero el código es propio: aquí solo se pasa a polilíneas y textos.
 *
 * Nada se pierde en silencio: lo que no se dibuja se cuenta en `ignoradas`
 * y `ignoradasDetalle`, como en el DXF.
 *
 * La conversión (`convertirDwg`) es pura y se prueba sin WebAssembly; leer
 * los bytes (`leerDwg`) necesita la biblioteca, que se inyecta: en la app
 * la carga un trabajador (dwgTrabajador.ts), en las pruebas la de node.
 */
import {
  aciAHex,
  anclaMtext,
  calcularLimites,
  conBulges,
  conElevacion,
  descartarNumerosAjenos,
  ErrorDxf,
  limpiarMtext,
  limpiarTexto,
  polilineaValida,
  puntosDeArco,
  textoValido,
  type AnclaTexto,
  type CapaPlano,
  type IgnoradaPlano,
  type MotivoIgnorada,
  type PlanoVectorial,
  type PolilineaPlano,
  type PuntoPlano,
  type TextoPlano,
  type UnidadesPlano,
} from './dxf'

// ─── Lo que se usa de la base de datos de LibreDWG ───────────────────────

interface P {
  x: number
  y: number
  z?: number
}

/** Una entidad tal como la entrega `convert()`; solo los campos que se leen. */
export interface EntidadDwg {
  type: string
  handle?: string
  ownerBlockRecordSoftId?: string
  layer?: string
  colorIndex?: number
  color?: number
  isVisible?: boolean
  [campo: string]: unknown
}

export interface BaseDwg {
  header?: Record<string, unknown>
  entities: EntidadDwg[]
  tables: {
    LAYER?: { entries: { name: string; colorIndex?: number; off?: boolean; frozen?: boolean }[] }
    BLOCK_RECORD?: { entries: { handle?: string; name: string; basePoint?: P; entities?: EntidadDwg[] }[] }
  }
}

/** Lo que se usa de LibreDWG: leer los bytes y pasarlos a la base de datos. */
export interface BibliotecaDwg {
  leer(bytes: Uint8Array): BaseDwg
}

// ─── Constantes ───────────────────────────────────────────────────────────

const UNIDADES_INSUNITS: Record<number, UnidadesPlano> = { 1: 'pulg', 2: 'pie', 4: 'mm', 5: 'cm', 6: 'm', 7: 'km' }

/** Bloques dentro de bloques: más hondo que esto es casi seguro un ciclo. */
const PROFUNDIDAD_MAXIMA = 12

/**
 * Tope de vértices del plano entero. Un DWG de obra grande tiene unos pocos
 * cientos de miles; pasar de esto (bloques repetidos miles de veces) haría
 * el visor lento en un celular, así que lo que sobra se cuenta y se dice.
 */
const VERTICES_MAXIMOS = 3_000_000

/** Puntos por tramo de spline: suave a la vista, sin pesar. */
const PASOS_SPLINE = 16

const COLOR_CAPA_SIN_TABLA = 7

// ─── Transformación de bloques ────────────────────────────────────────────

/** x' = a·x + c·y + e ; y' = b·x + d·y + f */
interface Matriz {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const IDENTIDAD: Matriz = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

function componer(m: Matriz, n: Matriz): Matriz {
  // m ∘ n: primero n, después m.
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  }
}

function aplicar(m: Matriz, p: PuntoPlano): PuntoPlano {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }
}

function esIdentidad(m: Matriz): boolean {
  return m === IDENTIDAD
}

/** Cuánto se agranda una longitud (para la altura de los textos). */
function escalaDe(m: Matriz): number {
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))
}

/** Cuánto gira el eje X (para el giro de los textos), en grados. */
function giroDe(m: Matriz): number {
  return (Math.atan2(m.b, m.a) * 180) / Math.PI
}

/** Si la transformación espeja (escala negativa en un eje). */
function espeja(m: Matriz): boolean {
  return m.a * m.d - m.b * m.c < 0
}

/** La transformación de un INSERT: base del bloque → escala → giro → punto de inserción. */
function matrizDeInsert(ins: EntidadDwg, base: P | undefined, desplazamiento: PuntoPlano = { x: 0, y: 0 }): Matriz {
  const sx = num(ins.xScale, 1) || 1
  const sy = num(ins.yScale, 1) || 1
  const giro = num(ins.rotation, 0)
  const p = punto(ins.insertionPoint) ?? { x: 0, y: 0 }
  const cos = Math.cos(giro)
  const sen = Math.sin(giro)
  const bx = base?.x ?? 0
  const by = base?.y ?? 0
  // Primero se mueve la base al origen y se suma la posición en la grilla
  // (MINSERT), después se escala, se gira y se lleva al punto de inserción.
  const tx = desplazamiento.x - bx
  const ty = desplazamiento.y - by
  let m: Matriz = { a: sx * cos, b: sx * sen, c: -sy * sen, d: sy * cos, e: 0, f: 0 }
  m = { ...m, e: m.a * tx + m.c * ty + p.x, f: m.b * tx + m.d * ty + p.y }
  // Extrusión −Z (simetría): el bloque entero queda espejado en X.
  if (extrusionZ(ins) < 0) m = componer({ a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 }, m)
  return m
}

// ─── Utilidades ───────────────────────────────────────────────────────────

function num(v: unknown, porDefecto: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : porDefecto
}

function punto(v: unknown): PuntoPlano | undefined {
  if (!v || typeof v !== 'object') return undefined
  const p = v as P
  return typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : undefined
}

function extrusionZ(e: EntidadDwg): number {
  const d = e.extrusionDirection as P | undefined
  return d && typeof d.z === 'number' ? d.z : 1
}

/** Entidades planas con extrusión (0, 0, −1): su X es la −X del dibujo. */
function espejoOcs(puntos: PuntoPlano[], e: EntidadDwg): PuntoPlano[] {
  return extrusionZ(e) < 0 ? puntos.map((p) => ({ x: -p.x, y: p.y })) : puntos
}

function grados(rad: number): number {
  return (rad * 180) / Math.PI
}

/** Color propio de la entidad, o null si es «por capa» (256) o «por bloque» (0). */
function colorPropio(e: EntidadDwg): string | null {
  const i = e.colorIndex
  if (typeof i === 'number' && i >= 1 && i <= 255) return aciAHex(i)
  return null
}

// ─── Curvas ───────────────────────────────────────────────────────────────

/** Puntos de una elipse entre dos parámetros (radianes), en el sistema de la entidad. */
function puntosDeElipse(e: EntidadDwg): PuntoPlano[] | null {
  const c = punto(e.center)
  const eje = punto(e.majorAxisEndPoint)
  const r = num(e.axisRatio, 0)
  if (!c || !eje || !(r > 0)) return null
  const mayor = Math.hypot(eje.x, eje.y)
  if (!(mayor > 0)) return null
  const giro = Math.atan2(eje.y, eje.x)
  const t0 = num(e.startAngle, 0)
  let t1 = num(e.endAngle, 2 * Math.PI)
  if (t1 <= t0) t1 += 2 * Math.PI
  const completa = Math.abs(t1 - t0 - 2 * Math.PI) < 1e-9
  // Los puntos del círculo unidad, después estirados y girados.
  const base = puntosDeArco({ x: 0, y: 0 }, 1, t0, t1 - t0, !completa)
  const cos = Math.cos(giro)
  const sen = Math.sin(giro)
  return base.map((p) => {
    const x = p.x * mayor
    const y = p.y * mayor * r
    return { x: c.x + x * cos - y * sen, y: c.y + x * sen + y * cos }
  })
}

/**
 * Una B-spline (racional si trae pesos) por el algoritmo de De Boor. Si el
 * archivo trae los puntos de ajuste (por donde pasa la curva) y no el
 * polígono de control, se unen esos puntos: es lo que el proyectista marcó.
 */
function puntosDeSpline(e: EntidadDwg): PuntoPlano[] | null {
  const control = ((e.controlPoints as P[] | undefined) ?? []).map(punto).filter((p): p is PuntoPlano => !!p)
  const ajuste = ((e.fitPoints as P[] | undefined) ?? []).map(punto).filter((p): p is PuntoPlano => !!p)
  const grado = Math.max(1, Math.trunc(num(e.degree, 3)))
  const nudos = ((e.knots as number[] | undefined) ?? []).filter((k) => Number.isFinite(k))
  if (control.length <= grado || nudos.length !== control.length + grado + 1) {
    return ajuste.length >= 2 ? ajuste : control.length >= 2 ? control : null
  }
  const pesos = (e.weights as number[] | undefined)?.length === control.length ? (e.weights as number[]) : null
  const inicio = nudos[grado]!
  const fin = nudos[control.length]!
  if (!(fin > inicio)) return control
  const tramos = control.length - grado
  const n = Math.min(4000, tramos * PASOS_SPLINE)
  const puntos: PuntoPlano[] = []
  for (let k = 0; k <= n; k++) {
    const t = k === n ? fin : inicio + ((fin - inicio) * k) / n
    // El tramo de nudos donde cae t.
    let s = grado
    while (s < control.length - 1 && t >= nudos[s + 1]!) s++
    const d = Array.from({ length: grado + 1 }, (_, j) => {
      const p = control[s - grado + j]!
      const w = pesos ? pesos[s - grado + j]! : 1
      return { x: p.x * w, y: p.y * w, w }
    })
    for (let r = 1; r <= grado; r++) {
      for (let j = grado; j >= r; j--) {
        const i = s - grado + j
        const den = nudos[i + grado - r + 1]! - nudos[i]!
        const alfa = den === 0 ? 0 : (t - nudos[i]!) / den
        const a = d[j - 1]!
        const b = d[j]!
        d[j] = { x: (1 - alfa) * a.x + alfa * b.x, y: (1 - alfa) * a.y + alfa * b.y, w: (1 - alfa) * a.w + alfa * b.w }
      }
    }
    const q = d[grado]!
    if (q.w !== 0) puntos.push({ x: q.x / q.w, y: q.y / q.w })
  }
  return puntos
}

// ─── Textos ───────────────────────────────────────────────────────────────

/** Los datos de un TEXT (o del texto de un ATTRIB) en el formato de LibreDWG. */
interface DatosTexto {
  text?: string
  startPoint?: P
  endPoint?: P
  textHeight?: number
  rotation?: number
  halign?: number
  valign?: number
}

/** TEXT: qué punto manda depende de la justificación, igual que en el DXF. */
function convertirText(t: DatosTexto, capa: string, e: EntidadDwg): TextoPlano | MotivoIgnorada {
  const h = t.halign ?? 0
  const v = t.valign ?? 0
  let p = punto(t.startPoint)
  let rotacion = grados(num(t.rotation, 0))
  let ancla: AnclaTexto = 'base-izquierda'
  const fin = punto(t.endPoint)
  if (h === 3 || h === 5) {
    if (p && fin) rotacion = grados(Math.atan2(fin.y - p.y, fin.x - p.x))
  } else if (h === 4) {
    p = fin ?? p
    ancla = 'medio-centro'
  } else if (h !== 0 || v !== 0) {
    p = fin ?? p
    const fila = (['base', 'abajo', 'medio', 'arriba'] as const)[v] ?? 'base'
    const columna = (['izquierda', 'centro', 'derecha'] as const)[h] ?? 'izquierda'
    ancla = `${fila}-${columna}`
  }
  if (p && extrusionZ(e) < 0) {
    p = { x: -p.x, y: p.y }
    rotacion = 180 - rotacion
  }
  return textoValido(capa, limpiarTexto(t.text ?? ''), p, t.textHeight, rotacion, ancla)
}

function convertirMtext(e: EntidadDwg, capa: string): TextoPlano | MotivoIgnorada {
  const d = punto(e.direction)
  const rotacion = d && (d.x !== 0 || d.y !== 0) ? grados(Math.atan2(d.y, d.x)) : grados(num(e.rotation, 0))
  const texto = limpiarTexto(limpiarMtext(String(e.text ?? '')))
  return textoValido(capa, texto, punto(e.insertionPoint), num(e.textHeight, 0), rotacion, anclaMtext(num(e.attachmentPoint, 1)))
}

/** Lleva un texto al sistema del dibujo: posición, altura y giro. */
function textoTransformado(t: TextoPlano, m: Matriz): TextoPlano {
  if (esIdentidad(m)) return t
  const p = aplicar(m, t)
  const giro = (t.rotacion ?? 0) * (espeja(m) ? -1 : 1) + giroDe(m)
  return { ...t, x: p.x, y: p.y, altura: t.altura * escalaDe(m), rotacion: Number((((giro % 360) + 360) % 360).toFixed(6)) }
}

// ─── Conversión ───────────────────────────────────────────────────────────

/** Una entidad plana → polilínea, en el sistema de su bloque. */
function aPolilinea(e: EntidadDwg, capa: string): PolilineaPlano | MotivoIgnorada | null {
  switch (e.type) {
    case 'LINE': {
      const a = punto(e.startPoint)
      const b = punto(e.endPoint)
      if (!a || !b) return 'coordenada inválida'
      return polilineaValida(capa, [a, b], false)
    }
    case 'LWPOLYLINE': {
      const cerrada = (num(e.flag, 0) & 512) !== 0
      const vertices = (e.vertices as { x: number; y: number; bulge?: number }[] | undefined) ?? []
      const puntos = espejoOcs(conBulges(vertices, cerrada), e)
      return conElevacion(polilineaValida(capa, puntos, cerrada), num(e.elevation, 0))
    }
    case 'POLYLINE2D':
    case 'POLYLINE3D': {
      const flag = num(e.flag, 0)
      // 16 y 64: mallas (de polígonos o de caras), superficies y no líneas.
      if (flag & 16 || flag & 64) return 'malla'
      const cerrada = (flag & 1) !== 0
      let vertices = (e.vertices as { x: number; y: number; z?: number; bulge?: number; flag?: number }[] | undefined) ?? []
      // Con ajuste spline: el marco de control (16) no se dibuja, la curva (8) sí.
      if (vertices.some((v) => (v.flag ?? 0) & 8)) vertices = vertices.filter((v) => !((v.flag ?? 0) & 16))
      const resultado = polilineaValida(capa, espejoOcs(conBulges(vertices, cerrada), e), cerrada)
      return e.type === 'POLYLINE3D' ? resultado : conElevacion(resultado, num(e.elevation, 0))
    }
    case 'ARC': {
      const c = punto(e.center)
      const r = num(e.radius, 0)
      if (!c || !(r > 0)) return 'degenerada'
      // En el DWG los ángulos ya vienen en radianes.
      const ini = num(e.startAngle, 0)
      let barrido = num(e.endAngle, 0) - ini
      if (barrido <= 0) barrido += 2 * Math.PI
      return polilineaValida(capa, espejoOcs(puntosDeArco(c, r, ini, barrido, true), e), false)
    }
    case 'CIRCLE': {
      const c = punto(e.center)
      const r = num(e.radius, 0)
      if (!c || !(r > 0)) return 'degenerada'
      return polilineaValida(capa, espejoOcs(puntosDeArco(c, r, 0, 2 * Math.PI, false), e), true)
    }
    case 'ELLIPSE': {
      const puntos = puntosDeElipse(e)
      if (!puntos) return 'degenerada'
      const completa = Math.abs(num(e.endAngle, 2 * Math.PI) - num(e.startAngle, 0) - 2 * Math.PI) < 1e-9
      return polilineaValida(capa, puntos, completa)
    }
    case 'SPLINE': {
      const puntos = puntosDeSpline(e)
      if (!puntos) return 'spline sin curva'
      return polilineaValida(capa, puntos, (num(e.flag, 0) & 1) !== 0)
    }
    case 'SOLID':
    case 'TRACE':
    case '3DFACE': {
      const esquinas = [e.corner1, e.corner2, e.corner3, e.corner4].map(punto)
      if (esquinas.some((p) => !p)) return 'coordenada inválida'
      const [a, b, c, d] = esquinas as PuntoPlano[]
      // El SOLID guarda sus esquinas en «zeta»: 1, 2, 4, 3 da el contorno.
      const contorno = e.type === '3DFACE' ? [a!, b!, c!, d!] : [a!, b!, d!, c!]
      return polilineaValida(capa, espejoOcs(contorno, e), true)
    }
  }
  return null
}

/**
 * Convierte la base de datos de LibreDWG en el plano de la app. Lanza
 * `ErrorDxf` (el mismo error de planos) si no queda nada que dibujar.
 */
export function convertirDwg(db: BaseDwg): PlanoVectorial {
  const ignoradas: Record<string, number> = {}
  const ignoradasDetalle: IgnoradaPlano[] = []
  const anotar = (tipo: string, motivo: MotivoIgnorada, n = 1) => {
    ignoradas[tipo] = (ignoradas[tipo] ?? 0) + n
    const fila = ignoradasDetalle.find((f) => f.tipo === tipo && f.motivo === motivo)
    if (fila) fila.cantidad += n
    else ignoradasDetalle.push({ tipo, motivo, cantidad: n })
  }

  const bloques = new Map<string, { basePoint?: P; entities?: EntidadDwg[] }>()
  const porHandle = new Map<string, { name?: string; basePoint?: P; entities?: EntidadDwg[] }>()
  let modelo: string | null = null
  for (const b of db.tables.BLOCK_RECORD?.entries ?? []) {
    bloques.set(b.name.toUpperCase(), b)
    if (b.handle) porHandle.set(b.handle, b)
    if (b.name.toUpperCase() === '*MODEL_SPACE' && b.handle) modelo = b.handle
  }

  const polilineas: PolilineaPlano[] = []
  const textos: TextoPlano[] = []
  let vertices = 0
  let recortado = false

  /** Agrega una entidad ya convertida, en el sistema de su bloque, al dibujo. */
  function poner(r: PolilineaPlano | TextoPlano, m: Matriz, color: string | null) {
    if ('texto' in r) {
      const t = textoTransformado(r, m)
      if (color) t.color = color
      textos.push(t)
      return
    }
    if (vertices + r.puntos.length > VERTICES_MAXIMOS) {
      recortado = true
      return
    }
    vertices += r.puntos.length
    if (!esIdentidad(m)) r.puntos = r.puntos.map((p) => aplicar(m, p))
    if (color) r.color = color
    polilineas.push(r)
  }

  /**
   * Recorre las entidades de un bloque. `capaPadre` y `colorPadre` son los
   * del INSERT: la capa «0» y el color «por bloque» los toman de él.
   */
  function recorrer(
    entidades: EntidadDwg[],
    m: Matriz,
    capaPadre: string | null,
    colorPadre: string | null,
    profundidad: number,
    pila: string[],
  ) {
    for (const e of entidades) {
      // Los atributos se dibujan con su INSERT; los vértices, con su polilínea.
      if (e.type === 'ATTRIB' || e.type === 'VERTEX' || e.type === 'SEQEND') continue
      if (e.isVisible === false) {
        anotar(e.type, 'vacío')
        continue
      }
      const propia = e.layer ?? '0'
      const capa = capaPadre !== null && propia === '0' ? capaPadre : propia
      const color = e.colorIndex === 0 ? colorPadre : (colorPropio(e) ?? (capaPadre !== null && propia === '0' ? colorPadre : null))

      if (e.type === 'ACAD_TABLE' || e.type === 'TABLE') {
        // Una tabla es un bloque anónimo (*T…) con sus líneas y sus textos
        // ya armados. LibreDWG no siempre llena `blockRecordHandle`: a veces
        // el handle del bloque llega en `tableStyleId`.
        const candidatos = [e.blockRecordHandle, e.tableStyleId].filter((h): h is string => typeof h === 'string' && h !== '')
        const bloque = candidatos.map((h) => porHandle.get(h)).find((b) => b?.entities && /^\*T/i.test(b.name ?? ''))
        if (!bloque?.entities) {
          anotar(e.type, 'no leída')
          continue
        }
        const p0 = punto(e.startPoint) ?? punto(e.insertionPoint) ?? { x: 0, y: 0 }
        const local: Matriz = { ...IDENTIDAD, e: p0.x, f: p0.y }
        recorrer(bloque.entities, componer(m, local), capa, colorPropio(e) ?? colorPadre, profundidad + 1, [...pila, `*T${e.handle ?? ''}`])
        continue
      }

      if (e.type === 'INSERT' || e.type === 'DIMENSION') {
        const nombre = String(e.name ?? '')
        const bloque = bloques.get(nombre.toUpperCase())
        if (!bloque?.entities) {
          anotar(e.type, 'no leída')
          continue
        }
        if (profundidad >= PROFUNDIDAD_MAXIMA || pila.includes(nombre.toUpperCase())) {
          anotar(e.type, 'degenerada')
          continue
        }
        const colorHijo = colorPropio(e) ?? colorPadre
        if (e.type === 'DIMENSION') {
          // El bloque de una cota ya está dibujado en el sistema del dibujo.
          recorrer(bloque.entities, m, capa, colorHijo, profundidad + 1, [...pila, nombre.toUpperCase()])
          continue
        }
        // MINSERT: la misma inserción repetida en filas y columnas.
        const filas = Math.max(1, Math.trunc(num(e.rowCount, 1)))
        const columnas = Math.max(1, Math.trunc(num(e.columnCount, 1)))
        for (let f = 0; f < filas; f++) {
          for (let c = 0; c < columnas; c++) {
            const local = matrizDeInsert(e, bloque.basePoint, { x: c * num(e.columnSpacing, 0), y: f * num(e.rowSpacing, 0) })
            recorrer(bloque.entities, componer(m, local), capa, colorHijo, profundidad + 1, [...pila, nombre.toUpperCase()])
          }
        }
        // Los atributos ya están en el sistema del dibujo (los ubicó el INSERT).
        for (const a of (e.attribs as EntidadDwg[] | undefined) ?? []) {
          const t = convertirText((a.text as DatosTexto | undefined) ?? {}, a.layer && a.layer !== '0' ? a.layer : capa, a)
          if (typeof t === 'string') anotar('ATTRIB', t)
          else poner(t, m, colorPropio(a) ?? colorHijo)
        }
        continue
      }

      if (e.type === 'TEXT') {
        const t = convertirText(e as DatosTexto, capa, e)
        if (typeof t === 'string') anotar(e.type, t)
        else poner(t, m, color)
        continue
      }
      if (e.type === 'MTEXT') {
        const t = convertirMtext(e, capa)
        if (typeof t === 'string') anotar(e.type, t)
        else poner(t, m, color)
        continue
      }
      const p = aPolilinea(e, capa)
      if (p === null) anotar(e.type, 'no soportada')
      else if (typeof p === 'string') anotar(e.type, p)
      else poner(p, m, color)
    }
  }

  const delModelo: EntidadDwg[] = []
  for (const e of db.entities) {
    // El espacio papel es la lámina (rótulo, marcos), en otra escala.
    if (modelo && e.ownerBlockRecordSoftId && e.ownerBlockRecordSoftId !== modelo) anotar(e.type, 'espacio papel')
    else delModelo.push(e)
  }
  recorrer(delModelo, IDENTIDAD, null, null, 0, [])
  if (recortado) anotar('(vértices)', 'no leída')

  if (polilineas.length === 0 && textos.length === 0) {
    const lista = ignoradasDetalle.map((f) => `${f.tipo} (${f.motivo}): ${f.cantidad}`).join(', ')
    throw new ErrorDxf(`El DWG no tiene nada que dibujar en el espacio modelo${lista ? ` (se ignoraron ${lista})` : ''}.`)
  }

  const plano: PlanoVectorial = {
    capas: armarCapas(db, polilineas, textos),
    polilineas,
    textos: descartarNumerosAjenos(textos),
    limites: limitesSinSueltos(polilineas, textos),
    ignoradas,
    ignoradasDetalle,
  }
  const insunits = db.header?.INSUNITS ?? db.header?.$INSUNITS
  const unidades = UNIDADES_INSUNITS[Number(insunits)]
  if (unidades) plano.unidades = unidades
  return plano
}

/**
 * Los límites del dibujo sin los objetos sueltos muy lejos del resto. En los
 * DWG de obra es común una línea olvidada a kilómetros (o un bloque mal
 * escalado): con ella, «Encuadrar» deja el plano como un punto. El núcleo es
 * donde caen del 10 % al 90 % de los centros; entra todo lo que no se aleja
 * de él más que dos veces su tamaño. Lo que queda fuera se sigue dibujando;
 * solo no cuenta para encuadrar.
 */
export function limitesSinSueltos(polilineas: PolilineaPlano[], textos: TextoPlano[]): PlanoVectorial['limites'] {
  const todos = calcularLimites(polilineas, textos)
  if (polilineas.length + textos.length < 20) return todos
  const cajas = [
    ...polilineas.map((p) => calcularLimites([p], [])),
    ...textos.map((t) => ({ minX: t.x, minY: t.y, maxX: t.x, maxY: t.y })),
  ]
  const xs = cajas.map((c) => (c.minX + c.maxX) / 2).sort((a, b) => a - b)
  const ys = cajas.map((c) => (c.minY + c.maxY) / 2).sort((a, b) => a - b)
  const q = (v: number[], f: number) => v[Math.min(v.length - 1, Math.max(0, Math.floor(f * (v.length - 1))))]!
  const nucleo = { minX: q(xs, 0.1), maxX: q(xs, 0.9), minY: q(ys, 0.1), maxY: q(ys, 0.9) }
  const margen = 2 * Math.max(nucleo.maxX - nucleo.minX, nucleo.maxY - nucleo.minY, 1e-9)
  const dentro = { minX: nucleo.minX - margen, maxX: nucleo.maxX + margen, minY: nucleo.minY - margen, maxY: nucleo.maxY + margen }
  const l = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const c of cajas) {
    if (c.minX < dentro.minX || c.maxX > dentro.maxX || c.minY < dentro.minY || c.maxY > dentro.maxY) continue
    l.minX = Math.min(l.minX, c.minX)
    l.minY = Math.min(l.minY, c.minY)
    l.maxX = Math.max(l.maxX, c.maxX)
    l.maxY = Math.max(l.maxY, c.maxY)
  }
  return Number.isFinite(l.minX) ? l : todos
}

/** Las capas de la tabla en su orden, y después las usadas sin declarar. */
function armarCapas(db: BaseDwg, polilineas: PolilineaPlano[], textos: TextoPlano[]): CapaPlano[] {
  const capas: CapaPlano[] = []
  const vistas = new Set<string>()
  for (const c of db.tables.LAYER?.entries ?? []) {
    if (!c?.name || vistas.has(c.name)) continue
    vistas.add(c.name)
    const indice = num(c.colorIndex, COLOR_CAPA_SIN_TABLA)
    // Un color negativo es la forma vieja de decir «capa apagada».
    capas.push({ nombre: c.name, color: aciAHex(Math.abs(indice) || COLOR_CAPA_SIN_TABLA), visible: !c.off && !c.frozen && indice >= 0 })
  }
  for (const { capa } of [...polilineas, ...textos]) {
    if (vistas.has(capa)) continue
    vistas.add(capa)
    capas.push({ nombre: capa, color: aciAHex(COLOR_CAPA_SIN_TABLA), visible: true })
  }
  return capas
}

/** Firma de un DWG: «AC10» seguido de la versión. */
export function pareceDwg(bytes: Uint8Array): boolean {
  return bytes.length >= 6 && bytes[0] === 0x41 && bytes[1] === 0x43 && bytes[2] === 0x31 && bytes[3] === 0x30
}

/** Las versiones que LibreDWG lee, por su firma, para decirlo si no se puede. */
const VERSIONES: Record<string, string> = {
  AC1012: 'R13',
  AC1014: 'R14',
  AC1015: '2000',
  AC1018: '2004',
  AC1021: '2007',
  AC1024: '2010',
  AC1027: '2013',
  AC1032: '2018',
}

/** Lee un DWG con la biblioteca dada. Lanza `ErrorDxf` con un mensaje para Max. */
export function leerDwg(bytes: Uint8Array, biblioteca: BibliotecaDwg): PlanoVectorial {
  if (bytes.length === 0) throw new ErrorDxf('El archivo está vacío.')
  if (!pareceDwg(bytes)) throw new ErrorDxf('El archivo no es un DWG: no empieza con la firma «AC10…».')
  const firma = new TextDecoder('latin1').decode(bytes.subarray(0, 6))
  let db: BaseDwg
  try {
    db = biblioteca.leer(bytes)
  } catch (e) {
    const version = VERSIONES[firma]
    const detalle = e instanceof Error ? e.message : String(e)
    throw new ErrorDxf(
      version
        ? `El DWG (AutoCAD ${version}) está dañado o no se pudo leer (${detalle}).`
        : `Este DWG es de una versión que no se puede leer (${firma}). Guárdalo como DWG 2018 o anterior, o como DXF.`,
    )
  }
  return convertirDwg(db)
}
