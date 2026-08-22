/**
 * Cómo se mira la calle. Los ángulos van en grados porque es lo que se enseña
 * y se escribe en la pantalla; convertir a radianes es cosa de aquí dentro.
 */
export interface Camara {
  /** Vuelta alrededor del eje vertical, en grados. */
  giro: number
  /** Altura de la cámara sobre el horizonte: 90 es planta pura, 0 es alzado. */
  inclinacion: number
  /**
   * Cuánto se estiran las cotas. Sin esto la calle se ve plana: 180 m de calle
   * ocupan 73.5 unidades de pantalla y un metro de desnivel ocupa 0.8, que es
   * el 1.1 %. Con 25 pasa a ser el 27.8 %, que ya se lee.
   */
  exageracion: number
}

export interface PuntoProyectado {
  x: number
  y: number
  /** Cuanto mayor, más cerca de quien mira. Sirve para tapar lo de atrás. */
  profundidad: number
}

export const CAMARA_ISOMETRICA: Camara = { giro: 45, inclinacion: 35.264, exageracion: 25 }
export const CAMARA_PLANTA: Camara = { giro: 0, inclinacion: 90, exageracion: 25 }
export const CAMARA_ALZADO: Camara = { giro: 0, inclinacion: 0, exageracion: 25 }

const aRadianes = (grados: number): number => (grados * Math.PI) / 180

/**
 * Lleva un punto de la calle a la pantalla, en proyección axonométrica.
 *
 * `x` es el offset transversal en metros (positivo a la derecha del eje), `y`
 * la progresiva, y `z` la cota. En pantalla el eje vertical crece hacia abajo,
 * por eso la cota entra restando: más cota, más arriba.
 */
export function proyectarPunto(x: number, y: number, z: number, camara: Camara): PuntoProyectado {
  const g = aRadianes(camara.giro)
  const i = aRadianes(camara.inclinacion)
  const alto = z * camara.exageracion

  const horizontal = x * Math.cos(g) - y * Math.sin(g)
  const hacia = x * Math.sin(g) + y * Math.cos(g)

  return {
    x: horizontal,
    y: hacia * Math.sin(i) - alto * Math.cos(i),
    profundidad: hacia * Math.cos(i) + alto * Math.sin(i),
  }
}
