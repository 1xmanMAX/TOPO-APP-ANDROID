import {
  analizarEscurrimiento,
  PENDIENTE_MINIMA_DRENAJE_PCT,
  type Calibracion,
  type NivelesEnPlano,
  type Proyecto,
  type PuestaDeNivel,
  type PuntoNivelPlano,
  type ResultadoEscurrimiento,
} from '@topo/core'
import { alturaDe, puestaPorId, puestaUsable } from './puestas'

/*
 * Los puntos de nivel sobre un plano: Max los pone en el plano antes de salir
 * («aquí leo el 1, aquí el 2…»), luego escribe en la tabla lo que leyó en cada
 * uno, y en el plano aparece la cota de cada punto, hacia dónde cae el agua
 * y dónde se empoza. Aquí va lo que no es pantalla; el análisis es del motor
 * (`terreno/escurrimiento`).
 */

/** Sin puntos todavía (las puestas son del proyecto). */
export function nivelesVacios(): NivelesEnPlano {
  return {
    puntos: [],
    pendienteMinimaPct: PENDIENTE_MINIMA_DRENAJE_PCT,
  }
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Lo que venga del archivo, listo para usar: lo que no sirve se quita (null si no es nada). Idempotente. */
export function nivelesEnPlanoUsables(valor: unknown): NivelesEnPlano | null {
  if (!esObjeto(valor)) return null
  // Las puestas de los archivos viejos: `unirPuestas` las pasa después al proyecto.
  const puestas = Array.isArray(valor.puestas)
    ? valor.puestas.map(puestaUsable).filter((p): p is PuestaDeNivel => p !== null)
    : null
  const puntos = (Array.isArray(valor.puntos) ? valor.puntos : []).flatMap((p): PuntoNivelPlano[] =>
    esObjeto(p) && typeof p.id === 'string' && finito(p.x) && finito(p.y)
      ? [
          {
            id: p.id,
            nombre: typeof p.nombre === 'string' ? p.nombre : '?',
            x: p.x,
            y: p.y,
            puestaId: typeof p.puestaId === 'string' ? p.puestaId : null,
            lectura: finito(p.lectura) ? p.lectura : null,
            salida: p.salida === true,
          },
        ]
      : [],
  )
  return {
    ...(puestas ? { puestas } : {}),
    puntos,
    pendienteMinimaPct: finito(valor.pendienteMinimaPct) && valor.pendienteMinimaPct >= 0 ? valor.pendienteMinimaPct : PENDIENTE_MINIMA_DRENAJE_PCT,
  }
}

/** El nombre del punto siguiente: uno más que el mayor número que haya («7» → «8»). */
export function siguienteNombre(puntos: PuntoNivelPlano[]): string {
  const numeros = puntos.map((p) => Number(p.nombre)).filter((n) => Number.isInteger(n) && n > 0)
  return String(numeros.length ? Math.max(...numeros) + 1 : 1)
}

/** La puesta de un punto: la suya, o la primera del proyecto si la suya ya no existe. */
export function puestaDelPunto(proyecto: Proyecto, p: PuntoNivelPlano): PuestaDeNivel | null {
  return puestaPorId(proyecto, p.puestaId)
}

/** Cota = AI − lectura (mira apoyada en el punto). Null sin lectura o sin una puesta válida. */
export function cotaDelPunto(proyecto: Proyecto, p: PuntoNivelPlano): number | null {
  if (p.lectura === null) return null
  const puesta = puestaDelPunto(proyecto, p)
  const ai = puesta ? alturaDe(puesta, proyecto) : null
  return ai === null ? null : ai - p.lectura
}

export interface AnalisisEnPlano {
  /** Por id: la cota de cada punto leído. */
  cotas: Map<string, number>
  /** Sin escala, las pendientes no son % (las direcciones sí valen). */
  sinEscala: boolean
  resultado: ResultadoEscurrimiento | null
}

/**
 * Los puntos leídos, pasados a metros con la escala del plano, al análisis
 * de escurrimiento. Sin escala se analiza igual en unidades del plano: el
 * camino del agua y las direcciones no cambian, los porcentajes no se enseñan.
 */
export function analizarPlano(niveles: NivelesEnPlano, calibracion: Calibracion | null, proyecto: Proyecto): AnalisisEnPlano {
  const cotas = new Map<string, number>()
  for (const p of niveles.puntos) {
    const z = cotaDelPunto(proyecto, p)
    if (z !== null) cotas.set(p.id, z)
  }
  const k = calibracion?.metrosPorUnidad ?? 1
  const leidos = niveles.puntos.filter((p) => cotas.has(p.id))
  const resultado =
    leidos.length >= 3
      ? analizarEscurrimiento(
          leidos.map((p) => ({ id: p.id, nombre: p.nombre, x: p.x * k, y: p.y * k, z: cotas.get(p.id)!, salida: p.salida })),
          { pendienteMinimaPct: calibracion ? niveles.pendienteMinimaPct : 0 },
        )
      : null
  return { cotas, sinEscala: !calibracion, resultado }
}
