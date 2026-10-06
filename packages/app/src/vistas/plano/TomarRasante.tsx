import { formatearPendiente, formatearProgresiva, type CotaSobrePista, type Rasante } from '@topo/core'
import { useId, useState } from 'react'
import { rasanteDesdeCotas } from './datosPista'
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO } from './estilos'

/** «3244.400 m en 0+000, −0.50 %»: así se lee una rasante de una sola pendiente. */
export function textoRasante(r: Rasante): string {
  return `${r.cotaArranque.toFixed(3)} m en ${formatearProgresiva(r.progresivaArranque)}, ${formatearPendiente(r.pendienteLongitudinal)}`
}

interface Props {
  /** Las cotas del plano junto a la pista, ya puestas en su progresiva por el motor. */
  cotas: readonly CotaSobrePista[]
  /** La rasante que la calle ya tiene (se reemplaza), o null. */
  actual: Rasante | null
  /** Nivelaciones con tomas en la calle: su cota de proyecto cambia con la rasante. */
  nivelacionesConTomas: number
  alConfirmar: (rasante: Rasante, mensaje: string, tipo: 'ok' | 'aviso') => void
  alCancelar: () => void
}

/**
 * Antes de guardar la rasante tomada del plano: qué cotas se usan (y en qué
 * progresiva cae cada una, para descartar las de un cruce), qué rasante sale,
 * hasta dónde vale si hay quiebres y, si la calle ya tenía una, cuál se
 * pierde y cuántas nivelaciones cambian de diferencia. Nada se guarda sin
 * este segundo toque: el almacén no tiene deshacer.
 */
export default function TomarRasante({ cotas, actual, nivelacionesConTomas, alConfirmar, alCancelar }: Props) {
  const idTitulo = useId()
  const [descartadas, setDescartadas] = useState<ReadonlySet<number>>(() => new Set())
  const usadas = cotas.filter((_, i) => !descartadas.has(i))
  const resultado = rasanteDesdeCotas(usadas, actual)

  function alternar(i: number, usar: boolean) {
    setDescartadas((antes) => {
      const siguientes = new Set(antes)
      if (usar) siguientes.delete(i)
      else siguientes.add(i)
      return siguientes
    })
  }

  function confirmar() {
    if (!resultado) return
    const { rasante, aviso, valeHasta } = resultado
    if (valeHasta !== null) {
      alConfirmar(rasante, `Rasante tomada solo del primer tramo: ${textoRasante(rasante)}. ${aviso}`, 'aviso')
    } else {
      alConfirmar(rasante, `✓ Rasante tomada: ${textoRasante(rasante)}.`, 'ok')
    }
  }

  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-2 rounded border border-marca/60 p-2 text-sm">
      <h4 id={idTitulo} className="font-medium">
        Rasante desde las cotas del plano
      </h4>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs text-slate-500 dark:text-slate-400">
          Cotas que se usan (quita las de un cruce o de otra calle):
        </legend>
        <ul className="numerico flex flex-col gap-1">
          {cotas.map((c, i) => (
            <li key={`${c.progresiva}-${i}`}>
              <label className="flex min-h-11 items-center gap-2 rounded px-1 hover:bg-slate-100 dark:hover:bg-slate-800">
                <input type="checkbox" className="size-5" checked={!descartadas.has(i)} onChange={(e) => alternar(i, e.target.checked)} />
                {formatearProgresiva(c.progresiva)} · cota {c.cota.toFixed(3)} m
                {Math.abs(c.desplazamiento) >= 0.5 ? ` · a ${Math.abs(c.desplazamiento).toFixed(1)} m del eje` : ''}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {resultado ? (
        <>
          <p>
            Nueva: <span className="numerico font-medium">{textoRasante(resultado.rasante)}</span>
          </p>
          {resultado.aviso && (
            <p className="rounded border border-aviso/60 bg-aviso/10 p-2">
              <span aria-hidden="true">△ </span>
              {resultado.aviso}
            </p>
          )}
        </>
      ) : (
        <p>
          <span aria-hidden="true">△ </span>
          Hacen falta al menos dos cotas para sacar una pendiente.
        </p>
      )}

      {actual && (
        <p className="rounded border border-aviso/60 bg-aviso/10 p-2">
          <span aria-hidden="true">△ </span>
          La calle ya tiene rasante: <span className="numerico">{textoRasante(actual)}</span>. Se reemplaza
          {nivelacionesConTomas > 0
            ? ` y cambian la cota de proyecto y la diferencia de ${nivelacionesConTomas === 1 ? 'una nivelación' : `${nivelacionesConTomas} nivelaciones`} ya medidas.`
            : '.'}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" className={BOTON_PRINCIPAL} disabled={!resultado} onClick={confirmar}>
          {actual ? 'Sí, reemplazar la rasante' : 'Sí, tomar esta rasante'}
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={alCancelar}>
          No, dejarla como está
        </button>
      </div>
    </section>
  )
}
