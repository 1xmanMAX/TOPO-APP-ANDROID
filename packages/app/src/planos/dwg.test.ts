import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { convertirDwg, leerDwg, pareceDwg, type BaseDwg, type BibliotecaDwg, type EntidadDwg } from './dwg'

const MODELO = '1F'

function base(entidades: EntidadDwg[], bloques: BaseDwg['tables']['BLOCK_RECORD'] = { entries: [] }): BaseDwg {
  return {
    header: { INSUNITS: 6 },
    entities: entidades.map((e) => ({ ownerBlockRecordSoftId: MODELO, layer: '0', colorIndex: 256, ...e })),
    tables: {
      LAYER: { entries: [{ name: '0', colorIndex: 7 }, { name: 'EJE', colorIndex: 1 }, { name: 'APAGADA', colorIndex: -3 }] },
      BLOCK_RECORD: { entries: [{ handle: MODELO, name: '*Model_Space', entities: [] }, ...bloques!.entries] },
    },
  }
}

describe('DWG → plano', () => {
  it('líneas, polilíneas con arco y unidades', () => {
    const plano = convertirDwg(
      base([
        { type: 'LINE', layer: 'EJE', startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 10, y: 0, z: 0 } },
        // Media vuelta: bulge 1 de (0,0) a (2,0), contra el reloj (por abajo).
        { type: 'LWPOLYLINE', flag: 512, vertices: [{ x: 0, y: 0, bulge: 1 }, { x: 2, y: 0, bulge: 0 }] },
      ]),
    )
    expect(plano.unidades).toBe('m')
    expect(plano.polilineas[0]!.puntos).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }])
    const arco = plano.polilineas[1]!
    expect(arco.cerrada).toBe(true)
    expect(Math.min(...arco.puntos.map((p) => p.y))).toBeCloseTo(-1, 6)
    expect(plano.capas.find((c) => c.nombre === 'APAGADA')!.visible).toBe(false)
    expect(plano.capas.find((c) => c.nombre === 'EJE')!.color).toBe('#ff0000')
  })

  it('el arco del DWG viene en radianes', () => {
    const plano = convertirDwg(base([{ type: 'ARC', center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI / 2 }]))
    const p = plano.polilineas[0]!.puntos
    expect(p[0]!.x).toBeCloseTo(5, 9)
    expect(p[p.length - 1]!.y).toBeCloseTo(5, 9)
  })

  it('un bloque se dibuja movido, girado y escalado, y su capa «0» toma la del INSERT', () => {
    const plano = convertirDwg(
      base(
        [{ type: 'INSERT', name: 'poste', layer: 'EJE', insertionPoint: { x: 100, y: 50 }, xScale: 2, yScale: 2, rotation: Math.PI / 2 }],
        {
          entries: [
            {
              handle: 'A',
              name: 'POSTE',
              basePoint: { x: 1, y: 0 },
              entities: [
                { type: 'LINE', layer: '0', colorIndex: 0, startPoint: { x: 1, y: 0 }, endPoint: { x: 2, y: 0 } },
                { type: 'TEXT', layer: 'COTAS', text: 'NTN 3244.10', startPoint: { x: 1, y: 0 }, textHeight: 0.5, rotation: 0 },
              ],
            },
          ],
        },
      ),
    )
    const linea = plano.polilineas[0]!
    expect(linea.capa).toBe('EJE')
    expect(linea.puntos[0]).toEqual({ x: 100, y: 50 })
    expect(linea.puntos[1]!.x).toBeCloseTo(100, 9)
    expect(linea.puntos[1]!.y).toBeCloseTo(52, 9)
    const t = plano.textos[0]!
    expect(t.capa).toBe('COTAS')
    expect(t.altura).toBeCloseTo(1, 9)
    expect(t.rotacion).toBeCloseTo(90, 6)
    expect(t.valor).toBeCloseTo(3244.1, 6)
  })

  it('un bloque que se contiene a sí mismo no cuelga', () => {
    const plano = convertirDwg(
      base([{ type: 'INSERT', name: 'B', insertionPoint: { x: 0, y: 0 } }, { type: 'LINE', startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }], {
        entries: [{ handle: 'B', name: 'B', entities: [{ type: 'INSERT', name: 'B', insertionPoint: { x: 1, y: 0 } }] }],
      }),
    )
    expect(plano.polilineas).toHaveLength(1)
    expect(plano.ignoradas.INSERT).toBe(1)
  })

  it('lo del espacio papel y lo que no se dibuja se cuenta', () => {
    const plano = convertirDwg(
      base([
        { type: 'LINE', startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 0 } },
        { type: 'LINE', ownerBlockRecordSoftId: 'PAPEL', startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 0 } },
        { type: 'HATCH' },
      ]),
    )
    expect(plano.ignoradasDetalle).toEqual([
      { tipo: 'LINE', motivo: 'espacio papel', cantidad: 1 },
      { tipo: 'HATCH', motivo: 'no soportada', cantidad: 1 },
    ])
  })

  it('una spline con nudos pasa por sus extremos', () => {
    const plano = convertirDwg(
      base([
        {
          type: 'SPLINE',
          degree: 2,
          knots: [0, 0, 0, 1, 1, 1],
          controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 0 }],
        },
      ]),
    )
    const p = plano.polilineas[0]!.puntos
    expect(p[0]).toEqual({ x: 0, y: 0 })
    expect(p[p.length - 1]!.x).toBeCloseTo(2, 9)
    // Punto medio de la cuadrática: (1, 1).
    expect(p[Math.floor(p.length / 2)]!.y).toBeCloseTo(1, 9)
  })

  it('sin nada que dibujar, lo dice', () => {
    expect(() => convertirDwg(base([{ type: 'HATCH' }]))).toThrow(/no tiene nada que dibujar/)
  })

  it('reconoce la firma y avisa si no es un DWG', () => {
    expect(pareceDwg(new TextEncoder().encode('AC1032xxx'))).toBe(true)
    const nunca: BibliotecaDwg = { leer: () => { throw new Error('no') } }
    expect(() => leerDwg(new TextEncoder().encode('hola'), nunca)).toThrow(/no es un DWG/)
    expect(() => leerDwg(new TextEncoder().encode('AC1032xxxxx'), nunca)).toThrow(/2018/)
  })
})

/**
 * Un DWG real: el ejemplo de AutoCAD 2018 de las pruebas de LibreDWG (GPL-3),
 * con líneas, arcos, splines, bloques con atributo, cotas, rayado y espacio
 * papel. Las versiones R14 y 2000 del mismo dibujo se prueban si están en
 * DWG_MUESTRAS (no van en el repositorio).
 */
const OTRAS = process.env.DWG_MUESTRAS
const archivos: [string, string][] = [['2018', join(process.cwd().endsWith('app') ? process.cwd() : join(process.cwd(), 'packages/app'), 'src/pruebas/muestras/ejemplo-libredwg-2018.dwg')]]
for (const v of ['r14', '2000']) if (OTRAS && existsSync(join(OTRAS, `example_${v}.dwg`))) archivos.push([v, join(OTRAS, `example_${v}.dwg`)])

describe('DWG reales con LibreDWG', () => {
  it.each(archivos)('AutoCAD %s', async (_, ruta) => {
    const raiz = dirname(createRequire(import.meta.url).resolve('@mlightcad/libredwg-web'))
    const { LibreDwg, Dwg_File_Type } = await import('@mlightcad/libredwg-web')
    const lib = await LibreDwg.create(join(raiz, '..', 'wasm'))
    const biblioteca: BibliotecaDwg = {
      leer(bytes) {
        const dwg = lib.dwg_read_data(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, Dwg_File_Type.DWG)
        if (!dwg) throw new Error('no se pudo abrir')
        try {
          return lib.convert(dwg) as unknown as BaseDwg
        } finally {
          lib.dwg_free(dwg)
        }
      },
    }
    const plano = leerDwg(new Uint8Array(readFileSync(ruta)), biblioteca)
    expect(plano.polilineas.length).toBeGreaterThan(20)
    expect(plano.textos.some((t) => t.texto === 'teksto simpla')).toBe(true)
    // El atributo del bloque y el número de una cota (su bloque anónimo).
    expect(plano.textos.some((t) => t.texto.includes('valoro de la teksto en bloko'))).toBe(true)
    expect(plano.ignoradas.VIEWPORT).toBeGreaterThan(0)
    expect(Number.isFinite(plano.limites.minX)).toBe(true)
  }, 60000)
})

describe('encuadre sin objetos sueltos', () => {
  it('una línea olvidada a kilómetros no cuenta para encuadrar, pero se dibuja', () => {
    const lineas: EntidadDwg[] = Array.from({ length: 30 }, (_, i) => ({ type: 'LINE', startPoint: { x: i * 10, y: 0 }, endPoint: { x: i * 10, y: 50 } }))
    lineas.push({ type: 'LINE', startPoint: { x: 2_000_000, y: -900_000 }, endPoint: { x: 2_000_010, y: -900_000 } })
    const plano = convertirDwg(base(lineas))
    expect(plano.polilineas).toHaveLength(31)
    expect(plano.limites).toEqual({ minX: 0, minY: 0, maxX: 290, maxY: 50 })
  })
})
