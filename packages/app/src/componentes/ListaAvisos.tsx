import { useAlmacen } from '../estado/almacen'
import { useResultado } from '../estado/derivados'

const ESTILO = {
  error: 'border-falla text-falla',
  advertencia: 'border-aviso text-aviso',
  informacion: 'border-slate-300 text-slate-500 dark:border-slate-700',
} as const

export default function ListaAvisos() {
  const resultado = useResultado()
  const seleccionar = useAlmacen((s) => s.seleccionar)

  if (!resultado || resultado.avisos.length === 0) return null

  return (
    <ul className="flex flex-col gap-1.5">
      {resultado.avisos.map((aviso, indice) => (
        <li key={`${aviso.clave ?? 'general'}-${indice}`}>
          <button
            type="button"
            onClick={() => aviso.clave && seleccionar(aviso.clave)}
            className={`w-full rounded border px-3 py-2 text-left text-sm ${ESTILO[aviso.nivel]}`}
          >
            {aviso.mensaje}
          </button>
        </li>
      ))}
    </ul>
  )
}
