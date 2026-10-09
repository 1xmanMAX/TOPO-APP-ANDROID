import {
  analizarEscurrimiento,
  formatearProgresiva,
  lineaDeCapa,
  palabraDePunto,
  PENDIENTE_MINIMA_DRENAJE_PCT,
  proyectarSobrePista,
  puntoEnProgresiva,
  type Calle,
  type Calibracion,
  type PistaCalibrada,
  type Punto2,
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
            ...(typeof p.nota === 'string' && p.nota.trim() !== '' ? { nota: p.nota } : {}),
            ...(p.origen === 'bm' && typeof p.bmId === 'string' ? { origen: 'bm' as const, bmId: p.bmId } : {}),
            ...(p.origen === 'relacion' && esObjeto(p.relacion) && typeof p.relacion.desdeId === 'string' && finito(p.relacion.desnivel)
              ? { origen: 'relacion' as const, relacion: { desdeId: p.relacion.desdeId, desnivel: p.relacion.desnivel } }
              : {}),
          },
        ]
      : [],
  )
  return {
    ...(puestas ? { puestas } : {}),
    puntos,
    pendienteMinimaPct: finito(valor.pendienteMinimaPct) && valor.pendienteMinimaPct >= 0 ? valor.pendienteMinimaPct : PENDIENTE_MINIMA_DRENAJE_PCT,
    ...(typeof valor.capaMedidaId === 'string' ? { capaMedidaId: valor.capaMedidaId } : {}),
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

/** Cota leída: AI − lectura (mira apoyada en el punto). Null sin lectura o sin una puesta válida. */
export function cotaDelPunto(proyecto: Proyecto, p: PuntoNivelPlano): number | null {
  if (p.lectura === null) return null
  const puesta = puestaDelPunto(proyecto, p)
  const ai = puesta ? alturaDe(puesta, proyecto) : null
  return ai === null ? null : ai - p.lectura
}

/**
 * La cota de cada punto del plano, venga de donde venga: leída con la mira,
 * la de un BM del proyecto (si se corrige el BM, cambia), o la de otro punto
 * más su desnivel («el 4 está 0.35 m más abajo que BM-1»). Una relación
 * puede apoyarse en otra relación; si la cadena vuelve sobre sí misma o
 * llega a un punto sin cota, ese punto queda sin cota. `extra` son cotas
 * de fuera del plano (lo medido en las calles) a las que también se puede
 * referir un punto.
 */
export function cotasDeLosPuntos(niveles: NivelesEnPlano, proyecto: Proyecto, extra: ReadonlyMap<string, number> = new Map()): Map<string, number> {
  const porId = new Map(niveles.puntos.map((p) => [p.id, p]))
  const cotas = new Map<string, number>()
  const resolver = (id: string, camino: Set<string>): number | null => {
    if (cotas.has(id)) return cotas.get(id)!
    if (extra.has(id)) return extra.get(id)!
    const p = porId.get(id)
    if (!p || camino.has(id)) return null
    camino.add(id)
    let z: number | null = null
    if (p.origen === 'bm') z = proyecto.bms.find((b) => b.id === p.bmId)?.cota ?? null
    else if (p.origen === 'relacion' && p.relacion) {
      const base = resolver(p.relacion.desdeId, camino)
      z = base === null ? null : base + p.relacion.desnivel
    } else z = cotaDelPunto(proyecto, p)
    camino.delete(id)
    if (z !== null && Number.isFinite(z)) cotas.set(id, z)
    return z
  }
  for (const p of niveles.puntos) resolver(p.id, new Set())
  return cotas
}

/** «0.350 m más arriba», «0.120 m más abajo», «a la misma altura» (a menos de medio milímetro). */
export function textoDesnivel(desnivel: number): string {
  if (Math.abs(desnivel) < 0.0005) return 'a la misma altura'
  return `${Math.abs(desnivel).toFixed(3)} m más ${desnivel > 0 ? 'arriba' : 'abajo'}`
}

/** Por qué un punto no tiene cota, en palabras (null si la tiene). */
export function sinCotaPorque(p: PuntoNivelPlano, niveles: NivelesEnPlano, proyecto: Proyecto, cotas: ReadonlyMap<string, number>): string | null {
  if (cotas.has(p.id)) return null
  if (p.origen === 'bm') return proyecto.bms.some((b) => b.id === p.bmId) ? 'el BM no tiene cota' : 'elige su BM'
  if (p.origen === 'relacion') {
    if (!p.relacion) return 'elige respecto de qué punto'
    const desde = niveles.puntos.find((q) => q.id === p.relacion!.desdeId)
    if (!desde) return 'el punto de referencia ya no existe'
    return `falta la cota de ${desde.nombre}${desde.origen === 'relacion' ? ' (o la cadena vuelve sobre sí misma)' : ''}`
  }
  return p.lectura === null ? 'falta su lectura' : 'la puesta no da altura'
}

export interface AnalisisEnPlano {
  /** Por id: la cota de cada punto leído. */
  cotas: Map<string, number>
  /** Sin escala, las pendientes no son % (las direcciones sí valen). */
  sinEscala: boolean
  resultado: ResultadoEscurrimiento | null
  /** Lo medido en las calles de este plano que entró al análisis. */
  medidos: PuntoMedidoEnPlano[]
}

/**
 * Los puntos leídos, pasados a metros con la escala del plano, al análisis
 * de escurrimiento. Sin escala se analiza igual en unidades del plano: el
 * camino del agua y las direcciones no cambian, los porcentajes no se enseñan.
 */
export function analizarPlano(
  niveles: NivelesEnPlano,
  calibracion: Calibracion | null,
  proyecto: Proyecto,
  medidos: PuntoMedidoEnPlano[] = [],
): AnalisisEnPlano {
  const deLaLibreta = new Map(medidos.map((m) => [m.id, m.cota]))
  const cotas = cotasDeLosPuntos(niveles, proyecto, deLaLibreta)
  for (const m of medidos) cotas.set(m.id, m.cota)
  const k = calibracion?.metrosPorUnidad ?? 1
  const leidos = niveles.puntos.filter((p) => cotas.has(p.id))
  const todos = [
    ...leidos.map((p) => ({ id: p.id, nombre: p.nombre, x: p.x * k, y: p.y * k, z: cotas.get(p.id)!, salida: p.salida })),
    ...medidos.map((m) => ({ id: m.id, nombre: m.nombre, x: m.x * k, y: m.y * k, z: m.cota, salida: false })),
  ]
  const resultado = todos.length >= 3 ? analizarEscurrimiento(todos, { pendienteMinimaPct: calibracion ? niveles.pendienteMinimaPct : 0 }) : null
  return { cotas, sinEscala: !calibracion, resultado, medidos }
}

// ─── El plano y las calles: una sola base de datos ──────────────────────

export interface UbicacionEnCalle {
  calleId: string
  calle: string
  progresiva: number
  /** Metros del eje: negativo a la izquierda, positivo a la derecha (como la sección). */
  desplazamiento: number
}

/** Más lejos que esto del eje de una pista, el punto no es de esa calle. */
const LEJOS_DEL_EJE_M = 30

/**
 * En qué calle y progresiva cae un punto del plano: la pista enlazada más
 * cercana (dentro de 30 m de su eje). Null si no cae en ninguna o el plano
 * no tiene escala.
 */
export function ubicacionEnCalles(punto: Punto2, pistas: PistaCalibrada[], calles: Calle[]): UbicacionEnCalle | null {
  let mejor: UbicacionEnCalle | null = null
  for (const pista of pistas) {
    if (!pista.calleId) continue
    const calle = calles.find((c) => c.id === pista.calleId)
    if (!calle) continue
    let p
    try {
      p = proyectarSobrePista(pista, punto)
    } catch {
      continue
    }
    if (p.fueraDeLaPista || Math.abs(p.desplazamiento) > LEJOS_DEL_EJE_M) continue
    if (!mejor || Math.abs(p.desplazamiento) < Math.abs(mejor.desplazamiento)) {
      mejor = { calleId: calle.id, calle: calle.nombre, progresiva: p.progresiva, desplazamiento: p.desplazamiento }
    }
  }
  return mejor
}

/** «Av. Sol 0+040, 2.1 m izq.» */
export function textoUbicacion(u: UbicacionEnCalle): string {
  const d = Math.abs(u.desplazamiento)
  const lado = d < 0.05 ? 'en el eje' : `${d.toFixed(1)} m ${u.desplazamiento < 0 ? 'izq.' : 'der.'}`
  return `${u.calle} ${formatearProgresiva(u.progresiva)}, ${lado}`
}

/**
 * Dónde cae en el plano un punto de la sección en una progresiva: sobre el
 * eje de la pista y corrido su distancia a un lado. Se prueba la normal y se
 * comprueba proyectando de vuelta, así el lado sale bien con cualquier
 * sentido de dibujo.
 */
export function puntoDeSeccionEnPlano(pista: PistaCalibrada, progresiva: number, distancia: number): Punto2 | null {
  const sobreEje = puntoEnProgresiva(pista, progresiva)
  if (!sobreEje) return null
  if (Math.abs(distancia) < 1e-9) return { x: sobreEje.x, y: sobreEje.y }
  const r = (sobreEje.rumbo * Math.PI) / 180
  const u = distancia / pista.calibracion.metrosPorUnidad
  const candidatos = [
    { x: sobreEje.x + Math.sin(r) * u, y: sobreEje.y - Math.cos(r) * u },
    { x: sobreEje.x - Math.sin(r) * u, y: sobreEje.y + Math.cos(r) * u },
  ]
  return (
    candidatos.find((c) => {
      try {
        return Math.abs(proyectarSobrePista(pista, c).desplazamiento - distancia) < Math.abs(distancia) * 0.5 + 1e-6
      } catch {
        return false
      }
    }) ?? candidatos[0]!
  )
}

export interface PuntoMedidoEnPlano {
  id: string
  /** «Av. Sol 0+040 BI». */
  nombre: string
  x: number
  y: number
  cota: number
}

/**
 * Lo medido en la libreta de una capa, en cada calle que tiene su pista en
 * este plano, puesto en el plano en su progresiva y su punto de la sección.
 * Sale de las mismas cotas que Revisar (compensadas si cerró): no se copia
 * nada, se calcula cada vez.
 */
export function puntosMedidosEnPlano(proyecto: Proyecto, pistas: PistaCalibrada[], capaId: string): PuntoMedidoEnPlano[] {
  const salida: PuntoMedidoEnPlano[] = []
  for (const pista of pistas) {
    const calle = pista.calleId ? proyecto.calles.find((c) => c.id === pista.calleId) : undefined
    if (!calle) continue
    for (const punto of calle.seccion.puntos) {
      const leida = lineaDeCapa(proyecto, calle.id, capaId, punto.id)
      for (const p of leida?.linea.puntos ?? []) {
        const enPlano = puntoDeSeccionEnPlano(pista, p.progresiva, punto.distancia)
        if (!enPlano) continue
        salida.push({
          id: `medido:${calle.id}:${p.progresiva}:${punto.id}`,
          nombre: `${calle.nombre} ${formatearProgresiva(p.progresiva)} ${palabraDePunto(punto)}`,
          x: enPlano.x,
          y: enPlano.y,
          cota: p.cota,
        })
      }
    }
  }
  return salida
}
