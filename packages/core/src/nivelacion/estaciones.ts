/**
 * Las tres reglas de la libreta que dicen con qué AI se cuenta en una estación
 * y si lo que salió de ella está comprobado. Vivían copiadas en la app
 * (`vistas/calle/comun.ts`) y en `campo/niveles.ts`; si una cambiaba, la otra
 * se quedaba atrás y «comprobado» dejaba de coincidir entre la pantalla y la
 * hoja. Ahora son una sola, aquí, y la app puede importarlas de '@topo/core'.
 */
import { claveCelda } from '../grilla/grilla'
import type { Lectura, Toma } from '../modelo/tipos'
import type { ResultadoCampania } from './calcularCampania'
import { correccionesDeLaToma } from './compensacion'

/**
 * Si lo calculado en una estación está respaldado por el cierre. No basta
 * con que el cierre pase: si la toma vuelve a arrancar en un BM a mitad de
 * camino, el cierre solo comprueba desde esa estación (`tramoComprobado`), y
 * las de antes siguen sin comprobar.
 */
export function estacionComprobada(resultado: ResultadoCampania, indiceEstacion: number): boolean {
  if (resultado.cierre.pasa !== true) return false
  const primera = resultado.tramoComprobado?.primeraEstacion
  return primera !== undefined && indiceEstacion >= primera
}

/**
 * La altura del instrumento con la que se cuenta en una estación: la cruda de
 * `calcularCampania` más, si el circuito cerró, la compensación de esa
 * estación (`correccionesDeLaToma`, la única regla de compensación del
 * motor). Si no cerró, es la de la libreta tal cual. `correccionMm` es lo
 * que se le sumó (0 si no se compensó). NaN si la estación no tiene AI.
 */
export function alturaInstrumentalDeEstacion(
  resultado: ResultadoCampania,
  toma: Toma,
  indiceEstacion: number,
): { altura: number; correccionMm: number } {
  const cruda = resultado.cotasInstrumento[indiceEstacion] ?? Number.NaN
  const { errorMm, pasa } = resultado.cierre
  if (pasa !== true || errorMm === null || !Number.isFinite(cruda)) return { altura: cruda, correccionMm: 0 }
  const correccion = correccionesDeLaToma(errorMm, toma)[indiceEstacion] ?? 0
  return { altura: cruda + correccion, correccionMm: Math.round(correccion * 1e4) / 10 }
}

/**
 * Para cada celda medida en la toma, la estación de su última lectura: la que
 * manda en su cota. Solo cuentan las intermedias y la vista adelante, que son
 * las que dan cota (`calcularCotas`); una vista atrás no la da. Se arma una
 * vez por toma: buscar celda por celda recorría toda la libreta cada vez.
 */
export function estacionesPorCelda(toma: Toma): Map<string, number> {
  const mapa = new Map<string, number>()
  const anotar = (lectura: Lectura | undefined, indice: number) => {
    if (lectura?.destino.tipo !== 'celda') return
    mapa.set(claveCelda(lectura.destino.celda.progresiva, lectura.destino.celda.elementoClave), indice)
  }
  toma.estaciones.forEach((estacion, indice) => {
    for (const l of estacion.intermedias) anotar(l, indice)
    anotar(estacion.vistaAdelante, indice)
  })
  return mapa
}

/** La estación de la última lectura que cayó en la celda. Null si no se midió. */
export function estacionDeCelda(toma: Toma, clave: string): number | null {
  return estacionesPorCelda(toma).get(clave) ?? null
}
