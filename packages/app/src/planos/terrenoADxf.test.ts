import { describe, expect, it } from 'vitest'
import { curvasDeNivel, perfilDeLinea, triangular, type PuntoTerreno } from '@topo/core'
import { leerDxf } from './dxf'
import { curvasADxf, perfilEnPlanta, puntosASalida } from './terrenoADxf'

/** Plano inclinado 10 × 10 m (z = 100 + 0.1·x), con la mitad este sin comprobar. */
function grilla(): PuntoTerreno[] {
  const puntos: PuntoTerreno[] = []
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      puntos.push({ id: `${i}-${j}`, x: i, y: j, z: 100 + 0.1 * i, origen: 'estacion', comprobado: i <= 5 })
    }
  }
  return puntos
}

describe('curvasADxf', () => {
  const sup = triangular(grilla())
  const curvas = curvasDeNivel(sup, { intervalo: 0.25, rotular: 'todas', separacionRotulos: 5 })

  it('escribe cada curva con su cota y separa lo no comprobado', () => {
    const plano = leerDxf(curvasADxf({ curvas }).texto)
    // 100.25 … 100.75: x = 2.5, 5, 7.5 (100.00 y 101.00 caen en el borde del plano)
    const porCota = new Map<number, string[]>()
    for (const p of plano.polilineas) porCota.set(p.elevacion!, [...(porCota.get(p.elevacion!) ?? []), p.capa])
    expect(porCota.get(100.25)).toEqual(['CURVAS'])
    expect(porCota.get(100.75)).toEqual(['CURVAS_NO_COMPROBADAS'])
    expect(plano.polilineas.every((p) => p.puntos.every((q) => q.x >= 0 && q.x <= 10))).toBe(true)
  })

  it('acepta el resultado de curvasDeNivel o solo sus curvas', () => {
    expect(curvasADxf({ curvas }).texto).toBe(curvasADxf({ curvas: curvas.curvas }).texto)
  })

  it('los puntos llevan su nombre y su comprobación', () => {
    expect(puntosASalida(sup.puntos.slice(0, 1))).toEqual([{ x: 0, y: 0, z: 100, nombre: '0-0', comprobado: true }])
  })
})

describe('perfilEnPlanta', () => {
  const sup = triangular(grilla())

  it('dibuja solo donde hay superficie y marca los tramos no comprobados', () => {
    const perfil = perfilDeLinea(sup, [
      { x: -2, y: 5.5 },
      { x: 12, y: 5.5 },
    ])
    const piezas = perfilEnPlanta(perfil)
    expect(piezas).toHaveLength(1)
    const [pieza] = piezas
    expect(pieza!.puntos[0]).toEqual({ x: 0, y: 5.5 })
    expect(pieza!.puntos.at(-1)).toEqual({ x: 10, y: 5.5 })
    expect(pieza!.comprobado).toBe(false)
    expect(pieza!.tramosComprobados!.some(Boolean)).toBe(true)
    expect(pieza!.tramosComprobados).toHaveLength(pieza!.puntos.length - 1)
  })

  it('una línea totalmente fuera no dibuja nada', () => {
    expect(perfilEnPlanta(perfilDeLinea(sup, [{ x: 20, y: 20 }, { x: 30, y: 30 }]))).toEqual([])
  })
})
