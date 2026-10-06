import {
  alturaInstrumental as alturaInstrumentalDe,
  claveCelda,
  formatearProgresiva,
  hojaDeReplanteo,
  redondear3,
  veredictoReplanteo,
  type FilaReplanteo,
  type MotivoSinObjetivo,
} from '@topo/core'
import { useState } from 'react'
import { useAlmacen } from '../../estado/almacen'
import { useContexto, useProgresivas } from '../../estado/derivados'
import { formatearCota } from '../../formato'
import {
  alturaInstrumentalDeEstacion,
  AVISO_DESTACADO,
  BOTON_PRINCIPAL,
  BOTON_SECUNDARIO,
  estacionComprobada,
  instrumentoDe,
  leerNumero,
  reglasMiraDe,
  VISUAL_ESTADO,
} from './comun'
import { useResultadoCalle } from './resultadoCalle'

type OrigenAltura = 'libreta' | 'bm'

const MOTIVO: Record<MotivoSinObjetivo, string> = {
  sinRasante: 'la calle no tiene rasante de proyecto',
  capaInexistente: 'la capa no está en el paquete de capas',
  fueraDeSeccion: 'el punto cae fuera de la sección del proyecto',
  alturaInvalida: 'falta la altura del instrumento',
}

/**
 * El aviso que `hojaDeReplanteo` pone cuando la AI no está comprobada. Aquí
 * va arriba y destacado, así que se saca de la lista de abajo para no
 * decirlo dos veces.
 */
const AVISO_HOJA_SIN_COMPROBAR = 'Cotas sobre una nivelación sin cerrar: no comprobadas.'

const VEREDICTO: Record<'corta' | 'rellena' | 'enCota', string> = {
  corta: 'CORTA',
  rellena: 'RELLENA',
  enCota: 'EN COTA',
}

/**
 * Replantear: la hoja de replanteo de la progresiva elegida para la capa
 * activa. Por estaca, la lectura que tiene que marcar la mira; se escribe la
 * que se leyó (con ±1 mm para ir afinando mientras el ayudante mueve la
 * estaca) y sale el veredicto grande: CORTA, RELLENA o EN COTA.
 *
 * La estaca en la que se trabaja es la selección del almacén, como en los
 * otros modos: tocar un punto del corte o del mapa la elige, y «Siguiente
 * estaca» mueve la selección (y con ella el corte).
 *
 * Las lecturas leídas son de este rato en el terreno y no se guardan en el
 * proyecto: el modelo guarda nivelaciones, y una estaca afinada a cota se
 * comprueba después midiéndola en Medir.
 */
export default function FichaReplantear() {
  const contexto = useContexto()
  const resultado = useResultadoCalle()
  const proyecto = useAlmacen((s) => s.proyecto)
  const estacionActiva = useAlmacen((s) => s.estacionActiva)
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)
  const progresivas = useProgresivas()

  const [origen, setOrigen] = useState<OrigenAltura>('libreta')
  const [bmId, setBmId] = useState<string>(proyecto.bms[0]?.id ?? '')
  const [textoVistaAtras, setTextoVistaAtras] = useState('')
  const [leidas, setLeidas] = useState<Record<string, string>>({})

  const instrumento = instrumentoDe(proyecto)
  const mira = reglasMiraDe(instrumento)
  const progresiva = seleccion.progresiva ?? progresivas[0] ?? null

  // De dónde sale la altura del instrumento: de la estación de hoy en la
  // libreta, o de una vista atrás a un BM escrita aquí mismo.
  // El BM se deriva en cada dibujado: si se abre otro proyecto o el elegido
  // desaparece, cae al primero que haya en vez de quedarse en uno que no existe.
  const bm = proyecto.bms.find((b) => b.id === bmId) ?? proyecto.bms[0] ?? null
  const vistaAtrasEscrita = textoVistaAtras.trim() !== ''
  const indiceSeguro = contexto ? Math.min(estacionActiva, Math.max(0, contexto.campania.estaciones.length - 1)) : 0
  let alturaInstrumental = Number.NaN
  let correccionMm = 0
  let comprobado = false
  if (origen === 'libreta') {
    // Compensada si el circuito cerró: el objetivo tiene que cuadrar con lo que Revisar juzgará después.
    if (contexto && resultado) {
      ;({ altura: alturaInstrumental, correccionMm } = alturaInstrumentalDeEstacion(
        resultado,
        contexto.campania,
        indiceSeguro,
      ))
    }
    // Solo si el cierre respalda esta estación (no una de antes de volver a arrancar en un BM).
    comprobado = resultado ? estacionComprobada(resultado, indiceSeguro) : false
  } else if (bm) {
    alturaInstrumental = alturaInstrumentalDe(bm.cota, leerNumero(textoVistaAtras), instrumento.largoMira) ?? Number.NaN
    // Un BM oficial ya tiene su cota comprobada; uno auxiliar vale lo que su nivelación.
    comprobado = bm.tipo === 'oficial'
  }

  // Una sola progresiva: la cuenta es corta y se rehace en cada dibujado.
  const hoja =
    !contexto || progresiva === null
      ? null
      : hojaDeReplanteo({
          calle: contexto.calle,
          capas: proyecto.capas,
          capaId: contexto.campania.capaId,
          progresivas: [progresiva],
          alturaInstrumental,
          alturaComprobada: comprobado,
          mira,
          visualMax: instrumento.visualMax,
        })

  if (!contexto || !resultado) {
    return <p className="text-sm text-slate-500">Elige una capa para replantearla.</p>
  }
  if (progresiva === null || !hoja) {
    return (
      <p className="text-sm text-slate-500">
        Esta capa todavía no tiene progresivas: añádelas en Medir para tener dónde replantear.
      </p>
    )
  }

  const filas = hoja.filas
  const indiceFila = Math.max(
    0,
    filas.findIndex((f) => claveCelda(f.progresiva, f.puntoId) === seleccion.clave),
  )
  const fila: FilaReplanteo | undefined = filas[indiceFila]
  const clave = fila ? claveCelda(fila.progresiva, fila.puntoId) : ''
  // Lo leído vale para esta capa y esta altura de instrumento: con otra capa
  // u otra estación el objetivo es otro, y el dato de antes no le corresponde.
  const origenClave = origen === 'bm' ? `bm:${bm?.id ?? ''}:${textoVistaAtras.trim()}` : `libreta:${indiceSeguro}`
  const claveLeida = `${contexto.campania.id}|${origenClave}|${clave}`
  const textoLeida = leidas[claveLeida] ?? ''
  const toleranciaMm = hoja.toleranciaMm ?? Number.NaN

  const veredicto =
    fila && fila.lecturaObjetivo !== null && textoLeida.trim() !== ''
      ? veredictoReplanteo(fila.lecturaObjetivo, leerNumero(textoLeida), toleranciaMm, {
          alturaComprobada: comprobado,
          mira,
        })
      : null

  const indiceProgresiva = progresivas.findIndex((p) => redondear3(p) === redondear3(progresiva))
  const hayOtraProgresiva = indiceProgresiva >= 0 && indiceProgresiva < progresivas.length - 1
  const esUltimaEstaca = indiceFila >= filas.length - 1 && !hayOtraProgresiva

  function escribirLeida(texto: string) {
    setLeidas((antes) => ({ ...antes, [claveLeida]: texto }))
  }

  /** ±1 mm sobre lo escrito; si aún no hay nada, se parte del objetivo. */
  function ajustar(mm: number) {
    const base = textoLeida.trim() === '' ? (fila?.lecturaObjetivo ?? Number.NaN) : leerNumero(textoLeida)
    if (!Number.isFinite(base)) return
    escribirLeida(redondear3(base + mm / 1000).toFixed(3))
  }

  function siguienteEstaca() {
    const siguiente = filas[indiceFila + 1]
    if (siguiente) {
      seleccionar(claveCelda(siguiente.progresiva, siguiente.puntoId))
      return
    }
    if (!hayOtraProgresiva) return
    // La siguiente progresiva arranca por su primer punto de izquierda a derecha, como la hoja.
    const proxima = progresivas[indiceProgresiva + 1]!
    const primerPunto = [...contexto!.calle.seccion.puntos].sort((a, b) => a.distancia - b.distancia)[0]
    if (primerPunto) seleccionar(claveCelda(proxima, primerPunto.id))
  }

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2 rounded border border-slate-200 p-3 dark:border-slate-800">
        <legend className="px-1 text-sm font-medium">Altura del instrumento</legend>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={origen === 'libreta'}
            onClick={() => setOrigen('libreta')}
            className={origen === 'libreta' ? BOTON_PRINCIPAL : BOTON_SECUNDARIO}
          >
            De la libreta
          </button>
          <button
            type="button"
            aria-pressed={origen === 'bm'}
            onClick={() => setOrigen('bm')}
            className={origen === 'bm' ? BOTON_PRINCIPAL : BOTON_SECUNDARIO}
          >
            Desde un BM
          </button>
        </div>
        {origen === 'bm' && proyecto.bms.length === 0 && (
          <p className="rounded border border-aviso px-3 py-2 text-sm text-aviso">
            <span aria-hidden="true">△ </span>No hay BMs en este proyecto: créalos en Obra para partir de uno.
          </p>
        )}
        {origen === 'bm' && proyecto.bms.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span>BM de partida</span>
              <select
                value={bm?.id ?? ''}
                onChange={(evento) => setBmId(evento.target.value)}
                className="min-h-11 rounded border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
              >
                {proyecto.bms.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre} · {formatearCota(b.cota)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Vista atrás al BM</span>
              <input
                inputMode="decimal"
                autoComplete="off"
                value={textoVistaAtras}
                onChange={(evento) => setTextoVistaAtras(evento.target.value)}
                className="numerico min-h-11 w-28 rounded border border-slate-300 px-2 text-right dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>
        )}
        <p className="text-sm">
          {Number.isFinite(alturaInstrumental) ? (
            <>
              AI <strong className="numerico">{formatearCota(alturaInstrumental)}</strong>
              {origen === 'libreta' && correccionMm !== 0 && (
                <>
                  {' '}
                  compensada (
                  <span className="numerico">
                    {correccionMm > 0 ? '+' : '−'}
                    {Math.abs(correccionMm).toFixed(1)} mm
                  </span>{' '}
                  sobre la CI de la libreta)
                </>
              )}
              {origen === 'libreta' && <> · estación {indiceSeguro + 1} de la libreta</>}
              {origen === 'bm' && bm && (
                <>
                  {' '}
                  · {bm.nombre} {bm.tipo === 'oficial' ? 'oficial' : 'auxiliar'}
                </>
              )}
            </>
          ) : origen === 'libreta' ? (
            'La estación de la libreta no tiene vista atrás: escríbela en Medir o parte de un BM.'
          ) : !bm ? null : vistaAtrasEscrita ? (
            <span className="text-falla">
              <span aria-hidden="true">✗ </span>
              La vista atrás {textoVistaAtras.trim()} no cabe en la mira de {instrumento.largoMira} m: vuelve a leerla.
            </span>
          ) : (
            'Escribe la vista atrás al BM para tener la altura del instrumento.'
          )}
        </p>
      </fieldset>

      {!hoja.comprobado && (
        <p className={AVISO_DESTACADO}>
          <span aria-hidden="true">△ </span>
          {origen === 'bm' && bm && bm.tipo !== 'oficial'
            ? `${bm.nombre} es un BM auxiliar: su cota vale lo que la nivelación que lo dejó. Cotas no comprobadas.`
            : AVISO_HOJA_SIN_COMPROBAR}
        </p>
      )}

      {fila && (
        <section aria-label="Estaca actual" className="flex flex-col gap-2 rounded border-2 border-marca p-3">
          <h3 className="font-semibold">
            Estaca {indiceFila + 1} de {filas.length} · {formatearProgresiva(fila.progresiva)} {fila.nombre}
          </h3>
          {fila.lecturaObjetivo === null ? (
            <p className="text-sm text-aviso">
              <span aria-hidden="true">△ </span>Sin lectura objetivo: {MOTIVO[fila.motivoSinObjetivo ?? 'alturaInvalida']}.
            </p>
          ) : (
            <>
              <p className="text-sm">
                Lectura objetivo{' '}
                <strong className="numerico text-3xl">
                  {formatearCota(fila.lecturaObjetivo)}
                </strong>
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Cota de proyecto <span className="numerico">{formatearCota(fila.cotaProyecto!)}</span>
                {fila.aceptable && (
                  <>
                    {' '}
                    · conforme entre <span className="numerico">{formatearCota(fila.aceptable.desde)}</span> y{' '}
                    <span className="numerico">{formatearCota(fila.aceptable.hasta)}</span>
                  </>
                )}
              </p>
              {fila.rangoObjetivo === 'imposible' && (
                <p className="text-sm text-falla">
                  <span aria-hidden="true">✗ </span>El objetivo no cabe en la mira de {instrumento.largoMira} m: cambia de estación.
                </p>
              )}
              {fila.rangoObjetivo === 'pocoPrecisa' && (
                <p className="text-sm text-aviso">
                  <span aria-hidden="true">△ </span>El objetivo cae cerca del suelo o de la punta de la mira: poco preciso.
                </p>
              )}

              <div className="flex flex-col gap-1 text-sm">
                <span aria-hidden="true" className="font-medium">
                  Lectura leída
                </span>
                <div className="grid grid-cols-[auto_1fr_auto] gap-2">
                  {/* El nombre accesible es el texto visible («−1 mm»): el control por voz dice lo que ve. */}
                  <button
                    type="button"
                    onClick={() => ajustar(-1)}
                    className={`${BOTON_SECUNDARIO} min-w-14 text-base`}
                  >
                    −1 mm
                  </button>
                  <input
                    aria-label="Lectura leída"
                    inputMode="decimal"
                    autoComplete="off"
                    value={textoLeida}
                    onChange={(evento) => escribirLeida(evento.target.value)}
                    placeholder={formatearCota(fila.lecturaObjetivo)}
                    className="numerico min-h-11 min-w-0 rounded border-2 border-marca px-3 text-right text-xl dark:bg-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => ajustar(1)}
                    className={`${BOTON_SECUNDARIO} min-w-14 text-base`}
                  >
                    +1 mm
                  </button>
                </div>
              </div>

              {/* La región viva queda montada aunque esté vacía: una que aparece ya llena muchas veces no se anuncia. */}
              <div
                role="status"
                aria-label="Veredicto"
                className={
                  veredicto
                    ? `flex flex-col items-center gap-1 rounded border-2 px-3 py-4 text-center ${VISUAL_ESTADO[veredicto.estado].clases}`
                    : undefined
                }
              >
                {veredicto && (
                  <>
                  <p className="text-4xl font-black tracking-wide">
                    <span aria-hidden="true">{VISUAL_ESTADO[veredicto.estado].simbolo} </span>
                    {veredicto.tipo ? VEREDICTO[veredicto.tipo] : 'VUELVE A LEER'}
                    {veredicto.tipo && veredicto.tipo !== 'enCota' && <> {veredicto.mm} mm</>}
                  </p>
                  <p className="text-sm font-semibold">{VISUAL_ESTADO[veredicto.estado].texto}</p>
                  {veredicto.sospechosa && <p className="text-base font-bold">¿Leíste bien?</p>}
                  {veredicto.avisos.map((aviso) => (
                    <p key={aviso} className="text-sm font-semibold">
                      {aviso}
                    </p>
                  ))}
                  </>
                )}
              </div>
            </>
          )}

          <button type="button" onClick={siguienteEstaca} disabled={esUltimaEstaca} className={BOTON_PRINCIPAL}>
            {esUltimaEstaca ? 'Última estaca' : 'Siguiente estaca'}
          </button>
        </section>
      )}

      <section aria-label="Hoja de replanteo" className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Hoja de {formatearProgresiva(progresiva)}</h3>
        <ul className="flex flex-col gap-1">
          {filas.map((f, indice) => {
            const claveFila = claveCelda(f.progresiva, f.puntoId)
            const objetivo = f.lecturaObjetivo === null ? 'sin objetivo' : `objetivo ${formatearCota(f.lecturaObjetivo)}`
            return (
              <li key={claveFila}>
                <button
                  type="button"
                  aria-current={indice === indiceFila ? 'true' : undefined}
                  aria-label={`Estaca ${f.nombre}, ${objetivo}`}
                  onClick={() => seleccionar(claveFila)}
                  className={`flex min-h-11 w-full items-center justify-between rounded px-3 text-left text-sm ${
                    indice === indiceFila
                      ? 'bg-marca text-white'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{f.nombre}</span>
                  <span className="numerico">
                    {f.lecturaObjetivo === null ? '—' : formatearCota(f.lecturaObjetivo)}
                    {f.rangoObjetivo === 'imposible' && ' ✗'}
                    {f.rangoObjetivo === 'pocoPrecisa' && ' △'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        {hoja.avisos
          .filter((aviso) => aviso !== AVISO_HOJA_SIN_COMPROBAR)
          .map((aviso) => (
          <p key={aviso} className={AVISO_DESTACADO}>
            <span aria-hidden="true">△ </span>
            {aviso}
          </p>
        ))}
      </section>
    </div>
  )
}
