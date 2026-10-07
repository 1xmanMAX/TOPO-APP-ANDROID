import { describe, expect, it } from 'vitest'
import { proyectoDePrueba } from '../analisis/proyectoDePrueba'
import {
  capaEncima,
  capasMedidas,
  contraProyecto,
  desplazamientoSugerido,
  lineaElegida,
  lineasDeLaCalle,
  progresivasDeLaCalle,
  puestaDesdeBM,
  puntosDeIzquierdaADerecha,
} from './lineas'

/*
 * Con la obra de prueba de Análisis: subrasante cerrada con −6 mm
 * (compensada +3 mm en E1 y +6 mm en E2) y base cerrada en 0 mm.
 * Subrasante en el borde izquierdo: 99.943, 99.913, 99.886.
 */
describe('niveles: pegamento con el motor', () => {
  const proyecto = proyectoDePrueba()
  const calle = proyecto.calles[0]!

  it('las capas medidas van de abajo arriba y solo las que tienen tomas', () => {
    expect(capasMedidas(calle, proyecto.capas).map((c) => c.nombre)).toEqual(['SUBRASANTE', 'BASE'])
  })

  it('los puntos van de izquierda a derecha y las progresivas salen de todas las jornadas', () => {
    expect(puntosDeIzquierdaADerecha(calle).map((p) => p.id)).toEqual(['p-bi', 'p-eje', 'p-bd'])
    expect(progresivasDeLaCalle(calle)).toEqual([0, 10, 20])
  })

  it('la capa de encima es la que se da, y su espesor lo que se suma', () => {
    expect(capaEncima(proyecto.capas, 'cap-sub')?.nombre).toBe('BASE')
    expect(desplazamientoSugerido(proyecto.capas, 'cap-sub')).toBe(0.2)
    expect(capaEncima(proyecto.capas, 'cap-base')).toBeNull()
    expect(desplazamientoSugerido(proyecto.capas, 'cap-base')).toBe(0)
  })

  it('la línea elegida sale compensada y el ajuste la sube entera', () => {
    const sola = lineaElegida(proyecto, calle, { capaId: 'cap-sub', puntoId: 'p-bi', ajusteCm: 0 })!
    expect(sola.linea.puntos.map((p) => p.cota)).toEqual([
      expect.closeTo(99.943, 6),
      expect.closeTo(99.913, 6),
      expect.closeTo(99.886, 6),
    ])
    expect(sola.linea.puntos.every((p) => p.comprobado)).toBe(true)

    const subida = lineaElegida(proyecto, calle, { capaId: 'cap-sub', puntoId: 'p-bi', ajusteCm: 2 })!
    expect(subida.linea.nombre).toBe('SUBRASANTE · Borde izquierdo (+2 cm)')
    expect(subida.linea.puntos[0]!.cota).toBeCloseTo(99.963, 6)
  })

  it('arma una línea por capa medida y punto', () => {
    expect(lineasDeLaCalle(proyecto, calle)).toHaveLength(6)
  })

  it('la puesta desde un BM oficial está comprobada; desde uno auxiliar, no; con una vista imposible, no hay', () => {
    const oficial = proyecto.bms[0]!
    expect(puestaDesdeBM(oficial, 1.5, 5)).toMatchObject({ alturaInstrumental: 101.5, comprobado: true })
    const auxiliar = { ...oficial, tipo: 'auxiliar' as const }
    const deAuxiliar = puestaDesdeBM(auxiliar, 1.5, 5)
    expect(deAuxiliar).toMatchObject({ comprobado: false })
    expect(deAuxiliar?.tipo === 'libreta' && deAuxiliar.avisos?.[0]).toMatch(/BM auxiliar/)
    expect(puestaDesdeBM(oficial, 7, 5)).toBeNull()
  })

  it('compara la cota a dar con la del proyecto de esa capa, con su tolerancia', () => {
    // Rasante 100.200 en el eje de 0+000; la base es la capa de arriba (±10 mm).
    expect(contraProyecto(calle, proyecto.capas, 'cap-base', 0, 0, 100.203)).toEqual({
      cotaProyecto: 100.2,
      diferenciaMm: 3,
      estado: 'conforme',
    })
    expect(contraProyecto(calle, proyecto.capas, 'cap-base', 0, 0, 100.254)?.estado).toBe('fuera')
    expect(contraProyecto({ ...calle, rasante: null }, proyecto.capas, 'cap-base', 0, 0, 100.2)).toBeNull()
  })
})
