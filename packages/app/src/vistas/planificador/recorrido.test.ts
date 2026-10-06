import { planificarConControles } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { proyectoEjemplo } from '../../estado/ejemplo'
import {
  cotasDelPlano,
  extremosSugeridos,
  mismosVertices,
  perfilDeRasante,
  pistaCalibrada,
  pistaDeLaCalle,
} from './perfilDeLaCalle'
import { avanceHasta, lecturasAlLimite, recorridoDelPlan, type PasoGuia } from './recorrido'

// Una pista empinada con un quiebre: sube 12 % hasta 0+060 y luego 4 %.
const EMPINADA = [
  { progresiva: 0, cota: 3200 },
  { progresiva: 60, cota: 3207.2 },
  { progresiva: 140, cota: 3210.4 },
]

describe('recorridoDelPlan', () => {
  const plan = planificarConControles(EMPINADA)
  const recorrido = recorridoDelPlan(plan)

  it('lleva cada tramo de ida y luego de vuelta', () => {
    const porTramo = plan.tramos.map((t) => t.plan.estaciones.length)
    expect(recorrido.pasos).toHaveLength(2 * porTramo.reduce((a, b) => a + b, 0))
    const primerTramo = recorrido.pasos.filter((p) => p.tramo === 1)
    expect(primerTramo.slice(0, porTramo[0]).every((p) => p.sentido === 'ida')).toBe(true)
    expect(primerTramo.slice(porTramo[0]).every((p) => p.sentido === 'vuelta')).toBe(true)
  })

  it('numera estaciones y PC en toda la pista, y la vuelta repite el número del PC', () => {
    const ida = recorrido.pasos.filter((p) => p.sentido === 'ida')
    expect(ida.map((p) => p.numero)).toEqual(ida.map((_, i) => i + 1))
    expect(recorrido.totalEstaciones).toBe(ida.length)
    expect(recorrido.totalCambios).toBe(plan.tramos.reduce((s, t) => s + t.cambios, 0))
    const primerPC = ida.find((p) => p.adelante.tipo === 'cambio')!.adelante
    const enLaVuelta = recorrido.pasos.find((p) => p.sentido === 'vuelta' && p.atras.progresiva === primerPC.progresiva)
    expect(enLaVuelta?.atras.nombre).toBe(primerPC.nombre)
  })

  it('arranca en el Control 1 y avisa al llegar a cada control', () => {
    expect(recorrido.pasos[0]!.atras).toMatchObject({
      tipo: 'control',
      nombre: 'Control 1',
    })
    const llegadasDeIda = recorrido.pasos.filter((p) => p.sentido === 'ida' && p.llegaA).map((p) => p.llegaA!.nombre)
    expect(llegadasDeIda).toEqual(recorrido.nombresControl.slice(1))
    // La vuelta del primer tramo termina donde empezó.
    const finVuelta1 = recorrido.pasos.filter((p) => p.tramo === 1 && p.sentido === 'vuelta').at(-1)!
    expect(finVuelta1.llegaA?.nombre).toBe('Control 1')
  })

  it('las lecturas de cada paso son las del motor, sin rehacer cuentas', () => {
    const p = recorrido.pasos[0]!
    expect(p.atras.lectura).toBe(plan.tramos[0]!.plan.estaciones[0]!.atras.lectura)
    const e1 = plan.tramos[0]!.plan.estaciones[0]!
    expect(p.lecturas).toEqual(
      plan.tramos[0]!.plan.esperadas.filter(
        (e) =>
          e.estacion === 1 &&
          e.progresiva.toFixed(3) !== e1.atras.progresiva.toFixed(3) &&
          e.progresiva.toFixed(3) !== e1.adelante.progresiva.toFixed(3),
      ),
    )
  })

  it('no repite como intermedia la progresiva que ya se lee atrás o adelante', () => {
    // El motor da la 0+000 desde la E1, y es el mismo Control 1 de atrás.
    expect(plan.tramos[0]!.plan.esperadas.some((e) => e.estacion === 1 && e.progresiva === 0)).toBe(true)
    for (const paso of recorrido.pasos) {
      const repetidas = paso.lecturas.filter(
        (l) =>
          l.progresiva.toFixed(3) === paso.atras.progresiva.toFixed(3) ||
          l.progresiva.toFixed(3) === paso.adelante.progresiva.toFixed(3),
      )
      expect(repetidas).toEqual([])
    }
  })

  it('el avance cuenta estaciones, cambios y controles ya hechos', () => {
    expect(avanceHasta(recorrido, 0)).toEqual({
      estaciones: 0,
      cambios: 0,
      controles: 0,
    })
    const fin = avanceHasta(recorrido, recorrido.pasos.length)
    expect(fin).toEqual({
      estaciones: recorrido.totalEstaciones,
      cambios: recorrido.totalCambios,
      controles: recorrido.nombresControl.length,
    })
  })
})

describe('perfil de la calle', () => {
  it('la rasante da dos vértices entre los extremos', () => {
    const rasante = proyectoEjemplo().calles[0]!.rasante!
    const perfil = perfilDeRasante(rasante, 0, 100)
    expect(perfil).toEqual([
      { progresiva: 0, cota: 3244.85 },
      { progresiva: 100, cota: 3244.55 },
    ])
  })

  it('sin pista, los extremos salen de las progresivas de las tomas', () => {
    const calle = proyectoEjemplo().calles[0]!
    const { desde, hasta } = extremosSugeridos(calle, null)
    expect(desde).toBeLessThan(hasta)
  })

  it('sin tomas ni pista, cien metros desde el arranque', () => {
    const calle = { ...proyectoEjemplo().calles[0]!, nivelaciones: [] }
    expect(extremosSugeridos(calle, null)).toEqual({ desde: 0, hasta: 100 })
  })

  it('una pista calibrada da su largo en metros, y sin calibrar no da nada', () => {
    const pista = {
      id: 'p1',
      nombre: 'Pista',
      planoId: 'pl1',
      polilinea: [
        { x: 0, y: 0 },
        { x: 30, y: 40 },
      ],
      origen: 'croquis' as const,
      calleId: 'c1',
      progresivaInicio: 20,
    }
    const plano = {
      id: 'pl1',
      nombre: 'Plano',
      formato: 'dxf' as const,
      calibracion: { metrosPorUnidad: 2 },
    }
    const calibrada = pistaCalibrada(pista, plano)!
    const calle = { ...proyectoEjemplo().calles[0]!, nivelaciones: [] }
    expect(extremosSugeridos(calle, calibrada)).toEqual({
      desde: 20,
      hasta: 120,
    })
    expect(pistaCalibrada(pista, { ...plano, calibracion: null })).toBeNull()
    expect(pistaDeLaCalle({ ...proyectoEjemplo(), pistas: [pista] }, 'c1')).toBe(pista)
  })

  it('las cotas de un DXF se toman a lo largo de la pista', () => {
    const dxf = [
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'TEXT',
      '8',
      'COTAS',
      '10',
      '0',
      '20',
      '1',
      '30',
      '0',
      '40',
      '1',
      '1',
      '3200.00',
      '0',
      'TEXT',
      '8',
      'COTAS',
      '10',
      '50',
      '20',
      '1',
      '30',
      '0',
      '40',
      '1',
      '1',
      '3206.00',
      '0',
      'TEXT',
      '8',
      'COTAS',
      '10',
      '100',
      '20',
      '1',
      '30',
      '0',
      '40',
      '1',
      '1',
      '3208.00',
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ].join('\n')
    const plano = {
      id: 'pl1',
      nombre: 'Plano',
      formato: 'dxf' as const,
      calibracion: { metrosPorUnidad: 1 },
    }
    const pista = pistaCalibrada(
      {
        id: 'p1',
        nombre: 'Pista',
        planoId: 'pl1',
        polilinea: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        origen: 'dxf',
      },
      plano,
    )
    const cotas = cotasDelPlano(plano, new TextEncoder().encode(dxf), pista)
    expect(cotas.motivo).toBeNull()
    expect(cotas.vertices.map((v) => v.cota)).toEqual([3200, 3206, 3208])
    expect(cotasDelPlano({ ...plano, formato: 'pdf' }, new Uint8Array(), pista).motivo).toMatch(/PDF/)
    expect(cotasDelPlano(plano, undefined, pista).motivo).toMatch(/falta el archivo/)
  })

  it('mismosVertices compara al milímetro', () => {
    expect(mismosVertices([{ progresiva: 0, cota: 1 }], [{ progresiva: 0.0001, cota: 1.0002 }])).toBe(true)
    expect(mismosVertices([{ progresiva: 0, cota: 1 }], [{ progresiva: 0, cota: 1.002 }])).toBe(false)
  })
})

describe('lecturasAlLimite', () => {
  /** Un paso con las lecturas que se quieran; las marcas de límite son las del motor. */
  function paso(
    atras: number,
    adelante: number,
    marcas: { atras?: boolean; adelante?: boolean },
    intermedias: number[] = [],
  ): PasoGuia {
    const base = recorridoDelPlan(planificarConControles(EMPINADA)).pasos[0]!
    return {
      ...base,
      estacion: {
        ...base.estacion,
        alLimite: true,
        atras: {
          ...base.estacion.atras,
          lectura: atras,
          alLimite: !!marcas.atras,
        },
        adelante: {
          ...base.estacion.adelante,
          lectura: adelante,
          alLimite: !!marcas.adelante,
        },
      },
      lecturas: intermedias.map((lectura, i) => ({
        progresiva: 5 + i,
        cota: 0,
        lectura,
        estacion: 1,
      })),
    }
  }

  it('dice cuál lectura está al límite y de qué borde: la de atrás arriba de la mira', () => {
    expect(lecturasAlLimite(paso(4.68, 1.2, { atras: true }), {})).toEqual([
      {
        cual: 'atras',
        progresiva: expect.any(Number),
        lectura: 4.68,
        lado: 'maxima',
      },
    ])
  })

  it('la de adelante cerca del pie de la mira', () => {
    expect(lecturasAlLimite(paso(2, 0.32, { adelante: true }), {})).toMatchObject([
      { cual: 'adelante', lectura: 0.32, lado: 'minima' },
    ])
  })

  it('una progresiva intermedia cerca del borde, con la mira que diga el instrumento', () => {
    // Mira de 4 m: la máxima es 3.70, así que 3.68 queda al límite.
    expect(lecturasAlLimite(paso(2, 1, {}, [1.5, 3.68]), { largoMira: 4 })).toMatchObject([
      { cual: 'intermedia', progresiva: 6, lectura: 3.68, lado: 'maxima' },
    ])
  })
})
