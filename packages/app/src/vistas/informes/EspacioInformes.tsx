import { formatearProgresiva, parsearProgresiva, type Id } from '@topo/core'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { copiarAlPortapapeles, descargarCsv, descargarXlsx } from '../../archivo/exportar'
import AvisoLinea from '../../componentes/AvisoLinea'
import MenuMas from '../../componentes/MenuMas'
import Plegable from '../../componentes/Plegable'
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, TARJETA } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import type { BibliotecaPdf, Dibujante } from '../../planos/pdf'
import {
  FICHAS,
  fichaDe,
  fechaImpresa,
  estaComprobado,
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

const CAMPO =
  'min-h-12 w-full rounded-[10px] border border-borde-fuerte bg-tarjeta px-3 text-base text-tinta outline-none focus:border-tinta focus:ring-2 focus:ring-marca/30 aria-invalid:border-aviso disabled:opacity-60'
const ETIQUETA = 'text-[13px] font-medium text-tenue'
const TITULO_TARJETA = 'text-[15px] font-semibold'
const AYUDA = 'text-[13px] text-tenue'

/** Un chip que se enciende y se apaga (casilla por dentro: se marca con el teclado y con la voz). */
function claseChip(encendido: boolean): string {
  return `relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold focus-within:ring-2 focus-within:ring-marca has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 ${
    encendido ? 'bg-cabecera text-white ring-1 ring-cabecera-borde ring-inset' : 'border border-borde-fuerte bg-tarjeta text-tinta'
  }`
}

/** Los chips de solo lectura de lo que ya está elegido («Av. Sol · BASE · 28/09/2026»). */
const CHIP_ALCANCE = 'inline-flex h-9 items-center rounded-full border border-borde bg-tarjeta px-3 text-sm text-tinta'

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
  /** El nombre del PDF dibujado (informe, calle, capa, fecha): quien mira sabe de qué calle es. */
  archivo: string
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
  const calleActivaId = useAlmacen((s) => s.calleActivaId)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const preferencias = useInformes()
  const { tipo, conNotas, firmas, logo, cambiar } = preferencias
  const idBase = useId()
  const ids = {
    alcance: `${idBase}-alcance`,
    opciones: `${idBase}-opciones`,
    previa: `${idBase}-previa`,
    queLleva: `${idBase}-que-lleva`,
  }

  // La calle y la jornada siguen a la calle activa; lo elegido aquí vale mientras se está aquí.
  const [calleElegida, setCalleElegida] = useState<Id | null>(null)
  const [tomaElegida, setTomaElegida] = useState<Id | null>(null)
  const [tomaAbajoId, setTomaAbajoId] = useState<Id | null>(null)
  const [capaReplanteoId, setCapaReplanteoId] = useState<Id | null>(null)
  const [bmId, setBmId] = useState<Id | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [paginaGrande, setPaginaGrande] = useState(false)
  // A pantalla completa, la página se puede ver al doble para leer las cotas.
  const [paginaAcercada, setPaginaAcercada] = useState(false)
  // En el celular el veredicto va en una línea; tocándolo se lee entero.
  const [veredictoEntero, setVeredictoEntero] = useState(false)

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
    const archivo = preparacion.listo ? `${preparacion.nombreArchivo}.pdf` : ''
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
        setVistaPrevia({ tipo: 'lista', url: pagina.url, ancho: pagina.anchoPx, alto: pagina.altoPx, titulo, archivo })
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

  // Lo que ya está elegido, en chips: se ve de un vistazo sin abrir el formulario.
  const chips = chipsDelAlcance({
    tipo,
    calleNombre: calle?.nombre ?? null,
    tomaActual,
    capaAbajo: abajo.find((t) => t.toma.id === tomaAbajoId) ?? abajo[0],
    capaReplanteo: proyecto.capas.find((c) => c.id === alcance.capaReplanteoId)?.nombre ?? null,
    bm: proyecto.bms.find((b) => b.id === alcance.bmId)?.nombre ?? null,
    desde: usaTramo ? (alcance.desde ?? preferencias.desde.trim()) : null,
    hasta: usaTramo ? (alcance.hasta ?? preferencias.hasta.trim()) : null,
  })
  // Si falta algo en el alcance, el formulario se abre solo: el aviso lleva a donde se arregla.
  const faltaAlgo =
    !preparacion.listo ||
    ilegibles.desde ||
    ilegibles.hasta ||
    ilegibles.estacion ||
    ilegibles.vistaAtras ||
    (tipo === 'estacas' && preferencias.vistaAtras.trim() === '')
  const [alcanceAbierto, setAlcanceAbierto] = useState(faltaAlgo)
  useEffect(() => {
    if (faltaAlgo) setAlcanceAbierto(true)
  }, [faltaAlgo])

  useEffect(() => {
    if (!paginaGrande) return
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && setPaginaGrande(false)
    document.addEventListener('keydown', alPulsar)
    return () => document.removeEventListener('keydown', alPulsar)
  }, [paginaGrande])

  return (
    // En el celular el pie (veredicto y botones) es lo último y va pegado abajo
    // de <main>, encima de la barra de espacios. En la laptop, dos columnas: a
    // la izquierda qué informe e incluir; a la derecha la hoja, protagonista.
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-4 pb-0 sm:p-6 sm:pb-0 lg:grid-cols-[400px_minmax(0,1fr)] lg:grid-rows-[auto_auto_auto_1fr] lg:gap-x-8 lg:pb-6">
      <div className="flex min-w-0 flex-col gap-2 lg:col-span-2">
        <h2 className="text-[26px] font-bold leading-tight">Informes</h2>

        {/* La calle, la jornada y el tramo vienen elegidos de antes: se cambian aquí si hace falta. */}
        <details
          open={alcanceAbierto}
          onToggle={(e) => setAlcanceAbierto(e.currentTarget.open)}
          className="group"
        >
          <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 rounded-xl [&::-webkit-details-marker]:hidden">
            {chips.map((c, i) => (
              <span key={i} className={CHIP_ALCANCE}>
                {i === 0 ? <b className="font-semibold">{c}</b> : c}
              </span>
            ))}
            <span className="inline-flex min-h-11 items-center gap-1 px-1 text-sm font-semibold text-proyecto">
              Cambiar calle, jornada o tramo
              <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-180">
                ▾
              </span>
            </span>
          </summary>

          <section aria-labelledby={ids.alcance} className={`${TARJETA} mt-2 flex flex-col gap-3`}>
            <h3 id={ids.alcance} className={TITULO_TARJETA}>
              Alcance
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                        className={`${CAMPO} font-mono`}
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
                        className={`${CAMPO} font-mono`}
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
                  <Campo
                    etiqueta="Desde"
                    ayuda="vacío = toda la calle"
                    error={ilegibles.desde ? NO_SE_ENTIENDE_PROGRESIVA : undefined}
                  >
                    {(campo) => (
                      <input
                        {...campo}
                        className={`${CAMPO} font-mono`}
                        inputMode="text"
                        autoComplete="off"
                        value={preferencias.desde}
                        onChange={(e) => cambiar({ desde: e.target.value })}
                      />
                    )}
                  </Campo>
                  <Campo
                    etiqueta="Hasta"
                    ayuda="vacío = toda la calle"
                    error={ilegibles.hasta ? NO_SE_ENTIENDE_PROGRESIVA : undefined}
                  >
                    {(campo) => (
                      <input
                        {...campo}
                        className={`${CAMPO} font-mono`}
                        inputMode="text"
                        autoComplete="off"
                        value={preferencias.hasta}
                        onChange={(e) => cambiar({ hasta: e.target.value })}
                      />
                    )}
                  </Campo>
                </>
              )}
            </div>
            {tipo === 'estacas' && capaReplanteoId === null && bmId === null && (
              <p className={AYUDA}>{replanteo.razon}</p>
            )}
            {!usaTramo && <p className={AYUDA}>La libreta va entera: recortarla haría que sus sumas no cuadren.</p>}
            {usaTramo &&
              typeof alcance.desde === 'number' &&
              typeof alcance.hasta === 'number' &&
              alcance.desde > alcance.hasta && (
                <AvisoLinea tono="aviso">
                  «Desde» ({formatearProgresiva(alcance.desde)}) va después de «Hasta»: no queda ningún punto.
                </AvisoLinea>
              )}
          </section>
        </details>
      </div>

      {/* 1. Qué informe. En el celular, dos por fila y sin descripción. */}
      <section aria-labelledby={`${idBase}-que`} className={`${TARJETA} flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-start-2`}>
        <h3 id={`${idBase}-que`} className={TITULO_TARJETA}>
          Qué informe
        </h3>
        <div role="group" aria-label="Tipo de informe" className="grid grid-cols-2 gap-2 lg:grid-cols-1">
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
                className={`flex min-h-11 flex-col items-start gap-0.5 rounded-xl bg-tarjeta text-left text-tinta ${
                  activa
                    ? 'border-2 border-tinta px-3 py-2 sm:p-3 lg:py-2.5'
                    : 'border border-borde px-[13px] py-[9px] hover:bg-fondo sm:p-[13px] lg:py-[11px]'
                }`}
              >
                <span className="text-[15px] font-semibold leading-5">{f.titulo}</span>
                <span id={idDescripcion} className="hidden text-[13px] leading-[18px] text-tenue sm:block">
                  {f.descripcion}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/*
        2. La hoja. En el celular esta sección no hace caja (contents): la
        hoja va justo después de los tipos y el pie, al final, pegado abajo.
      */}
      <section
        aria-labelledby={ids.previa}
        className="contents lg:sticky lg:top-4 lg:col-start-2 lg:row-span-3 lg:row-start-2 lg:flex lg:min-w-0 lg:flex-col lg:gap-3 lg:self-start"
      >
        <h3 id={ids.previa} className="sr-only">
          Vista previa
        </h3>
        <div className="flex min-w-0 flex-col gap-3">
          {preparacion.listo && preparacion.avisos.length > 0 && (
            <ul aria-label="Avisos del informe" className="mx-auto flex w-full max-w-[520px] flex-col gap-1.5">
              {preparacion.avisos.map((a, i) => (
                <li key={`${i}-${a}`}>
                  <AvisoLinea tono="aviso">{a}</AvisoLinea>
                </li>
              ))}
            </ul>
          )}

          {/* La hoja de papel: siempre blanca y en proporción A4, también en el tema oscuro. */}
          <div className="relative mx-auto flex aspect-[210/297] w-full max-w-[520px] items-center lg:w-[clamp(300px,calc((100dvh-330px)*210/297),520px)] justify-center overflow-hidden bg-white text-[#2c3640] shadow-[0_2px_12px_rgba(16,22,29,.18)]">
            {!preparacion.listo && (
              <p className="p-6 text-[15px]">
                <span aria-hidden="true">△ </span>
                {preparacion.motivo}
              </p>
            )}
            {pdf && 'error' in pdf && (
              <p className="p-6 text-[15px] text-[#9f1b1b]">
                <span aria-hidden="true">✗ </span>
                No se pudo armar el PDF: {pdf.error}
              </p>
            )}
            {vistaPrevia.tipo === 'error' && (
              <p className="p-6 text-[15px] text-[#9f1b1b]">
                <span aria-hidden="true">✗ </span>
                No se pudo dibujar la vista previa ({vistaPrevia.mensaje}). El PDF se puede descargar igual.
              </p>
            )}
            {bytes && pintada && (
              <button
                type="button"
                aria-label="Ver la página a pantalla completa"
                onClick={() => {
                  setPaginaAcercada(false)
                  setPaginaGrande(true)
                }}
                className="absolute inset-0 flex cursor-zoom-in items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
              >
                <img
                  src={pintada.url}
                  width={pintada.ancho}
                  height={pintada.alto}
                  // La anterior, mientras se dibuja la nueva, no se anuncia: no es la que se va a descargar.
                  alt={vistaPrevia.tipo === 'lista' ? `Primera página: ${pintada.titulo}` : ''}
                  aria-hidden={vistaPrevia.tipo === 'lista' ? undefined : true}
                  // Los guiones esperan por esto, no por tiempo: la imagen es la del PDF de esta calle.
                  data-archivo={vistaPrevia.tipo === 'lista' ? pintada.archivo : undefined}
                  className={`h-full w-full object-contain ${vistaPrevia.tipo === 'lista' ? '' : 'opacity-50'}`}
                />
              </button>
            )}
            {vistaPrevia.tipo === 'pintando' && (
              <p
                className={`text-sm text-[#4a5561] ${
                  pintada
                    ? 'pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-white/95 px-3 py-1 font-medium shadow'
                    : 'p-6'
                }`}
              >
                Dibujando la página…
              </p>
            )}
          </div>
        </div>

        {/* En la laptop va debajo de los botones: así el pie entra sin bajar. */}
        {queLleva && (
          <p id={ids.queLleva} className={`${AYUDA} mx-auto w-full max-w-[520px] lg:order-last`}>
            {queLleva}
          </p>
        )}

        {/*
          El veredicto y los botones. En el celular van al final y pegados abajo
          de lo que se desplaza: se elige el informe arriba y se manda sin bajar.
          En la laptop, quietos debajo de la hoja.
        */}
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-borde bg-tarjeta p-3 shadow-[0_-4px_14px_rgba(16,22,29,.10)] max-lg:order-last sm:-mx-6 lg:static lg:z-auto lg:mx-auto lg:w-full lg:max-w-[520px] lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <p
            aria-live="polite"
            title={veredictoEntero || !veredicto ? undefined : 'Toca para leerlo entero'}
            onClick={() => setVeredictoEntero((v) => !v)}
            className={`text-sm font-medium max-lg:cursor-pointer ${veredictoEntero ? '' : 'max-lg:truncate'} ${
              veredicto ? SIMBOLO[veredicto.estado].color : 'text-tenue'
            }`}
          >
            {veredicto ? (
              <>
                {SIMBOLO[veredicto.estado].simbolo} {veredicto.texto}
                {/* Solo si es verdad: la hoja de estacas puede pedir cambiar de estación sin franja. */}
                {preparacion.listo &&
                  !estaComprobado(preparacion.informe) &&
                  ' El PDF lleva en cada página la franja de aviso.'}
              </>
            ) : vistaPrevia.tipo === 'pintando' ? null : (
              <>
                <span aria-hidden="true">△ </span>
                Este informe todavía no se puede armar: falta algo en el alcance.
              </>
            )}
          </p>
          <div className="grid grid-cols-[1.6fr_1fr_1fr] gap-2 lg:flex lg:justify-center">
            <button
              type="button"
              className={`${BOTON_PRINCIPAL} px-2! whitespace-nowrap sm:px-3! lg:px-6!`}
              disabled={!bytes}
              onClick={() => bytes && descargarBytes(bytes, nombrePdf)}
            >
              Descargar PDF
            </button>
            <button
              type="button"
              aria-label="Descargar Excel"
              className={`${BOTON_SECUNDARIO} min-h-12 px-2! text-[15px] lg:px-5!`}
              disabled={!tablaDelInforme}
              aria-describedby={queLleva ? ids.queLleva : undefined}
              title={tablaDelInforme ? undefined : 'Este informe no tiene tabla para Excel'}
              onClick={() => tablaDelInforme && descargarTabla(tablaDelInforme)}
            >
              Excel
            </button>
            <button
              type="button"
              className={`${BOTON_SECUNDARIO} min-h-12 px-2! text-[15px] lg:px-5!`}
              disabled={!bytes}
              onClick={() => void compartir()}
            >
              Compartir
            </button>
          </div>
          {aviso && (
            <p role="status" className="text-sm text-tenue">
              {aviso}
            </p>
          )}
        </div>
      </section>

      {/* 3. Qué más lleva */}
      <section
        aria-labelledby={ids.opciones}
        className={`${TARJETA} flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-start-3`}
      >
        <h3 id={ids.opciones} className={TITULO_TARJETA}>
          Incluir
        </h3>
        <div className="flex flex-wrap gap-2">
          <label className={claseChip(opciones.notas)}>
            <input
              type="checkbox"
              className="sr-only"
              checked={opciones.notas}
              disabled={notasEnTramo === 0}
              onChange={(e) => cambiar({ conNotas: e.target.checked })}
            />
            <span aria-hidden="true">{opciones.notas ? '✓' : '+'}</span>
            Notas de campo ({notasEnTramo})
          </label>
          <label className={claseChip(firmas)}>
            <input
              type="checkbox"
              className="sr-only"
              checked={firmas}
              onChange={(e) => cambiar({ firmas: e.target.checked })}
            />
            <span aria-hidden="true">{firmas ? '✓' : '+'}</span>
            Cuadros de firma
          </label>
          {/* El nombre accesible es el texto que se ve: el control por voz lo encuentra. */}
          <label className={claseChip(logo !== null)}>
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
        </div>
        {notasEnTramo === 0 && (
          <p className={AYUDA}>{usaTramo ? 'No hay notas de campo en el tramo.' : 'La calle no tiene notas de campo.'}</p>
        )}
        {logo && (
          <div className="flex items-center gap-3">
            <img src={logo.dataUrl} alt="Logo elegido" className="h-11 w-11 rounded border border-borde bg-white object-contain" />
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => cambiar({ logo: null })}>
              Quitar logo
            </button>
          </div>
        )}
        {firmas && (
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
              <span className="flex min-h-12 items-center text-[15px]">
                {proyecto.meta.responsable.trim() || '— (se pone en los datos del proyecto, en Obra)'}
              </span>
            </div>
          </div>
        )}
      </section>

      <TablasParaExcel
        idBase={idBase}
        tablas={tablas}
        hayJornada={tomaActual !== undefined}
        descripcion={tomaActual && calle ? `${calle.nombre} · ${nombreDeToma(tomaActual)} · jornada entera` : null}
      />

      {paginaGrande && pintada && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Página a pantalla completa"
          className="fixed inset-0 z-50 overflow-auto overscroll-contain bg-black/80"
          onClick={() => setPaginaGrande(false)}
        >
          {/* min-w y min-h: centrada si cabe; acercada, se desplaza sin cortarse por la izquierda. */}
          <div className="flex min-h-full w-max min-w-full p-4 pt-16">
            <img
              src={pintada.url}
              alt={`Primera página: ${pintada.titulo}, a pantalla completa`}
              onClick={(e) => {
                e.stopPropagation()
                setPaginaAcercada((v) => !v)
              }}
              className={`m-auto bg-white shadow-2xl [touch-action:pan-x_pan-y_pinch-zoom] ${
                paginaAcercada
                  ? 'w-[220vw] max-w-none cursor-zoom-out lg:w-[min(1000px,calc(100vw-2rem))]'
                  : 'max-h-[calc(100dvh-5rem)] max-w-[calc(100vw-2rem)] cursor-zoom-in object-contain'
              }`}
            />
          </div>
          <div className="fixed top-3 right-3 flex gap-2">
            <button
              type="button"
              aria-pressed={paginaAcercada}
              onClick={(e) => {
                e.stopPropagation()
                setPaginaAcercada((v) => !v)
              }}
              className="inline-flex h-11 items-center justify-center gap-1 rounded-full bg-white px-4 text-[15px] font-semibold text-[#10161d] shadow-lg"
            >
              <span aria-hidden="true">{paginaAcercada ? '−' : '+'}</span>
              {paginaAcercada ? 'Alejar' : 'Acercar'}
            </button>
            <button
              type="button"
              aria-label="Cerrar la página"
              autoFocus
              onClick={() => setPaginaGrande(false)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl font-semibold text-[#10161d] shadow-lg"
            >
              ✕
            </button>
          </div>
        </div>
      )}
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
        <span id={idAyuda} className={AYUDA}>
          {ayuda}
        </span>
      )}
      {error && (
        <span id={idError} className="text-[13px] font-medium text-aviso">
          <span aria-hidden="true">△ </span>
          {error}
        </span>
      )}
    </div>
  )
}

/** Formatea un extremo del tramo: la progresiva si se entiende, o lo escrito tal cual. */
function extremo(valor: number | string | null, siVacio: string): string {
  if (typeof valor === 'number') return formatearProgresiva(valor)
  return valor ? valor : siVacio
}

/**
 * Lo que ya está elegido, en palabras cortas: la calle primero (en negrita),
 * luego la capa y la fecha de la jornada y el tramo.
 */
function chipsDelAlcance({
  tipo,
  calleNombre,
  tomaActual,
  capaAbajo,
  capaReplanteo,
  bm,
  desde,
  hasta,
}: {
  tipo: string
  calleNombre: string | null
  tomaActual: ReturnType<typeof tomasDeCalle>[number] | undefined
  capaAbajo: ReturnType<typeof tomasDeCalle>[number] | undefined
  capaReplanteo: string | null
  bm: string | null
  desde: number | string | null
  hasta: number | string | null
}): string[] {
  const chips = [calleNombre ?? 'Sin calles']
  if (tipo === 'estacas') {
    chips.push(capaReplanteo ?? 'sin capa')
    chips.push(bm ?? 'sin BM')
  } else if (!tomaActual) {
    chips.push('sin jornada medida')
  } else {
    const capa = tomaActual.capa?.nombre ?? 'Capa sin nombre'
    chips.push(tipo === 'espesores' && capaAbajo ? `${capa} sobre ${capaAbajo.capa?.nombre ?? '—'}` : capa)
    chips.push(fechaImpresa(tomaActual.toma.fecha))
  }
  if (tipo === 'libreta') chips.push('libreta entera')
  else if (desde === null && hasta === null) chips.push('toda la calle')
  else if (desde === '' && hasta === '') chips.push('toda la calle')
  else chips.push(`${extremo(desde, 'inicio')}–${extremo(hasta, 'fin')}`)
  return chips
}

/**
 * Las exportaciones de siempre (antes solo en Revisar): cotas, diferencias
 * contra el proyecto y espesores, a Excel o CSV, o copiadas para pegar. La
 * cabecera de cada archivo dice si la nivelación cerró. Van plegadas al
 * final: lo de cada día es el informe de arriba.
 */
function TablasParaExcel({
  idBase,
  tablas,
  hayJornada,
  descripcion,
}: {
  idBase: string
  tablas: TablasDeLaJornada
  hayJornada: boolean
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
  // Sin jornada no hay nada que exportar, tenga o no rasante la calle: se dice eso primero.
  const sinJornada = 'no hay jornada medida'
  const grupos: { nombre: string; titulo: string; tabla: TablaExcel | null; falta: string }[] = [
    { nombre: 'cotas', titulo: 'Cotas', tabla: tablas.cotas, falta: sinJornada },
    {
      nombre: 'diferencias',
      titulo: 'Diferencias',
      tabla: tablas.diferencias,
      falta: hayJornada ? 'la calle no tiene rasante' : sinJornada,
    },
    {
      nombre: 'espesores',
      titulo: 'Espesores',
      tabla: tablas.espesores,
      falta: !hayJornada ? sinJornada : 'no hay una capa medida debajo',
    },
  ]
  function copiar(nombre: string, tabla: TablaExcel) {
    void copiarAlPortapapeles(tabla.filas).then(() => {
      setCopiada(nombre)
      if (espera.current !== null) window.clearTimeout(espera.current)
      espera.current = window.setTimeout(() => setCopiada(null), 2000)
    })
  }
  return (
    <section aria-label="Tablas para Excel" className={`${TARJETA} min-w-0 py-2 lg:col-start-1 lg:row-start-4 lg:self-start`}>
      <Plegable titulo="Datos sueltos" resumen="cotas, diferencias y espesores en Excel, CSV o para copiar">
        <div className="flex flex-col gap-1 pb-2">
          {descripcion && <p className={`${AYUDA} pb-1`}>{descripcion}</p>}
          {grupos.map(({ nombre, titulo, tabla, falta }) => (
            <div key={nombre} className="flex min-h-12 flex-wrap items-center gap-2 border-t border-borde pt-1 first-of-type:border-0">
              <span className="min-w-0 flex-1 text-[15px] font-medium">
                {titulo}
                {!tabla && <span className={`${AYUDA} block font-normal`}>({falta})</span>}
              </span>
              <button
                type="button"
                aria-label={`Exportar ${nombre} a Excel`}
                className={BOTON_SECUNDARIO}
                disabled={!tabla}
                onClick={() => tabla && descargarTabla(tabla)}
              >
                Excel
              </button>
              {tabla && (
                <MenuMas
                  etiqueta={`Más formatos de ${nombre}`}
                  idMenu={`${idBase}-mas-${nombre}`}
                  etiquetaGrupo={`Otros formatos de ${nombre}`}
                >
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      aria-label={`Exportar ${nombre} a CSV`}
                      className="inline-flex min-h-11 items-center rounded-lg px-3 text-left text-[15px] hover:bg-fondo"
                      onClick={() => descargarCsv(tabla.filas, tabla.nombre)}
                    >
                      CSV
                    </button>
                    <button
                      type="button"
                      aria-label={`Copiar ${nombre}`}
                      className="inline-flex min-h-11 items-center rounded-lg px-3 text-left text-[15px] hover:bg-fondo"
                      onClick={() => copiar(nombre, tabla)}
                    >
                      {copiada === nombre ? 'Copiado ✓' : 'Copiar'}
                    </button>
                  </div>
                </MenuMas>
              )}
            </div>
          ))}
        </div>
      </Plegable>
    </section>
  )
}
