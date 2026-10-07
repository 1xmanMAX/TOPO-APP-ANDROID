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
 * El aviso al anotar: qué lectura se espera, y en cuanto se escribe una,
 * qué cota sale, cuánto se aparta del proyecto, si corta o rellena, y si
 * merece volver a leerse mientras la mira sigue en el punto. Todo lo calcula
 * `evaluarLectura` del motor; aquí solo se escribe.
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
  const accion = textoAccion(aviso.accion)

  return (
    <section aria-label={titulo} className="flex flex-col gap-1.5">
      {anotada && <h3 className="text-[13px] text-tenue">{titulo}</h3>}

      {sinAltura && (
        <p className="text-[13px] font-semibold text-aviso">
          <span aria-hidden="true">△ </span>Falta la vista atrás de esta estación: sin altura de instrumento no hay cota.
        </p>
      )}

      {!anotada &&
        (aviso.lecturaEsperada !== null ? (
          <p className="text-[13px] text-tenue">
            Esperada cerca de <b className="numerico text-tinta">{formatearCota(aviso.lecturaEsperada)}</b>
            {rango && (
              <>
                {' '}
                · conforme entre <span className="numerico">{formatearCota(rango.desde)}</span> y{' '}
                <span className="numerico">{formatearCota(rango.hasta)}</span>
              </>
            )}
            {Number.isFinite(toleranciaMm) && <> · ±{toleranciaMm} mm</>}
          </p>
        ) : cotaProyecto === null ? (
          <p className="text-[13px] text-tenue">Sin rasante en este punto: solo sale la cota.</p>
        ) : null)}

      {/* Solo esta línea se anuncia: estado y qué hacer, no la ficha entera en cada tecla. */}
      <div aria-live="polite">
        {juzgar && (
          <div className={`flex flex-col gap-0.5 rounded-[10px] px-3 py-2 ${visual.clases}`}>
            <p className="text-[15px]">
              <b>
                <span aria-hidden="true">{visual.simbolo} </span>
                {visual.texto}
              </b>
              {aviso.diferenciaMm !== null && (
                <>
                  {' · '}
                  <b className="numerico">{formatearDiferencia(aviso.diferenciaMm)}</b>
                </>
              )}
              {accion && <> · {accion}</>}
            </p>
            <p className="numerico text-sm">
              Cota {aviso.cota === null ? '—' : formatearCota(aviso.cota)}
              {cotaProyecto !== null && <> · proyecto {formatearCota(cotaProyecto)}</>}
            </p>
            {aviso.sospechosa && (
              <p role={anotada ? 'alert' : undefined} className="text-[15px] font-bold">
                <span aria-hidden="true">✗ </span>¿Leíste bien? Vuelve a mirar la mira antes de seguir.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Lo no comprobado se dice siempre, también antes de escribir. */}
      {(juzgar ? aviso.avisos : comprobado ? [] : [AVISO_SIN_COMPROBAR]).map((linea) => (
        <p key={linea} className="text-[13px] font-semibold text-aviso">
          <span aria-hidden="true">△ </span>
          {linea}
        </p>
      ))}
    </section>
  )
}
