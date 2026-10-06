import type { BM, DestinoLectura, Estacion, Id, Toma } from '../modelo/tipos'
import { aMetros, aMilimetros } from '../numero'
import { calcularCierre, calcularLongitudKAuto, calcularToleranciaMm } from './cierre'
import { correccionesAcumuladas } from './compensacion'
import { calcularCotas, esLecturaUsable, type ResultadoCotas } from './cotas'

/**
 * Cierre en vivo: lo que la pantalla de Medir enseña MIENTRAS se nivela.
 *
 * No calcula nada propio: arma las mismas piezas que `calcularCampania`
 * (`calcularCotas`, `calcularCierre`, `correccionesAcumuladas`) para que el
 * número que ve el topógrafo en campo sea el mismo que saldrá luego.
 *
 * Una diferencia deliberada: si una estación vuelve a arrancar de un BM, el
 * cierre solo comprueba desde ahí, y la vista previa reparte la corrección
 * solo en ese tramo. Repartirla en todas las estaciones movería cotas que el
 * cierre nunca comparó con nada (spec §3: lo calculado sobre lo que no cerró
 * tampoco está comprobado).
 */

export interface OpcionesCierreEnVivo {
  /** Coeficiente k de T = k·√K, en mm (12, 8, 4…). Por defecto, el de la toma. */
  coeficiente?: number
  /** Longitud K del circuito en km. Por defecto, la de la toma (fija o automática). */
  longitudKKm?: number
}

export interface TramoComprobado {
  /** Índices de estación (desde 0), ambos incluidos. */
  primeraEstacion: number
  ultimaEstacion: number
}

export interface CierreVivo {
  cotaCalculada: number
  cotaConocida: number
  /** Calculada − conocida, en mm. Negativo = el circuito llegó bajo. */
  errorMm: number
  /** El mismo error redondeado a 0.1 mm, para que cada pantalla no lo rehaga. */
  errorMmRedondeado: number
  toleranciaMm: number
  coeficiente: number
  longitudKKm: number
  pasa: boolean
  /** Estaciones que el cierre respalda: desde la última que arrancó de un BM. */
  tramoComprobado: TramoComprobado
  /**
   * Vista previa, en mm: la corrección ACUMULADA que recibiría cada estación
   * (un valor por estación de la toma; 0 en las que quedan fuera del tramo).
   * Vacía si no pasa: un cierre fuera de tolerancia no se compensa.
   */
  correccionesMm: number[]
}

/** Una visada a un BM conocido que no es el cierre: se compara con su cota. */
export interface ControlBm {
  bmId: Id
  nombre: string
  estacionIndice: number
  cotaCalculada: number
  cotaConocida: number
  /** Calculada − conocida, en mm. */
  errorMm: number
}

/** Lo que la pantalla de cierre enseña antes de visar el BM. */
export interface PrevioCierre {
  alturaInstrumentalUltima: number
  bmCierre: { id: Id; nombre: string; cota: number }
  coeficiente: number
  longitudKKm: number
  toleranciaMm: number
  /** AI − cota del BM, en m: la lectura que daría error cero. */
  lecturaParaCerrarExacto: number
  /** Lecturas en m, [mínima, máxima], cuyo error queda dentro de la tolerancia. */
  rangoLecturaQuePasa: [number, number]
}

export interface EstadoCierreEnVivo {
  /** `error` cuando la libreta o la configuración del cierre no se dejan calcular. */
  circuito: 'abierto' | 'cerrado' | 'error'
  /** Lecturas anotadas: vistas atrás, intermedias y vistas adelante. */
  lecturas: number
  /** Anotadas pero todavía no usables (0, o más que la mira): no son dato aún. */
  lecturasPendientes: number
  /** Lecturas usables que ningún cierre dentro de tolerancia respalda. */
  lecturasSinComprobar: number
  estaciones: number
  /** Null mientras el circuito no cierre contra su BM. */
  cierre: CierreVivo | null
  /** Visadas a BM conocidos a mitad de camino, con su diferencia. */
  controles: ControlBm[]
  /** Null si no hay BM de cierre o la última estación no tiene cota instrumento. */
  previo: PrevioCierre | null
  /** Por qué sigue abierto, o por qué hay un tramo que el cierre no respalda; si no, null. */
  motivo: string | null
  error: string | null
  /** Una línea corta para la pantalla. */
  texto: string
}

export function estadoCierreEnVivo(
  toma: Toma,
  bms: BM[],
  opciones: OpcionesCierreEnVivo = {},
): EstadoCierreEnVivo {
  const { lecturas, pendientes } = contarLecturas(toma)
  const usables = lecturas - pendientes
  const estaciones = toma.estaciones.length

  // Una libreta a medio corregir, o un campo de K en blanco, no debe tumbar
  // la pantalla: se dice qué pasa y todo lo anotado queda sin comprobar.
  const conError = (error: string): EstadoCierreEnVivo => ({
    circuito: 'error',
    lecturas,
    lecturasPendientes: pendientes,
    lecturasSinComprobar: usables,
    estaciones,
    cierre: null,
    controles: [],
    previo: null,
    motivo: null,
    error,
    texto: `No se puede calcular · ${error}`,
  })

  let cotas: ResultadoCotas
  try {
    cotas = calcularCotas(toma, bms)
  } catch (fallo) {
    return conError((fallo as Error).message)
  }

  const abierto = (previo: PrevioCierre | null): EstadoCierreEnVivo => ({
    circuito: 'abierto',
    lecturas,
    lecturasPendientes: pendientes,
    lecturasSinComprobar: usables,
    estaciones,
    cierre: null,
    controles: controlesBm(toma, bms, cotas, false),
    previo,
    motivo: motivoAbierto(toma, bms, cotas),
    error: null,
    texto: textoAbierto(lecturas, usables, pendientes),
  })

  // Una toma abierta no se verifica: no necesita k ni K.
  if (toma.cierre.tipo === 'abierto') return abierto(null)

  let configuracion: ConfiguracionCierre
  try {
    configuracion = configurarCierre(
      opciones.coeficiente ?? toma.cierre.coeficiente,
      // La misma regla que calcularCampania: automática si así se configuró.
      opciones.longitudKKm ??
        (toma.cierre.longitudKAuto ? calcularLongitudKAuto(toma, toma.cierre.tipo) : toma.cierre.longitudK),
    )
  } catch (fallo) {
    return conError((fallo as Error).message)
  }
  const { coeficiente, longitudKKm } = configuracion

  const tomaConK: Toma = { ...toma, cierre: { ...toma.cierre, coeficiente } }
  const resultado = calcularCierre(tomaConK, bms, cotas, longitudKKm)
  const previo = previoCierre(toma, bms, cotas, configuracion)

  if (
    resultado.errorMm === null ||
    resultado.toleranciaMm === null ||
    resultado.pasa === null ||
    resultado.cotaLlegadaCalculada === null ||
    resultado.cotaLlegadaConocida === null
  ) {
    return abierto(previo)
  }

  const tramo = tramoQueCierra(toma)
  const cierre: CierreVivo = {
    cotaCalculada: resultado.cotaLlegadaCalculada,
    cotaConocida: resultado.cotaLlegadaConocida,
    errorMm: resultado.errorMm,
    errorMmRedondeado: redondear1(resultado.errorMm),
    toleranciaMm: resultado.toleranciaMm,
    coeficiente,
    longitudKKm,
    pasa: resultado.pasa,
    tramoComprobado: tramo,
    // calcularCampania no compensa un cierre que no pasa: la vista previa tampoco.
    correccionesMm: resultado.pasa ? correccionesDelTramo(resultado.errorMm, estaciones, tramo) : [],
  }
  const sinComprobar = cierre.pasa ? usables - lecturasComprobadas(toma, cotas, tramo) : usables

  return {
    circuito: 'cerrado',
    lecturas,
    lecturasPendientes: pendientes,
    lecturasSinComprobar: sinComprobar,
    estaciones,
    cierre,
    controles: controlesBm(toma, bms, cotas, true),
    previo,
    motivo: tramo.primeraEstacion > 0 ? motivoTramoSinCierre(toma, bms, tramo) : null,
    error: null,
    texto: textoCerrado(cierre, sinComprobar, pendientes),
  }
}

export interface SimulacionCierre {
  cotaCalculada: number
  errorMm: number
  /** El mismo error redondeado a 0.1 mm. */
  errorMmRedondeado: number
  toleranciaMm: number
  pasa: boolean
  /** AI − cota del BM, en m: la lectura que daría error cero. */
  lecturaParaCerrarExacto: number
  /** Corrección acumulada por estación, en mm; vacía si no se dio el número de estaciones. */
  correccionesMm: number[]
}

/**
 * Para la pantalla de cierre: «si leo esto en el BM, ¿cierro?». Antes de
 * tocar la mira el topógrafo ve qué lectura le daría un cierre aceptable.
 *
 * Pasa por `calcularCierre` con una toma de una sola visada, en vez de repetir
 * la cuenta: así la holgura de punto flotante y la regla de «pasa» son las
 * mismas que en el cálculo de verdad.
 */
export function simularCierre(
  alturaInstrumentalUltima: number,
  lecturaEnBm: number,
  cotaBm: number,
  k: number,
  km: number,
  numeroEstaciones = 0,
): SimulacionCierre {
  // Un hueco en blanco daría NaN en todos los campos, y NaN «no pasa» en
  // silencio: mejor decir qué falta.
  if (!Number.isFinite(lecturaEnBm)) throw new Error('Falta la lectura en el BM.')
  if (!esLecturaUsable(lecturaEnBm)) {
    throw new Error(
      `La lectura ${lecturaEnBm.toFixed(3)} no puede ser de una mira (tiene que estar entre 0 y 5 m).`,
    )
  }
  if (!Number.isFinite(alturaInstrumentalUltima)) throw new Error('Falta la altura instrumental.')
  if (!Number.isFinite(cotaBm)) throw new Error('Falta la cota del BM.')
  // Con 2.5 estaciones correccionesAcumuladas daría 3 valores y el último ya
  // no anularía el error.
  if (!Number.isInteger(numeroEstaciones) || numeroEstaciones < 0) {
    throw new Error('El número de estaciones tiene que ser un entero, 0 o más.')
  }
  configurarCierre(k, km)

  const idBm: Id = 'bm-simulado'
  const bm: BM = { id: idBm, nombre: 'BM', cota: cotaBm, tipo: 'auxiliar', descripcion: '' }
  const cotaCalculada = alturaInstrumentalUltima - lecturaEnBm
  const toma: Toma = {
    id: 'toma-simulada',
    fecha: '',
    capaId: '',
    bmInicialId: idBm,
    estaciones: [],
    cierre: {
      tipo: 'cerrado',
      bmFinalId: idBm,
      longitudK: km,
      longitudKAuto: false,
      clase: 'personalizada',
      coeficiente: k,
    },
  }
  const cotas: ResultadoCotas = {
    cotasInstrumento: [alturaInstrumentalUltima],
    puntos: [],
    cotaLlegada: cotaCalculada,
    bmLlegadaId: idBm,
  }
  const resultado = calcularCierre(toma, [bm], cotas, km)

  // Con BM y llegada puestos a mano, calcularCierre siempre cierra.
  const errorMm = resultado.errorMm!
  return {
    cotaCalculada,
    errorMm,
    errorMmRedondeado: redondear1(errorMm),
    toleranciaMm: resultado.toleranciaMm!,
    pasa: resultado.pasa!,
    lecturaParaCerrarExacto: alturaInstrumentalUltima - cotaBm,
    correccionesMm:
      numeroEstaciones > 0 ? correccionesAcumuladas(errorMm, numeroEstaciones).map(aMilimetros) : [],
  }
}

// ---------- auxiliares ----------

interface ConfiguracionCierre {
  coeficiente: number
  longitudKKm: number
  toleranciaMm: number
}

/**
 * k y K vienen de campos de texto: uno en blanco es NaN, y con NaN la
 * tolerancia sale NaN y el cierre «no pasa» en falso. Se dice qué falta.
 */
function configurarCierre(coeficiente: number, longitudKKm: number): ConfiguracionCierre {
  if (!Number.isFinite(coeficiente) || coeficiente <= 0) {
    throw new Error('El coeficiente k tiene que ser un número positivo.')
  }
  if (!Number.isFinite(longitudKKm)) throw new Error('Falta la longitud del circuito.')
  // calcularToleranciaMm es quien rechaza una K negativa.
  return { coeficiente, longitudKKm, toleranciaMm: calcularToleranciaMm(coeficiente, longitudKKm) }
}

/**
 * calcularCotas toma la cota CONOCIDA de cualquier BM al que se vise atrás:
 * la cadena se corta ahí. El cierre solo respalda desde la última estación
 * que arranca de un BM hasta la última.
 */
function tramoQueCierra(toma: Toma): TramoComprobado {
  let primeraEstacion = 0
  toma.estaciones.forEach((estacion, indice) => {
    if (estacion.vistaAtras.destino.tipo === 'bm') primeraEstacion = indice
  })
  return { primeraEstacion, ultimaEstacion: toma.estaciones.length - 1 }
}

function correccionesDelTramo(errorMm: number, estaciones: number, tramo: TramoComprobado): number[] {
  const delTramo = correccionesAcumuladas(errorMm, tramo.ultimaEstacion - tramo.primeraEstacion + 1).map(
    aMilimetros,
  )
  return Array.from({ length: estaciones }, (_, indice) =>
    indice < tramo.primeraEstacion ? 0 : delTramo[indice - tramo.primeraEstacion]!,
  )
}

function lecturasUsablesDe(estacion: Estacion): number {
  const todas = [estacion.vistaAtras, ...estacion.intermedias]
  if (estacion.vistaAdelante) todas.push(estacion.vistaAdelante)
  return todas.filter((lectura) => esLecturaUsable(lectura.valor)).length
}

/** Solo cuentan las estaciones del tramo que de verdad tienen cota instrumento. */
function lecturasComprobadas(toma: Toma, cotas: ResultadoCotas, tramo: TramoComprobado): number {
  let comprobadas = 0
  for (let indice = tramo.primeraEstacion; indice <= tramo.ultimaEstacion; indice += 1) {
    if (!Number.isFinite(cotas.cotasInstrumento[indice])) continue
    comprobadas += lecturasUsablesDe(toma.estaciones[indice]!)
  }
  return comprobadas
}

/**
 * Cada visada a un BM conocido que no sea el cierre se compara con su cota:
 * es la única pista sobre un tramo que el cierre no respalda.
 */
function controlesBm(toma: Toma, bms: BM[], cotas: ResultadoCotas, excluirLlegada: boolean): ControlBm[] {
  const ultima = toma.estaciones.length - 1
  const controles: ControlBm[] = []
  for (const punto of cotas.puntos) {
    if (punto.destino.tipo !== 'bm') continue
    const bmId = punto.destino.bmId
    const esLlegada =
      excluirLlegada &&
      punto.estacionIndice === ultima &&
      bmId === cotas.bmLlegadaId &&
      punto.cotaCruda === cotas.cotaLlegada
    if (esLlegada) continue
    const bm = bms.find((b) => b.id === bmId)
    if (!bm) continue
    controles.push({
      bmId,
      nombre: bm.nombre,
      estacionIndice: punto.estacionIndice,
      cotaCalculada: punto.cotaCruda,
      cotaConocida: bm.cota,
      errorMm: aMilimetros(punto.cotaCruda - bm.cota),
    })
  }
  return controles
}

function previoCierre(
  toma: Toma,
  bms: BM[],
  cotas: ResultadoCotas,
  configuracion: ConfiguracionCierre,
): PrevioCierre | null {
  const bmFinal = bms.find((bm) => bm.id === toma.cierre.bmFinalId)
  const alturaInstrumentalUltima = cotas.cotasInstrumento[toma.estaciones.length - 1]
  if (!bmFinal || alturaInstrumentalUltima === undefined || !Number.isFinite(alturaInstrumentalUltima)) {
    return null
  }
  const lecturaParaCerrarExacto = alturaInstrumentalUltima - bmFinal.cota
  const holguraM = aMetros(configuracion.toleranciaMm)
  return {
    alturaInstrumentalUltima,
    bmCierre: { id: bmFinal.id, nombre: bmFinal.nombre, cota: bmFinal.cota },
    coeficiente: configuracion.coeficiente,
    longitudKKm: configuracion.longitudKKm,
    toleranciaMm: configuracion.toleranciaMm,
    lecturaParaCerrarExacto,
    rangoLecturaQuePasa: [lecturaParaCerrarExacto - holguraM, lecturaParaCerrarExacto + holguraM],
  }
}

function contarLecturas(toma: Toma): { lecturas: number; pendientes: number } {
  let lecturas = 0
  let usables = 0
  for (const estacion of toma.estaciones) {
    lecturas += 1 + estacion.intermedias.length + (estacion.vistaAdelante ? 1 : 0)
    usables += lecturasUsablesDe(estacion)
  }
  return { lecturas, pendientes: lecturas - usables }
}

function nombreBm(bms: BM[], id: Id): string {
  return bms.find((bm) => bm.id === id)?.nombre ?? id
}

function nombreDestino(bms: BM[], destino: DestinoLectura): string {
  switch (destino.tipo) {
    case 'bm':
      return nombreBm(bms, destino.bmId)
    case 'cambio':
      return destino.nombre
    case 'celda':
      return `${destino.celda.progresiva} m`
    case 'suelto':
      return destino.punto.etiqueta
  }
}

function motivoTramoSinCierre(toma: Toma, bms: BM[], tramo: TramoComprobado): string {
  const desde = nombreDestino(bms, toma.estaciones[0]!.vistaAtras.destino)
  const hasta = nombreDestino(bms, toma.estaciones[tramo.primeraEstacion]!.vistaAtras.destino)
  const estaciones = tramo.primeraEstacion === 1 ? 'estación 1' : `estaciones 1–${tramo.primeraEstacion}`
  return `Tramo ${desde} → ${hasta} (${estaciones}) sin cierre propio: el cierre solo comprueba desde ${hasta}.`
}

function motivoAbierto(toma: Toma, bms: BM[], cotas: ResultadoCotas): string {
  const { tipo, bmFinalId } = toma.cierre
  if (tipo === 'abierto') return 'La toma está configurada como circuito abierto: no se verifica.'
  if (!bmFinalId) return 'Falta elegir el BM de cierre.'
  if (!bms.some((bm) => bm.id === bmFinalId)) return 'El BM de cierre ya no existe en la obra.'
  if (cotas.bmLlegadaId !== null && cotas.bmLlegadaId !== bmFinalId) {
    return (
      `La última estación llega a ${nombreBm(bms, cotas.bmLlegadaId)}, ` +
      `pero el BM de cierre es ${nombreBm(bms, bmFinalId)}.`
    )
  }
  return `Falta visar el BM de cierre (${nombreBm(bms, bmFinalId)}) desde la última estación.`
}

/** A 0.1 mm, simétrico en el signo y sin −0. */
function redondear1(valor: number): number {
  const redondeado = Math.round(Math.abs(valor) * 10) / 10
  if (redondeado === 0) return 0
  return valor < 0 ? -redondeado : redondeado
}

function plural(n: number, singular: string, varias: string): string {
  return `${n} ${n === 1 ? singular : varias}`
}

function colaPendientes(pendientes: number): string {
  return pendientes > 0 ? ` · ${plural(pendientes, 'pendiente', 'pendientes')}` : ''
}

function colaSinComprobar(sinComprobar: number): string {
  return sinComprobar > 0 ? ` · ${plural(sinComprobar, 'lectura sin comprobar', 'lecturas sin comprobar')}` : ''
}

function textoAbierto(lecturas: number, sinComprobar: number, pendientes: number): string {
  if (lecturas === 0) return 'Circuito abierto · sin lecturas todavía'
  return (
    `Circuito abierto · ${plural(sinComprobar, 'lectura sin comprobar', 'lecturas sin comprobar')}` +
    colaPendientes(pendientes)
  )
}

/** Signo explícito y el menos tipográfico, como se escribe en la libreta. */
function conSigno(valor: number, decimales: number): string {
  const texto = Math.abs(valor).toFixed(decimales)
  if (Number(texto) === 0) return texto
  return `${valor < 0 ? '−' : '+'}${texto}`
}

function textoCerrado(cierre: CierreVivo, sinComprobar: number, pendientes: number): string {
  // «−6.6 mm, máximo ±6.6 mm ✗» parecería un fallo del programa: si al
  // redondear un cierre que no pasa se ven iguales, se dan más decimales.
  let decimales = 1
  while (
    !cierre.pasa &&
    decimales < 3 &&
    Math.abs(cierre.errorMm).toFixed(decimales) === cierre.toleranciaMm.toFixed(decimales)
  ) {
    decimales += 1
  }
  const error = `${conSigno(cierre.errorMm, decimales)} mm`
  const tolerancia = `±${cierre.toleranciaMm.toFixed(decimales)} mm`
  if (cierre.pasa) {
    return (
      `Circuito cerrado · ${error} de ${tolerancia} ✓` + colaSinComprobar(sinComprobar) + colaPendientes(pendientes)
    )
  }
  return (
    `Circuito cerrado fuera de tolerancia · ${error}, máximo ${tolerancia} ✗` +
    colaSinComprobar(sinComprobar) +
    colaPendientes(pendientes)
  )
}
