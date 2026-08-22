import { claveCelda } from '../grilla/grilla'
import { proyectarPunto, type Camara, type PuntoProyectado } from './proyeccion'

export interface VerticeMalla {
  progresiva: number
  offset: number
  cota: number
}

export interface CaraMalla {
  clave: string
  esquinas: [VerticeMalla, VerticeMalla, VerticeMalla, VerticeMalla]
  progresivaDesde: number
  progresivaHasta: number
  elementoDesde: string
  elementoHasta: string
}

export interface EntradaMalla {
  /** Ordenadas de menor a mayor. */
  progresivas: number[]
  /** En orden de offset, como los da `armarEsqueletoTabla`. */
  elementos: string[]
  offsets: Map<string, number>
  /** La cota medida de una celda, o null si no se midió. */
  cotaDe: (clave: string) => number | null
}

/**
 * Convierte la grilla en cuadros dibujables: cada cara va entre dos progresivas
 * consecutivas y dos elementos consecutivos.
 *
 * Una cara solo se forma si **sus cuatro esquinas tienen cota**. Es la misma
 * regla que ya rige el sombreado del corte transversal y el relleno entre capas:
 * no se inventa superficie donde no se midió. Un hueco en el modelo es
 * información, no un fallo del dibujo.
 */
export function armarCaras(entrada: EntradaMalla): CaraMalla[] {
  const { progresivas, elementos, offsets, cotaDe } = entrada
  const caras: CaraMalla[] = []

  for (let p = 0; p < progresivas.length - 1; p += 1) {
    for (let e = 0; e < elementos.length - 1; e += 1) {
      const progresivaDesde = progresivas[p]!
      const progresivaHasta = progresivas[p + 1]!
      const elementoDesde = elementos[e]!
      const elementoHasta = elementos[e + 1]!

      const esquinas: VerticeMalla[] = []
      let completa = true

      for (const [progresiva, elemento] of [
        [progresivaDesde, elementoDesde],
        [progresivaDesde, elementoHasta],
        [progresivaHasta, elementoHasta],
        [progresivaHasta, elementoDesde],
      ] as const) {
        const cota = cotaDe(claveCelda(progresiva, elemento))
        if (cota === null) {
          completa = false
          break
        }
        esquinas.push({ progresiva, offset: offsets.get(elemento) ?? 0, cota })
      }

      if (!completa) continue

      caras.push({
        clave: `${claveCelda(progresivaDesde, elementoDesde)}>${claveCelda(progresivaHasta, elementoHasta)}`,
        esquinas: esquinas as CaraMalla['esquinas'],
        progresivaDesde,
        progresivaHasta,
        elementoDesde,
        elementoHasta,
      })
    }
  }

  return caras
}

export interface CaraProyectada {
  cara: CaraMalla
  puntos: PuntoProyectado[]
  profundidad: number
}

/**
 * Proyecta las caras y las devuelve **de atrás hacia delante**, para que quien
 * dibuje en ese orden deje lo cercano encima de lo lejano. La profundidad de una
 * cara es la media de sus esquinas: con cuadros de este tamaño no hace falta
 * nada más fino, y evita el parpadeo de comparar por una sola esquina.
 */
export function proyectarCaras(caras: CaraMalla[], camara: Camara): CaraProyectada[] {
  return caras
    .map((cara) => {
      const puntos = cara.esquinas.map((e) => proyectarPunto(e.offset, e.progresiva, e.cota, camara))
      const profundidad = puntos.reduce((suma, p) => suma + p.profundidad, 0) / puntos.length
      return { cara, puntos, profundidad }
    })
    .sort((a, b) => a.profundidad - b.profundidad)
}
