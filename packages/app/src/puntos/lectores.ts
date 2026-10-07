/**
 * Lectores de puntos de estación total y GNSS: CSV/TXT (PNEZD, PENZD, NEZ…)
 * y Leica GSI-8 / GSI-16.
 *
 * Reglas:
 * - x = este, y = norte, en metros. La cota puede faltar (null), y se dice.
 * - Nunca se descarta una línea en silencio: lo que no se entiende queda en
 *   `avisos` con su número de línea y su texto, para que Max lo corrija en
 *   el archivo o lo anote a mano.
 * - Las coordenadas no se transforman. Si parecen UTM (este de 6 cifras,
 *   norte de 7), se propone ese sistema; la zona no se adivina.
 */

export type FormatoDePuntos = 'texto' | 'gsi8' | 'gsi16'
export type Separador = 'coma' | 'puntoYComa' | 'tab' | 'espacios'
/** Orden de columnas sin encabezado. Z y D pueden faltar en cada línea. */
export type OrdenColumnas = 'PNEZD' | 'PENZD' | 'NEZD' | 'ENZD'

export interface PuntoLeido {
  id: string
  /** Este, en metros. */
  x: number
  /** Norte, en metros. */
  y: number
  /** Null si el archivo no la trae para este punto. */
  z: number | null
  codigo: string | null
  /** Línea del archivo, desde 1. */
  linea: number
  /** La línea de estación de un GSI (palabras 84/85/86). */
  estacion: boolean
  /** Lo que el GNSS dice de su solución (FIJA, FLOTANTE…), si el archivo lo trae. */
  solucion: string | null
}

export interface AvisoDeLinea {
  linea: number
  texto: string
  /** La línea tal cual estaba, para mostrarla. */
  contenido: string
}

export interface SistemaPropuesto {
  tipo: 'local' | 'utm'
  /** Solo una pista: el norte de Perú (8–10 millones) es del hemisferio sur. A confirmar. */
  hemisferioProbable: 'S' | null
  motivo: string
}

export interface LecturaDePuntos {
  formato: FormatoDePuntos
  /** Letras de las columnas usadas, en su orden (p. ej. «PENZD»). Null en GSI. */
  orden: string | null
  /** Si el orden salió del encabezado, de las magnitudes UTM o del usuario, y no de una suposición. */
  ordenSeguro: boolean
  separador: Separador | null
  conEncabezado: boolean
  puntos: PuntoLeido[]
  avisos: AvisoDeLinea[]
  /** Lo que vale para todo el archivo. */
  avisosGenerales: string[]
  sistema: SistemaPropuesto
  /**
   * Con encabezado: las columnas que pueden ser la cota, la usada primero.
   * Si hay más de una, la interfaz debe dejar elegir (`columnaCota`).
   */
  columnasDeCota: string[]
}

export interface OpcionesLectura {
  /** Fuerza el orden de columnas de un archivo sin encabezado. Se respeta tal cual. */
  orden?: OrdenColumnas
  /** Con encabezado: el nombre de la columna que es la cota, si hay más de una que podría serlo. */
  columnaCota?: string
}

// ─── Entrada común ────────────────────────────────────────────────────────

/** Detecta si es GSI o texto y lo lee. */
export function leerPuntos(texto: string, opciones: OpcionesLectura = {}): LecturaDePuntos {
  const primera = texto.split(/\r?\n/).find((l) => l.trim() !== '')?.trim() ?? ''
  if (/^\*?\d{2}[0-9.]{4}[+-]\S/.test(primera)) return leerGsi(texto)
  return leerTextoDePuntos(texto, opciones)
}

function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Avisa los ids repetidos (los dos se conservan: el usuario decide). */
function avisarRepetidos(puntos: PuntoLeido[], avisos: AvisoDeLinea[], lineas: string[]): void {
  const vistos = new Map<string, number>()
  for (const p of puntos) {
    const antes = vistos.get(p.id)
    if (antes === undefined) vistos.set(p.id, p.linea)
    else {
      avisos.push({
        linea: p.linea,
        texto: `Punto «${p.id}» repetido (ya en la línea ${antes}): se conservan los dos.`,
        contenido: lineas[p.linea - 1] ?? '',
      })
    }
  }
}

function ordenarAvisos(avisos: AvisoDeLinea[]): AvisoDeLinea[] {
  return [...avisos].sort((a, b) => a.linea - b.linea)
}

// ─── Sistema de coordenadas ───────────────────────────────────────────────

function pareceEsteUtm(x: number): boolean {
  return x >= 100000 && x < 1000000
}
function pareceNorteUtm(y: number): boolean {
  return y >= 1000000 && y < 10000000
}

export function proponerSistema(puntos: { x: number; y: number }[]): SistemaPropuesto {
  const validos = puntos.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (validos.length === 0) return { tipo: 'local', hemisferioProbable: null, motivo: 'No hay puntos.' }
  const utm = validos.filter((p) => pareceEsteUtm(p.x) && pareceNorteUtm(p.y))
  const cambiados = validos.filter((p) => pareceNorteUtm(p.x) && pareceEsteUtm(p.y))
  if (utm.length === validos.length) {
    const sur = utm.every((p) => p.y >= 7000000)
    return {
      tipo: 'utm',
      hemisferioProbable: sur ? 'S' : null,
      motivo:
        'Este de 6 cifras y norte de 7: parecen UTM. Falta decir la zona (en Perú, 17, 18 o 19)' +
        (sur ? ' y confirmar el hemisferio sur.' : ' y el hemisferio.'),
    }
  }
  if (cambiados.length === validos.length) {
    return {
      tipo: 'local',
      hemisferioProbable: null,
      motivo: 'El este tiene 7 cifras y el norte 6: parecen UTM con las columnas cambiadas. Revise el orden.',
    }
  }
  if (utm.length > 0) {
    return {
      tipo: 'local',
      hemisferioProbable: null,
      motivo: `Solo ${utm.length} de ${validos.length} puntos parecen UTM: el archivo mezcla sistemas. Revíselo antes de usarlo.`,
    }
  }
  return { tipo: 'local', hemisferioProbable: null, motivo: 'Las coordenadas no parecen UTM: sistema local.' }
}

// ─── CSV / TXT ────────────────────────────────────────────────────────────

type Rol = 'P' | 'N' | 'E' | 'Z' | 'D' | 'S'
/**
 * Qué clase de altura dice el encabezado. En GNSS «h» es la elipsoidal y
 * «H» la ortométrica (la cota); «altura» suele ser la de la antena.
 */
type TipoCota = 'cota' | 'elipsoidal' | 'altura'

interface RolDeColumna {
  rol: Rol
  /** Un nombre que puede ser otra cosa (la «n» suelta puede ser el número de punto). */
  debil: boolean
  cota: TipoCota | null
}

const NOMBRES: Record<Exclude<Rol, 'Z'>, string[]> = {
  // «Nº» y «N°» llegan aquí como «no».
  P: ['p', 'pt', 'pto', 'punto', 'id', 'nombre', 'name', 'point', 'numero', 'num', 'no', 'nro', 'item', 'ptono'],
  N: ['norte', 'north', 'northing', 'y', 'coordn'],
  E: ['e', 'este', 'east', 'easting', 'x', 'coorde'],
  D: ['d', 'desc', 'descripcion', 'description', 'codigo', 'code', 'cod', 'obs', 'observacion'],
  S: ['solucion', 'solution', 'status', 'estado', 'fix', 'tiposolucion', 'calidad'],
}

const NOMBRES_COTA: Record<TipoCota, string[]> = {
  cota: ['z', 'cota', 'elev', 'elevacion', 'elevation', 'altitud', 'ortometrica', 'cotaortometrica', 'msnm', 'horto'],
  elipsoidal: ['elipsoidal', 'alturaelipsoidal', 'helip', 'helipsoidal', 'hell', 'ellipsoidalheight', 'ellheight'],
  altura: ['altura', 'alt', 'height'],
}

/** Preferencia al elegir la cota entre varias columnas. */
const PREFERENCIA_COTA: Record<TipoCota, number> = { cota: 0, elipsoidal: 1, altura: 2 }

function rolDeEncabezado(celda: string): RolDeColumna | null {
  // Sin unidades entre paréntesis y con el ordinal (º) y el grado (°) como «o»:
  // NFD no los descompone y «Nº» quedaba como «n».
  const base = sinAcentos(celda)
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[º°]/g, 'o')
    .replace(/[^A-Za-z0-9]/g, '')
  // Antes de pasar a minúsculas: «H» es la cota, «h» la elipsoidal.
  if (base === 'H') return { rol: 'Z', debil: false, cota: 'cota' }
  if (base === 'h') return { rol: 'Z', debil: false, cota: 'elipsoidal' }
  const limpio = base.toLowerCase()
  if (limpio === 'n') return { rol: 'N', debil: true, cota: null }
  for (const tipo of Object.keys(NOMBRES_COTA) as TipoCota[]) {
    if (NOMBRES_COTA[tipo].includes(limpio)) return { rol: 'Z', debil: false, cota: tipo }
  }
  for (const rol of Object.keys(NOMBRES) as Exclude<Rol, 'Z'>[]) {
    if (NOMBRES[rol].includes(limpio)) return { rol, debil: false, cota: null }
  }
  return null
}

function detectarSeparador(lineas: string[]): Separador {
  const muestra = lineas.slice(0, 30)
  const casiTodas = (c: string) => muestra.filter((l) => l.includes(c)).length >= Math.ceil(muestra.length * 0.8)
  if (casiTodas('\t')) return 'tab'
  if (casiTodas(';')) return 'puntoYComa'
  if (casiTodas(',')) return 'coma'
  return 'espacios'
}

/** Parte una línea; respeta comillas dobles en coma y punto y coma. */
function partir(linea: string, sep: Separador): string[] {
  if (sep === 'espacios') return linea.trim().split(/\s+/)
  if (sep === 'tab') return linea.split('\t').map((c) => c.trim())
  const caracter = sep === 'coma' ? ',' : ';'
  const celdas: string[] = []
  let actual = ''
  let entreComillas = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]!
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"'
        i++
      } else entreComillas = !entreComillas
    } else if (c === caracter && !entreComillas) {
      celdas.push(actual.trim())
      actual = ''
    } else actual += c
  }
  celdas.push(actual.trim())
  return celdas
}

/** Número con punto decimal; con coma decimal solo si la coma no separa columnas. */
function numero(celda: string | undefined, sep: Separador): number | null {
  if (celda === undefined) return null
  let t = celda.trim()
  if (sep !== 'coma') t = t.replace(',', '.')
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null
  return Number(t)
}

interface Columnas {
  P: number | null
  N: number
  E: number
  Z: number | null
  /** Desde esta columna hasta el final es la descripción (sin encabezado), o solo esta (con encabezado). */
  D: number | null
  S: number | null
  descripcionHastaElFinal: boolean
}

function columnasDeOrden(orden: string): Columnas {
  const pos = (letra: string) => {
    const i = orden.indexOf(letra)
    return i < 0 ? null : i
  }
  return {
    P: pos('P'),
    N: pos('N')!,
    E: pos('E')!,
    Z: pos('Z'),
    D: pos('D'),
    S: null,
    descripcionHastaElFinal: true,
  }
}

const SOLUCION_FIJA = /^(fij|fix|rtk ?fij|rtkfix)/i

/** La solución que anotó el GNSS es fija (FIJA, FIXED, RTK FIJO…). */
export function esSolucionFija(solucion: string): boolean {
  return SOLUCION_FIJA.test(sinAcentos(solucion.trim()))
}

interface ColumnasDeEncabezado {
  columnas: Columnas
  orden: string
  columnasDeCota: string[]
  avisos: string[]
}

/** Qué columna es qué, según los nombres del encabezado. */
function deEncabezado(primera: string[], info: (RolDeColumna | null)[], opciones: OpcionesLectura): ColumnasDeEncabezado {
  const avisos: string[] = []
  const indices = (pred: (r: RolDeColumna) => boolean) => info.flatMap((r, i) => (r !== null && pred(r) ? [i] : []))
  const primeroDe = (rol: Rol) => indices((r) => r.rol === rol)[0] ?? null

  // Norte: un nombre claro gana a la «n» suelta, que entonces es el número de punto.
  const nortesClaros = indices((r) => r.rol === 'N' && !r.debil)
  const nortesDebiles = indices((r) => r.rol === 'N' && r.debil)
  const N = nortesClaros[0] ?? nortesDebiles[0]!
  let P = primeroDe('P')
  if (nortesClaros.length > 0 && nortesDebiles.length > 0 && P === null) {
    P = nortesDebiles[0]!
    avisos.push(
      `La columna «${primera[P]}» se tomó como número de punto: ya hay una columna de norte («${primera[N]}»).`,
    )
  }

  // Cota: la ortométrica (cota, H, elevación) antes que la elipsoidal (h) y
  // que la «altura», que en GNSS suele ser la de la antena.
  const candidatas = indices((r) => r.rol === 'Z').sort(
    (a, b) => PREFERENCIA_COTA[info[a]!.cota!] - PREFERENCIA_COTA[info[b]!.cota!] || a - b,
  )
  let Z = candidatas[0] ?? null
  if (opciones.columnaCota !== undefined) {
    const pedido = opciones.columnaCota.trim()
    const i = primera.findIndex((c) => c.trim() === pedido)
    const j = i >= 0 ? i : primera.findIndex((c) => c.trim().toLowerCase() === pedido.toLowerCase())
    if (j >= 0) Z = j
    else avisos.push(`No hay una columna «${pedido}» para la cota: se usó ${Z === null ? 'ninguna' : `«${primera[Z]}»`}.`)
  }
  const columnasDeCota = Z === null ? [] : [Z, ...candidatas.filter((i) => i !== Z)].map((i) => primera[i]!)
  if (Z !== null && opciones.columnaCota === undefined) {
    if (candidatas.length > 1) {
      avisos.push(
        `Hay ${candidatas.length} columnas que pueden ser la cota (${candidatas.map((i) => primera[i]).join(', ')}): ` +
          `se usó «${primera[Z]}». Si no es esa, elija la columna de la cota.`,
      )
    }
    const tipo = info[Z]?.cota
    if (tipo === 'elipsoidal') {
      avisos.push(
        `La cota sale de «${primera[Z]}», que parece altura elipsoidal (la del GNSS sin modelo de geoide): ` +
          'no es la cota sobre el nivel del mar. Confírmelo antes de usarla.',
      )
    } else if (tipo === 'altura') {
      avisos.push(
        `La columna «${primera[Z]}» se tomó como cota: si es la altura de la antena o del jalón, no la use como cota.`,
      )
    }
  }

  const columnas: Columnas = {
    P,
    N,
    E: primeroDe('E')!,
    Z,
    D: primeroDe('D'),
    S: primeroDe('S'),
    descripcionHastaElFinal: false,
  }
  const letras: [number | null, string][] = [
    [columnas.P, 'P'],
    [columnas.N, 'N'],
    [columnas.E, 'E'],
    [columnas.Z, 'Z'],
    [columnas.D, 'D'],
  ]
  const orden = letras
    .filter((l): l is [number, string] => l[0] !== null)
    .sort((a, b) => a[0] - b[0])
    .map((l) => l[1])
    .join('')
  const usadas = new Set([...letras.map((l) => l[0]), columnas.S].filter((i): i is number => i !== null))
  const sinUso = primera.filter((c, i) => !usadas.has(i) && c !== '')
  if (sinUso.length > 0) avisos.push(`Columnas que no se usan: ${sinUso.join(', ')}.`)
  return { columnas, orden, columnasDeCota, avisos }
}

interface DecisionDeOrden {
  orden: OrdenColumnas
  conNombre: boolean
  seguro: boolean
  aviso: string | null
}

/**
 * Sin encabezado: ¿la primera columna es el nombre o una coordenada, y va
 * antes el norte o el este? No basta contar columnas: un PNE sin cota tiene 3
 * como un NEZ, y un NEZD con descripción tiene 4 como un PNEZ. Primero mandan
 * las magnitudes UTM (norte de 7 cifras, este de 6), después un texto en la
 * primera columna y, al final, un entero corto delante de coordenadas con
 * decimales (el número de punto). Lo que se supone se dice.
 */
function decidirOrden(filas: { celdas: string[] }[], sep: Separador): DecisionDeOrden {
  const anchos = filas.map((f) => f.celdas.length).sort((a, b) => a - b)
  const ancho = anchos[Math.floor(anchos.length / 2)]!

  /** 'NE' o 'EN' si las columnas i, i+1 son un par UTM en todas las filas que las traen. */
  const parUtm = (i: number): 'NE' | 'EN' | null => {
    const pares = filas
      .map((f) => [numero(f.celdas[i], sep), numero(f.celdas[i + 1], sep)] as const)
      .filter((p): p is readonly [number, number] => p[0] !== null && p[1] !== null)
    if (pares.length === 0 || pares.length < filas.length / 2) return null
    if (pares.every(([a, b]) => pareceNorteUtm(a) && pareceEsteUtm(b))) return 'NE'
    if (pares.every(([a, b]) => pareceEsteUtm(a) && pareceNorteUtm(b))) return 'EN'
    return null
  }
  const ordenDe = (conNombre: boolean, letras: 'NE' | 'EN'): OrdenColumnas =>
    `${conNombre ? 'P' : ''}${letras}ZD` as OrdenColumnas

  const p12 = ancho >= 3 ? parUtm(1) : null
  const p01 = parUtm(0)
  if (p12 && !p01) return { orden: ordenDe(true, p12), conNombre: true, seguro: true, aviso: null }
  if (p01 && !p12) return { orden: ordenDe(false, p01), conNombre: false, seguro: true, aviso: null }

  const primeras = filas.map((f) => (f.celdas[0] ?? '').trim()).filter((c) => c !== '')
  const conTexto = primeras.some((c) => numero(c, sep) === null)
  const enteras = primeras.length > 0 && primeras.every((c) => /^\d+$/.test(c))
  const conDecimales = (i: number) => filas.some((f) => /[.,]\d/.test(f.celdas[i] ?? ''))

  let conNombre: boolean
  let nombreSeguro = false
  if (ancho < 3) conNombre = false
  else if (conTexto) {
    conNombre = true
    nombreSeguro = true
  } else if (enteras && (conDecimales(1) || conDecimales(2))) conNombre = true
  else conNombre = enteras && ancho >= 4

  const orden = ordenDe(conNombre, 'NE')
  const otroOrden = ordenDe(conNombre, 'EN')
  let aviso =
    `No se pudo saber si va primero el norte o el este: se supuso ${orden} (norte primero). ` +
    `Si los puntos salen girados, elija ${otroOrden}.`
  if (!nombreSeguro && ancho >= 3) {
    aviso += conNombre
      ? ` Tampoco es seguro que la primera columna sea el nombre (parece un número de punto): si es el norte, elija ${ordenDe(false, 'NE')}.`
      : ` Tampoco es seguro que la primera columna sea una coordenada: si es el nombre del punto, elija ${ordenDe(true, 'NE')}.`
  }
  return { orden, conNombre, seguro: false, aviso }
}

export function leerTextoDePuntos(texto: string, opciones: OpcionesLectura = {}): LecturaDePuntos {
  const lineas = texto.split(/\r?\n/)
  const avisos: AvisoDeLinea[] = []
  const avisosGenerales: string[] = []
  const puntos: PuntoLeido[] = []

  // Líneas con datos (índice en `lineas`), sin vacías ni comentarios.
  const utiles: number[] = []
  let comentarios = 0
  lineas.forEach((l, i) => {
    const t = l.trim()
    if (t === '') return
    if (t.startsWith('#') || t.startsWith('//')) {
      comentarios++
      return
    }
    utiles.push(i)
  })
  if (comentarios > 0) {
    avisosGenerales.push(`${comentarios} ${comentarios === 1 ? 'línea de comentario se saltó' : 'líneas de comentario se saltaron'}.`)
  }

  const vacio = (sep: Separador | null): LecturaDePuntos => ({
    formato: 'texto',
    orden: null,
    ordenSeguro: false,
    separador: sep,
    conEncabezado: false,
    puntos: [],
    avisos,
    avisosGenerales,
    sistema: proponerSistema([]),
    columnasDeCota: [],
  })
  if (utiles.length === 0) {
    avisosGenerales.push('El archivo no tiene datos.')
    return vacio(null)
  }

  const sep = detectarSeparador(utiles.map((i) => lineas[i]!))
  const filas = utiles.map((i) => ({ indice: i, celdas: partir(lineas[i]!, sep) }))

  // ¿Encabezado? La primera fila tiene al menos un este y un norte por nombre.
  const primera = filas[0]!.celdas
  const info = primera.map(rolDeEncabezado)
  const tieneRol = (rol: Rol) => info.some((r) => r?.rol === rol)
  const conEncabezado = tieneRol('N') && tieneRol('E') && primera.every((c) => numero(c, sep) === null)

  let columnas: Columnas
  let orden: string
  let ordenSeguro: boolean
  let datos = filas
  let columnasDeCota: string[] = []

  if (conEncabezado) {
    datos = filas.slice(1)
    const encabezado = deEncabezado(primera, info, opciones)
    columnas = encabezado.columnas
    orden = encabezado.orden
    columnasDeCota = encabezado.columnasDeCota
    avisosGenerales.push(...encabezado.avisos)
    ordenSeguro = true
  } else {
    let conNombre: boolean
    if (opciones.orden) {
      // Lo que eligió el usuario se respeta tal cual: con P, la primera es el nombre.
      orden = opciones.orden
      conNombre = orden.startsWith('P')
      ordenSeguro = true
    } else {
      const decision = decidirOrden(filas, sep)
      orden = decision.orden
      conNombre = decision.conNombre
      ordenSeguro = decision.seguro
      if (decision.aviso) avisosGenerales.push(decision.aviso)
    }
    columnas = columnasDeOrden(orden)
    // Lo que de verdad se ve: sin descripción en ninguna línea, no se nombra la D.
    const letrasUsadas = Math.max(...filas.map((f) => f.celdas.length))
    orden = orden.slice(0, Math.min(orden.length, letrasUsadas))
    if (!conNombre) avisosGenerales.push('El archivo no trae nombre de punto: se numeraron en el orden en que vienen.')
  }

  const minimo = Math.max(columnas.N, columnas.E) + 1
  let numerados = 0
  for (const { indice, celdas } of datos) {
    const linea = indice + 1
    const contenido = lineas[indice]!
    const avisar = (t: string) => avisos.push({ linea, texto: t, contenido })
    if (celdas.length < minimo) {
      avisar(`Faltan columnas: hay ${celdas.length} y hacen falta al menos ${minimo}.`)
      continue
    }
    const x = numero(celdas[columnas.E], sep)
    const y = numero(celdas[columnas.N], sep)
    if (x === null || y === null) {
      const malo = [x === null ? `este «${celdas[columnas.E]}»` : '', y === null ? `norte «${celdas[columnas.N]}»` : '']
        .filter(Boolean)
        .join(' y ')
      avisar(`No es un número: ${malo}. El punto no se cargó.`)
      continue
    }
    let id: string
    if (columnas.P === null) id = String(++numerados)
    else {
      id = (celdas[columnas.P] ?? '').trim()
      if (id === '') {
        avisar('El punto no tiene nombre: no se cargó.')
        continue
      }
    }
    let z: number | null = null
    if (columnas.Z !== null) {
      const celdaZ = celdas[columnas.Z]
      z = numero(celdaZ, sep)
      if (celdaZ === undefined || celdaZ.trim() === '') avisar(`El punto «${id}» no tiene cota: se carga solo en planta.`)
      else if (z === null) avisar(`La cota «${celdaZ}» del punto «${id}» no es un número: se carga solo en planta.`)
    }
    let codigo: string | null = null
    if (columnas.D !== null) {
      const partes = columnas.descripcionHastaElFinal ? celdas.slice(columnas.D) : [celdas[columnas.D] ?? '']
      const unido = partes.join(' ').trim()
      codigo = unido === '' ? null : unido
    }
    let solucion: string | null = null
    if (columnas.S !== null) {
      const s = (celdas[columnas.S] ?? '').trim()
      solucion = s === '' ? null : s
      if (solucion !== null && !SOLUCION_FIJA.test(sinAcentos(solucion))) {
        avisar(`El punto «${id}» tiene solución ${solucion}: su precisión no es la de una solución fija.`)
      }
    }
    puntos.push({ id, x, y, z, codigo, linea, estacion: false, solucion })
  }

  avisarRepetidos(puntos, avisos, lineas)
  const sistema = proponerSistema(puntos)
  if (sistema.motivo.includes('cambiadas')) avisosGenerales.push(sistema.motivo)
  if (sistema.motivo.includes('mezcla')) avisosGenerales.push(sistema.motivo)

  // Una coordenada de UTM junto a otra de pocas cifras no es un punto: es
  // una columna corrida (el nombre o la cota tomados por coordenada).
  const descuadrados = puntos.filter((p) => descuadrado(p.x, p.y))
  if (descuadrados.length > 0) {
    const p = descuadrados[0]!
    avisosGenerales.push(
      `En ${descuadrados.length} ${descuadrados.length === 1 ? 'punto' : 'puntos'} una coordenada tiene tamaño de UTM y la ` +
        `otra no (p. ej. «${p.id}», línea ${p.linea}: este ${p.x}, norte ${p.y}). El orden de columnas ${orden} parece ` +
        'equivocado: elija el orden antes de usar los puntos.',
    )
    ordenSeguro = false
  }

  return {
    formato: 'texto',
    orden,
    ordenSeguro,
    separador: sep,
    conEncabezado,
    puntos,
    avisos: ordenarAvisos(avisos),
    avisosGenerales,
    sistema,
    columnasDeCota,
  }
}

/** Una coordenada con tamaño de UTM (≥ 100 000) y la otra de menos de 5 cifras. */
function descuadrado(x: number, y: number): boolean {
  const grande = (v: number) => Math.abs(v) >= 100000
  const chica = (v: number) => Math.abs(v) < 10000
  return (grande(x) && chica(y)) || (grande(y) && chica(x))
}

// ─── Leica GSI ────────────────────────────────────────────────────────────

/**
 * Palabra GSI: 2 cifras de WI, 4 de información (la última, la unidad),
 * signo y 8 (GSI-8) o 16 (GSI-16) caracteres de dato.
 */
const PALABRA = /^(\d{2})(.{4})([+-])(\S+)$/

/** Divisor del dato y factor a metros, según la cifra de unidad. */
const UNIDADES: Record<string, { divisor: number; aMetros: number; pies: boolean }> = {
  '0': { divisor: 1000, aMetros: 1, pies: false },
  '.': { divisor: 1000, aMetros: 1, pies: false },
  '6': { divisor: 10000, aMetros: 1, pies: false },
  '8': { divisor: 100000, aMetros: 1, pies: false },
  '1': { divisor: 1000, aMetros: 0.3048, pies: true },
  '7': { divisor: 10000, aMetros: 0.3048, pies: true },
}

const MEDICIONES = new Set(['21', '22', '31', '32', '33'])

function textoGsi(dato: string): string {
  return dato.replace(/^0+(?=.)/, '')
}

export function leerGsi(texto: string): LecturaDePuntos {
  const lineas = texto.split(/\r?\n/)
  const avisos: AvisoDeLinea[] = []
  const avisosGenerales: string[] = []
  const puntos: PuntoLeido[] = []
  let gsi8 = 0
  let gsi16 = 0
  let enPies = false
  let coordenadasGsi8 = false

  lineas.forEach((original, i) => {
    const t = original.trim()
    if (t === '') return
    const linea = i + 1
    const avisar = (m: string) => avisos.push({ linea, texto: m, contenido: original })
    const valores = new Map<string, number>()
    let id: string | null = null
    let codigo: string | null = null
    let medicion = false
    let bloqueCodigo = false
    const problemas: string[] = []

    for (const palabra of t.replace(/^\*/, '').split(/\s+/)) {
      const m = PALABRA.exec(palabra)
      if (!m) {
        problemas.push(`palabra «${palabra}» no es GSI`)
        continue
      }
      const [, wi, info, signo, dato] = m as unknown as [string, string, string, string, string]
      if (dato.length === 8) gsi8++
      else if (dato.length === 16) gsi16++
      if (wi === '11') id = textoGsi(dato)
      else if (wi === '71') codigo = textoGsi(dato)
      else if (wi === '41') bloqueCodigo = true
      else if (MEDICIONES.has(wi)) medicion = true
      else if (['81', '82', '83', '84', '85', '86'].includes(wi)) {
        const unidad = UNIDADES[info[3]!]
        if (!unidad) {
          problemas.push(`unidad «${info[3]}» desconocida en la palabra ${wi}`)
          continue
        }
        if (!/^\d+$/.test(dato)) {
          problemas.push(`dato «${dato}» de la palabra ${wi} no es un número`)
          continue
        }
        if (unidad.pies) enPies = true
        if (dato.length === 8) coordenadasGsi8 = true
        const valor = (Number(dato) / unidad.divisor) * unidad.aMetros
        valores.set(wi, signo === '-' ? -valor : valor)
      }
    }

    const tiene = (wi: string) => valores.has(wi)
    const conCoordenadas = tiene('81') || tiene('82')
    const esEstacion = !conCoordenadas && (tiene('84') || tiene('85'))
    const [we, wn, wz] = esEstacion ? ['84', '85', '86'] : ['81', '82', '83']

    if (problemas.length > 0) avisar(`${problemas.join('; ')}.${conCoordenadas || esEstacion ? '' : ' El punto no se cargó.'}`)
    if (!conCoordenadas && !esEstacion) {
      if (problemas.length > 0) {
        /* ya avisado */
      } else if (bloqueCodigo) avisar('Es un bloque de código (palabra 41): no se interpreta. Revise los códigos a mano.')
      else if (medicion) {
        avisar(
          'Medición sin coordenadas (solo ángulos y distancias): no se reduce aquí. Exporte coordenadas desde la estación.',
        )
      } else avisar('La línea no trae coordenadas.')
      return
    }
    if (!tiene(we) || !tiene(wn)) {
      // Si la palabra estaba pero dañada, ya se avisó arriba.
      if (problemas.length === 0) avisar(`Falta el ${tiene(we) ? 'norte' : 'este'} (palabra ${tiene(we) ? wn : we}): el punto no se cargó.`)
      else avisos[avisos.length - 1]!.texto += ' El punto no se cargó.'
      return
    }
    if (id === null) {
      id = `L${linea}`
      avisar(`Sin número de punto (palabra 11): se llamó «${id}».`)
    }
    const z = valores.get(wz) ?? null
    if (z === null) avisar(`El punto «${id}» no tiene cota (palabra ${wz}): se carga solo en planta.`)
    puntos.push({
      id,
      x: valores.get(we)!,
      y: valores.get(wn)!,
      z,
      codigo: codigo === '' ? null : codigo,
      linea,
      estacion: esEstacion,
      solucion: null,
    })
  })

  if (enPies) avisosGenerales.push('Hay coordenadas en pies: se pasaron a metros.')
  // 8 cifras al mm no pasan de 99 999.999 m: un norte UTM de 7 cifras no cabe
  // y la estación corta las de adelante sin decirlo.
  if (coordenadasGsi8 && puntos.length > 0) {
    avisosGenerales.push(
      'GSI-8 solo guarda coordenadas hasta 99 999.999 m: si el trabajo es en UTM, se perdieron las cifras de adelante ' +
        'y los puntos salen corridos cientos de km. Para UTM exporte en GSI-16.',
    )
  }
  if (puntos.length === 0 && avisos.length === 0) avisosGenerales.push('El archivo no tiene datos.')
  avisarRepetidos(puntos, avisos, lineas)
  const sistema = proponerSistema(puntos)
  if (sistema.motivo.includes('cambiadas') || sistema.motivo.includes('mezcla')) avisosGenerales.push(sistema.motivo)

  return {
    formato: gsi16 > gsi8 ? 'gsi16' : 'gsi8',
    orden: null,
    ordenSeguro: true,
    separador: null,
    conEncabezado: false,
    puntos,
    avisos: ordenarAvisos(avisos),
    avisosGenerales,
    sistema,
    columnasDeCota: [],
  }
}
