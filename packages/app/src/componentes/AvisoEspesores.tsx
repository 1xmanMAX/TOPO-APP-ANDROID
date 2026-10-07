import type { EstadoComparacion } from '../estadoComparacion'
import AvisoLinea from './AvisoLinea'

interface Props {
  estado: EstadoComparacion
}

/**
 * Pegado a la tabla de espesores: un espesor sale de restar dos cotas, y si
 * la nivelación de alguna de las dos campañas no cerró, la resta puede dar un
 * número limpio sin que eso signifique que el espesor está comprobado. Va en
 * tono aviso (△), no en rojo: no dice que esté mal, dice que falta cerrar.
 * El texto es el mismo que lleva la cabecera del archivo exportado, para que
 * pantalla y archivo nunca digan cosas distintas.
 */
export default function AvisoEspesores({ estado }: Props) {
  return (
    <AvisoLinea tono={estado.comprobado ? 'pasa' : 'aviso'} className="font-semibold">
      <p>{estado.texto}</p>
    </AvisoLinea>
  )
}
