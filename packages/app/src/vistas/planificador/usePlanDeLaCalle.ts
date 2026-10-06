import {
  formatearProgresiva,
  planificarConControles,
  revisarPerfil,
  type Calle,
  type OpcionesControles,
  type PlanConControles,
  type PlanControles,
} from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../../estado/almacen'
import { usePlanificador } from './almacenPlanificador'
import {
  cotasDelPlano,
  extremosSugeridos,
  mismosVertices,
  opcionesDelPlan,
  perfilDeRasante,
  pistaCalibrada,
  type CotasDelPlano,
  type FuentePerfil,
  type Vertice,
} from './perfilDeLaCalle'

/** El plan que la calle tiene guardado, rehecho con sus propios controles y reglas. */
export interface PlanGuardado {
  /** El perfil que pasa por los controles guardados (inicio, fin, quiebres…). */
  perfil: Vertice[]
  opciones: Partial<OpcionesControles>
  /** Null si lo guardado no alcanza para rehacer el plan (archivo dañado). */
  plan: PlanConControles | null
  /**
   * Rehecho con las mismas reglas, da los mismos controles que se guardaron.
   * Si no (el perfil original tenía quiebres por debajo del umbral), se dice.
   */
  coincide: boolean
}

export interface PlanDeLaCalle {
  calle: Calle
  fuente: FuentePerfil
  /** Qué fuentes se pueden usar, y por qué no las otras. */
  disponibles: Record<FuentePerfil, string | null>
  desde: number
  hasta: number
  perfil: Vertice[]
  /**
   * El perfil digitado aún no existe: lo que se muestra es un ejemplo para
   * editar (cota 100 inventada) y no se planifica.
   */
  perfilDeEjemplo: boolean
  /** La calle ya tiene vértices escritos a mano (aunque ahora se mire otra fuente). */
  tieneDigitados: boolean
  /** Lo que impide planificar este perfil, en palabras. */
  problemasPerfil: string[]
  cotasPlano: CotasDelPlano
  opciones: Partial<OpcionesControles>
  /** Null si el perfil no sirve. */
  plan: PlanConControles | null
  /** El plan guardado en la calle coincide con este (mismos controles y reglas). */
  guardadoAlDia: boolean
  /** Lo guardado en la calle, si hay: es lo que siguen el plano y la guía. */
  guardado: PlanGuardado | null
  /** En qué se diferencia lo guardado de lo que se ve, en palabras («C2 estaba en 0+040, ahora 0+050»). */
  diferencias: string[]
}

/** Mismas reglas, sin importar el orden de las claves (un .topo reabierto puede traerlas en otro). */
function mismasOpciones(a: Partial<OpcionesControles>, b: Partial<OpcionesControles>): boolean {
  const claves = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof OpcionesControles>
  return [...claves].every((k) => a[k] === b[k])
}

function controlesDe(plan: PlanConControles): Vertice[] {
  return plan.controles.map((c) => ({
    progresiva: c.progresiva,
    cota: c.cotaPerfil,
  }))
}

/** Rehace el plan guardado: el perfil por sus controles y sus mismas reglas. */
export function rehacerGuardado(guardado: PlanControles): PlanGuardado {
  const perfil = guardado.controles.map((c) => ({
    progresiva: c.progresiva,
    cota: c.cota,
  }))
  const plan = revisarPerfil(perfil).length === 0 ? planificarConControles(perfil, guardado.opciones) : null
  const coincide = !!plan && plan.posible && mismosVertices(controlesDe(plan), perfil)
  return { perfil, opciones: guardado.opciones, plan, coincide }
}

/**
 * Qué cambió entre los controles guardados (los que ya pueden estar
 * clavados) y los de ahora, control por control.
 */
export function diferenciasDeControles(guardados: Vertice[], ahora: Vertice[], mismasReglas: boolean): string[] {
  const salida: string[] = []
  const n = Math.max(guardados.length, ahora.length)
  for (let i = 0; i < n; i++) {
    const antes = guardados[i]
    const despues = ahora[i]
    const nombre = `C${i + 1}`
    if (antes && despues) {
      if (Math.abs(antes.progresiva - despues.progresiva) >= 5e-4)
        salida.push(
          `${nombre} estaba en ${formatearProgresiva(antes.progresiva)}, ahora ${formatearProgresiva(despues.progresiva)}`,
        )
      else if (Math.abs(antes.cota - despues.cota) >= 5e-4)
        salida.push(`${nombre} (${formatearProgresiva(antes.progresiva)}) cambia de cota prevista`)
    } else if (antes) salida.push(`${nombre} en ${formatearProgresiva(antes.progresiva)} ya no está`)
    else if (despues) salida.push(`hay un ${nombre} nuevo en ${formatearProgresiva(despues.progresiva)}`)
  }
  if (!mismasReglas) salida.push('cambiaron las reglas del nivel')
  return salida
}

/**
 * El plan de la calle activa, el mismo para Planificar y para la Guía:
 * perfil (rasante, plano o digitado), reglas del instrumento de la obra y el
 * resultado del motor. Ninguna cuenta se hace aquí: se juntan los datos y se
 * llama a `planificarConControles`.
 *
 * Cada pieza se memoriza por separado: leer el DXF del plano o planificar
 * no se repite al avanzar un paso en la guía ni al anotar en otra calle.
 */
export function usePlanDeLaCalle(): PlanDeLaCalle | null {
  const calleActivaId = useAlmacen((s) => s.calleActivaId)
  const calle = useAlmacen((s) => s.proyecto.calles.find((c) => c.id === s.calleActivaId))
  const instrumento = useAlmacen((s) => s.proyecto.instrumento)
  const pista = useAlmacen((s) =>
    s.calleActivaId ? s.proyecto.pistas?.find((p) => p.calleId === s.calleActivaId) : undefined,
  )
  const plano = useAlmacen((s) => (pista ? s.proyecto.planos?.find((p) => p.id === pista.planoId) : undefined))
  const bytes = useAlmacen((s) => (plano ? s.archivosDePlano[plano.id] : undefined))

  const id = calleActivaId ?? ''
  const fuentePedida = usePlanificador((s) => s.porCalle[id]?.fuente)
  const desdePedido = usePlanificador((s) => s.porCalle[id]?.desde)
  const hastaPedido = usePlanificador((s) => s.porCalle[id]?.hasta)
  const digitados = usePlanificador((s) => s.porCalle[id]?.digitados)

  const calibrada = useMemo(() => (pista ? pistaCalibrada(pista, plano) : null), [pista, plano])
  const cotasPlano = useMemo<CotasDelPlano>(
    () =>
      pista
        ? cotasDelPlano(plano, bytes, calibrada)
        : {
            vertices: [],
            conflictos: [],
            motivo: 'la calle no tiene una pista enlazada en el plano',
          },
    [pista, plano, bytes, calibrada],
  )
  const opciones = useMemo(() => opcionesDelPlan(instrumento), [instrumento])
  const planControles = calle?.planControles
  const guardado = useMemo(() => (planControles ? rehacerGuardado(planControles) : null), [planControles])

  return useMemo(() => {
    if (!calle) return null

    const disponibles: Record<FuentePerfil, string | null> = {
      rasante: calle.rasante ? null : 'la calle no tiene rasante',
      plano: cotasPlano.motivo,
      digitado: null,
    }
    const porDefecto: FuentePerfil =
      disponibles.rasante === null ? 'rasante' : disponibles.plano === null ? 'plano' : 'digitado'
    const fuente: FuentePerfil = fuentePedida && disponibles[fuentePedida] === null ? fuentePedida : porDefecto

    const sugeridos = extremosSugeridos(calle, calibrada)
    const desde = desdePedido ?? sugeridos.desde
    const hasta = hastaPedido ?? sugeridos.hasta

    let perfil: Vertice[]
    let perfilDeEjemplo = false
    if (fuente === 'rasante' && calle.rasante) perfil = perfilDeRasante(calle.rasante, desde, hasta)
    else if (fuente === 'plano') perfil = cotasPlano.vertices
    else if (digitados) perfil = digitados
    else {
      // Sin rasante, sin cotas del plano y sin nada escrito: un ejemplo para
      // editar, nunca un perfil que se planifica como si fuera la pista.
      perfilDeEjemplo = true
      perfil = [
        { progresiva: desde, cota: 100 },
        { progresiva: hasta, cota: 100 },
      ]
    }

    const problemasPerfil = perfilDeEjemplo
      ? ['es un perfil de ejemplo (cota 100 inventada): escribe las cotas de la pista en los vértices']
      : revisarPerfil(perfil)
    const plan = problemasPerfil.length === 0 ? planificarConControles(perfil, opciones) : null

    const mismasReglas = !!planControles && mismasOpciones(planControles.opciones, opciones)
    const guardadoAlDia = !!guardado && !!plan && mismosVertices(guardado.perfil, controlesDe(plan)) && mismasReglas
    const diferencias =
      guardado && plan && !guardadoAlDia ? diferenciasDeControles(guardado.perfil, controlesDe(plan), mismasReglas) : []

    return {
      calle,
      fuente,
      disponibles,
      desde,
      hasta,
      perfil,
      perfilDeEjemplo,
      tieneDigitados: digitados !== undefined,
      problemasPerfil,
      cotasPlano,
      opciones,
      plan,
      guardadoAlDia,
      guardado,
      diferencias,
    }
  }, [
    calle,
    cotasPlano,
    calibrada,
    fuentePedida,
    desdePedido,
    hastaPedido,
    digitados,
    opciones,
    planControles,
    guardado,
  ])
}
