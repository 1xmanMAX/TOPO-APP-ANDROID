import { describe, expect, it } from 'vitest'
import {
  analizarPlano,
  cotasDeLosPuntos,
  sinCotaPorque,
  textoDesnivel,
  cotaDelPunto,
  nivelesEnPlanoUsables,
  nivelesVacios,
  puntoDeSeccionEnPlano,
  puntosMedidosEnPlano,
  siguienteNombre,
  textoUbicacion,
  ubicacionEnCalles,
} from './enPlano'
import { proyectoDePrueba } from '../vistas/analisis/proyectoDePrueba'
import type { NivelesEnPlano, Proyecto, PuntoNivelPlano } from '@topo/core'
import { proyectoVacio } from '../estado/ejemplo'

const P: Proyecto = { ...proyectoVacio(), puestas: [{ id: 'r1', nombre: 'Puesta 1', cotaBM: 100, lecturaAtras: 1.5 }] }

function punto(nombre: string, x: number, y: number, lectura: number | null, salida = false): PuntoNivelPlano {
  return { id: `p${nombre}`, nombre, x, y, puestaId: 'r1', lectura, salida }
}

/** Puesta BM 100 + 1.5 → AI 101.500. Cuatro esquinas y un centro más bajo, cada 10 unidades. */
function niveles(salidaEnElCentro = false): NivelesEnPlano {
  return {
    puntos: [
      punto('1', 0, 0, 1.2),
      punto('2', 20, 0, 1.25),
      punto('3', 0, 20, 1.3),
      punto('4', 20, 20, 1.35),
      punto('5', 10, 10, 1.4, salidaEnElCentro),
    ],
    pendienteMinimaPct: 0.5,
  }
}

describe('niveles sobre el plano', () => {
  it('el punto siguiente es uno más que el mayor número', () => {
    expect(siguienteNombre([])).toBe('1')
    expect(siguienteNombre([punto('3', 0, 0, null), punto('A', 0, 0, null), punto('7', 0, 0, null)])).toBe('8')
  })

  it('sin puntos ni puestas propias: las puestas son del proyecto', () => {
    expect(nivelesVacios()).toEqual({ puntos: [], pendienteMinimaPct: 0.5 })
  })

  it('lo que viene roto del archivo se arregla, y dos veces da lo mismo', () => {
    expect(nivelesEnPlanoUsables(7)).toBeNull()
    const n = nivelesEnPlanoUsables({ puntos: [{ id: 'a', x: 1, y: 2, lectura: 'x' }, { id: 'b' }], pendienteMinimaPct: -1 })!
    expect(n.puntos).toEqual([{ id: 'a', nombre: '?', x: 1, y: 2, puestaId: null, lectura: null, salida: false }])
    expect(n.pendienteMinimaPct).toBe(0.5)
    expect(nivelesEnPlanoUsables(n)).toEqual(n)
  })

  it('la cota es AI − lectura; sin lectura no hay cota', () => {
    const n = niveles()
    expect(cotaDelPunto(P, n.puntos[0]!)).toBeCloseTo(100.3, 9)
    expect(cotaDelPunto(P, { ...n.puntos[0]!, lectura: null })).toBeNull()
  })

  it('con escala: el centro más bajo empoza; si es sumidero, todo llega a él', () => {
    const conEscala = analizarPlano(niveles(), { metrosPorUnidad: 1 }, P)
    expect(conEscala.sinEscala).toBe(false)
    expect(conEscala.resultado?.ok && conEscala.resultado.empozan).toEqual(['p5'])

    const conSumidero = analizarPlano(niveles(true), { metrosPorUnidad: 1 }, P)
    const r = conSumidero.resultado!
    if (!r.ok) throw new Error(r.error)
    expect(r.empozan).toEqual([])
    expect(r.caminos.get('p1')).toEqual({ camino: ['p1', 'p5'], fin: 'salida', hasta: 'p5' })
  })

  it('sin escala se analiza igual y se dice', () => {
    const a = analizarPlano(niveles(), null, P)
    expect(a.sinEscala).toBe(true)
    expect(a.resultado?.ok && a.resultado.empozan).toEqual(['p5'])
  })

  it('con menos de tres puntos leídos no hay análisis', () => {
    const n = niveles()
    n.puntos = n.puntos.slice(0, 2)
    expect(analizarPlano(n, { metrosPorUnidad: 1 }, P).resultado).toBeNull()
  })
})

describe('el plano y las calles', () => {
  // Una pista recta hacia el norte, 1 unidad = 1 m, enlazada a la calle de la obra de prueba.
  const pista = {
    id: 'pi',
    nombre: 'Pista',
    polilinea: [{ x: 0, y: 0 }, { x: 0, y: 100 }],
    calibracion: { metrosPorUnidad: 1, ejeY: 'arriba' as const },
    progresivaInicio: 0,
    calleId: 'c-1',
  }

  it('un punto del plano dice en qué calle, progresiva y lado está', () => {
    const proyecto = proyectoDePrueba()
    const u = ubicacionEnCalles({ x: -3, y: 40 }, [pista], proyecto.calles)!
    expect(u.calle).toBe('Jr. Prueba')
    expect(u.progresiva).toBeCloseTo(40, 6)
    expect(u.desplazamiento).toBeCloseTo(-3, 6)
    expect(textoUbicacion(u)).toBe('Jr. Prueba 0+040, 3.0 m izq.')
    expect(ubicacionEnCalles({ x: 80, y: 40 }, [pista], proyecto.calles)).toBeNull()
  })

  it('un punto de la sección cae a su lado: la izquierda, mirando el avance, al oeste', () => {
    const izq = puntoDeSeccionEnPlano(pista, 40, -3)!
    expect(izq.x).toBeCloseTo(-3, 9)
    expect(izq.y).toBeCloseTo(40, 9)
    expect(puntoDeSeccionEnPlano(pista, 40, 3)!.x).toBeCloseTo(3, 9)
  })

  it('lo medido en la libreta aparece en el plano con las cotas de Revisar, sin escribirlo otra vez', () => {
    const proyecto = proyectoDePrueba()
    const medidos = puntosMedidosEnPlano(proyecto, [pista], 'cap-sub')
    expect(medidos).toHaveLength(9)
    const eje0 = medidos.find((m) => m.nombre === 'Jr. Prueba 0+000 EJE')!
    expect(eje0).toMatchObject({ x: 0, y: 0 })
    expect(eje0.cota).toBeCloseTo(100.003, 6)
    // Y entra al análisis del agua junto con los puntos del plano.
    const a = analizarPlano({ puntos: [], pendienteMinimaPct: 0.5 }, { metrosPorUnidad: 1 }, proyecto, medidos)
    expect(a.resultado?.ok).toBe(true)
  })
})

describe('cotas por BM y por relación entre puntos', () => {
  const conBM: Proyecto = { ...P, bms: [{ id: 'bm1', nombre: 'BM-1', cota: 3245.18, tipo: 'oficial', descripcion: '' }] }

  it('un punto puesto sobre un BM toma su cota, y la sigue si se corrige', () => {
    const n: NivelesEnPlano = { puntos: [{ ...punto('B', 0, 0, null), origen: 'bm', bmId: 'bm1' }], pendienteMinimaPct: 0.5 }
    expect(cotasDeLosPuntos(n, conBM).get('pB')).toBeCloseTo(3245.18, 9)
    const corregido = { ...conBM, bms: [{ ...conBM.bms[0]!, cota: 3245.2 }] }
    expect(cotasDeLosPuntos(n, corregido).get('pB')).toBeCloseTo(3245.2, 9)
  })

  it('«el 2 está 0.35 m más abajo que el BM» y «el 3, 0.10 más arriba que el 2»: en cadena', () => {
    const n: NivelesEnPlano = {
      puntos: [
        { ...punto('B', 0, 0, null), origen: 'bm', bmId: 'bm1' },
        { ...punto('2', 10, 0, null), origen: 'relacion', relacion: { desdeId: 'pB', desnivel: -0.35 } },
        { ...punto('3', 20, 0, null), origen: 'relacion', relacion: { desdeId: 'p2', desnivel: 0.1 } },
      ],
      pendienteMinimaPct: 0.5,
    }
    const c = cotasDeLosPuntos(n, conBM)
    expect(c.get('p2')).toBeCloseTo(3244.83, 9)
    expect(c.get('p3')).toBeCloseTo(3244.93, 9)
  })

  it('una cadena que vuelve sobre sí misma no cuelga: esos puntos quedan sin cota, y se dice por qué', () => {
    const n: NivelesEnPlano = {
      puntos: [
        { ...punto('A', 0, 0, null), origen: 'relacion', relacion: { desdeId: 'pB', desnivel: 1 } },
        { ...punto('B', 1, 0, null), origen: 'relacion', relacion: { desdeId: 'pA', desnivel: -1 } },
      ],
      pendienteMinimaPct: 0.5,
    }
    const c = cotasDeLosPuntos(n, P)
    expect(c.size).toBe(0)
    expect(sinCotaPorque(n.puntos[0]!, n, P, c)).toMatch(/falta la cota de B/)
  })

  it('las relaciones entran al análisis del agua junto con las lecturas', () => {
    const n: NivelesEnPlano = {
      puntos: [
        punto('1', 0, 0, 1.2),
        punto('2', 20, 0, 1.25),
        { ...punto('3', 0, 20, null), origen: 'relacion', relacion: { desdeId: 'p1', desnivel: -0.1 } },
      ],
      pendienteMinimaPct: 0.5,
    }
    const a = analizarPlano(n, null, P)
    expect(a.cotas.get('p3')).toBeCloseTo(100.2, 9)
    expect(a.resultado?.ok).toBe(true)
  })

  it('el desnivel en palabras', () => {
    expect(textoDesnivel(0.35)).toBe('0.350 m más arriba')
    expect(textoDesnivel(-0.1204)).toBe('0.120 m más abajo')
    expect(textoDesnivel(0.0001)).toBe('a la misma altura')
  })

  it('el .topo guarda el origen de la cota; lo que no sirve se descarta', () => {
    const n = nivelesEnPlanoUsables({
      puntos: [
        { id: 'a', x: 0, y: 0, origen: 'bm', bmId: 'bm1' },
        { id: 'b', x: 0, y: 0, origen: 'relacion', relacion: { desdeId: 'a', desnivel: -0.2 } },
        { id: 'c', x: 0, y: 0, origen: 'relacion', relacion: { desdeId: 'a', desnivel: 'x' } },
      ],
    })!
    expect(n.puntos[0]).toMatchObject({ origen: 'bm', bmId: 'bm1' })
    expect(n.puntos[1]).toMatchObject({ origen: 'relacion', relacion: { desdeId: 'a', desnivel: -0.2 } })
    expect('origen' in n.puntos[2]!).toBe(false)
  })
})
