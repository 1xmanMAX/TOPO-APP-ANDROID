import { describe, expect, it } from 'vitest'

/**
 * jsdom no aplica Tailwind, así que el contraste del modo sol se vigila
 * leyendo la paleta de estilos.css y midiendo las parejas texto/fondo que la
 * app usa de verdad en el tema oscuro (sobre el que se monta el sol).
 */
/** Lo justo de Node para leer la hoja de estilos (como en archivo/topoPlanos.test). */
declare const process: { cwd(): string; getBuiltinModule(nombre: string): unknown }
interface ArchivosDeNode {
  existsSync(ruta: string): boolean
  readFileSync(ruta: string, codificacion: 'utf8'): string
}
const fs = process.getBuiltinModule('node:fs') as ArchivosDeNode
const desdeElPaquete = `${process.cwd()}/src/estilos.css`
const css = fs.readFileSync(
  fs.existsSync(desdeElPaquete) ? desdeElPaquete : `${process.cwd()}/packages/app/src/estilos.css`,
  'utf8',
)
const bloqueSol = /html\.sol\s*\{([^}]*)\}/.exec(css)![1]!

function variable(nombre: string): string | null {
  const hallado = new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{3,6})`).exec(bloqueSol)
  return hallado ? hallado[1]! : null
}

function color(nombre: string): string {
  const valor = variable(nombre)
  if (!valor) throw new Error(`El modo sol no define --color-${nombre}`)
  return valor
}

function luminancia(hex: string): number {
  const limpio = hex.replace('#', '')
  const largo = limpio.length === 3 ? limpio.split('').map((c) => c + c).join('') : limpio
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(largo.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro! + 0.05) / (oscuro! + 0.05)
}

describe('modo sol: contraste de la paleta', () => {
  it.each([
    // Texto del cuerpo y de las etiquetas sobre cada fondo oscuro.
    ['slate-100', 'slate-600'], // punto medido del mapa de Medir (VistaComun MEDIDA)
    ['slate-100', 'slate-700'], // jornada no elegida, pasos de la guía
    ['slate-100', 'slate-800'], // tarjetas y celdas sin medir
    ['slate-100', 'slate-900'],
    ['slate-300', 'slate-900'],
    ['slate-400', 'slate-950'],
    ['slate-500', 'slate-800'], // texto de celda sin medir sobre su fondo
  ])('texto %s sobre fondo %s se lee (≥ 4.5:1)', (texto, fondo) => {
    expect(contraste(color(texto), color(fondo))).toBeGreaterThanOrEqual(4.5)
  })

  it('el blanco no se toca: las tarjetas oscuras (text-white sobre slate-800) se siguen leyendo', () => {
    expect(variable('white')).toBeNull()
    expect(contraste('#ffffff', color('slate-800'))).toBeGreaterThanOrEqual(4.5)
  })

  it('lo que va sobre la marca se pone negro, y se lee', () => {
    expect(css).toMatch(/html\.sol \.bg-marca\s*\{\s*color:\s*#000;?\s*\}/)
    expect(contraste('#000000', color('marca'))).toBeGreaterThanOrEqual(4.5)
  })

  it('la marca se distingue de los fondos oscuros (barra de avance, paso actual de la guía)', () => {
    for (const fondo of ['slate-600', 'slate-700', 'slate-800']) {
      expect(contraste(color('marca'), color(fondo))).toBeGreaterThanOrEqual(3)
    }
  })

  it('los bordes y el texto tenue del tema oscuro siguen viéndose sobre negro', () => {
    const borde = /html\.sol \.dark\\:border-slate-800\s*\{\s*border-color:\s*(#[0-9a-fA-F]{6})/.exec(css)![1]!
    const tenue = /html\.sol \.dark\\:text-slate-700\s*\{\s*color:\s*(#[0-9a-fA-F]{6})/.exec(css)![1]!
    expect(contraste(borde, '#000000')).toBeGreaterThanOrEqual(3)
    expect(contraste(tenue, '#000000')).toBeGreaterThanOrEqual(4.5)
  })

  it('los colores de estado se leen sobre el negro', () => {
    for (const estado of ['pasa', 'falla', 'aviso']) {
      expect(contraste(color(estado), '#000000')).toBeGreaterThanOrEqual(4.5)
    }
  })
})
