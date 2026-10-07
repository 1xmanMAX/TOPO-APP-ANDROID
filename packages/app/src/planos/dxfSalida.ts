/**
 * Salida DXF: escribe curvas de nivel, puntos, un perfil y rótulos en un DXF
 * R12 en texto (ASCII), la versión que AutoCAD, LibreCAD, Civil 3D y
 * cualquier otro programa de CAD abren sin preguntar.
 *
 * Qué va en el archivo:
 * - HEADER con $ACADVER AC1009 (R12), metros ($INSUNITS 6), los límites del
 *   dibujo y los puntos visibles como una cruz con círculo ($PDMODE 3).
 * - TABLES con los tipos de línea CONTINUOUS y DASHED y las capas de
 *   `CAPAS_SALIDA` (más la «0»).
 * - ENTITIES: cada curva como POLYLINE con su cota como elevación (grupo 30
 *   de la cabecera), la forma clásica de una curva de nivel: AutoCAD, Civil
 *   3D y el lector de la app (planos/dxf.ts) la leen como cota de la curva.
 *   Cada punto como POINT con su cota; el perfil como POLYLINE 2D; los
 *   rótulos como TEXT.
 *
 * Lo no comprobado (spec 2026-10-05 §3: lo calculado sobre una nivelación
 * sin cerrar no está comprobado, y se dice en pantalla y en los archivos):
 * los tramos de curva y de perfil que caen en triángulos no comprobados van
 * en su propia capa `…_NO_COMPROBADAS` con línea discontinua; los puntos no
 * comprobados van en `PUNTOS_NO_COMPROBADOS`; los rótulos lo dicen
 * («3245.00 (no comprobada)») y `avisos` también.
 *
 * Los números van con punto decimal y 3 decimales (milímetros), sin «−0».
 * Una coordenada calculada que no es número (curva, perfil, texto) detiene
 * la escritura con un mensaje que dice cuál: es un error del cálculo. Un
 * punto levantado sin cota o sin coordenadas, en cambio, es normal en campo:
 * se salta y se dice en `avisos` con su nombre. Lo que no tiene nada que
 * dibujar (una curva sin largo, un texto vacío) no se escribe y también va a
 * `avisos`: nunca se descarta en silencio.
 *
 * Los tipos de entrada son propios de este archivo pero tienen la forma de
 * lo que entrega el motor: una `Curva` de `curvasDeNivel` (cota, maestra,
 * cerrada, puntos, comprobada, tramosComprobados, rotulos) se pasa tal cual.
 * Los rótulos de las curvas son los del motor (posición, giro y texto): aquí
 * no se vuelven a calcular, para que el CAD diga lo mismo que la pantalla.
 */

import { redondear3 } from '@topo/core'

// ─── Tipos de entrada ─────────────────────────────────────────────────────

/** Punto del dibujo en metros (este, norte). */
export interface PuntoXY {
  x: number
  y: number
}

/** Un rótulo ya ubicado por el motor (curvasDeNivel → Curva.rotulos). */
export interface RotuloSalida {
  x: number
  y: number
  /** Grados desde el este, antihorario. Se lleva a (−90°, 90°] para que no quede de cabeza. */
  angulo: number
  texto: string
}

/** Una curva de nivel ya trazada (la `Curva` del motor sirve tal cual). */
export interface CurvaSalida {
  /** Cota de la curva en metros. */
  cota: number
  /** Las maestras van en su capa. */
  maestra: boolean
  /** Si `cerrada`, el primer punto puede venir repetido al final o no: se escribe una vez. */
  puntos: PuntoXY[]
  cerrada: boolean
  /** Todos sus tramos caen en triángulos comprobados. */
  comprobada: boolean
  /**
   * Uno por tramo (puntos.length − 1; en una cerrada sin el primer punto
   * repetido, uno más por el tramo de cierre). Si falta, toda la curva es
   * `comprobada` o no.
   */
  tramosComprobados?: boolean[]
  /** Los rótulos del motor, uno cada `separacionRotulos`. Sin ellos la curva no se rotula. */
  rotulos?: RotuloSalida[]
}

/** Un punto levantado (estación total, GNSS, nivelación). */
export interface PuntoSalida {
  x: number
  y: number
  /** Cota en metros: va en la Z del POINT. Si no es número, el punto se salta y se avisa. */
  z: number
  /** Nombre o número del punto; si está, se rotula al lado. */
  nombre?: string
  /** Cota de una nivelación cerrada o de un GNSS fijo. Si no, va en su capa y el rótulo lo dice. */
  comprobado: boolean
}

/** Una línea del perfil, ya en coordenadas del dibujo (quien arma el perfil decide la escala). */
export interface PerfilSalida {
  puntos: PuntoXY[]
  comprobado: boolean
  /** Uno por tramo (puntos.length − 1). Si falta, toda la línea es `comprobado` o no. */
  tramosComprobados?: boolean[]
}

/** Nombre de una de las capas que escribe este módulo. */
export type NombreCapaSalida =
  | 'CURVAS'
  | 'CURVAS_MAESTRAS'
  | 'CURVAS_NO_COMPROBADAS'
  | 'CURVAS_MAESTRAS_NO_COMPROBADAS'
  | 'ROTULOS'
  | 'PUNTOS'
  | 'PUNTOS_NO_COMPROBADOS'
  | 'PERFIL'
  | 'PERFIL_NO_COMPROBADO'

/** Un texto suelto (título, progresivas del perfil, nombre de calle…). */
export interface TextoSalida {
  /** Esquina inferior izquierda del texto (base de la letra). */
  x: number
  y: number
  texto: string
  /** Altura de la letra en metros del dibujo. */
  altura: number
  /** Giro en grados contra el reloj desde +X. Por defecto 0. */
  rotacion?: number
  /** Por defecto ROTULOS. */
  capa?: NombreCapaSalida
}

export interface EntradaDxf {
  curvas?: CurvaSalida[]
  puntos?: PuntoSalida[]
  perfil?: PerfilSalida[]
  textos?: TextoSalida[]
  /** Altura de los rótulos de curvas y puntos, en metros del dibujo. Por defecto 1. */
  alturaTexto?: number
  /** Escribir los rótulos que traen las curvas. Por defecto sí. */
  rotularCurvas?: boolean
  /** Agregar la cota al nombre del punto en su rótulo. Por defecto no. */
  rotularCotaPuntos?: boolean
}

export interface SalidaDxf {
  /** El archivo DXF, con saltos de línea CR LF. */
  texto: string
  /** Lo que no se escribió, lo no comprobado y lo dudoso, en palabras. */
  avisos: string[]
}

/** Error de datos que impiden escribir el archivo, con mensaje en español. */
export class ErrorDxfSalida extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorDxfSalida'
  }
}

// ─── Capas ─────────────────────────────────────────────────────────────────

export type TipoLineaSalida = 'CONTINUOUS' | 'DASHED'

/** Las capas, en el orden de la tabla, con su color ACI y tipo de línea. */
export const CAPAS_SALIDA: readonly { nombre: NombreCapaSalida; color: number; tipoLinea: TipoLineaSalida }[] = [
  { nombre: 'CURVAS', color: 8, tipoLinea: 'CONTINUOUS' }, // gris
  { nombre: 'CURVAS_MAESTRAS', color: 30, tipoLinea: 'CONTINUOUS' }, // naranja marrón
  { nombre: 'CURVAS_NO_COMPROBADAS', color: 8, tipoLinea: 'DASHED' },
  { nombre: 'CURVAS_MAESTRAS_NO_COMPROBADAS', color: 30, tipoLinea: 'DASHED' },
  { nombre: 'ROTULOS', color: 7, tipoLinea: 'CONTINUOUS' }, // blanco/negro según el fondo
  { nombre: 'PUNTOS', color: 1, tipoLinea: 'CONTINUOUS' }, // rojo
  { nombre: 'PUNTOS_NO_COMPROBADOS', color: 6, tipoLinea: 'CONTINUOUS' }, // magenta
  { nombre: 'PERFIL', color: 5, tipoLinea: 'CONTINUOUS' }, // azul
  { nombre: 'PERFIL_NO_COMPROBADO', color: 5, tipoLinea: 'DASHED' },
]

/** Lo que se agrega al rótulo de una curva o un punto no comprobado. */
export const SUFIJO_CURVA_NO_COMPROBADA = ' (no comprobada)'
export const SUFIJO_PUNTO_NO_COMPROBADO = ' (no comprobado)'

function capaCurva(maestra: boolean, comprobada: boolean): NombreCapaSalida {
  if (maestra) return comprobada ? 'CURVAS_MAESTRAS' : 'CURVAS_MAESTRAS_NO_COMPROBADAS'
  return comprobada ? 'CURVAS' : 'CURVAS_NO_COMPROBADAS'
}

// ─── Números y textos ─────────────────────────────────────────────────────

/**
 * Número con punto decimal y 3 decimales, redondeado al milímetro como en el
 * motor (la mitad se aleja del cero: 3244.8765 → 3244.877); nunca «-0.000».
 * Lanza si no es finito.
 */
export function numeroDxf(n: number, contexto = 'Valor'): string {
  if (!Number.isFinite(n)) throw new ErrorDxfSalida(`${contexto}: el valor no es un número (${n}).`)
  const texto = redondear3(n).toFixed(3)
  return /^-0\.0+$/.test(texto) ? texto.slice(1) : texto
}

/** Cota para mensajes: sin decimales si es entera, si no con los que tenga hasta 2 (3245, 3244.5, 3244.25). */
export function formatoCota(cota: number): string {
  const redondo = Number(cota.toFixed(2))
  return String(Object.is(redondo, -0) ? 0 : redondo)
}

/** Giro llevado a (−90°, 90°]: el texto nunca queda de cabeza. */
export function giroLegible(grados: number): number {
  let g = grados % 360
  if (g > 180) g -= 360
  else if (g <= -180) g += 360
  if (g > 90) g -= 180
  else if (g <= -90) g += 180
  return g
}

/**
 * Un TEXT de R12 es una sola línea en la página de códigos del dibujo: los
 * saltos de línea y controles van como espacio, y lo que no es ASCII como
 * \U+XXXX (lo entienden AutoCAD, LibreCAD y el lector de la app).
 */
function textoDxf(texto: string): string {
  let salida = ''
  for (const caracter of texto.replace(/\r\n|\r|\n/g, ' ')) {
    const codigo = caracter.codePointAt(0)!
    if (codigo < 32 || codigo === 127) salida += ' '
    else if (codigo < 127) salida += caracter
    else if (codigo <= 0xffff) salida += `\\U+${codigo.toString(16).toUpperCase().padStart(4, '0')}`
    else salida += '?'
  }
  return salida.trim()
}

// ─── Escritura ─────────────────────────────────────────────────────────────

/** Un par código–valor como queda en el archivo. */
function linea(codigo: number, valor: string | number): string {
  return `${String(codigo).padStart(3, ' ')}\r\n${valor}\r\n`
}

/**
 * Acumula las entidades como texto, un par por elemento. Nunca se juntan
 * listas con `push(...lista)`: con cientos de miles de pares (un terreno
 * grande) eso revienta la pila.
 */
class Escritor {
  readonly partes: string[] = []
  readonly min = { x: Infinity, y: Infinity, z: Infinity }
  readonly max = { x: -Infinity, y: -Infinity, z: -Infinity }
  entidades = 0

  g(codigo: number, valor: string | number): void {
    this.partes.push(linea(codigo, valor))
  }

  /** Amplía los límites del dibujo; z null = no cuenta para la cota (textos, perfil). */
  ampliar(x: number, y: number, z: number | null): void {
    this.min.x = Math.min(this.min.x, x)
    this.min.y = Math.min(this.min.y, y)
    this.max.x = Math.max(this.max.x, x)
    this.max.y = Math.max(this.max.y, y)
    if (z !== null) {
      this.min.z = Math.min(this.min.z, z)
      this.max.z = Math.max(this.max.z, z)
    }
  }

  /** Coordenada 10/20/30 (o 11/21/31): valida y formatea. */
  punto(base: 10 | 11, x: number, y: number, z: number, contexto: string): void {
    const sx = numeroDxf(x, contexto)
    const sy = numeroDxf(y, contexto)
    const sz = numeroDxf(z, contexto)
    this.g(base, sx)
    this.g(base + 10, sy)
    this.g(base + 20, sz)
  }

  /**
   * POLYLINE 2D. Con `elevacion` (la cota de una curva) va en el grupo 30
   * de la cabecera, como la escribe AutoCAD; los vértices van con Z 0.
   */
  polilinea(capa: string, puntos: PuntoXY[], cerrada: boolean, elevacion: number | null, contexto: string): void {
    this.entidades++
    this.g(0, 'POLYLINE')
    this.g(8, capa)
    this.g(66, 1)
    this.g(10, numeroDxf(0))
    this.g(20, numeroDxf(0))
    this.g(30, numeroDxf(elevacion ?? 0, contexto))
    // 1 = cerrada.
    this.g(70, cerrada ? 1 : 0)
    for (let i = 0; i < puntos.length; i++) {
      const p = puntos[i]!
      this.g(0, 'VERTEX')
      this.g(8, capa)
      this.punto(10, p.x, p.y, 0, `${contexto}, punto ${i + 1}`)
      this.ampliar(p.x, p.y, elevacion)
    }
    this.g(0, 'SEQEND')
    this.g(8, capa)
  }

  texto(capa: string, x: number, y: number, altura: number, contenido: string, rotacion: number, centrado: boolean, contexto: string): void {
    this.entidades++
    this.g(0, 'TEXT')
    this.g(8, capa)
    this.punto(10, x, y, 0, contexto)
    this.g(40, numeroDxf(altura, contexto))
    this.g(1, contenido)
    this.g(50, numeroDxf(rotacion, contexto))
    if (centrado) {
      // 72 = 4: «medio», el punto 11 es el centro del texto.
      this.g(72, 4)
      this.punto(11, x, y, 0, contexto)
    }
    this.ampliar(x, y, null)
  }

  puntoCota(capa: string, p: PuntoSalida, contexto: string): void {
    this.entidades++
    this.g(0, 'POINT')
    this.g(8, capa)
    this.punto(10, p.x, p.y, p.z, contexto)
    this.ampliar(p.x, p.y, p.z)
  }
}

/** Valida los puntos y quita los repetidos seguidos (tal como quedarán escritos, al milímetro). */
function limpiarPuntos(puntos: PuntoXY[], cerrada: boolean, contexto: string): PuntoXY[] {
  const clave = (p: PuntoXY, i: number) =>
    `${numeroDxf(p.x, `${contexto}, punto ${i + 1}`)} ${numeroDxf(p.y, `${contexto}, punto ${i + 1}`)}`
  const limpios: PuntoXY[] = []
  let anterior = ''
  puntos.forEach((p, i) => {
    const k = clave(p, i)
    if (k !== anterior) limpios.push(p)
    anterior = k
  })
  if (cerrada && limpios.length > 1 && clave(limpios[0]!, 0) === clave(limpios[limpios.length - 1]!, 0)) limpios.pop()
  return limpios
}

interface Pieza {
  puntos: PuntoXY[]
  cerrada: boolean
  comprobada: boolean
}

/**
 * Parte una línea donde cambia de comprobada a no comprobada, para que cada
 * pedazo vaya a su capa. Una cerrada con todo igual sigue cerrada; si se
 * parte, el pedazo que cruza el cierre se une en uno solo.
 */
function piezasPorComprobacion(
  puntos: PuntoXY[],
  cerrada: boolean,
  comprobada: boolean,
  tramos: boolean[] | undefined,
  contexto: string,
): Pieza[] {
  if (!tramos || puntos.length < 2) return [{ puntos, cerrada, comprobada }]
  let pts = puntos
  // Cerrada sin el primer punto repetido: el último tramo es el de cierre.
  if (cerrada && tramos.length === puntos.length) pts = [...puntos, puntos[0]!]
  if (tramos.length !== pts.length - 1) {
    throw new ErrorDxfSalida(
      `${contexto}: trae ${tramos.length} marcas de tramo comprobado para ${pts.length - 1} tramos.`,
    )
  }
  if (tramos.every((t) => t === tramos[0])) {
    // Si la curva dice no comprobada, se le cree aunque sus tramos digan otra cosa.
    return [{ puntos, cerrada, comprobada: tramos[0]! && comprobada }]
  }
  const corridas: { desde: number; hasta: number; valor: boolean }[] = []
  for (let i = 0; i < tramos.length; i++) {
    const ultima = corridas[corridas.length - 1]
    if (ultima && ultima.valor === tramos[i]) ultima.hasta = i
    else corridas.push({ desde: i, hasta: i, valor: tramos[i]! })
  }
  const piezas: Pieza[] = corridas.map((c) => ({
    puntos: pts.slice(c.desde, c.hasta + 2),
    cerrada: false,
    comprobada: c.valor,
  }))
  if (cerrada) {
    // pts termina en el primer punto: el último pedazo sigue en el primero.
    const primera = corridas[0]!
    const ultima = corridas[corridas.length - 1]!
    if (primera.valor === ultima.valor) {
      piezas[0] = { ...piezas[0]!, puntos: [...pts.slice(ultima.desde), ...pts.slice(1, primera.hasta + 2)] }
      piezas.pop()
    }
  }
  return piezas
}

/**
 * Escribe el DXF. Lanza `ErrorDxfSalida` si una coordenada calculada, cota
 * de curva o altura no es válida; lo que no se escribe, lo no comprobado y
 * lo dudoso van a `avisos`.
 */
export function escribirDxf(entrada: EntradaDxf): SalidaDxf {
  const alturaTexto = entrada.alturaTexto ?? 1
  if (!(alturaTexto > 0) || !Number.isFinite(alturaTexto)) {
    throw new ErrorDxfSalida(`Altura de texto no válida (${alturaTexto}): debe ser mayor que 0.`)
  }
  const rotularCurvas = entrada.rotularCurvas ?? true
  const avisos: string[] = []
  const e = new Escritor()

  let curvasNoComprobadas = 0
  for (const curva of entrada.curvas ?? []) {
    const contexto = `Curva de cota ${formatoCota(curva.cota)}`
    numeroDxf(curva.cota, contexto)
    const piezas = piezasPorComprobacion(curva.puntos, curva.cerrada, curva.comprobada, curva.tramosComprobados, contexto)
    let escrita = false
    let noComprobada = !curva.comprobada
    for (const pieza of piezas) {
      const puntos = limpiarPuntos(pieza.puntos, pieza.cerrada, contexto)
      if (puntos.length < 2) continue
      e.polilinea(capaCurva(curva.maestra, pieza.comprobada), puntos, pieza.cerrada, curva.cota, contexto)
      escrita = true
      if (!pieza.comprobada) noComprobada = true
    }
    if (!escrita) {
      avisos.push(`${contexto} sin largo: no se escribió.`)
      continue
    }
    if (noComprobada) curvasNoComprobadas++
    if (rotularCurvas) {
      for (const r of curva.rotulos ?? []) {
        const contenido = textoDxf(r.texto)
        if (!contenido) continue
        const texto = noComprobada ? contenido + SUFIJO_CURVA_NO_COMPROBADA : contenido
        e.texto('ROTULOS', r.x, r.y, alturaTexto, texto, giroLegible(r.angulo), true, `${contexto}, rótulo`)
      }
    }
  }
  if (curvasNoComprobadas > 0) {
    avisos.push(
      `${curvasNoComprobadas} ${curvasNoComprobadas === 1 ? 'curva tiene' : 'curvas tienen'} tramos no comprobados ` +
        '(sobre puntos de una nivelación sin cerrar o sin comprobar): van en las capas CURVAS_NO_COMPROBADAS ' +
        'y CURVAS_MAESTRAS_NO_COMPROBADAS, con línea discontinua.',
    )
  }

  // Puntos: uno sin cota o sin coordenadas se salta (en campo es normal).
  const vistos = new Map<string, { quien: string; z: string }>()
  let puntosNoComprobados = 0
  ;(entrada.puntos ?? []).forEach((p, i) => {
    const nombre = p.nombre !== undefined ? textoDxf(p.nombre) : ''
    const quien = nombre ? `Punto ${p.nombre!.trim()}` : `Punto n.º ${i + 1}`
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      avisos.push(`${quien} sin coordenadas: no se escribió.`)
      return
    }
    if (!Number.isFinite(p.z)) {
      avisos.push(`${quien} sin cota: no se escribió.`)
      return
    }
    const clave = `${numeroDxf(p.x)} ${numeroDxf(p.y)}`
    const z = numeroDxf(p.z)
    const previo = vistos.get(clave)
    if (!previo) vistos.set(clave, { quien, z })
    else if (previo.z !== z) {
      avisos.push(
        `${previo.quien} y ${quien} están en el mismo sitio con cotas distintas (${previo.z} y ${z}): ` +
          'se escribieron los dos; revise cuál vale.',
      )
    }

    if (!p.comprobado) puntosNoComprobados++
    e.puntoCota(p.comprobado ? 'PUNTOS' : 'PUNTOS_NO_COMPROBADOS', p, quien)
    if (nombre) {
      let rotulo = entrada.rotularCotaPuntos ? `${nombre} ${z}` : nombre
      if (!p.comprobado) rotulo += SUFIJO_PUNTO_NO_COMPROBADO
      // Arriba a la derecha del punto, separado media letra.
      const d = alturaTexto / 2
      e.texto('ROTULOS', p.x + d, p.y + d, alturaTexto, rotulo, 0, false, `${quien}, rótulo`)
    }
  })
  if (puntosNoComprobados > 0) {
    avisos.push(
      `${puntosNoComprobados} ${puntosNoComprobados === 1 ? 'punto no comprobado va' : 'puntos no comprobados van'} ` +
        'en la capa PUNTOS_NO_COMPROBADOS.',
    )
  }

  let perfilNoComprobado = false
  ;(entrada.perfil ?? []).forEach((lineaPerfil, i) => {
    const contexto = `Perfil ${i + 1}`
    const piezas = piezasPorComprobacion(lineaPerfil.puntos, false, lineaPerfil.comprobado, lineaPerfil.tramosComprobados, contexto)
    let escrita = false
    for (const pieza of piezas) {
      const puntos = limpiarPuntos(pieza.puntos, false, contexto)
      if (puntos.length < 2) continue
      e.polilinea(pieza.comprobada ? 'PERFIL' : 'PERFIL_NO_COMPROBADO', puntos, false, null, contexto)
      escrita = true
      if (!pieza.comprobada) perfilNoComprobado = true
    }
    if (!escrita) avisos.push(`${contexto} sin largo: no se escribió.`)
  })
  if (perfilNoComprobado) {
    avisos.push('El perfil tiene tramos no comprobados: van en la capa PERFIL_NO_COMPROBADO, con línea discontinua.')
  }

  for (const t of entrada.textos ?? []) {
    const contenido = textoDxf(t.texto)
    const contexto = `Texto «${t.texto}»`
    if (!contenido) {
      avisos.push(`Texto vacío en (${numeroDxf(t.x, contexto)}, ${numeroDxf(t.y, contexto)}): no se escribió.`)
      continue
    }
    if (!(t.altura > 0) || !Number.isFinite(t.altura)) {
      throw new ErrorDxfSalida(`${contexto}: altura no válida (${t.altura}), debe ser mayor que 0.`)
    }
    e.texto(t.capa ?? 'ROTULOS', t.x, t.y, t.altura, contenido, t.rotacion ?? 0, false, contexto)
  }

  if (e.entidades === 0) avisos.push('No hay nada que dibujar.')
  return { texto: armarArchivo(e, alturaTexto), avisos }
}

/** Junta HEADER, TABLES, ENTITIES y EOF. */
function armarArchivo(e: Escritor, alturaTexto: number): string {
  const vacio = e.entidades === 0
  const min = { x: vacio ? 0 : e.min.x, y: vacio ? 0 : e.min.y, z: Number.isFinite(e.min.z) ? e.min.z : 0 }
  const max = { x: vacio ? 0 : e.max.x, y: vacio ? 0 : e.max.y, z: Number.isFinite(e.max.z) ? e.max.z : 0 }
  const partes: string[] = []
  const g = (codigo: number, valor: string | number) => partes.push(linea(codigo, valor))
  const variable = (nombre: string, ...pares: [number, string | number][]) => {
    g(9, nombre)
    for (const [c, v] of pares) g(c, v)
  }

  g(0, 'SECTION')
  g(2, 'HEADER')
  variable('$ACADVER', [1, 'AC1009'])
  variable('$INSUNITS', [70, 6])
  variable('$EXTMIN', [10, numeroDxf(min.x)], [20, numeroDxf(min.y)], [30, numeroDxf(min.z)])
  variable('$EXTMAX', [10, numeroDxf(max.x)], [20, numeroDxf(max.y)], [30, numeroDxf(max.z)])
  variable('$PDMODE', [70, 3])
  variable('$PDSIZE', [40, numeroDxf(alturaTexto / 2)])
  g(0, 'ENDSEC')

  g(0, 'SECTION')
  g(2, 'TABLES')
  g(0, 'TABLE')
  g(2, 'LTYPE')
  g(70, 2)
  g(0, 'LTYPE')
  g(2, 'CONTINUOUS')
  g(70, 0)
  g(3, 'Solid line')
  g(72, 65)
  g(73, 0)
  g(40, numeroDxf(0))
  // Discontinua: trazo de 2 letras y hueco de 1, en metros del dibujo.
  g(0, 'LTYPE')
  g(2, 'DASHED')
  g(70, 0)
  g(3, '__ __ __ __')
  g(72, 65)
  g(73, 2)
  g(40, numeroDxf(3 * alturaTexto))
  g(49, numeroDxf(2 * alturaTexto))
  g(49, numeroDxf(-alturaTexto))
  g(0, 'ENDTAB')
  g(0, 'TABLE')
  g(2, 'LAYER')
  g(70, CAPAS_SALIDA.length + 1)
  for (const { nombre, color, tipoLinea } of [{ nombre: '0', color: 7, tipoLinea: 'CONTINUOUS' }, ...CAPAS_SALIDA]) {
    g(0, 'LAYER')
    g(2, nombre)
    g(70, 0)
    g(62, color)
    g(6, tipoLinea)
  }
  g(0, 'ENDTAB')
  g(0, 'ENDSEC')

  g(0, 'SECTION')
  g(2, 'ENTITIES')
  return partes.join('') + e.partes.join('') + linea(0, 'ENDSEC') + linea(0, 'EOF')
}
