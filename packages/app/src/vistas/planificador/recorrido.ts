import {
  completarOpciones,
  OPCIONES_CONTROLES,
  type OpcionesControles,
  type EstacionPlan,
  type LecturaEsperada,
  type PlanConControles,
  type PuntoControl,
  type SentidoNivelacion,
  type TramoControlado,
} from '@topo/core'

/**
 * El plan del motor, puesto en el orden en que se camina y con los nombres
 * que se dicen en campo: «Control 2», «PC 5». El motor numera estaciones y
 * cambios dentro de cada tramo; en campo se cuentan en toda la pista, y un
 * mismo PC se lee de ida y de vuelta con el mismo número. Aquí no se calcula
 * ninguna lectura: solo se ordena y se nombra lo que dio el motor.
 */

export interface PuntoDeMira {
  progresiva: number
  /** Lo que debe marcar la mira, en metros. */
  lectura: number
  tipo: 'control' | 'cambio'
  /** «Control 1», «PC 3». */
  nombre: string
}

export interface PasoGuia {
  /** Desde 0, en el orden de la guía. */
  indice: number
  /** Desde 1. */
  tramo: number
  sentido: SentidoNivelacion
  /** Número de la estación en la pista entera (de ida; la vuelta repite). */
  numero: number
  estacion: EstacionPlan
  atras: PuntoDeMira
  adelante: PuntoDeMira
  /** Las progresivas redondas que se leen desde esta estación. */
  lecturas: LecturaEsperada[]
  /** Si con este paso se llega a un control, cuál y qué hacer ahí. */
  llegaA: {
    nombre: string
    control: PuntoControl
    tramo: TramoControlado
  } | null
}

export interface Recorrido {
  pasos: PasoGuia[]
  /** Nombre de cada control, en el orden de la pista. */
  nombresControl: string[]
  /** Estaciones y cambios de ida (los que se plantan y se clavan). */
  totalEstaciones: number
  totalCambios: number
}

/** Clave al milímetro para reconocer un mismo punto en la ida y la vuelta. */
function clave(progresiva: number): string {
  return progresiva.toFixed(3)
}

export function recorridoDelPlan(plan: PlanConControles): Recorrido {
  const nombresControl = plan.controles.map((_, i) => `Control ${i + 1}`)
  const controlEn = new Map(
    plan.controles.map((c, i) => [clave(c.progresiva), { control: c, nombre: nombresControl[i]! }]),
  )

  // Los PC se numeran una sola vez, en la ida, a lo largo de toda la pista.
  const nombrePC = new Map<string, string>()
  let pc = 0
  for (const tramo of plan.tramos) {
    for (const cambio of tramo.plan.cambios) {
      pc += 1
      nombrePC.set(clave(cambio.progresiva), `PC ${pc}`)
    }
  }

  const punto = (progresiva: number, lectura: number): PuntoDeMira => {
    const control = controlEn.get(clave(progresiva))
    if (control) return { progresiva, lectura, tipo: 'control', nombre: control.nombre }
    return {
      progresiva,
      lectura,
      tipo: 'cambio',
      nombre: nombrePC.get(clave(progresiva)) ?? 'PC',
    }
  }

  const pasos: PasoGuia[] = []
  let primeraDelTramo = 0
  plan.tramos.forEach((tramo, t) => {
    for (const recorrido of [tramo.plan, tramo.vuelta]) {
      const n = recorrido.estaciones.length
      recorrido.estaciones.forEach((estacion, i) => {
        const numero = recorrido.sentido === 'ida' ? primeraDelTramo + estacion.numero : primeraDelTramo + n - i
        const ultima = i === n - 1
        const destino = ultima ? controlEn.get(clave(estacion.adelante.progresiva)) : undefined
        pasos.push({
          indice: pasos.length,
          tramo: t + 1,
          sentido: recorrido.sentido,
          numero,
          estacion,
          atras: punto(estacion.atras.progresiva, estacion.atras.lectura),
          adelante: punto(estacion.adelante.progresiva, estacion.adelante.lectura),
          // La progresiva redonda que cae en el control o en el PC ya se pide
          // como atrás o adelante: repetirla en la lista invita a anotarla
          // dos veces, una de ellas como intermedia.
          lecturas: recorrido.esperadas.filter(
            (e) =>
              e.estacion === estacion.numero &&
              clave(e.progresiva) !== clave(estacion.atras.progresiva) &&
              clave(e.progresiva) !== clave(estacion.adelante.progresiva),
          ),
          llegaA: destino ? { ...destino, tramo } : null,
        })
      })
    }
    primeraDelTramo += tramo.plan.estaciones.length
  })

  return {
    pasos,
    nombresControl,
    totalEstaciones: primeraDelTramo,
    totalCambios: pc,
  }
}

/** Cuántas estaciones de ida, PC y controles quedan atrás al terminar el paso `indice`. */
export function avanceHasta(
  recorrido: Recorrido,
  indice: number,
): { estaciones: number; cambios: number; controles: number } {
  const hechos = recorrido.pasos.slice(0, indice)
  const ida = hechos.filter((p) => p.sentido === 'ida')
  const controles = new Set<string>()
  if (hechos.length > 0 && recorrido.nombresControl.length > 0) controles.add(recorrido.nombresControl[0]!)
  for (const p of hechos) if (p.llegaA) controles.add(p.llegaA.nombre)
  return {
    estaciones: ida.length,
    cambios: ida.filter((p) => p.adelante.tipo === 'cambio').length,
    controles: controles.size,
  }
}

export type LadoDelLimite = 'minima' | 'maxima'

export interface LecturaAlLimite {
  /** Qué lectura: la de atrás, la de adelante o una progresiva intermedia. */
  cual: 'atras' | 'adelante' | 'intermedia'
  progresiva: number
  lectura: number
  /** Si queda cerca de la lectura mínima (punto alto) o de la máxima (punto bajo). */
  lado: LadoDelLimite
}

/**
 * Qué lecturas de este paso quedan cerca del borde de la mira y de cuál
 * borde. El motor ya marcó cuáles (`alLimite` de cada visual y de la
 * estación); aquí solo se dice si es la mínima o la máxima, que es lo que
 * decide el consejo: no es lo mismo subir que bajar el trípode.
 */
export function lecturasAlLimite(paso: PasoGuia, opciones: Partial<OpcionesControles>): LecturaAlLimite[] {
  const o = completarOpciones(OPCIONES_CONTROLES, opciones)
  const maxima = o.largoMira - o.margenSuperior
  const lado = (lectura: number): LadoDelLimite => (lectura - o.lecturaMin <= maxima - lectura ? 'minima' : 'maxima')
  const cerca = (lectura: number) => Math.min(lectura - o.lecturaMin, maxima - lectura) < o.holguraPlan
  const salida: LecturaAlLimite[] = []
  const e = paso.estacion
  if (e.atras.alLimite)
    salida.push({
      cual: 'atras',
      progresiva: e.atras.progresiva,
      lectura: e.atras.lectura,
      lado: lado(e.atras.lectura),
    })
  if (e.adelante.alLimite)
    salida.push({
      cual: 'adelante',
      progresiva: e.adelante.progresiva,
      lectura: e.adelante.lectura,
      lado: lado(e.adelante.lectura),
    })
  for (const l of paso.lecturas)
    if (cerca(l.lectura))
      salida.push({
        cual: 'intermedia',
        progresiva: l.progresiva,
        lectura: l.lectura,
        lado: lado(l.lectura),
      })
  return salida
}
