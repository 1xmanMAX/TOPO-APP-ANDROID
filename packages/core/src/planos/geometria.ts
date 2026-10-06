import { redondear3 } from '../numero'
import { pendientes } from '../planificar/perfil'

/**
 * Geometría de las pistas dibujadas sobre un plano de obra.
 *
 * El plano no está en UTM: trae su propio sistema (unidades de dibujo de un
 * DXF, puntos de un PDF o píxeles de su imagen). Lo único que importa son
 * distancias, y esas se pasan a metros con una calibración de dos puntos.
 *
 * Regla de oro: la polilínea de la pista y los textos de cota tienen que
 * estar en el MISMO sistema. El eje Y decide qué es izquierda y qué derecha,
 * y la calibración lo anota en `ejeY`:
 *   - DXF: unidades de dibujo, Y hacia ARRIBA → 'arriba' (lo que se usa si
 *     se omite).
 *   - PDF trabajado en puntos PDF (lo que entrega el lector pdf.ts para los
 *     textos): Y hacia ARRIBA → 'arriba'.
 *   - PDF trabajado sobre la imagen pintada (la pista se dibuja con clics en
 *     píxeles): Y hacia ABAJO → 'abajo', y ANTES hay que pasar los textos del
 *     lector a píxeles con `puntoPdfAImagen`. Mezclar textos en puntos con una
 *     pista en píxeles pone las cotas en otro lugar y con el lado espejado.
 * Lo demás (largos, progresivas, rumbos) no depende del eje Y.
 */

/** Un punto en las unidades propias del plano. */
export interface Punto2 {
  x: number
  y: number
}

/** Hacia dónde crece la Y del plano: 'arriba' en DXF y puntos PDF, 'abajo' en una imagen. */
export type EjeY = 'arriba' | 'abajo'

export interface Calibracion {
  /** Cuántos metros de obra vale una unidad del plano. */
  metrosPorUnidad: number
  /** Si se omite, 'arriba' (DXF). */
  ejeY?: EjeY
}

/** Un punto sobre la polilínea, con el rumbo del tramo donde cae. */
export interface PuntoConRumbo extends Punto2 {
  /**
   * Ángulo del tramo en grados, atan2(dy, dx) en las coordenadas del plano
   * (0° = hacia +X). Se deja en el sistema del plano, sin corregir la Y,
   * porque así sirve tal cual para girar un rótulo al dibujarlo en ese mismo
   * sistema (en un canvas con Y hacia abajo, el giro sale bien solo).
   */
  rumbo: number
}

export interface EstacaSobrePlano extends PuntoConRumbo {
  /** Progresiva en metros. */
  progresiva: number
}

export interface Proyeccion {
  /** Progresiva en metros del pie del punto sobre la pista. */
  progresiva: number
  /**
   * Distancia al eje en metros: NEGATIVO a la izquierda y POSITIVO a la
   * derecha, mirando en el sentido de avance — la misma regla que la sección.
   */
  desplazamiento: number
  /**
   * El punto cae antes del arranque o después del final más allá de la
   * holgura: no debe tomarse como un punto de la pista.
   */
  fueraDeLaPista: boolean
}

export interface OpcionesProyeccion {
  /** Progresiva del arranque, en metros. Por defecto 0. */
  inicio?: number
  /**
   * Cuántos metros antes del arranque o después del final se aceptan como
   * del extremo. El punto de inserción de un texto casi nunca cae justo en
   * la estaca, y la pista sobre un PDF se dibuja con clics aproximados.
   * Por defecto 3 m.
   */
  holguraExtremosM?: number
}

/**
 * Un texto del plano que podría ser una cota. `valor` es null cuando el
 * lector no lo entendió como número: así se pueden pasar tal cual los textos
 * de los lectores DXF y PDF, y lo que no es cota se cuenta en el informe.
 */
export interface TextoCota extends Punto2 {
  valor: number | null
}

export interface CotaSobrePista {
  progresiva: number
  cota: number
  desplazamiento: number
}

/** Varias cotas distintas en la misma estaca: alguien tiene que elegir. */
export interface CotasMismaEstaca {
  /** La progresiva de la primera del grupo. */
  progresiva: number
  /** Ordenadas por progresiva, con su lado para ayudar a elegir. */
  cotas: CotaSobrePista[]
}

export type MotivoDescarte =
  | 'noEsNumero'
  | 'posicionInvalida'
  | 'fueraDeLaPista'
  | 'lejosDelEje'
  | 'otroLado'
  | 'fueraDeRango'
  | 'repetida'

export interface CotaDescartada<T extends TextoCota = TextoCota> {
  texto: T
  motivo: MotivoDescarte
}

export interface OpcionesCotas extends OpcionesProyeccion {
  /**
   * Dos cotas cuya progresiva difiere menos que esto son de la misma estaca
   * (bordes izquierdo y derecho, NTN y rasante). Por defecto 1 m.
   */
  toleranciaMismaEstacaM?: number
  /** Quedarse con las de un solo lado. Las del eje (desplazamiento 0) entran siempre. */
  lado?: 'todos' | 'izquierda' | 'derecha'
  /** Rango de cotas creíble. Si se da, reemplaza al filtro por la mediana. */
  rangoCota?: { min: number; max: number }
  /**
   * Sin rango, se descarta lo que se aparta de la mediana más que esto. Por
   * defecto 100 m: deja pasar pistas muy empinadas y atrapa un «6.00» de
   * ancho de calzada junto a cotas de 3244 m.
   */
  maxDesvioMedianaM?: number
}

export interface ClasificacionCotas<T extends TextoCota = TextoCota> {
  /** Una cota por estaca, ordenadas por progresiva: listas para el perfil. */
  cercanas: CotaSobrePista[]
  /** Estacas con cotas distintas que no se pueden decidir solas. */
  conflictos: CotasMismaEstaca[]
  descartadas: CotaDescartada<T>[]
}

export interface PendienteTramo {
  desde: number
  hasta: number
  /** Positivo sube en el sentido de avance. */
  porcentaje: number
  sentido: 'sube' | 'baja' | 'plano'
}

/** Una pista (calle o tramo) dibujada sobre el plano. */
export interface Pista {
  id: string
  nombre: string
  /**
   * Eje de la pista en unidades del plano, en el sentido de avance, en el
   * mismo sistema que los textos de cota que se le van a pasar.
   */
  polilinea: Punto2[]
  calibracion: Calibracion
  /** Progresiva del primer vértice, en metros (0 si la pista arranca en 0+000). */
  progresivaInicio: number
  /** La calle de la obra cuyos cálculos abre esta pista, si ya se enlazó. */
  calleId?: string
}

// Tolerancia en unidades del plano para no perder el último punto por el
// error de punto flotante al sumar tramos (p. ej. 199.99999999 frente a 200).
const HOLGURA = 1e-9
const HOLGURA_EXTREMOS_M = 3
const TOLERANCIA_MISMA_ESTACA_M = 1
const MAX_DESVIO_MEDIANA_M = 100
// Más estacas que esto es un intervalo mal digitado (p. ej. 0.0004 en vez de 20),
// no una pista: se avisa en vez de colgar la pantalla con medio millón de rótulos.
const MAX_ESTACAS = 10000
// Dos cotas que difieren menos de medio milímetro son la misma lectura.
const MISMA_COTA = 0.0005

function distancia(a: Punto2, b: Punto2): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function aGrados(radianes: number): number {
  return (radianes * 180) / Math.PI
}

/** Redondea a milímetros sin dejar un -0 que se vería «-0.000» en pantalla. */
function redondearMm(valor: number): number {
  const r = redondear3(valor)
  return Object.is(r, -0) ? 0 : r
}

/**
 * Una calibración que llega guardada o armada a mano puede venir rota; con
 * 0 o NaN las demás funciones darían estacas en el lugar equivocado sin
 * avisar, así que todas la pasan por aquí al entrar.
 */
export function validarCalibracion(calibracion: Calibracion): void {
  const { metrosPorUnidad, ejeY } = calibracion
  if (!Number.isFinite(metrosPorUnidad) || !(metrosPorUnidad > 0)) {
    throw new Error(
      `La calibración no sirve: los metros por unidad deben ser un número mayor que cero (llegó ${metrosPorUnidad}).`,
    )
  }
  if (ejeY !== undefined && ejeY !== 'arriba' && ejeY !== 'abajo') {
    throw new Error(
      `La calibración no sirve: el eje Y debe ser 'arriba' o 'abajo' (llegó ${String(ejeY)}).`,
    )
  }
}

function exigirFinito(valor: number, que: string): void {
  if (!Number.isFinite(valor)) throw new Error(`${que} debe ser un número (llegó ${valor}).`)
}

export function largoPolilinea(polilinea: Punto2[]): number {
  let largo = 0
  for (let i = 1; i < polilinea.length; i++) {
    largo += distancia(polilinea[i - 1]!, polilinea[i]!)
  }
  return largo
}

/**
 * El punto que está a esa distancia (en unidades del plano) desde el
 * arranque, siguiendo la polilínea. Devuelve null fuera de [0, largo]:
 * prolongar la pista sería inventar un eje que nadie dibujó. Para trabajar
 * en progresivas (metros) está `puntoEnProgresiva`.
 */
export function puntoA(polilinea: Punto2[], distanciaEnUnidades: number): PuntoConRumbo | null {
  const largo = largoPolilinea(polilinea)
  if (largo === 0) return null
  // Escrito al revés a propósito: NaN no cumple ninguna de las dos y sale null.
  if (!(distanciaEnUnidades >= -HOLGURA && distanciaEnUnidades <= largo + HOLGURA)) return null

  let recorrido = 0
  let ultimoTramo: { a: Punto2; b: Punto2; largo: number } | null = null
  for (let i = 1; i < polilinea.length; i++) {
    const a = polilinea[i - 1]!
    const b = polilinea[i]!
    const largoTramo = distancia(a, b)
    // Un vértice repetido no tiene rumbo: se salta, no se divide entre cero.
    if (largoTramo === 0) continue
    ultimoTramo = { a, b, largo: largoTramo }
    if (distanciaEnUnidades <= recorrido + largoTramo) {
      const t = Math.max(0, (distanciaEnUnidades - recorrido) / largoTramo)
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        rumbo: aGrados(Math.atan2(b.y - a.y, b.x - a.x)),
      }
    }
    recorrido += largoTramo
  }
  // Solo se llega aquí por la holgura del final: es el último vértice.
  const { a, b } = ultimoTramo!
  return { x: b.x, y: b.y, rumbo: aGrados(Math.atan2(b.y - a.y, b.x - a.x)) }
}

/**
 * Calibración de dos puntos: el usuario toca dos puntos del plano y dice
 * cuántos metros hay entre ellos en obra (una cota del plano, una cinta).
 */
export function calibrar(
  p1: Punto2,
  p2: Punto2,
  metrosReales: number,
  ejeY: EjeY = 'arriba',
): Calibracion {
  const unidades = distancia(p1, p2)
  if (!(unidades > 0)) {
    throw new Error('Para calibrar hacen falta dos puntos distintos del plano.')
  }
  if (!(metrosReales > 0)) {
    throw new Error(`La distancia real debe ser mayor que cero (llegó ${metrosReales} m).`)
  }
  const calibracion = { metrosPorUnidad: metrosReales / unidades, ejeY }
  validarCalibracion(calibracion)
  return calibracion
}

/**
 * Pasa un punto de un PDF del sistema de puntos PDF (Y hacia arriba, como lo
 * entrega el lector pdf.ts) a píxeles de la imagen pintada con esa `escala`
 * (Y hacia abajo). Es la misma fórmula del lector: px = x·escala,
 * py = (altoPt − y)·escala. Sirve para poner los textos en el sistema de una
 * pista dibujada sobre la imagen (calibración con ejeY 'abajo').
 */
export function puntoPdfAImagen(punto: Punto2, altoPt: number, escala: number): Punto2 {
  if (!Number.isFinite(escala) || !(escala > 0)) {
    throw new Error(`La escala de la imagen debe ser mayor que cero (llegó ${escala}).`)
  }
  exigirFinito(altoPt, 'El alto de la página')
  return { x: punto.x * escala, y: (altoPt - punto.y) * escala }
}

/**
 * Las estacas de la pista: el arranque, cada múltiplo de `cada` metros que
 * cae dentro, y el final. Si la pista arranca en 0+010, la siguiente estaca
 * es 0+020 y no 0+030, como se estaca en obra.
 */
export function progresivasSobrePolilinea(
  polilinea: Punto2[],
  calibracion: Calibracion,
  cada = 20,
  inicio = 0,
): EstacaSobrePlano[] {
  validarCalibracion(calibracion)
  exigirFinito(inicio, 'La progresiva de inicio')
  if (!Number.isFinite(cada) || !(cada > 0)) {
    throw new Error(`El intervalo entre progresivas debe ser mayor que cero (llegó ${cada} m).`)
  }
  const largo = largoPolilinea(polilinea)
  if (largo === 0) return []

  const largoM = largo * calibracion.metrosPorUnidad
  const cuantas = Math.ceil(largoM / cada) + 1
  if (cuantas > MAX_ESTACAS) {
    throw new Error(
      `Con un intervalo de ${cada} m saldrían ${cuantas} estacas en ${redondearMm(largoM)} m; revisa el intervalo.`,
    )
  }

  const fin = redondear3(inicio + largoM)
  const progresivas = [redondear3(inicio)]
  // Se multiplica un entero por `cada` en vez de ir sumando, para que el
  // error de punto flotante no se acumule estaca tras estaca.
  for (let k = Math.floor(inicio / cada) + 1; redondear3(k * cada) < fin; k++) {
    const progresiva = redondear3(k * cada)
    if (progresiva > progresivas[0]!) progresivas.push(progresiva)
  }
  if (fin > progresivas[progresivas.length - 1]!) progresivas.push(fin)

  return progresivas.map((progresiva, i) => {
    // El arranque y el final se ponen en los vértices: sus progresivas están
    // redondeadas al milímetro y recalcular desde ellas podría caer una
    // fracción fuera de la polilínea (p. ej. inicio 10.0004 → 10).
    const enUnidades =
      i === 0
        ? 0
        : progresiva === fin
          ? largo
          : Math.min(largo, Math.max(0, (progresiva - inicio) / calibracion.metrosPorUnidad))
    const punto = puntoA(polilinea, enUnidades)
    if (!punto) {
      throw new Error(`No se pudo ubicar la progresiva ${progresiva} m sobre la pista.`)
    }
    return { progresiva, ...punto }
  })
}

/**
 * Lleva un punto del plano a la pista: dónde cae su pie (progresiva) y a qué
 * distancia y lado del eje está. Busca el tramo más cercano de toda la
 * polilínea; si el punto queda en la esquina de afuera de un quiebre, su pie
 * es el vértice. Antes del arranque o pasado el final, el pie se queda en el
 * extremo y el punto solo cuenta como fuera si se pasa de la holgura.
 */
export function proyectarSobrePolilinea(
  polilinea: Punto2[],
  punto: Punto2,
  calibracion: Calibracion,
  opciones: OpcionesProyeccion = {},
): Proyeccion {
  validarCalibracion(calibracion)
  const inicio = opciones.inicio ?? 0
  const holguraExtremosM = opciones.holguraExtremosM ?? HOLGURA_EXTREMOS_M
  exigirFinito(inicio, 'La progresiva de inicio')
  if (!(holguraExtremosM >= 0)) {
    throw new Error(
      `La holgura de los extremos debe ser un número no negativo (llegó ${holguraExtremosM} m).`,
    )
  }
  if (!Number.isFinite(punto.x) || !Number.isFinite(punto.y)) {
    throw new Error(`El punto no tiene una posición numérica (${punto.x}, ${punto.y}).`)
  }

  const tramos: { a: Punto2; dx: number; dy: number; largo: number; desde: number }[] = []
  let recorrido = 0
  for (let i = 1; i < polilinea.length; i++) {
    const a = polilinea[i - 1]!
    const b = polilinea[i]!
    const largoTramo = distancia(a, b)
    if (largoTramo === 0) continue
    tramos.push({ a, dx: b.x - a.x, dy: b.y - a.y, largo: largoTramo, desde: recorrido })
    recorrido += largoTramo
  }
  if (tramos.length === 0) {
    throw new Error('La pista necesita al menos dos vértices distintos para proyectar sobre ella.')
  }

  let mejor = {
    distancia2: Number.POSITIVE_INFINITY,
    alLargo: 0,
    cruz: 0,
    afuera: 0,
    largo: 1,
  }
  const ultimo = tramos.length - 1
  tramos.forEach((tramo, i) => {
    const px = punto.x - tramo.a.x
    const py = punto.y - tramo.a.y
    const tSinTope = (px * tramo.dx + py * tramo.dy) / (tramo.largo * tramo.largo)
    const t = Math.min(1, Math.max(0, tSinTope))
    const ex = px - tramo.dx * t
    const ey = py - tramo.dy * t
    const distancia2 = ex * ex + ey * ey
    if (distancia2 < mejor.distancia2) {
      // Cuánto se pasa el pie del arranque o del final, en unidades. Solo
      // cuenta en los tramos extremos: en un quiebre interior el punto sigue
      // siendo de la pista. Se compara después en metros contra la holgura,
      // nunca contra cero: en un tramo inclinado el punto flotante deja
      // t = 1.0000000000000002 a la altura exacta del vértice.
      const antes = i === 0 && tSinTope < 0 ? -tSinTope * tramo.largo : 0
      const despues = i === ultimo && tSinTope > 1 ? (tSinTope - 1) * tramo.largo : 0
      mejor = {
        distancia2,
        alLargo: tramo.desde + tramo.largo * t,
        // Producto cruz: positivo si el punto está a la izquierda del avance
        // cuando la Y crece hacia arriba.
        cruz: tramo.dx * py - tramo.dy * px,
        afuera: antes + despues,
        largo: tramo.largo,
      }
    }
  })

  // Con la Y hacia abajo el plano está espejado: la misma cruz cae del otro lado.
  const haciaLaIzquierda = calibracion.ejeY === 'abajo' ? mejor.cruz < 0 : mejor.cruz > 0
  const signo = haciaLaIzquierda ? -1 : 1
  // Más allá de un extremo la distancia al vértice mezcla avance y costado; se
  // da solo lo lateral respecto del tramo extremo prolongado.
  const lateral =
    mejor.afuera > 0 ? Math.abs(mejor.cruz) / mejor.largo : Math.sqrt(mejor.distancia2)

  return {
    progresiva: redondearMm(inicio + mejor.alLargo * calibracion.metrosPorUnidad),
    desplazamiento: redondearMm(signo * lateral * calibracion.metrosPorUnidad),
    fueraDeLaPista: mejor.afuera * calibracion.metrosPorUnidad > holguraExtremosM,
  }
}

function mediana(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(orden.length / 2)
  return orden.length % 2 === 1 ? orden[medio]! : (orden[medio - 1]! + orden[medio]!) / 2
}

/**
 * Reparte los textos de cota del plano entre los que son de esta pista y los
 * que no, diciendo por qué. Además:
 *   - descarta como 'fueraDeRango' los números inverosímiles (un ancho de
 *     calzada, una cota de distancia) que el lector dejó pasar;
 *   - junta las cotas de una misma estaca: si dicen lo mismo queda una (la
 *     más cercana al eje) y las otras se cuentan como 'repetida'; si dicen
 *     cosas distintas (borde izquierdo y derecho, NTN y rasante) van a
 *     `conflictos` para que el usuario elija, porque convertirlas en un
 *     tramo de centímetros inventaría un quiebre de pendiente, y cada
 *     quiebre pone un punto de control.
 */
export function clasificarCotas<T extends TextoCota>(
  polilinea: Punto2[],
  textos: readonly T[],
  calibracion: Calibracion,
  maxDesplazamientoM = 15,
  opciones: OpcionesCotas = {},
): ClasificacionCotas<T> {
  validarCalibracion(calibracion)
  exigirFinito(opciones.inicio ?? 0, 'La progresiva de inicio')
  const tolerancia = opciones.toleranciaMismaEstacaM ?? TOLERANCIA_MISMA_ESTACA_M
  const lado = opciones.lado ?? 'todos'
  const maxDesvio = opciones.maxDesvioMedianaM ?? MAX_DESVIO_MEDIANA_M

  const descartadas: CotaDescartada<T>[] = []
  const candidatas: { texto: T; cota: CotaSobrePista }[] = []
  for (const texto of textos) {
    if (texto.valor === null || !Number.isFinite(texto.valor)) {
      descartadas.push({ texto, motivo: 'noEsNumero' })
      continue
    }
    if (!Number.isFinite(texto.x) || !Number.isFinite(texto.y)) {
      descartadas.push({ texto, motivo: 'posicionInvalida' })
      continue
    }
    const { progresiva, desplazamiento, fueraDeLaPista } = proyectarSobrePolilinea(
      polilinea,
      texto,
      calibracion,
      opciones,
    )
    if (fueraDeLaPista) {
      descartadas.push({ texto, motivo: 'fueraDeLaPista' })
    } else if (Math.abs(desplazamiento) > maxDesplazamientoM) {
      descartadas.push({ texto, motivo: 'lejosDelEje' })
    } else if (
      (lado === 'izquierda' && desplazamiento > 0) ||
      (lado === 'derecha' && desplazamiento < 0)
    ) {
      descartadas.push({ texto, motivo: 'otroLado' })
    } else {
      candidatas.push({ texto, cota: { progresiva, cota: texto.valor, desplazamiento } })
    }
  }

  // Inverosímiles. Con menos de tres cotas la mediana no dice cuál es la rara
  // (con dos, quedaría a medio camino y descartaría las dos), así que sin
  // rango explícito no se filtra.
  let creibles = candidatas
  const rango = opciones.rangoCota
  if (rango || candidatas.length >= 3) {
    const centro = rango ? 0 : mediana(candidatas.map((c) => c.cota.cota))
    const esCreible = (cota: number) =>
      rango ? cota >= rango.min && cota <= rango.max : Math.abs(cota - centro) <= maxDesvio
    creibles = []
    for (const c of candidatas) {
      if (esCreible(c.cota.cota)) creibles.push(c)
      else descartadas.push({ texto: c.texto, motivo: 'fueraDeRango' })
    }
  }

  // Misma estaca: se mide desde la primera del grupo para que una fila de
  // cotas a 0.9 m no se encadene en un solo grupo larguísimo.
  creibles.sort((a, b) => a.cota.progresiva - b.cota.progresiva)
  const grupos: { texto: T; cota: CotaSobrePista }[][] = []
  for (const c of creibles) {
    const grupo = grupos[grupos.length - 1]
    if (grupo && c.cota.progresiva - grupo[0]!.cota.progresiva < tolerancia) grupo.push(c)
    else grupos.push([c])
  }

  const cercanas: CotaSobrePista[] = []
  const conflictos: CotasMismaEstaca[] = []
  for (const grupo of grupos) {
    if (grupo.length === 1) {
      cercanas.push(grupo[0]!.cota)
      continue
    }
    const primera = grupo[0]!.cota.cota
    if (grupo.every((c) => Math.abs(c.cota.cota - primera) < MISMA_COTA)) {
      const elegida = grupo.reduce((a, b) =>
        Math.abs(b.cota.desplazamiento) < Math.abs(a.cota.desplazamiento) ? b : a,
      )
      cercanas.push(elegida.cota)
      for (const c of grupo) {
        if (c !== elegida) descartadas.push({ texto: c.texto, motivo: 'repetida' })
      }
    } else {
      conflictos.push({ progresiva: grupo[0]!.cota.progresiva, cotas: grupo.map((c) => c.cota) })
    }
  }
  return { cercanas, conflictos, descartadas }
}

/**
 * Las cotas del plano que son de esta pista, una por estaca y ordenadas por
 * progresiva. Las estacas en conflicto NO están: se ven con `clasificarCotas`.
 */
export function cotasCercanas<T extends TextoCota>(
  polilinea: Punto2[],
  textos: readonly T[],
  calibracion: Calibracion,
  maxDesplazamientoM = 15,
  opciones: OpcionesCotas = {},
): CotaSobrePista[] {
  return clasificarCotas(polilinea, textos, calibracion, maxDesplazamientoM, opciones).cercanas
}

/**
 * La pendiente de cada tramo entre cotas consecutivas, en %, redondeada a
 * milésimas. Positivo sube en el sentido de avance. Se calcula con
 * `pendientes` del perfil del planificador para que la pantalla del plano y
 * el planificador nunca muestren dos pendientes distintas del mismo tramo, y
 * con su mismo criterio: no reordena ni deja pasar una progresiva repetida o
 * un dato que no es número; lanza diciendo en qué vértice está el problema.
 */
export function pendientesPorTramo(
  vertices: readonly { progresiva: number; cota: number }[],
): PendienteTramo[] {
  if (vertices.length < 2) {
    // El perfil exige dos vértices; aquí uno solo es «sin tramos», pero un
    // dato roto se avisa igual.
    vertices.forEach((v, i) => {
      if (!Number.isFinite(v.progresiva) || !Number.isFinite(v.cota)) {
        throw new Error(`Perfil inválido: el vértice ${i + 1} tiene un dato que no es un número`)
      }
    })
    return []
  }
  return pendientes(vertices).map((tramo) => {
    const porcentaje = redondearMm(tramo.pendientePorcentaje)
    return {
      desde: tramo.desde,
      hasta: tramo.hasta,
      porcentaje,
      sentido: porcentaje > 0 ? 'sube' : porcentaje < 0 ? 'baja' : 'plano',
    }
  })
}

// ---------------------------------------------------------------------------
// Lo mismo, recibiendo la Pista entera: la conversión metros ↔ unidades y la
// progresiva de arranque se hacen aquí, una sola vez, y no en la interfaz.
// ---------------------------------------------------------------------------

/**
 * Dónde cae en el plano una progresiva en metros (un punto de control, un
 * punto de cambio del planificador). Null fuera de la pista.
 */
export function puntoEnProgresiva(pista: Pista, progresivaM: number): PuntoConRumbo | null {
  validarCalibracion(pista.calibracion)
  exigirFinito(pista.progresivaInicio, 'La progresiva de inicio de la pista')
  return puntoA(
    pista.polilinea,
    (progresivaM - pista.progresivaInicio) / pista.calibracion.metrosPorUnidad,
  )
}

export function estacasDePista(pista: Pista, cada = 20): EstacaSobrePlano[] {
  return progresivasSobrePolilinea(pista.polilinea, pista.calibracion, cada, pista.progresivaInicio)
}

export function proyectarSobrePista(
  pista: Pista,
  punto: Punto2,
  holguraExtremosM = HOLGURA_EXTREMOS_M,
): Proyeccion {
  return proyectarSobrePolilinea(pista.polilinea, punto, pista.calibracion, {
    inicio: pista.progresivaInicio,
    holguraExtremosM,
  })
}

export function clasificarCotasDePista<T extends TextoCota>(
  pista: Pista,
  textos: readonly T[],
  maxDesplazamientoM = 15,
  opciones: Omit<OpcionesCotas, 'inicio'> = {},
): ClasificacionCotas<T> {
  return clasificarCotas(pista.polilinea, textos, pista.calibracion, maxDesplazamientoM, {
    ...opciones,
    inicio: pista.progresivaInicio,
  })
}
