import type { EstadoComparacion } from '../estadoComparacion'

interface Props {
  estado: EstadoComparacion
}

/**
 * Pegado a la tabla de espesores: un espesor sale de restar dos cotas, y si
 * la nivelación de alguna de las dos campañas no cerró, la resta puede dar un
 * número limpio sin que eso signifique que el espesor está comprobado. Mismo
 * peso visual que `BarraCierre` en rojo cuando falla — nada de un texto gris
 * al fondo de la pantalla — y el mismo texto que ya lleva la cabecera del
 * archivo exportado, para que pantalla y archivo nunca digan cosas distintas.
 */
export default function AvisoEspesores({ estado }: Props) {
  const fondo = estado.comprobado ? 'bg-pasa/10 border-pasa text-pasa' : 'bg-falla/10 border-falla text-falla'

  return <p className={`rounded border px-3 py-2 text-sm font-semibold ${fondo}`}>{estado.texto}</p>
}
