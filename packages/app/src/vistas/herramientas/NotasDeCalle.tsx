import EnConstruccion from '../../componentes/EnConstruccion'
import type { Id } from '@topo/core'

interface Props {
  calleId: Id
}

/**
 * Notas de campo de una calle (texto y foto por progresiva). ESQUELETO del
 * armazón: lo llena el agente de Herramientas con `agregarNota` y
 * `eliminarNota` del almacén.
 */
export default function NotasDeCalle(_props: Props) {
  return <EnConstruccion titulo="Notas de la calle" descripcion="Aquí irán las notas de campo por progresiva." />
}
