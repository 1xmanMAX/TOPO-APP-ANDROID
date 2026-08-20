import { zipSync, strToU8 } from 'fflate'

/** Escapa lo que XML no admite tal cual dentro de un texto. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** A, B, ... Z, AA, AB, ... a partir de un índice de columna base cero. */
export function letraDeColumna(indice: number): string {
  let resto = indice + 1
  let letras = ''
  while (resto > 0) {
    const posicion = (resto - 1) % 26
    letras = String.fromCharCode(65 + posicion) + letras
    resto = Math.floor((resto - posicion) / 26)
  }
  return letras
}

function celda(referencia: string, valor: string): string {
  // Lo que es número entra como número, para que en la hoja se pueda operar
  // con las cotas en vez de tener texto.
  const esNumero = valor.trim() !== '' && Number.isFinite(Number(valor))
  return esNumero
    ? `<c r="${referencia}"><v>${valor}</v></c>`
    : `<c r="${referencia}" t="inlineStr"><is><t>${escapar(valor)}</t></is></c>`
}

function hoja(tabla: string[][]): string {
  const filas = tabla
    .map((fila, indiceFila) => {
      const celdas = fila
        .map((valor, indiceColumna) => celda(`${letraDeColumna(indiceColumna)}${indiceFila + 1}`, valor))
        .join('')
      return `<row r="${indiceFila + 1}">${celdas}</row>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filas}</sheetData></worksheet>`
}

const TIPOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`

const RELACIONES_RAIZ = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

const RELACIONES_LIBRO = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`

function libro(nombreHoja: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapar(nombreHoja)}" sheetId="1" r:id="rId1"/></sheets></workbook>`
}

/**
 * Arma un .xlsx con una sola hoja a partir de una tabla de textos.
 *
 * Se genera aquí en vez de con una biblioteca porque lo que exportamos es una
 * tabla plana —el caso más simple del formato—, y la biblioteca habitual pesa
 * 429 kB y arrastra dos vulnerabilidades altas sin parche.
 */
export function armarXlsx(tabla: string[][], nombreHoja: string): Uint8Array<ArrayBuffer> {
  return zipSync(
    {
      '[Content_Types].xml': strToU8(TIPOS),
      '_rels/.rels': strToU8(RELACIONES_RAIZ),
      'xl/workbook.xml': strToU8(libro(nombreHoja)),
      'xl/_rels/workbook.xml.rels': strToU8(RELACIONES_LIBRO),
      'xl/worksheets/sheet1.xml': strToU8(hoja(tabla)),
    },
    { level: 6 },
  )
}
