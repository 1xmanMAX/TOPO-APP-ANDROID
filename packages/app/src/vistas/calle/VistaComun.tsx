import { construirGrilla, formatearProgresiva, partirClaveCelda, progresivasDeLaToma, redondear3 } from '@topo/core'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import ControlesVista3D from '../../componentes/ControlesVista3D'
import CorteTransversal from '../../componentes/CorteTransversal'
import DeslizadorProgresiva from '../../componentes/DeslizadorProgresiva'
import MapaEstado from '../../componentes/MapaEstado'
import MapaGrilla, { type CeldaPintada } from '../../componentes/MapaGrilla'
import PerfilLongitudinal from '../../componentes/PerfilLongitudinal'
import Vista3D from '../../componentes/Vista3D'
import { armarEsqueletoTabla } from '../../esqueletoTabla'
import { useAlmacen, type ModoCalle } from '../../estado/almacen'
import { useContexto, useProgresivas } from '../../estado/derivados'
import { AVISO_DESTACADO } from './comun'
import { useResultadoCalle } from './resultadoCalle'

export type TipoVista = 'corte' | 'perfil' | '3d'

const VISTAS: { tipo: TipoVista; texto: string }[] = [
  { tipo: 'corte', texto: 'Corte' },
  { tipo: 'perfil', texto: 'Perfil' },
  { tipo: '3d', texto: '3D' },
]

const ACTIVO = 'border border-marca bg-marca font-medium text-white'
const INACTIVO =
  'border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'

/**
 * En Medir el mapa dice qué está medido y qué falta, no si está conforme:
 * un ✓ verde ahí se leería como «conforme» (diseño §3) sobre un punto que
 * el aviso acaba de dar fuera. Por eso «medida» lleva un símbolo neutro.
 */
const MEDIDA = 'bg-slate-300 font-bold text-slate-800 dark:bg-slate-600 dark:text-slate-100'
const FALTA = 'bg-slate-100 text-slate-400 dark:bg-slate-800'

interface Props {
  modo: ModoCalle
  vista: TipoVista
  alCambiarVista: (vista: TipoVista) => void
}

/**
 * Lo que comparten los tres modos: el dibujo de la calle (corte, perfil o
 * 3D) con su progresiva, y debajo el mapa de la calle, siempre a la vista.
 *
 * Todo cuelga de la misma selección del almacén: tocar una celda del mapa,
 * un punto del corte o del perfil llama a `seleccionar`, que fija la celda y
 * su progresiva; el corte se va a esa progresiva, el mapa la marca y la
 * ficha del modo la toma como su punto. Por eso no hay estado propio de
 * «punto elegido» en ninguna de las piezas.
 */
export default function VistaComun({ modo, vista, alCambiarVista }: Props) {
  const contexto = useContexto()
  const resultado = useResultadoCalle()
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const capasVisibles = useAlmacen((s) => s.capasVisibles)
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)
  const irAProgresiva = useAlmacen((s) => s.irAProgresiva)
  const progresivas = useProgresivas()
  const idTituloMapa = useId()
  const progresivaActiva = seleccion.progresiva ?? progresivas[0] ?? 0

  // Medir y Replantear dibujan solo la capa que se trabaja; Revisar respeta
  // las capas que se marcaron para comparar, si hay.
  const idsVisibles = useMemo(() => {
    if (modo === 'revisar' && capasVisibles.length > 0) return capasVisibles
    return campaniaActivaId ? [campaniaActivaId] : []
  }, [modo, capasVisibles, campaniaActivaId])

  const esqueleto = useMemo(
    () => (contexto ? armarEsqueletoTabla(contexto.calle, progresivasDeLaToma(contexto.campania)) : null),
    [contexto],
  )
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
      const destino = pendiente ?? enEsa.find((c) => c.elementoClave === elemento) ?? (modo === 'medir' ? enEsa[0] : undefined)
      if (destino) seleccionar(destino.clave)
      else irAProgresiva(progresiva)
    },
    [celdas, llenas, modo, seleccion.clave, seleccionar, irAProgresiva],
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
      const indice = progresivas.indexOf(progresivaActiva)
      if (evento.key === 'ArrowRight' && indice < progresivas.length - 1) cambiarProgresiva(progresivas[indice + 1]!)
      if (evento.key === 'ArrowLeft' && indice > 0) cambiarProgresiva(progresivas[indice - 1]!)
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [progresivas, progresivaActiva, cambiarProgresiva])

  if (!contexto) return null

  // Si la toma no cerró, nada de lo que pinta el mapa está comprobado (diseño
  // §3). Si cerró pero volvió a arrancar en un BM, lo de antes tampoco.
  const sinCerrar = resultado !== null && resultado.cierre.pasa !== true
  const primeraComprobada = resultado?.tramoComprobado?.primeraEstacion ?? 0
  const avisoMapa =
    modo === 'medir' || !contexto.calle.rasante || resultado === null
      ? null
      : sinCerrar
        ? 'Mapa no comprobado: la nivelación no cerró. Los ✓ △ ✗ son provisionales hasta cerrar el circuito.'
        : primeraComprobada > 0
          ? `Lo medido antes de la estación ${primeraComprobada + 1} no está comprobado: el cierre solo respalda desde ahí.`
          : null

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div role="group" aria-label="Vista de la calle" className="grid grid-cols-3 gap-2 sm:flex">
        {VISTAS.map(({ tipo, texto }) => (
          <button
            key={tipo}
            type="button"
            aria-pressed={vista === tipo}
            onClick={() => alCambiarVista(tipo)}
            className={`min-h-11 rounded px-4 py-1 text-sm ${vista === tipo ? ACTIVO : INACTIVO}`}
          >
            {texto}
          </button>
        ))}
      </div>

      {/* En el celular lo que se toca mide 44 × 44 px como mínimo. El botón de
          recorrer (DeslizadorProgresiva) y las celdas del mapa (MapaGrilla) son
          componentes compartidos pensados para el ratón (30 y 24 px): aquí se
          agrandan, solo en estas dos secciones. Cuando se arreglen allí, estas
          reglas sobran y se quitan. */}
      <section
        aria-label="Dibujo de la calle"
        className="flex min-w-0 flex-col gap-2 max-md:[&_button]:min-h-11 max-md:[&_button]:min-w-11"
      >
        {vista === 'corte' && (
          <CorteTransversal
            progresiva={progresivaActiva}
            idsVisibles={idsVisibles}
            idCampaniaReferencia={campaniaActivaId}
          />
        )}
        {vista === 'perfil' && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <span className="font-medium">Elemento del perfil</span>
              <select
                value={elementoPerfil}
                onChange={(evento) => setElementoPedido(evento.target.value)}
                className="min-h-11 rounded border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                {puntos.map((punto) => (
                  <option key={punto.id} value={punto.id}>
                    {punto.nombre}
                  </option>
                ))}
              </select>
            </label>
            <PerfilLongitudinal elementoClave={elementoPerfil} idCampaniaReferencia={campaniaActivaId} />
          </>
        )}
        {vista === '3d' && (
          <>
            <ControlesVista3D />
            <Vista3D idCampaniaReferencia={campaniaActivaId} />
          </>
        )}
        <DeslizadorProgresiva progresivas={progresivas} valor={progresivaActiva} alCambiar={cambiarProgresiva} />
      </section>

      <section
        aria-labelledby={idTituloMapa}
        className="flex min-w-0 flex-col gap-2 max-md:[&_button]:min-h-11 max-md:[&_button]:min-w-11"
      >
        <h2 id={idTituloMapa} className="font-semibold">
          Mapa de la calle
        </h2>
        {/* Antes del mapa: en el celular es lo primero que se ve de él. */}
        {avisoMapa && (
          <p className={AVISO_DESTACADO}>
            <span aria-hidden="true">△ </span>
            {avisoMapa}
          </p>
        )}
        {/* En el celular la ficha va debajo: con muchas progresivas, un mapa sin
            tope la mandaría a más de mil píxeles. El tope va sobre la rejilla
            misma (la caja que se desplaza dentro de MapaGrilla), no sobre todo el
            mapa: así la leyenda del semáforo queda fuera y se ve siempre entera. */}
        <div className="max-md:[&_div.overflow-auto]:max-h-72">
          {modo === 'medir' || !contexto.calle.rasante ? (
            // Midiendo importa qué falta llenar; sin rasante no hay semáforo
            // que pintar, pero el mapa sigue sirviendo para elegir el punto.
            <MapaGrilla
              progresivas={esqueleto?.progresivas ?? []}
              elementos={esqueleto?.elementos ?? []}
              llenas={llenas}
              claveActiva={seleccion.clave}
              alElegir={seleccionar}
              pintarCelda={pintarMedida}
            />
          ) : (
            <MapaEstado idCampaniaReferencia={campaniaActivaId} />
          )}
        </div>
        {(modo === 'medir' || !contexto.calle.rasante) && (
          <p className="text-xs text-slate-500">
            ● medida · · falta medir
            {modo !== 'medir' && ' — sin rasante de proyecto no hay semáforo.'}
          </p>
        )}
      </section>
    </div>
  )
}
