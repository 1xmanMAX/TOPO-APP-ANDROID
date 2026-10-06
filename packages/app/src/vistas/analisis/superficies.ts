import {
  aMilimetros,
  areasEntreSuperficies,
  bombeo,
  compararBombeo,
  construirGrilla,
  cotaTeoricaDeCapa,
  espesoresPorEncimaDe,
  estadoDeDiferencia,
  progresivasDeLaToma,
  redondear3,
  type Calle,
  type Capa,
  type CeldaGrilla,
  type ComparacionBombeo,
  type EstadoTolerancia,
  type Id,
  type PuntoDePerfil,
  type Rasante,
  type ResultadoCampania,
  type ResultadoComparacion,
  type SeccionConAreas,
  type Toma,
} from '@topo/core'

/*
 * Pegamento entre lo que guarda la app (tomas, rasante, sección) y lo que
 * pide el motor de `analisis/`. Aquí no se calcula nada propio: solo se arman
 * las listas de puntos que esperan `areasEntreSuperficies`,
 * `analizarDrenaje`, `bombeo` y `compararBombeo`, para que la pantalla no
 * tenga cuentas escondidas y se pueda probar sin dibujar.
 */

/** Cota de una superficie en una celda de la grilla; null si esa superficie no tiene dato ahí. */
export type CotaEnCelda = (celda: CeldaGrilla) => number | null

/** Lo medido en una toma, ya compensado si su cierre pasó. */
export function superficieMedida(resultado: ResultadoCampania): CotaEnCelda {
  return (celda) => resultado.cotasPorCelda.get(celda.clave)?.cota ?? null
}

/** Lo que el proyecto pide para esa capa (la rasante menos lo que va encima). */
export function superficieDeProyecto(rasante: Rasante, capas: Capa[], capaId: Id): CotaEnCelda {
  return (celda) => cotaTeoricaDeCapa(rasante, capas, capaId, celda.progresiva, celda.offset)
}

/** Progresivas de varias tomas juntas, ordenadas y sin repetir (lo que pide `construirGrilla`). */
export function progresivasDeTomas(tomas: Toma[]): number[] {
  const todas = new Set<number>()
  for (const toma of tomas) for (const progresiva of progresivasDeLaToma(toma)) todas.add(progresiva)
  return [...todas].sort((a, b) => a - b)
}

/**
 * Áreas de corte y relleno de cada progresiva entre dos superficies, con los
 * offsets de la sección de la calle. Un punto donde una de las dos no tiene
 * cota entra como NaN: así el motor lo cuenta como descartado y la sección
 * sale marcada como incompleta, en vez de calcularse con un hueco callado.
 *
 * Una sección que se quedó sin dos puntos válidos no tiene área (no es «0
 * m²»): sale con NaN para que `volumenesPorAreasMedias` la descarte y marque
 * el tramo como hueco.
 */
export function seccionesEntreSuperficies(
  calle: Calle,
  progresivas: number[],
  arriba: CotaEnCelda,
  abajo: CotaEnCelda,
): SeccionConAreas[] {
  const grilla = construirGrilla(calle, progresivas)
  return progresivas.map((progresiva) => {
    const puntos = grilla
      .filter((celda) => celda.progresiva === progresiva)
      .map((celda) => ({
        offset: celda.offset,
        cotaArriba: arriba(celda) ?? Number.NaN,
        cotaAbajo: abajo(celda) ?? Number.NaN,
      }))
    const areas = areasEntreSuperficies(puntos)
    if (areas.sinDatos) {
      return { progresiva, corte: Number.NaN, relleno: Number.NaN, descartados: areas.descartados }
    }
    return { progresiva, corte: areas.corte, relleno: areas.relleno, descartados: areas.descartados }
  })
}

/** Lo medido de un punto de la sección a lo largo de la calle, para `analizarDrenaje`. */
export function perfilMedido(resultado: ResultadoCampania, elementoClave: Id): PuntoDePerfil[] {
  return [...resultado.cotasPorCelda.values()]
    .filter((celda) => celda.elementoClave === elementoClave)
    .map((celda) => ({ progresiva: celda.progresiva, cota: celda.cota }))
    .sort((a, b) => a.progresiva - b.progresiva)
}

/** Lo que el proyecto pide para ese mismo punto, en las mismas progresivas. */
export function perfilDeProyecto(
  rasante: Rasante,
  capas: Capa[],
  capaId: Id,
  progresivas: number[],
  offset: number,
): PuntoDePerfil[] {
  const perfil: PuntoDePerfil[] = []
  for (const progresiva of progresivas) {
    const cota = cotaTeoricaDeCapa(rasante, capas, capaId, progresiva, offset)
    if (cota !== null) perfil.push({ progresiva, cota })
  }
  return perfil
}

export interface FilaBombeo {
  progresiva: number
  lado: 'izquierda' | 'derecha'
  /** El nombre del borde con que se midió («Borde izquierdo»). */
  borde: string
  /** %, positivo baja al alejarse del eje. Null si falta el eje o el borde en esa progresiva. */
  medido: number | null
  /** % del proyecto entre los mismos dos puntos; null sin rasante o fuera de la sección. */
  proyecto: number | null
  comparacion: ComparacionBombeo | null
}

/**
 * El bombeo de la calzada, medido y de proyecto, en cada progresiva y a cada
 * lado: entre el eje y el borde de calzada de la sección. Las cuentas son de
 * `bombeo` y `compararBombeo` del motor.
 */
export function bombeosPorProgresiva(
  calle: Calle,
  resultado: ResultadoCampania,
  progresivas: number[],
  proyecto: { rasante: Rasante; capas: Capa[]; capaId: Id } | null,
): FilaBombeo[] {
  const puntos = calle.seccion.puntos
  const eje = puntos.find((p) => p.rol === 'eje')
  if (!eje) return []
  const bordes = [
    { lado: 'izquierda' as const, punto: masCercano(puntos.filter((p) => p.rol === 'bordeCalzada' && p.distancia < 0)) },
    { lado: 'derecha' as const, punto: masCercano(puntos.filter((p) => p.rol === 'bordeCalzada' && p.distancia > 0)) },
  ]

  const filas: FilaBombeo[] = []
  for (const progresiva of progresivas) {
    const cotaEje = cotaMedida(resultado, progresiva, eje.id)
    for (const { lado, punto } of bordes) {
      if (!punto) continue
      const distancia = punto.distancia - eje.distancia
      const cotaBorde = cotaMedida(resultado, progresiva, punto.id)
      const medido = cotaEje !== null && cotaBorde !== null && distancia !== 0 ? bombeo(cotaEje, cotaBorde, distancia) : null

      let deProyecto: number | null = null
      if (proyecto && distancia !== 0) {
        const { rasante, capas, capaId } = proyecto
        const ejeProyecto = cotaTeoricaDeCapa(rasante, capas, capaId, progresiva, eje.distancia)
        const bordeProyecto = cotaTeoricaDeCapa(rasante, capas, capaId, progresiva, punto.distancia)
        if (ejeProyecto !== null && bordeProyecto !== null) deProyecto = bombeo(ejeProyecto, bordeProyecto, distancia)
      }

      filas.push({
        progresiva,
        lado,
        borde: punto.nombre,
        medido,
        proyecto: deProyecto,
        comparacion: medido !== null && deProyecto !== null ? compararBombeo(medido, deProyecto) : null,
      })
    }
  }
  return filas
}

function masCercano<T extends { distancia: number }>(lista: T[]): T | undefined {
  return [...lista].sort((a, b) => Math.abs(a.distancia) - Math.abs(b.distancia))[0]
}

function cotaMedida(resultado: ResultadoCampania, progresiva: number, elementoClave: Id): number | null {
  for (const celda of resultado.cotasPorCelda.values()) {
    if (celda.elementoClave === elementoClave && celda.progresiva === progresiva) return celda.cota
  }
  return null
}

// ---------- Espesores ----------

export interface EspesorEvaluado {
  clave: string
  progresiva: number
  elementoClave: string
  /** Metros, superior − inferior. Null si falta una de las dos cotas. */
  espesor: number | null
  /** Contra el espesor de diseño; null si no hay diseño o no hay espesor. */
  estado: Exclude<EstadoTolerancia, 'sinRasante' | 'sinMedir'> | null
  /** Espesor − diseño, en mm enteros; negativo = falta material. Null sin diseño o sin espesor. */
  diferenciaMm: number | null
  /** Más delgada de lo que pide el diseño, pasada la tolerancia. */
  delgada: boolean
}

/**
 * Lo que el proyecto pide entre dos capas: la suma de los espesores de las
 * capas que van encima de la de abajo, hasta la de arriba inclusive. Null si
 * las capas no tienen espesor definido (cero o al revés).
 */
export function espesorDeDisenio(capas: Capa[], capaInferiorId: Id, capaSuperiorId: Id): number | null {
  const valor = redondear3(espesoresPorEncimaDe(capas, capaInferiorId) - espesoresPorEncimaDe(capas, capaSuperiorId))
  return valor > 0 ? valor : null
}

/**
 * Por qué `espesorDeDisenio` salió null, para no mandar a corregir un dato
 * que está bien: dos tomas de la misma capa (una re-nivelación), las capas
 * elegidas al revés, o capas que de verdad no tienen espesor puesto.
 */
export function porQueSinEspesorDeDisenio(
  capas: Capa[],
  capaInferiorId: Id,
  capaSuperiorId: Id,
): 'mismaCapa' | 'alReves' | 'sinEspesor' {
  if (capaInferiorId === capaSuperiorId) return 'mismaCapa'
  const orden = (id: Id) => capas.find((c) => c.id === id)?.orden
  const inferior = orden(capaInferiorId)
  const superior = orden(capaSuperiorId)
  if (inferior !== undefined && superior !== undefined && inferior > superior) return 'alReves'
  return 'sinEspesor'
}

/**
 * Cada celda de la comparación con su semáforo contra el espesor de diseño:
 * el mismo `estadoDeDiferencia` que usa la rasante, con la tolerancia de la
 * capa de arriba (la que se acaba de colocar).
 */
export function evaluarEspesores(
  comparacion: ResultadoComparacion,
  disenio: number | null,
  toleranciaMm: number,
): Map<string, EspesorEvaluado> {
  const salida = new Map<string, EspesorEvaluado>()
  for (const celda of comparacion.celdas.values()) {
    let estado: EspesorEvaluado['estado'] = null
    let delgada = false
    let diferenciaMm: number | null = null
    if (celda.espesor !== null && disenio !== null) {
      diferenciaMm = Math.round(aMilimetros(redondear3(celda.espesor - disenio))) + 0
      estado = estadoDeDiferencia(diferenciaMm, toleranciaMm) as EspesorEvaluado['estado']
      delgada = diferenciaMm < 0 && estado !== 'conforme'
    }
    salida.set(celda.clave, {
      clave: celda.clave,
      progresiva: celda.progresiva,
      elementoClave: celda.elementoClave,
      espesor: celda.espesor,
      estado,
      diferenciaMm,
      delgada,
    })
  }
  return salida
}

/**
 * Una lista de progresivas escrita a mano («0+040, 80; 120»); lo que no se
 * entiende se devuelve aparte. La coma solo separa si va seguida de espacio:
 * «40,5» es una progresiva con coma decimal, como se escribe en Perú.
 */
export function leerListaDeProgresivas(
  texto: string,
  parsear: (t: string) => number | null,
): { progresivas: number[]; noEntendidas: string[] } {
  const progresivas: number[] = []
  const noEntendidas: string[] = []
  const trozos = texto
    .replace(/,(\s|$)/g, ' ')
    .split(/[;\s]+/)
    .filter((t) => t !== '')
  for (const trozo of trozos) {
    const valor = parsear(trozo)
    if (valor === null) noEntendidas.push(trozo)
    else progresivas.push(valor)
  }
  return { progresivas, noEntendidas }
}
