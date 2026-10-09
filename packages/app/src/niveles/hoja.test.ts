import { separacionEntreLineas, type HojaNiveles, type Proyecto } from '@topo/core'
import { proyectoVacio } from '../estado/ejemplo'
import { proyectoDePrueba } from '../vistas/analisis/proyectoDePrueba'
import { describe, expect, it } from 'vitest'
import {
  corteYRelleno,
  hojaUsable,
  hojaVacia,
  lineasDeLaHoja,
  panelesPorDefecto,
  textoCorteRelleno,
  textoDeCotas,
  textoPorPendiente,
} from './hoja'

/** Las lecturas cada 10 m, como `lines()` del HTML de Max. */
function lecturas(valores: number[]): string {
  return valores.map((v, i) => `${i * 10}, ${v.toFixed(3)}`).join('\n')
}

/** El proyecto con la puesta de su HTML: BM 100 (escrito), atrás 1.5 → AI 101.500. */
function proyectoConPuesta(): Proyecto {
  return { ...proyectoVacio(), puestas: [{ id: 'r1', nombre: 'Puesta 1', cotaBM: 100, lecturaAtras: 1.5 }] }
}
const P = proyectoConPuesta()

/** El ejemplo que trae su HTML. */
function hojaDeEjemplo(): HojaNiveles {
  return {
    conjuntos: [
      { id: 'vi', nombre: 'Vereda izquierda', categoria: 'Vereda', tipo: 'lectura', puestaId: 'r1', ajusteCm: 0, texto: lecturas([1.25, 1.26, 1.275, 1.29, 1.3]) },
      { id: 'bi', nombre: 'Base izquierda', categoria: 'Base', tipo: 'lectura', puestaId: 'r1', ajusteCm: 0, texto: lecturas([1.45, 1.455, 1.47, 1.48, 1.49]) },
    ],
    unidad: 'm',
    mira: 'normal',
    minimoCm: 5,
  }
}

describe('hoja de niveles', () => {
  it('una hoja nueva no trae puestas propias: son del proyecto', () => {
    const hoja = hojaVacia()
    expect(hoja.puestas).toBeUndefined()
    expect(hoja.conjuntos).toEqual([])
  })

  it('lo que no es una hoja se descarta; dentro se completa lo que falte, y pasar dos veces deja lo mismo', () => {
    expect(hojaUsable('basura')).toBeNull()
    expect(hojaUsable(null)).toBeNull()
    const arreglada = hojaUsable({
      puestas: [{ id: 'p', cotaBM: 10 }, { sinId: true }],
      conjuntos: [{ id: 'c', texto: '0, 1.2', tipo: 'raro' }, 'no'],
      unidad: 'pulgadas',
    })!
    // Las puestas viejas se conservan para que la migración las pase al proyecto.
    expect(arreglada.puestas).toEqual([{ id: 'p', nombre: 'Puesta', cotaBM: 10, lecturaAtras: 0 }])
    expect(arreglada.conjuntos).toEqual([
      { id: 'c', nombre: 'Conjunto', categoria: '', tipo: 'lectura', texto: '0, 1.2', puestaId: null, ajusteCm: 0 },
    ])
    expect(arreglada.unidad).toBe('m')
    expect(hojaUsable(arreglada)).toEqual(arreglada)
  })

  it('las lecturas salen como en su HTML: Z = AI − L, y el ajuste sube la línea entera', () => {
    const hoja = hojaDeEjemplo()
    const vereda = lineasDeLaHoja(hoja, P, 'c').get('vi')!.linea
    expect(vereda.puntos.map((p) => p.cota)).toEqual([100.25, 100.24, 100.225, 100.21, 100.2].map((v) => expect.closeTo(v, 9)))

    hoja.conjuntos[0]!.ajusteCm = 2
    expect(lineasDeLaHoja(hoja, P, 'c').get('vi')!.linea.puntos[0]!.cota).toBeCloseTo(100.27, 9)
    expect(lineasDeLaHoja(hoja, P, 'c').get('vi')!.linea.nombre).toBe('Vereda izquierda (+2 cm)')
  })

  it('en cm y con la mira invertida', () => {
    const hoja = hojaDeEjemplo()
    hoja.unidad = 'cm'
    hoja.conjuntos[0]!.texto = '0, 125'
    expect(lineasDeLaHoja(hoja, P, 'c').get('vi')!.linea.puntos[0]!.cota).toBeCloseTo(100.25, 9)
    hoja.mira = 'invertida'
    expect(lineasDeLaHoja(hoja, P, 'c').get('vi')!.linea.puntos[0]!.cota).toBeCloseTo(102.75, 9)
  })

  it('la separación vereda / base da lo mismo que su herramienta: 19.0 cm en la progresiva 30', () => {
    const lineas = lineasDeLaHoja(hojaDeEjemplo(), P, 'c')
    const r = separacionEntreLineas(lineas.get('vi')!.linea, lineas.get('bi')!.linea, 0.05)
    expect(r.ok && r.critico.progresiva).toBe(30)
    expect(r.ok && r.critico.separacion).toBeCloseTo(0.19, 9)
    expect(r.ok && r.cumple).toBe(true)
  })

  it('un replanteo por pendiente pone un punto cada tanto y siempre el último', () => {
    expect(textoPorPendiente({ desde: 0, hasta: 25, cada: 10, cotaInicial: 100, pendientePct: -2 })).toBe(
      '0+000, 100.000\n0+010, 99.800\n0+020, 99.600\n0+025, 99.500',
    )
    expect(textoPorPendiente({ desde: 0, hasta: 10, cada: 0, cotaInicial: 100, pendientePct: 0 })).toBe('')
    expect(textoPorPendiente({ desde: 20, hasta: 10, cada: 5, cotaInicial: 100, pendientePct: 0 })).toBe('')
  })

  it('una línea se reescribe como cotas', () => {
    expect(textoDeCotas([{ progresiva: 20, cota: 3244.1234 }])).toBe('0+020, 3244.123')
  })

  it('corte y relleno: lo que hay contra el replanteo, con el mayor de cada uno', () => {
    const hay = { nombre: 'Hay', puntos: [0, 10, 20].map((x, i) => ({ progresiva: x, cota: [100.25, 100.24, 100.225][i]!, comprobado: false })) }
    const debe = { nombre: 'Replanteo', puntos: [{ progresiva: 0, cota: 100.23, comprobado: false }, { progresiva: 20, cota: 100.23, comprobado: false }] }
    const r = corteYRelleno(hay, debe)!
    expect(r.puntos.map((p) => Math.round(p.diferencia * 1000))).toEqual([20, 10, -5])
    expect(r.mayorCorte?.progresiva).toBe(0)
    expect(r.mayorRelleno?.progresiva).toBe(20)
    expect(textoCorteRelleno(0.02)).toBe('corta 2.0 cm')
    expect(textoCorteRelleno(-0.005)).toBe('rellena 0.5 cm')
    expect(textoCorteRelleno(0.0001)).toBe('en cota')
  })

  it('sin superponerse no hay corte ni relleno', () => {
    const a = { nombre: 'A', puntos: [{ progresiva: 0, cota: 1, comprobado: false }, { progresiva: 10, cota: 1, comprobado: false }] }
    const b = { nombre: 'B', puntos: [{ progresiva: 20, cota: 1, comprobado: false }, { progresiva: 30, cota: 1, comprobado: false }] }
    expect(corteYRelleno(a, b)).toBeNull()
  })

  it('un conjunto «medido» sigue a la libreta: si se corrige una lectura, la línea cambia', () => {
    const proyecto = proyectoDePrueba()
    const hoja: HojaNiveles = {
      conjuntos: [{ id: 'm', nombre: 'Sub eje', categoria: 'Subrasante', tipo: 'medido', capaId: 'cap-sub', puntoId: 'p-eje', texto: '', puestaId: null, ajusteCm: 0 }],
      unidad: 'm',
      mira: 'normal',
      minimoCm: 5,
    }
    // Compensada: 100.003 en la 0+000.
    expect(lineasDeLaHoja(hoja, proyecto, 'c-1').get('m')!.linea.puntos[0]!.cota).toBeCloseTo(100.003, 6)
    // Se corrige la lectura del eje en 0+000 (1.500 → 1.490): sube 1 cm, sin volver a traer nada.
    const toma = proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!
    const lectura = toma.estaciones[0]!.intermedias.find((l) => l.destino.tipo === 'celda' && l.destino.celda.progresiva === 0 && l.destino.celda.elementoClave === 'p-eje')!
    lectura.valor = 1.49
    expect(lineasDeLaHoja(hoja, proyecto, 'c-1').get('m')!.linea.puntos[0]!.cota).toBeCloseTo(100.013, 6)
  })

  it('un replanteo «derivado» sigue a su línea más su ajuste, y una cadena que vuelve sobre sí misma no cuelga', () => {
    const hoja = hojaDeEjemplo()
    hoja.conjuntos.push({ id: 'r', nombre: 'Replanteo', categoria: 'Replanteo', tipo: 'derivado', origenId: 'vi', texto: '', puestaId: null, ajusteCm: -2 })
    expect(lineasDeLaHoja(hoja, P, 'c').get('r')!.linea.puntos[0]!.cota).toBeCloseTo(100.23, 9)
    hoja.conjuntos[0]!.texto = '0, 1.150'
    expect(lineasDeLaHoja(hoja, P, 'c').get('r')!.linea.puntos[0]!.cota).toBeCloseTo(100.33, 9)

    hoja.conjuntos.push({ id: 'a', nombre: 'A', categoria: '', tipo: 'derivado', origenId: 'b', texto: '', puestaId: null, ajusteCm: 0 })
    hoja.conjuntos.push({ id: 'b', nombre: 'B', categoria: '', tipo: 'derivado', origenId: 'a', texto: '', puestaId: null, ajusteCm: 0 })
    const lineas = lineasDeLaHoja(hoja, P, 'c')
    expect(lineas.get('a')!.linea.puntos).toEqual([])
    expect(lineas.get('b')!.avisos.join(' ') + lineas.get('a')!.avisos.join(' ')).toMatch(/sigue a una línea que lo sigue/)
  })

  it('una puesta enlazada a un BM sigue su cota si se corrige', () => {
    const proyecto: Proyecto = {
      ...proyectoVacio(),
      bms: [{ id: 'bm', nombre: 'BM-1', cota: 100, tipo: 'auxiliar', descripcion: '' }],
      puestas: [{ id: 'r1', nombre: 'Puesta 1', cotaBM: 0, lecturaAtras: 1.5, bmId: 'bm' }],
    }
    const hoja = hojaDeEjemplo()
    expect(lineasDeLaHoja(hoja, proyecto, 'c').get('vi')!.linea.puntos[0]!.cota).toBeCloseTo(100.25, 9)
    proyecto.bms[0]!.cota = 100.1
    expect(lineasDeLaHoja(hoja, proyecto, 'c').get('vi')!.linea.puntos[0]!.cota).toBeCloseTo(100.35, 9)
  })

  it('las gráficas de entrada comparan la primera con la segunda línea', () => {
    expect(panelesPorDefecto(hojaDeEjemplo())[0]).toEqual({ superiorId: 'vi', inferiorId: 'bi', modo: 'separacion' })
  })
})
