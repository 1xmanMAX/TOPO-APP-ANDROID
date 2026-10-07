import {
  alturaInstrumental as alturaInstrumentalDe,
  claveCelda,
  formatearProgresiva,
  hojaDeReplanteo,
  palabraDePunto,
  redondear3,
  veredictoReplanteo,
  type FilaReplanteo,
  type MotivoSinObjetivo,
} from '@topo/core'
import { useState } from 'react'
import AvisoLinea from '../../componentes/AvisoLinea'
import Segmentado from '../../componentes/Segmentado'
import { BOTON_ICONO, BOTON_PRINCIPAL, CLASES_ESTADO, TARJETA_OSCURA } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import { useContexto, useProgresivas } from '../../estado/derivados'
import { formatearCota } from '../../formato'
import {
  alturaInstrumentalDeEstacion,
  estacionComprobada,
  instrumentoDe,
  leerNumero,
  reglasMiraDe,
  VISUAL_ESTADO,
} from './comun'
import FichaNiveles from './FichaNiveles'
import { useEvaluacionCalle, useResultadoCalle } from './resultadoCalle'

type DesdeDonde = 'proyecto' | 'capa'

const DESDE: { valor: DesdeDonde; texto: string }[] = [
  { valor: 'proyecto', texto: 'Desde el proyecto' },
  { valor: 'capa', texto: 'Desde una capa medida' },
]

/**
 * Replantear tiene dos puntos de partida: la rasante de proyecto (la cota que
 * pide el plano) o una capa ya medida más su espesor (la herramienta
 * «Pistas y veredas» de Max: la base = la subrasante medida + 0.20 m, con
 * las pendientes que de verdad quedaron). Sin rasante, de entrada se parte
 * de lo medido: desde el proyecto no habría cota que dar.
 */
export default function FichaReplantear() {
  const tieneRasante = useAlmacen((s) => s.proyecto.calles.find((c) => c.id === s.calleActivaId)?.rasante != null)
  const [desde, setDesde] = useState<DesdeDonde | null>(null)
  const elegido = desde ?? (tieneRasante ? 'proyecto' : 'capa')
  return (
    <div className="flex flex-col gap-4">
      <Segmentado etiqueta="Replantear desde" opciones={DESDE} valor={elegido} alCambiar={setDesde} anchoCompleto />
      {elegido === 'proyecto' ? <ReplantearDesdeProyecto /> : <FichaNiveles />}
    </div>
  )
}

type OrigenAltura = 'libreta' | 'bm'

const ORIGENES: { valor: OrigenAltura; texto: string }[] = [
  { valor: 'libreta', texto: 'De la libreta' },
  { valor: 'bm', texto: 'Desde un BM' },
]

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

const CAMPO_GRANDE =
  'numerico h-16 w-full min-w-0 rounded-[10px] border-2 border-tinta bg-tarjeta px-3 text-right text-[40px] font-semibold placeholder:font-normal placeholder:text-tenue md:text-[28px]'

/**
 * Replantear: la estaca en la que se trabaja, con lo que la mira tiene que
 * marcar en grande; se escribe lo que se leyó (con ±1 mm para ir afinando
 * mientras el ayudante mueve la estaca) y sale el veredicto: CORTA, RELLENA
 * o EN COTA. Debajo, la hoja de la progresiva entera.
 *
 * La estaca es la selección del almacén, como en los otros modos: tocar un
 * punto del corte, del mapa o de la fila de estacas la elige, y «Siguiente
 * estaca» mueve la selección (y con ella el corte).
 *
 * Las lecturas leídas son de este rato en el terreno y no se guardan en el
 * proyecto: el modelo guarda nivelaciones, y una estaca afinada a cota se
 * comprueba después midiéndola en Medir.
 */
function ReplantearDesdeProyecto() {
  const contexto = useContexto()
  const resultado = useResultadoCalle()
  const evaluacion = useEvaluacionCalle(resultado)
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
    return <p className="text-sm text-tenue">Elige una capa para replantearla.</p>
  }
  if (progresiva === null || !hoja) {
    return (
      <p className="text-sm text-tenue">
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
  const palabra = (puntoId: string, nombre: string) => {
    const punto = contexto.calle.seccion.puntos.find((p) => p.id === puntoId)
    return punto ? palabraDePunto(punto) : nombre
  }

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

  // De dónde sale la AI, en una línea corta debajo del número.
  const detalleAI = !Number.isFinite(alturaInstrumental) ? null : origen === 'libreta' ? (
    <>
      {correccionMm !== 0 && (
        <>
          {' '}
          compensada (
          <span className="numerico">
            {correccionMm > 0 ? '+' : '−'}
            {Math.abs(correccionMm).toFixed(1)} mm
          </span>{' '}
          sobre la CI de la libreta)
        </>
      )}{' '}
      · estación {indiceSeguro + 1} de la libreta
    </>
  ) : bm ? (
    <>
      {' '}
      · {bm.nombre} {bm.tipo === 'oficial' ? 'oficial' : 'auxiliar'}
    </>
  ) : null

  return (
    <div className="flex flex-col gap-3">
      {fila && (
        <section aria-label="Estaca actual" className="flex flex-col gap-3">
          {/* (a) */}
          <div className="-mt-2">
            <h3 className="text-[26px] leading-tight font-bold">
              <span className="numerico">{formatearProgresiva(fila.progresiva)}</span> · {fila.nombre}
            </h3>
            <p className="text-[13px] text-tenue">
              Estaca {indiceFila + 1} de {filas.length}
            </p>
          </div>

          {/* (b) Las estacas de la progresiva, con lo que ya se midió en cada una. */}
          <div role="group" aria-label="Estacas de la progresiva" className="grid grid-cols-[repeat(auto-fit,minmax(3rem,1fr))] gap-1">
            {filas.map((f, indice) => {
              const claveFila = claveCelda(f.progresiva, f.puntoId)
              const estado = evaluacion?.celdas.get(claveFila)?.estado
              const activa = indice === indiceFila
              return (
                <button
                  key={claveFila}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => seleccionar(claveFila)}
                  className={`min-h-11 rounded-lg border-2 px-1 text-[13px] font-semibold ${
                    estado ? CLASES_ESTADO[estado] : CLASES_ESTADO.sinMedir
                  } ${activa ? 'border-tinta' : 'border-transparent'}`}
                >
                  {palabra(f.puntoId, f.nombre)}
                </button>
              )
            })}
          </div>

          {/* (c) Lo que la mira tiene que marcar, lo más grande de la pantalla. */}
          <div className={`${TARJETA_OSCURA} flex flex-col gap-0.5`}>
            {fila.lecturaObjetivo === null ? (
              <p className="text-[15px] text-cabecera-texto">
                <span aria-hidden="true">△ </span>Sin lectura objetivo: {MOTIVO[fila.motivoSinObjetivo ?? 'alturaInvalida']}.
              </p>
            ) : (
              <>
                <p className="text-sm text-cabecera-tenue">La mira debe marcar</p>
                <p className="numerico text-[44px] leading-[1.05] font-semibold text-[#FDBA74]">
                  {formatearCota(fila.lecturaObjetivo)}
                </p>
                <p className="text-sm text-cabecera-texto">
                  para estar en <span className="numerico">{formatearCota(fila.cotaProyecto!)}</span>
                  {fila.aceptable && (
                    <span className="text-cabecera-tenue">
                      {' '}
                      · conforme entre <span className="numerico">{formatearCota(fila.aceptable.desde)}</span> y{' '}
                      <span className="numerico">{formatearCota(fila.aceptable.hasta)}</span>
                    </span>
                  )}
                </p>
              </>
            )}
          </div>
          {fila.rangoObjetivo === 'imposible' && (
            <AvisoLinea tono="falla">El objetivo no cabe en la mira de {instrumento.largoMira} m: cambia de estación.</AvisoLinea>
          )}
          {fila.rangoObjetivo === 'pocoPrecisa' && (
            <AvisoLinea tono="aviso">El objetivo cae cerca del suelo o de la punta de la mira: poco preciso.</AvisoLinea>
          )}
        </section>
      )}

      {/* (d) De dónde sale la AI: una línea, y los campos del BM solo si se parte de uno. */}
      <fieldset className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
        <legend className="sr-only">Altura del instrumento</legend>
        <Segmentado
          etiqueta="Origen de la altura"
          opciones={ORIGENES}
          valor={origen}
          alCambiar={setOrigen}
          className="col-start-2 row-start-1"
        />
        <p className="col-start-1 row-start-1 text-[13px] text-tenue">
          AI{' '}
          <b className="numerico text-[17px] font-semibold text-tinta">
            {Number.isFinite(alturaInstrumental) ? formatearCota(alturaInstrumental) : '—'}
          </b>
        </p>
        <p className="col-span-2 text-[13px] text-tenue">
          {Number.isFinite(alturaInstrumental) ? (
            detalleAI
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
        {origen === 'bm' && proyecto.bms.length === 0 && (
          <AvisoLinea tono="aviso" className="col-span-2">
            No hay BMs en este proyecto: créalos en Obra para partir de uno.
          </AvisoLinea>
        )}
        {origen === 'bm' && proyecto.bms.length > 0 && (
          <div className="col-span-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[13px] text-tenue">
              <span>BM de partida</span>
              <select
                value={bm?.id ?? ''}
                onChange={(evento) => setBmId(evento.target.value)}
                className="min-h-11 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-sm text-tinta"
              >
                {proyecto.bms.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre} · {formatearCota(b.cota)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-tenue">
              <span>Vista atrás al BM</span>
              <input
                inputMode="decimal"
                autoComplete="off"
                value={textoVistaAtras}
                onChange={(evento) => setTextoVistaAtras(evento.target.value)}
                className="numerico min-h-11 w-28 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-right text-base text-tinta"
              />
            </label>
          </div>
        )}
      </fieldset>

      {!hoja.comprobado && (
        <AvisoLinea tono="aviso" className="font-semibold">
          {origen === 'bm' && bm && bm.tipo !== 'oficial'
            ? `${bm.nombre} es un BM auxiliar: su cota vale lo que la nivelación que lo dejó. Cotas no comprobadas.`
            : AVISO_HOJA_SIN_COMPROBAR}
        </AvisoLinea>
      )}

      {fila && fila.lecturaObjetivo !== null && (
        <>
          {/* (e) Lo que marcó la mira, afinado de a 1 mm. */}
          <div className="flex flex-col gap-1">
            <span aria-hidden="true" className="text-sm text-tenue">
              Lectura leída
            </span>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2">
              {/* El nombre accesible es el texto visible («−1 mm»): el control por voz dice lo que ve. */}
              <button type="button" onClick={() => ajustar(-1)} className={`${BOTON_ICONO} numerico h-16 w-auto min-w-14 px-2 text-[15px]`}>
                −1 mm
              </button>
              <input
                aria-label="Lectura leída"
                inputMode="decimal"
                autoComplete="off"
                value={textoLeida}
                onChange={(evento) => escribirLeida(evento.target.value)}
                placeholder={formatearCota(fila.lecturaObjetivo)}
                className={CAMPO_GRANDE}
              />
              <button type="button" onClick={() => ajustar(1)} className={`${BOTON_ICONO} numerico h-16 w-auto min-w-14 px-2 text-[15px]`}>
                +1 mm
              </button>
            </div>
          </div>

          {/* (f) La región viva queda montada aunque esté vacía: una que aparece ya llena muchas veces no se anuncia. */}
          <div
            role="status"
            aria-label="Veredicto"
            className={veredicto ? `flex flex-col gap-1 rounded-xl px-4 py-3 ${VISUAL_ESTADO[veredicto.estado].clases}` : undefined}
          >
            {veredicto && (
              <>
                <p className="text-3xl font-bold">
                  <span aria-hidden="true">{VISUAL_ESTADO[veredicto.estado].simbolo} </span>
                  {veredicto.tipo ? VEREDICTO[veredicto.tipo] : 'VUELVE A LEER'}
                  {veredicto.tipo && veredicto.tipo !== 'enCota' && <> {veredicto.mm} mm</>}
                </p>
                <p className="text-[15px] font-semibold">{VISUAL_ESTADO[veredicto.estado].texto}</p>
                {veredicto.sospechosa && <p className="text-[15px] font-bold">¿Leíste bien?</p>}
                {veredicto.avisos.map((aviso) => (
                  <p key={aviso} className="text-sm font-semibold">
                    {aviso}
                  </p>
                ))}
              </>
            )}
          </div>
          <p className="text-[13px] text-tenue">
            Marca más que el objetivo → falta, <b>rellena</b>. Marca menos → sobra, <b>corta</b>.
          </p>
        </>
      )}

      {/* (g) */}
      {fila && (
        <button type="button" onClick={siguienteEstaca} disabled={esUltimaEstaca} className={`${BOTON_PRINCIPAL} w-full`}>
          {esUltimaEstaca ? (
            'Última estaca'
          ) : (
            <>
              Siguiente estaca <span aria-hidden="true">›</span>
            </>
          )}
        </button>
      )}

      {/* (h) La hoja de la progresiva entera, para llevarla al campo. */}
      <section aria-label="Hoja de replanteo" className="flex flex-col gap-1 border-t border-borde pt-3">
        <h3 className="text-[15px] font-semibold">
          Hoja de <span className="numerico">{formatearProgresiva(progresiva)}</span>
        </h3>
        <ul className="flex flex-col gap-1">
          {filas.map((f, indice) => {
            const claveFila = claveCelda(f.progresiva, f.puntoId)
            const objetivo = f.lecturaObjetivo === null ? 'sin objetivo' : `objetivo ${formatearCota(f.lecturaObjetivo)}`
            const activa = indice === indiceFila
            return (
              <li key={claveFila}>
                <button
                  type="button"
                  aria-current={activa ? 'true' : undefined}
                  aria-label={`Estaca ${f.nombre}, ${objetivo}`}
                  onClick={() => seleccionar(claveFila)}
                  className={`flex min-h-11 w-full items-center justify-between rounded-lg border-2 px-3 text-left text-sm ${
                    activa ? 'border-tinta bg-fondo' : 'border-transparent hover:bg-fondo'
                  }`}
                >
                  <span>{f.nombre}</span>
                  <span className="numerico font-semibold">
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
            <AvisoLinea key={aviso} tono="aviso">
              {aviso}
            </AvisoLinea>
          ))}
      </section>
    </div>
  )
}
