import type { FilaNivel, ResultadoNivelARegistrar } from '@topo/core'
import type { DatosEstacas, FilaEstaca } from './tipos'

/** Cómo se nombra la fila: la línea registrada y, si no salió de ella misma, de dónde salió. */
function nombreDeFila(linea: string, f: FilaNivel): string {
  if (f.como === 'proyectado') return `${linea} (proyectado desde ${f.desde})`
  if (f.como === 'extrapolado') return `${linea} (extrapolado)`
  return linea
}

/**
 * Pasa el «nivel a registrar» del motor (`nivelARegistrar`, la herramienta de
 * Max) a los datos de la hoja de estacas, igual que `datosDeEstacasDesdeHoja`
 * hace con el replanteo. La cota a registrar va en la columna de cota de
 * proyecto, y la lectura del motor en la de lectura objetivo, en metros: la
 * hoja no la recalcula. El sentido de la mira viaja (`sentidoMira`), así la
 * hoja imprime la fórmula y la regla de corta y rellena que corresponden: con
 * la mira invertida, marcar más que el objetivo es que sobra, no que falta.
 * La comprobación viaja: con una puesta rápida, una línea sin cerrar o una
 * cota proyectada o extrapolada, la hoja sale con la franja.
 */
export function datosDeEstacasDesdeNiveles(
  resultado: ResultadoNivelARegistrar,
): Pick<DatosEstacas, 'alturaInstrumental' | 'filas' | 'avisos' | 'comprobado' | 'mira' | 'sentidoMira'> {
  const avisos = [
    `Cota proyecto = cota a registrar de ${resultado.linea}.`,
    ...resultado.avisos,
  ]
  if (resultado.forma.unidad !== 'm') {
    avisos.push(`Las lecturas de esta hoja van en metros (en campo se lee en ${resultado.forma.unidad}).`)
  }
  if (resultado.filas.some((f) => f.como === 'proyectado')) {
    avisos.push(
      'Proyectado: la línea no tiene puntos en esa progresiva; se siguen las pendientes de la línea indicada. ' +
        'No comprobado.',
    )
  }
  if (resultado.filas.some((f) => f.como === 'extrapolado')) {
    avisos.push(
      'Extrapolado: ninguna otra línea cubre esa progresiva; se prolonga la pendiente del tramo extremo. ' +
        'No comprobado.',
    )
  }

  return {
    alturaInstrumental: resultado.alturaInstrumental,
    comprobado: resultado.comprobado,
    mira: { ...resultado.mira },
    sentidoMira: resultado.forma.mira,
    avisos,
    filas: resultado.filas.map((f): FilaEstaca => ({
      progresiva: f.progresiva,
      punto: nombreDeFila(resultado.linea, f),
      cotaProyecto: f.cota,
      ...(f.cota === null ? { motivoSinCota: f.motivoSinCota ?? 'sin línea para proyectar' } : {}),
      lecturaObjetivo: f.lecturaM,
    })),
  }
}
