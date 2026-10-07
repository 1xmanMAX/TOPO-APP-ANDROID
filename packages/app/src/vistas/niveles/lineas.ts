import {
  alturaInstrumental as alturaDesdeVistaAtras,
  aMilimetros,
  cotaTeoricaDeCapa,
  estadoDeDiferencia,
  lineaDeCapa,
  ordenarCapas,
  progresivasDeLaToma,
  redondear3,
  type BM,
  type Calle,
  type Capa,
  type Id,
  type LineaNivel,
  type Proyecto,
  type Puesta,
  type PuntoSeccion,
} from '@topo/core'

/*
 * Pegamento entre lo que guarda la app (capas, tomas, sección, BMs) y el
 * motor de niveles (`campo/niveles`: la herramienta «Pistas y veredas» de
 * Max). Aquí no se calcula nada propio: se arman las líneas, la puesta y la
 * comparación con el proyecto que piden Replantear › Desde una capa medida y
 * Análisis › Separación, para que las pantallas no tengan cuentas escondidas.
 */

/** Una línea de niveles tal como se elige en pantalla: una capa medida en un punto de la sección. */
export interface EleccionLinea {
  capaId: Id
  puntoId: Id
  /** Sube (+) o baja (−) la línea entera, en cm: el «subir / bajar» de su herramienta. */
  ajusteCm: number
}

/** Las capas que tienen al menos una toma en esta calle, de abajo hacia arriba. */
export function capasMedidas(calle: Calle, capas: Capa[]): Capa[] {
  const usadas = new Set(calle.nivelaciones.flatMap((n) => n.tomas.map((t) => t.capaId)))
  return ordenarCapas(capas).filter((c) => usadas.has(c.id))
}

/** Los puntos de la sección de izquierda a derecha, como se ven en el corte. */
export function puntosDeIzquierdaADerecha(calle: Calle): PuntoSeccion[] {
  return [...calle.seccion.puntos].sort((a, b) => a.distancia - b.distancia)
}

/** El texto del ajuste, como lo escribe su herramienta: « (+2 cm)». */
export function textoAjusteCm(ajusteCm: number): string {
  if (!ajusteCm) return ''
  return ` (${ajusteCm > 0 ? '+' : '−'}${Math.abs(ajusteCm)} cm)`
}

/**
 * La línea de una capa en un punto de la sección (`lineaDeCapa` del motor:
 * todas las tomas de esa capa, compensadas si cerraron), con el ajuste ya
 * sumado. Null si la calle o el punto no existen.
 */
export function lineaElegida(
  proyecto: Proyecto,
  calle: Calle,
  eleccion: EleccionLinea,
): { linea: LineaNivel; avisos: string[] } | null {
  const leida = lineaDeCapa(proyecto, calle.id, eleccion.capaId, eleccion.puntoId)
  if (!leida) return null
  const ajuste = Number.isFinite(eleccion.ajusteCm) ? eleccion.ajusteCm : 0
  if (!ajuste) return leida
  return {
    linea: {
      nombre: leida.linea.nombre + textoAjusteCm(ajuste),
      puntos: leida.linea.puntos.map((p) => ({ ...p, cota: p.cota + ajuste / 100 })),
    },
    avisos: leida.avisos,
  }
}

/**
 * Todas las líneas medidas de la calle (cada capa con tomas, en cada punto de
 * la sección), menos las vacías. Son las «otras» de las que el motor toma
 * pendientes cuando la línea propia no cubre una progresiva.
 */
export function lineasDeLaCalle(proyecto: Proyecto, calle: Calle): LineaNivel[] {
  const salida: LineaNivel[] = []
  for (const capa of capasMedidas(calle, proyecto.capas)) {
    for (const punto of calle.seccion.puntos) {
      const leida = lineaDeCapa(proyecto, calle.id, capa.id, punto.id)
      if (leida && leida.linea.puntos.length > 0) salida.push(leida.linea)
    }
  }
  return salida
}

/** La capa que va justo encima en el paquete: la que se va a dar. Null si es la última. */
export function capaEncima(capas: Capa[], capaId: Id): Capa | null {
  const ordenadas = ordenarCapas(capas)
  const i = ordenadas.findIndex((c) => c.id === capaId)
  return i >= 0 ? (ordenadas[i + 1] ?? null) : null
}

/** Lo que la capa de encima aporta según el proyecto (su espesor); 0 si no hay o no está puesto. */
export function desplazamientoSugerido(capas: Capa[], capaId: Id): number {
  const encima = capaEncima(capas, capaId)
  return encima && encima.espesor > 0 ? redondear3(encima.espesor) : 0
}

/** Las progresivas de todas las jornadas de la calle, ordenadas y sin repetir. */
export function progresivasDeLaCalle(calle: Calle): number[] {
  const todas = new Set<number>()
  for (const n of calle.nivelaciones) for (const t of n.tomas) for (const p of progresivasDeLaToma(t)) todas.add(p)
  return [...todas].sort((a, b) => a - b)
}

/**
 * La puesta desde una vista atrás a un BM, con el mismo criterio que
 * Replantear › Desde el proyecto: un BM oficial ya tiene su cota comprobada;
 * uno auxiliar vale lo que la nivelación que lo dejó. Null si la vista atrás
 * no puede ser de la mira.
 */
export function puestaDesdeBM(bm: BM, vistaAtras: number, largoMira: number): Puesta | null {
  const altura = alturaDesdeVistaAtras(bm.cota, vistaAtras, largoMira)
  if (altura === null) return null
  const oficial = bm.tipo === 'oficial'
  return {
    tipo: 'libreta',
    nombre: `${bm.nombre} ${oficial ? 'oficial' : 'auxiliar'}`,
    alturaInstrumental: altura,
    comprobado: oficial,
    avisos: oficial
      ? []
      : [`${bm.nombre} es un BM auxiliar: su cota vale lo que la nivelación que lo dejó. No comprobado.`],
  }
}

export interface ContraProyecto {
  /** Cota que pide el proyecto para esa capa en ese punto. */
  cotaProyecto: number
  /** Cota a dar − proyecto, en mm enteros: positivo queda alta (habrá que cortar). */
  diferenciaMm: number
  estado: 'conforme' | 'alLimite' | 'fuera'
}

/**
 * Cómo queda la cota que se va a dar frente a lo que pide el proyecto para
 * esa capa, con su tolerancia: seguir una capa medida que quedó alta arrastra
 * el error a la siguiente, y eso se dice antes de estacar. Null si la calle no
 * tiene rasante, la capa no está en el paquete o el punto cae fuera.
 */
export function contraProyecto(
  calle: Calle,
  capas: Capa[],
  capaId: Id,
  progresiva: number,
  offset: number,
  cota: number,
): ContraProyecto | null {
  if (!calle.rasante) return null
  const capa = capas.find((c) => c.id === capaId)
  if (!capa) return null
  const proyecto = cotaTeoricaDeCapa(calle.rasante, capas, capaId, progresiva, offset)
  if (proyecto === null) return null
  const diferenciaMm = Math.round(aMilimetros(redondear3(cota - proyecto))) + 0
  const estado = estadoDeDiferencia(diferenciaMm, capa.toleranciaMm) as ContraProyecto['estado']
  return { cotaProyecto: proyecto, diferenciaMm, estado }
}
