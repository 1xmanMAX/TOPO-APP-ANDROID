import { claveCelda, formatearProgresiva, progresivasDeLaToma, type CeldaEvaluada, type Id } from '@topo/core'
import { type ReactNode, useMemo, useState } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useContextoDe, useEvaluacionRasante } from '../estado/derivados'
import {
  etiquetaAccesibleCelda,
  formatearDiferencia,
  SIMBOLO_ESTADO_TOLERANCIA as SIMBOLO_ESTADO,
} from '../estadoRasante'
import { armarEsqueletoTabla } from '../esqueletoTabla'
import { formatearCota } from '../formato'

const MENSAJE_SIN_RASANTE = 'Define la rasante del proyecto para ver cuánto sobra o falta en cada punto.'

type Modo = 'diferencia' | 'real' | 'teorica'

const ETIQUETA_MODO: Record<Modo, string> = {
  diferencia: 'Diferencia',
  real: 'Cota real',
  teorica: 'Cota teórica',
}

const FONDO_HOVER_ESTADO: Partial<Record<CeldaEvaluada['estado'], string>> = {
  fuera: 'hover:bg-falla/10',
  alLimite: 'hover:bg-aviso/10',
}

/**
 * Igual que en `TablaEspesores`: un estado que pide atención (al límite o
 * fuera de tolerancia) conserva su color de texto aunque la celda quede
 * seleccionada — el fondo azul de la selección no debe apagar el aviso.
 */
function clasesCelda(celda: CeldaEvaluada | undefined, activa: boolean): { fondo: string; texto: string } {
  const requiereAtencion = celda?.estado === 'fuera' || celda?.estado === 'alLimite'

  const fondoAviso = celda ? FONDO_HOVER_ESTADO[celda.estado] : undefined
  const fondo = activa ? 'bg-marca' : (fondoAviso ?? 'hover:bg-slate-100 dark:hover:bg-slate-800')

  const texto = requiereAtencion
    ? celda!.estado === 'fuera'
      ? 'font-semibold text-falla'
      : 'font-semibold text-aviso'
    : activa
      ? 'text-white'
      : celda?.estado === 'conforme'
        ? 'text-pasa'
        : 'text-slate-300 dark:text-slate-700'

  return { fondo, texto }
}

/**
 * El valor de la celda según el interruptor. Una celda vacía es siempre un
 * campo sin dato (cota real, cota teórica o diferencia, según el modo) —
 * nunca un cero disfrazado: por eso decide el valor exacto de ese campo, y no
 * la categoría del estado. Así, por ejemplo, un punto medido pero fuera de la
 * sección sí muestra su cota real (se midió), aunque no tenga diferencia que
 * mostrar (el proyecto no define una teórica ahí).
 */
function valorVisible(celda: CeldaEvaluada, modo: Modo): string {
  if (modo === 'real') return celda.cotaReal !== null ? formatearCota(celda.cotaReal) : ''
  if (modo === 'teorica') return celda.cotaTeorica !== null ? formatearCota(celda.cotaTeorica) : ''
  return celda.diferenciaMm !== null ? formatearDiferencia(celda.diferenciaMm) : ''
}

/**
 * El símbolo tiene que acompañar a la cifra en los tres modos, no solo en
 * Diferencia: es el segundo canal de estado, junto con el color, y un
 * topógrafo que cambia a «Cota real» para copiar un número de campo sigue
 * necesitando distinguir «al límite» de «fuera de tolerancia» sin depender
 * del rojo o el ámbar. Va en su propio elemento (no pegado al texto de la
 * cifra) para que copiar o leer el valor no arrastre el símbolo.
 */
function contenidoCelda(celda: CeldaEvaluada | undefined, modo: Modo): ReactNode {
  if (!celda) return null
  const valor = valorVisible(celda, modo)
  if (valor === '') return null

  const simbolo = SIMBOLO_ESTADO[celda.estado]
  if (!simbolo) return valor

  return (
    <>
      <span aria-hidden="true">{simbolo} </span>
      <span>{valor}</span>
    </>
  )
}

interface Props {
  /**
   * Contra qué campaña se arma la tabla: la decide quien llama, nunca este
   * componente mirando `campaniaActivaId` en el almacén — mismo criterio que
   * `idCampaniaReferencia` en `MapaEstado`, `CorteTransversal` y
   * `PerfilLongitudinal`, y por la misma razón: ese argumento ("solo hay un
   * llamador hoy") ya costó rondas de arreglo repartidas entre esas tres
   * vistas cuando apareció un segundo llamador con otra intención. Antes esta
   * tabla era la única de las cuatro que se saltaba la regla. Obligatoria,
   * sin valor por defecto que lea el almacén: `null` cuando no hay campaña
   * activa que ofrecer como referencia.
   */
  idCampaniaReferencia: Id | null
}

export default function TablaDiferencias({ idCampaniaReferencia }: Props) {
  const contexto = useContextoDe(idCampaniaReferencia)
  const evaluacion = useEvaluacionRasante(idCampaniaReferencia ?? '')
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)
  const [modo, setModo] = useState<Modo>('diferencia')

  const esqueleto = useMemo(
    () =>
      contexto ? armarEsqueletoTabla(contexto.calle, progresivasDeLaToma(contexto.campania)) : null,
    [contexto],
  )
  const progresivas = esqueleto?.progresivas ?? []
  const elementos = esqueleto?.elementos ?? []

  if (!contexto) return null

  if (!evaluacion) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">
        {MENSAJE_SIN_RASANTE}
      </p>
    )
  }

  // Sin medir y fuera de sección son dos cosas distintas para quien trabaja
  // — una se resuelve saliendo a medir, la otra nunca será comparable por
  // mucho que se mida — así que van separadas: sumarlas escondería cuántas
  // de esas celdas todavía tienen arreglo.
  const resumen =
    `Conformes ${evaluacion.conformes} · Al límite ${evaluacion.alLimite} · Fuera ${evaluacion.fuera} — ` +
    `Sin medir ${evaluacion.sinMedir} · Fuera de sección ${evaluacion.fueraDeSeccion}`

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1" role="group" aria-label="Qué mostrar en la tabla de diferencias">
        {(['diferencia', 'real', 'teorica'] as const).map((opcion) => (
          <button
            key={opcion}
            type="button"
            aria-pressed={modo === opcion}
            onClick={() => setModo(opcion)}
            className={`rounded border px-2 py-1 text-sm ${
              modo === opcion
                ? 'border-marca bg-marca text-white'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {ETIQUETA_MODO[opcion]}
          </button>
        ))}
      </div>

      <div className="overflow-auto rounded border border-slate-200 dark:border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Progresiva</th>
              {elementos.map((elemento) => (
                <th key={elemento.clave} className="px-3 py-2 text-right font-medium text-slate-500">
                  {elemento.palabra}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {progresivas.map((progresiva) => (
              <tr key={progresiva} className="border-t border-slate-100 dark:border-slate-800">
                <td className="numerico px-3 py-1.5 text-slate-600 dark:text-slate-300">
                  {formatearProgresiva(progresiva)}
                </td>
                {elementos.map((elemento) => {
                  const clave = claveCelda(progresiva, elemento.clave)
                  const celda = evaluacion.celdas.get(clave)
                  const activa = seleccion.clave === clave
                  // El nombre completo, no la palabra corta de la cabecera:
                  // esto es el nombre accesible del botón, y la sección
                  // permite la misma palabra a los dos lados del eje. Dos
                  // botones anunciados «0+000 VEREDA» en la misma fila no se
                  // distinguirían de oído.
                  const etiqueta = `${formatearProgresiva(progresiva)} ${elemento.nombre}`
                  const { fondo, texto } = clasesCelda(celda, activa)
                  return (
                    <td key={clave} className="p-0.5">
                      <button
                        type="button"
                        aria-label={etiquetaAccesibleCelda(etiqueta, celda)}
                        onClick={() => seleccionar(clave)}
                        className={`numerico w-full rounded px-2 py-1 text-right ${fondo} ${texto}`}
                      >
                        {contenidoCelda(celda, modo)}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate-500">{resumen}</p>
    </div>
  )
}
