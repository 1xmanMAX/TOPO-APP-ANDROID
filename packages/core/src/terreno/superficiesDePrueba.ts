import type { PuntoTerreno } from './triangulacion'

/*
 * Superficies de resultado conocido para las pruebas de terreno: un plano
 * inclinado, un cono y una nube al azar repetible. Solo las usan las pruebas.
 */

/** Grilla cuadrada de `desde` a `hasta` con paso `paso`, cota dada por `z(x, y)`. */
export function grilla(
  desde: number,
  hasta: number,
  paso: number,
  z: (x: number, y: number) => number,
  comprobado: (x: number, y: number) => boolean = () => true,
): PuntoTerreno[] {
  const puntos: PuntoTerreno[] = []
  const n = Math.round((hasta - desde) / paso)
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const x = desde + i * paso
      const y = desde + j * paso
      puntos.push({ id: `P${i}-${j}`, x, y, z: z(x, y), origen: 'estacion', comprobado: comprobado(x, y) })
    }
  }
  return puntos
}

/** Plano que sube 0.25 m por metro hacia el este: cota 100.1 en x = 0. */
export const plano = (x: number): number => 100.1 + 0.25 * x

/**
 * Cono con la punta en (0, 0) a cota `punta` y que baja 1 m por metro: anillos
 * cada metro de radio, con un punto cada ~0.5 m de arco.
 */
export function cono(punta: number, radioMax: number): PuntoTerreno[] {
  const puntos: PuntoTerreno[] = [{ id: 'C0', x: 0, y: 0, z: punta, origen: 'gnss', comprobado: true }]
  for (let r = 1; r <= radioMax; r++) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / 0.5))
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n
      puntos.push({
        id: `C${r}-${k}`,
        x: r * Math.cos(a),
        y: r * Math.sin(a),
        z: punta - r,
        origen: 'gnss',
        comprobado: true,
      })
    }
  }
  return puntos
}

/** Nube al azar repetible (generador congruencial) en un cuadrado de `lado` m. */
export function nubeAlAzar(cantidad: number, lado: number, semilla = 12345): PuntoTerreno[] {
  let s = semilla >>> 0
  const azar = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
  const puntos: PuntoTerreno[] = []
  for (let i = 0; i < cantidad; i++) {
    const x = azar() * lado
    const y = azar() * lado
    puntos.push({
      id: `N${i}`,
      x,
      y,
      z: 100 + 3 * Math.sin(x / 40) + 2 * Math.cos(y / 25),
      origen: 'estacion',
      comprobado: true,
    })
  }
  return puntos
}
