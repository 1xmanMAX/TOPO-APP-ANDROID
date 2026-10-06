import { useId, useMemo, useState } from 'react'
import { useAlmacen } from '../../estado/almacen'
import { capasDeCalle, fraseDeCalle, NOMBRE_DEL_ESTADO, tramoDeTomas, type CapaEnCalle } from './estadoObra'

const ESTILO_CASILLA: Record<CapaEnCalle['estado'], string> = {
  sinMedir: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  enCurso: 'border-aviso bg-aviso/15 font-semibold text-slate-900 dark:text-slate-100',
  sinComprobar: 'border-aviso bg-aviso/15 font-semibold text-slate-900 dark:text-slate-100',
  alLimite: 'border-aviso bg-aviso/15 font-semibold text-slate-900 dark:text-slate-100',
  // Cerró, pero no hay con qué compararla: ni verde ni ámbar, con borde de trazos.
  sinComparar:
    'border-dashed border-slate-400 bg-white text-slate-900 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-100',
  conforme: 'border-pasa bg-pasa/15 text-slate-900 dark:text-slate-100',
  conPuntosFuera: 'border-falla bg-falla/15 font-semibold text-slate-900 dark:text-slate-100',
}

/**
 * Nombre corto para la casilla, sin cortar palabras: «SUBRASANTE» →
 * «Subrasante», «SUB BASE» → «Sub base», «TERRENO EXISTENTE» → «Terreno».
 * El completo va en el nombre accesible y en el detalle.
 */
export function nombreCorto(nombre: string): string {
  const palabras = nombre.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return nombre
  const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1)
  const entero = palabras.join(' ')
  if (entero.length <= 11) return mayuscula(entero)
  // Una primera palabra corta («sub», «base») sola no dice qué capa es.
  return mayuscula(palabras[0]!.length >= 5 ? palabras[0]! : palabras.slice(0, 2).join(' '))
}

interface PropsFranja {
  capas: CapaEnCalle[]
  calle: string
}

/** Una casilla por capa, de abajo arriba del paquete, con su símbolo y su nombre: el color nunca va solo. */
export function FranjaCapas({ capas, calle }: PropsFranja) {
  if (capas.length === 0) return null
  return (
    <ul
      aria-label={`Capas de ${calle}`}
      // Al sol hace falta letra de 14 px: si no caben en una fila, pasan a dos.
      className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1 text-center text-sm"
    >
      {capas.map((c) => (
        <li
          key={c.capa.id}
          aria-label={`${c.capa.nombre}: ${NOMBRE_DEL_ESTADO[c.estado]}`}
          title={c.detalle}
          className={`rounded border px-1 py-1 leading-tight break-words ${ESTILO_CASILLA[c.estado]}`}
        >
          <span aria-hidden="true">
            {c.simbolo} {nombreCorto(c.capa.nombre)}
          </span>
        </li>
      ))}
    </ul>
  )
}

interface Props {
  /** La calle que se está mirando en el panel. */
  calleVistaId: string | null
  /** Elegir una calle abre su panel; no cambia la jornada activa. */
  alElegir: (calleId: string) => void
}

/** «Calles y sus capas»: cada calle con su tramo medido, su franja de capas y lo más urgente que tiene. */
export default function ListaCalles({ calleVistaId, alElegir }: Props) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const agregarCalle = useAlmacen((s) => s.agregarCalle)
  const [nombreNueva, setNombreNueva] = useState('')
  const prefijo = useId()

  const filas = useMemo(
    () =>
      proyecto.calles.map((calle) => {
        const capas = capasDeCalle(proyecto, calle)
        const tomas = calle.nivelaciones.flatMap((n) => n.tomas)
        return { calle, capas, tramo: tramoDeTomas(tomas), frase: fraseDeCalle(capas) }
      }),
    [proyecto],
  )

  function crearCalle() {
    const nombre = nombreNueva.trim() || `Calle ${proyecto.calles.length + 1}`
    const id = agregarCalle({ nombre, rasante: null })
    setNombreNueva('')
    alElegir(id)
  }

  return (
    <section aria-labelledby="titulo-calles-obra" className="flex flex-col gap-2">
      <h2 id="titulo-calles-obra" className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400">
        Calles y sus capas
      </h2>

      {filas.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Todavía no hay calles. Crea una aquí o sube una hoja de campo: la calle nace con ella.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {filas.map(({ calle, capas, tramo, frase }) => {
          const vista = calle.id === calleVistaId
          const alerta = capas.some((c) => c.estado === 'conPuntosFuera')
          const idTramo = `${prefijo}-${calle.id}-tramo`
          const idFrase = `${prefijo}-${calle.id}-frase`
          return (
            <li
              key={calle.id}
              className={`flex flex-col gap-2 rounded-xl border-2 bg-white p-3 dark:bg-slate-900 ${
                vista ? 'border-slate-900 dark:border-slate-200' : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <button
                type="button"
                aria-pressed={vista}
                aria-label={`Abrir ${calle.nombre}`}
                aria-describedby={`${idTramo} ${idFrase}`}
                data-calle-id={calle.id}
                onClick={() => alElegir(calle.id)}
                className="flex min-h-11 items-baseline justify-between gap-2 text-left"
              >
                <span className="text-base font-bold">{calle.nombre}</span>
                <span id={idTramo} className="numerico text-sm text-slate-600 dark:text-slate-400">
                  {tramo ?? 'sin medir'}
                </span>
              </button>
              <FranjaCapas capas={capas} calle={calle.nombre} />
              <p id={idFrase} className={`text-sm ${alerta ? 'text-falla' : 'text-slate-600 dark:text-slate-300'}`}>
                {alerta && <span aria-hidden="true">✗ </span>}
                {frase}
              </p>
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
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <button
          type="button"
          onClick={crearCalle}
          className="min-h-11 rounded-lg border border-dashed border-slate-400 px-3 text-sm font-medium"
        >
          + Nueva calle
        </button>
      </div>
    </section>
  )
}
