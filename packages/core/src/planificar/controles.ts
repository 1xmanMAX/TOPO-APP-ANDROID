import { formatearProgresiva } from '../grilla/progresivas'
import { calcularToleranciaMm } from '../nivelacion/cierre'
import {
  OPCIONES_NIVELACION,
  completarOpciones,
  planDeVuelta,
  planificarNivelacion,
  revisarOpciones,
  type OpcionesNivelacion,
  type PlanNivelacion,
} from './cambios'
import {
  cotaEnPerfilValido,
  finDelPerfil,
  formatearPendiente,
  inicioDelPerfil,
  quiebresDetallados,
  revisarPerfil,
  type Perfil,
} from './perfil'

/**
 * Reglas de los puntos de control (sección 2 del diseño). Cada tramo entre
 * dos controles se nivela ida y vuelta y cierra por su cuenta: así el error
 * de un tramo no se arrastra al siguiente.
 */
export interface OpcionesControles extends OpcionesNivelacion {
  /** Puntos de cambio permitidos entre dos controles. */
  maxCambiosPorTramo: number
  /** Error esperado de una estación, en mm. */
  sigmaPorEstacionMm: number
  /** Coeficiente de la tolerancia k·√K (K en km, ida y vuelta). */
  k: number
  /** Cambio de pendiente, en puntos de %, desde el que un vértice es quiebre. */
  umbralQuiebrePorcentaje: number
}

export const OPCIONES_CONTROLES: Readonly<OpcionesControles> = Object.freeze({
  ...OPCIONES_NIVELACION,
  maxCambiosPorTramo: 4,
  sigmaPorEstacionMm: 1,
  k: 12,
  umbralQuiebrePorcentaje: 0.5,
})

/** Por qué va un control; sirve a la interfaz para elegir ícono o color. */
export type TipoMotivoControl = 'inicio' | 'fin' | 'quiebre' | 'maxCambios' | 'error'

export interface MotivoControl {
  tipo: TipoMotivoControl
  /** El porqué en palabras, tal como se muestra. */
  texto: string
  /** Solo en un quiebre: pendientes en %, con su signo. */
  pendienteAntes?: number
  pendienteDespues?: number
}

/**
 * Dónde va una estaca con clavo, con el porqué. `cotaPerfil` es la del
 * perfil (la rasante o lo digitado), NO una cota fija: la estaca recién
 * tiene cota cuando una nivelación cerrada desde un BM se la da. Mostrarla
 * como comprobada iría contra la sección 3 del diseño.
 */
export interface PuntoControl {
  progresiva: number
  cotaPerfil: number
  motivos: MotivoControl[]
}

export interface TramoControlado {
  desde: number
  hasta: number
  /** Cotas del perfil en los extremos: previstas, no comprobadas. */
  cotaPerfilDesde: number
  cotaPerfilHasta: number
  /** Estaciones de ida. */
  estaciones: number
  /** Puntos de cambio de ida: estaciones − 1. */
  cambios: number
  /** σ·√estaciones, en mm. */
  errorEsperadoMm: number
  /** k·√K, con K el recorrido de ida y vuelta en km. */
  toleranciaMm: number
  ok: boolean
  /** Por qué no está ok, en palabras. Vacío si lo está. */
  avisos: string[]
  /** Datos que conviene saber y que no hacen fallar el tramo. */
  notas: string[]
  /** El plan de ida. */
  plan: PlanNivelacion
  /** El mismo plan recorrido de vuelta, para cerrar el tramo. */
  vuelta: PlanNivelacion
}

export interface PlanConControles {
  /** Falso si algún tramo no se puede nivelar con estas reglas. */
  posible: boolean
  /** Posible y todos los tramos ok. */
  ok: boolean
  motivo: string | null
  controles: PuntoControl[]
  tramos: TramoControlado[]
  /** Los avisos de todos los tramos, cada uno con su tramo delante. */
  avisos: string[]
  /** Las notas de todos los tramos, cada una con su tramo delante. */
  notas: string[]
}

/** Lo que impide usar estas opciones, en palabras (vacío si sirven). */
export function revisarOpcionesControles(parciales?: Partial<OpcionesControles>): string[] {
  const o = completarOpciones(OPCIONES_CONTROLES, parciales)
  const problemas = revisarOpciones(o)
  if (!Number.isInteger(o.maxCambiosPorTramo) || o.maxCambiosPorTramo < 0) {
    problemas.push(
      `el máximo de cambios por tramo debe ser un número entero de cero o más (llegó ${String(o.maxCambiosPorTramo)})`,
    )
  }
  for (const [nombre, valor] of [
    ['el error esperado por estación', o.sigmaPorEstacionMm],
    ['el coeficiente de la tolerancia', o.k],
  ] as const) {
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
      problemas.push(`${nombre} debe ser un número mayor que cero (llegó ${String(valor)})`)
    }
  }
  const umbral: unknown = o.umbralQuiebrePorcentaje
  if (typeof umbral !== 'number' || !Number.isFinite(umbral) || umbral < 0) {
    problemas.push(`el umbral de quiebre debe ser un número de cero o más (llegó ${String(umbral)})`)
  }
  return problemas
}

function nombreTramo(desde: number, hasta: number): string {
  return `tramo ${formatearProgresiva(desde)} a ${formatearProgresiva(hasta)}`
}

/**
 * Error esperado y tolerancia de un tramo.
 *
 * El error usa las estaciones de ida (σ·√n) y la tolerancia el recorrido de
 * ida y vuelta, tal como lo fija el diseño. Exigir σ·√n ≤ tolerancia/2 es lo
 * mismo que pedir que el cierre esperado del circuito (σ·√(2n)) quede bajo
 * tolerancia/√2: un 71 % de la tolerancia, margen para lo que no es azar.
 *
 * Esa regla pide un paso medio de al menos 2000·σ²/k² (13.9 m de fábrica),
 * así que un tramo corto de una sola estación —el que dejan dos quiebres
 * seguidos en una escalinata— nunca la cumpliría, aunque no haya forma de
 * hacerlo mejor. Ese caso no se marca como falla: queda como nota. (Si el
 * error debe contarse de ida o de ida y vuelta está pendiente de Max.)
 */
function medirTramo(perfil: Perfil, plan: PlanNivelacion, o: OpcionesControles): TramoControlado {
  const estaciones = plan.estaciones.length
  const cambios = Math.max(estaciones - 1, 0)
  const errorEsperadoMm = o.sigmaPorEstacionMm * Math.sqrt(estaciones)
  const largoKm = (plan.hasta - plan.desde) / 1000
  const toleranciaMm = calcularToleranciaMm(o.k, 2 * largoKm)
  const mitad = toleranciaMm / 2

  const avisos: string[] = []
  const notas: string[] = []
  if (!plan.posible) {
    avisos.push(plan.motivo ?? 'no se puede nivelar con estas reglas')
  } else {
    if (cambios > o.maxCambiosPorTramo) {
      avisos.push(`lleva ${cambios} cambios, más que el máximo de ${o.maxCambiosPorTramo}`)
    }
    // Una milésima de mm de holgura, como en calcularCierre.
    if (errorEsperadoMm > mitad + 1e-3) {
      if (estaciones === 1) {
        notas.push(
          `una sola estación: el error esperado (${errorEsperadoMm.toFixed(2)} mm) pasa de la mitad de la tolerancia (${mitad.toFixed(2)} mm), pero con una estación no hay cómo mejorarlo; queda como dato`,
        )
      } else {
        const pasoMedio = (plan.hasta - plan.desde) / estaciones
        // σ·√n ≤ (k/2)·√(2L/1000)  ⇔  L/n ≥ 2000·σ²/k²
        const pasoNecesario = (2000 * o.sigmaPorEstacionMm ** 2) / o.k ** 2
        avisos.push(
          `el error esperado (${errorEsperadoMm.toFixed(2)} mm en ${estaciones} estaciones) pasa de la mitad de la tolerancia (${mitad.toFixed(2)} mm): con un paso medio de ${pasoMedio.toFixed(1)} m haría falta al menos ${pasoNecesario.toFixed(1)} m; partir el tramo no lo arregla, porque el error y la tolerancia crecen juntos con el largo`,
        )
      }
    }
    const alLimite = plan.estaciones.filter((e) => e.alLimite).map((e) => e.numero)
    if (alLimite.length > 0) {
      notas.push(
        `estaciones con alguna lectura a menos de ${o.holguraPlan.toFixed(2)} m del límite de la mira: ${alLimite.join(', ')}`,
      )
    }
  }

  return {
    desde: plan.desde,
    hasta: plan.hasta,
    cotaPerfilDesde: cotaEnPerfilValido(perfil, plan.desde),
    cotaPerfilHasta: cotaEnPerfilValido(perfil, plan.hasta),
    estaciones,
    cambios,
    errorEsperadoMm,
    toleranciaMm,
    ok: avisos.length === 0,
    avisos,
    notas,
    plan,
    vuelta: planDeVuelta(plan),
  }
}

function errorCabe(tramo: TramoControlado): boolean {
  return tramo.errorEsperadoMm <= tramo.toleranciaMm / 2 + 1e-3
}

function planImposible(motivo: string): PlanConControles {
  return { posible: false, ok: false, motivo, controles: [], tramos: [], avisos: [], notas: [] }
}

/**
 * Dónde van las estacas de control de una pista, y el plan de nivelación de
 * cada tramo entre ellas.
 *
 * 1. Inicio y fin de la pista.
 * 2. Cada quiebre de pendiente.
 * 3. Un punto de cambio más, donde un tramo pase de `maxCambiosPorTramo`
 *    cambios o su error esperado pase de la mitad de su tolerancia.
 *
 * Sobre la regla del error: con el mismo paso, partir un tramo achica igual
 * el error (√n) que la tolerancia (√largo), así que casi nunca lo arregla.
 * Se prueba cada punto de cambio y solo se acepta un corte que deje bien las
 * dos partes; si ninguno lo logra, no se clava una estaca inútil: el tramo
 * queda marcado y el aviso dice el paso que haría falta.
 */
export function planificarConControles(perfil: Perfil, opciones?: Partial<OpcionesControles>): PlanConControles {
  const o = completarOpciones(OPCIONES_CONTROLES, opciones)

  const malas = revisarOpcionesControles(o)
  if (malas.length > 0) return planImposible(malas.join('; '))

  const problemas = revisarPerfil(perfil)
  if (problemas.length > 0) return planImposible(problemas.join('; '))

  const motivos = new Map<number, MotivoControl[]>()
  const anotar = (progresiva: number, motivo: MotivoControl) => {
    const lista = motivos.get(progresiva) ?? []
    lista.push(motivo)
    motivos.set(progresiva, lista)
  }

  const inicio = inicioDelPerfil(perfil)
  const fin = finDelPerfil(perfil)
  anotar(inicio, { tipo: 'inicio', texto: 'inicio de la pista' })
  for (const q of quiebresDetallados(perfil, o.umbralQuiebrePorcentaje)) {
    anotar(q.progresiva, {
      tipo: 'quiebre',
      texto: `quiebre de pendiente: de ${formatearPendiente(q.pendienteAntes)} a ${formatearPendiente(q.pendienteDespues)}`,
      pendienteAntes: q.pendienteAntes,
      pendienteDespues: q.pendienteDespues,
    })
  }
  anotar(fin, { tipo: 'fin', texto: 'fin de la pista' })

  const medir = (desde: number, hasta: number) => medirTramo(perfil, planificarNivelacion(perfil, desde, hasta, o), o)

  const resolver = (desde: number, hasta: number): TramoControlado[] => {
    const tramo = medir(desde, hasta)
    if (!tramo.plan.posible) return [tramo]

    if (tramo.cambios > o.maxCambiosPorTramo) {
      // Se reparte en el menor número de partes que caben, y la primera se
      // corta en el cambio que deja las partes parejas.
      const porTramo = o.maxCambiosPorTramo + 1
      const partes = Math.ceil(tramo.estaciones / porTramo)
      const enLaPrimera = Math.ceil(tramo.estaciones / partes)
      const corte = tramo.plan.cambios[enLaPrimera - 1]!.progresiva
      anotar(corte, { tipo: 'maxCambios', texto: `para no pasar de ${o.maxCambiosPorTramo} cambios` })
      return [...resolver(desde, corte), ...resolver(corte, hasta)]
    }

    if (!errorCabe(tramo) && tramo.estaciones > 1) {
      let mejor: { corte: number; diferencia: number } | null = null
      for (const cambio of tramo.plan.cambios) {
        const izquierda = medir(desde, cambio.progresiva)
        const derecha = medir(cambio.progresiva, hasta)
        if (!izquierda.ok || !derecha.ok) continue
        const diferencia = Math.abs(izquierda.estaciones - derecha.estaciones)
        if (!mejor || diferencia < mejor.diferencia) mejor = { corte: cambio.progresiva, diferencia }
      }
      if (mejor) {
        const mitad = tramo.toleranciaMm / 2
        anotar(mejor.corte, {
          tipo: 'error',
          texto: `para que el error esperado (${tramo.errorEsperadoMm.toFixed(2)} mm) no pase de la mitad de la tolerancia (${mitad.toFixed(2)} mm)`,
        })
        return [...resolver(desde, mejor.corte), ...resolver(mejor.corte, hasta)]
      }
    }
    return [tramo]
  }

  const fijos = [...motivos.keys()].sort((a, b) => a - b)
  const tramos: TramoControlado[] = []
  for (let i = 0; i < fijos.length - 1; i++) {
    tramos.push(...resolver(fijos[i]!, fijos[i + 1]!))
  }

  const controles: PuntoControl[] = [...motivos.entries()]
    .sort(([a], [b]) => a - b)
    .map(([progresiva, lista]) => ({ progresiva, cotaPerfil: cotaEnPerfilValido(perfil, progresiva), motivos: lista }))

  const conTramo = (t: TramoControlado, textos: string[]) => textos.map((a) => `${nombreTramo(t.desde, t.hasta)}: ${a}`)
  const imposibles = tramos.filter((t) => !t.plan.posible)
  const posible = imposibles.length === 0
  return {
    posible,
    ok: posible && tramos.every((t) => t.ok),
    motivo: posible ? null : imposibles.map((t) => `${nombreTramo(t.desde, t.hasta)}: ${t.plan.motivo}`).join('; '),
    controles,
    tramos,
    avisos: tramos.flatMap((t) => conTramo(t, t.avisos)),
    notas: tramos.flatMap((t) => conTramo(t, t.notas)),
  }
}
