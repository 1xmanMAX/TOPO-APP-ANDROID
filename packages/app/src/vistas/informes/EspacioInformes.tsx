import { formatearProgresiva, parsearProgresiva, type Id } from '@topo/core'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { copiarAlPortapapeles, descargarCsv, descargarXlsx } from '../../archivo/exportar'
import { descargarTopo } from '../../archivo/topo'
import { useAlmacen } from '../../estado/almacen'
import type { BibliotecaPdf, Dibujante } from '../../planos/pdf'
import {
  FICHAS,
  fichaDe,
  generarPdf,
  nombreDeToma,
  notasDeCalle,
  prepararInforme,
  replanteoPorDefecto,
  tomaPorDefecto,
  tomasDeAbajo,
  tomasDeCalle,
  type Alcance,
  type EstadoVeredicto,
  type OpcionesInforme,
  type Preparacion,
} from './adaptadores'
import { useInformes } from './almacenInformes'
import { reducirLogo, TIPOS_LOGO } from './logo'
import { compartirArchivo, descargarBytes, pintarPrimeraPagina, type Compartidor } from './salida'
import {
  queLlevaElExcel,
  tablaDeInforme,
  tablasDeLaJornada,
  type TablaExcel,
  type TablasDeLaJornada,
} from './tablasExcel'

const BOTON =
  'min-h-11 rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800'
const BOTON_MARCA =
  'min-h-11 rounded bg-marca px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'
const CAMPO =
  'min-h-11 w-full rounded border border-slate-300 bg-white px-2 text-sm outline-none focus:border-marca focus:ring-1 focus:ring-marca aria-invalid:border-aviso dark:border-slate-700 dark:bg-slate-900'
const ETIQUETA = 'text-xs font-medium text-slate-600 dark:text-slate-300'

/** Ancho al que se pinta la página: nítida en la laptop sin pesar en el celular. */
const ANCHO_VISTA_PREVIA = 900

/** Lo que se espera tras la última tecla antes de rehacer el PDF: escribir no se traba. */
const ESPERA_AL_ESCRIBIR_MS = 400

const NO_SE_ENTIENDE_PROGRESIVA = 'No se entiende la progresiva (usa 0+020 o 20).'

interface Props {
  /** Pruebas: pdfjs «legacy» en vez del de navegador. */
  biblioteca?: BibliotecaPdf
  /** Pruebas: un lienzo falso en vez de un <canvas>. */
  dibujante?: Dibujante
  /** Pruebas: el `navigator` con que se comparte. */
  compartidor?: Compartidor
  /** Milisegundos tras la última tecla antes de rehacer el PDF. */
  esperaMs?: number
}

interface PaginaLista {
  url: string
  ancho: number
  alto: number
  titulo: string
}

type EstadoVistaPrevia =
  | { tipo: 'vacia' }
  /** Mientras se dibuja la nueva, se deja la anterior (atenuada): la vista previa no parpadea. */
  | { tipo: 'pintando'; anterior: PaginaLista | null }
  | ({ tipo: 'lista' } & PaginaLista)
  | { tipo: 'error'; mensaje: string }

/** El color nunca va solo: cada estado lleva su símbolo. */
const SIMBOLO: Record<EstadoVeredicto, { simbolo: string; color: string }> = {
  comprobado: { simbolo: '✓', color: 'text-pasa' },
  falla: { simbolo: '✗', color: 'text-falla' },
  sinCerrar: { simbolo: '△', color: 'text-aviso' },
}

/** Un número como «1.425» o «1,425»; null si está vacío o no se entiende. */
function leerNumero(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (limpio === '') return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/** Escrito pero no se entiende: hay que decirlo, no tomarlo como «sin límite». */
function progresivaIlegible(texto: string): boolean {
  return texto.trim() !== '' && parsearProgresiva(texto) === null
}

/** El valor de hace `ms`: se pone al día cuando se deja de escribir. */
function useDiferido<T>(valor: T, ms: number): T {
  const [diferido, setDiferido] = useState(valor)
  useEffect(() => {
    if (ms <= 0) return
    const espera = window.setTimeout(() => setDiferido(valor), ms)
    return () => window.clearTimeout(espera)
  }, [valor, ms])
  return ms <= 0 ? valor : diferido
}

/**
 * Informes en un toque: se elige el informe, se dice de qué calle, jornada y
 * tramo, y a la derecha está la primera página del PDF tal como se va a
 * descargar. Debajo siguen las tablas para Excel de siempre y el .topo.
 */
export default function EspacioInformes({
  biblioteca,
  dibujante,
  compartidor,
  esperaMs = ESPERA_AL_ESCRIBIR_MS,
}: Props = {}) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const archivosDePlano = useAlmacen((s) => s.archivosDePlano)
  const calleActivaId = useAlmacen((s) => s.calleActivaId)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const preferencias = useInformes()
  const { tipo, conNotas, firmas, logo, cambiar } = preferencias
  const idBase = useId()
  const ids = {
    alcance: `${idBase}-alcance`,
    opciones: `${idBase}-opciones`,
    previa: `${idBase}-previa`,
    excel: `${idBase}-excel`,
    queLleva: `${idBase}-que-lleva`,
  }

  // La calle y la jornada siguen a la calle activa; lo elegido aquí vale mientras se está aquí.
  const [calleElegida, setCalleElegida] = useState<Id | null>(null)
  const [tomaElegida, setTomaElegida] = useState<Id | null>(null)
  const [tomaAbajoId, setTomaAbajoId] = useState<Id | null>(null)
  const [capaReplanteoId, setCapaReplanteoId] = useState<Id | null>(null)
  const [bmId, setBmId] = useState<Id | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Lo que se escribe tecla a tecla se toma cuando se deja de escribir.
  const desde = useDiferido(preferencias.desde, esperaMs)
  const hasta = useDiferido(preferencias.hasta, esperaMs)
  const vistaAtras = useDiferido(preferencias.vistaAtras, esperaMs)
  const estacion = useDiferido(preferencias.estacion, esperaMs)
  const supervisor = useDiferido(preferencias.supervisor, esperaMs)

  // Lo elegido aquí manda; si ya no existe (se borró la calle), se vuelve a la activa.
  const calleId =
    proyecto.calles.find((c) => c.id === calleElegida)?.id ??
    proyecto.calles.find((c) => c.id === calleActivaId)?.id ??
    proyecto.calles[0]?.id ??
    null
  const calle = proyecto.calles.find((c) => c.id === calleId) ?? null
  const tomas = useMemo(() => tomasDeCalle(proyecto, calleId), [proyecto, calleId])
  const tomaId = tomas.some((t) => t.toma.id === tomaElegida)
    ? tomaElegida
    : tomaPorDefecto(proyecto, calleId, campaniaActivaId)
  const tomaActual = tomas.find((t) => t.toma.id === tomaId)
  const abajo = useMemo(() => tomasDeAbajo(proyecto, calleId, tomaId), [proyecto, calleId, tomaId])
  const replanteo = useMemo(() => replanteoPorDefecto(proyecto, calleId), [proyecto, calleId])

  const usaJornada = tipo !== 'estacas'
  // La libreta va entera: ni sus filas ni sus notas se recortan por un tramo que no se ve.
  const usaTramo = tipo !== 'libreta'

  const ilegibles = {
    desde: usaTramo && progresivaIlegible(desde),
    hasta: usaTramo && progresivaIlegible(hasta),
    estacion: tipo === 'estacas' && progresivaIlegible(estacion),
    vistaAtras: tipo === 'estacas' && vistaAtras.trim() !== '' && leerNumero(vistaAtras) === null,
  }

  const alcance: Alcance = {
    calleId,
    tomaId,
    tomaAbajoId,
    capaReplanteoId: capaReplanteoId ?? replanteo.capaId,
    bmId: bmId ?? replanteo.bmId,
    vistaAtrasBm: leerNumero(vistaAtras),
    progresivaEstacion: parsearProgresiva(estacion),
    desde: usaTramo ? parsearProgresiva(desde) : null,
    hasta: usaTramo ? parsearProgresiva(hasta) : null,
  }
  const notasEnTramo = calle ? notasDeCalle(calle, alcance).length : 0
  const opciones: OpcionesInforme = {
    notas: conNotas && notasEnTramo > 0,
    firmas,
    supervisor,
    logo: logo?.dataUrl,
  }
  // El informe se rehace cuando cambian los valores, no cada vez que se
  // vuelven a armar los objetos de arriba. El logo entra por su id: comparar
  // la imagen entera en cada dibujado sería serializar megas por tecla.
  const clave = JSON.stringify([tipo, alcance, { ...opciones, logo: logo?.id ?? null }, ilegibles])

  const preparacion = useMemo((): Preparacion => {
    // Un tramo que no se entiende NO es «sin límite»: se saldría la calle entera sin avisar.
    if (ilegibles.desde || ilegibles.hasta || ilegibles.estacion) {
      return { listo: false, motivo: `${NO_SE_ENTIENDE_PROGRESIVA} Corrígela para armar el informe.` }
    }
    if (ilegibles.vistaAtras) {
      return { listo: false, motivo: 'No se entiende la vista atrás: escribe la lectura en metros, como 1.425.' }
    }
    return prepararInforme(tipo, proyecto, alcance, opciones)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto, clave])

  const pdf = useMemo((): { bytes: Uint8Array } | { error: string } | null => {
    if (!preparacion.listo) return null
    try {
      return { bytes: generarPdf(preparacion.informe) }
    } catch (e) {
      return { error: (e as Error).message }
    }
  }, [preparacion])
  const bytes = pdf && 'bytes' in pdf ? pdf.bytes : null
  const ficha = fichaDe(tipo)

  const [vistaPrevia, setVistaPrevia] = useState<EstadoVistaPrevia>({ tipo: 'vacia' })
  /** La imagen que se ve: se libera cuando la reemplaza otra o al salir, no antes. */
  const urlVisible = useRef<string | null>(null)
  useEffect(() => () => liberar(urlVisible.current), [])
  useEffect(() => {
    if (!bytes) {
      setVistaPrevia({ tipo: 'vacia' })
      return
    }
    let vigente = true
    const titulo = ficha.titulo
    setVistaPrevia((antes) => ({
      tipo: 'pintando',
      anterior: antes.tipo === 'lista' ? antes : antes.tipo === 'pintando' ? antes.anterior : null,
    }))
    pintarPrimeraPagina(bytes, { anchoObjetivoPx: ANCHO_VISTA_PREVIA, biblioteca, dibujante })
      .then((pagina) => {
        if (!vigente) {
          liberar(pagina.url)
          return
        }
        const vieja = urlVisible.current
        urlVisible.current = pagina.url
        setVistaPrevia({ tipo: 'lista', url: pagina.url, ancho: pagina.anchoPx, alto: pagina.altoPx, titulo })
        if (vieja !== pagina.url) liberar(vieja)
      })
      .catch((e: unknown) => {
        if (vigente) setVistaPrevia({ tipo: 'error', mensaje: (e as Error).message })
      })
    return () => {
      vigente = false
    }
    // El título va con los bytes: cambiar de informe siempre cambia el PDF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes, biblioteca, dibujante])

  // Las de siempre, de la jornada entera; y la que acompaña al PDF, del mismo tramo que él.
  const tablas = useMemo(
    () => tablasDeLaJornada(proyecto, calleId, tomaId, tomaAbajoId),
    [proyecto, calleId, tomaId, tomaAbajoId],
  )
  const tramoDesde = alcance.desde
  const tramoHasta = alcance.hasta
  const tablasDelTramo = useMemo(
    () => tablasDeLaJornada(proyecto, calleId, tomaId, tomaAbajoId, { desde: tramoDesde, hasta: tramoHasta }),
    [proyecto, calleId, tomaId, tomaAbajoId, tramoDesde, tramoHasta],
  )
  const tablaDelInforme = tablaDeInforme(tipo, tablasDelTramo)
  const queLleva = queLlevaElExcel(tipo)
  const nombrePdf = preparacion.listo ? `${preparacion.nombreArchivo}.pdf` : 'informe.pdf'
  const veredicto = preparacion.listo ? preparacion.veredicto : null

  async function compartir() {
    if (!bytes) return
    const r = await compartirArchivo(bytes, nombrePdf, undefined, compartidor)
    setAviso(r === 'descargado' ? 'Este navegador no comparte archivos: se descargó el PDF.' : null)
  }

  async function leerLogo(archivo: File | undefined) {
    if (!archivo) return
    if (!TIPOS_LOGO.test(archivo.type)) {
      setAviso('El logo tiene que ser una imagen PNG o JPG.')
      return
    }
    try {
      const dataUrl = await reducirLogo(archivo)
      cambiar({ logo: { id: `${archivo.name}-${archivo.size}-${Date.now()}`, dataUrl } })
      setAviso(null)
    } catch {
      setAviso('No se pudo leer el logo.')
    }
  }

  const pintada = vistaPrevia.tipo === 'lista' ? vistaPrevia : vistaPrevia.tipo === 'pintando' ? vistaPrevia.anterior : null

  return (
    // Abajo se deja lugar para la barra fija del celular.
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 pb-44 sm:p-6 sm:pb-44 lg:pb-6">
      <h2 className="text-lg font-semibold">Informes</h2>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* 1. Qué informe. En el celular, dos por fila y sin descripción. */}
          <div role="group" aria-label="Tipo de informe" className="grid grid-cols-2 gap-2">
            {FICHAS.map((f) => {
              const activa = f.tipo === tipo
              const idDescripcion = `${idBase}-${f.tipo}`
              return (
                <button
                  key={f.tipo}
                  type="button"
                  aria-pressed={activa}
                  aria-label={f.titulo}
                  aria-describedby={idDescripcion}
                  onClick={() => cambiar({ tipo: f.tipo })}
                  className={`flex min-h-11 flex-col items-start gap-1 rounded-lg border p-3 text-left ${
                    activa
                      ? 'border-marca bg-marca/10 ring-1 ring-marca'
                      : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="text-sm font-semibold">
                    {activa && <span aria-hidden="true">● </span>}
                    {f.titulo}
                  </span>
                  <span id={idDescripcion} className="hidden text-xs text-slate-600 sm:block dark:text-slate-300">
                    {f.descripcion}
                  </span>
                </button>
              )
            })}
          </div>

          {/* 2. De qué parte de la obra */}
          <section aria-labelledby={ids.alcance} className="flex flex-col gap-3">
            <h3 id={ids.alcance} className="font-semibold">
              Alcance
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Calle">
                {(campo) => (
                  <select
                    {...campo}
                    className={CAMPO}
                    value={calleId ?? ''}
                    disabled={proyecto.calles.length === 0}
                    onChange={(e) => {
                      setCalleElegida(e.target.value || null)
                      setTomaElegida(null)
                      setTomaAbajoId(null)
                      setCapaReplanteoId(null)
                      setBmId(null)
                    }}
                  >
                    {proyecto.calles.length === 0 && <option value="">Sin calles</option>}
                    {proyecto.calles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>

              {usaJornada && (
                <Campo etiqueta={tipo === 'espesores' ? 'Capa de arriba' : 'Jornada'}>
                  {(campo) => (
                    <select
                      {...campo}
                      className={CAMPO}
                      value={tomaId ?? ''}
                      disabled={tomas.length === 0}
                      onChange={(e) => {
                        setTomaElegida(e.target.value || null)
                        setTomaAbajoId(null)
                      }}
                    >
                      {tomas.length === 0 && <option value="">Sin jornadas medidas</option>}
                      {tomas.map((t) => (
                        <option key={t.toma.id} value={t.toma.id}>
                          {nombreDeToma(t)}
                        </option>
                      ))}
                    </select>
                  )}
                </Campo>
              )}

              {tipo === 'espesores' && (
                <Campo etiqueta="Capa de abajo">
                  {(campo) => (
                    <select
                      {...campo}
                      className={CAMPO}
                      value={abajo.find((t) => t.toma.id === tomaAbajoId)?.toma.id ?? abajo[0]?.toma.id ?? ''}
                      disabled={abajo.length === 0}
                      onChange={(e) => setTomaAbajoId(e.target.value || null)}
                    >
                      {abajo.length === 0 && <option value="">Ninguna capa medida debajo</option>}
                      {abajo.map((t) => (
                        <option key={t.toma.id} value={t.toma.id}>
                          {nombreDeToma(t)}
                        </option>
                      ))}
                    </select>
                  )}
                </Campo>
              )}

              {tipo === 'estacas' && (
                <>
                  <Campo etiqueta="Capa a replantear">
                    {(campo) => (
                      <select
                        {...campo}
                        className={CAMPO}
                        value={alcance.capaReplanteoId ?? ''}
                        onChange={(e) => setCapaReplanteoId(e.target.value || null)}
                      >
                        {proyecto.capas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                    )}
                  </Campo>
                  <Campo etiqueta="Banco de nivel">
                    {(campo) => (
                      <select
                        {...campo}
                        className={CAMPO}
                        value={alcance.bmId ?? ''}
                        disabled={proyecto.bms.length === 0}
                        onChange={(e) => setBmId(e.target.value || null)}
                      >
                        {proyecto.bms.length === 0 && <option value="">Sin bancos de nivel</option>}
                        {proyecto.bms.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.nombre} ({b.tipo})
                          </option>
                        ))}
                      </select>
                    )}
                  </Campo>
                  <Campo
                    etiqueta="Vista atrás al BM (m)"
                    ayuda="Vacía: la lectura objetivo se calcula en campo."
                    error={ilegibles.vistaAtras ? 'No se entiende la lectura (usa metros, como 1.425).' : undefined}
                  >
                    {(campo) => (
                      <input
                        {...campo}
                        className={CAMPO}
                        inputMode="decimal"
                        value={preferencias.vistaAtras}
                        placeholder="1.425"
                        onChange={(e) => cambiar({ vistaAtras: e.target.value })}
                      />
                    )}
                  </Campo>
                  <Campo
                    etiqueta="Progresiva de la estación"
                    ayuda="Para avisar de las visuales muy largas."
                    error={ilegibles.estacion ? NO_SE_ENTIENDE_PROGRESIVA : undefined}
                  >
                    {(campo) => (
                      <input
                        {...campo}
                        className={CAMPO}
                        // Texto y no decimal: el teclado numérico del celular no tiene «+».
                        inputMode="text"
                        autoComplete="off"
                        value={preferencias.estacion}
                        placeholder="0+040 o 40"
                        onChange={(e) => cambiar({ estacion: e.target.value })}
                      />
                    )}
                  </Campo>
                </>
              )}

              {usaTramo && (
                <>
                  <Campo etiqueta="Desde" error={ilegibles.desde ? NO_SE_ENTIENDE_PROGRESIVA : undefined}>
                    {(campo) => (
                      <input
                        {...campo}
                        className={CAMPO}
                        inputMode="text"
                        autoComplete="off"
                        value={preferencias.desde}
                        placeholder="0+000 o 0"
                        onChange={(e) => cambiar({ desde: e.target.value })}
                      />
                    )}
                  </Campo>
                  <Campo etiqueta="Hasta" error={ilegibles.hasta ? NO_SE_ENTIENDE_PROGRESIVA : undefined}>
                    {(campo) => (
                      <input
                        {...campo}
                        className={CAMPO}
                        inputMode="text"
                        autoComplete="off"
                        value={preferencias.hasta}
                        placeholder="fin"
                        onChange={(e) => cambiar({ hasta: e.target.value })}
                      />
                    )}
                  </Campo>
                </>
              )}
            </div>
            {tipo === 'estacas' && capaReplanteoId === null && bmId === null && (
              <p className="text-xs text-slate-600 dark:text-slate-300">{replanteo.razon}</p>
            )}
            {!usaTramo && (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                La libreta va entera: recortarla haría que sus sumas no cuadren.
              </p>
            )}
            {usaTramo &&
              typeof alcance.desde === 'number' &&
              typeof alcance.hasta === 'number' &&
              alcance.desde > alcance.hasta && (
                <p className="text-sm text-aviso">
                  <span aria-hidden="true">△ </span>
                  «Desde» ({formatearProgresiva(alcance.desde)}) va después de «Hasta»: no queda ningún punto.
                </p>
              )}
          </section>

          {/* 3. Qué más lleva */}
          <section aria-labelledby={ids.opciones} className="flex flex-col gap-3">
            <h3 id={ids.opciones} className="font-semibold">
              Opciones
            </h3>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={opciones.notas}
                disabled={notasEnTramo === 0}
                onChange={(e) => cambiar({ conNotas: e.target.checked })}
              />
              <span>
                Notas de campo de la calle
                <span className="text-slate-500 dark:text-slate-400">
                  {notasEnTramo === 0
                    ? usaTramo
                      ? ' (no hay notas en el tramo)'
                      : ' (la calle no tiene notas)'
                    : ` (${notasEnTramo})`}
                </span>
              </span>
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={firmas}
                onChange={(e) => cambiar({ firmas: e.target.checked })}
              />
              Cuadros de firma
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Supervisor">
                {(campo) => (
                  <input
                    {...campo}
                    className={CAMPO}
                    value={preferencias.supervisor}
                    placeholder="Ing. …"
                    onChange={(e) => cambiar({ supervisor: e.target.value })}
                  />
                )}
              </Campo>
              <div className="flex flex-col gap-1">
                <span className={ETIQUETA}>Topógrafo</span>
                <span className="flex min-h-11 items-center text-sm">
                  {proyecto.meta.responsable.trim() || '— (se pone en los datos del proyecto, en Obra)'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* El nombre accesible es el texto que se ve: el control por voz lo encuentra. */}
              <label
                className={`${BOTON} inline-flex cursor-pointer items-center focus-within:ring-2 focus-within:ring-marca`}
              >
                {logo ? 'Cambiar logo' : 'Poner logo'}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  onChange={(e) => {
                    void leerLogo(e.currentTarget.files?.[0])
                    // Vaciado: elegir otra vez el mismo archivo (tras quitarlo) vuelve a funcionar.
                    e.currentTarget.value = ''
                  }}
                />
              </label>
              {logo && (
                <>
                  <img src={logo.dataUrl} alt="Logo elegido" className="h-11 w-11 rounded border object-contain" />
                  <button type="button" className={BOTON} onClick={() => cambiar({ logo: null })}>
                    Quitar logo
                  </button>
                </>
              )}
            </div>
          </section>
        </div>

        {/* 4. La primera página, de verdad */}
        <section aria-labelledby={ids.previa} className="flex min-w-0 flex-col gap-3 self-start lg:sticky lg:top-4">
          <h3 id={ids.previa} className="font-semibold">
            Vista previa
          </h3>
          {preparacion.listo && preparacion.avisos.length > 0 && (
            <ul aria-label="Avisos del informe" className="flex flex-col gap-1 text-sm text-aviso">
              {preparacion.avisos.map((a, i) => (
                <li key={`${i}-${a}`}>
                  <span aria-hidden="true">△ </span>
                  {a}
                </li>
              ))}
            </ul>
          )}

          <div className="relative flex min-h-64 items-center justify-center overflow-hidden rounded border border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
            {!preparacion.listo && (
              <p className="p-4 text-sm text-slate-700 dark:text-slate-200">
                <span aria-hidden="true">△ </span>
                {preparacion.motivo}
              </p>
            )}
            {pdf && 'error' in pdf && (
              <p className="p-4 text-sm text-falla">
                <span aria-hidden="true">✗ </span>
                No se pudo armar el PDF: {pdf.error}
              </p>
            )}
            {vistaPrevia.tipo === 'error' && (
              <p className="p-4 text-sm text-falla">
                <span aria-hidden="true">✗ </span>
                No se pudo dibujar la vista previa ({vistaPrevia.mensaje}). El PDF se puede descargar igual.
              </p>
            )}
            {bytes && pintada && (
              <img
                src={pintada.url}
                width={pintada.ancho}
                height={pintada.alto}
                // La anterior, mientras se dibuja la nueva, no se anuncia: no es la que se va a descargar.
                alt={vistaPrevia.tipo === 'lista' ? `Primera página: ${pintada.titulo}` : ''}
                aria-hidden={vistaPrevia.tipo === 'lista' ? undefined : true}
                className={`h-auto w-full bg-white ${vistaPrevia.tipo === 'lista' ? '' : 'opacity-50'}`}
              />
            )}
            {vistaPrevia.tipo === 'pintando' && (
              <p
                className={`p-4 text-sm text-slate-600 dark:text-slate-300 ${
                  pintada ? 'absolute top-2 rounded bg-white/90 px-3 py-1 dark:bg-slate-900/90' : ''
                }`}
              >
                Dibujando la página…
              </p>
            )}
          </div>

          {queLleva && (
            <p id={ids.queLleva} className="text-xs text-slate-600 dark:text-slate-300">
              {queLleva}
            </p>
          )}

          {/*
            En el celular, el veredicto y los botones quedan fijos abajo: se
            elige el informe arriba y se manda sin bajar dos pantallas. En la
            laptop vuelven a su sitio, debajo de la vista previa.
          */}
          <div className="fixed inset-x-0 bottom-0 z-10 flex flex-col gap-2 border-t border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-950 lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:dark:bg-transparent">
            <p
              aria-live="polite"
              className={`line-clamp-3 text-sm font-medium lg:line-clamp-none ${
                veredicto ? SIMBOLO[veredicto.estado].color : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {veredicto ? (
                <>
                  {SIMBOLO[veredicto.estado].simbolo} {veredicto.texto}
                  {veredicto.estado !== 'comprobado' && ' El PDF lleva en cada página la franja de aviso.'}
                </>
              ) : vistaPrevia.tipo === 'pintando' ? null : (
                <>
                  <span aria-hidden="true">△ </span>
                  Este informe todavía no se puede armar: falta algo en el alcance.
                </>
              )}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                className={BOTON_MARCA}
                disabled={!bytes}
                onClick={() => bytes && descargarBytes(bytes, nombrePdf)}
              >
                Descargar PDF
              </button>
              <button
                type="button"
                className={BOTON}
                disabled={!tablaDelInforme}
                aria-describedby={queLleva ? ids.queLleva : undefined}
                title={tablaDelInforme ? undefined : 'Este informe no tiene tabla para Excel'}
                onClick={() => tablaDelInforme && descargarTabla(tablaDelInforme)}
              >
                Descargar Excel
              </button>
              <button type="button" className={BOTON} disabled={!bytes} onClick={() => void compartir()}>
                Compartir
              </button>
            </div>
            {aviso && (
              <p role="status" className="text-sm text-slate-600 dark:text-slate-300">
                {aviso}
              </p>
            )}
          </div>
        </section>
      </div>

      <TablasParaExcel
        idTitulo={ids.excel}
        tablas={tablas}
        descripcion={tomaActual && calle ? `${calle.nombre} · ${nombreDeToma(tomaActual)} · jornada entera` : null}
      />

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Proyecto completo</h3>
        <button type="button" className={`${BOTON} self-start`} onClick={() => descargarTopo(proyecto, archivosDePlano)}>
          Guardar el proyecto (.topo)
        </button>
      </section>
    </div>
  )
}

function liberar(url: string | null) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}

function descargarTabla(tabla: TablaExcel) {
  descargarXlsx(tabla.filas, tabla.nombre, tabla.hoja)
}

interface PropsDeCampo {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

/**
 * Etiqueta, control, ayuda y error. La ayuda y el error van fuera de la
 * etiqueta y se enlazan con aria-describedby: el nombre del campo es solo
 * su etiqueta (lo que se ve), y la ayuda se lee como descripción.
 */
function Campo({
  etiqueta,
  ayuda,
  error,
  children,
}: {
  etiqueta: string
  ayuda?: string
  error?: string
  children: (props: PropsDeCampo) => ReactNode
}) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  const describe = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ')
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={ETIQUETA}>
        {etiqueta}
      </label>
      {children({
        id,
        ...(describe ? { 'aria-describedby': describe } : {}),
        ...(error ? { 'aria-invalid': true as const } : {}),
      })}
      {ayuda && (
        <span id={idAyuda} className="text-xs text-slate-500 dark:text-slate-400">
          {ayuda}
        </span>
      )}
      {error && (
        <span id={idError} className="text-xs text-aviso">
          <span aria-hidden="true">△ </span>
          {error}
        </span>
      )}
    </div>
  )
}

/**
 * Las exportaciones de siempre (antes solo en Revisar): cotas, diferencias
 * contra el proyecto y espesores, a Excel o CSV, o copiadas para pegar. La
 * cabecera de cada archivo dice si la nivelación cerró.
 */
function TablasParaExcel({
  idTitulo,
  tablas,
  descripcion,
}: {
  idTitulo: string
  tablas: TablasDeLaJornada
  descripcion: string | null
}) {
  const [copiada, setCopiada] = useState<string | null>(null)
  const espera = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (espera.current !== null) window.clearTimeout(espera.current)
    },
    [],
  )
  const grupos: { nombre: string; tabla: TablaExcel | null; falta: string }[] = [
    { nombre: 'cotas', tabla: tablas.cotas, falta: 'no hay jornada medida' },
    { nombre: 'diferencias', tabla: tablas.diferencias, falta: 'la calle no tiene rasante' },
    { nombre: 'espesores', tabla: tablas.espesores, falta: 'no hay una capa medida debajo' },
  ]
  function copiar(nombre: string, tabla: TablaExcel) {
    void copiarAlPortapapeles(tabla.filas).then(() => {
      setCopiada(nombre)
      if (espera.current !== null) window.clearTimeout(espera.current)
      espera.current = window.setTimeout(() => setCopiada(null), 2000)
    })
  }
  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-3">
      <h3 id={idTitulo} className="font-semibold">
        Tablas para Excel
      </h3>
      {descripcion && <p className="text-sm text-slate-600 dark:text-slate-300">{descripcion}</p>}
      <div className="flex flex-col gap-3">
        {grupos.map(({ nombre, tabla, falta }) => (
          <div key={nombre} className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <button type="button" className={BOTON} disabled={!tabla} onClick={() => tabla && descargarTabla(tabla)}>
              Exportar {nombre} a Excel
            </button>
            <button
              type="button"
              className={BOTON}
              disabled={!tabla}
              onClick={() => tabla && descargarCsv(tabla.filas, tabla.nombre)}
            >
              Exportar {nombre} a CSV
            </button>
            <button
              type="button"
              className={BOTON}
              disabled={!tabla}
              onClick={() => tabla && copiar(nombre, tabla)}
            >
              {copiada === nombre ? 'Copiado ✓' : `Copiar ${nombre}`}
            </button>
            {!tabla && <span className="text-xs text-slate-500 dark:text-slate-400">({falta})</span>}
          </div>
        ))}
      </div>
    </section>
  )
}
