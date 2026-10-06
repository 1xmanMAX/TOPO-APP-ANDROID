import { describe, expect, it } from 'vitest'
import { volumenesPorAreasMedias } from '../../../core/src/analisis/volumenes'
import { baseDePrueba } from './datosDePrueba'
import { AVISO_SIN_COMPROBAR } from './maquetacion'
import { metrado } from './metrado'
import { celdasDesde, enUnaLinea, textoDelPdf } from './textoDelPdf'
import type { DatosMetrado } from './tipos'

/*
 * Áreas medias a mano:
 *   0+000 → 0+020: corte (2.0 + 3.0)/2 × 20 = 50.000; relleno (1.0 + 0.0)/2 × 20 = 10.000
 *   0+020 → 0+060: corte (3.0 + 1.0)/2 × 40 = 80.000; relleno (0.0 + 0.5)/2 × 40 = 10.000 (hueco: 40 > 20)
 *   Totales: corte 50 + 80 = 130.000, relleno 10 + 10 = 20.000; longitud 20 + 40 = 60.00
 */
const datos = (comprobado: boolean): DatosMetrado => ({
  ...baseDePrueba(comprobado),
  secciones: [
    { progresiva: 0, corte: 2, relleno: 1 },
    { progresiva: 20, corte: 3, relleno: 0 },
    { progresiva: 60, corte: 1, relleno: 0.5 },
  ],
  tramos: [
    { desde: 0, hasta: 20, volCorte: 50, volRelleno: 10 },
    { desde: 20, hasta: 60, volCorte: 80, volRelleno: 10, hueco: true },
  ],
})

describe('metrado', () => {
  it('áreas por sección, volúmenes por tramo y totales', () => {
    const { todo } = textoDelPdf(metrado(datos(true)))
    const linea = enUnaLinea(todo)
    expect(todo).toContain('METRADO DE MOVIMIENTO DE TIERRAS')
    expect(todo).toContain('Áreas por sección')
    expect(todo).toContain('Volúmenes por tramo')
    for (const t of ['Corte (m²)', 'Relleno (m²)', 'Corte (m³)', 'Relleno (m³)', 'Longitud (m)'])
      expect(todo).toContain(t)
    expect(celdasDesde(todo, 'TOTAL', 4)).toEqual(['TOTAL', '60.00', '130.000', '20.000'])
    expect(todo).toContain('50.000')
    expect(todo).toContain('80.000')
    expect(todo).toContain('hueco sin secciones')
    expect(linea).toContain('Método de áreas medias')
    // 1 tramo (0+020 → 0+060, 40 m > 20 m) pasa de la separación usual
    expect(linea).toContain('1 tramo pasa de la separación usual entre secciones')
    expect(todo).not.toContain(AVISO_SIN_COMPROBAR)
  })

  it('con el resultado del núcleo: explica las secciones repetidas y descartadas', () => {
    const crudas = [
      { progresiva: 0, corte: 2, relleno: 1 },
      { progresiva: 20, corte: 3, relleno: 0 },
      // repetida: el núcleo usa la primera (3 / 0) y esta no entra
      { progresiva: 20, corte: 9, relleno: 9 },
      // sin número: el núcleo la descarta
      { progresiva: Number.NaN, corte: 1, relleno: 1 },
      { progresiva: 60, corte: 1, relleno: 0.5 },
    ]
    const vol = volumenesPorAreasMedias(crudas, { comprobado: true })
    // Mismas cuentas de arriba: la repetida y la descartada no cambian los volúmenes
    expect(vol.totalCorte).toBe(130)
    const { todo } = textoDelPdf(metrado({ ...baseDePrueba(true), secciones: crudas, ...vol }))
    const linea = enUnaLinea(todo)
    expect(todo).not.toContain('NaN')
    expect(linea).toContain('repetida: no entró')
    // La cuarta fila (índice 3) la descartó el núcleo; el motivo es el suyo, impreso tal cual.
    expect(linea).toContain('no entró: ')
    expect(linea).toContain('1 progresiva repetida (0+020): se usó la primera sección que llegó.')
    expect(linea).toContain('1 sección descartada: fila 4 (')
    expect(celdasDesde(todo, 'TOTAL', 4)).toEqual(['TOTAL', '60.00', '130.000', '20.000'])
    expect(linea).not.toContain('no cuadran')
    expect(linea).not.toContain(AVISO_SIN_COMPROBAR)
  })

  it('el resultado del núcleo sin comprobar trae la franja aunque la base diga lo contrario', () => {
    const vol = volumenesPorAreasMedias(datos(true).secciones, { comprobado: false })
    const { todo } = textoDelPdf(metrado({ ...baseDePrueba(true), secciones: datos(true).secciones, ...vol }))
    expect(enUnaLinea(todo)).toContain(AVISO_SIN_COMPROBAR)
  })

  it('sin el núcleo: busca por su cuenta las secciones que no son número', () => {
    const d = datos(true)
    d.secciones = [...d.secciones, { progresiva: 80, corte: Number.NaN, relleno: 1 }]
    const linea = enUnaLinea(textoDelPdf(metrado(d)).todo)
    expect(linea).toContain('dato inválido: no entró')
    expect(linea).toContain('1 sección descartada porque algún dato no es número.')
    expect(linea).not.toContain('NaN')
  })

  it('con menos de dos secciones válidas, los totales en cero no se presentan como resultado', () => {
    const linea = enUnaLinea(
      textoDelPdf(metrado({ ...datos(true), secciones: [{ progresiva: 0, corte: 1, relleno: 1 }], tramos: [], sinDatos: true }))
        .todo,
    )
    expect(linea).toContain('Menos de dos secciones válidas: no se pudo calcular ningún volumen.')
  })

  it('si los totales recibidos no cuadran con la suma de los tramos, lo dice', () => {
    // suma de tramos 130.000; total recibido 131.000 → no cuadra
    const { todo } = textoDelPdf(metrado({ ...datos(true), totalCorte: 131, totalRelleno: 20 }))
    expect(enUnaLinea(todo)).toContain(
      'Los totales recibidos (corte 131.000 m³, relleno 20.000 m³) no cuadran con la suma de los tramos',
    )
  })

  it('sin comprobar lleva la franja', () => {
    expect(enUnaLinea(textoDelPdf(metrado(datos(false))).todo)).toContain(AVISO_SIN_COMPROBAR)
  })
})
