/**
 * Prueba de extremo a extremo del motor de terreno y de la herramienta de
 * niveles (spec 2026-10-06), con los archivos de muestra y la obra simulada:
 *
 *   leer CSV + GSI + GNSS → amarrar → triangular → curvas cada 0.5 m →
 *   recortar a una zona → volumen a una cota → perfil por una línea →
 *   DXF → volver a leerlo con el lector de la app;
 *
 *   Av. Sol: separación BASE − SUBRASANTE y nivel a registrar de la base
 *   siguiendo la subrasante.
 */

import { describe, expect, it } from 'vitest'
import {
  analizarZona,
  calcularAmarre,
  cotaDeSuperficie,
  curvasDeNivel,
  lineaDeCapa,
  nivelARegistrar,
  perfilDeLinea,
  puestaDeLibreta,
  separacionEntreLineas,
  triangular,
  type LineaNivel,
  type Punto2,
} from '@topo/core'
import { leerPuntos, type LecturaDePuntos } from '../puntos/lectores'
import { paresPorNombre, puntosATerreno } from '../puntos/aTerreno'
import { leerDxf } from '../planos/dxf'
import { curvasADxf } from '../planos/terrenoADxf'
import { datosDeEstacasDesdeNiveles } from '../informes'
import { construirObraSimulada, IDS } from './obraSimulada'

// ─── Muestras, leídas con Node dentro de la prueba ────────────────────────

interface ArchivosDeNode {
  existsSync(ruta: string): boolean
  readFileSync(ruta: string, codificacion: 'utf8'): string
}
declare const process: { cwd(): string; getBuiltinModule(nombre: string): unknown }

function leerMuestra(nombre: string): string {
  const fs = process.getBuiltinModule('node:fs') as ArchivosDeNode
  const relativa = `src/pruebas/muestras/${nombre}`
  const desdeElPaquete = `${process.cwd()}/${relativa}`
  const ruta = fs.existsSync(desdeElPaquete) ? desdeElPaquete : `${process.cwd()}/packages/app/${relativa}`
  return fs.readFileSync(ruta, 'utf8')
}

function punto(l: LecturaDePuntos, id: string) {
  const p = l.puntos.find((x) => x.id === id)
  if (!p) throw new Error(`no está el punto ${id}`)
  return p
}

// ─── Terreno ──────────────────────────────────────────────────────────────

describe('terreno de extremo a extremo: archivos → superficie → curvas → zona → perfil → DXF', () => {
  // Estación en sistema local (E1 = 1000 / 5000, cota supuesta 3250).
  const local = leerPuntos(leerMuestra('estacion-pnezd.csv'))
  // Estación en UTM 18 S (Leica GSI-16), con la misma estación E1.
  const gsi = leerPuntos(leerMuestra('estacion-leica-gsi16.gsi'))
  // GNSS en UTM 18 S, con su solución por punto.
  const gnss = leerPuntos(leerMuestra('gnss-utm18s-huancayo.csv'))

  // Amarre: E1 está en los dos archivos (mismo nombre). El atrás E2 se midió
  // con GNSS en (476812.874, 8665465.312): con eso el local queda solo
  // trasladado, sin giro.
  const pares = paresPorNombre(local.puntos, gsi.puntos)
  const e2 = punto(local, 'E2')
  const amarre = calcularAmarre([...pares, { id: 'E2', origen: { x: e2.x, y: e2.y }, destino: { x: 476812.874, y: 8665465.312 } }])
  // La cota local partió de 3250 supuesto en E1; el GSI le da 3253.500.
  const desplazamientoCota = punto(gsi, 'E1').z! - punto(local, 'E1').z!

  const deLocal = puntosATerreno(local.puntos, {
    origen: 'estacion',
    comprobado: false, // cota supuesta, sin cierre
    amarre: amarre.amarre,
    desplazamientoCota,
    prefijoId: 'L-',
  })
  const deGsi = puntosATerreno(gsi.puntos, { origen: 'estacion', comprobado: true })
  const deGnss = puntosATerreno(gnss.puntos, { origen: 'gnss', comprobado: true })
  const sup = triangular([...deGsi.puntos, ...deLocal.puntos, ...deGnss.puntos])

  it('lee los tres archivos y propone UTM solo para los que lo son', () => {
    expect(local.puntos).toHaveLength(10) // el 7 trae una «O» por cero: avisado, no leído
    expect(local.avisos.some((a) => a.linea === 11)).toBe(true)
    expect(local.sistema.tipo).toBe('local')
    expect(gsi.formato).toBe('gsi16')
    expect(gsi.sistema.tipo).toBe('utm')
    expect(gnss.sistema.tipo).toBe('utm')
  })

  it('amarra el local a UTM por E1 (mismo nombre) y E2: traslación pura, escala 1, sin residuos', () => {
    expect(pares.map((p) => p.id)).toEqual(['E1'])
    const a = amarre.amarre!
    expect(a.escala).toBe(1)
    expect(a.rotacionGrados).toBeCloseTo(0, 6)
    expect(a.tx).toBeCloseTo(475800, 6)
    expect(a.ty).toBeCloseTo(8660420, 6)
    expect(amarre.escalaLibre).toBeCloseTo(1, 9)
    expect(amarre.rmsM!).toBeLessThan(1e-6)
    expect(amarre.avisos).toEqual([])
    expect(desplazamientoCota).toBeCloseTo(3.5, 9)
  })

  it('pasa los puntos al motor sin perder ninguno en silencio', () => {
    expect(deLocal.puntos).toHaveLength(9)
    expect(deLocal.avisos[0]).toBe('Un punto no tiene cota y no entra a la superficie: L-8 (línea 12).')
    expect(deLocal.avisos).toContain('A todas las cotas se les sumó +3.500 m.')
    const l1 = deLocal.puntos.find((p) => p.id === 'L-1')!
    expect(l1.x).toBeCloseTo(476804.118, 6)
    expect(l1.y).toBeCloseTo(8665423.215, 6)
    expect(l1.z).toBeCloseTo(3253.372, 9)
    expect(deGsi.avisos).toEqual(['Un punto no tiene cota y no entra a la superficie: 1008 (línea 9).'])
    // G7 es FLOTANTE: entra, pero no comprobado. G8 no tiene norte y el lector ya lo avisó.
    expect(deGnss.avisos).toEqual(['Sin solución fija, entran como no comprobados: G7 (FLOTANTE).'])
    expect(deGnss.puntos.find((p) => p.id === 'G7')!.comprobado).toBe(false)
    expect(deGnss.puntos.find((p) => p.id === 'G1')!.comprobado).toBe(true)
  })

  it('triangula los tres juntos y avisa el duplicado, el punto repetido y el borde quitado', () => {
    expect(sup.puntos).toHaveLength(25)
    expect(sup.triangulos).toHaveLength(30)
    expect(sup.avisos.map((a) => a.tipo)).toEqual(['duplicado', 'cercanos', 'lado-maximo'])
    const dup = sup.avisos[0]!
    // E1 del GSI (comprobado) y E1 del local amarrado caen en el mismo sitio con la misma cota.
    expect(dup).toMatchObject({ tipo: 'duplicado', conservado: 'E1', descartado: 'L-E1' })
    expect(dup.tipo === 'duplicado' && Math.abs(dup.diferenciaZ)).toBeLessThan(1e-9)
    const borde = sup.avisos[2]!
    expect(borde.tipo === 'lado-maximo' && borde.puntosSueltos).toEqual(['L-E2'])
    expect(sup.triangulos.some((t) => t.comprobado)).toBe(true)
    expect(sup.triangulos.some((t) => !t.comprobado)).toBe(true)
  })

  const curvas = curvasDeNivel(sup, { intervalo: 0.5, rotular: 'todas', separacionRotulos: 10 })

  it('saca las curvas cada 0.5 m, con lo no comprobado marcado por tramo', () => {
    expect(curvas.cotaMin).toBeCloseTo(3253.372, 6)
    expect(curvas.cotaMax).toBeCloseTo(3254.218, 6)
    expect(curvas.curvas.map((c) => c.cota)).toEqual([3253.5, 3254, 3254])
    for (const c of curvas.curvas) {
      expect(c.maestra).toBe(false) // maestras cada 2.5 m
      expect(c.tramosComprobados).toHaveLength(c.puntos.length - 1)
      expect(c.comprobada).toBe(c.tramosComprobados.every(Boolean))
      expect(c.rotulos.length).toBeGreaterThan(0)
      // cada vértice de la curva está sobre la superficie, a su cota
      for (const p of c.puntos) expect(cotaDeSuperficie(sup, p.x, p.y)!.z).toBeCloseTo(c.cota, 6)
    }
    expect(curvas.curvas.some((c) => c.tramosComprobados.some(Boolean))).toBe(true)
  })

  const zona: Punto2[] = [
    { x: 476810, y: 8665425 },
    { x: 476840, y: 8665425 },
    { x: 476840, y: 8665450 },
    { x: 476810, y: 8665450 },
  ]

  it('recorta las curvas a la zona: ningún vértice queda fuera', () => {
    const recortadas = curvasDeNivel(sup, { intervalo: 0.5, zona })
    expect(recortadas.curvas.length).toBeGreaterThan(0)
    for (const c of recortadas.curvas) {
      for (const p of c.puntos) {
        expect(p.x).toBeGreaterThanOrEqual(476810 - 1e-6)
        expect(p.x).toBeLessThanOrEqual(476840 + 1e-6)
        expect(p.y).toBeGreaterThanOrEqual(8665425 - 1e-6)
        expect(p.y).toBeLessThanOrEqual(8665450 + 1e-6)
      }
    }
  })

  it('da el volumen de la zona a la cota 3253.80: corte − relleno = (cota media − 3253.80) × área', () => {
    const r = analizarZona(sup, zona, { referencia: 3253.8 })
    expect(r.sinDatos).toBe(false)
    expect(r.areaPlanta).toBeCloseTo(750, 9)
    expect(r.areaConSuperficie + r.areaSinSuperficie).toBeCloseTo(750, 6)
    expect(r.areaConSuperficie).toBeCloseTo(170.0, 1)
    expect(r.comprobado).toBe(false)
    expect(r.areaNoComprobada).toBeGreaterThan(0)
    expect(r.areaNoComprobada).toBeLessThan(r.areaConSuperficie)
    expect(r.volumenCorte).toBeCloseTo(19.59, 2)
    expect(r.volumenRelleno).toBeCloseTo(4.51, 2)
    expect(r.volumenCorte - r.volumenRelleno).toBeCloseTo((r.cotaMedia! - 3253.8) * r.areaConSuperficie, 6)
    expect(r.cotaMin!).toBeGreaterThanOrEqual(curvas.cotaMin! - 1e-9)
    expect(r.cotaMax!).toBeLessThanOrEqual(curvas.cotaMax! + 1e-9)
  })

  // Una línea que cruza la franja levantada: empieza y termina fuera.
  const linea: Punto2[] = [
    { x: 476831, y: 8665429 },
    { x: 476819, y: 8665447 },
  ]
  const perfil = perfilDeLinea(sup, linea)

  it('saca el perfil por la línea, sin inventar cota fuera de la superficie', () => {
    expect(perfil.sinDatos).toBe(false)
    expect(perfil.longitud).toBeCloseTo(Math.hypot(12, 18), 9)
    expect(perfil.tramos[0]!.dentro).toBe(false)
    expect(perfil.tramos[perfil.tramos.length - 1]!.dentro).toBe(false)
    expect(perfil.fueraDeSuperficie).toBeCloseTo(17.15, 2)
    for (const p of perfil.puntos) {
      if (p.z === null) continue
      expect(p.z).toBeCloseTo(cotaDeSuperficie(sup, p.x, p.y)!.z, 6)
    }
  })

  it('lo exporta a DXF y el lector de la app lo vuelve a leer igual', () => {
    const salida = curvasADxf({ curvas, puntos: sup.puntos, perfil })
    const plano = leerDxf(salida.texto)

    // Curvas: cada pieza vuelve con su cota como elevación y en la capa que dice su comprobación.
    const deCurvas = plano.polilineas.filter((p) => p.capa.startsWith('CURVAS'))
    expect(new Set(deCurvas.map((p) => p.elevacion))).toEqual(new Set([3253.5, 3254]))
    const vertices = (cota: number) =>
      deCurvas.filter((p) => p.elevacion === cota).reduce((s, p) => s + p.puntos.length - 1, 0)
    for (const cota of [3253.5, 3254]) {
      const tramos = curvas.curvas.filter((c) => c.cota === cota).reduce((s, c) => s + c.puntos.length - 1, 0)
      expect(vertices(cota)).toBe(tramos)
    }
    expect(deCurvas.some((p) => p.capa === 'CURVAS')).toBe(true)
    expect(deCurvas.some((p) => p.capa === 'CURVAS_NO_COMPROBADAS')).toBe(true)
    // Un vértice cualquiera vuelve al milímetro.
    const v = curvas.curvas[0]!.puntos[0]!
    const leido = deCurvas.flatMap((p) => p.puntos).find((q) => Math.hypot(q.x - v.x, q.y - v.y) < 0.001)
    expect(leido).toBeDefined()

    // Perfil: su trazo en planta, en la capa de no comprobado (sus triángulos tienen puntos sin comprobar).
    const perfiles = plano.polilineas.filter((p) => p.capa.startsWith('PERFIL'))
    expect(perfiles).toHaveLength(1)
    expect(perfiles[0]!.capa).toBe('PERFIL_NO_COMPROBADO')
    const conCota = perfil.puntos.filter((p) => p.z !== null)
    expect(perfiles[0]!.puntos[0]!.x).toBeCloseTo(conCota[0]!.x, 3)
    expect(perfiles[0]!.puntos.at(-1)!.y).toBeCloseTo(conCota.at(-1)!.y, 3)

    // Puntos: el lector de la app no dibuja POINT, pero los cuenta; sus nombres vuelven como texto.
    expect(plano.ignoradas).toEqual({ POINT: sup.puntos.length })
    const textos = plano.textos.map((t) => t.texto)
    expect(textos).toContain('E1')
    expect(textos).toContain('G7 (no comprobado)')
    expect(textos).toContain('L-1 (no comprobado)')
    expect(textos.filter((t) => t.startsWith('3254.00'))).toHaveLength(
      curvas.curvas.filter((c) => c.cota === 3254).reduce((s, c) => s + c.rotulos.length, 0),
    )
    expect(plano.unidades).toBe('m')
    expect(salida.avisos.some((a) => a.includes('PUNTOS_NO_COMPROBADOS'))).toBe(true)
  })
})

// ─── Niveles de la capa siguiente: la herramienta de Max ──────────────────

describe('niveles en la obra simulada: Av. Sol, BASE sobre SUBRASANTE', () => {
  const { proyecto } = construirObraSimulada()
  const linea = (capa: string, punto: string): LineaNivel => {
    const l = lineaDeCapa(proyecto, IDS.avSol, capa, punto)
    if (!l) throw new Error(`no hay línea ${capa} ${punto}`)
    expect(l.avisos).toEqual([])
    return l.linea
  }

  it('arma las líneas desde las tomas cerradas, comprobadas punto a punto', () => {
    const sub = linea(IDS.capaSubrasante, 'Eje')
    expect(sub.puntos.map((p) => p.progresiva)).toEqual([0, 20, 40, 60, 80, 100, 120])
    expect(sub.puntos.every((p) => p.comprobado)).toBe(true)
    expect(sub.puntos[4]!.cota).toBeCloseTo(3243.674, 9)
  })

  it('separación BASE − SUBRASANTE (mínimo 0.20 m, tolerancia 10 mm): el eje en 0+080 no cumple', () => {
    const eje = separacionEntreLineas(linea(IDS.capaBase, 'Eje'), linea(IDS.capaSubrasante, 'Eje'), 0.2, {
      toleranciaMm: 10,
    })
    if (!eje.ok) throw new Error(eje.error)
    expect(eje.desde).toBe(0)
    expect(eje.hasta).toBe(120)
    expect(eje.puntos.map((p) => Math.round(p.separacion * 1000))).toEqual([196, 196, 200, 194, 152, 199, 198])
    // La subrasante quedó 52 mm alta en el eje de 0+080: la base salió delgada.
    expect(eje.critico.progresiva).toBe(80)
    expect(eje.critico.separacion).toBeCloseTo(0.152, 9)
    expect(eje.critico.simbolo).toBe('✗')
    expect(eje.noCumplen.map((p) => p.progresiva)).toEqual([80])
    expect(eje.cumple).toBe(false)
    expect(eje.simbolo).toBe('✗')
    expect(eje.comprobado).toBe(true)

    // Borde derecho: en 0+080 faltan 14 mm (más que la tolerancia, menos que el doble) → △.
    const der = separacionEntreLineas(
      linea(IDS.capaBase, 'Borde derecho'),
      linea(IDS.capaSubrasante, 'Borde derecho'),
      0.2,
      { toleranciaMm: 10 },
    )
    if (!der.ok) throw new Error(der.error)
    expect(der.critico.progresiva).toBe(80)
    expect(der.critico.separacion).toBeCloseTo(0.186, 9)
    expect(der.simbolo).toBe('△')

    // Borde izquierdo: lo peor es 0+080 con 10 mm de menos, justo la tolerancia → ✓.
    const izq = separacionEntreLineas(
      linea(IDS.capaBase, 'Borde izquierdo'),
      linea(IDS.capaSubrasante, 'Borde izquierdo'),
      0.2,
      { toleranciaMm: 10 },
    )
    if (!izq.ok) throw new Error(izq.error)
    expect(izq.critico.separacion).toBeCloseTo(0.19, 9)
    expect(izq.simbolo).toBe('✓')
  })

  it('nivel a registrar de la base = subrasante del eje + 0.20 m, con puesta rápida (no comprobada)', () => {
    const sub = linea(IDS.capaSubrasante, 'Eje')
    const r = nivelARegistrar({
      linea: sub,
      otras: [linea(IDS.capaSubrasante, 'Borde izquierdo'), linea(IDS.capaSubrasante, 'Borde derecho')],
      progresivas: [0, 10, 80, 130, 150],
      ai: { tipo: 'rapida', cotaBM: 3245.18, lecturaAtras: 1.287 },
      desplazamientoM: 0.2,
      instrumento: proyecto.instrumento,
    })
    expect(r.linea).toBe('SUBRASANTE · Eje + 0.200 m')
    expect(r.alturaInstrumental).toBe(3246.467)
    expect(r.comprobado).toBe(false)
    const [f0, f10, f80, f130, f150] = r.filas
    expect([f0!.cota, f0!.lecturaM]).toEqual([3244.105, 2.362])
    // 0+010 entre 0+000 (3243.905) y 0+020 (3243.833), más 0.20.
    expect([f10!.cota, f10!.lecturaM, f10!.como]).toEqual([3244.069, 2.398, 'interpolado'])
    expect([f80!.cota, f80!.lecturaM]).toEqual([3243.874, 2.593])
    // 10 m más allá del último punto: se prolonga el tramo extremo y se dice.
    expect(f130!.como).toBe('extrapolado')
    expect(f130!.cota).toBe(3243.646)
    expect(f130!.avisos[0]).toMatch(/^extrapolado a 10 m del punto extremo \(0\+120\)/)
    // 30 m: pasa el máximo de 20 m, no se da cota.
    expect(f150!.cota).toBeNull()
    expect(f150!.motivoSinCota).toBe('a 30 m de lo medido (máx. 20 m)')
    expect(r.filas.every((f) => !f.comprobado)).toBe(true)
  })

  it('con la AI de la libreta (última estación de la base, cerrada) lo interpolado sale comprobado y va a la hoja de estacas', () => {
    const puesta = puestaDeLibreta(proyecto, IDS.tomaSolBase, 3)
    if (!puesta || puesta.tipo !== 'libreta') throw new Error('sin puesta de libreta')
    expect(puesta.comprobado).toBe(true)
    const r = nivelARegistrar({
      linea: linea(IDS.capaSubrasante, 'Eje'),
      progresivas: [10, 130],
      ai: puesta,
      desplazamientoM: 0.2,
      instrumento: proyecto.instrumento,
    })
    // El conjunto no: una de sus filas es extrapolada.
    expect(r.comprobado).toBe(false)
    const [f10, f130] = r.filas
    expect(f10!.cota).toBe(3244.069)
    expect(f10!.lecturaM).toBeCloseTo(puesta.alturaInstrumental - 3244.069, 9)
    expect(f10!.comprobado).toBe(true)
    // Lo extrapolado nunca está comprobado: nadie lo midió.
    expect(f130!.comprobado).toBe(false)

    const hoja = datosDeEstacasDesdeNiveles(r)
    expect(hoja.alturaInstrumental).toBe(puesta.alturaInstrumental)
    expect(hoja.filas).toHaveLength(2)
    expect(hoja.comprobado).toBe(false)

    // Solo con lo interpolado, el resultado entero sale comprobado.
    const soloMedido = nivelARegistrar({
      linea: linea(IDS.capaSubrasante, 'Eje'),
      progresivas: [10, 70],
      ai: puesta,
      desplazamientoM: 0.2,
      instrumento: proyecto.instrumento,
    })
    expect(soloMedido.comprobado).toBe(true)
    expect(datosDeEstacasDesdeNiveles(soloMedido).comprobado).toBe(true)
  })
})
