import { claveCelda, formatearProgresiva, type CaraMalla, type EstadoTolerancia, type Id } from '@topo/core'
import type { ModoVista3D } from '../estado/almacen'
import { useContextoDe, useEvaluacionRasante } from '../estado/derivados'
import { ETIQUETA_ESTADO, formatearDiferencia } from '../estadoRasante'

/**
 * Mismo orden que la leyenda de `Vista3D`: primero los tres estados de
 * tolerancia (de mejor a peor), luego los dos que no la evalúan. `sinMedir`
 * nunca aparece en la práctica — un tramo solo se dibuja con sus cuatro
 * esquinas medidas—, pero queda listado por si algún día deja de ser cierto.
 */
const ORDEN_ESTADOS: EstadoTolerancia[] = ['conforme', 'alLimite', 'fuera', 'sinRasante', 'sinMedir']

/** Una capa que `Vista3D` está dibujando, con cuántos tramos le tocaron tras el corte vivo. */
export interface CapaResumen {
  nombreCapa: string
  cantidad: number
}

interface Props {
  /**
   * Contra qué campaña se resume: la decide quien llama, nunca este
   * componente mirando `campaniaActivaId` en el almacén — mismo criterio que
   * `idCampaniaReferencia` en `Vista3D`, `MapaEstado`, `CorteTransversal` y
   * `TablaDiferencias`, y por la misma razón: ese argumento ("solo hay un
   * llamador hoy") ya costó cuatro rondas de arreglo repartidas entre las
   * cinco vistas que ya existen. Obligatoria, sin valor por defecto que lea
   * el almacén: `null` cuando no hay campaña activa que ofrecer como
   * referencia.
   */
  idCampaniaReferencia: Id | null
  /** En qué modo está `Vista3D`: decide qué narra este párrafo, ver más abajo. */
  modoVista3D: ModoVista3D
  /**
   * Exactamente las caras que `Vista3D` dibuja en modo estado, con el corte
   * vivo ya aplicado — el mismo arreglo que recorre para pintar los
   * polígonos, no una copia recalculada aquí. Vacío en modo capas.
   */
  caras: CaraMalla[]
  /**
   * Una entrada por capa que `Vista3D` está dibujando en modo capas, ya
   * contada sobre las caras con el corte vivo aplicado. Vacío en modo estado.
   */
  capas: CapaResumen[]
}

/**
 * El párrafo que dice con palabras lo que `Vista3D` enseña con formas: para
 * quien no ve el modelo en volumen (o no puede distinguir sus colores), esta
 * es la única manera de enterarse de qué hay dibujado y, en modo estado, de
 * que hay un problema y dónde está.
 *
 * No recalcula qué se dibuja: recibe de `Vista3D` las caras (modo estado) o
 * el recuento por capa (modo capas) ya resueltos con el mismo corte vivo que
 * aplica el dibujo, para que este párrafo nunca hable de un tramo que el
 * dibujo no pinta, ni calle uno que sí pinta.
 */
export default function ResumenVista3D({ idCampaniaReferencia, modoVista3D, caras, capas }: Props) {
  const evaluacion = useEvaluacionRasante(idCampaniaReferencia ?? '')
  const contexto = useContextoDe(idCampaniaReferencia)

  if (modoVista3D === 'capas') {
    if (capas.length === 0) return null

    // En modo capas los colores no significan tolerancia (lo dice el propio
    // comentario de `Vista3D`): aquí no hay conforme, al límite ni fuera que
    // narrar. Lo que hay es el avance de la obra — qué capas se están
    // dibujando y cuántos tramos tiene cada una.
    const detalleCapas = capas.map((capa) => `${capa.nombreCapa} (${capa.cantidad} tramos)`).join(', ')

    return (
      <p className="text-sm text-slate-600 dark:text-slate-300">
        El modelo dibuja {capas.length} capas: {detalleCapas}.
      </p>
    )
  }

  if (!evaluacion || caras.length === 0) return null

  // El párrafo dice dónde está la peor diferencia, y eso se lee: nombra el
  // punto con la palabra corta con la que Max lo escribe en su hoja («BI»),
  // nunca por el id interno con el que la cara lo identifica. Si el punto se
  // quedó sin palabras, cae al nombre; una clave que ya no corresponda a
  // ningún punto se enseña tal cual, que es lo único que quedó guardado de
  // ella.
  const nombresDeElemento = new Map(
    (contexto?.calle.seccion.puntos ?? []).map((punto) => [punto.id, punto.palabras[0] ?? punto.nombre]),
  )

  const conteos: Partial<Record<EstadoTolerancia, number>> = {}
  let peor: { etiqueta: string; diferenciaMm: number } | null = null

  for (const cara of caras) {
    // Mismo criterio de color que usa `Vista3D` al dibujar la cara: el
    // estado de su esquina "desde" — no de las cuatro. Un tramo con problema
    // en otra esquina se cuenta ahí, en la cara donde esa esquina sea la
    // suya, no en esta.
    const claveInicial = claveCelda(cara.progresivaDesde, cara.elementoDesde)
    const celda = evaluacion.celdas.get(claveInicial)!
    conteos[celda.estado] = (conteos[celda.estado] ?? 0) + 1

    if ((celda.estado === 'fuera' || celda.estado === 'alLimite') && celda.diferenciaMm !== null) {
      if (!peor || Math.abs(celda.diferenciaMm) > Math.abs(peor.diferenciaMm)) {
        peor = {
          etiqueta:
            `${formatearProgresiva(cara.progresivaDesde)} ` +
            `${nombresDeElemento.get(cara.elementoDesde) ?? cara.elementoDesde}`,
          diferenciaMm: celda.diferenciaMm,
        }
      }
    }
  }

  const detalleEstados = ORDEN_ESTADOS.filter((estado) => conteos[estado])
    .map((estado) => `${conteos[estado]} ${ETIQUETA_ESTADO[estado]}`)
    .join(', ')

  return (
    <p className="text-sm text-slate-600 dark:text-slate-300">
      El modelo dibuja {caras.length} tramos{detalleEstados ? `: ${detalleEstados}` : ''}.{' '}
      {peor
        ? `La mayor diferencia está en ${peor.etiqueta}: ${formatearDiferencia(peor.diferenciaMm)}.`
        : 'Todo dentro de tolerancia.'}
    </p>
  )
}
