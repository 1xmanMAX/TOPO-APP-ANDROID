import {
  alturaDePuesta,
  alturaInstrumental as alturaDesdeVistaAtras,
  instrumentoCompleto,
  puestaDeLibreta,
  type BM,
  type Id,
  type Proyecto,
  type Puesta,
  type PuestaDeNivel,
} from '@topo/core'

/*
 * Las puestas del nivel son del proyecto: una sola lista que usan Niveles,
 * los puntos del plano, la calculadora, Replantear y la hoja de estacas. Aquí
 * se resuelve de dónde sale la AI de cada una —una estación de la libreta,
 * un BM del proyecto + lectura atrás, o una cota escrita + lectura atrás—,
 * siempre en vivo: si se corrige la libreta o la cota del BM, la puesta la
 * sigue.
 */

export function puestasDe(proyecto: Proyecto): PuestaDeNivel[] {
  return proyecto.puestas ?? []
}

/** La cota sobre la que se leyó atrás: la del BM si está enlazada y existe; si no, la escrita. */
export function cotaBMDe(p: PuestaDeNivel, bms: BM[]): number {
  const bm = p.bmId ? bms.find((b) => b.id === p.bmId) : undefined
  return bm ? bm.cota : p.cotaBM
}

/**
 * La puesta como la entiende el motor:
 * - de la libreta: la AI de esa estación (compensada si cerró), con su comprobación;
 * - de un BM oficial: comprobada (un BM oficial ya tiene su cota comprobada);
 * - de un BM auxiliar o de una cota escrita: rápida, no comprobada.
 */
export function puestaParaMotor(p: PuestaDeNivel, proyecto: Proyecto): Puesta {
  if (p.libreta) {
    const deLibreta = puestaDeLibreta(proyecto, p.libreta.tomaId, p.libreta.indiceEstacion)
    if (deLibreta) return { ...deLibreta, nombre: p.nombre }
    return { tipo: 'libreta', nombre: p.nombre, alturaInstrumental: Number.NaN, comprobado: false }
  }
  const bm = p.bmId ? proyecto.bms.find((b) => b.id === p.bmId) : undefined
  if (bm && bm.tipo === 'oficial') {
    const largo = instrumentoCompleto(proyecto.instrumento).largoMira
    const ai = alturaDesdeVistaAtras(bm.cota, p.lecturaAtras, largo)
    return { tipo: 'libreta', nombre: p.nombre, alturaInstrumental: ai ?? Number.NaN, comprobado: ai !== null }
  }
  return { tipo: 'rapida', nombre: p.nombre, cotaBM: cotaBMDe(p, proyecto.bms), lecturaAtras: p.lecturaAtras }
}

/** La AI de una puesta; null si no se puede (lectura que no cabe en la mira, estación sin vista atrás…). */
export function alturaDe(p: PuestaDeNivel, proyecto: Proyecto): number | null {
  return alturaDePuesta(puestaParaMotor(p, proyecto), proyecto.instrumento)?.alturaInstrumental ?? null
}

/** De dónde sale la puesta, en pocas palabras: «BM-1 + 1.500», «Estación 2 de la libreta», «3245.180 + 1.500». */
export function origenDePuesta(p: PuestaDeNivel, proyecto: Proyecto): string {
  if (p.libreta) return `estación ${p.libreta.indiceEstacion + 1} de la libreta`
  const bm = p.bmId ? proyecto.bms.find((b) => b.id === p.bmId) : undefined
  return `${bm ? bm.nombre : p.cotaBM.toFixed(3)} + ${p.lecturaAtras.toFixed(3)}`
}

/** La puesta pedida, o la primera del proyecto si no se pidió ninguna o ya no existe. */
export function puestaPorId(proyecto: Proyecto, id: Id | null | undefined): PuestaDeNivel | null {
  const todas = puestasDe(proyecto)
  return todas.find((p) => p.id === id) ?? todas[0] ?? null
}

/**
 * Las puestas que traían las hojas de Niveles y los planos de antes pasan al
 * proyecto (sin repetir ids), y se quitan de donde estaban: las referencias
 * por id siguen valiendo. Idempotente.
 */
export function unirPuestas(proyecto: Proyecto): Proyecto {
  const vistas = new Set<Id>()
  const todas: PuestaDeNivel[] = []
  const sumar = (lista: PuestaDeNivel[] | undefined) => {
    for (const p of lista ?? []) {
      if (vistas.has(p.id)) continue
      vistas.add(p.id)
      todas.push(p)
    }
  }
  sumar(proyecto.puestas)
  let cambio = false
  const calles = proyecto.calles.map((calle) => {
    if (!calle.niveles?.puestas) return calle
    cambio = true
    sumar(calle.niveles.puestas)
    const { puestas: _quitadas, ...resto } = calle.niveles
    return { ...calle, niveles: resto }
  })
  const planos = proyecto.planos?.map((plano) => {
    if (!plano.nivelesEnPlano?.puestas) return plano
    cambio = true
    sumar(plano.nivelesEnPlano.puestas)
    const { puestas: _quitadas, ...resto } = plano.nivelesEnPlano
    return { ...plano, nivelesEnPlano: resto }
  })
  if (!cambio) return proyecto
  return { ...proyecto, calles, ...(planos ? { planos } : {}), puestas: todas }
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Una puesta tal como venga del archivo; null si no sirve (sin id). */
export function puestaUsable(p: unknown): PuestaDeNivel | null {
  if (!esObjeto(p) || typeof p.id !== 'string') return null
  const finito = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  const puesta: PuestaDeNivel = {
    id: p.id,
    nombre: typeof p.nombre === 'string' ? p.nombre : 'Puesta',
    cotaBM: finito(p.cotaBM) ? (p.cotaBM as number) : 0,
    lecturaAtras: finito(p.lecturaAtras) ? (p.lecturaAtras as number) : 0,
  }
  if (typeof p.bmId === 'string') puesta.bmId = p.bmId
  if (esObjeto(p.libreta) && typeof p.libreta.tomaId === 'string' && Number.isInteger(p.libreta.indiceEstacion)) {
    puesta.libreta = { tomaId: p.libreta.tomaId, indiceEstacion: p.libreta.indiceEstacion as number }
  }
  return puesta
}
