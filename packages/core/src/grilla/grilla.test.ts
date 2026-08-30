import { describe, expect, it } from 'vitest'
import type { Calle, ConfiguracionCierre, Estacion, Lectura, Nivelacion, Toma } from '../modelo/tipos'
import { claveCelda, construirGrilla, partirClaveCelda, progresivasMedidas } from './grilla'

describe('claveCelda', () => {
  it('combina progresiva y elemento', () => {
    expect(claveCelda(20, 'EJE')).toBe('20|EJE')
  })

  it('normaliza decimales para que la clave sea estable', () => {
    expect(claveCelda(20.0, 'EJE')).toBe(claveCelda(20, 'EJE'))
    expect(claveCelda(47.25, 'EJE')).toBe('47.25|EJE')
  })
})

describe('partirClaveCelda', () => {
  it('devuelve la progresiva y el elemento', () => {
    expect(partirClaveCelda('20|EJE')).toEqual({ progresiva: 20, elementoClave: 'EJE' })
  })

  it('admite progresivas con decimales', () => {
    expect(partirClaveCelda('47.25|BOR-I')).toEqual({ progresiva: 47.25, elementoClave: 'BOR-I' })
  })

  it('admite una clave de elemento que contiene el separador', () => {
    expect(partirClaveCelda('20|A|B')).toEqual({ progresiva: 20, elementoClave: 'A|B' })
  })

  it('devuelve null si no se entiende', () => {
    expect(partirClaveCelda('sin-separador')).toBeNull()
    expect(partirClaveCelda('abc|EJE')).toBeNull()
    expect(partirClaveCelda('')).toBeNull()
  })

  it('deshace lo que hace claveCelda', () => {
    for (const [progresiva, elemento] of [[0, 'EJE'], [47.25, 'VER-I'], [1000, 'PA-D']] as const) {
      expect(partirClaveCelda(claveCelda(progresiva, elemento))).toEqual({
        progresiva,
        elementoClave: elemento,
      })
    }
  })
})

/** Calle mínima: borde izquierdo a -4.2 y eje a 0, sin nivelaciones todavía. */
function calleDeEjemplo(): Calle {
  return {
    id: 'c-1',
    nombre: 'Av. Sol',
    seccion: {
      puntos: [
        {
          id: 'p-borde-i', rol: 'bordeCalzada', nombre: 'Borde izquierdo',
          distancia: -4.2, distanciaDeFabrica: false, palabras: ['BOR-I'],
        },
        {
          id: 'p-eje', rol: 'eje', nombre: 'Eje',
          distancia: 0, distanciaDeFabrica: false, palabras: ['EJE'],
        },
      ],
      palabrasProgresiva: [],
      palabrasPuntoControl: [],
      palabrasReferencia: [],
    },
    nivelaciones: [],
    rasante: null,
  }
}

function cierreDeEjemplo(): ConfiguracionCierre {
  return {
    tipo: 'abierto',
    longitudK: 0,
    longitudKAuto: true,
    clase: 'tercerOrden',
    coeficiente: 12,
  }
}

function estacionDeEjemplo(id: string, progresiva: number): Estacion {
  return {
    id,
    vistaAtras: { id: `${id}-va`, destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.5 },
    intermedias: [
      {
        id: `${id}-i1`,
        destino: { tipo: 'celda', celda: { progresiva, elementoClave: 'EJE' } },
        valor: 1.2,
      },
    ],
  }
}

function tomaDel20(): Toma {
  return {
    id: 'toma-20',
    fecha: '2026-08-20',
    capaId: 'cap-1',
    bmInicialId: 'bm-1',
    estaciones: [estacionDeEjemplo('e-20', 0)],
    cierre: cierreDeEjemplo(),
  }
}

function tomaDel21(): Toma {
  return {
    id: 'toma-21',
    fecha: '2026-08-21',
    capaId: 'cap-1',
    bmInicialId: 'pc-1',
    estaciones: [estacionDeEjemplo('e-21', 100)],
    cierre: cierreDeEjemplo(),
  }
}

describe('construirGrilla', () => {
  it('la grilla sale de las progresivas medidas, no de un intervalo inventado', () => {
    const calle = calleDeEjemplo() // seccion.puntos: borde izquierdo a -4.2, eje a 0

    // Progresivas irregulares, como salen de una obra: un buzón a los 47 m.
    const celdas = construirGrilla(calle, [0, 20, 47])

    expect(celdas).toHaveLength(6)
    expect(celdas.map((c) => c.progresiva)).toEqual([0, 0, 20, 20, 47, 47])
  })

  it('cada celda lleva la distancia real del punto en esa calle', () => {
    const celdas = construirGrilla(calleDeEjemplo(), [0])

    expect(celdas.find((c) => c.elementoClave === 'p-borde-i')!.offset).toBe(-4.2)
  })

  it('las columnas salen ordenadas por distancia, no por como se escribieron', () => {
    const calle = {
      ...calleDeEjemplo(),
      seccion: {
        ...calleDeEjemplo().seccion,
        puntos: [
          {
            id: 'p-eje', rol: 'eje' as const, nombre: 'Eje',
            distancia: 0, distanciaDeFabrica: false, palabras: ['EJE'],
          },
          {
            id: 'p-borde-i', rol: 'bordeCalzada' as const, nombre: 'Borde izquierdo',
            distancia: -4.2, distanciaDeFabrica: false, palabras: ['BOR-I'],
          },
          {
            id: 'p-borde-d', rol: 'bordeCalzada' as const, nombre: 'Borde derecho',
            distancia: 4.2, distanciaDeFabrica: false, palabras: ['BOR-D'],
          },
        ],
      },
    }

    expect(construirGrilla(calle, [0]).map((c) => c.elementoClave)).toEqual(['p-borde-i', 'p-eje', 'p-borde-d'])
  })

  it('una calle sin puntos no arma ninguna celda, y no revienta', () => {
    const calle = { ...calleDeEjemplo(), seccion: { ...calleDeEjemplo().seccion, puntos: [] } }

    expect(construirGrilla(calle, [0, 20])).toEqual([])
  })

  it('sin progresivas medidas tampoco hay celdas', () => {
    expect(construirGrilla(calleDeEjemplo(), [])).toEqual([])
  })
})

/** Lectura mínima hacia una celda, para armar estaciones a medida en cada prueba. */
function lecturaACelda(id: string, progresiva: number, elementoClave = 'EJE'): Lectura {
  return { id, destino: { tipo: 'celda', celda: { progresiva, elementoClave } }, valor: 1.5 }
}

function lecturaABm(id: string, bmId = 'bm-1'): Lectura {
  return { id, destino: { tipo: 'bm', bmId }, valor: 1.5 }
}

describe('progresivasMedidas', () => {
  it('sin estaciones no hay progresivas', () => {
    expect(progresivasMedidas([])).toEqual([])
  })

  it('recoge las progresivas de las lecturas intermedias', () => {
    const estaciones: Estacion[] = [
      {
        id: 'e-1',
        vistaAtras: lecturaABm('l-va'),
        intermedias: [lecturaACelda('l-1', 20), lecturaACelda('l-2', 0)],
      },
    ]

    expect(progresivasMedidas(estaciones)).toEqual([0, 20])
  })

  it('deduplica progresivas medidas más de una vez', () => {
    const estaciones: Estacion[] = [
      {
        id: 'e-1',
        vistaAtras: lecturaABm('l-va'),
        // Dos puntos distintos de la calle, misma progresiva: 0 debe salir una sola vez.
        intermedias: [lecturaACelda('l-1', 0, 'EJE'), lecturaACelda('l-2', 0, 'BOR-I')],
      },
    ]

    expect(progresivasMedidas(estaciones)).toEqual([0])
  })

  it('devuelve las progresivas ordenadas, aunque se hayan medido en otro orden', () => {
    const estaciones: Estacion[] = [
      {
        id: 'e-1',
        vistaAtras: lecturaABm('l-va'),
        intermedias: [lecturaACelda('l-1', 47), lecturaACelda('l-2', 3), lecturaACelda('l-3', 20)],
      },
    ]

    expect(progresivasMedidas(estaciones)).toEqual([3, 20, 47])
  })

  it('incluye la progresiva de la vista atrás cuando cae en una celda', () => {
    const estaciones: Estacion[] = [
      {
        id: 'e-1',
        vistaAtras: lecturaACelda('l-va', 5),
        intermedias: [lecturaACelda('l-1', 10)],
      },
    ]

    expect(progresivasMedidas(estaciones)).toEqual([5, 10])
  })

  it('incluye la progresiva de la vista adelante cuando cae en una celda', () => {
    const estaciones: Estacion[] = [
      {
        id: 'e-1',
        vistaAtras: lecturaABm('l-va'),
        intermedias: [lecturaACelda('l-1', 10)],
        vistaAdelante: lecturaACelda('l-vd', 15),
      },
    ]

    expect(progresivasMedidas(estaciones)).toEqual([10, 15])
  })

  it('ignora las lecturas que no apuntan a una celda (BM, cambio o punto suelto)', () => {
    const estaciones: Estacion[] = [
      {
        id: 'e-1',
        vistaAtras: lecturaABm('l-va'),
        intermedias: [
          { id: 'l-1', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 1.2 },
          { id: 'l-2', destino: { tipo: 'suelto', punto: { etiqueta: 'BZ-1', offset: 3, notas: '' } }, valor: 1.1 },
        ],
        vistaAdelante: lecturaABm('l-vd', 'bm-2'),
      },
    ]

    expect(progresivasMedidas(estaciones)).toEqual([])
  })

  it('junta y ordena las progresivas de varias estaciones a la vez', () => {
    const estaciones: Estacion[] = [
      {
        id: 'e-1',
        vistaAtras: lecturaABm('l-va-1'),
        intermedias: [lecturaACelda('l-1', 40), lecturaACelda('l-2', 0)],
        vistaAdelante: { id: 'l-vd-1', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 1.5 },
      },
      {
        id: 'e-2',
        vistaAtras: { id: 'l-va-2', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 1.5 },
        // 40 se repite entre estaciones y debe seguir apareciendo una sola vez.
        intermedias: [lecturaACelda('l-3', 40), lecturaACelda('l-4', 60)],
      },
    ]

    expect(progresivasMedidas(estaciones)).toEqual([0, 40, 60])
  })
})

describe('Nivelacion', () => {
  it('una nivelación agrupa varias tomas y conserva sus lecturas', () => {
    const n: Nivelacion = {
      id: 'niv-1',
      nombre: 'Terreno existente',
      color: '#2563eb',
      tomas: [tomaDel20(), tomaDel21()],
    }

    expect(n.tomas).toHaveLength(2)
    expect(n.tomas[0]!.estaciones).toEqual(tomaDel20().estaciones)
  })
})
