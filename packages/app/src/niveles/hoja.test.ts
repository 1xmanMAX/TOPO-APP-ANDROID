import { separacionEntreLineas, type HojaNiveles } from '@topo/core'
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

/** El ejemplo que trae su HTML: puesta BM 100, atrás 1.5 → AI 101.500. */
function hojaDeEjemplo(): HojaNiveles {
  return {
    puestas: [{ id: 'r1', nombre: 'Puesta 1', cotaBM: 100, lecturaAtras: 1.5 }],
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
  it('una hoja nueva parte del primer BM del proyecto', () => {
    const hoja = hojaVacia([{ id: 'b', nombre: 'BM-1', cota: 3245.18, tipo: 'oficial', descripcion: '' }])
    expect(hoja.puestas).toHaveLength(1)
    expect(hoja.puestas[0]).toMatchObject({ cotaBM: 3245.18, lecturaAtras: 1.5 })
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
    expect(arreglada.puestas).toEqual([{ id: 'p', nombre: 'Puesta', cotaBM: 10, lecturaAtras: 0 }])
    expect(arreglada.conjuntos).toEqual([
      { id: 'c', nombre: 'Conjunto', categoria: '', tipo: 'lectura', texto: '0, 1.2', puestaId: null, ajusteCm: 0 },
    ])
    expect(arreglada.unidad).toBe('m')
    expect(hojaUsable(arreglada)).toEqual(arreglada)
  })

  it('las lecturas salen como en su HTML: Z = AI − L, y el ajuste sube la línea entera', () => {
    const hoja = hojaDeEjemplo()
    const vereda = lineasDeLaHoja(hoja).get('vi')!.linea
    expect(vereda.puntos.map((p) => p.cota)).toEqual([100.25, 100.24, 100.225, 100.21, 100.2].map((v) => expect.closeTo(v, 9)))

    hoja.conjuntos[0]!.ajusteCm = 2
    expect(lineasDeLaHoja(hoja).get('vi')!.linea.puntos[0]!.cota).toBeCloseTo(100.27, 9)
    expect(lineasDeLaHoja(hoja).get('vi')!.linea.nombre).toBe('Vereda izquierda (+2 cm)')
  })

  it('en cm y con la mira invertida', () => {
    const hoja = hojaDeEjemplo()
    hoja.unidad = 'cm'
    hoja.conjuntos[0]!.texto = '0, 125'
    expect(lineasDeLaHoja(hoja).get('vi')!.linea.puntos[0]!.cota).toBeCloseTo(100.25, 9)
    hoja.mira = 'invertida'
    expect(lineasDeLaHoja(hoja).get('vi')!.linea.puntos[0]!.cota).toBeCloseTo(102.75, 9)
  })

  it('la separación vereda / base da lo mismo que su herramienta: 19.0 cm en la progresiva 30', () => {
    const lineas = lineasDeLaHoja(hojaDeEjemplo())
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

  it('las gráficas de entrada comparan la primera con la segunda línea', () => {
    expect(panelesPorDefecto(hojaDeEjemplo())[0]).toEqual({ superiorId: 'vi', inferiorId: 'bi', modo: 'separacion' })
  })
})
