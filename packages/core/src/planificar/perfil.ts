import { formatearProgresiva } from '../grilla/progresivas'

/**
 * Perfil longitudinal de una pista: vértices unidos en línea recta. Puede
 * subir, bajar o quedar a nivel; entre dos vértices la pendiente es una sola.
 * Es lo que el planificador recorre para saber qué marcará la mira en cada
 * punto, así que se trabaja siempre sobre el perfil real y nunca sobre una
 * pendiente «promedio».
 */
export interface VerticePerfil {
  progresiva: number
  cota: number
}

export type Perfil = readonly VerticePerfil[]

export interface TramoDePendiente {
  desde: number
  hasta: number
  cotaDesde: number
  cotaHasta: number
  /** Positiva sube al avanzar de progresiva; negativa, baja. */
  pendientePorcentaje: number
}

export interface Quiebre {
  progresiva: number
  cota: number
  pendienteAntes: number
  pendienteDespues: number
}

/**
 * Lista lo que impide usar el perfil. No reordena ni descarta vértices: un
 * vértice repetido o fuera de orden suele ser un error de digitación, y
 * arreglarlo a escondidas movería la pista sin que nadie lo sepa.
 */
export function revisarPerfil(perfil: Perfil): string[] {
  const problemas: string[] = []
  if (perfil.length < 2) {
    problemas.push(`el perfil necesita al menos dos vértices (tiene ${perfil.length})`)
  }
  perfil.forEach((vertice, i) => {
    const numero = i + 1
    if (!Number.isFinite(vertice.progresiva)) {
      problemas.push(`el vértice ${numero} tiene una progresiva que no es un número`)
      return
    }
    if (!Number.isFinite(vertice.cota)) {
      problemas.push(`el vértice ${numero} tiene una cota que no es un número`)
    }
    const anterior = perfil[i - 1]
    if (anterior && Number.isFinite(anterior.progresiva) && vertice.progresiva <= anterior.progresiva) {
      problemas.push(
        `el vértice ${numero} (${formatearProgresiva(vertice.progresiva)}) no avanza: su progresiva debe ser mayor que la del vértice ${i} (${formatearProgresiva(anterior.progresiva)})`,
      )
    }
  })
  return problemas
}

function exigirPerfilValido(perfil: Perfil): void {
  const problemas = revisarPerfil(perfil)
  if (problemas.length > 0) throw new Error(`Perfil inválido: ${problemas.join('; ')}`)
}

export function inicioDelPerfil(perfil: Perfil): number {
  return perfil[0]!.progresiva
}

export function finDelPerfil(perfil: Perfil): number {
  return perfil[perfil.length - 1]!.progresiva
}

/**
 * Cota del perfil en una progresiva. Fuera del perfil lanza en vez de
 * prolongar la última pendiente: más allá del último vértice no se sabe cómo
 * sigue el terreno, y una cota inventada daría una lectura de mira falsa.
 */
export function cotaEn(perfil: Perfil, progresiva: number): number {
  exigirPerfilValido(perfil)
  if (!Number.isFinite(progresiva)) {
    // Con NaN toda comparación da falso y el cálculo caería en la cota del
    // último vértice: un dato inventado. Se corta aquí.
    throw new RangeError(`La progresiva ${String(progresiva)} no es un número`)
  }
  const inicio = inicioDelPerfil(perfil)
  const fin = finDelPerfil(perfil)
  // Una milésima de milímetro de holgura: las progresivas que salen de sumar
  // pasos pueden pasarse del final por el punto flotante.
  const holgura = 1e-9
  if (progresiva < inicio - holgura || progresiva > fin + holgura) {
    throw new RangeError(
      `La progresiva ${formatearProgresiva(progresiva)} está fuera del perfil (${formatearProgresiva(inicio)} a ${formatearProgresiva(fin)})`,
    )
  }
  return cotaEnPerfilValido(perfil, progresiva)
}

/**
 * Índice del primer vértice cuya progresiva es mayor que `progresiva`
 * (perfil.length si ninguno lo es). Búsqueda binaria: el planificador pide
 * miles de cotas por plan y un perfil sacado del plano trae cientos de
 * vértices.
 */
export function primerVerticeDespues(perfil: Perfil, progresiva: number): number {
  let bajo = 0
  let alto = perfil.length
  while (bajo < alto) {
    const medio = (bajo + alto) >> 1
    if (perfil[medio]!.progresiva > progresiva) alto = medio
    else bajo = medio + 1
  }
  return bajo
}

/**
 * Lo mismo que `cotaEn`, sin volver a revisar el perfil ni la progresiva.
 * Es para quien ya validó el perfil una vez en su entrada pública (el
 * planificador): revisar el perfil entero en cada una de las miles de cotas
 * de un plan hacía crecer el tiempo con el cuadrado de los vértices. Fuera
 * del perfil devuelve la cota del extremo más cercano, así que quien llama
 * debe haberse asegurado antes de no salir de él.
 */
export function cotaEnPerfilValido(perfil: Perfil, progresiva: number): number {
  const primero = perfil[0]!
  const ultimo = perfil[perfil.length - 1]!
  if (progresiva <= primero.progresiva) return primero.cota
  if (progresiva >= ultimo.progresiva) return ultimo.cota
  const i = primerVerticeDespues(perfil, progresiva)
  const a = perfil[i - 1]!
  if (progresiva === a.progresiva) return a.cota
  const b = perfil[i]!
  const t = (progresiva - a.progresiva) / (b.progresiva - a.progresiva)
  return a.cota + t * (b.cota - a.cota)
}

export function pendientes(perfil: Perfil): TramoDePendiente[] {
  exigirPerfilValido(perfil)
  const tramos: TramoDePendiente[] = []
  for (let i = 1; i < perfil.length; i++) {
    const a = perfil[i - 1]!
    const b = perfil[i]!
    tramos.push({
      desde: a.progresiva,
      hasta: b.progresiva,
      cotaDesde: a.cota,
      cotaHasta: b.cota,
      pendientePorcentaje: ((b.cota - a.cota) / (b.progresiva - a.progresiva)) * 100,
    })
  }
  return tramos
}

/**
 * Vértices donde la pendiente cambia en `umbralPorcentaje` puntos o más. El
 * umbral existe porque un perfil digitado a mano trae vértices con
 * diferencias de décimas que no son quiebres de la rasante, y cada quiebre es
 * una estaca de control que alguien tiene que clavar.
 */
export function quiebresDetallados(perfil: Perfil, umbralPorcentaje = 0.5): Quiebre[] {
  const tramos = pendientes(perfil)
  const resultado: Quiebre[] = []
  for (let i = 1; i < tramos.length; i++) {
    const antes = tramos[i - 1]!
    const despues = tramos[i]!
    const cambio = Math.abs(despues.pendientePorcentaje - antes.pendientePorcentaje)
    // La holgura deja pasar un cambio que es exactamente el umbral y que el
    // punto flotante deja unas billonésimas por debajo.
    if (cambio >= umbralPorcentaje - 1e-9) {
      resultado.push({
        progresiva: despues.desde,
        cota: despues.cotaDesde,
        pendienteAntes: antes.pendientePorcentaje,
        pendienteDespues: despues.pendientePorcentaje,
      })
    }
  }
  return resultado
}

export function quiebres(perfil: Perfil, umbralPorcentaje = 0.5): number[] {
  return quiebresDetallados(perfil, umbralPorcentaje).map((q) => q.progresiva)
}

/** «+8.20 %», «-7.40 %», «0.00 %»: con signo, para que se lea si sube o baja. */
export function formatearPendiente(porcentaje: number): string {
  const centesimas = Math.round(Number((porcentaje * 100).toPrecision(12)))
  if (centesimas === 0) return '0.00 %'
  const texto = (Math.abs(centesimas) / 100).toFixed(2)
  return `${centesimas > 0 ? '+' : '-'}${texto} %`
}
