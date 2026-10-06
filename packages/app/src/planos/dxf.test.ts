import { describe, expect, it } from 'vitest'
import {
  aciAHex,
  ejesCandidatos,
  ErrorDxf,
  largoPolilinea,
  leerDxf,
  limpiarMtext,
  valorDeCota,
  type PlanoVectorial,
} from './dxf'
import {
  armarDxf,
  dxfArco,
  dxfCirculo,
  dxfInsercion,
  dxfLinea,
  dxfPolilinea,
  dxfTexto,
  generarDxfExpediente,
} from '../pruebas/muestras/generarDxf'
// La geometría de pistas del core, por ruta relativa: así la prueba de la
// muestra pasa por el mismo camino que seguirá la pantalla del plano.
import { redondear3 } from '@topo/core'
import { clasificarCotas, pendientesPorTramo } from '@topo/core'

// ─── Lectura del archivo de muestra con Node, encerrada en la prueba ──────

interface ArchivosDeNode {
  existsSync(ruta: string): boolean
  readFileSync(ruta: string, codificacion: 'utf8'): string
}
declare const process: { cwd(): string; getBuiltinModule(nombre: string): unknown }

const RUTA_MUESTRA = 'src/pruebas/muestras/expediente-pistas.dxf'

/** Igual que en muestras.ts: se busca desde el paquete o desde la raíz del repositorio. */
function leerMuestra(): string {
  const fs = process.getBuiltinModule('node:fs') as ArchivosDeNode
  const desdeElPaquete = `${process.cwd()}/${RUTA_MUESTRA}`
  const ruta = fs.existsSync(desdeElPaquete) ? desdeElPaquete : `${process.cwd()}/packages/app/${RUTA_MUESTRA}`
  return fs.readFileSync(ruta, 'utf8')
}

/** Un DXF de una sola sección ENTITIES, como los que escriben muchos programas sencillos. */
function soloEntidades(...entidades: string[]): string {
  return `0\nSECTION\n2\nENTITIES\n${entidades.join('')}0\nENDSEC\n0\nEOF\n`
}

function cerca(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol
}

// ─── El expediente simulado ───────────────────────────────────────────────

describe('expediente-pistas.dxf (muestra simulada)', () => {
  const texto = leerMuestra()
  const plano: PlanoVectorial = leerDxf(texto)

  it('el archivo guardado es exactamente lo que produce el generador', () => {
    // Así nadie edita el .dxf a mano sin que la prueba lo note. Los saltos
    // de línea se igualan por si git los convierte en Windows.
    expect(texto.replace(/\r\n/g, '\n')).toBe(generarDxfExpediente())
  })

  it('trae las siete capas con su color ACI convertido', () => {
    // ACI: 1 rojo, 3 verde, 8 gris oscuro, 2 amarillo, 7 blanco, 4 cian, 252 gris #696969.
    expect(plano.capas).toEqual([
      { nombre: 'EJE_VIA', color: '#ff0000', visible: true },
      { nombre: 'SARDINEL', color: '#00ff00', visible: true },
      { nombre: 'VEREDA', color: '#808080', visible: true },
      { nombre: 'COTAS_PROY', color: '#ffff00', visible: true },
      { nombre: 'TEXTO', color: '#ffffff', visible: true },
      { nombre: 'LOTES', color: '#00ffff', visible: true },
      { nombre: 'CURVAS_NIVEL', color: '#696969', visible: true },
    ])
  })

  it('cuenta el INSERT y el HATCH en vez de perderlos', () => {
    expect(plano.ignoradas).toEqual({ INSERT: 1, HATCH: 1 })
    expect(plano.ignoradasDetalle).toEqual([
      { tipo: 'HATCH', motivo: 'no soportada', cantidad: 1 },
      { tipo: 'INSERT', motivo: 'no soportada', cantidad: 1 },
    ])
  })

  it('dice que está en metros ($INSUNITS = 6)', () => {
    expect(plano.unidades).toBe('m')
  })

  it('las curvas de nivel traen su elevación (grupo 30 de la POLYLINE)', () => {
    const curvas = plano.polilineas.filter((p) => p.capa === 'CURVAS_NIVEL' && p.puntos.length === 3)
    expect(curvas.map((c) => c.elevacion)).toEqual([3244, 3246, 3248, 3250, 3252])
    // Las demás polilíneas están a elevación 0: no se anota.
    expect(plano.polilineas.filter((p) => p.capa === 'EJE_VIA').every((p) => p.elevacion === undefined)).toBe(true)
  })

  it('lee todas las polilíneas y todos los textos', () => {
    // Polilíneas: 3 calles × (1 eje + 2 sardineles + 2 veredas) = 15;
    // 3 manzanas + 6 divisiones de lote = 9; 1 poste (círculo);
    // 5 curvas de nivel + 1 arco = 6.  15 + 9 + 1 + 6 = 31.
    expect(plano.polilineas).toHaveLength(31)
    // Textos: 8 cotas (3 + 2 + 3); en TEXTO 8 progresivas + 3 nombres de
    // calle + 6 números de lote + 3 rótulos de manzana = 20.  8 + 20 = 28.
    expect(plano.textos).toHaveLength(28)
    expect(plano.textos.filter((t) => t.capa === 'COTAS_PROY')).toHaveLength(8)
  })

  it('los ejes salen como candidatos, del más largo al más corto', () => {
    const ejes = ejesCandidatos(plano)
    // Jr. Lima: 200 m. Av. Sol: 120 m. Pasaje: 60 + √(36² + 48²) = 60 + 60 = 120 m.
    expect(ejes.map((e) => e.capa)).toEqual(['EJE_VIA', 'EJE_VIA', 'EJE_VIA'])
    expect(ejes[0]!.largo).toBeCloseTo(200, 9)
    expect(ejes[1]!.largo).toBeCloseTo(120, 9)
    expect(ejes[2]!.largo).toBeCloseTo(120, 9)
    // Jr. Lima va del origen local (1000, 2000) a (1200, 2000).
    expect(ejes[0]!.puntos).toEqual([{ x: 1000, y: 2000 }, { x: 1200, y: 2000 }])
  })

  it('el pasaje quebrado conserva su quiebre en 0+060', () => {
    const pasaje = ejesCandidatos(plano).find((e) => e.puntos.length === 3)!
    // (150, 0) → (150, −60) → (186, −108), más el origen (1000, 2000).
    expect(pasaje.puntos).toEqual([
      { x: 1150, y: 2000 },
      { x: 1150, y: 1940 },
      { x: 1186, y: 1892 },
    ])
  })

  it('las cotas de proyecto se leen como número, sea cual sea el formato', () => {
    const cotas = plano.textos
      .filter((t) => t.capa === 'COTAS_PROY')
      .map((t) => [t.texto, t.valor])
    expect(cotas).toEqual([
      ['3244.400', 3244.4],
      ['3243.900', 3243.9],
      ['3244.100', 3244.1],
      ['NTN 3244.100', 3244.1],
      ['NTN 3243.680', 3243.68],
      ['+3244.000', 3244],
      ['3248,420', 3248.42],
      ['3252.860', 3252.86],
    ])
  })

  it('la cota de 0+000 de Jr. Lima está 1 m a la izquierda del eje', () => {
    // Eje hacia +X: la izquierda es +Y.  (1000, 2000) + (0, 1) = (1000, 2001),
    // corrida 0.1 mm hacia adentro de la calle (ver generarDxf.ts): 1000.0001.
    const t = plano.textos.find((x) => x.texto === '3244.400')!
    expect([t.x, t.y, t.altura]).toEqual([1000.0001, 2001, 1])
  })

  describe('las cotas llegan al perfil de cada calle (clasificarCotas del core)', () => {
    const ejes = ejesCandidatos(plano)
    const cotas = plano.textos.filter((t) => t.valor !== null).map((t) => ({ x: t.x, y: t.y, valor: t.valor! }))
    const perfil = (eje: (typeof ejes)[number]) => {
      const { cercanas } = clasificarCotas(eje.puntos, cotas, { metrosPorUnidad: 1 })
      return {
        puntos: cercanas.map((c) => [c.progresiva, c.cota]),
        // El motor no redondea la pendiente: la redondea quien la muestra, aquí a milésimas.
        pendientes: pendientesPorTramo(cercanas).map((p) => redondear3(p.porcentaje)),
      }
    }
    const jrLima = ejes.find((e) => e.puntos[0]!.x === 1000)!
    const avSol = ejes.find((e) => e.puntos[0]!.x === 1060)!
    const pasaje = ejes.find((e) => e.puntos.length === 3)!

    it('Jr. Lima: sus 3 cotas y las de los dos cruces, todas sobre su rasante', () => {
      // Rasante de proyecto: 3244.400 → 3243.900 en 100 m = −0.500 %;
      // 3243.900 → 3244.100 en 100 m = +0.200 %.
      // Cruce con Av. Sol en 0+060: 3244.400 − 0.005·60 = 3244.100.
      // Cruce con el pasaje en 0+150: 3243.900 + 0.002·50 = 3244.000.
      // Tramos: −0.3/60, −0.2/40, +0.1/50, +0.1/50 → −0.5, −0.5, +0.2, +0.2 %.
      expect(perfil(jrLima)).toEqual({
        puntos: [[0, 3244.4], [60, 3244.1], [100, 3243.9], [150, 3244], [200, 3244.1]],
        pendientes: [-0.5, -0.5, 0.2, 0.2],
      })
    })

    it('Av. Sol: arranca a la cota de Jr. Lima en el cruce', () => {
      // (3243.680 − 3244.100) / 120 = −0.42 / 120 = −0.350 %.
      expect(perfil(avSol)).toEqual({ puntos: [[0, 3244.1], [120, 3243.68]], pendientes: [-0.35] })
    })

    it('pasaje empinado: 3 cotas en 0, 60 (el quiebre) y 120, ninguna fuera de la pista', () => {
      // (3248.420 − 3244.000) / 60 = 4.42 / 60 = 7.3667 → 7.367 %.
      // (3252.860 − 3248.420) / 60 = 4.44 / 60 = 7.400 %.
      expect(perfil(pasaje)).toEqual({
        puntos: [[0, 3244], [60, 3248.42], [120, 3252.86]],
        pendientes: [7.367, 7.4],
      })
    })
  })

  it('progresivas, nombres y números de lote no se toman por cotas', () => {
    const enTexto = plano.textos.filter((t) => t.capa === 'TEXTO')
    expect(enTexto.every((t) => t.valor === null)).toBe(true)
    expect(enTexto.map((t) => t.texto)).toContain('0+060')
    expect(enTexto.map((t) => t.texto)).toContain('PSJE. LAS LOMAS')
  })

  it('el sardinel izquierdo del pasaje queda a 3.6 m de ambos tramos en el quiebre', () => {
    // Normales izquierdas: tramo 1 (0,−1) → (1, 0); tramo 2 (0.6,−0.8) → (0.8, 0.6).
    // Inglete: (3.6, 1.2), porque (3.6,1.2)·(1,0) = 3.6 y (3.6,1.2)·(0.8,0.6) = 2.88 + 0.72 = 3.6.
    // Vértice: (150 + 3.6, −60 + 1.2) + origen = (1153.6, 1941.2).
    const sardineles = plano.polilineas.filter((p) => p.capa === 'SARDINEL' && p.puntos.length === 3)
    const izquierdo = sardineles.find((p) => p.puntos[1]!.x > 1150)!
    expect(cerca(izquierdo.puntos[1]!.x, 1153.6)).toBe(true)
    expect(cerca(izquierdo.puntos[1]!.y, 1941.2)).toBe(true)
  })

  it('las manzanas llegan cerradas y el poste como círculo cerrado', () => {
    const lotes = plano.polilineas.filter((p) => p.capa === 'LOTES')
    expect(lotes.filter((p) => p.cerrada)).toHaveLength(4) // 3 manzanas + el poste
    // MZ A: 48 × 54 m → perímetro 2·(48 + 54) = 204 m.
    const mzA = lotes.find((p) => p.cerrada && p.puntos[0]!.x === 1006 && p.puntos[0]!.y === 2006)!
    expect(largoPolilinea(mzA)).toBeCloseTo(204, 9)
  })

  it('los límites encierran todo el dibujo', () => {
    // minX: vereda y cotas de Jr. Lima en x = 1000.  maxX: el arco de curva de
    // nivel llega a 1250 (centro 1250 + r·cos 90°).
    // maxY: vereda de Av. Sol y su cota a 2120.  minY: vereda derecha del
    // pasaje al final, 1892 − 5.6·0.6 = 1888.64.
    expect(plano.limites.minX).toBeCloseTo(1000, 6)
    expect(plano.limites.maxX).toBeCloseTo(1250, 6)
    expect(plano.limites.maxY).toBeCloseTo(2120, 6)
    expect(plano.limites.minY).toBeCloseTo(1888.64, 6)
  })
})

// ─── Entidades una por una ────────────────────────────────────────────────

describe('leerDxf: entidades', () => {
  it('LINE → polilínea abierta de dos puntos', () => {
    const p = leerDxf(soloEntidades(dxfLinea('A', { x: 0, y: 0 }, { x: 3, y: 4 })))
    expect(p.polilineas).toEqual([{ capa: 'A', puntos: [{ x: 0, y: 0 }, { x: 3, y: 4 }], cerrada: false }])
    // 3-4-5.
    expect(largoPolilinea(p.polilineas[0]!)).toBe(5)
  })

  it('POLYLINE cerrada: no repite el primer punto y el largo incluye el cierre', () => {
    const cuadrado = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const p = leerDxf(soloEntidades(dxfPolilinea('A', cuadrado, true)))
    expect(p.polilineas[0]!.puntos).toEqual(cuadrado)
    expect(p.polilineas[0]!.cerrada).toBe(true)
    // 4 lados de 10 m.
    expect(largoPolilinea(p.polilineas[0]!)).toBe(40)
  })

  it('LWPOLYLINE recta', () => {
    const lw =
      '0\nLWPOLYLINE\n8\nEJE\n90\n3\n70\n0\n10\n0\n20\n0\n10\n30\n20\n0\n10\n30\n20\n40\n'
    const p = leerDxf(soloEntidades(lw))
    expect(p.polilineas[0]!.puntos).toEqual([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }])
    // 30 + 40 = 70.
    expect(largoPolilinea(p.polilineas[0]!)).toBe(70)
  })

  it('LWPOLYLINE con bulge 1: media vuelta contra el reloj aproximada con segmentos', () => {
    // De (0,0) a (2,0) con bulge 1 → semicírculo, centro (1,0), r = 1.
    // Contra el reloj desde el ángulo 180° pasa por 270°, o sea por (1, −1).
    // Con pasos de 2°: 90 segmentos de cuerda 2·sen(1°) = 0.0349048 → 3.14143,
    // a 1.6e-4 de π.
    const lw = '0\nLWPOLYLINE\n8\nEJE\n90\n2\n70\n0\n10\n0\n20\n0\n42\n1\n10\n2\n20\n0\n'
    const pl = leerDxf(soloEntidades(lw)).polilineas[0]!
    expect(pl.puntos).toHaveLength(91)
    expect(pl.puntos.every((q) => cerca(Math.hypot(q.x - 1, q.y), 1, 1e-9))).toBe(true)
    expect(pl.puntos.some((q) => cerca(q.x, 1, 1e-9) && cerca(q.y, -1, 1e-9))).toBe(true)
    expect(pl.puntos[90]).toEqual({ x: 2, y: 0 })
    expect(largoPolilinea(pl)).toBeCloseTo(Math.PI, 3)
  })

  it('LWPOLYLINE con bulge negativo gira con el reloj', () => {
    // bulge −1 de (0,0) a (2,0): semicírculo por arriba, por (1, 1).
    const lw = '0\nLWPOLYLINE\n8\nEJE\n90\n2\n70\n0\n10\n0\n20\n0\n42\n-1\n10\n2\n20\n0\n'
    const pl = leerDxf(soloEntidades(lw)).polilineas[0]!
    expect(pl.puntos.some((q) => cerca(q.x, 1, 1e-9) && cerca(q.y, 1, 1e-9))).toBe(true)
  })

  it('ARC de 0° a 90°: 45 segmentos de 2°', () => {
    const pl = leerDxf(soloEntidades(dxfArco('A', { x: 0, y: 0 }, 10, 0, 90))).polilineas[0]!
    // 90° / 2° = 45 segmentos → 46 puntos, de (10,0) a (0,10).
    expect(pl.puntos).toHaveLength(46)
    expect(cerca(pl.puntos[0]!.x, 10)).toBe(true)
    expect(cerca(pl.puntos[45]!.x, 0) && cerca(pl.puntos[45]!.y, 10)).toBe(true)
    expect(pl.cerrada).toBe(false)
  })

  it('ARC que cruza 0°: de 350° a 10° son 20°, no −340°', () => {
    const pl = leerDxf(soloEntidades(dxfArco('A', { x: 0, y: 0 }, 1, 350, 10))).polilineas[0]!
    // 20° / 2° = 10 segmentos → 11 puntos; todos con x > 0 (cerca de 0°).
    expect(pl.puntos).toHaveLength(11)
    expect(pl.puntos.every((q) => q.x > 0.98)).toBe(true)
  })

  it('CIRCLE → polilínea cerrada de 180 puntos', () => {
    const pl = leerDxf(soloEntidades(dxfCirculo('A', { x: 5, y: 5 }, 1))).polilineas[0]!
    expect(pl.cerrada).toBe(true)
    expect(pl.puntos).toHaveLength(180)
    // 180 cuerdas de 2·sen(1°) = 0.0349048 → 6.28287 (2π = 6.28319).
    expect(largoPolilinea(pl)).toBeCloseTo(360 * Math.sin(Math.PI / 180), 9)
  })

  it('TEXT con %%c, %%d y %%p', () => {
    const p = leerDxf(soloEntidades(dxfTexto('T', { x: 1, y: 2 }, 0.5, 'TUBO %%c4" a 45%%d %%p0.01')))
    expect(p.textos[0]).toEqual({
      capa: 'T', texto: 'TUBO Ø4" a 45° ±0.01', x: 1, y: 2, altura: 0.5, rotacion: 0, ancla: 'base-izquierda', valor: null,
    })
  })

  it('MTEXT: se limpian los códigos de formato y se lee la cota', () => {
    const mtext =
      '0\nMTEXT\n8\nCOTAS\n10\n7\n20\n8\n30\n0\n40\n0.8\n1\n{\\fArial|b1|i0|c0|p34;\\C1;NTN 3244.40}\n'
    const t = leerDxf(soloEntidades(mtext)).textos[0]!
    // Sin grupo 71, el MTEXT se ancla arriba a la izquierda (el 1, por defecto).
    expect(t).toEqual({
      capa: 'COTAS', texto: 'NTN 3244.40', x: 7, y: 8, altura: 0.8, rotacion: 0, ancla: 'arriba-izquierda', valor: 3244.4,
    })
  })

  it('entidad en espacio papel se cuenta aparte y no se dibuja', () => {
    const enPapel = '0\nLINE\n8\nA\n67\n1\n10\n0\n20\n0\n30\n0\n11\n1\n21\n0\n31\n0\n'
    const p = leerDxf(soloEntidades(dxfLinea('A', { x: 0, y: 0 }, { x: 1, y: 1 }), enPapel))
    expect(p.polilineas).toHaveLength(1)
    expect(p.ignoradas).toEqual({ LINE: 1 })
    expect(p.ignoradasDetalle).toEqual([{ tipo: 'LINE', motivo: 'espacio papel', cantidad: 1 }])
  })

  it('una línea de largo cero se cuenta como degenerada', () => {
    const p = leerDxf(
      soloEntidades(dxfLinea('A', { x: 0, y: 0 }, { x: 1, y: 0 }), dxfLinea('A', { x: 2, y: 2 }, { x: 2, y: 2 })),
    )
    expect(p.polilineas).toHaveLength(1)
    expect(p.ignoradas).toEqual({ LINE: 1 })
    expect(p.ignoradasDetalle).toEqual([{ tipo: 'LINE', motivo: 'degenerada', cantidad: 1 }])
  })

  it('cuenta cada tipo no soportado por su nombre', () => {
    const punto = '0\nPOINT\n8\nA\n10\n1\n20\n1\n30\n0\n'
    const p = leerDxf(
      soloEntidades(
        dxfLinea('A', { x: 0, y: 0 }, { x: 1, y: 0 }),
        dxfInsercion('A', 'X', { x: 0, y: 0 }),
        dxfInsercion('A', 'X', { x: 1, y: 0 }),
        punto,
        '0\nDIMENSION\n8\nA\n',
      ),
    )
    expect(p.ignoradas).toEqual({ INSERT: 2, POINT: 1, DIMENSION: 1 })
  })

  it('límites de una línea y un texto', () => {
    const p = leerDxf(
      soloEntidades(dxfLinea('A', { x: 0, y: 0 }, { x: 10, y: 5 }), dxfTexto('A', { x: -2, y: 7 }, 1, 'X')),
    )
    expect(p.limites).toEqual({ minX: -2, minY: 0, maxX: 10, maxY: 7 })
  })
})

describe('leerDxf: capas', () => {
  it('capa con color negativo está apagada; capa usada sin tabla sale blanca y visible', () => {
    const dxf = armarDxf([{ nombre: 'APAGADA', color: -3 }], [
      dxfLinea('APAGADA', { x: 0, y: 0 }, { x: 1, y: 0 }),
      dxfLinea('MURO', { x: 0, y: 0 }, { x: 1, y: 0 }),
    ])
    expect(leerDxf(dxf).capas).toEqual([
      { nombre: 'APAGADA', color: '#00ff00', visible: false },
      { nombre: 'MURO', color: '#ffffff', visible: true },
    ])
  })
})

describe('leerDxf: errores claros', () => {
  it('archivo vacío', () => {
    expect(() => leerDxf('')).toThrow(ErrorDxf)
    expect(() => leerDxf('  \n \r\n')).toThrow(/vacío/)
  })

  it('texto que no es DXF', () => {
    expect(() => leerDxf('Hola, esto es una carta.\nNada de planos.')).toThrow(/no es un DXF/)
  })

  it('DXF binario', () => {
    expect(() => leerDxf('AutoCAD Binary DXF\r\n\x1a\x00...')).toThrow(/binario/)
  })

  it('DXF cortado a la mitad', () => {
    const cortado = soloEntidades(dxfLinea('A', { x: 0, y: 0 }, { x: 1, y: 0 })).slice(0, 40)
    expect(() => leerDxf(cortado)).toThrow(/incompleto o dañado/)
  })

  it('DXF sin nada que dibujar dice qué ignoró', () => {
    expect(() => leerDxf(soloEntidades())).toThrow(/no tiene nada que dibujar/)
    expect(() => leerDxf(soloEntidades(dxfInsercion('A', 'X', { x: 0, y: 0 })))).toThrow(/INSERT: 1/)
  })
})

// ─── Funciones sueltas ────────────────────────────────────────────────────

describe('valorDeCota', () => {
  it.each([
    ['3244.40', 3244.4],
    ['3244,40', 3244.4],
    ['+3244.400', 3244.4],
    ['NTN 3244.40', 3244.4],
    ['N.T.N. 3244.40', 3244.4],
    ['NTN=3244.40', 3244.4],
    ['COTA: 3245.10', 3245.1],
    ['ntn 3244.40', 3244.4],
    ['NPT 3250', 3250],
    ['3244.40 m', 3244.4],
    ['-2.50', -2.5],
  ])('%s → %s', (texto, valor) => {
    expect(valorDeCota(texto)).toBe(valor)
  })

  it.each(['0+060', 'MZ A', '12', 'LOTE 5.5', '3,244.40', '', '2.5%', 'S=2.5%', '3244.40.10'])(
    '%s no es cota',
    (texto) => {
      expect(valorDeCota(texto)).toBeNull()
    },
  )
})

describe('limpiarMtext', () => {
  it.each([
    ['\\A1;{\\H2.5x;\\fArial|b0;Jr. Lima}', 'Jr. Lima'],
    ['LINEA 1\\PLINEA 2', 'LINEA 1 LINEA 2'],
    ['\\S1^2; pulg', '1/2 pulg'],
    ['C:\\\\obra \\{x\\}', 'C:\\obra {x}'],
    ['45\\U+00B0', '45°'],
    ['\\Lsub\\l\\Orayado\\o\\W0.8;ancho\\T1.2;\\Q15;fin', 'subrayadoanchofin'],
    ['A\\~B', 'A B'],
  ])('%s → %s', (crudo, limpio) => {
    expect(limpiarMtext(crudo)).toBe(limpio)
  })
})

describe('aciAHex', () => {
  it.each([
    [1, '#ff0000'], [2, '#ffff00'], [3, '#00ff00'], [4, '#00ffff'], [5, '#0000ff'],
    [6, '#ff00ff'], [7, '#ffffff'], [8, '#808080'], [9, '#c0c0c0'],
    [250, '#333333'], [251, '#505050'], [252, '#696969'], [253, '#828282'], [254, '#bebebe'], [255, '#ffffff'],
  ])('ACI %i → %s', (i, hex) => {
    expect(aciAHex(i)).toBe(hex)
  })

  it('el resto de la paleta sale de la tabla de dxf-parser, no en gris', () => {
    // AutoCadColorIndex: 30 = 0xff7f00 (naranja), 10 = 0xff0000.
    expect(aciAHex(30)).toBe('#ff7f00')
    expect(aciAHex(10)).toBe('#ff0000')
  })

  it('0 = por bloque y 256 = por capa no son colores: gris', () => {
    expect(aciAHex(0)).toBe('#808080')
    expect(aciAHex(256)).toBe('#808080')
    expect(aciAHex(-5)).toBe('#808080')
  })
})

describe('ejesCandidatos', () => {
  function plano(polilineas: PlanoVectorial['polilineas']): PlanoVectorial {
    return {
      capas: [], polilineas, textos: [], limites: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, ignoradas: {}, ignoradasDetalle: [],
    }
  }
  const recta = (capa: string, largo: number) => ({
    capa,
    puntos: [{ x: 0, y: 0 }, { x: largo, y: 0 }],
    cerrada: false,
  })

  it('reconoce nombres de capa de eje y descarta los demás', () => {
    const p = plano([
      recta('EJE', 1), recta('Eje de vía', 2), recta('AXIS_1', 3), recta('CL', 4),
      recta('CENTRO_CALLE', 5), recta('EJES', 6), recta('CENTERLINE', 7), recta('C-ROAD-CNTR', 8),
      recta('CICLOVIA', 50), recta('VEREDA', 60), recta('CLAVOS', 70), recta('PUERTA_EJECUTADA', 80),
    ])
    // Ordenadas de mayor a menor largo.
    expect(ejesCandidatos(p).map((e) => e.capa)).toEqual([
      'C-ROAD-CNTR', 'CENTERLINE', 'EJES', 'CENTRO_CALLE', 'CL', 'AXIS_1', 'Eje de vía', 'EJE',
    ])
  })

  it('une piezas sueltas del mismo eje que se tocan, aunque una venga al revés', () => {
    // (0,0)→(10,0), (10,0)→(20,0) y (30,0)→(20,0): un eje de 10 + 10 + 10 = 30 m.
    const p = plano([
      { capa: 'EJE', puntos: [{ x: 0, y: 0 }, { x: 10, y: 0 }], cerrada: false },
      { capa: 'EJE', puntos: [{ x: 30, y: 0 }, { x: 20, y: 0 }], cerrada: false },
      { capa: 'EJE', puntos: [{ x: 10, y: 0 }, { x: 20, y: 0 }], cerrada: false },
    ])
    const ejes = ejesCandidatos(p)
    expect(ejes).toHaveLength(1)
    expect(ejes[0]!.largo).toBe(30)
    expect(ejes[0]!.puntos).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }])
  })

  it('no une en un cruce de tres piezas: ahí no se sabe por dónde sigue el eje', () => {
    const p = plano([
      { capa: 'EJE', puntos: [{ x: 0, y: 0 }, { x: 10, y: 0 }], cerrada: false },
      { capa: 'EJE', puntos: [{ x: 10, y: 0 }, { x: 20, y: 0 }], cerrada: false },
      { capa: 'EJE', puntos: [{ x: 10, y: 0 }, { x: 10, y: 5 }], cerrada: false },
    ])
    expect(ejesCandidatos(p).map((e) => e.largo)).toEqual([10, 10, 5])
  })

  it('no une piezas de capas distintas', () => {
    const p = plano([
      { capa: 'EJE', puntos: [{ x: 0, y: 0 }, { x: 10, y: 0 }], cerrada: false },
      { capa: 'EJE_2', puntos: [{ x: 10, y: 0 }, { x: 20, y: 0 }], cerrada: false },
    ])
    expect(ejesCandidatos(p)).toHaveLength(2)
  })
})

// ─── Arreglos de la revisión ──────────────────────────────────────────────

/** POLYLINE cruda con banderas propias y vértices [x, y, bandera]; x puede ser texto basura. */
function polilineaCruda(capa: string, bandera: number, vertices: [number | string, number, number][]): string {
  const cabeza = `0\nPOLYLINE\n8\n${capa}\n66\n1\n10\n0\n20\n0\n30\n0\n70\n${bandera}\n`
  const cuerpo = vertices.map(([x, y, b]) => `0\nVERTEX\n8\n${capa}\n10\n${x}\n20\n${y}\n30\n0\n70\n${b}\n`).join('')
  return `${cabeza}${cuerpo}0\nSEQEND\n8\n${capa}\n`
}

describe('POLYLINE ajustada con spline', () => {
  it('se queda con los puntos de la curva (bandera 8) y descarta el marco de control (bandera 16)', () => {
    const marco: [number, number, number][] = [[0, 0, 16], [50, 40, 16], [100, 0, 16]]
    const curva: [number, number, number][] = [[0, 0, 8], [25, 15, 8], [50, 20, 8], [75, 15, 8], [100, 0, 8]]
    const p = leerDxf(soloEntidades(polilineaCruda('CURVAS', 4, [...marco, ...curva])))
    expect(p.polilineas[0]!.puntos).toEqual(curva.map(([x, y]) => ({ x, y })))
    // 2·(√(25² + 15²) + √(25² + 5²)) = 2·(29.1548 + 25.4951) = 109.2998.
    expect(largoPolilinea(p.polilineas[0]!)).toBeCloseTo(109.2998, 3)
    expect(p.ignoradas).toEqual({})
  })

  it('si solo trae el marco, no se inventa la curva: se cuenta', () => {
    const p = leerDxf(
      soloEntidades(
        dxfLinea('A', { x: 0, y: 0 }, { x: 1, y: 0 }),
        polilineaCruda('CURVAS', 4, [[0, 0, 16], [50, 40, 16], [100, 0, 16]]),
      ),
    )
    expect(p.polilineas).toHaveLength(1)
    expect(p.ignoradasDetalle).toEqual([{ tipo: 'POLYLINE', motivo: 'spline sin curva', cantidad: 1 }])
  })
})

describe('coordenadas inválidas', () => {
  it('un vértice que no es número no se borra en silencio: la entidad entera se cuenta', () => {
    // Antes salía [(0,0), (20,0)]: se perdían el vértice malo y el siguiente.
    const p = leerDxf(
      soloEntidades(
        dxfLinea('A', { x: 0, y: 0 }, { x: 1, y: 0 }),
        polilineaCruda('A', 0, [[0, 0, 0], ['abc', 5, 0], [10, 5, 0], [20, 0, 0]]),
      ),
    )
    expect(p.polilineas).toHaveLength(1)
    expect(p.ignoradas).toEqual({ POLYLINE: 1 })
    expect(p.ignoradasDetalle).toEqual([{ tipo: 'POLYLINE', motivo: 'coordenada inválida', cantidad: 1 }])
  })

  it('los repetidos se comparan con el último punto que quedó', () => {
    // (0,0) (0,0) (0,0) (5,0): quedan (0,0) y (5,0).
    const p = leerDxf(soloEntidades(polilineaCruda('A', 0, [[0, 0, 0], [0, 0, 0], [0, 0, 0], [5, 0, 0]])))
    expect(p.polilineas[0]!.puntos).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }])
  })
})

describe('extrusión (0, 0, −1): sistema espejado', () => {
  it('ARC y CIRCLE con centro (5, 0) terminan los dos en x ≈ −5', () => {
    const arco = '0\nARC\n8\nA\n10\n5\n20\n0\n30\n0\n40\n1\n50\n0\n51\n90\n210\n0\n220\n0\n230\n-1\n'
    const circulo = '0\nCIRCLE\n8\nA\n10\n5\n20\n0\n30\n0\n40\n1\n210\n0\n220\n0\n230\n-1\n'
    const [a, c] = leerDxf(soloEntidades(arco, circulo)).polilineas
    // Radio 1 alrededor de (−5, 0): todo x en [−6, −4].
    expect(a!.puntos.every((q) => q.x >= -6 - 1e-9 && q.x <= -4 + 1e-9)).toBe(true)
    expect(c!.puntos.every((q) => q.x >= -6 - 1e-9 && q.x <= -4 + 1e-9)).toBe(true)
  })

  it('TEXT espejado: x cambia de signo y el giro θ pasa a 180° − θ', () => {
    const texto = '0\nTEXT\n8\nA\n10\n5\n20\n2\n30\n0\n40\n1\n1\nNTN 3244.40\n50\n30\n210\n0\n220\n0\n230\n-1\n'
    const t = leerDxf(soloEntidades(texto)).textos[0]!
    // 180° − 30° = 150°.
    expect([t.x, t.y, t.rotacion]).toEqual([-5, 2, 150])
  })

  it('sin extrusión, nada cambia', () => {
    const circulo = '0\nCIRCLE\n8\nA\n10\n5\n20\n0\n30\n0\n40\n1\n'
    const c = leerDxf(soloEntidades(circulo)).polilineas[0]!
    expect(c.puntos.every((q) => q.x >= 4 - 1e-9)).toBe(true)
  })
})

describe('TEXT: posición, giro y ancla', () => {
  const texto = (grupos: string) => `0\nTEXT\n8\nA\n40\n1\n1\n3244.40\n${grupos}`

  it('ajustado (72 = 5): manda el punto 10, el inicio de la línea base', () => {
    // 10 en (0,0), 11 en (10,0): antes salía en x = 10.
    const t = leerDxf(soloEntidades(texto('10\n0\n20\n0\n30\n0\n11\n10\n21\n0\n31\n0\n72\n5\n'))).textos[0]!
    expect([t.x, t.y, t.ancla]).toEqual([0, 0, 'base-izquierda'])
  })

  it('alineado (72 = 3): el giro sale de la línea 10 → 11', () => {
    // De (0,0) a (10,10): atan2(10, 10) = 45°.
    const t = leerDxf(soloEntidades(texto('10\n0\n20\n0\n30\n0\n11\n10\n21\n10\n31\n0\n72\n3\n'))).textos[0]!
    expect(t.rotacion).toBeCloseTo(45, 9)
  })

  it('centrado (72 = 1): manda el punto 11 y el ancla lo dice', () => {
    const t = leerDxf(soloEntidades(texto('10\n0\n20\n0\n30\n0\n11\n5\n21\n0\n31\n0\n72\n1\n50\n90\n'))).textos[0]!
    expect([t.x, t.ancla, t.rotacion]).toEqual([5, 'base-centro', 90])
  })

  it('medio (72 = 4) y arriba a la derecha (72 = 2, 73 = 3)', () => {
    const medio = leerDxf(soloEntidades(texto('10\n0\n20\n0\n30\n0\n11\n5\n21\n1\n31\n0\n72\n4\n'))).textos[0]!
    const arriba = leerDxf(
      soloEntidades(texto('10\n0\n20\n0\n30\n0\n11\n5\n21\n1\n31\n0\n72\n2\n73\n3\n')),
    ).textos[0]!
    expect(medio.ancla).toBe('medio-centro')
    expect(arriba.ancla).toBe('arriba-derecha')
  })

  it('MTEXT: ancla por el grupo 71 y giro por el vector de dirección', () => {
    // 71 = 5 → medio-centro. Dirección (0, 1) → atan2(1, 0) = 90°.
    const mtext = '0\nMTEXT\n8\nA\n10\n1\n20\n2\n30\n0\n40\n1\n71\n5\n11\n0\n21\n1\n31\n0\n1\nJR. LIMA\n'
    const t = leerDxf(soloEntidades(mtext)).textos[0]!
    expect([t.ancla, t.rotacion]).toEqual(['medio-centro', 90])
  })
})

describe('colores', () => {
  it('capa con ACI 30 sale naranja, no gris', () => {
    const dxf = armarDxf([{ nombre: 'NARANJA', color: 30 }], [dxfLinea('NARANJA', { x: 0, y: 0 }, { x: 1, y: 0 })])
    expect(leerDxf(dxf).capas[0]!.color).toBe('#ff7f00')
  })

  it('una entidad con color propio lo lleva; POR CAPA (256) o sin 62, no', () => {
    const roja = '0\nLINE\n8\nA\n62\n1\n10\n0\n20\n0\n30\n0\n11\n1\n21\n0\n31\n0\n'
    const porCapa = '0\nLINE\n8\nA\n62\n256\n10\n0\n20\n0\n30\n0\n11\n1\n21\n0\n31\n0\n'
    const verdadero = '0\nLINE\n8\nA\n420\n1193046\n10\n0\n20\n0\n30\n0\n11\n1\n21\n0\n31\n0\n'
    const [a, b, c, d] = leerDxf(
      soloEntidades(roja, porCapa, dxfLinea('A', { x: 0, y: 0 }, { x: 1, y: 0 }), verdadero),
    ).polilineas
    expect(a!.color).toBe('#ff0000')
    expect(b!.color).toBeUndefined()
    expect(c!.color).toBeUndefined()
    // 420 = color verdadero: 1193046 = 0x123456.
    expect(d!.color).toBe('#123456')
  })

  it('un texto con color propio también', () => {
    const t = leerDxf(soloEntidades('0\nTEXT\n8\nA\n62\n3\n10\n0\n20\n0\n30\n0\n40\n1\n1\nX\n')).textos[0]!
    expect(t.color).toBe('#00ff00')
  })
})

describe('unidades ($INSUNITS)', () => {
  const conUnidades = (n: number) =>
    `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${n}\n0\nENDSEC\n` +
    soloEntidades(dxfLinea('A', { x: 0, y: 0 }, { x: 1, y: 0 }))

  it.each([
    [6, 'm'], [5, 'cm'], [4, 'mm'], [7, 'km'], [1, 'pulg'], [2, 'pie'],
  ] as const)('%i → %s', (n, u) => {
    expect(leerDxf(conUnidades(n)).unidades).toBe(u)
  })

  it('0 (sin unidades) o un código raro: no se adivina', () => {
    expect(leerDxf(conUnidades(0)).unidades).toBeUndefined()
    expect(leerDxf(conUnidades(13)).unidades).toBeUndefined()
  })
})

describe('elevación de polilíneas', () => {
  it('LWPOLYLINE: grupo 38', () => {
    const lw = '0\nLWPOLYLINE\n8\nCN\n90\n2\n70\n0\n38\n3250.5\n10\n0\n20\n0\n10\n10\n20\n0\n'
    expect(leerDxf(soloEntidades(lw)).polilineas[0]!.elevacion).toBe(3250.5)
  })

  it('POLYLINE de R12: grupo 30 de la cabeza', () => {
    const p = leerDxf(soloEntidades(dxfPolilinea('CN', [{ x: 0, y: 0 }, { x: 10, y: 0 }], false, 3248)))
    expect(p.polilineas[0]!.elevacion).toBe(3248)
  })
})

describe('números sueltos que no cuadran con las cotas del plano', () => {
  it('un «3.60» o un «7.20 m» junto al eje no entran como cota; las demás sí', () => {
    const p = leerDxf(
      soloEntidades(
        dxfLinea('EJE', { x: 0, y: 0 }, { x: 100, y: 0 }),
        dxfTexto('COTAS', { x: 0, y: 1 }, 1, '3244.40'),
        dxfTexto('COTAS', { x: 50, y: 1 }, 1, '3244.10'),
        dxfTexto('TEXTO', { x: 30, y: 1 }, 1, 'NTN 3243.90'),
        dxfTexto('TEXTO', { x: 20, y: -2 }, 1, '3.60'),
        dxfTexto('TEXTO', { x: 40, y: -2 }, 1, '7.20 m'),
      ),
    )
    const valores = Object.fromEntries(p.textos.map((t) => [t.texto, t.valor]))
    expect(valores).toEqual({ '3244.40': 3244.4, '3244.10': 3244.1, 'NTN 3243.90': 3243.9, '3.60': null, '7.20 m': null })
    // Referencia: mediana de las «seguras» (capa COTAS o con prefijo):
    // 3243.90, 3244.10, 3244.40 → 3244.10. |3.60 − 3244.10| = 3240.5 > 100.
    const ancho = p.textos.find((t) => t.texto === '3.60')!
    expect(ancho.descarteCota).toMatch(/lejos de las demás cotas/)
    expect(p.textos.find((t) => t.texto === '3244.40')!.descarteCota).toBeUndefined()
  })

  it('sin capas de cota ni prefijos, la referencia es la mediana de todos los números', () => {
    // 3.60, 3243.90, 3244.10, 3244.40 → mediana (3243.90 + 3244.10)/2 = 3244.00.
    const p = leerDxf(
      soloEntidades(
        dxfLinea('A', { x: 0, y: 0 }, { x: 100, y: 0 }),
        ...['3244.40', '3244.10', '3243.90', '3.60'].map((t, i) => dxfTexto('TEXTO', { x: i, y: 1 }, 1, t)),
      ),
    )
    expect(p.textos.map((t) => t.valor)).toEqual([3244.4, 3244.1, 3243.9, null])
  })

  it('un número con prefijo de cota se respeta aunque esté lejos (lo escribió así el proyectista)', () => {
    const p = leerDxf(
      soloEntidades(
        dxfLinea('A', { x: 0, y: 0 }, { x: 100, y: 0 }),
        dxfTexto('COTAS', { x: 0, y: 1 }, 1, '3244.40'),
        dxfTexto('COTAS', { x: 0, y: 2 }, 1, '3244.50'),
        dxfTexto('TEXTO', { x: 0, y: 3 }, 1, 'NPT 2.50'),
      ),
    )
    expect(p.textos[2]!.valor).toBe(2.5)
  })
})

describe('ejesCandidatos: arreglos', () => {
  function plano(polilineas: PlanoVectorial['polilineas']): PlanoVectorial {
    return {
      capas: [], polilineas, textos: [], limites: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, ignoradas: {}, ignoradasDetalle: [],
    }
  }

  it('dos calles que se encuentran en esquina (90°) no se unen en una L', () => {
    // Antes: un candidato de 200 + 120 = 320 m.
    const p = plano([
      { capa: 'EJE', puntos: [{ x: 0, y: 0 }, { x: 200, y: 0 }], cerrada: false },
      { capa: 'EJE', puntos: [{ x: 200, y: 0 }, { x: 200, y: 120 }], cerrada: false },
    ])
    expect(ejesCandidatos(p).map((e) => [e.largo, e.piezas])).toEqual([[200, 1], [120, 1]])
  })

  it('una tangente y su curva (ARC tangente) sí se unen, y se dice de cuántas piezas', () => {
    // Recta (0,0)→(100,0); arco de centro (100,50), r = 50, de 270° a 360°:
    // arranca en (100,0) hacia +X, tangente a la recta. Con cuerdas de 2°:
    // 45 · 2·50·sen 1° = 78.53, total 178.53.
    const arco = leerDxf(soloEntidades(dxfArco('EJE', { x: 100, y: 50 }, 50, 270, 360))).polilineas[0]!
    const p = plano([{ capa: 'EJE', puntos: [{ x: 0, y: 0 }, { x: 100, y: 0 }], cerrada: false }, arco])
    const ejes = ejesCandidatos(p)
    expect(ejes).toHaveLength(1)
    expect(ejes[0]!.piezas).toBe(2)
    expect(ejes[0]!.largo).toBeCloseTo(100 + 45 * 100 * Math.sin(Math.PI / 180), 6)
  })

  it('un quiebre suave (menos de 30°) entre dos rectas sí se une', () => {
    // De (0,0)→(100,0) a (100,0)→(200,20): giro atan(20/100) = 11.3°.
    const p = plano([
      { capa: 'EJE', puntos: [{ x: 0, y: 0 }, { x: 100, y: 0 }], cerrada: false },
      { capa: 'EJE', puntos: [{ x: 100, y: 0 }, { x: 200, y: 20 }], cerrada: false },
    ])
    expect(ejesCandidatos(p)).toHaveLength(1)
  })

  it('nombres de capa con número o pegados: EJE1, EJE01, EJEVIA, CL2', () => {
    const recta = (capa: string, largo: number) => ({ capa, puntos: [{ x: 0, y: 0 }, { x: largo, y: 0 }], cerrada: false })
    const p = plano([
      recta('EJE1', 1), recta('EJE01', 2), recta('EJEVIA', 3), recta('CL2', 4),
      recta('EJECUTADA', 50), recta('CICLOVIA', 60), recta('CLAVOS', 70),
    ])
    expect(ejesCandidatos(p).map((e) => e.capa)).toEqual(['CL2', 'EJEVIA', 'EJE01', 'EJE1'])
  })

  it('miles de piezas seguidas se unen rápido (sin costo cuadrático)', () => {
    // 20 000 tramos de 1 m, del último al primero: un solo eje de 20 000 m.
    const n = 20000
    const piezas = Array.from({ length: n }, (_, i) => ({
      capa: 'EJE',
      puntos: [{ x: i, y: 0 }, { x: i + 1, y: 0 }],
      cerrada: false,
    })).reverse()
    const inicio = performance.now()
    const ejes = ejesCandidatos(plano(piezas))
    const ms = performance.now() - inicio
    expect(ejes).toHaveLength(1)
    expect(ejes[0]!.largo).toBe(n)
    expect(ejes[0]!.piezas).toBe(n)
    expect(ms).toBeLessThan(1500)
  })
})
