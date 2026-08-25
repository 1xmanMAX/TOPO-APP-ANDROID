import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { armarXlsx } from './xlsx'
import { leerCsv, leerPegado, leerXlsx } from './leerTabla'

/** Una hoja armada a mano para `armarXlsxCrudo`: su nombre y el XML de sus celdas, fila por fila. */
interface HojaCruda {
  nombre: string
  filas: string[]
}

/**
 * Arma un .xlsx a partir del XML crudo de una o más hojas, sin pasar por
 * `armarXlsx`.
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
 *
 * Tampoco sirve para probar `sharedStrings.xml`: `armarXlsx` nunca lo usa,
 * escribe los textos como `inlineStr`. Un archivo guardado por el propio
 * Excel casi siempre sí lo usa —una celda `t="s"` trae un índice, no el
 * texto—, así que ese camino de lectura solo queda probado si el archivo de
 * prueba también lo trae. Por eso `cadenasCompartidas` es un parámetro
 * aparte: para poder armar ese archivo también a mano.
 */
function armarXlsxCrudo(hojas: HojaCruda[], cadenasCompartidas?: string[]): Uint8Array {
  const tipos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>`

  const relacionesRaiz = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

  const sheetsXml = hojas
    .map((hoja, indice) => `<sheet name="${hoja.nombre}" sheetId="${indice + 1}" r:id="rId${indice + 1}"/>`)
    .join('')
  const libro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetsXml}</sheets></workbook>`

  const relacionesLibroXml = hojas
    .map(
      (_, indice) =>
        `<Relationship Id="rId${indice + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${indice + 1}.xml"/>`,
    )
    .join('')
  const relacionesLibro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relacionesLibroXml}</Relationships>`

  const archivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(tipos),
    '_rels/.rels': strToU8(relacionesRaiz),
    'xl/workbook.xml': strToU8(libro),
    'xl/_rels/workbook.xml.rels': strToU8(relacionesLibro),
  }

  hojas.forEach((hoja, indiceHoja) => {
    const filasXml = hoja.filas
      .map((celdasXml, indiceFila) => `<row r="${indiceFila + 1}">${celdasXml}</row>`)
      .join('')
    archivos[`xl/worksheets/sheet${indiceHoja + 1}.xml`] =
      strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filasXml}</sheetData></worksheet>`)
  })

  if (cadenasCompartidas) {
    const siXml = cadenasCompartidas.map((texto) => `<si><t>${texto}</t></si>`).join('')
    archivos['xl/sharedStrings.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${cadenasCompartidas.length}" uniqueCount="${cadenasCompartidas.length}">${siXml}</sst>`)
  }

  return zipSync(archivos)
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

    const hojas = leerXlsx(armarXlsxCrudo([{ nombre: 'x', filas: [fila] }]))

    expect(hojas[0]!.celdas[0]).toEqual(['a', 'b', '', 'd'])
  })

  it('una fila que empieza en una columna que no es la A no corre las demás de columna', () => {
    // Aquí el hueco está al principio: solo hay C1 y D1. Apilar en orden daría
    // ['c', 'd']; posicionar por referencia deja A y B vacías, como es.
    const fila =
      '<c r="C1" t="inlineStr"><is><t>c</t></is></c>' +
      '<c r="D1" t="inlineStr"><is><t>d</t></is></c>'

    const hojas = leerXlsx(armarXlsxCrudo([{ nombre: 'x', filas: [fila] }]))

    expect(hojas[0]!.celdas[0]).toEqual(['', '', 'c', 'd'])
  })

  it('lee los textos de sharedStrings.xml, mezclados con números sin tipo', () => {
    // Un .xlsx guardado por el propio Excel casi siempre trae los textos así:
    // la celda no lleva el texto, lleva un índice a esta lista aparte.
    const cadenas = ['Progresiva', 'Este']
    const fila =
      '<c r="A1" t="s"><v>0</v></c>' +
      '<c r="B1"><v>1234.567</v></c>' +
      '<c r="C1" t="s"><v>1</v></c>'

    const hojas = leerXlsx(armarXlsxCrudo([{ nombre: 'x', filas: [fila] }], cadenas))

    expect(hojas[0]!.celdas[0]).toEqual(['Progresiva', '1234.567', 'Este'])
  })

  it('un índice de sharedStrings que no existe no revienta: la celda queda vacía', () => {
    // Un archivo dañado o armado por otra herramienta puede traer un índice
    // que no está en la lista de textos. No es motivo para reventar: esa
    // celda en particular se queda vacía, y la fila conserva su forma.
    const cadenas = ['Progresiva']
    const fila = '<c r="A1" t="s"><v>0</v></c>' + '<c r="B1" t="s"><v>7</v></c>' + '<c r="C1"><v>5</v></c>'

    const hojas = leerXlsx(armarXlsxCrudo([{ nombre: 'x', filas: [fila] }], cadenas))

    expect(hojas[0]!.celdas[0]).toEqual(['Progresiva', '', '5'])
  })

  it('un libro con dos hojas lee las dos, con su nombre, en el orden del libro', () => {
    const filaUno = '<c r="A1" t="inlineStr"><is><t>uno</t></is></c>'
    const filaDos = '<c r="A1" t="inlineStr"><is><t>dos</t></is></c>'

    const hojas = leerXlsx(
      armarXlsxCrudo([
        { nombre: 'Primera', filas: [filaUno] },
        { nombre: 'Segunda', filas: [filaDos] },
      ]),
    )

    expect(hojas.map((hoja) => hoja.nombre)).toEqual(['Primera', 'Segunda'])
    expect(hojas[0]!.celdas[0]).toEqual(['uno'])
    expect(hojas[1]!.celdas[0]).toEqual(['dos'])
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
