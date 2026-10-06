import { AVISO_SIN_COMPROBAR, evaluarLectura, rangoEsperado, type ReglasMira } from '@topo/core'
import { formatearDiferencia } from '../../estadoRasante'
import { formatearCota } from '../../formato'
import { leerNumero, llegaAlMilimetro, textoAccion, VISUAL_ESTADO } from './comun'

interface Props {
  /** El texto tal como está en el campo: se juzga mientras se escribe. */
  texto: string
  /** Cota instrumento de la estación en la que se anota; NaN si falta la vista atrás. */
  alturaInstrumental: number
  /** Null si el proyecto no define cota en ese punto (o no hay rasante). */
  cotaProyecto: number | null
  toleranciaMm: number
  /** Si la estación está respaldada por el cierre: mientras no, lo calculado no está comprobado (diseño §3). */
  comprobado: boolean
  mira: ReglasMira
  /** «Aviso al anotar» mientras se escribe; «Última lectura anotada» después. */
  titulo?: string
  /**
   * Lectura ya anotada: se juzga tal cual y, si es sospechosa, se alerta.
   * Mientras se escribe, en cambio, solo se juzga cuando el texto llega al
   * milímetro, y sin alerta: el lector de pantalla no tiene que gritar en
   * cada dígito.
   */
  anotada?: boolean
}

/**
 * El aviso al anotar: qué cota sale, cuánto se aparta del proyecto, si
 * corta o rellena, y si la lectura merece volver a leerse mientras la mira
 * sigue en el punto. Todo lo calcula `evaluarLectura` del motor; aquí solo
 * se escribe.
 */
export default function AvisoAlAnotar({
  texto,
  alturaInstrumental,
  cotaProyecto,
  toleranciaMm,
  comprobado,
  mira,
  titulo = 'Aviso al anotar',
  anotada = false,
}: Props) {
  const vacio = texto.trim() === ''
  const juzgar = !vacio && (anotada || llegaAlMilimetro(texto))
  const aviso = evaluarLectura({
    alturaInstrumental,
    lectura: leerNumero(texto),
    cotaProyecto,
    toleranciaMm,
    alturaComprobada: comprobado,
    mira,
  })
  const rango =
    cotaProyecto !== null && Number.isFinite(alturaInstrumental)
      ? rangoEsperado(alturaInstrumental, cotaProyecto, toleranciaMm)
      : null
  const sinAltura = !Number.isFinite(alturaInstrumental)
  const visual = VISUAL_ESTADO[aviso.estado]

  const esperada = (
    <p className="text-sm">
      {aviso.lecturaEsperada !== null ? (
        <>
          Lectura esperada <strong className="numerico">{formatearCota(aviso.lecturaEsperada)}</strong>
          {rango && (
            <span className="text-slate-600 dark:text-slate-300">
              {' '}
              (conforme entre <span className="numerico">{formatearCota(rango.desde)}</span> y{' '}
              <span className="numerico">{formatearCota(rango.hasta)}</span>)
            </span>
          )}
        </>
      ) : cotaProyecto === null ? (
        <span className="text-slate-600 dark:text-slate-300">Sin rasante en este punto: solo sale la cota.</span>
      ) : null}
    </p>
  )

  return (
    <section aria-label={titulo} className="flex flex-col gap-2 rounded border border-slate-200 p-3 dark:border-slate-800">
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{titulo}</h3>

      {sinAltura && (
        <p className="text-sm text-aviso">
          <span aria-hidden="true">△ </span>Falta la vista atrás de esta estación: sin altura de instrumento no hay cota.
        </p>
      )}

      {/* Solo esta línea se anuncia: estado y qué hacer, no la ficha entera en cada tecla. */}
      <div aria-live="polite">
        {juzgar && (
          <div className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded border px-3 py-2 ${visual.clases}`}>
            <span className="text-lg font-bold">
              <span aria-hidden="true">{visual.simbolo} </span>
              {visual.texto}
            </span>
            {aviso.diferenciaMm !== null && (
              <span className="numerico font-semibold">{formatearDiferencia(aviso.diferenciaMm)}</span>
            )}
            {textoAccion(aviso.accion) && <span className="font-semibold">{textoAccion(aviso.accion)}</span>}
          </div>
        )}
      </div>

      {juzgar && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
            <dt className="text-slate-500">Cota</dt>
            <dd className="numerico">{aviso.cota === null ? '—' : formatearCota(aviso.cota)}</dd>
            <dt className="text-slate-500">Proyecto</dt>
            <dd className="numerico">{cotaProyecto === null ? '—' : formatearCota(cotaProyecto)}</dd>
          </dl>
          {aviso.sospechosa && (
            <p
              role={anotada ? 'alert' : undefined}
              className="rounded bg-falla/10 px-3 py-2 text-base font-bold text-falla"
            >
              <span aria-hidden="true">✗ </span>¿Leíste bien? Vuelve a mirar la mira antes de seguir.
            </p>
          )}
        </>
      )}
      {esperada}

      {/* Lo no comprobado se dice siempre, también antes de escribir. */}
      {(juzgar ? aviso.avisos : comprobado ? [] : [AVISO_SIN_COMPROBAR]).map((linea) => (
        <p key={linea} className="text-xs text-aviso">
          <span aria-hidden="true">△ </span>
          {linea}
        </p>
      ))}
    </section>
  )
}
