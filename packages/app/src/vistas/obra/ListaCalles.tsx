import { useId, useMemo, useState } from 'react'
import { CLASES_ESTADO, type EstadoSemaforo } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import {
  capaMasUrgente,
  capasDeCalle,
  fraseDeCalle,
  NOMBRE_DEL_ESTADO,
  nombreCorto,
  tramoDeTomas,
  type CapaEnCalle,
} from './estadoObra'

export { nombreCorto }

/**
 * El color de cada casilla, del semáforo común. Lo que está en curso, sin
 * comprobar o al límite es ámbar △; lo que cerró sin nada con qué compararlo
 * va con borde de trazos, ni verde ni ámbar: cerrar no es cumplir el proyecto.
 */
const ESTADO_DE_CASILLA: Record<CapaEnCalle['estado'], EstadoSemaforo> = {
  sinMedir: 'sinMedir',
  enCurso: 'alLimite',
  sinComprobar: 'alLimite',
  alLimite: 'alLimite',
  sinComparar: 'sinRasante',
  conforme: 'conforme',
  conPuntosFuera: 'fuera',
}

/** El color de la frase de la calle según su símbolo. */
const TONO_FRASE: Record<CapaEnCalle['simbolo'], string> = {
  '✗': 'text-falla',
  '△': 'text-aviso',
  '✓': 'text-tenue',
  '·': 'text-tenue',
}

/**
 * Tantas columnas como capas, hasta cinco: con tres capas cada casilla tiene
 * sitio para el nombre entero en vez de dejar medio renglón vacío. Clases
 * escritas enteras para que Tailwind las encuentre.
 */
const COLUMNAS = ['grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5'] as const

interface PropsFranja {
  capas: CapaEnCalle[]
  calle: string
}

/** Una casilla por capa, de abajo arriba del paquete, con su símbolo y su nombre: el color nunca va solo. */
export function FranjaCapas({ capas, calle }: PropsFranja) {
  if (capas.length === 0) return null
  return (
    <ul aria-label={`Capas de ${calle}`} className={`grid ${COLUMNAS[Math.min(capas.length, 5) - 1]} gap-[3px] text-center text-[11px]`}>
      {capas.map((c) => {
        const estado = ESTADO_DE_CASILLA[c.estado]
        return (
          <li
            key={c.capa.id}
            aria-label={`${c.capa.nombre}: ${NOMBRE_DEL_ESTADO[c.estado]}`}
            title={c.detalle}
            className={`truncate rounded px-0.5 py-1 leading-tight ${CLASES_ESTADO[estado]} ${
              estado === 'fuera' || estado === 'alLimite' ? 'font-semibold' : ''
            }`}
          >
            <span aria-hidden="true">
              {c.simbolo} {nombreCorto(c.capa.nombre)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

interface Props {
  /** La calle que se está mirando en el panel. */
  calleVistaId: string | null
  /** Elegir una calle abre su panel; no cambia la jornada activa. */
  alElegir: (calleId: string) => void
}

/**
 * «Calles y sus capas»: cada calle con su tramo medido, su franja de capas y,
 * en una línea, lo más urgente que tiene. Tocar esa línea abre Calle › Revisar
 * en el punto que más se pasa.
 */
export default function ListaCalles({ calleVistaId, alElegir }: Props) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const agregarCalle = useAlmacen((s) => s.agregarCalle)
  const activarCampania = useAlmacen((s) => s.activarCampania)
  const fijarModoCalle = useAlmacen((s) => s.fijarModoCalle)
  const seleccionar = useAlmacen((s) => s.seleccionar)
  const [nombreNueva, setNombreNueva] = useState('')
  const prefijo = useId()

  const filas = useMemo(
    () =>
      proyecto.calles.map((calle) => {
        const capas = capasDeCalle(proyecto, calle)
        const tomas = calle.nivelaciones.flatMap((n) => n.tomas)
        return { calle, capas, tramo: tramoDeTomas(tomas), frase: fraseDeCalle(capas), urgente: capaMasUrgente(capas) }
      }),
    [proyecto],
  )

  function crearCalle() {
    const nombre = nombreNueva.trim() || `Calle ${proyecto.calles.length + 1}`
    const id = agregarCalle({ nombre, rasante: null })
    setNombreNueva('')
    alElegir(id)
  }

  /**
   * Revisar evalúa la jornada activa: se activa la que tiene el punto (la
   * comprobada de donde sale) o, sin punto, la última de esa capa.
   */
  function revisar(capa: CapaEnCalle) {
    const tomaId = capa.peor?.tomaId ?? capa.tomaId
    if (!tomaId) return
    activarCampania(tomaId)
    fijarModoCalle('revisar')
    if (capa.peor) seleccionar(capa.peor.clave)
  }

  return (
    <section aria-labelledby="titulo-calles-obra" className="flex flex-col gap-2">
      <h2 id="titulo-calles-obra" className="text-[13px] uppercase tracking-[0.1em] text-tenue">
        Calles y sus capas
      </h2>

      {filas.length === 0 && (
        <p className="text-sm text-tenue">
          Todavía no hay calles. Crea una aquí o sube una hoja de campo: la calle nace con ella.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {filas.map(({ calle, capas, tramo, frase, urgente }) => {
          const vista = calle.id === calleVistaId
          const idTramo = `${prefijo}-${calle.id}-tramo`
          const idFrase = `${prefijo}-${calle.id}-frase`
          const corto = urgente?.corto ?? 'Todavía sin medir'
          const tono = TONO_FRASE[urgente?.simbolo ?? '·']
          const seRevisa = !!urgente && (urgente.peor !== null || urgente.tomaId !== null)
          return (
            <li
              key={calle.id}
              className={`flex flex-col gap-1.5 rounded-xl border bg-tarjeta px-3.5 pt-1 pb-1 ${
                vista ? 'border-tinta ring-1 ring-tinta' : 'border-borde'
              }`}
            >
              <button
                type="button"
                aria-pressed={vista}
                aria-label={`Abrir ${calle.nombre}`}
                aria-describedby={`${idTramo} ${idFrase}`}
                data-calle-id={calle.id}
                onClick={() => alElegir(calle.id)}
                className="flex min-h-11 items-center justify-between gap-2 text-left"
              >
                <span className="text-[17px] font-bold">{calle.nombre}</span>
                <span id={idTramo} className="numerico text-[13px] text-tenue">
                  {tramo ?? 'sin medir'}
                </span>
              </button>
              <FranjaCapas capas={capas} calle={calle.nombre} />
              {/* La frase entera es la descripción del botón de la calle y el
                  nombre de esta línea; a la vista, solo lo que cabe. */}
              <span id={idFrase} className="sr-only">
                {frase}
              </span>
              {seRevisa ? (
                <button
                  type="button"
                  aria-label={frase}
                  data-frase-calle=""
                  onClick={() => urgente && revisar(urgente)}
                  className={`flex min-h-11 min-w-0 items-center text-left text-[13px] ${tono}`}
                >
                  <span className="truncate">{corto}</span>
                </button>
              ) : (
                <p aria-hidden="true" data-frase-calle="" className={`flex min-h-11 items-center text-[13px] ${tono}`}>
                  <span className="truncate">{corto}</span>
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col">
          <span className="sr-only">Nombre de la calle nueva</span>
          <input
            type="text"
            value={nombreNueva}
            onChange={(e) => setNombreNueva(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') crearCalle()
            }}
            placeholder="Nombre de la calle nueva"
            className="min-h-11 rounded-[10px] border border-borde-fuerte bg-tarjeta px-3 text-base"
          />
        </label>
        <button
          type="button"
          onClick={crearCalle}
          className="min-h-11 rounded-[10px] border border-dashed border-slate-400 px-3 text-sm font-medium"
        >
          + Nueva calle
        </button>
      </div>
    </section>
  )
}
