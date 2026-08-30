import CampoTexto from '../componentes/CampoTexto'
import EditorRasante from '../componentes/EditorRasante'
import { useAlmacen } from '../estado/almacen'
import { useContexto } from '../estado/derivados'

/**
 * La plantilla transversal y el rango de progresivas de una calle
 * desaparecieron de aquí: los puntos y sus distancias viven en la sección
 * declarada de la calle (`calle.seccion`), no se escriben a mano en esta
 * pantalla. Lo que sigue viviendo aquí es lo que no cambió con ese rediseño:
 * el nombre de la calle y su rasante de proyecto.
 */
export default function VistaCalle() {
  const contexto = useContexto()
  const actualizarCalle = useAlmacen((s) => s.actualizarCalle)

  if (!contexto) {
    return <p className="p-6 text-sm text-slate-500">Crea una calle y una campaña para empezar.</p>
  }

  const { calle } = contexto

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <h2 className="text-lg font-semibold">Calle</h2>

      <CampoTexto etiqueta="Nombre" valor={calle.nombre} alCambiar={(v) => actualizarCalle(calle.id, { nombre: v })} />

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Rasante de proyecto</h3>
        <EditorRasante calleId={calle.id} puntos={calle.seccion.puntos} />
      </section>
    </div>
  )
}
