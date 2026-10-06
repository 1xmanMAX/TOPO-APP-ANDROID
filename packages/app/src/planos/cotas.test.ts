import { describe, expect, it } from 'vitest'
import { valorDeCota } from './cotas'
import { valorDeCota as valorDeCotaDxf } from './dxf'

describe('valorDeCota (regla única para DXF y PDF)', () => {
  it.each([
    // Los mismos casos que ya exige dxf.test.ts: dxf.ts puede pasarse a esta
    // función sin que se le rompa ninguna prueba.
    ['3244.40', 3244.4],
    ['3244,40', 3244.4], // coma decimal, como en Perú
    ['+3244.400', 3244.4],
    ['NTN 3244.40', 3244.4],
    ['N.T.N. 3244.40', 3244.4],
    ['NTN=3244.40', 3244.4],
    ['COTA: 3245.10', 3245.1],
    ['ntn 3244.40', 3244.4],
    ['NPT 3250', 3250], // entero, pero con prefijo de cota
    ['3244.40 m', 3244.4], // unidad «m» aceptada (decisión escrita en cotas.ts)
    ['-2.50', -2.5],
    // Los que leía el lector PDF y deben seguir saliendo.
    ['N.T.N.=3244.400', 3244.4],
    ['Cota: 3243.68', 3243.68],
    ['  3245.180  ', 3245.18],
    ['NTN 3244', 3244],
    ['3244.40512', 3244.40512],
    // Coma de miles imposible: la parte entera es 0 o tiene 4 cifras.
    ['0,150', 0.15],
    ['3244,400', 3244.4],
    // Rótulos de BM y de punto de control delante de la cota.
    ['BM-1 3244.400', 3244.4],
    ['BM1: 3244.40', 3244.4],
    ['BM 3244.40', 3244.4],
    ['BM 1 3244.40', 3244.4], // «BM 1» es el nombre, 3244.40 la cota
    ['PC-3=3243.680', 3243.68],
    ['bm-2a 3244.10', 3244.1],
  ])('«%s» → %s', (texto, valor) => {
    expect(valorDeCota(texto)).toBe(valor)
  })

  it.each([
    // Ya rechazados por dxf.test.ts.
    '0+060', 'MZ A', '12', 'LOTE 5.5', '3,244.40', '', '2.5%', 'S=2.5%', '3244.40.10',
    // Rótulos y distancias del plano.
    'JR. LIMA', 'MZ. A', '20 m', '0', '3244', 'ESCALA 1:1000',
    // Hallazgo de la revisión: prefijos que no son de cota.
    'L=20.00', 'L=20.50', 'R=15.00', 'A=250.35', 'A=250.30', 'Area: 245.30', 'AREA 125.40',
    'Pend. 2.50', 'E=1.50', 'H=1.20', 'H=1.50', 'Km 0.120', 'Km 1.5', 'LOTE 12.50', 'MZ. 12.50',
    'TALUD 1.5', 'ESC 1.1000',
    // Coma con 3 cifras tras 1 a 3 cifras: puede ser de miles (3,244 = 3244).
    '3,244', '1,500', '-1,500', 'NTN 3,244',
    // Un BM sin decimales es el nombre del BM, no su cota.
    'BM 12', 'BM-3', 'PC 2',
    // Pegado sin separador no se puede partir con seguridad.
    'BM-123244.40', 'BM3244.40',
  ])('«%s» no es cota', (texto) => {
    expect(valorDeCota(texto)).toBeNull()
  })

  it('da lo mismo que el lector DXF en todo lo que los dos ya decidían igual', () => {
    // Lista común (sin los casos que esta regla endurece o agrega: coma de
    // miles y rótulos de BM, que dxf.ts recibe al importar esta función).
    const lista = [
      '3244.40', '3244,40', '+3244.400', 'NTN 3244.40', 'N.T.N. 3244.40', 'COTA: 3245.10',
      'NPT 3250', '3244.40 m', '-2.50', 'NTN 3244', '3244.40512', '0,150', '3244,400',
      '0+060', 'MZ A', '12', 'LOTE 5.5', '3,244.40', '', '2.5%', 'S=2.5%', '3244.40.10',
      'JR. LIMA', '20 m', '3244', 'L=20.00', 'R=15.00', 'A=250.35', 'Area: 245.30',
      'Pend. 2.50', 'E=1.50', 'H=1.20', 'Km 0.120', 'LOTE 12.50', 'TALUD 1.5', 'ESC 1.1000',
    ]
    for (const texto of lista) expect([texto, valorDeCota(texto)]).toEqual([texto, valorDeCotaDxf(texto)])
  })
})
