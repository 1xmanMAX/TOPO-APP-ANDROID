import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { armarXlsx } from './xlsx'
import { leerCsv, leerPegado, leerXlsx } from './leerTabla'

/**
 * Arma un .xlsx a partir del XML crudo de una sola fila de la hoja, sin pasar
 * por `armarXlsx`.
 *
 * `armarXlsx` nunca sirve para probar el salto de celdas: escribe **todas**
 * las columnas de cada fila, hasta las vacías (como `inlineStr` sin texto), así
 * que una celda vacía en medio de una tabla armada con `armarXlsx` sigue
 * teniendo su propio elemento `<c>` en el XML. Una lectura que apilara las
 * celdas en el orden en que aparecen pasaría esa prueba igual de bien que una
 * que las coloque por referencia — no distingue entre las dos. Excel de
 * verdad (y Google Sheets al exportar) sí se saltan por completo el elemento
 * `<c>` de una celda vacía, así que aquí se arma esa fila a mano, con huecos
 * reales en el XML, para que una lectura que apile en vez de posicionar por
 * referencia falle de verdad.
 */
function armarXlsxCrudo(filaXml: string): Uint8Array {
  const tipos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`

  const relacionesRaiz = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

  const relacionesLibro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`

  const libro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="x" sheetId="1" r:id="rId1"/></sheets></workbook>`

  const hoja = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${filaXml}</row></sheetData></worksheet>`

  return zipSync({
    '[Content_Types].xml': strToU8(tipos),
    '_rels/.rels': strToU8(relacionesRaiz),
    'xl/workbook.xml': strToU8(libro),
    'xl/_rels/workbook.xml.rels': strToU8(relacionesLibro),
    'xl/worksheets/sheet1.xml': strToU8(hoja),
  })
}

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

  it('una celda que Excel se saltó del todo al escribir no corre las demás de columna', () => {
    // XML real de Excel: la fila trae A1, B1 y D1, y ni un rastro de C1 —
    // Excel no escribe elemento para una celda vacía. Apilar en orden daría
    // ['a', 'b', 'd']; posicionar por referencia da el hueco correcto en C.
    const fila =
      '<c r="A1" t="inlineStr"><is><t>a</t></is></c>' +
      '<c r="B1" t="inlineStr"><is><t>b</t></is></c>' +
      '<c r="D1" t="inlineStr"><is><t>d</t></is></c>'

    const hojas = leerXlsx(armarXlsxCrudo(fila))

    expect(hojas[0]!.celdas[0]).toEqual(['a', 'b', '', 'd'])
  })

  it('una fila que empieza en una columna que no es la A no corre las demás de columna', () => {
    // Aquí el hueco está al principio: solo hay C1 y D1. Apilar en orden daría
    // ['c', 'd']; posicionar por referencia deja A y B vacías, como es.
    const fila =
      '<c r="C1" t="inlineStr"><is><t>c</t></is></c>' +
      '<c r="D1" t="inlineStr"><is><t>d</t></is></c>'

    const hojas = leerXlsx(armarXlsxCrudo(fila))

    expect(hojas[0]!.celdas[0]).toEqual(['', '', 'c', 'd'])
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
