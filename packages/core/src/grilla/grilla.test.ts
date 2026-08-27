import { describe, expect, it } from 'vitest'
import type { Calle, ConfiguracionCierre, Estacion, Nivelacion, Toma } from '../modelo/tipos'
import { claveCelda, construirGrilla, partirClaveCelda } from './grilla'

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
    puntos: [
      { concepto: 'bordeIzq', codigo: 'BOR-I', distancia: -4.2 },
      { concepto: 'eje', codigo: 'EJE', distancia: 0 },
    ],
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
    const calle = calleDeEjemplo() // puntos: bordeIzq a -4.2, eje a 0

    // Progresivas irregulares, como salen de una obra: un buzón a los 47 m.
    const celdas = construirGrilla(calle, [0, 20, 47])

    expect(celdas).toHaveLength(6)
    expect(celdas.map((c) => c.progresiva)).toEqual([0, 0, 20, 20, 47, 47])
  })

  it('cada celda lleva la distancia real del punto en esa calle', () => {
    const celdas = construirGrilla(calleDeEjemplo(), [0])

    expect(celdas.find((c) => c.elementoClave === 'BOR-I')!.offset).toBe(-4.2)
  })

  it('las columnas salen ordenadas por distancia, no por como se escribieron', () => {
    const calle = {
      ...calleDeEjemplo(),
      puntos: [
        { concepto: 'eje' as const, codigo: 'EJE', distancia: 0 },
        { concepto: 'bordeIzq' as const, codigo: 'BOR-I', distancia: -4.2 },
        { concepto: 'bordeDer' as const, codigo: 'BOR-D', distancia: 4.2 },
      ],
    }

    expect(construirGrilla(calle, [0]).map((c) => c.elementoClave)).toEqual(['BOR-I', 'EJE', 'BOR-D'])
  })

  it('una calle sin puntos no arma ninguna celda, y no revienta', () => {
    expect(construirGrilla({ ...calleDeEjemplo(), puntos: [] }, [0, 20])).toEqual([])
  })

  it('sin progresivas medidas tampoco hay celdas', () => {
    expect(construirGrilla(calleDeEjemplo(), [])).toEqual([])
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
