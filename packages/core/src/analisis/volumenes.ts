import { redondear3 } from '../numero'

/*
 * Ojo con lo que este módulo NO mira: si la nivelación de donde salen las
 * cotas cerró. Un volumen sacado de cotas sin comprobar no está comprobado
 * (spec §3). Por eso `volumenesPorAreasMedias` recibe `comprobado` y lo
 * devuelve tal cual: decirlo en pantalla y en el PDF le toca a quien muestra o
 * exporta el resultado, igual que en `evaluarContraRasante`.
 */

/** Un punto de la sección donde se conocen las dos superficies. */
export interface PuntoEntreSuperficies {
  offset: number
  cotaArriba: number
  cotaAbajo: number
}

export interface AreasDeSeccion {
  /** m² donde la superficie de arriba queda sobre la de abajo (sobra: se corta). */
  corte: number
  /** m² donde la de arriba queda por debajo (falta: se rellena). */
  relleno: number
  /** Puntos sin número que no entraron en la cuenta; se cuentan para que nadie crea que el área está completa. */
  descartados: number
  /**
   * Quedaron menos de dos puntos válidos: el 0 m² no es «no hay movimiento de
   * tierra» sino «no se pudo calcular».
   */
  sinDatos: boolean
}

function esNumero(valor: number): boolean {
  return typeof valor === 'number' && Number.isFinite(valor)
}

/**
 * Áreas de corte y relleno entre dos superficies de una misma sección, por
 * trapecios entre puntos vecinos. Cuando las superficies se cruzan dentro de
 * un trapecio, se parte en dos triángulos en el punto de cruce: sin partirlo,
 * el corte y el relleno se cancelarían y el área saldría menor de lo que es.
 */
export function areasEntreSuperficies(puntos: PuntoEntreSuperficies[]): AreasDeSeccion {
  const validos = puntos.filter(
    (p) => esNumero(p.offset) && esNumero(p.cotaArriba) && esNumero(p.cotaAbajo),
  )
  const descartados = puntos.length - validos.length
  const ordenados = [...validos].sort((a, b) => a.offset - b.offset)

  let corte = 0
  let relleno = 0
  for (let i = 1; i < ordenados.length; i++) {
    const a = ordenados[i - 1]!
    const b = ordenados[i]!
    const ancho = b.offset - a.offset
    const d1 = a.cotaArriba - a.cotaAbajo
    const d2 = b.cotaArriba - b.cotaAbajo

    if (d1 >= 0 && d2 >= 0) {
      corte += ((d1 + d2) / 2) * ancho
    } else if (d1 <= 0 && d2 <= 0) {
      relleno += (-(d1 + d2) / 2) * ancho
    } else {
      // Signos opuestos: el cruce está donde la diferencia pasa por cero.
      const anchoHastaCruce = (d1 / (d1 - d2)) * ancho
      const anchoDesdeCruce = ancho - anchoHastaCruce
      const tri1 = (Math.abs(d1) * anchoHastaCruce) / 2
      const tri2 = (Math.abs(d2) * anchoDesdeCruce) / 2
      if (d1 > 0) {
        corte += tri1
        relleno += tri2
      } else {
        relleno += tri1
        corte += tri2
      }
    }
  }

  return {
    corte: redondear3(corte),
    relleno: redondear3(relleno),
    descartados,
    sinDatos: ordenados.length < 2,
  }
}

export interface SeccionConAreas {
  progresiva: number
  corte: number
  relleno: number
  /**
   * Puntos que la sección perdió al sacar sus áreas (el `descartados` de
   * `areasEntreSuperficies`). Viaja con la sección para que el metrado sepa
   * qué áreas salieron de una sección incompleta.
   */
  descartados?: number
}

export interface TramoDeVolumen {
  desde: number
  hasta: number
  volCorte: number
  volRelleno: number
  /**
   * Al tramo le faltan secciones: es más largo que el intervalo máximo, o
   * cruza una sección que llegó y se descartó. Su volumen se calculó igual,
   * pero es más dudoso.
   */
  hueco: boolean
}

export interface HuecoSinSeccion {
  desde: number
  hasta: number
  longitud: number
  /** 'largo': pasa del intervalo máximo. 'seccionDescartada': adentro había una sección que no entró. */
  motivo: 'largo' | 'seccionDescartada'
  /** Progresivas de las secciones descartadas que caen dentro del tramo. */
  sinSeccion: number[]
}

export interface SeccionDescartada {
  /** Posición en la lista que llegó, para poder señalarla aunque no tenga progresiva. */
  indice: number
  progresiva: number | null
  motivo: 'sin progresiva' | 'area sin numero' | 'area negativa'
}

export interface Volumenes {
  tramos: TramoDeVolumen[]
  totalCorte: number
  totalRelleno: number
  huecos: HuecoSinSeccion[]
  /** Progresivas que llegaron más de una vez; se usó la primera sección que llegó. */
  duplicadas: number[]
  /** Secciones que no entraron, con el porqué. */
  descartadas: SeccionDescartada[]
  /** Progresivas de secciones que sí entraron pero habían perdido puntos. */
  seccionesIncompletas: number[]
  /** Menos de dos secciones válidas: los totales en 0 son «no se pudo calcular». */
  sinDatos: boolean
  /** Copia de la opción: si las cotas de origen venían de una nivelación que cerró. */
  comprobado: boolean
}

export interface OpcionesVolumenes {
  /** Distancia máxima entre secciones antes de llamarla hueco. De fábrica 20 m, la separación usual de secciones. */
  intervaloMaximo?: number
  /**
   * Las cotas de origen salen de una nivelación que cerró. De fábrica false:
   * lo que nadie dijo que está comprobado, no lo está.
   */
  comprobado?: boolean
}

/**
 * Volúmenes por el método de áreas medias: entre dos secciones vecinas,
 * (A1 + A2) / 2 × distancia. Un tramo más largo que el intervalo máximo, o que
 * cruza una sección descartada, sí se calcula —es lo único que se puede hacer
 * sin inventar secciones—, pero se marca y se lista como hueco para que se
 * sepa que ese volumen es más dudoso.
 *
 * No mira si la nivelación cerró: eso llega en `opciones.comprobado` y sale
 * igual en el resultado, para que la pantalla y el PDF lo digan.
 */
export function volumenesPorAreasMedias(
  secciones: SeccionConAreas[],
  opciones: OpcionesVolumenes = {},
): Volumenes {
  const intervaloMaximo = opciones.intervaloMaximo ?? 20
  if (!(intervaloMaximo > 0) || !Number.isFinite(intervaloMaximo)) {
    throw new RangeError('El intervalo máximo entre secciones tiene que ser mayor que cero')
  }

  const validas: SeccionConAreas[] = []
  const descartadas: SeccionDescartada[] = []
  secciones.forEach((s, indice) => {
    if (!esNumero(s.progresiva)) {
      descartadas.push({ indice, progresiva: null, motivo: 'sin progresiva' })
    } else if (!esNumero(s.corte) || !esNumero(s.relleno)) {
      descartadas.push({ indice, progresiva: s.progresiva, motivo: 'area sin numero' })
    } else if (s.corte < 0 || s.relleno < 0) {
      // Un área es un tamaño: negativa restaría del metrado sin que nadie lo note.
      descartadas.push({ indice, progresiva: s.progresiva, motivo: 'area negativa' })
    } else {
      validas.push(s)
    }
  })

  // Orden estable: ante progresivas repetidas, gana la que llegó primero.
  const ordenadas = [...validas].sort((a, b) => a.progresiva - b.progresiva)
  const unicas: SeccionConAreas[] = []
  const duplicadas: number[] = []
  for (const s of ordenadas) {
    const anterior = unicas[unicas.length - 1]
    if (anterior && anterior.progresiva === s.progresiva) {
      if (!duplicadas.includes(s.progresiva)) duplicadas.push(s.progresiva)
      continue
    }
    unicas.push(s)
  }

  const seccionesIncompletas = unicas
    .filter((s) => (s.descartados ?? 0) > 0)
    .map((s) => s.progresiva)

  // Solo las descartadas que sabemos dónde iban pueden señalar un tramo.
  const progresivasPerdidas = descartadas
    .map((d) => d.progresiva)
    .filter((p): p is number => p !== null)

  const tramos: TramoDeVolumen[] = []
  const huecos: HuecoSinSeccion[] = []
  let totalCorte = 0
  let totalRelleno = 0
  for (let i = 1; i < unicas.length; i++) {
    const a = unicas[i - 1]!
    const b = unicas[i]!
    // Redondeada al milímetro: 32.2 − 12.2 da 20.000000000000004 y no es un hueco.
    const longitud = redondear3(b.progresiva - a.progresiva)
    const volCorte = redondear3(((a.corte + b.corte) / 2) * longitud)
    const volRelleno = redondear3(((a.relleno + b.relleno) / 2) * longitud)
    const sinSeccion = progresivasPerdidas
      .filter((p) => p > a.progresiva && p < b.progresiva)
      .sort((x, y) => x - y)
    const largo = longitud > intervaloMaximo
    const hueco = largo || sinSeccion.length > 0
    tramos.push({ desde: a.progresiva, hasta: b.progresiva, volCorte, volRelleno, hueco })
    if (hueco) {
      huecos.push({
        desde: a.progresiva,
        hasta: b.progresiva,
        longitud,
        motivo: largo ? 'largo' : 'seccionDescartada',
        sinSeccion,
      })
    }
    totalCorte += volCorte
    totalRelleno += volRelleno
  }

  return {
    tramos,
    totalCorte: redondear3(totalCorte),
    totalRelleno: redondear3(totalRelleno),
    huecos,
    duplicadas,
    descartadas,
    seccionesIncompletas,
    sinDatos: unicas.length < 2,
    comprobado: opciones.comprobado ?? false,
  }
}

/** Volumen suelto a partir del volumen en banco: el material removido ocupa más. */
export function esponjamiento(volumen: number, factor: number): number {
  if (!(factor > 0)) throw new RangeError('El factor de esponjamiento tiene que ser mayor que cero')
  if (!Number.isFinite(volumen)) throw new RangeError('El volumen tiene que ser un número')
  return redondear3(volumen * factor)
}

/**
 * Viajes de volquete, siempre hacia arriba: el último viaje va aunque vaya a
 * medias. Se redondea el cociente a 3 decimales antes, para que el punto
 * flotante (2.1 / 0.7 = 3.0000000000000004) no agregue un viaje que no existe.
 */
export function viajesDeVolquete(volumen: number, capacidad: number): number {
  if (!(capacidad > 0)) throw new RangeError('La capacidad del volquete tiene que ser mayor que cero')
  if (!Number.isFinite(volumen)) throw new RangeError('El volumen tiene que ser un número')
  if (volumen <= 0) return 0
  return Math.ceil(redondear3(volumen / capacidad))
}
