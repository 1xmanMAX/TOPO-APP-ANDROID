import { formatearProgresiva, type BM, type DestinoLectura, type Toma } from '@topo/core'

/** Un paso del recorrido de la nivelación, tal como se dibuja: BM → estaciones → puntos de cambio → BM. */
export interface PasoRecorrido {
  tipo: 'bm' | 'estacion' | 'cambio' | 'punto' | 'falta'
  nombre: string
  /** Índice de la estación (desde 0) para los pasos de tipo estación. */
  estacionIndice?: number
}

function nombreDestino(destino: DestinoLectura, bms: BM[]): string {
  switch (destino.tipo) {
    case 'bm':
      return bms.find((bm) => bm.id === destino.bmId)?.nombre ?? 'BM borrado'
    case 'cambio':
      return destino.nombre
    case 'celda':
      return formatearProgresiva(destino.celda.progresiva)
    case 'suelto':
      return destino.punto.etiqueta
  }
}

function pasoDe(destino: DestinoLectura, bms: BM[]): PasoRecorrido {
  const tipo = destino.tipo === 'bm' ? 'bm' : destino.tipo === 'cambio' ? 'cambio' : 'punto'
  return { tipo, nombre: nombreDestino(destino, bms) }
}

/**
 * El recorrido de la toma para dibujarlo: de dónde arrancó cada estación y a
 * dónde llegó. Una estación que arranca en algo distinto de donde llegó la
 * anterior (otro BM: un circuito nuevo) también lo muestra. Si el circuito
 * es cerrado o de enlace y la última estación todavía no visó su BM, el
 * último paso es «falta», con el nombre del BM que se espera.
 */
export function armarRecorrido(toma: Toma, bms: BM[]): PasoRecorrido[] {
  const pasos: PasoRecorrido[] = []
  toma.estaciones.forEach((estacion, indice) => {
    const arranque = pasoDe(estacion.vistaAtras.destino, bms)
    const anterior = pasos[pasos.length - 1]
    if (!anterior || anterior.nombre !== arranque.nombre || anterior.tipo !== arranque.tipo) pasos.push(arranque)
    pasos.push({ tipo: 'estacion', nombre: `E${indice + 1}`, estacionIndice: indice })
    if (estacion.vistaAdelante) pasos.push(pasoDe(estacion.vistaAdelante.destino, bms))
  })

  const ultima = toma.estaciones[toma.estaciones.length - 1]
  if (toma.cierre.tipo !== 'abierto' && (!ultima || ultima.vistaAdelante?.destino.tipo !== 'bm')) {
    const bmFinal = bms.find((bm) => bm.id === toma.cierre.bmFinalId)
    pasos.push({ tipo: 'falta', nombre: bmFinal?.nombre ?? 'BM de cierre' })
  }
  return pasos
}
