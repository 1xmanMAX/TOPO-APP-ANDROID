import type { HojaNiveles } from '@topo/core'
import { useId, useMemo } from 'react'
import { useAlmacen } from '../../estado/almacen'
import { hojaVacia, lineasDeLaHoja, panelesPorDefecto } from '../../niveles/hoja'
import { Aviso } from '../analisis/comunes'
import NivelARegistrar from './NivelARegistrar'
import PanelComparar from './PanelComparar'
import TarjetaConjuntos from './TarjetaConjuntos'
import TarjetaPuestas from './TarjetaPuestas'

/** Lo que reciben las piezas de la pantalla: la hoja y cómo cambiarla. */
export interface PropsHoja {
  hoja: HojaNiveles
  cambiar: (cambio: (hoja: HojaNiveles) => HojaNiveles) => void
}

/**
 * Calle › Niveles: la herramienta «Pistas y veredas: separación entre
 * niveles» de Max, dentro de la app y guardada con la calle.
 *
 * Como en su hoja: puestas del nivel (cota BM + lectura atrás), conjuntos
 * escritos «progresiva, lectura» por zona y categoría (base, subbase,
 * vereda, replanteo…), dos gráficas para ver la separación entre líneas o
 * cuánto cortar y rellenar para llegar a un replanteo, y el nivel a
 * registrar: escribes la progresiva y sale qué leer en la mira. Además, un
 * conjunto se puede traer de lo ya medido en la app, y un replanteo se arma
 * copiando una línea o con una pendiente.
 */
export default function PantallaNiveles() {
  const calle = useAlmacen((s) => s.proyecto.calles.find((c) => c.id === s.calleActivaId) ?? null)
  const proyecto = useAlmacen((s) => s.proyecto)
  const actualizarCalle = useAlmacen((s) => s.actualizarCalle)
  const idTitulo = useId()

  // Una calle sin hoja todavía: se le propone una vacía, con ids estables
  // mientras no se toque (mirarla no cambia el proyecto).
  const vacia = useMemo(() => hojaVacia(), [calle?.id])
  const hoja = calle?.niveles ?? vacia
  // Depende del proyecto entero: los conjuntos enlazados siguen a la libreta y las puestas a los BMs.
  const lineas = useMemo(() => lineasDeLaHoja(hoja, proyecto, calle?.id ?? ''), [hoja, proyecto, calle?.id])

  if (!calle) {
    return (
      <section className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <Aviso tono="neutro" simbolo="△">
          No hay una calle activa. Elige una arriba, o créala en Obra › Calles.
        </Aviso>
      </section>
    )
  }

  const calleId = calle.id
  const cambiar: PropsHoja['cambiar'] = (cambio) => {
    // Siempre sobre la hoja guardada en ese momento, no sobre la de este dibujado.
    const actual = useAlmacen.getState().proyecto.calles.find((c) => c.id === calleId)?.niveles ?? hoja
    actualizarCalle(calleId, { niveles: cambio(actual) })
  }

  const paneles = hoja.paneles ?? panelesPorDefecto(hoja)
  const dos = hoja.dosPaneles ?? true

  return (
    <section aria-labelledby={idTitulo} className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col">
        <h2 id={idTitulo} className="text-[26px] leading-tight font-bold">
          Niveles
        </h2>
        <p className="text-[15px] text-tenue">
          {calle.nombre} · tus lecturas por zona, la separación entre líneas, el corte y relleno de un replanteo y qué
          leer en la mira.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-start">
        <TarjetaPuestas hoja={hoja} cambiar={cambiar} />
        <TarjetaConjuntos hoja={hoja} cambiar={cambiar} lineas={lineas} />
      </div>

      {hoja.conjuntos.length === 0 ? (
        <Aviso tono="neutro" simbolo="△">
          Agrega un conjunto (tus lecturas de una zona) o tráelo de lo medido para ver las gráficas y el nivel a
          registrar.
        </Aviso>
      ) : (
        <>
          <label className="flex min-h-11 items-center gap-2 self-start text-[15px]">
            <input
              type="checkbox"
              checked={dos}
              onChange={(e) => cambiar((h) => ({ ...h, dosPaneles: e.target.checked }))}
              className="h-5 w-5"
            />
            Mostrar dos gráficas (izquierda y derecha)
          </label>
          <div className={`grid gap-4 ${dos ? 'xl:grid-cols-2' : ''}`}>
            {(dos ? [0, 1] : [0]).map((i) => (
              <PanelComparar
                key={i}
                titulo={dos ? (i === 0 ? 'Lado izquierdo' : 'Lado derecho') : 'Comparar'}
                hoja={hoja}
                cambiar={cambiar}
                lineas={lineas}
                panel={paneles[i] ?? panelesPorDefecto(hoja)[i]!}
                alCambiar={(panel) =>
                  cambiar((h) => {
                    const todos = [...(h.paneles ?? panelesPorDefecto(h))]
                    todos[i] = panel
                    return { ...h, paneles: todos }
                  })
                }
              />
            ))}
          </div>
          <NivelARegistrar hoja={hoja} cambiar={cambiar} lineas={lineas} />
        </>
      )}
    </section>
  )
}
