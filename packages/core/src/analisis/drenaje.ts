import { redondear3 } from '../numero'
import { estadoDeDiferencia, type EstadoTolerancia } from '../rasante/evaluar'

/** Una cota a lo largo del eje (o de la cuneta) de la calle. */
export interface PuntoDePerfil {
  progresiva: number
  cota: number
}

/**
 * Hacia dónde corre el agua según el perfil: 'avanza' si baja al crecer la
 * progresiva, 'retrocede' si sube, 'plano' si no hay ni un milímetro de
 * desnivel (el agua no sabe hacia dónde ir).
 */
export type SentidoDelAgua = 'avanza' | 'retrocede' | 'plano'

export interface TramoDeDrenaje {
  desde: number
  hasta: number
  /** % ; negativo = baja al avanzar la progresiva. Sale del desnivel ya redondeado al milímetro. */
  pendienteMedida: number
  /**
   * Desnivel medido en mm enteros (hasta − desde). Sirve para separar lo serio
   * del ruido: 1 o 2 mm caen dentro de la precisión de una nivelación.
   */
  desnivelMm: number
  /**
   * % del proyecto entre las mismas dos progresivas (la cuerda); null si no hay
   * proyecto o el tramo cae fuera de él. Si `quiebresDeProyecto` no está vacío,
   * la cuerda esconde un cambio de pendiente: mírese esa lista.
   */
  pendienteProyecto: number | null
  /** Progresivas de los vértices del proyecto que caen dentro del tramo (sin contar las puntas). */
  quiebresDeProyecto: number[]
  sentidoMedido: SentidoDelAgua
  /**
   * El agua corre al revés que en el proyecto en alguna parte del tramo. Si el
   * proyecto quiebra dentro, se compara pedazo por pedazo: lo medido entre dos
   * estacas es una recta, y si el proyecto cambia de sentido dentro, en uno de
   * los pedazos van opuestos.
   */
  contraPendiente: boolean
  /** |pendiente medida| menor que el umbral: el agua apenas corre aunque vaya bien. */
  casiPlano: boolean
}

export interface PuntoBajo {
  /** Donde empieza el fondo; si el fondo es de un solo punto, es ese punto. */
  progresiva: number
  /** Donde termina el fondo (igual a progresiva si es un solo punto). */
  hasta: number
  /** La cota más baja del fondo. */
  cota: number
  /**
   * Lo que le falta al fondo para llegar a su vecino más bajo, en mm enteros:
   * cuánta agua junta antes de rebalsar. 0 si toda la calle está plana. Un
   * empozamiento de 1 o 2 mm cae dentro del ruido de la nivelación.
   */
  profundidadMm: number
  /** Hay un sumidero dentro del fondo o a menos de la tolerancia. */
  enSumidero: boolean
  /**
   * El fondo toca el inicio o el final de lo medido: el agua sale de la calle
   * medida y no se sabe si más allá se empoza. No cuenta como empozamiento,
   * pero queda listado. La excepción es una calle toda plana: toca las dos
   * puntas y el agua no sale por ninguna.
   */
  extremo: boolean
}

export interface PuntoDescartado {
  /** Posición en la lista que llegó, para poder señalarlo aunque le falte la progresiva. */
  indice: number
  progresiva: number | null
  cota: number | null
  motivo: 'sin progresiva' | 'sin cota' | 'progresiva repetida'
}

export interface AnalisisDeDrenaje {
  tramos: TramoDeDrenaje[]
  puntosBajos: PuntoBajo[]
  /** Puntos bajos sin sumidero de donde el agua no sale: ahí se queda. */
  empozamientos: PuntoBajo[]
  /** Tramos sin pendiente de proyecto con qué comparar (no hay proyecto o no lo cubre). */
  tramosSinProyecto: { desde: number; hasta: number }[]
  /** Puntos medidos que no entraron, con el porqué. */
  descartados: PuntoDescartado[]
  /** Copia de la opción: si las cotas medidas vienen de una nivelación que cerró. */
  comprobado: boolean
}

export interface OpcionesDrenaje {
  /** Progresivas de los sumideros. */
  sumideros: number[]
  /** De fábrica 0.1 %: por debajo, el agua casi no corre. */
  casiPlanoPorcentaje?: number
  /** De fábrica 2 m: un punto bajo a esa distancia de un sumidero se da por recogido. */
  toleranciaSumidero?: number
  /**
   * Las cotas medidas salen de una nivelación que cerró. De fábrica false: lo
   * que nadie dijo que está comprobado, no lo está.
   */
  comprobado?: boolean
}

/** Margen para que 2.0000000001 m siga contando como 2 m. */
const EPSILON = 1e-9

function esNumero(valor: number): boolean {
  return typeof valor === 'number' && Number.isFinite(valor)
}

/**
 * Desnivel al milímetro, con el mismo criterio que `pendiente` de la
 * calculadora: se redondea la diferencia, no cada cota. Redondear cada cota
 * por separado hace que 0.8 mm salga plano y 0.2 mm salga 1 mm, según dónde
 * caigan las fracciones.
 */
function desnivelAlMilimetro(cotaDesde: number, cotaHasta: number): number {
  return redondear3(cotaHasta - cotaDesde)
}

function sentidoDe(desnivel: number): SentidoDelAgua {
  if (desnivel < 0) return 'avanza'
  if (desnivel > 0) return 'retrocede'
  return 'plano'
}

function aMmEnteros(metros: number): number {
  // `+ 0` para que un −0 no se vea distinto de 0.
  return Math.round(metros * 1000) + 0
}

/** Ordena por progresiva y aparta, con su motivo, los puntos sin número y las progresivas repetidas (gana la primera). */
function limpiarPerfil(perfil: PuntoDePerfil[]): { puntos: PuntoDePerfil[]; descartados: PuntoDescartado[] } {
  const descartados: PuntoDescartado[] = []
  const conNumero: { punto: PuntoDePerfil; indice: number }[] = []
  perfil.forEach((p, indice) => {
    const progresiva = esNumero(p.progresiva) ? p.progresiva : null
    const cota = esNumero(p.cota) ? p.cota : null
    if (progresiva === null) {
      descartados.push({ indice, progresiva, cota, motivo: 'sin progresiva' })
    } else if (cota === null) {
      descartados.push({ indice, progresiva, cota, motivo: 'sin cota' })
    } else {
      conNumero.push({ punto: p, indice })
    }
  })
  const ordenados = [...conNumero].sort((a, b) => a.punto.progresiva - b.punto.progresiva)
  const puntos: PuntoDePerfil[] = []
  for (const { punto, indice } of ordenados) {
    const anterior = puntos[puntos.length - 1]
    if (anterior && anterior.progresiva === punto.progresiva) {
      descartados.push({ indice, progresiva: punto.progresiva, cota: punto.cota, motivo: 'progresiva repetida' })
      continue
    }
    puntos.push(punto)
  }
  return { puntos, descartados }
}

/** Cota del perfil por interpolación lineal; null fuera de él, porque extrapolar un proyecto es inventarlo. */
function cotaEn(perfil: PuntoDePerfil[], progresiva: number): number | null {
  const primero = perfil[0]
  const ultimo = perfil[perfil.length - 1]
  if (!primero || !ultimo) return null
  if (progresiva < primero.progresiva - EPSILON) return null
  if (progresiva > ultimo.progresiva + EPSILON) return null
  for (let i = 0; i < perfil.length; i++) {
    const b = perfil[i]!
    if (Math.abs(b.progresiva - progresiva) <= EPSILON) return b.cota
    if (i > 0 && progresiva < b.progresiva) {
      const a = perfil[i - 1]!
      const t = (progresiva - a.progresiva) / (b.progresiva - a.progresiva)
      return a.cota + t * (b.cota - a.cota)
    }
  }
  return null
}

function pendientePorcentaje(desnivel: number, longitud: number): number {
  return redondear3((desnivel / longitud) * 100) + 0
}

/**
 * Cómo corre el agua por la calle medida, comparada con el proyecto.
 *
 * Los tramos van entre puntos medidos vecinos. Un punto bajo es un punto (o un
 * fondo plano de varios) con los vecinos más altos: ahí llega el agua. Si no
 * hay sumidero a menos de la tolerancia, es un empozamiento.
 *
 * Ojo con lo que NO hace: no mira si la nivelación cerró. Un empozamiento o
 * una contrapendiente sacados de cotas sin comprobar no están comprobados
 * (spec §3); `opciones.comprobado` sale tal cual en el resultado y decirlo en
 * pantalla y en el PDF le toca a quien lo muestra o exporta, igual que en
 * `evaluarContraRasante`.
 */
export function analizarDrenaje(
  medido: PuntoDePerfil[],
  proyecto: PuntoDePerfil[] | null,
  opciones: OpcionesDrenaje,
): AnalisisDeDrenaje {
  const casiPlanoPorcentaje = opciones.casiPlanoPorcentaje ?? 0.1
  const toleranciaSumidero = opciones.toleranciaSumidero ?? 2

  const { puntos, descartados } = limpiarPerfil(medido)
  // El proyecto también se limpia, pero lo que se descarta de él no es medido: no va a la lista.
  const perfilProyecto = proyecto ? limpiarPerfil(proyecto).puntos : []

  const tramos: TramoDeDrenaje[] = []
  const tramosSinProyecto: { desde: number; hasta: number }[] = []
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1]!
    const b = puntos[i]!
    const longitud = b.progresiva - a.progresiva
    const desnivel = desnivelAlMilimetro(a.cota, b.cota)
    const pendienteMedida = pendientePorcentaje(desnivel, longitud)
    const sentidoMedido = sentidoDe(desnivel)

    const cotaProyA = cotaEn(perfilProyecto, a.progresiva)
    const cotaProyB = cotaEn(perfilProyecto, b.progresiva)
    let pendienteProyecto: number | null = null
    let quiebresDeProyecto: number[] = []
    let contraPendiente = false
    if (cotaProyA !== null && cotaProyB !== null) {
      pendienteProyecto = pendientePorcentaje(desnivelAlMilimetro(cotaProyA, cotaProyB), longitud)
      quiebresDeProyecto = perfilProyecto
        .map((p) => p.progresiva)
        .filter((p) => p > a.progresiva + EPSILON && p < b.progresiva - EPSILON)
      // Pedazo por pedazo del proyecto entre las puntas y los quiebres de adentro.
      const cortes = [a.progresiva, ...quiebresDeProyecto, b.progresiva]
      if (sentidoMedido !== 'plano') {
        for (let k = 1; k < cortes.length; k++) {
          const sentidoProyecto = sentidoDe(
            desnivelAlMilimetro(cotaEn(perfilProyecto, cortes[k - 1]!)!, cotaEn(perfilProyecto, cortes[k]!)!),
          )
          if (sentidoProyecto !== 'plano' && sentidoProyecto !== sentidoMedido) contraPendiente = true
        }
      }
    } else {
      tramosSinProyecto.push({ desde: a.progresiva, hasta: b.progresiva })
    }

    tramos.push({
      desde: a.progresiva,
      hasta: b.progresiva,
      pendienteMedida,
      desnivelMm: aMmEnteros(desnivel),
      pendienteProyecto,
      quiebresDeProyecto,
      sentidoMedido,
      contraPendiente,
      casiPlano: Math.abs(pendienteMedida) < casiPlanoPorcentaje,
    })
  }

  const puntosBajos = buscarPuntosBajos(puntos, opciones.sumideros, toleranciaSumidero)
  const empozamientos = puntosBajos.filter((p) => {
    if (p.enSumidero) return false
    // Una calle toda plana toca las dos puntas: el agua no sale por ninguna.
    const todaLaCalle = p.progresiva === puntos[0]!.progresiva && p.hasta === puntos[puntos.length - 1]!.progresiva
    return !p.extremo || todaLaCalle
  })

  return {
    tramos,
    puntosBajos,
    empozamientos,
    tramosSinProyecto,
    descartados,
    comprobado: opciones.comprobado ?? false,
  }
}

function buscarPuntosBajos(
  puntos: PuntoDePerfil[],
  sumideros: number[],
  tolerancia: number,
): PuntoBajo[] {
  if (puntos.length < 2) return []
  // desniveles[k] va de puntos[k] a puntos[k + 1], ya al milímetro.
  const desniveles = puntos.slice(1).map((p, k) => desnivelAlMilimetro(puntos[k]!.cota, p.cota))
  const ultimo = puntos.length - 1
  const bajos: PuntoBajo[] = []

  let i = 0
  while (i < puntos.length) {
    // Un fondo es una racha de puntos unidos por desniveles de 0 mm.
    let j = i
    while (j < ultimo && desniveles[j] === 0) j++

    const izquierdaMasAlta = i === 0 || desniveles[i - 1]! < 0
    const derechaMasAlta = j === ultimo || desniveles[j]! > 0
    if (izquierdaMasAlta && derechaMasAlta) {
      const desde = puntos[i]!.progresiva
      const hasta = puntos[j]!.progresiva
      const cota = Math.min(...puntos.slice(i, j + 1).map((p) => p.cota))
      const vecinos = [i > 0 ? puntos[i - 1]!.cota : null, j < ultimo ? puntos[j + 1]!.cota : null].filter(
        (c): c is number => c !== null,
      )
      const profundidadMm = vecinos.length > 0 ? aMmEnteros(redondear3(Math.min(...vecinos) - cota)) : 0
      bajos.push({
        progresiva: desde,
        hasta,
        cota,
        profundidadMm,
        enSumidero: sumideros.some(
          (s) => s >= desde - tolerancia - EPSILON && s <= hasta + tolerancia + EPSILON,
        ),
        extremo: i === 0 || j === ultimo,
      })
    }
    i = j + 1
  }
  return bajos
}

/**
 * Bombeo en %, con la convención de la app: positivo baja al alejarse del
 * eje. La distancia se toma en valor absoluto para que el lado izquierdo
 * (offset negativo) se lea igual que el derecho.
 */
export function bombeo(cotaEje: number, cotaBorde: number, distancia: number): number {
  if (!esNumero(cotaEje) || !esNumero(cotaBorde)) {
    throw new RangeError('Las cotas del eje y del borde tienen que ser números')
  }
  const d = Math.abs(distancia)
  if (!(d > 0) || !Number.isFinite(d)) {
    throw new RangeError('La distancia del eje al borde tiene que ser mayor que cero')
  }
  return redondear3(((cotaEje - cotaBorde) / d) * 100) + 0
}

/** El mismo semáforo que el resto del motor (✓ △ ✗), sin los estados de «falta dato». */
export type EstadoBombeo = Exclude<EstadoTolerancia, 'sinRasante' | 'sinMedir'>

export interface ComparacionBombeo {
  /** medido − proyecto, en puntos de %. */
  diferencia: number
  /** conforme hasta la tolerancia, al límite hasta el doble, fuera pasado el doble (el semáforo de la app). */
  estado: EstadoBombeo
  /**
   * Va en el mismo sentido que el proyecto pero más tendido (o plano): bota el
   * agua más despacio. Se mira en valor absoluto para que una vereda a −1.0 %
   * contra −1.5 % también cuente.
   */
  menosQueProyecto: boolean
  /**
   * El agua corre al revés que en el proyecto: signo contrario. Con el
   * proyecto plano no hay sentido con qué comparar y queda en false.
   */
  aguaAlReves: boolean
}

/**
 * Compara el bombeo medido con el del proyecto. El proyecto puede ser
 * negativo a propósito (la vereda a −1.5 %, el lado bajo de un peralte), así
 * que todo se juzga contra el sentido del proyecto, no contra el signo del
 * medido solo.
 */
export function compararBombeo(
  medido: number,
  proyecto: number,
  toleranciaPorcentaje = 0.5,
): ComparacionBombeo {
  if (!esNumero(medido) || !esNumero(proyecto)) {
    throw new RangeError('El bombeo medido y el del proyecto tienen que ser números')
  }
  if (!(toleranciaPorcentaje >= 0)) {
    throw new RangeError('La tolerancia no puede ser negativa')
  }
  const diferencia = redondear3(medido - proyecto) + 0
  // La diferencia ya está redondeada: el borde exacto (0.5 contra 0.5) no depende del flotante.
  const estado = estadoDeDiferencia(diferencia, toleranciaPorcentaje) as EstadoBombeo

  const signoMedido = Math.sign(redondear3(medido))
  const signoProyecto = Math.sign(redondear3(proyecto))
  const aguaAlReves = signoProyecto !== 0 && signoMedido === -signoProyecto
  const menosQueProyecto =
    signoProyecto !== 0 && !aguaAlReves && Math.abs(medido) < Math.abs(proyecto) - EPSILON
  return { diferencia, estado, menosQueProyecto, aguaAlReves }
}
