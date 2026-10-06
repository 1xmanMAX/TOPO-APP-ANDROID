import { describe, expect, it } from 'vitest'
import {
  AVISO_SIN_COMPROBAR,
  componerInforme,
  diferenciaMm,
  estadoDe,
  formatearMm,
  palabraEstado,
  textoCortaRellena,
  textoSeguro,
} from './maquetacion'
import { enUnaLinea, textoDelPdf } from './textoDelPdf'
import { baseDePrueba } from './datosDePrueba'

describe('textoSeguro', () => {
  it('deja pasar tildes, ñ y signos de Latin-1', () => {
    expect(textoSeguro('Nivelación ÁÉÍÓÚ ñÑ ü ± ° ·')).toBe('Nivelación ÁÉÍÓÚ ñÑ ü ± ° ·')
  })
  it('cambia lo que la fuente estándar no tiene por algo legible, nunca lo borra', () => {
    expect(textoSeguro('a ≤ b ≥ c – d — e “f” ‘g’ …')).toBe('a <= b >= c - d - e "f" \'g\' ...')
    expect(textoSeguro('√K σ Δ')).toBe('raíz K sigma delta')
    // La barra invertida jsPDF la pierde: se escribe como barra normal.
    expect(textoSeguro('a\\b')).toBe('a/b')
    // Lo desconocido queda marcado con «?», a la vista.
    expect(textoSeguro('x✓y')).toBe('x?y')
  })
})

describe('diferencia y estado', () => {
  it('diferencia = medida − proyecto en mm, sin ruido binario', () => {
    // 100.046 − 100.000 = 0.046 m = 46 mm (en binario sale 45.99999…)
    expect(diferenciaMm(100.046, 100)).toBe(46)
    // 99.977 − 100.000 = −0.023 m = −23 mm
    expect(diferenciaMm(99.977, 100)).toBe(-23)
  })
  it('semáforo: hasta tol conforme, hasta 2×tol al límite, después fuera', () => {
    // tol 10: |10| ≤ 10 conforme; |−20| ≤ 20 al límite; 21 > 20 fuera
    expect(estadoDe(10, 10)).toBe('conforme')
    expect(estadoDe(-20, 10)).toBe('alLimite')
    expect(estadoDe(21, 10)).toBe('fuera')
  })
  it('estado y corrección en palabras', () => {
    expect(palabraEstado('conforme')).toBe('CONFORME')
    expect(palabraEstado('alLimite')).toBe('AL LÍMITE')
    expect(palabraEstado('fuera')).toBe('FUERA')
    // positivo = sobra = corta; negativo = falta = rellena
    expect(textoCortaRellena(46)).toBe('corta 46 mm')
    expect(textoCortaRellena(-23)).toBe('rellena 23 mm')
    expect(textoCortaRellena(0)).toBe('en cota')
  })
})

describe('componerInforme', () => {
  const columnas = [
    { titulo: 'Punto', ancho: 40 },
    { titulo: 'Valor', ancho: 40, alinear: 'der' as const },
  ]

  it('devuelve un PDF con encabezado de obra, tildes y pie de página', () => {
    const bytes = componerInforme({
      titulo: 'Prueba de maquetación',
      base: baseDePrueba(true),
      secciones: [{ tipo: 'tabla', columnas, filas: [['P-1', '1.000']] }],
    })
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
    const { todo, paginas } = textoDelPdf(bytes)
    expect(paginas).toHaveLength(1)
    expect(todo).toContain('PRUEBA DE MAQUETACIÓN')
    expect(todo).toContain('Obra: Pavimentación de la Av. Ñaña')
    expect(todo).toContain('Calle: Jr. Peñaloza')
    expect(todo).toContain('Capa: Subrasante')
    expect(todo).toContain('Tramo: 0+000 a 0+120')
    expect(todo).toContain('Fecha: 05/10/2026')
    // la cota del BM a 3 decimales con redondeo estable: 3244.6275 → 3244.628
    expect(todo).toContain('BM: BM-1 (cota 3244.628)')
    expect(todo).toContain('Tolerancia: ±10 mm')
    expect(todo).toContain('Página 1 de 1')
    expect(todo).not.toContain(AVISO_SIN_COMPROBAR)
  })

  it('sin comprobar: la franja sale en todas las páginas', () => {
    const filas = Array.from({ length: 120 }, (_, i) => [`P-${i + 1}`, '1.000'])
    const bytes = componerInforme({
      titulo: 'Prueba',
      base: baseDePrueba(false),
      secciones: [{ tipo: 'tabla', columnas, filas }],
    })
    const { paginas } = textoDelPdf(bytes)
    expect(paginas.length).toBeGreaterThan(1)
    for (const pagina of paginas) expect(enUnaLinea(pagina)).toContain(AVISO_SIN_COMPROBAR)
  })

  it('una celda larga se parte en varias líneas, no se corta', () => {
    const largo = 'texto muy largo que no cabe en cuarenta milímetros de ancho de columna'
    const { todo } = textoDelPdf(
      componerInforme({
        titulo: 'Prueba',
        base: baseDePrueba(true),
        secciones: [{ tipo: 'tabla', columnas, filas: [[largo, '1']] }],
      }),
    )
    expect(enUnaLinea(todo)).toContain(largo)
  })

  it('firmas y notas de campo', () => {
    const base = { ...baseDePrueba(true), notas: ['Llovió en la tarde.', 'Mira apoyada en clavo.'] }
    const { todo } = textoDelPdf(componerInforme({ titulo: 'Prueba', base, secciones: [] }))
    expect(todo).toContain('Notas de campo')
    expect(todo).toContain('Llovió en la tarde.')
    expect(todo).toContain('Topógrafo')
    expect(todo).toContain('Max Mamani')
    expect(todo).toContain('Supervisor')
    expect(todo).toContain('Ing. Pérez')

    const sinFirmas = textoDelPdf(
      componerInforme({ titulo: 'Prueba', base: { ...base, firmas: false }, secciones: [] }),
    ).todo
    expect(sinFirmas).not.toContain('Topógrafo')
  })

  it('un logo válido entra como imagen; uno roto se avisa en el encabezado', () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const base = baseDePrueba(true)
    const bueno = componerInforme({
      titulo: 'Prueba',
      base: { ...base, encabezado: { ...base.encabezado, logo: png } },
      secciones: [],
    })
    expect(String.fromCharCode(...bueno)).toContain('/Subtype /Image')

    const roto = componerInforme({
      titulo: 'Prueba',
      base: { ...base, encabezado: { ...base.encabezado, logo: 'data:image/png;base64,AAAA' } },
      secciones: [],
    })
    expect(textoDelPdf(roto).todo).toContain('(logo no válido: no se incluyó)')
  })
})

describe('revisión: números inválidos, tolerancias y saltos de línea', () => {
  it('la tolerancia se imprime con un decimal como mucho', () => {
    // 12·√0.5 = 8.48528… → 8.5; 12·√0.3 = 6.57267… → 6.6; 10 → «10» (sin «.0»)
    expect(formatearMm(12 * Math.sqrt(0.5))).toBe('8.5')
    expect(formatearMm(12 * Math.sqrt(0.3))).toBe('6.6')
    expect(formatearMm(10)).toBe('10')
    // 6.0000000000005 (ruido binario de 100.006 − 100) → 6
    expect(formatearMm(6.0000000000005)).toBe('6')
    const base = baseDePrueba(true)
    const { todo } = textoDelPdf(
      componerInforme({
        titulo: 'Prueba',
        base: { ...base, encabezado: { ...base.encabezado, toleranciaMm: 12 * Math.sqrt(0.5) } },
        secciones: [],
      }),
    )
    expect(todo).toContain('Tolerancia: ±8.5 mm')
    expect(todo).not.toContain('8.48528')
  })

  it('un número que no es número no es FUERA ni «en cota»: es dato inválido', () => {
    expect(Number.isNaN(diferenciaMm(Number.NaN, 100))).toBe(true)
    expect(estadoDe(Number.NaN, 10)).toBe('datoInvalido')
    expect(estadoDe(5, Number.NaN)).toBe('datoInvalido')
    expect(textoCortaRellena(Number.NaN)).toBe('dato inválido')
    expect(textoCortaRellena(Number.POSITIVE_INFINITY)).toBe('dato inválido')
  })

  it('una tolerancia de obra que no es número para el informe: no se juzga con ella', () => {
    const base = baseDePrueba(true)
    for (const toleranciaMm of [Number.NaN, -1])
      expect(() =>
        componerInforme({ titulo: 'Prueba', base: { ...base, encabezado: { ...base.encabezado, toleranciaMm } }, secciones: [] }),
      ).toThrow(/tolerancia/i)
  })

  it('el tabulador pasa a espacios y el salto de línea parte la nota, sin «?»', () => {
    expect(textoSeguro('a\tb')).toBe('a  b')
    expect(textoSeguro('a\r\nb')).toBe('a\nb')
    const base = { ...baseDePrueba(true), notas: ['linea1\nlinea2\tTab'] }
    const { todo } = textoDelPdf(componerInforme({ titulo: 'Prueba', base, secciones: [] }))
    const lineas = todo.split('\n')
    expect(lineas).toContain('- linea1')
    expect(lineas).toContain('linea2  Tab')
    expect(todo).not.toContain('linea1?')
  })
})
