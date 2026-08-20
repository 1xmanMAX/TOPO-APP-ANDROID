import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { armarXlsx, letraDeColumna } from './xlsx'

describe('letraDeColumna', () => {
  it('numera las columnas como una hoja de cálculo', () => {
    expect(letraDeColumna(0)).toBe('A')
    expect(letraDeColumna(25)).toBe('Z')
    expect(letraDeColumna(26)).toBe('AA')
    expect(letraDeColumna(27)).toBe('AB')
    expect(letraDeColumna(51)).toBe('AZ')
    expect(letraDeColumna(52)).toBe('BA')
  })
})

describe('armarXlsx', () => {
  const tabla = [
    ['Progresiva', 'EJE'],
    ['0+000', '3244.628'],
    ['0+020', ''],
  ]

  it('produce un archivo con todas las piezas que Excel espera', () => {
    const contenido = unzipSync(armarXlsx(tabla, 'Cotas'))

    expect(Object.keys(contenido).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ])
  })

  it('escribe las cotas como número y los rótulos como texto', () => {
    const contenido = unzipSync(armarXlsx(tabla, 'Cotas'))
    const hoja = strFromU8(contenido['xl/worksheets/sheet1.xml']!)

    expect(hoja).toContain('<c r="B2"><v>3244.628</v></c>')
    expect(hoja).toContain('<c r="A1" t="inlineStr"><is><t>Progresiva</t></is></c>')
    expect(hoja).toContain('<c r="A2" t="inlineStr"><is><t>0+000</t></is></c>')
  })

  it('deja vacía la celda sin medir, sin inventar un cero', () => {
    const contenido = unzipSync(armarXlsx(tabla, 'Cotas'))
    const hoja = strFromU8(contenido['xl/worksheets/sheet1.xml']!)

    expect(hoja).toContain('<c r="B3" t="inlineStr"><is><t></t></is></c>')
  })

  it('escapa los caracteres que romperían el XML', () => {
    const contenido = unzipSync(armarXlsx([['Av. Sol & Cía. <norte>']], 'Cotas'))
    const hoja = strFromU8(contenido['xl/worksheets/sheet1.xml']!)

    expect(hoja).toContain('Av. Sol &amp; C&#237;a. &lt;norte&gt;'.replace('&#237;', 'í'))
  })

  it('pone el nombre de hoja pedido en el libro', () => {
    const contenido = unzipSync(armarXlsx(tabla, 'Cotas'))
    const libro = strFromU8(contenido['xl/workbook.xml']!)

    expect(libro).toContain('name="Cotas"')
  })

  it('quita los caracteres de control, que dejarían el archivo ilegible', () => {
    const contenido = unzipSync(armarXlsx([['Av. Sol\x07']], 'Cotas'))
    const hoja = strFromU8(contenido['xl/worksheets/sheet1.xml']!)

    expect(hoja).toContain('<t>Av. Sol</t>')
    expect(hoja).not.toContain('\x07')
  })

  it('conserva acentos y eñes de los nombres de calle', () => {
    const contenido = unzipSync(armarXlsx([['Jr. Ñuñoa', 'Cañón']], 'Cotas'))
    const hoja = strFromU8(contenido['xl/worksheets/sheet1.xml']!)

    expect(hoja).toContain('<t>Jr. Ñuñoa</t>')
    expect(hoja).toContain('<t>Cañón</t>')
  })

  it('trata como texto lo que no es un número usable', () => {
    const contenido = unzipSync(armarXlsx([['Infinity', 'NaN', '123abc', '']], 'Cotas'))
    const hoja = strFromU8(contenido['xl/worksheets/sheet1.xml']!)

    expect(hoja).not.toContain('<v>Infinity</v>')
    expect(hoja).not.toContain('<v>NaN</v>')
    expect(hoja).toContain('<is><t>123abc</t></is>')
  })

  it('recorta y limpia un nombre de hoja que Excel no aceptaría', () => {
    const contenido = unzipSync(armarXlsx([['x']], 'Av. Sol / Jr. Lima: capa base de rodadura'))
    const libro = strFromU8(contenido['xl/workbook.xml']!)

    const nombre = /name="([^"]*)"/.exec(libro)![1]!
    expect(nombre.length).toBeLessThanOrEqual(31)
    expect(nombre).not.toContain('/')
    expect(nombre).not.toContain(':')
  })
})
