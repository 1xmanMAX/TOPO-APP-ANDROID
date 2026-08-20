import { claveCelda } from '../grilla/grilla'
import type { BM, Campania, DestinoLectura, Id } from '../modelo/tipos'

export interface PuntoCalculado {
  claveDestino: string
  destino: DestinoLectura
  estacionIndice: number
  lectura: number
  cotaInstrumento: number
  cotaCruda: number
}

export interface ResultadoCotas {
  cotasInstrumento: number[]
  puntos: PuntoCalculado[]
  cotaLlegada: number | null
  /** BM al que remató la última estación, si remató en uno. */
  bmLlegadaId: Id | null
}

/** Altura máxima de una mira de nivelación, en metros. */
const MIRA_MAXIMA_M = 5

/**
 * Una lectura de 0 es imposible —el hilo no cae en el cero de la mira— y una
 * mayor que la mira, también. Se tratan como pendientes, no como dato: así un
 * campo recién abierto no produce cotas inventadas ni veredictos falsos.
 */
export function esLecturaUsable(valor: number): boolean {
  return Number.isFinite(valor) && valor > 0 && valor <= MIRA_MAXIMA_M
}

export function claveDestino(destino: DestinoLectura): string {
  switch (destino.tipo) {
    case 'bm':
      return `bm:${destino.bmId}`
    case 'cambio':
      return `cambio:${destino.nombre}`
    case 'celda':
      return claveCelda(destino.celda.progresiva, destino.celda.elementoClave)
    case 'suelto':
      return `suelto:${destino.punto.etiqueta}`
  }
}

export function calcularCotas(campania: Campania, bms: BM[]): ResultadoCotas {
  const bmInicial = bms.find((bm) => bm.id === campania.bmInicialId)
  if (!bmInicial) throw new Error('No se encontró el banco de nivel inicial de la campaña')

  const cotasConocidas = new Map<string, number>()
  for (const bm of bms) cotasConocidas.set(`bm:${bm.id}`, bm.cota)

  // Destinos que existen en la libreta pero cuya lectura todavía no sirve.
  // No es lo mismo que un punto inventado: la cadena solo está a medio hacer.
  const pendientes = new Set<string>()

  const cotasInstrumento: number[] = []
  const puntos: PuntoCalculado[] = []
  let cotaLlegada: number | null = null
  let bmLlegadaId: Id | null = null

  campania.estaciones.forEach((estacion, indice) => {
    const clavePartida = claveDestino(estacion.vistaAtras.destino)
    const cotaPartida = cotasConocidas.get(clavePartida)

    if (cotaPartida === undefined) {
      // Si ese punto está esperando su lectura, la estación queda pendiente y
      // el resto del cálculo continúa: es lo que pasa justo después de
      // trasladar el instrumento, antes de teclear las dos lecturas.
      if (pendientes.has(clavePartida)) {
        cotasInstrumento.push(Number.NaN)
        return
      }

      const nombre =
        estacion.vistaAtras.destino.tipo === 'cambio'
          ? estacion.vistaAtras.destino.nombre
          : clavePartida
      throw new Error(`La estación ${indice + 1} arranca en ${nombre}, que no fue medido antes`)
    }

    if (!esLecturaUsable(estacion.vistaAtras.valor)) {
      // Sin vista atrás usable no hay cota instrumento: la estación entera
      // queda pendiente, en vez de arrastrar una cota inventada a sus
      // lecturas intermedias y a la vista adelante.
      cotasInstrumento.push(Number.NaN)
      return
    }

    const cotaInstrumento = cotaPartida + estacion.vistaAtras.valor
    cotasInstrumento.push(cotaInstrumento)

    for (const lectura of estacion.intermedias) {
      if (!esLecturaUsable(lectura.valor)) continue
      puntos.push({
        claveDestino: claveDestino(lectura.destino),
        destino: lectura.destino,
        estacionIndice: indice,
        lectura: lectura.valor,
        cotaInstrumento,
        cotaCruda: cotaInstrumento - lectura.valor,
      })
    }

    if (estacion.vistaAdelante && esLecturaUsable(estacion.vistaAdelante.valor)) {
      const clave = claveDestino(estacion.vistaAdelante.destino)
      const cota = cotaInstrumento - estacion.vistaAdelante.valor

      puntos.push({
        claveDestino: clave,
        destino: estacion.vistaAdelante.destino,
        estacionIndice: indice,
        lectura: estacion.vistaAdelante.valor,
        cotaInstrumento,
        cotaCruda: cota,
      })

      if (estacion.vistaAdelante.destino.tipo === 'cambio') {
        // Dos puntos de cambio con el mismo nombre harían que la estación
        // siguiente arrancara de la cota equivocada, en silencio.
        if (cotasConocidas.has(clave)) {
          throw new Error(
            `El punto de cambio ${estacion.vistaAdelante.destino.nombre} está repetido: ` +
              'dos estaciones distintas lo usan como punto de llegada. Renombra uno de los dos.',
          )
        }
        cotasConocidas.set(clave, cota)
      }

      // Solo la vista adelante de la ÚLTIMA estación cierra el circuito. Una
      // visada intermedia a un BM es un control, no un cierre: tomarla como
      // llegada daría por verificadas las estaciones posteriores, que nadie
      // comprobó, y además repartiría entre ellas una corrección inventada.
      const esUltimaEstacion = indice === campania.estaciones.length - 1
      if (estacion.vistaAdelante.destino.tipo === 'bm' && esUltimaEstacion) {
        cotaLlegada = cota
        bmLlegadaId = estacion.vistaAdelante.destino.bmId
      }
    } else if (estacion.vistaAdelante) {
      // La lectura no sirve todavía: el destino queda pendiente, no
      // descartado. La estación siguiente que arranque ahí debe quedar
      // pendiente también, en vez de que el motor la trate como un error.
      pendientes.add(claveDestino(estacion.vistaAdelante.destino))
    }
  })

  return { cotasInstrumento, puntos, cotaLlegada, bmLlegadaId }
}
