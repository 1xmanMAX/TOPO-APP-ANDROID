import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import Segmentado from '../../componentes/Segmentado'
import { Aviso, useCalleYToma } from './comunes'
import PestanaDrenaje, { DRENAJE_DE_FABRICA, type EleccionDrenaje } from './PestanaDrenaje'
import PestanaEspesores from './PestanaEspesores'
import PestanaVolumenes, { VOLUMENES_DE_FABRICA, type EleccionVolumenes } from './PestanaVolumenes'

type Pestana = 'espesores' | 'volumenes' | 'drenaje'

const PESTANAS: { valor: Pestana; texto: string }[] = [
  { valor: 'espesores', texto: 'Espesores' },
  { valor: 'volumenes', texto: 'Volúmenes' },
  { valor: 'drenaje', texto: 'Drenaje' },
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
  const barra = useRef<HTMLDivElement>(null)
  const { calle, contexto } = useCalleYToma()

  // Segmentado no pone el orden de Tab ni los ids de las pestañas: se los pone
  // aquí, para que Tab entre solo en la activa y el panel diga de cuál es.
  useLayoutEffect(() => {
    barra.current?.querySelectorAll<HTMLButtonElement>('[role=tab]').forEach((boton, i) => {
      const valor = PESTANAS[i]?.valor
      boton.tabIndex = valor === pestana ? 0 : -1
      boton.id = `${idPanel}-${valor}`
      boton.setAttribute('aria-controls', idPanel)
    })
  }, [pestana, idPanel, calle])

  // Patrón ARIA de pestañas: flechas, Inicio y Fin mueven entre pestañas.
  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    const indice = PESTANAS.findIndex((p) => p.valor === pestana)
    const destinos: Record<string, number> = {
      ArrowRight: (indice + 1) % PESTANAS.length,
      ArrowLeft: (indice - 1 + PESTANAS.length) % PESTANAS.length,
      Home: 0,
      End: PESTANAS.length - 1,
    }
    const destino = destinos[evento.key]
    if (destino === undefined) return
    evento.preventDefault()
    setPestana(PESTANAS[destino]!.valor)
    barra.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[destino]?.focus()
  }

  return (
    <section aria-labelledby={idTitulo} className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col">
          <h2 id={idTitulo} className="text-[26px] leading-tight font-bold">
            Análisis
          </h2>
          {calle && <p className="text-[15px] text-tenue">{calle.nombre}</p>}
        </div>
        {calle && (
          <div ref={barra} onKeyDown={alTeclear} className="w-full md:w-auto">
            <Segmentado
              etiqueta="Qué analizar"
              como="tablist"
              opciones={PESTANAS}
              valor={pestana}
              alCambiar={setPestana}
              anchoCompleto
            />
          </div>
        )}
      </div>

      {!calle ? (
        <Aviso tono="neutro" simbolo="△">
          No hay una calle activa. Elige una arriba, o créala en Obra › Calles.
        </Aviso>
      ) : (
        <div role="tabpanel" id={idPanel} aria-labelledby={`${idPanel}-${pestana}`} className="flex flex-col gap-4">
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
      )}
    </section>
  )
}
