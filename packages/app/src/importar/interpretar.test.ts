import { describe, expect, it } from 'vitest'
import { seccionDeFabrica } from '@topo/core'
import { leerPegado } from '../archivo/leerTabla'
import { hojaDetrasDelColegio, seccionDeMax } from '../pruebas/muestras'
import { interpretarHoja } from './interpretar'

describe('el archivo real de Max', () => {
  it('entra entero: 7 progresivas por 5 puntos, con el lado correcto', () => {
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeMax())

    expect([...new Set(c.lecturas.map((l) => l.progresiva))]).toEqual([6, 10, 20, 30, 40, 50, 60])
    expect(c.columnas.map((col) => col.puntoId)).toEqual([
      'p-vereda-i', 'p-borde-i', 'p-eje', 'p-borde-d', 'p-vereda-d',
    ])
    expect(c.lecturas).toHaveLength(35)
  })

  it('saca la vista atrás del preámbulo, junto a la palabra PC', () => {
    expect(interpretarHoja(hojaDetrasDelColegio(), seccionDeMax()).vistaAtras).toBe(1.45)
  })

  it('encuentra la columna de progresivas aunque no tenga título', () => {
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeMax())

    expect(c.columnaProgresiva).toBe(1) // la B
  })

  it('lee las filas de referencia, y no elige cuando hay dos del mismo lado', () => {
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeMax())

    // Fila 20: a la izquierda solo hay 2.185, asi que entra sin duda.
    expect(c.referencias).toContainEqual({ elemento: 'cuneta', distancia: -3.5, valor: 2.185 })
    // A la derecha caen dos, 1.955 bajo DER y 0.23 bajo la vereda: NINGUNA entra.
    expect(c.referencias.some((r) => r.elemento === 'cuneta' && r.distancia > 0)).toBe(false)

    // Fila 21: una por lado, las dos entran.
    expect(c.referencias).toContainEqual({ elemento: 'calzada', distancia: -3.5, valor: 2.41 })
    expect(c.referencias).toContainEqual({ elemento: 'calzada', distancia: 3.5, valor: 2.06 })

    expect(c.referencias).toHaveLength(3)
  })

  it('el conflicto de la cuneta nombra los dos valores, para poder resolverlo', () => {
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeMax())
    const texto = c.conflictos.map((x) => x.que).join(' ')

    expect(texto).toMatch(/cuneta/i)
    expect(texto).toContain('1.955')
    expect(texto).toContain('0.23')
  })

  it('NO se traga la columna de cálculo, y dice que estaba', () => {
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeMax())

    expect(c.lecturas.some((l) => l.valor === 0.125)).toBe(false)
    expect(c.noImportado.map((n) => n.que).join(' ')).toMatch(/columna/i)
    expect(c.noImportado.flatMap((n) => n.contenido)).toContain('0.125')
  })

  it('NO inventa puntos con las filas de ceros arrastrados', () => {
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeMax())

    // Las filas 12 a 19 solo tienen el cero de la resta: no son puntos medidos.
    expect(c.lecturas.filter((l) => l.valor === 0)).toEqual([])
    expect([...new Set(c.lecturas.map((l) => l.progresiva))]).toHaveLength(7)
  })

  it('el 2.11 del preámbulo no entra, pero se enseña', () => {
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeMax())

    expect(c.lecturas.some((l) => l.valor === 2.11)).toBe(false)
    expect(c.noImportado.flatMap((n) => n.contenido)).toContain('2.11')
  })

  it('señala el 0.23 como conflicto: dos lecturas del mismo lado en una referencia', () => {
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeMax())

    expect(c.conflictos.map((x) => x.que).join(' ')).toMatch(/cuneta/i)
    expect(c.referencias.some((r) => r.valor === 0.23)).toBe(false)
  })

  it('con la sección de fábrica, IZQ y DER salen para asignar y NO se pierden', () => {
    // Esta es la primera importación de Max, antes de declarar nada.
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeFabrica())

    expect(c.sinAsignar.map((s) => s.palabra)).toEqual(['IZQ', 'DER'])
    expect(c.sinAsignar[0]!.muestra).toContain('2.24')
  })

  it('pegado da exactamente lo mismo que subido', () => {
    // Es la prueba que garantiza que pegar no es un camino de segunda. La
    // simetría ya está probada al nivel de la tabla de celdas; aquí se
    // comprueba que tampoco se rompe al interpretarla.
    const subida = hojaDetrasDelColegio()
    const pegada = leerPegado(subida.celdas.map((f) => f.join('\t')).join('\n'), subida.nombre)

    expect(interpretarHoja(pegada, seccionDeMax())).toEqual(
      interpretarHoja(subida, seccionDeMax()),
    )
  })
})

describe('reglas generales', () => {
  const conCabecera = (filas: string[][]) => ({ nombre: 'x', celdas: filas })

  it('el lado sale de la posición respecto al eje, no del nombre', () => {
    const hoja = conCabecera([
      ['', 'VEREDA', 'EJE', 'VEREDA'],
      ['0', '1.10', '1.20', '1.30'],
    ])

    const c = interpretarHoja(hoja, seccionDeFabrica())

    expect(c.columnas.map((col) => col.puntoId)).toEqual(['p-vereda-i', 'p-eje', 'p-vereda-d'])
  })

  it('sin columna de eje no adivina el lado: lo dice', () => {
    const hoja = conCabecera([['', 'VEREDA', 'VEREDA'], ['0', '1.10', '1.30']])

    const c = interpretarHoja(hoja, seccionDeFabrica())

    expect(c.columnas).toEqual([])
    expect(c.conflictos.map((x) => x.que).join(' ')).toMatch(/eje/i)
  })

  it('la misma palabra dos veces del mismo lado no se reparte a ciegas', () => {
    const hoja = conCabecera([
      ['', 'VEREDA', 'VEREDA', 'EJE'],
      ['0', '1.10', '1.15', '1.20'],
    ])

    const c = interpretarHoja(hoja, seccionDeFabrica())

    expect(c.conflictos.map((x) => x.que).join(' ')).toMatch(/vereda/i)
  })

  it('una celda vacía es un punto sin medir y no produce lectura', () => {
    const hoja = conCabecera([
      ['', 'VEREDA', 'EJE'],
      ['0', '1.10', '1.20'],
      ['10', '', '1.25'],
    ])

    const c = interpretarHoja(hoja, seccionDeFabrica())

    expect(c.lecturas.filter((l) => l.progresiva === 10)).toHaveLength(1)
  })

  it('admite la progresiva escrita 0+020 o 20', () => {
    const hoja = conCabecera([['', 'EJE'], ['0+020', '1.20']])

    expect(interpretarHoja(hoja, seccionDeFabrica()).lecturas[0]!.progresiva).toBe(20)
  })

  it('una anotación a mano bajo una columna colocada no se pierde: se enseña', () => {
    // Una celda vacía es un punto sin medir y eso es información. Una celda
    // escrita que no es un número es trabajo de campo, y callarla la dejaría
    // indistinguible de la vacía.
    const hoja = conCabecera([
      ['', 'VEREDA', 'EJE'],
      ['20', '1.88 m', '1.20'],
    ])

    const c = interpretarHoja(hoja, seccionDeFabrica())

    expect(c.lecturas).toHaveLength(1)
    expect(c.noImportado.flatMap((n) => n.contenido)).toContain('1.88 m')
    expect(c.noImportado.map((n) => n.que).join(' ')).toMatch(/0\+020/)
  })

  it('lo escrito en una fila de referencia que no es una lectura tampoco se pierde', () => {
    const hoja = conCabecera([
      ['', 'VEREDA', 'EJE', 'VEREDA'],
      ['0', '1.10', '1.20', '1.30'],
      ['existente', 'cuneta', 'roto', '1.55'],
    ])

    const c = interpretarHoja(hoja, seccionDeFabrica())

    expect(c.referencias).toEqual([{ elemento: 'cuneta', distancia: 5.15, valor: 1.55 }])
    expect(c.noImportado.flatMap((n) => n.contenido)).toContain('roto')
  })

  it('la palabra de referencia solo cuenta si abre la fila', () => {
    // «REF» escrito en una celda cualquiera no convierte una fila medida en
    // referencia, ni le quita su progresiva.
    const hoja = conCabecera([
      ['', 'VEREDA', 'EJE', ''],
      ['20', '1.10', '1.20', 'REF'],
    ])

    const c = interpretarHoja(hoja, seccionDeFabrica())

    expect(c.lecturas.map((l) => l.progresiva)).toEqual([20, 20])
    expect(c.referencias).toEqual([])
    expect(c.noImportado.flatMap((n) => n.contenido)).toContain('REF')
  })

  it('sin columna de progresivas lo dice, y no importa nada a ciegas', () => {
    const hoja = conCabecera([['EJE'], ['1.20']])

    const c = interpretarHoja(hoja, seccionDeFabrica())

    expect(c.columnaProgresiva).toBeNull()
    expect(c.lecturas).toEqual([])
    expect(c.conflictos.map((x) => x.que).join(' ')).toMatch(/progresiva/i)
    expect(c.noImportado.flatMap((n) => n.contenido)).toContain('1.20')
  })

  it('el aviso de la progresiva sale aunque no se haya colocado ninguna columna', () => {
    // Sin eje no se coloca ninguna columna, y sin progresiva tampoco se sabe a
    // qué punto de la calle va la fila: las dos cosas se dicen, no una sola.
    const hoja = conCabecera([['VEREDA', 'VEREDA'], ['1.10', '1.30']])

    const c = interpretarHoja(hoja, seccionDeFabrica())

    expect(c.columnaProgresiva).toBeNull()
    const texto = c.conflictos.map((x) => x.que).join(' ')
    expect(texto).toMatch(/progresiva/i)
    expect(texto).toMatch(/eje/i)
  })

  it('una fila de referencia sin elemento lo dice, y no inventa ninguna', () => {
    const hoja = conCabecera([
      ['', 'VEREDA', 'EJE'],
      ['0', '1.10', '1.20'],
      ['existente', '', ''],
    ])

    const c = interpretarHoja(hoja, seccionDeFabrica())

    expect(c.referencias).toEqual([])
    expect(c.conflictos.map((x) => x.que).join(' ')).toMatch(/no dice de qué elemento/i)
  })

  it('una hoja sin ninguna palabra conocida no se interpreta, y lo dice con palabras', () => {
    const c = interpretarHoja(conCabecera([['nada', 'de', 'nada'], ['1', '2', '3']]), seccionDeFabrica())

    expect(c.columnas).toEqual([])
    expect(c.conflictos.map((x) => x.que).join(' ')).toMatch(/no encontr/i)
  })
})
