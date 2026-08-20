import type { ElementoPlantilla, TipoElemento } from '@topo/core'
import { useAlmacen } from '../estado/almacen'
import CampoNumero from './CampoNumero'

const TIPOS: { valor: TipoElemento; texto: string }[] = [
  { valor: 'eje', texto: 'Eje' },
  { valor: 'calzada', texto: 'Calzada' },
  { valor: 'sardinel', texto: 'Sardinel' },
  { valor: 'vereda', texto: 'Vereda' },
  { valor: 'peloAgua', texto: 'Pelo de agua' },
  { valor: 'existente', texto: 'Punto existente' },
  { valor: 'otro', texto: 'Otro' },
]

interface Props {
  plantillaId: string
}

export default function EditorPlantilla({ plantillaId }: Props) {
  const plantilla = useAlmacen((s) => s.proyecto.plantillas.find((p) => p.id === plantillaId))
  const actualizarPlantilla = useAlmacen((s) => s.actualizarPlantilla)

  if (!plantilla) return <p className="p-6 text-sm text-slate-500">Esa plantilla ya no existe.</p>

  // Se ordena para mostrar de izquierda a derecha, pero se conserva el índice
  // original: es la identidad estable del elemento mientras se edita, porque
  // ni la clave ni el offset lo son.
  const ordenados = plantilla.elementos
    .map((elemento, indice) => ({ elemento, indice }))
    .sort((a, b) => a.elemento.offset - b.elemento.offset)

  const repetidas = ordenados
    .map((e) => e.elemento.clave)
    .filter((clave, i, todas) => clave !== '' && todas.indexOf(clave) !== i)

  function cambiar(indice: number, cambios: Partial<ElementoPlantilla>) {
    actualizarPlantilla(plantillaId, {
      elementos: plantilla!.elementos.map((e, i) => (i === indice ? { ...e, ...cambios } : e)),
    })
  }

  function agregar() {
    const maximo = Math.max(0, ...plantilla!.elementos.map((e) => e.offset))
    actualizarPlantilla(plantillaId, {
      elementos: [
        ...plantilla!.elementos,
        {
          clave: `E-${plantilla!.elementos.length + 1}`,
          etiqueta: 'Elemento nuevo',
          offset: maximo + 1,
          tipo: 'otro',
        },
      ],
    })
  }

  function quitar(indice: number) {
    actualizarPlantilla(plantillaId, {
      elementos: plantilla!.elementos.filter((_, i) => i !== indice),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{plantilla.nombre}</h3>
        <button type="button" onClick={agregar} className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white">
          Agregar elemento
        </button>
      </div>

      <p className="text-xs text-slate-500">
        La distancia se mide desde el eje. Negativa hacia la izquierda, positiva hacia la derecha.
      </p>

      {repetidas.length > 0 && (
        <p className="rounded border border-falla px-3 py-2 text-sm text-falla">
          La clave {repetidas[0]} está repetida. Cada elemento necesita una clave distinta.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {ordenados.map(({ elemento, indice }) => (
          <div key={indice} className="grid grid-cols-[7rem_1fr_7rem_9rem_auto] items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">Clave</span>
              <input
                aria-label="Clave"
                value={elemento.clave}
                onChange={(evento) => cambiar(indice, { clave: evento.target.value.toUpperCase() })}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm uppercase dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">Etiqueta</span>
              <input
                aria-label={`Etiqueta de ${elemento.clave}`}
                value={elemento.etiqueta}
                onChange={(evento) => cambiar(indice, { etiqueta: evento.target.value })}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <CampoNumero
              etiqueta="Distancia"
              valor={elemento.offset}
              alCambiar={(v) => cambiar(indice, { offset: v })}
              decimales={2}
              sufijo="m"
            />
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">Tipo</span>
              <select
                aria-label={`Tipo de ${elemento.clave}`}
                value={elemento.tipo}
                onChange={(evento) => cambiar(indice, { tipo: evento.target.value as TipoElemento })}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                {TIPOS.map((tipo) => (
                  <option key={tipo.valor} value={tipo.valor}>
                    {tipo.texto}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              aria-label={`Quitar ${elemento.clave}`}
              onClick={() => quitar(indice)}
              className="rounded px-2 py-1.5 text-sm text-falla hover:bg-red-50 dark:hover:bg-red-950"
            >
              Quitar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
