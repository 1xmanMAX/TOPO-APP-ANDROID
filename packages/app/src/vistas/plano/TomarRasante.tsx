import { formatearPendiente, formatearProgresiva, type CotaSobrePista, type Rasante } from '@topo/core'
import { useId, useState } from 'react'
import { cambioDeCotaProyecto, rasanteDesdeCotas, RESIDUO_AVISO_MM, textoMm } from './datosPista'
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO } from './estilos'

/** «3244.400 m en 0+000, −0.50 %»: así se lee una rasante de una sola pendiente. */
export function textoRasante(r: Rasante): string {
  return `${r.cotaArranque.toFixed(3)} m en ${formatearProgresiva(r.progresivaArranque)}, ${formatearPendiente(r.pendienteLongitudinal)}`
}

/** «· +2 mm de la nueva»; desde `RESIDUO_AVISO_MM`, con △ y en negrita. */
function ResiduoDeCota({ mm }: { mm: number }) {
  const grande = Math.abs(mm) >= RESIDUO_AVISO_MM
  return (
    <span className={grande ? 'font-medium' : 'text-tenue'}>
      {' · '}
      {grande && <span aria-hidden="true">△ </span>}
      {textoMm(mm)} de la nueva
    </span>
  )
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
  const residuoDe = new Map(resultado?.residuos.map((r) => [r.progresiva, r.mm]) ?? [])
  // Lo que cambia la cota de proyecto en las cotas usadas: ahí se ve si el
  // reemplazo es cosa de redondeo o mueve lecturas de mira.
  const cambios = actual && resultado ? cambioDeCotaProyecto(actual, resultado.rasante, usadas.map((c) => c.progresiva)) : []
  const mayorCambio = cambios.reduce<(typeof cambios)[number] | null>(
    (mayor, c) => (mayor === null || Math.abs(c.mm) > Math.abs(mayor.mm) ? c : mayor),
    null,
  )

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
    } else if (aviso) {
      alConfirmar(rasante, `△ Rasante tomada: ${textoRasante(rasante)}. ${aviso}`, 'aviso')
    } else {
      alConfirmar(rasante, `✓ Rasante tomada: ${textoRasante(rasante)}.`, 'ok')
    }
  }

  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-2 rounded-xl border border-borde-fuerte bg-fondo p-3 text-sm">
      <h4 id={idTitulo} className="text-[15px] font-semibold">
        Rasante desde las cotas del plano
      </h4>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs text-tenue">
          Cotas que se usan (quita las de un cruce o de otra calle):
        </legend>
        <ul className="numerico flex flex-col gap-1">
          {cotas.map((c, i) => (
            <li key={`${c.progresiva}-${i}`}>
              <label className="flex min-h-11 items-center gap-2 rounded-lg px-1 hover:bg-tarjeta">
                <input type="checkbox" className="size-5 shrink-0 accent-marca" checked={!descartadas.has(i)} onChange={(e) => alternar(i, e.target.checked)} />
                {/* Un solo bloque de texto, para que en el celular corra de corrido y no en columnas. */}
                <span className="min-w-0 flex-1">
                  {formatearProgresiva(c.progresiva)} · cota {c.cota.toFixed(3)} m
                  {Math.abs(c.desplazamiento) >= 0.5 ? ` · a ${Math.abs(c.desplazamiento).toFixed(1)} m del eje` : ''}
                  {!descartadas.has(i) && residuoDe.has(c.progresiva) && <ResiduoDeCota mm={residuoDe.get(c.progresiva)!} />}
                </span>
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
            <p className="rounded-[10px] bg-aviso-suave px-3 py-2 text-aviso">
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
        <p className="rounded-[10px] bg-aviso-suave px-3 py-2 text-aviso">
          <span aria-hidden="true">△ </span>
          La calle ya tiene rasante: <span className="numerico">{textoRasante(actual)}</span>.
          {mayorCambio && resultado && (
            <>
              {' '}
              Con la nueva, la cota de proyecto del eje cambia hasta{' '}
              <span className="numerico font-medium">{textoMm(mayorCambio.mm)}</span> (en{' '}
              {formatearProgresiva(mayorCambio.progresiva)}).
            </>
          )}{' '}
          Se reemplaza
          {nivelacionesConTomas > 0
            ? ` y cambian la cota de proyecto y la diferencia de ${nivelacionesConTomas === 1 ? 'una nivelación' : `${nivelacionesConTomas} nivelaciones`} ya medidas.`
            : '.'}
        </p>
      )}

      <div className="flex flex-col gap-2">
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
