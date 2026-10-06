/**
 * Lector mínimo del texto de un PDF hecho por estos informes, para las
 * pruebas. Sirve porque los informes salen SIN compresión y con texto solo en
 * Latin-1 (ver `textoSeguro`): cada trozo de texto queda como `(...) Tj`
 * dentro del flujo de contenido de su página, y cada byte es un carácter.
 * No es un lector general de PDF ni pretende serlo.
 */
export function textoDelPdf(bytes: Uint8Array): { paginas: string[]; todo: string } {
  let crudo = ''
  for (const byte of bytes) crudo += String.fromCharCode(byte)

  const paginas: string[] = []
  const flujo = /stream\r?\n([\s\S]*?)endstream/g
  let encontrado: RegExpExecArray | null
  while ((encontrado = flujo.exec(crudo)) !== null) {
    const contenido = encontrado[1] ?? ''
    // Solo los flujos con texto son páginas: todos los informes ponen al
    // menos el encabezado y el pie en cada una.
    if (!/\)\s*Tj/.test(contenido)) continue
    const trozos: string[] = []
    const cadena = /\(((?:\\[\s\S]|[^\\)])*)\)\s*Tj/g
    let t: RegExpExecArray | null
    while ((t = cadena.exec(contenido)) !== null) trozos.push(desescapar(t[1] ?? ''))
    paginas.push(trozos.join('\n'))
  }
  return { paginas, todo: paginas.join('\n') }
}

/** Junta los saltos de línea en espacios, para buscar frases que se partieron. */
export function enUnaLinea(texto: string): string {
  return texto.replace(/\s+/g, ' ')
}

function desescapar(s: string): string {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c: string) => {
    if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8))
    const especiales: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }
    return especiales[c] ?? c
  })
}

/**
 * Las `n` celdas de una fila de tabla, empezando por la línea que es
 * exactamente `ancla` (cada celda es un trozo de texto aparte, en orden de
 * columna). Sirve para probar lo que dice una fila y no lo que dice el resto
 * del informe. Vacío si el ancla no aparece.
 */
export function celdasDesde(texto: string, ancla: string, n: number, desde = 0): string[] {
  const lineas = texto.split('\n')
  const i = lineas.indexOf(ancla, desde)
  return i < 0 ? [] : lineas.slice(i, i + n)
}
