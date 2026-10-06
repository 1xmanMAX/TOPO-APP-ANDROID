import EnConstruccion from '../../componentes/EnConstruccion'
import { useAlmacen } from '../../estado/almacen'
import NotasDeCalle from '../herramientas/NotasDeCalle'
import VistaLibreta from '../VistaLibreta'
import VistaResultados from '../VistaResultados'

/**
 * Calle: los tres modos sobre la misma vista (Medir · Revisar · Replantear).
 * ESQUELETO del armazón: mientras el agente de Calle arma la vista
 * compartida, Medir monta la libreta de antes y Revisar los resultados de
 * antes, que siguen funcionando igual.
 */
export default function EspacioCalle() {
  const modo = useAlmacen((s) => s.modoCalle)
  const calleActivaId = useAlmacen((s) => s.calleActivaId)

  if (!calleActivaId) {
    return <p className="p-6 text-sm text-slate-500">Elige una calle, o crea la primera en Obra.</p>
  }

  return (
    <div className="flex flex-col">
      {modo === 'medir' && <VistaLibreta />}
      {modo === 'revisar' && <VistaResultados />}
      {modo === 'replantear' && (
        <EnConstruccion
          titulo="Replantear"
          descripcion="La lectura objetivo en cada estaca, y si hay que cortar o rellenar."
        />
      )}
      <NotasDeCalle calleId={calleActivaId} />
    </div>
  )
}
