import EditorPlantilla from '../componentes/EditorPlantilla'
import { useAlmacen } from '../estado/almacen'

export default function VistaPlantilla() {
  const plantillas = useAlmacen((s) => s.proyecto.plantillas)
  const enEdicionId = useAlmacen((s) => s.plantillaEnEdicionId)
  const editarPlantilla = useAlmacen((s) => s.editarPlantilla)
  const agregarPlantilla = useAlmacen((s) => s.agregarPlantilla)

  const activaId = enEdicionId ?? plantillas[0]?.id ?? null

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Plantillas transversales</h2>
        <button
          type="button"
          onClick={() => agregarPlantilla('Plantilla nueva')}
          className="ml-auto rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
        >
          Nueva plantilla
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {plantillas.map((plantilla) => (
          <button
            key={plantilla.id}
            type="button"
            onClick={() => editarPlantilla(plantilla.id)}
            className={`rounded px-3 py-1.5 text-sm ${
              plantilla.id === activaId
                ? 'bg-marca text-white'
                : 'border border-slate-300 dark:border-slate-700'
            }`}
          >
            {plantilla.nombre}
          </button>
        ))}
      </div>

      {activaId ? (
        <EditorPlantilla plantillaId={activaId} />
      ) : (
        <p className="text-sm text-slate-500">Crea una plantilla para definir la sección de la calle.</p>
      )}
    </div>
  )
}
