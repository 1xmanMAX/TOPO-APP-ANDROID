import { useAlmacen } from '../estado/almacen'
import { useContexto, useResultado } from '../estado/derivados'

function formatearMm(valor: number): string {
  const signo = valor > 0 ? '+' : valor < 0 ? '−' : ''
  return `${signo}${Math.abs(valor).toFixed(1)} mm`
}

export default function BarraCierre() {
  const resultado = useResultado()
  const contexto = useContexto()
  const actualizarCampania = useAlmacen((s) => s.actualizarCampania)

  if (!resultado || !contexto) return null

  const { cierre } = resultado
  const config = contexto.campania.cierre

  const fondo =
    cierre.pasa === true
      ? 'bg-pasa/10 border-pasa text-pasa'
      : cierre.pasa === false
        ? 'bg-falla/10 border-falla text-falla'
        : 'bg-aviso/10 border-aviso text-aviso'

  return (
    <div className={`flex flex-wrap items-center gap-4 rounded border px-3 py-2 text-sm ${fondo}`}>
      <span className="font-semibold">CIERRE</span>

      <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
        K
        <input
          aria-label="Longitud K"
          inputMode="decimal"
          value={cierre.longitudKKm.toFixed(3)}
          readOnly={config.longitudKAuto}
          onChange={(evento) => {
            const numero = Number(evento.target.value.replace(',', '.'))
            if (Number.isFinite(numero)) {
              actualizarCampania(contexto.campania.id, {
                cierre: { ...config, longitudK: numero, longitudKAuto: false },
              })
            }
          }}
          className="numerico w-20 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-right dark:border-slate-700 dark:bg-slate-900"
        />
        km
      </label>

      <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={config.longitudKAuto}
          onChange={(evento) =>
            actualizarCampania(contexto.campania.id, {
              cierre: { ...config, longitudKAuto: evento.target.checked },
            })
          }
        />
        calcular sola
      </label>

      <select
        aria-label="Clase de nivelación"
        value={config.coeficiente}
        onChange={(evento) =>
          actualizarCampania(contexto.campania.id, {
            cierre: { ...config, coeficiente: Number(evento.target.value) },
          })
        }
        className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      >
        <option value={7}>Precisión · e = 7 mm</option>
        <option value={12}>Tercer orden · e = 12 mm</option>
        <option value={15}>Tercer orden · e = 15 mm</option>
      </select>

      {cierre.toleranciaMm !== null && (
        <span className="numerico">tolerancia ±{cierre.toleranciaMm.toFixed(1)} mm</span>
      )}

      {cierre.errorMm !== null ? (
        <span className="numerico font-semibold">
          error {formatearMm(cierre.errorMm)} {cierre.pasa ? '✓ PASA' : '✗ FUERA DE TOLERANCIA'}
        </span>
      ) : (
        <span className="font-medium">circuito abierto — sin verificación</span>
      )}
    </div>
  )
}
