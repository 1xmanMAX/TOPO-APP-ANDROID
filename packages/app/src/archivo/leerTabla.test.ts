import { describe, expect, it } from 'vitest'
import { armarXlsx } from './xlsx'
import { leerCsv, leerPegado, leerXlsx } from './leerTabla'

describe('leerXlsx', () => {
  it('lee de vuelta lo que la propia app escribe', () => {
    const tabla = [['PROG', 'EJE'], ['0+000', '1.955']]

    const hojas = leerXlsx(armarXlsx(tabla, 'Av. Sol'))

    expect(hojas[0]!.nombre).toBe('Av. Sol')
    expect(hojas[0]!.celdas[1]).toEqual(['0+000', '1.955'])
  })

  it('una celda vacía en medio no corre las demás de sitio', () => {
    // Excel se salta las celdas vacías al escribirlas: hay que colocar cada una
    // por su referencia, no apilarlas en orden. Un hueco es un punto sin medir.
    const tabla = [['PROG', 'BI', 'EJE', 'BD'], ['0+000', '1.980', '', '1.975']]

    const hojas = leerXlsx(armarXlsx(tabla, 'x'))

    expect(hojas[0]!.celdas[1]).toEqual(['0+000', '1.980', '', '1.975'])
  })

  it('un archivo que no es un libro de Excel se rechaza con un mensaje legible', () => {
    expect(() => leerXlsx(new Uint8Array([1, 2, 3]))).toThrow(/no se pudo leer/i)
  })
})

describe('leerCsv', () => {
  it('parte por comas y conserva las celdas vacías', () => {
    expect(leerCsv('PROG,BI,EJE\n0+000,1.980,,\n', 'x').celdas[1]).toEqual(['0+000', '1.980', '', ''])
  })

  it('respeta las comas que van dentro de comillas', () => {
    expect(leerCsv('CALLE,"Av. Sol, tramo 2"\n', 'x').celdas[0]).toEqual(['CALLE', 'Av. Sol, tramo 2'])
  })

  it('admite finales de línea de Windows', () => {
    expect(leerCsv('a,b\r\nc,d\r\n', 'x').celdas).toEqual([['a', 'b'], ['c', 'd']])
  })
})

describe('leerPegado', () => {
  it('parte por tabuladores, que es como llega lo copiado de Excel', () => {
    const hoja = leerPegado('PROG\tBI\tEJE\n0+000\t1.980\t1.955\n', 'Pegado')

    expect(hoja.celdas[0]).toEqual(['PROG', 'BI', 'EJE'])
    expect(hoja.celdas[1]).toEqual(['0+000', '1.980', '1.955'])
  })

  it('conserva las celdas vacías del pegado', () => {
    expect(leerPegado('a\t\tc\n', 'x').celdas[0]).toEqual(['a', '', 'c'])
  })

  it('se salta las líneas del todo vacías', () => {
    expect(leerPegado('a\tb\n\nc\td\n', 'x').celdas).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('un texto que no parece una tabla se rechaza con un mensaje legible', () => {
    expect(() => leerPegado('hola', 'x')).toThrow(/no parece una tabla/i)
  })
})
