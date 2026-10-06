import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Aviso, BOTON, BOTON_ACTIVO, BOTON_INACTIVO, useCalleYToma } from './comunes'
import PestanaDrenaje, { DRENAJE_DE_FABRICA, type EleccionDrenaje } from './PestanaDrenaje'
import PestanaEspesores from './PestanaEspesores'
import PestanaVolumenes, { VOLUMENES_DE_FABRICA, type EleccionVolumenes } from './PestanaVolumenes'

type Pestana = 'espesores' | 'volumenes' | 'drenaje'

const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: 'espesores', texto: 'Espesores' },
  { id: 'volumenes', texto: 'Volúmenes' },
  { id: 'drenaje', texto: 'Drenaje' },
]

/**
 * Calle › Análisis: espesores, volúmenes y drenaje de la calle activa, en
 * tres pestañas de la misma pantalla. Todo sale del motor (`capas/comparar`,
 * `analisis/volumenes`, `analisis/drenaje`); aquí solo se elige qué comparar
 * y se dice, arriba de cada número, si está comprobado.
 *
 * Lo que se elige en cada pestaña (superficies, factor, volquete, punto,
 * sumideros) vive aquí y no dentro de la pestaña: así no se pierde al pasar
 * de una pestaña a otra. Va por calle, porque los sumideros de una calle no
 * son los de otra. Espesores guarda su elección en el almacén (la comparación).
 */
export default function PantallaAnalisis() {
  const idTitulo = useId()
  const idPanel = useId()
  const [pestana, setPestana] = useState<Pestana>('espesores')
  const [eleccionVolumenes, setEleccionVolumenes] = useState<Record<string, EleccionVolumenes>>({})
  const [eleccionDrenaje, setEleccionDrenaje] = useState<Record<string, EleccionDrenaje>>({})
  const botones = useRef(new Map<Pestana, HTMLButtonElement>())
  const { calle, contexto } = useCalleYToma()

  // Patrón ARIA de pestañas: flechas, Inicio y Fin mueven entre pestañas; Tab sale de la barra.
  function alTeclear(evento: KeyboardEvent<HTMLButtonElement>, actual: Pestana) {
    const indice = PESTANAS.findIndex((p) => p.id === actual)
    const destinos: Record<string, number> = {
      ArrowRight: (indice + 1) % PESTANAS.length,
      ArrowLeft: (indice - 1 + PESTANAS.length) % PESTANAS.length,
      Home: 0,
      End: PESTANAS.length - 1,
    }
    const destino = destinos[evento.key]
    if (destino === undefined) return
    evento.preventDefault()
    const id = PESTANAS[destino]!.id
    setPestana(id)
    botones.current.get(id)?.focus()
  }

  return (
    <section aria-labelledby={idTitulo} className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-3 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id={idTitulo} className="text-lg font-semibold">
          Análisis
        </h2>
        {calle && <p className="text-sm text-slate-600 dark:text-slate-300">{calle.nombre}</p>}
      </div>

      {!calle ? (
        <Aviso tono="neutro" simbolo="△">
          No hay una calle activa. Elige una arriba, o créala en Obra › Calles.
        </Aviso>
      ) : (
        <>
          <div role="tablist" aria-label="Qué analizar" className="grid grid-cols-3 gap-2 sm:flex">
            {PESTANAS.map(({ id, texto }) => (
              <button
                key={id}
                ref={(boton) => {
                  if (boton) botones.current.set(id, boton)
                  else botones.current.delete(id)
                }}
                type="button"
                role="tab"
                id={`${idPanel}-${id}`}
                aria-selected={pestana === id}
                aria-controls={idPanel}
                tabIndex={pestana === id ? 0 : -1}
                onClick={() => setPestana(id)}
                onKeyDown={(e) => alTeclear(e, id)}
                className={`${BOTON} ${pestana === id ? BOTON_ACTIVO : BOTON_INACTIVO}`}
              >
                {texto}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={idPanel} aria-labelledby={`${idPanel}-${pestana}`} className="flex flex-col gap-3">
            {pestana === 'espesores' && <PestanaEspesores calle={calle} />}
            {pestana === 'volumenes' && (
              <PestanaVolumenes
                calle={calle}
                contexto={contexto}
                eleccion={eleccionVolumenes[calle.id] ?? VOLUMENES_DE_FABRICA}
                alCambiar={(cambio) =>
                  setEleccionVolumenes((todas) => ({
                    ...todas,
                    [calle.id]: { ...(todas[calle.id] ?? VOLUMENES_DE_FABRICA), ...cambio },
                  }))
                }
              />
            )}
            {pestana === 'drenaje' &&
              (contexto ? (
                <PestanaDrenaje
                  calle={calle}
                  contexto={contexto}
                  eleccion={eleccionDrenaje[calle.id] ?? DRENAJE_DE_FABRICA}
                  alCambiar={(cambio) =>
                    setEleccionDrenaje((todas) => ({
                      ...todas,
                      [calle.id]: { ...(todas[calle.id] ?? DRENAJE_DE_FABRICA), ...cambio },
                    }))
                  }
                />
              ) : (
                <Aviso tono="neutro" simbolo="△">
                  Esta calle todavía no tiene nivelaciones: el drenaje sale de lo medido. Mide la calle en Calle ›
                  Medir.
                </Aviso>
              ))}
          </div>
        </>
      )}
    </section>
  )
}
