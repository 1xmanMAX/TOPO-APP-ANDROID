import { construirGrilla, formatearProgresiva, partirClaveCelda, progresivasDeLaToma, redondear3 } from '@topo/core'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import ControlesVista3D from '../../componentes/ControlesVista3D'
import CorteTransversal from '../../componentes/CorteTransversal'
import MapaEstado from '../../componentes/MapaEstado'
import MapaGrilla, { type CeldaPintada } from '../../componentes/MapaGrilla'
import PerfilLongitudinal from '../../componentes/PerfilLongitudinal'
import Segmentado from '../../componentes/Segmentado'
import { BOTON_ICONO, CLASES_ESTADO } from '../../componentes/ui'
import { useEsCelular } from '../../componentes/useEsCelular'
import Vista3D from '../../componentes/Vista3D'
import { armarEsqueletoTabla } from '../../esqueletoTabla'
import { useAlmacen, type ModoCalle } from '../../estado/almacen'
import { useContexto, useProgresivas } from '../../estado/derivados'
import { useEvaluacionCalle, useResultadoCalle } from './resultadoCalle'

export type TipoVista = 'corte' | 'perfil' | '3d'

const VISTAS: { valor: TipoVista; texto: string }[] = [
  { valor: 'corte', texto: 'Corte' },
  { valor: 'perfil', texto: 'Perfil' },
  { valor: '3d', texto: '3D' },
]

/** La tarjeta del lienzo: blanca, borde fino, esquinas de 12 px. */
export const TARJETA_CALLE = 'flex min-w-0 flex-col gap-3 rounded-xl border border-borde bg-tarjeta px-3 py-3 sm:px-4'

/**
 * Las celdas del mapa de una calle SIN rasante: no hay semáforo, solo qué
 * está medido y qué falta. «Medida» lleva un símbolo neutro (●), no el ✓ de
 * conforme: sin proyecto no hay nada contra qué estar conforme.
 */
const MEDIDA = 'bg-borde text-tinta'
const FALTA = CLASES_ESTADO.sinMedir

/**
 * Las piezas que comparten el dibujo y el mapa. Todo cuelga de la misma
 * selección del almacén: tocar una celda del mapa, un punto del corte o del
 * perfil llama a `seleccionar`, que fija la celda y su progresiva; el corte
 * se va a esa progresiva, el mapa la marca y la ficha del modo la toma como
 * su punto. Por eso no hay estado propio de «punto elegido» en ninguna pieza.
 */
function useCalleComun(modo: ModoCalle) {
  const contexto = useContexto()
  const resultado = useResultadoCalle()
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const capasVisibles = useAlmacen((s) => s.capasVisibles)
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)
  const irAProgresiva = useAlmacen((s) => s.irAProgresiva)
  const progresivas = useProgresivas()
  const progresivaActiva = seleccion.progresiva ?? progresivas[0] ?? 0

  // Medir y Replantear dibujan solo la capa que se trabaja; Revisar respeta
  // las capas que se marcaron para comparar, si hay.
  const idsVisibles = useMemo(() => {
    if (modo === 'revisar' && capasVisibles.length > 0) return capasVisibles
    return campaniaActivaId ? [campaniaActivaId] : []
  }, [modo, capasVisibles, campaniaActivaId])

  const celdas = useMemo(
    () => (contexto ? construirGrilla(contexto.calle, progresivasDeLaToma(contexto.campania)) : []),
    [contexto],
  )
  const llenas = useMemo(() => new Set(resultado ? [...resultado.cotasPorCelda.keys()] : []), [resultado])

  /**
   * Mover el corte de progresiva mueve también el punto elegido: si no, la
   * ficha seguiría en la progresiva de antes y en Medir la lectura que se
   * escribe mirando el corte nuevo caería en una celda de otra progresiva.
   * En Medir se va a la primera celda que falte allí; si no falta ninguna,
   * o en los otros modos, al mismo elemento en la progresiva nueva.
   */
  const cambiarProgresiva = useCallback(
    (progresiva: number) => {
      const enEsa = celdas.filter((c) => redondear3(c.progresiva) === redondear3(progresiva))
      const elemento = seleccion.clave ? partirClaveCelda(seleccion.clave)?.elementoClave : undefined
      const pendiente = modo === 'medir' ? enEsa.find((c) => !llenas.has(c.clave)) : undefined
      const destino =
        pendiente ?? enEsa.find((c) => c.elementoClave === elemento) ?? (modo === 'medir' ? enEsa[0] : undefined)
      if (destino) seleccionar(destino.clave)
      else irAProgresiva(progresiva)
    },
    [celdas, llenas, modo, seleccion.clave, seleccionar, irAProgresiva],
  )

  return {
    contexto,
    resultado,
    campaniaActivaId,
    seleccion,
    seleccionar,
    progresivas,
    progresivaActiva,
    idsVisibles,
    llenas,
    cambiarProgresiva,
  }
}

function Flecha({ hacia }: { hacia: 'izquierda' | 'derecha' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <path d={hacia === 'izquierda' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}

interface PropsDibujo {
  modo: ModoCalle
  vista: TipoVista
  alCambiarVista: (vista: TipoVista) => void
  className?: string
}

/**
 * La tarjeta del dibujo de la calle: corte, perfil o 3D, con la progresiva
 * y sus flechas en la misma cabecera. Las flechas del teclado también
 * recorren las progresivas en la laptop.
 */
export function DibujoCalle({ modo, vista, alCambiarVista, className = '' }: PropsDibujo) {
  const { contexto, campaniaActivaId, seleccion, progresivas, progresivaActiva, idsVisibles, cambiarProgresiva } =
    useCalleComun(modo)

  // El perfil sigue al punto elegido; sin elegir, el eje.
  const puntos = contexto?.calle.seccion.puntos ?? []
  const [elementoPedido, setElementoPedido] = useState<string | null>(null)
  const elementoDeSeleccion = seleccion.clave ? partirClaveCelda(seleccion.clave)?.elementoClave : undefined
  const candidato = elementoPedido ?? elementoDeSeleccion
  const elementoPerfil = puntos.some((p) => p.id === candidato)
    ? candidato!
    : (puntos.find((p) => p.rol === 'eje')?.id ?? puntos[0]?.id ?? '')
  // Elegir un punto en otra vista vuelve a mandar sobre el desplegable.
  useEffect(() => setElementoPedido(null), [seleccion.clave])

  const indice = progresivas.findIndex((p) => redondear3(p) === redondear3(progresivaActiva))
  const anterior = indice > 0 ? progresivas[indice - 1] : undefined
  const siguiente = indice >= 0 && indice < progresivas.length - 1 ? progresivas[indice + 1] : undefined

  // Flechas del teclado para recorrer progresivas en la laptop, salvo
  // mientras se escribe en un campo.
  useEffect(() => {
    function alPresionar(evento: KeyboardEvent) {
      const objetivo = evento.target
      if (
        objetivo instanceof HTMLInputElement ||
        objetivo instanceof HTMLSelectElement ||
        objetivo instanceof HTMLTextAreaElement
      ) {
        return
      }
      if (evento.key === 'ArrowRight' && siguiente !== undefined) cambiarProgresiva(siguiente)
      if (evento.key === 'ArrowLeft' && anterior !== undefined) cambiarProgresiva(anterior)
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [anterior, siguiente, cambiarProgresiva])

  if (!contexto) return null

  return (
    <section aria-label="Dibujo de la calle" className={`${TARJETA_CALLE} ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado
          etiqueta="Vista de la calle"
          como="group"
          opciones={VISTAS}
          valor={vista}
          alCambiar={alCambiarVista}
          className="[&>button]:min-w-11"
        />
        {vista === 'perfil' && (
          <label className="flex min-w-0 items-center">
            <span className="sr-only">Elemento del perfil</span>
            <select
              value={elementoPerfil}
              onChange={(evento) => setElementoPedido(evento.target.value)}
              className="min-h-11 min-w-0 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-sm text-tinta"
            >
              {puntos.map((punto) => (
                <option key={punto.id} value={punto.id}>
                  {punto.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Progresiva anterior"
            disabled={anterior === undefined}
            onClick={() => anterior !== undefined && cambiarProgresiva(anterior)}
            className={`${BOTON_ICONO} disabled:opacity-40`}
          >
            <Flecha hacia="izquierda" />
          </button>
          <span className="numerico min-w-[4.75rem] text-center text-lg font-semibold">
            {formatearProgresiva(progresivaActiva)}
          </span>
          <button
            type="button"
            aria-label="Progresiva siguiente"
            disabled={siguiente === undefined}
            onClick={() => siguiente !== undefined && cambiarProgresiva(siguiente)}
            className={`${BOTON_ICONO} disabled:opacity-40`}
          >
            <Flecha hacia="derecha" />
          </button>
        </div>
      </div>

      {vista === 'corte' && (
        <CorteTransversal progresiva={progresivaActiva} idsVisibles={idsVisibles} idCampaniaReferencia={campaniaActivaId} />
      )}
      {vista === 'perfil' && <PerfilLongitudinal elementoClave={elementoPerfil} idCampaniaReferencia={campaniaActivaId} />}
      {vista === '3d' && (
        <>
          <ControlesVista3D />
          <Vista3D idCampaniaReferencia={campaniaActivaId} />
        </>
      )}
    </section>
  )
}

interface PropsMapa {
  modo: ModoCalle
  className?: string
}

/**
 * La tarjeta del mapa de la calle: una celda por punto y progresiva, con su
 * estado. En la cabecera, los conteos del semáforo (que hacen de leyenda) y,
 * si la nivelación no cerró, que nada de lo pintado está comprobado.
 *
 * El mapa es el mismo en los tres modos. La orientación la decide el ancho:
 * en el celular una progresiva por fila (los puntos caben a lo ancho); desde
 * la tablet un punto por fila y la calle entera a lo ancho, como en el lienzo.
 */
export function MapaCalle({ modo, className = '' }: PropsMapa) {
  const { contexto, resultado, campaniaActivaId, seleccion, seleccionar, llenas } = useCalleComun(modo)
  const evaluacion = useEvaluacionCalle(resultado)
  const esCelular = useEsCelular()
  const idTitulo = useId()
  const orientacion = esCelular ? 'porElemento' : 'porProgresiva'

  const esqueleto = useMemo(
    () => (contexto ? armarEsqueletoTabla(contexto.calle, progresivasDeLaToma(contexto.campania)) : null),
    [contexto],
  )
  const nombresPorClave = useMemo(
    () => new Map((esqueleto?.elementos ?? []).map((e) => [e.clave, e.nombre])),
    [esqueleto],
  )
  const pintarMedida = useCallback(
    (clave: string): CeldaPintada => {
      const partes = partirClaveCelda(clave)
      const nombre = partes
        ? `${formatearProgresiva(partes.progresiva)} ${nombresPorClave.get(partes.elementoClave) ?? partes.elementoClave}`
        : clave
      return llenas.has(clave)
        ? { simbolo: '●', etiqueta: `${nombre}: medida`, clases: MEDIDA }
        : { simbolo: '·', etiqueta: nombre, clases: FALTA }
    },
    [llenas, nombresPorClave],
  )

  if (!contexto) return null

  const conRasante = contexto.calle.rasante !== null
  // Si la toma no cerró, nada de lo que pinta el mapa está comprobado (diseño
  // §3). Si cerró pero volvió a arrancar en un BM, lo de antes tampoco.
  const sinCerrar = resultado !== null && resultado.cierre.pasa !== true
  const primeraComprobada = resultado?.tramoComprobado?.primeraEstacion ?? 0
  const avisoMapa =
    !conRasante || resultado === null
      ? null
      : sinCerrar
        ? {
            corto: 'Mapa no comprobado',
            largo: 'la nivelación no cerró; los ✓ △ ✗ son provisionales hasta cerrar el circuito.',
          }
        : primeraComprobada > 0
          ? {
              corto: `Mapa no comprobado antes de la estación ${primeraComprobada + 1}`,
              largo: `el cierre solo respalda lo medido desde la estación ${primeraComprobada + 1}.`,
            }
          : null
  const sufijo = sinCerrar ? ' (no comprobado)' : ''

  return (
    <section aria-labelledby={idTitulo} className={`${TARJETA_CALLE} ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={idTitulo} className="text-[15px] font-semibold">
          Mapa de la calle
        </h2>
        {/* Antes de la rejilla: en el celular es lo primero que se ve del mapa. */}
        {avisoMapa && (
          <p className="rounded-md bg-aviso-suave px-2 py-0.5 text-[13px] font-semibold text-aviso">
            <span aria-hidden="true">△</span> {avisoMapa.corto}
            <span className="sr-only">: {avisoMapa.largo}</span>
          </p>
        )}
        <span className="text-sm text-tenue max-md:hidden">toca una celda y todo salta a ese punto</span>
        {evaluacion ? (
          <ul aria-label="Qué significa cada color del mapa" className="numerico ml-auto flex gap-3 text-sm font-semibold">
            <li className="text-pasa">
              <span aria-hidden="true">✓ </span>
              {evaluacion.conformes}
              <span className="sr-only"> dentro de tolerancia{sufijo}</span>
            </li>
            <li className="text-aviso">
              <span aria-hidden="true">△ </span>
              {evaluacion.alLimite}
              <span className="sr-only"> al límite de tolerancia{sufijo}</span>
            </li>
            <li className="text-falla">
              <span aria-hidden="true">✗ </span>
              {evaluacion.fuera}
              <span className="sr-only"> fuera de tolerancia{sufijo}</span>
            </li>
            <li className="text-sin">
              <span aria-hidden="true">· </span>
              {evaluacion.sinMedir}
              <span className="sr-only"> sin medir</span>
            </li>
          </ul>
        ) : (
          <ul aria-label="Qué significa cada color del mapa" className="ml-auto flex gap-3 text-[13px] text-tenue">
            <li>● medida</li>
            <li>· falta medir</li>
          </ul>
        )}
      </div>

      {conRasante ? (
        <MapaEstado idCampaniaReferencia={campaniaActivaId} orientacion={orientacion} />
      ) : (
        <>
          {/* Sin rasante no hay semáforo que pintar, pero el mapa sigue sirviendo para elegir el punto. */}
          <MapaGrilla
            progresivas={esqueleto?.progresivas ?? []}
            elementos={esqueleto?.elementos ?? []}
            llenas={llenas}
            claveActiva={seleccion.clave}
            alElegir={seleccionar}
            pintarCelda={pintarMedida}
            orientacion={orientacion}
          />
          {modo !== 'medir' && <p className="text-[13px] text-tenue">Sin rasante de proyecto no hay semáforo.</p>}
        </>
      )}
    </section>
  )
}
