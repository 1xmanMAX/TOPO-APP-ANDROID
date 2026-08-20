import { claveCelda } from '../grilla/grilla'
import type { BM, Campania, DestinoLectura } from '../modelo/tipos'

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

  const cotasInstrumento: number[] = []
  const puntos: PuntoCalculado[] = []
  let cotaLlegada: number | null = null

  campania.estaciones.forEach((estacion, indice) => {
    const clavePartida = claveDestino(estacion.vistaAtras.destino)
    const cotaPartida = cotasConocidas.get(clavePartida)

    if (cotaPartida === undefined) {
      const nombre =
        estacion.vistaAtras.destino.tipo === 'cambio'
          ? estacion.vistaAtras.destino.nombre
          : clavePartida
      throw new Error(`La estación ${indice + 1} arranca en ${nombre}, que no fue medido antes`)
    }

    const cotaInstrumento = cotaPartida + estacion.vistaAtras.valor
    cotasInstrumento.push(cotaInstrumento)

    for (const lectura of estacion.intermedias) {
      puntos.push({
        claveDestino: claveDestino(lectura.destino),
        destino: lectura.destino,
        estacionIndice: indice,
        lectura: lectura.valor,
        cotaInstrumento,
        cotaCruda: cotaInstrumento - lectura.valor,
      })
    }

    if (estacion.vistaAdelante) {
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
      if (estacion.vistaAdelante.destino.tipo === 'bm') cotaLlegada = cota
    }
  })

  return { cotasInstrumento, puntos, cotaLlegada }
}
