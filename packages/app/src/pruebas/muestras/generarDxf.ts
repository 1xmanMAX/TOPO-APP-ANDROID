/**
 * Generador del plano de expediente simulado: un DXF R12 en texto, como el que
 * le llega a Max del proyectista, con tres calles, sus bordes, sus cotas de
 * proyecto, manzanas y curvas de nivel.
 *
 * Por qué R12 y escrito a mano: es la versión que cualquier programa de CAD
 * abre y guarda, y escribirlo grupo por grupo deja ver en la prueba qué hay
 * exactamente en el archivo. Las unidades son metros y el origen local es
 * (1000, 2000), como en los planos de obra que no usan UTM.
 *
 * El archivo `expediente-pistas.dxf` de esta carpeta es la salida de
 * `generarDxfExpediente()`; una prueba comprueba que no se desfasen.
 */

/** Un punto del plano en metros. */
export interface PuntoDxf {
  x: number
  y: number
}

/** Un par código–valor de DXF: el código en una línea y el valor en la siguiente. */
type Grupo = readonly [number, string | number]

/** Origen local del plano: todo el dibujo se desplaza aquí. */
export const ORIGEN_DXF: PuntoDxf = { x: 1000, y: 2000 }

/**
 * Los números se escriben con 4 decimales como máximo: sobra para milímetros
 * y evita colas como 3.5999999999 que ensucian el archivo.
 */
function numero(n: number): string {
  const redondo = Number(n.toFixed(4))
  return String(Object.is(redondo, -0) ? 0 : redondo)
}

function escribirGrupos(grupos: readonly Grupo[]): string {
  return grupos
    .map(([codigo, valor]) => `${codigo}\n${typeof valor === 'number' ? numero(valor) : valor}\n`)
    .join('')
}

// ─── Entidades sueltas (también las usan las pruebas del lector) ───────────

export function dxfLinea(capa: string, a: PuntoDxf, b: PuntoDxf): string {
  return escribirGrupos([
    [0, 'LINE'], [8, capa],
    [10, a.x], [20, a.y], [30, 0],
    [11, b.x], [21, b.y], [31, 0],
  ])
}

/**
 * POLYLINE de R12 (la LWPOLYLINE no existe en R12). `elevacion` va en el
 * grupo 30 del encabezado, que es donde los programas guardan la cota de una
 * curva de nivel.
 */
export function dxfPolilinea(
  capa: string,
  puntos: readonly PuntoDxf[],
  cerrada = false,
  elevacion = 0,
): string {
  const cabeza = escribirGrupos([
    [0, 'POLYLINE'], [8, capa], [66, 1],
    [10, 0], [20, 0], [30, elevacion],
    [70, cerrada ? 1 : 0],
  ])
  const vertices = puntos
    .map((p) => escribirGrupos([[0, 'VERTEX'], [8, capa], [10, p.x], [20, p.y], [30, elevacion]]))
    .join('')
  return cabeza + vertices + escribirGrupos([[0, 'SEQEND'], [8, capa]])
}

export function dxfTexto(capa: string, p: PuntoDxf, altura: number, texto: string): string {
  return escribirGrupos([
    [0, 'TEXT'], [8, capa],
    [10, p.x], [20, p.y], [30, 0],
    [40, altura], [1, texto],
  ])
}

export function dxfCirculo(capa: string, centro: PuntoDxf, radio: number): string {
  return escribirGrupos([
    [0, 'CIRCLE'], [8, capa],
    [10, centro.x], [20, centro.y], [30, 0], [40, radio],
  ])
}

/** Ángulos en grados, contra el reloj desde el eje X, como los guarda el DXF. */
export function dxfArco(
  capa: string,
  centro: PuntoDxf,
  radio: number,
  inicioGrados: number,
  finGrados: number,
): string {
  return escribirGrupos([
    [0, 'ARC'], [8, capa],
    [10, centro.x], [20, centro.y], [30, 0], [40, radio],
    [50, inicioGrados], [51, finGrados],
  ])
}

export function dxfInsercion(capa: string, bloque: string, p: PuntoDxf): string {
  return escribirGrupos([
    [0, 'INSERT'], [8, capa], [2, bloque],
    [10, p.x], [20, p.y], [30, 0],
  ])
}

/**
 * Un HATCH mínimo (sólido, sin contorno). Está para que el lector demuestre
 * que cuenta lo que no dibuja, no para verse.
 */
export function dxfRayado(capa: string): string {
  return escribirGrupos([
    [0, 'HATCH'], [8, capa],
    [10, 0], [20, 0], [30, 0],
    [2, 'SOLID'], [70, 1], [71, 0], [91, 0], [75, 0], [76, 1], [98, 0],
  ])
}

export interface CapaDxf {
  nombre: string
  /** Índice de color de AutoCAD (ACI). Negativo = capa apagada. */
  color: number
}

/** Un bloque de la sección BLOCKS: su nombre y sus entidades ya escritas. */
export interface BloqueDxf {
  nombre: string
  entidades: string
}

/**
 * Arma el archivo completo: HEADER con versión R12 y metros, TABLES con las
 * capas, BLOCKS y ENTITIES.
 */
export function armarDxf(
  capas: readonly CapaDxf[],
  entidades: readonly string[],
  bloques: readonly BloqueDxf[] = [],
): string {
  const encabezado = escribirGrupos([
    [0, 'SECTION'], [2, 'HEADER'],
    [9, '$ACADVER'], [1, 'AC1009'],
    // 6 = metros. R12 no conoce $INSUNITS, pero no estorba y deja dicho en
    // qué unidades está el dibujo para quien lo abra con un programa moderno.
    [9, '$INSUNITS'], [70, 6],
    [0, 'ENDSEC'],
  ])
  const tablas =
    escribirGrupos([
      [0, 'SECTION'], [2, 'TABLES'],
      [0, 'TABLE'], [2, 'LAYER'], [70, capas.length],
    ]) +
    capas
      .map((c) =>
        escribirGrupos([[0, 'LAYER'], [2, c.nombre], [70, 0], [62, c.color], [6, 'CONTINUOUS']]),
      )
      .join('') +
    escribirGrupos([[0, 'ENDTAB'], [0, 'ENDSEC']])
  const seccionBloques =
    escribirGrupos([[0, 'SECTION'], [2, 'BLOCKS']]) +
    bloques
      .map(
        (b) =>
          escribirGrupos([[0, 'BLOCK'], [8, '0'], [2, b.nombre], [70, 0], [10, 0], [20, 0], [30, 0], [3, b.nombre]]) +
          b.entidades +
          escribirGrupos([[0, 'ENDBLK'], [8, '0']]),
      )
      .join('') +
    escribirGrupos([[0, 'ENDSEC']])
  const seccionEntidades =
    escribirGrupos([[0, 'SECTION'], [2, 'ENTITIES']]) +
    entidades.join('') +
    escribirGrupos([[0, 'ENDSEC']])
  return encabezado + tablas + seccionBloques + seccionEntidades + escribirGrupos([[0, 'EOF']])
}

// ─── Geometría de apoyo ───────────────────────────────────────────────────

function enOrigen(p: PuntoDxf): PuntoDxf {
  return { x: p.x + ORIGEN_DXF.x, y: p.y + ORIGEN_DXF.y }
}

function direccion(a: PuntoDxf, b: PuntoDxf): PuntoDxf {
  const largo = Math.hypot(b.x - a.x, b.y - a.y)
  return { x: (b.x - a.x) / largo, y: (b.y - a.y) / largo }
}

/** Normal a la izquierda del avance: girar la dirección 90° contra el reloj. */
function izquierda(d: PuntoDxf): PuntoDxf {
  return { x: -d.y, y: d.x }
}

/**
 * Paralela a una polilínea abierta a `d` metros (positivo a la izquierda del
 * avance). En los quiebres se usa la unión en inglete: el vértice se corre por
 * la bisectriz d / cos(medio ángulo), que es lo que mantiene ambos tramos
 * exactamente a `d` del eje.
 */
export function paralela(puntos: readonly PuntoDxf[], d: number): PuntoDxf[] {
  return puntos.map((p, i) => {
    const antes = i > 0 ? izquierda(direccion(puntos[i - 1]!, p)) : null
    const despues = i < puntos.length - 1 ? izquierda(direccion(p, puntos[i + 1]!)) : null
    if (!antes) return { x: p.x + despues!.x * d, y: p.y + despues!.y * d }
    if (!despues) return { x: p.x + antes.x * d, y: p.y + antes.y * d }
    const suma = { x: antes.x + despues.x, y: antes.y + despues.y }
    const largoSuma = Math.hypot(suma.x, suma.y)
    const bisectriz = { x: suma.x / largoSuma, y: suma.y / largoSuma }
    const coseno = bisectriz.x * antes.x + bisectriz.y * antes.y
    return { x: p.x + (bisectriz.x * d) / coseno, y: p.y + (bisectriz.y * d) / coseno }
  })
}

/** El punto del eje a una progresiva dada (metros desde el inicio) y la dirección del tramo. */
function enProgresiva(puntos: readonly PuntoDxf[], progresiva: number): { punto: PuntoDxf; dir: PuntoDxf } {
  let recorrido = 0
  for (let i = 0; i < puntos.length - 1; i++) {
    const a = puntos[i]!
    const b = puntos[i + 1]!
    const largo = Math.hypot(b.x - a.x, b.y - a.y)
    const dir = direccion(a, b)
    if (progresiva <= recorrido + largo + 1e-9 || i === puntos.length - 2) {
      const t = progresiva - recorrido
      return { punto: { x: a.x + dir.x * t, y: a.y + dir.y * t }, dir }
    }
    recorrido += largo
  }
  throw new Error('Polilínea sin tramos')
}

function progresivaTexto(m: number): string {
  const km = Math.floor(m / 1000)
  return `${km}+${String(Math.round(m - km * 1000)).padStart(3, '0')}`
}

// ─── El expediente simulado ───────────────────────────────────────────────

export interface CalleSimulada {
  nombre: string
  /** Eje en coordenadas locales (antes de sumar el origen). */
  eje: PuntoDxf[]
  cotas: { progresiva: number; cota: number; rotulo: string }[]
  /**
   * La calle nace sobre el eje de otra (su 0+000 es el cruce). Su cota de
   * 0+000 es la de esa otra calle en el cruce, y se rotula en el cruce
   * mismo: así las dos calles la leen en la progresiva correcta.
   */
  naceEnOtraCalle?: boolean
}

/**
 * Las tres calles del expediente. Las cotas se rotulan en formatos distintos
 * a propósito ("3244.400", "NTN 3244.100", "+3244.000", "3248,420"), porque
 * así llegan en los planos reales y el lector debe entender todos.
 *
 * Las rasantes cuadran en los cruces: Jr. Lima baja −0.5 % hasta 0+100 y
 * sube +0.2 % después, así que en 0+060 está a 3244.400 − 0.005·60 =
 * 3244.100 (arranque de Av. Sol) y en 0+150 a 3243.900 + 0.002·50 =
 * 3244.000 (arranque del pasaje). Un escalón en un cruce sería una rasante
 * imposible y llevaría a replantear mal la calle principal.
 */
export const CALLES_SIMULADAS: readonly CalleSimulada[] = [
  {
    nombre: 'JR. LIMA',
    eje: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
    cotas: [
      { progresiva: 0, cota: 3244.4, rotulo: '3244.400' },
      { progresiva: 100, cota: 3243.9, rotulo: '3243.900' },
      { progresiva: 200, cota: 3244.1, rotulo: '3244.100' },
    ],
  },
  {
    // Perpendicular a Jr. Lima desde su 0+060, hacia el norte.
    // Pendiente: (3243.680 − 3244.100) / 120 = −0.350 %.
    nombre: 'AV. SOL',
    eje: [{ x: 60, y: 0 }, { x: 60, y: 120 }],
    naceEnOtraCalle: true,
    cotas: [
      { progresiva: 0, cota: 3244.1, rotulo: 'NTN 3244.100' },
      { progresiva: 120, cota: 3243.68, rotulo: 'NTN 3243.680' },
    ],
  },
  {
    // Quebrado: 60 m al sur y luego 60 m en dirección (0.6, −0.8) —un
    // triángulo 3-4-5: 36 m al este y 48 m al sur—. Es la pista empinada:
    // 4.42 / 60 = 7.367 % y 4.44 / 60 = 7.400 %, con quiebre en 0+060.
    nombre: 'PSJE. LAS LOMAS',
    eje: [{ x: 150, y: 0 }, { x: 150, y: -60 }, { x: 186, y: -108 }],
    naceEnOtraCalle: true,
    cotas: [
      { progresiva: 0, cota: 3244, rotulo: '+3244.000' },
      { progresiva: 60, cota: 3248.42, rotulo: '3248,420' },
      { progresiva: 120, cota: 3252.86, rotulo: '3252.860' },
    ],
  },
]

/**
 * Cuánto se corren hacia adentro de la calle los rótulos de los extremos.
 * Un texto justo en la perpendicular del extremo cae, por el redondeo de
 * coma flotante, a veces una nada fuera de la pista, y quien proyecta lo
 * descarta. 0.1 mm no cambia la progresiva redondeada al milímetro.
 */
const RETIRO_EXTREMO = 0.0001

/**
 * Dónde van el rótulo de la cota y el de la progresiva de un punto del eje.
 *
 * - En un tramo: la cota 1 m a la izquierda y la progresiva 1 m a la derecha.
 * - En un quiebre: la cota 1 m afuera del quiebre, sobre la bisectriz. Del
 *   lado de adentro quedaría más cerca del tramo siguiente que del vértice,
 *   y se proyectaría a otra progresiva; afuera su pie es el vértice desde
 *   los dos tramos.
 * - En el arranque de una calle que nace sobre otra: la cota en el cruce
 *   mismo, que es de las dos calles.
 */
function lugarDeRotulos(
  eje: readonly PuntoDxf[],
  progresiva: number,
  naceEnOtraCalle: boolean,
): { cota: PuntoDxf; progresiva: PuntoDxf } {
  let recorrido = 0
  for (let i = 1; i < eje.length - 1; i++) {
    recorrido += Math.hypot(eje[i]!.x - eje[i - 1]!.x, eje[i]!.y - eje[i - 1]!.y)
    if (Math.abs(recorrido - progresiva) > 1e-9) continue
    const v = eje[i]!
    const d1 = direccion(eje[i - 1]!, v)
    const d2 = direccion(v, eje[i + 1]!)
    const giraALaIzquierda = d1.x * d2.y - d1.y * d2.x > 0
    // Normales del lado de afuera de cada tramo, y su bisectriz.
    const lado = giraALaIzquierda ? -1 : 1
    const n1 = izquierda(d1)
    const n2 = izquierda(d2)
    const suma = { x: lado * (n1.x + n2.x), y: lado * (n1.y + n2.y) }
    const largo = Math.hypot(suma.x, suma.y)
    const b = { x: suma.x / largo, y: suma.y / largo }
    return { cota: { x: v.x + b.x, y: v.y + b.y }, progresiva: { x: v.x - b.x, y: v.y - b.y } }
  }

  const { punto, dir } = enProgresiva(eje, progresiva)
  const izq = izquierda(dir)
  const largoEje = eje.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - eje[i]!.x, p.y - eje[i]!.y), 0)
  const adentro = progresiva <= 0 ? RETIRO_EXTREMO : progresiva >= largoEje ? -RETIRO_EXTREMO : 0
  const base = { x: punto.x + dir.x * adentro, y: punto.y + dir.y * adentro }
  const aLaIzquierda = naceEnOtraCalle && progresiva <= 0 ? 0 : 1
  return {
    cota: { x: base.x + izq.x * aLaIzquierda, y: base.y + izq.y * aLaIzquierda },
    progresiva: { x: punto.x - izq.x, y: punto.y - izq.y },
  }
}

export const CAPAS_EXPEDIENTE: readonly CapaDxf[] = [
  { nombre: 'EJE_VIA', color: 1 },
  { nombre: 'SARDINEL', color: 3 },
  { nombre: 'VEREDA', color: 8 },
  { nombre: 'COTAS_PROY', color: 2 },
  { nombre: 'TEXTO', color: 7 },
  { nombre: 'LOTES', color: 4 },
  { nombre: 'CURVAS_NIVEL', color: 252 },
]

/** El DXF completo del expediente simulado. */
export function generarDxfExpediente(): string {
  const entidades: string[] = []

  for (const calle of CALLES_SIMULADAS) {
    entidades.push(dxfPolilinea('EJE_VIA', calle.eje.map(enOrigen)))
    for (const lado of [1, -1]) {
      entidades.push(dxfPolilinea('SARDINEL', paralela(calle.eje, 3.6 * lado).map(enOrigen)))
      entidades.push(dxfPolilinea('VEREDA', paralela(calle.eje, 5.6 * lado).map(enOrigen)))
    }
    for (const c of calle.cotas) {
      const lugar = lugarDeRotulos(calle.eje, c.progresiva, calle.naceEnOtraCalle === true)
      entidades.push(dxfTexto('COTAS_PROY', enOrigen(lugar.cota), 1, c.rotulo))
      entidades.push(dxfTexto('TEXTO', enOrigen(lugar.progresiva), 1, progresivaTexto(c.progresiva)))
    }
    const medio = enProgresiva(calle.eje, 30).punto
    entidades.push(dxfTexto('TEXTO', enOrigen({ x: medio.x + 2, y: medio.y + 2 }), 1.5, calle.nombre))
  }

  // Manzanas: rectángulos cerrados detrás de las veredas, con sus lotes.
  const manzanas: { rotulo: string; esquinas: PuntoDxf[]; divisiones: number[] }[] = [
    { rotulo: 'MZ A', esquinas: rect(6, 6, 54, 60), divisiones: [22, 38] },
    { rotulo: 'MZ B', esquinas: rect(66, 6, 140, 60), divisiones: [90, 115] },
    { rotulo: 'MZ C', esquinas: rect(6, -50, 144, -6), divisiones: [50, 100] },
  ]
  for (const m of manzanas) {
    entidades.push(dxfPolilinea('LOTES', m.esquinas.map(enOrigen), true))
    const [abajo, , arriba] = [m.esquinas[0]!, m.esquinas[1]!, m.esquinas[2]!]
    m.divisiones.forEach((x, i) => {
      entidades.push(dxfLinea('LOTES', enOrigen({ x, y: abajo.y }), enOrigen({ x, y: arriba.y })))
      entidades.push(dxfTexto('TEXTO', enOrigen({ x: x - 8, y: (abajo.y + arriba.y) / 2 }), 1, String(i + 1)))
    })
    entidades.push(
      dxfTexto('TEXTO', enOrigen({ x: (abajo.x + arriba.x) / 2, y: arriba.y - 4 }), 2, m.rotulo),
    )
  }
  // Un poste en la vereda: el círculo debe llegar como polilínea cerrada.
  entidades.push(dxfCirculo('LOTES', enOrigen({ x: 100, y: 4.6 }), 0.15))
  // Lo que el lector no dibuja: un rayado y un bloque insertado.
  entidades.push(dxfRayado('LOTES'))
  entidades.push(dxfInsercion('TEXTO', 'ESTACA', enOrigen({ x: 0, y: 0 })))

  // Curvas de nivel cada 2 m cruzando la pista empinada, con su cota de
  // elevación, y una curva en arco.
  const curvas: { cota: number; y: number }[] = [
    { cota: 3244, y: -6 },
    { cota: 3246, y: -30 },
    { cota: 3248, y: -55 },
    { cota: 3250, y: -80 },
    { cota: 3252, y: -100 },
  ]
  for (const c of curvas) {
    entidades.push(
      dxfPolilinea('CURVAS_NIVEL', [{ x: 120, y: c.y }, { x: 170, y: c.y - 3 }, { x: 220, y: c.y + 2 }].map(enOrigen), false, c.cota),
    )
  }
  entidades.push(dxfArco('CURVAS_NIVEL', enOrigen({ x: 250, y: -100 }), 40, 90, 180))

  const estaca: BloqueDxf = {
    nombre: 'ESTACA',
    entidades: dxfCirculo('0', { x: 0, y: 0 }, 0.25),
  }
  return armarDxf(CAPAS_EXPEDIENTE, entidades, [estaca])
}

/** Rectángulo contra el reloj desde la esquina inferior izquierda. */
function rect(x1: number, y1: number, x2: number, y2: number): PuntoDxf[] {
  return [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
}
