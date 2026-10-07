import Delaunator from 'delaunator'

/*
 * Superficie del terreno: red de triángulos (TIN) de Delaunay sobre los puntos
 * levantados con nivel, estación total o GNSS.
 *
 * Tres reglas que este módulo cuida:
 * 1. Nunca se descarta un punto en silencio. Duplicados y puntos sin número
 *    salen en `avisos`, y también los triángulos quitados por lado máximo
 *    (con el área que dejan sin superficie).
 * 2. No se inventa terreno. Delaunay une todo dentro del contorno convexo, y en
 *    un hueco o una muesca del levantamiento eso son triángulos largos que no
 *    tienen ningún punto medido. Se quitan los que tienen un lado mayor que
 *    `ladoMaximo`.
 * 3. Un triángulo es comprobado solo si sus tres vértices lo son (spec §3: lo
 *    calculado sobre una nivelación sin cerrar tampoco está comprobado).
 *
 * Además avisa (sin cambiar nada) de dos errores de campo comunes: un punto
 * medido dos veces a pocos centímetros con cotas distintas («cercanos»), y un
 * punto que sobresale de sus vecinos mucho más de lo que el terreno de
 * alrededor permite («pico»: altura de antena o de prisma mal puesta, solución
 * GNSS flotante).
 */

export type OrigenPunto = 'nivel' | 'estacion' | 'gnss'

export interface PuntoTerreno {
  id: string
  /** Este, en metros, en el sistema del conjunto. */
  x: number
  /** Norte, en metros. */
  y: number
  /** Cota, en metros. */
  z: number
  origen: OrigenPunto
  comprobado: boolean
  codigo?: string
}

export interface TrianguloTerreno {
  /** Índices en `Superficie.puntos`, en sentido antihorario. */
  a: number
  b: number
  c: number
  /** Sus tres vértices son comprobados. */
  comprobado: boolean
}

export type AvisoTerreno =
  | {
      tipo: 'duplicado'
      /** Id del punto que se quedó. */
      conservado: string
      /** Id del que se dejó fuera. */
      descartado: string
      /** Cota del descartado − cota del conservado, en m. */
      diferenciaZ: number
      mensaje: string
    }
  | { tipo: 'sin-numero'; id: string; mensaje: string }
  | { tipo: 'sin-superficie'; mensaje: string }
  | {
      /** Dos puntos a pocos cm (más que la tolerancia de duplicado): probablemente el mismo, medido dos veces. */
      tipo: 'cercanos'
      /** El que vino primero y el que vino después. */
      ids: [string, string]
      /** Distancia en planta, m. */
      distancia: number
      /** Cota del segundo − cota del primero, m. */
      diferenciaZ: number
      mensaje: string
    }
  | {
      /** Un punto muy por encima o por debajo de lo que dan sus vecinos. */
      tipo: 'pico'
      id: string
      origen: OrigenPunto
      /** Cota del punto − cota que dan sus vecinos, m. */
      diferencia: number
      mensaje: string
    }
  | {
      /** Se quitaron triángulos por tener un lado mayor que el máximo. */
      tipo: 'lado-maximo'
      ladoMaximo: number
      quitados: number
      /** Área en planta que quedó sin superficie, m². */
      areaQuitada: number
      /** Puntos que quedaron sin ningún triángulo (no aportan a la superficie). */
      puntosSueltos: string[]
      mensaje: string
    }

export interface Superficie {
  /** Los puntos que quedaron (sin duplicados ni puntos sin número). */
  puntos: PuntoTerreno[]
  triangulos: TrianguloTerreno[]
  /** El lado máximo que se usó, en m. */
  ladoMaximo: number
  /** Triángulos quitados por tener un lado mayor que `ladoMaximo`. */
  quitadosPorLado: number
  avisos: AvisoTerreno[]
}

export interface OpcionesTriangulacion {
  /**
   * Lado máximo de un triángulo, en m. Por defecto 3 × la mediana del lado
   * mayor de cada triángulo.
   */
  ladoMaximo?: number
  /** Distancia en planta bajo la cual dos puntos son el mismo, en m. Por defecto 0.001. */
  toleranciaDuplicado?: number
  /**
   * Distancia en planta bajo la cual dos puntos se avisan como «cercanos», en m.
   * Por defecto según el origen: 0.03 si alguno es GNSS, 0.01 si no.
   */
  toleranciaCercanos?: number
  /** Cuánto debe apartarse un punto de sus vecinos para avisarlo como pico, en m. Por defecto 0.3. */
  umbralPico?: number
}

const FACTOR_LADO_MAXIMO = 3
/** Distancia de «cercanos» por origen: un GNSS repite a 2–3 cm, una estación o un nivel a menos de 1 cm. */
const CERCANOS_POR_ORIGEN: Record<OrigenPunto, number> = { gnss: 0.03, estacion: 0.01, nivel: 0.01 }
const UMBRAL_PICO = 0.3
/**
 * Un pico es un punto cuya pendiente hacia sus vecinos supera esta cantidad de
 * veces la pendiente típica (mediana) de los triángulos de alrededor. Así la
 * cima de un cerro de pendiente pareja no se avisa, y un punto 1.5 m arriba
 * en una plataforma plana sí.
 */
const FACTOR_PICO = 3

/** Valida una opción en metros: si viene, número finito y > 0. */
function opcionPositiva(valor: number | undefined, nombre: string): number | undefined {
  if (valor === undefined) return undefined
  if (!(valor > 0) || !Number.isFinite(valor)) {
    throw new Error(`${nombre} debe ser un número positivo de metros (llegó ${valor}).`)
  }
  return valor
}

function cm(metros: number): string {
  const v = Math.abs(metros) * 100
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} cm`
}

const QUE_REVISAR: Record<OrigenPunto, string> = {
  gnss: 'revise la altura de antena y si la solución fue fija',
  estacion: 'revise la altura del prisma',
  nivel: 'revise la lectura de mira',
}

function esNumero(v: number): boolean {
  return typeof v === 'number' && Number.isFinite(v)
}

function mm(metros: number): string {
  return `${Math.round(Math.abs(metros) * 1000)} mm`
}

/** Quita duplicados en planta con una grilla de celdas del tamaño de la tolerancia. */
function sinDuplicados(
  entrada: PuntoTerreno[],
  tolerancia: number,
  avisos: AvisoTerreno[],
): PuntoTerreno[] {
  const quedan: (PuntoTerreno | null)[] = []
  // columnas → filas → índices en `quedan`; claves numéricas (con UTM un texto por celda es lento)
  const celdas = new Map<number, Map<number, number[]>>()
  const enCelda = (i: number, j: number): number[] | undefined => celdas.get(i)?.get(j)

  for (const p of entrada) {
    if (!esNumero(p.x) || !esNumero(p.y) || !esNumero(p.z)) {
      avisos.push({
        tipo: 'sin-numero',
        id: p.id,
        mensaje: `El punto ${p.id} no tiene este, norte o cota con número: no entra en la superficie.`,
      })
      continue
    }
    const ci = Math.floor(p.x / tolerancia)
    const cj = Math.floor(p.y / tolerancia)
    let igual = -1
    for (let di = -1; di <= 1 && igual < 0; di++) {
      for (let dj = -1; dj <= 1 && igual < 0; dj++) {
        for (const k of enCelda(ci + di, cj + dj) ?? []) {
          const q = quedan[k]
          if (q && Math.hypot(q.x - p.x, q.y - p.y) < tolerancia) {
            igual = k
            break
          }
        }
      }
    }
    if (igual < 0) {
      const k = quedan.length
      quedan.push(p)
      let columna = celdas.get(ci)
      if (!columna) celdas.set(ci, (columna = new Map()))
      const lista = columna.get(cj)
      if (lista) lista.push(k)
      else columna.set(cj, [k])
      continue
    }
    const previo = quedan[igual]!
    // se queda el comprobado; si los dos lo son (o ninguno), el primero
    const cambia = p.comprobado && !previo.comprobado
    const conservado = cambia ? p : previo
    const descartado = cambia ? previo : p
    if (cambia) quedan[igual] = p
    const dz = descartado.z - conservado.z
    avisos.push({
      tipo: 'duplicado',
      conservado: conservado.id,
      descartado: descartado.id,
      diferenciaZ: dz,
      mensaje:
        `Los puntos ${conservado.id} y ${descartado.id} están en el mismo lugar` +
        (dz === 0 ? ' con la misma cota' : `; sus cotas difieren en ${mm(dz)}`) +
        `. Se usa ${conservado.id}` +
        (cambia || (conservado.comprobado && !descartado.comprobado) ? ' (es el comprobado).' : '.'),
    })
  }
  return quedan.filter((p): p is PuntoTerreno => p !== null)
}

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2
}

/**
 * Arma la superficie. Sobre el lado máximo por defecto: se toma la mediana del
 * lado MAYOR de cada triángulo y no la de todos los lados, porque un
 * levantamiento por secciones (tomas cada 1–2 m en la sección, secciones cada
 * 20 m) tiene casi todos los triángulos tendidos de una sección a la otra: con
 * la mediana de todos los lados (≈ 2 m) se borraría la calle entera.
 */
export function triangular(entrada: PuntoTerreno[], opciones: OpcionesTriangulacion = {}): Superficie {
  // Una tolerancia de 0 o negativa deja todos los puntos en una celda y nunca
  // detecta un duplicado: Delaunator ignora el repetido y su cota se pierde sin aviso.
  const toleranciaDuplicado = opcionPositiva(opciones.toleranciaDuplicado, 'La tolerancia de duplicado') ?? 0.001
  const ladoPedido = opcionPositiva(opciones.ladoMaximo, 'El lado máximo')
  const toleranciaCercanos = opcionPositiva(opciones.toleranciaCercanos, 'La tolerancia de puntos cercanos')
  const umbralPico = opcionPositiva(opciones.umbralPico, 'El umbral de pico') ?? UMBRAL_PICO

  const avisos: AvisoTerreno[] = []
  const puntos = sinDuplicados(entrada, toleranciaDuplicado, avisos)
  avisarCercanos(puntos, toleranciaDuplicado, toleranciaCercanos, avisos)

  const vacia = (motivo: string): Superficie => {
    avisos.push({ tipo: 'sin-superficie', mensaje: motivo })
    return { puntos, triangulos: [], ladoMaximo: ladoPedido ?? 0, quitadosPorLado: 0, avisos }
  }
  if (puntos.length < 3) return vacia('Hacen falta por lo menos tres puntos para armar una superficie.')

  const coords = new Float64Array(puntos.length * 2)
  puntos.forEach((p, i) => {
    coords[2 * i] = p.x
    coords[2 * i + 1] = p.y
  })
  const d = new Delaunator(coords)
  const t = d.triangles
  const n = t.length / 3
  if (n === 0) return vacia('Los puntos están todos en una línea: no forman superficie.')

  const ladoMayor = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    const a = puntos[t[3 * k]!]!
    const b = puntos[t[3 * k + 1]!]!
    const c = puntos[t[3 * k + 2]!]!
    ladoMayor[k] = Math.max(
      Math.hypot(b.x - a.x, b.y - a.y),
      Math.hypot(c.x - b.x, c.y - b.y),
      Math.hypot(a.x - c.x, a.y - c.y),
    )
  }
  const ladoMaximo = ladoPedido ?? FACTOR_LADO_MAXIMO * mediana(Array.from(ladoMayor))

  const triangulos: TrianguloTerreno[] = []
  let quitadosPorLado = 0
  let areaQuitada = 0
  // pequeña holgura para que un lado igual al máximo no se pierda por redondeo
  const limite = ladoMaximo * (1 + 1e-9)
  for (let k = 0; k < n; k++) {
    if (ladoMayor[k]! > limite) {
      quitadosPorLado++
      const pa = puntos[t[3 * k]!]!
      const pb = puntos[t[3 * k + 1]!]!
      const pc = puntos[t[3 * k + 2]!]!
      areaQuitada += Math.abs((pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x)) / 2
      continue
    }
    const a = t[3 * k]!
    const b = t[3 * k + 1]!
    const c = t[3 * k + 2]!
    // descarta triángulos de área nula (puntos en línea dentro de la red)
    const pa = puntos[a]!
    const pb = puntos[b]!
    const pc = puntos[c]!
    const doble = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x)
    if (Math.abs(doble) < 1e-12) continue
    triangulos.push({ a, b, c, comprobado: pa.comprobado && pb.comprobado && pc.comprobado })
  }
  if (quitadosPorLado > 0) {
    const usados = new Uint8Array(puntos.length)
    for (const tr of triangulos) usados[tr.a] = usados[tr.b] = usados[tr.c] = 1
    const puntosSueltos = puntos.filter((_, i) => !usados[i]).map((p) => p.id)
    const lado = Math.round(ladoMaximo * 100) / 100
    const area = Math.round(areaQuitada * 10) / 10
    const sueltos =
      puntosSueltos.length === 0
        ? ''
        : ` ${puntosSueltos.length} punto${puntosSueltos.length === 1 ? '' : 's'} quedaron sin triángulo ` +
          `(${puntosSueltos.slice(0, 5).join(', ')}${puntosSueltos.length > 5 ? '…' : ''}).`
    avisos.push({
      tipo: 'lado-maximo',
      ladoMaximo,
      quitados: quitadosPorLado,
      areaQuitada,
      puntosSueltos,
      mensaje:
        `Se quitaron ${quitadosPorLado} triángulo${quitadosPorLado === 1 ? '' : 's'} con un lado mayor que ${lado} m ` +
        `(${area} m² quedan sin superficie): son huecos o bordes sin puntos medidos.` +
        sueltos +
        ' Si ahí hay terreno levantado con tomas más espaciadas, suba el lado máximo.',
    })
  }
  if (triangulos.length === 0) {
    return { ...vacia('Todos los triángulos tenían un lado mayor que el máximo.'), ladoMaximo, quitadosPorLado }
  }
  avisarPicos(puntos, triangulos, umbralPico, avisos)
  return { puntos, triangulos, ladoMaximo, quitadosPorLado, avisos }
}

/**
 * Avisa los pares de puntos (que no son duplicados) a menos de la tolerancia
 * de «cercanos». No cambia nada: decide quien conoce el levantamiento.
 */
function avisarCercanos(
  puntos: PuntoTerreno[],
  toleranciaDuplicado: number,
  fija: number | undefined,
  avisos: AvisoTerreno[],
): void {
  const tolDe = (o: OrigenPunto): number => CERCANOS_POR_ORIGEN[o] ?? 0.01
  const maxima = fija ?? Math.max(...Object.values(CERCANOS_POR_ORIGEN))
  if (!(maxima > toleranciaDuplicado) || puntos.length < 2) return
  const celdas = new Map<number, Map<number, number[]>>()
  puntos.forEach((p, k) => {
    const ci = Math.floor(p.x / maxima)
    const cj = Math.floor(p.y / maxima)
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const m of celdas.get(ci + di)?.get(cj + dj) ?? []) {
          const q = puntos[m]!
          const tol = fija ?? Math.max(tolDe(p.origen), tolDe(q.origen))
          const d = Math.hypot(p.x - q.x, p.y - q.y)
          if (d >= tol) continue
          const dz = p.z - q.z
          avisos.push({
            tipo: 'cercanos',
            ids: [q.id, p.id],
            distancia: d,
            diferenciaZ: dz,
            mensaje:
              `Los puntos ${q.id} y ${p.id} están a ${cm(d)} uno del otro` +
              (Math.abs(dz) < 0.0005 ? ' con la misma cota' : ` y sus cotas difieren en ${mm(dz)}`) +
              '. Si es el mismo punto medido dos veces, decida cuál vale: juntos forman un triángulo' +
              ' muy delgado con una pendiente que no existe.',
          })
        }
      }
    }
    let columna = celdas.get(ci)
    if (!columna) celdas.set(ci, (columna = new Map()))
    const lista = columna.get(cj)
    if (lista) lista.push(k)
    else columna.set(cj, [k])
  })
}

/** Pendiente (m/m) del plano del triángulo k. */
function pendienteDe(puntos: PuntoTerreno[], t: TrianguloTerreno): number {
  const p = puntos[t.a]!
  const q = puntos[t.b]!
  const r = puntos[t.c]!
  const ux = q.x - p.x
  const uy = q.y - p.y
  const uz = q.z - p.z
  const vx = r.x - p.x
  const vy = r.y - p.y
  const vz = r.z - p.z
  const det = ux * vy - uy * vx
  return Math.hypot((uz * vy - uy * vz) / det, (ux * vz - uz * vx) / det)
}

/**
 * Avisa los puntos que sobresalen de sus vecinos: más alto (o más bajo) que
 * todos ellos, más de `umbral` sobre el plano que dan los vecinos, y con una
 * pendiente hacia ellos mayor que FACTOR_PICO × la pendiente típica de los
 * triángulos de alrededor (los de los vecinos que no tocan el punto).
 */
function avisarPicos(puntos: PuntoTerreno[], triangulos: TrianguloTerreno[], umbral: number, avisos: AvisoTerreno[]): void {
  const vecinos: Set<number>[] = puntos.map(() => new Set())
  const incidentes: number[][] = puntos.map(() => [])
  triangulos.forEach((t, k) => {
    for (const [u, v, w] of [
      [t.a, t.b, t.c],
      [t.b, t.c, t.a],
      [t.c, t.a, t.b],
    ] as const) {
      vecinos[u]!.add(v)
      vecinos[u]!.add(w)
      incidentes[u]!.push(k)
    }
  })

  puntos.forEach((p, i) => {
    const vs = [...vecinos[i]!]
    if (vs.length < 3) return
    const arriba = vs.every((j) => p.z > puntos[j]!.z)
    const abajo = vs.every((j) => p.z < puntos[j]!.z)
    if (!arriba && !abajo) return

    // cota que dan los vecinos en el punto: plano por mínimos cuadrados, con
    // coordenadas relativas al punto (con UTM no se pierden cifras)
    let n = 0
    let sx = 0
    let sy = 0
    let sz = 0
    let sxx = 0
    let syy = 0
    let sxy = 0
    let sxz = 0
    let syz = 0
    let distancia = 0
    const z0 = p.z
    for (const j of vs) {
      const q = puntos[j]!
      const dx = q.x - p.x
      const dy = q.y - p.y
      const dz = q.z - z0
      n++
      sx += dx
      sy += dy
      sz += dz
      sxx += dx * dx
      syy += dy * dy
      sxy += dx * dy
      sxz += dx * dz
      syz += dy * dz
      distancia += Math.hypot(dx, dy)
    }
    distancia /= n
    // [n sx sy; sx sxx sxy; sy sxy syy] · [a b c] = [sz sxz syz]; interesa a (cota en el punto)
    const det = n * (sxx * syy - sxy * sxy) - sx * (sx * syy - sxy * sy) + sy * (sx * sxy - sxx * sy)
    const escala = n * Math.max(sxx, syy) ** 2
    const a =
      escala > 0 && Math.abs(det) > 1e-9 * escala
        ? (sz * (sxx * syy - sxy * sxy) - sx * (sxz * syy - sxy * syz) + sy * (sxz * sxy - sxx * syz)) / det
        : sz / n
    const diferencia = -a // z del punto (0 relativo) − cota prevista
    if (Math.abs(diferencia) <= umbral) return

    const propios = new Set(incidentes[i])
    const vistos = new Set<number>()
    const alrededor: number[] = []
    for (const j of vs) {
      for (const k of incidentes[j]!) {
        if (propios.has(k) || vistos.has(k)) continue
        vistos.add(k)
        alrededor.push(pendienteDe(puntos, triangulos[k]!))
      }
    }
    if (alrededor.length === 0) return // sin terreno alrededor no hay con qué comparar
    if (Math.abs(diferencia) / distancia <= FACTOR_PICO * mediana(alrededor)) return

    avisos.push({
      tipo: 'pico',
      id: p.id,
      origen: p.origen,
      diferencia,
      mensaje:
        `El punto ${p.id} queda ${Math.abs(diferencia).toFixed(2)} m ${diferencia > 0 ? 'por encima' : 'por debajo'} ` +
        `de lo que dan sus vecinos, y el terreno de alrededor no tiene esa pendiente: ` +
        `${QUE_REVISAR[p.origen] ?? 'revise su cota'}.`,
    })
  })
}

/** Plano z = a + b·x + c·y de un triángulo. */
export interface PlanoTriangulo {
  a: number
  b: number
  c: number
}

export function planoDe(sup: Superficie, k: number): PlanoTriangulo {
  const t = sup.triangulos[k]!
  const p = sup.puntos[t.a]!
  const q = sup.puntos[t.b]!
  const r = sup.puntos[t.c]!
  const ux = q.x - p.x
  const uy = q.y - p.y
  const uz = q.z - p.z
  const vx = r.x - p.x
  const vy = r.y - p.y
  const vz = r.z - p.z
  const det = ux * vy - uy * vx
  const b = (uz * vy - uy * vz) / det
  const c = (ux * vz - uz * vx) / det
  return { a: p.z - b * p.x - c * p.y, b, c }
}

/*
 * Índice espacial: grilla uniforme de cajas, una lista de triángulos por
 * celda. Se arma una vez por superficie y se guarda aparte (WeakMap) para que
 * `Superficie` siga siendo datos simples que se pueden guardar.
 */
interface Indice {
  x0: number
  y0: number
  tam: number
  nx: number
  ny: number
  celdas: Map<number, number[]>
}

const indices = new WeakMap<Superficie, Indice>()

function indiceDe(sup: Superficie): Indice {
  const hecho = indices.get(sup)
  if (hecho) return hecho
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of sup.puntos) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  const n = Math.max(1, sup.triangulos.length)
  const ancho = Math.max(x1 - x0, 1e-9)
  const alto = Math.max(y1 - y0, 1e-9)
  // unas 2 celdas por triángulo
  const tam = Math.max(Math.sqrt((ancho * alto) / (2 * n)), 1e-6)
  const nx = Math.ceil(ancho / tam) + 1
  const ny = Math.ceil(alto / tam) + 1
  const celdas = new Map<number, number[]>()
  sup.triangulos.forEach((t, k) => {
    const a = sup.puntos[t.a]!
    const b = sup.puntos[t.b]!
    const c = sup.puntos[t.c]!
    const i0 = Math.floor((Math.min(a.x, b.x, c.x) - x0) / tam)
    const i1 = Math.floor((Math.max(a.x, b.x, c.x) - x0) / tam)
    const j0 = Math.floor((Math.min(a.y, b.y, c.y) - y0) / tam)
    const j1 = Math.floor((Math.max(a.y, b.y, c.y) - y0) / tam)
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const clave = j * nx + i
        const lista = celdas.get(clave)
        if (lista) lista.push(k)
        else celdas.set(clave, [k])
      }
    }
  })
  const indice = { x0, y0, tam, nx, ny, celdas }
  indices.set(sup, indice)
  return indice
}

/** Triángulos cuya caja toca el rectángulo dado (sin repetir). */
export function triangulosCerca(sup: Superficie, xMin: number, yMin: number, xMax: number, yMax: number): number[] {
  if (sup.triangulos.length === 0) return []
  const ind = indiceDe(sup)
  const i0 = Math.max(0, Math.floor((xMin - ind.x0) / ind.tam))
  const i1 = Math.min(ind.nx - 1, Math.floor((xMax - ind.x0) / ind.tam))
  const j0 = Math.max(0, Math.floor((yMin - ind.y0) / ind.tam))
  const j1 = Math.min(ind.ny - 1, Math.floor((yMax - ind.y0) / ind.tam))
  if (i0 > i1 || j0 > j1) return []
  const vistos = new Set<number>()
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      for (const k of ind.celdas.get(j * ind.nx + i) ?? []) vistos.add(k)
    }
  }
  return [...vistos]
}

export interface CotaEnPunto {
  z: number
  comprobado: boolean
  /** Índice del triángulo en `Superficie.triangulos`. */
  triangulo: number
}

/**
 * Cota de la superficie en (x, y), o null si cae fuera (no se extrapola). En
 * una arista compartida por un triángulo comprobado y otro no, se dice no
 * comprobado.
 */
export function cotaDeSuperficie(sup: Superficie, x: number, y: number): CotaEnPunto | null {
  const eps = 1e-9
  let hallado: CotaEnPunto | null = null
  for (const k of triangulosCerca(sup, x, y, x, y)) {
    const t = sup.triangulos[k]!
    const a = sup.puntos[t.a]!
    const b = sup.puntos[t.b]!
    const c = sup.puntos[t.c]!
    const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
    const l1 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / det
    const l2 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / det
    const l3 = 1 - l1 - l2
    if (l1 < -eps || l2 < -eps || l3 < -eps) continue
    const z = l1 * a.z + l2 * b.z + l3 * c.z
    if (!hallado) hallado = { z, comprobado: t.comprobado, triangulo: k }
    else if (!t.comprobado) hallado.comprobado = false
  }
  return hallado
}
