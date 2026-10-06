import type { Id, Punto2, TextoCota } from '@topo/core'
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react'
import { useAlmacen } from '../../estado/almacen'
import { ejesCandidatos, type TextoPlano } from '../../planos/dxf'
import { datosDePista, estacasDeCroquis, type DatosPista } from './datosPista'
import { DibujoCroquis, DibujoEje, DibujoPista, FondoDxf, FondoPdf, MarcasCalibracion } from './Dibujos'
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAJA, type AvisoPantalla } from './estilos'
import FichaEje from './FichaEje'
import { FichaPista } from './FichaPista'
import { limitesDePuntos, mismaPolilinea, pistaCalibrada, unirLimites } from './geometriaVisor'
import { importarPlano } from './importarPlano'
import { BORRADOR_VACIO, PanelCalibrar, PanelCapas, PanelCroquis, textoEscala, type BorradorCroquis } from './Paneles'
import { usePlanoCargado } from './usePlanoCargado'
import VisorPlano from './VisorPlano'

type Modo = 'ver' | 'calibrar' | 'croquis'
type Seleccion = { tipo: 'pista'; id: Id } | { tipo: 'eje'; indice: number } | null

const MODOS: { modo: Modo; texto: string }[] = [
  { modo: 'ver', texto: 'Ver' },
  { modo: 'calibrar', texto: 'Calibrar escala' },
  { modo: 'croquis', texto: 'Dibujar croquis' },
]
const BOTON_MODO = 'min-h-11 rounded px-3 text-sm'
const MODO_INACTIVO =
  'border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
const MODO_ACTIVO = 'border border-marca bg-marca font-medium text-white'
const SIN_TEXTOS: TextoPlano[] = []

/** Solo un arrastre de archivos enseña «Suelta el plano aquí»; un texto seleccionado no. */
function traeArchivos(evento: DragEvent): boolean {
  const tipos = evento.dataTransfer?.types
  return !!tipos && Array.from(tipos).includes('Files')
}

/**
 * Obra › Plano: el plano de obra (DXF o PDF) con las pistas encima, sus
 * pendientes, flechas hacia donde bajan y sus controles; el croquis de una
 * pista nueva dibujado vértice a vértice; y, en un DXF, sus ejes para
 * convertirlos en calles. Tocar una pista abre su ficha y desde ahí sus
 * cálculos. Las cuentas (progresivas, cotas, pendientes) son del motor.
 *
 * Un plano es UNA lámina: las pistas y la escala son de la página en que se
 * hicieron. Para trabajar en otra página de un PDF que ya tiene pistas o
 * escala, esa página se abre como un plano aparte.
 */
export default function EspacioPlano() {
  const idTitulo = useId()
  const proyecto = useAlmacen((s) => s.proyecto)
  const archivosDePlano = useAlmacen((s) => s.archivosDePlano)
  const agregarPlano = useAlmacen((s) => s.agregarPlano)
  const actualizarPlano = useAlmacen((s) => s.actualizarPlano)
  const eliminarPlano = useAlmacen((s) => s.eliminarPlano)
  const eliminarPista = useAlmacen((s) => s.eliminarPista)

  const planos = useMemo(() => proyecto.planos ?? [], [proyecto.planos])
  const pistas = useMemo(() => proyecto.pistas ?? [], [proyecto.pistas])

  const [planoElegidoId, setPlanoElegidoId] = useState<Id | null>(null)
  const [modo, setModo] = useState<Modo>('ver')
  const [seleccion, setSeleccion] = useState<Seleccion>(null)
  const [puntosCroquis, setPuntosCroquis] = useState<Punto2[]>([])
  const [borrador, setBorrador] = useState<BorradorCroquis>(BORRADOR_VACIO)
  const [puntosCalibrar, setPuntosCalibrar] = useState<Punto2[]>([])
  const [mensaje, setMensaje] = useState<AvisoPantalla | null>(null)
  const [importando, setImportando] = useState(false)
  const [verCotas, setVerCotas] = useState(true)
  const [confirmarQuitarPlano, setConfirmarQuitarPlano] = useState(false)
  const [paginaPedida, setPaginaPedida] = useState<number | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  // Cada hijo de la sección dispara su dragenter/dragleave: se cuentan para no parpadear.
  const entradasArrastre = useRef(0)
  const importandoAhora = useRef(false)
  const refTituloFicha = useRef<HTMLHeadingElement>(null)
  const [llevarAFicha, setLlevarAFicha] = useState(0)

  const plano = planos.find((p) => p.id === planoElegidoId) ?? planos[0]
  const cargado = usePlanoCargado(plano, plano ? archivosDePlano[plano.id] : undefined)

  const textos = cargado.estado === 'dxf' ? cargado.vectorial.textos : cargado.estado === 'pdf' ? cargado.pdf.textos : SIN_TEXTOS
  const textosCota = useMemo<TextoCota[]>(
    () => textos.filter((t) => t.valor !== null).map((t) => ({ x: t.x, y: t.y, valor: t.valor })),
    [textos],
  )
  const ocultas = useMemo(() => new Set(plano?.capasOcultas ?? []), [plano?.capasOcultas])
  const pistasDelPlano = useMemo(() => pistas.filter((p) => plano && p.planoId === plano.id), [pistas, plano])

  // Sin escala no hay datos (null, sin error); si el motor no pudo con la pista, su mensaje.
  const { datosPorPista, erroresPorPista } = useMemo(() => {
    const datos = new Map<Id, DatosPista | null>()
    const errores = new Map<Id, string>()
    for (const pista of pistasDelPlano) {
      const calibrada = pistaCalibrada(pista, plano)
      const calle = pista.calleId ? proyecto.calles.find((c) => c.id === pista.calleId) : undefined
      try {
        datos.set(pista.id, calibrada ? datosDePista(calibrada, textosCota, calle) : null)
      } catch (e) {
        // Una pista rota (un solo vértice, una escala absurda) se dibuja sin datos, no tumba la pantalla.
        datos.set(pista.id, null)
        errores.set(pista.id, e instanceof Error ? e.message : String(e))
      }
    }
    return { datosPorPista: datos, erroresPorPista: errores }
  }, [pistasDelPlano, plano, textosCota, proyecto.calles])

  // Los ejes del DXF que todavía no son pista, con su número en la lista completa.
  const ejes = useMemo(() => {
    if (cargado.estado !== 'dxf') return []
    return ejesCandidatos(cargado.vectorial)
      .map((eje, indice) => ({ eje, indice }))
      .filter(({ eje }) => !pistasDelPlano.some((p) => mismaPolilinea(p.polilinea, eje.puntos)))
  }, [cargado, pistasDelPlano])

  const limites = useMemo(() => {
    const delPlano = cargado.estado === 'dxf' || cargado.estado === 'pdf' ? cargado.limites : null
    return unirLimites(delPlano, limitesDePuntos(pistasDelPlano.flatMap((p) => p.polilinea)))
  }, [cargado, pistasDelPlano])

  const estacasCroquis = useMemo(() => estacasDeCroquis(puntosCroquis, plano?.calibracion), [puntosCroquis, plano?.calibracion])

  // En el celular la ficha cae debajo del visor: se la trae a la vista y se le da el foco.
  useEffect(() => {
    if (llevarAFicha === 0) return
    const titulo = refTituloFicha.current
    if (!titulo) return
    const ancha = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches
    if (!ancha) titulo.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    titulo.focus({ preventScroll: true })
  }, [llevarAFicha])

  function elegir(nueva: Seleccion) {
    setSeleccion(nueva)
    if (nueva) setLlevarAFicha((n) => n + 1)
  }

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo)
    setPuntosCalibrar([])
    if (nuevo !== 'ver') setSeleccion(null)
  }

  function elegirPlano(id: Id) {
    setPlanoElegidoId(id)
    setSeleccion(null)
    setPuntosCroquis([])
    setPuntosCalibrar([])
    setConfirmarQuitarPlano(false)
    setPaginaPedida(null)
  }

  async function importar(archivo: File | undefined) {
    if (!archivo || importandoAhora.current) return
    importandoAhora.current = true
    setImportando(true)
    setMensaje(null)
    const resultado = await importarPlano(archivo, agregarPlano)
    importandoAhora.current = false
    setImportando(false)
    if (!resultado.ok) {
      setMensaje({ tipo: 'error', texto: resultado.mensaje })
      return
    }
    elegirPlano(resultado.id)
    setModo(resultado.aviso ? 'calibrar' : 'ver')
    setMensaje(resultado.aviso ? { tipo: 'aviso', texto: `Plano importado. ${resultado.aviso}` } : { tipo: 'ok', texto: '✓ Plano importado.' })
  }

  function alEntrarArrastre(evento: DragEvent) {
    if (!traeArchivos(evento)) return
    evento.preventDefault()
    entradasArrastre.current += 1
    setArrastrando(true)
  }

  function alSalirArrastre(evento: DragEvent) {
    if (!traeArchivos(evento)) return
    entradasArrastre.current = Math.max(0, entradasArrastre.current - 1)
    if (entradasArrastre.current === 0) setArrastrando(false)
  }

  function alSoltarArchivo(evento: DragEvent) {
    evento.preventDefault()
    entradasArrastre.current = 0
    setArrastrando(false)
    // Mientras se lee un plano no se acepta otro: se importarían los dos a la vez.
    if (importandoAhora.current) return
    void importar(evento.dataTransfer?.files?.[0])
  }

  function alTocar(punto: Punto2, objetivo: Element | null) {
    if (modo === 'calibrar') {
      setPuntosCalibrar((actuales) => (actuales.length >= 2 ? [punto] : [...actuales, punto]))
      return
    }
    if (modo === 'croquis') {
      setPuntosCroquis((actuales) => [...actuales, punto])
      return
    }
    const pista = objetivo?.closest?.('[data-pista]')?.getAttribute('data-pista')
    if (pista) {
      elegir({ tipo: 'pista', id: pista })
      return
    }
    const eje = objetivo?.closest?.('[data-eje]')?.getAttribute('data-eje')
    elegir(eje != null ? { tipo: 'eje', indice: Number(eje) } : null)
  }

  function elegirPista(id: Id) {
    const pista = pistas.find((p) => p.id === id)
    if (pista && plano && pista.planoId !== plano.id) elegirPlano(pista.planoId)
    setModo('ver')
    elegir({ tipo: 'pista', id })
  }

  function cambiarCapa(capa: string, visible: boolean) {
    if (!plano) return
    const siguientes = new Set(ocultas)
    if (visible) siguientes.delete(capa)
    else siguientes.add(capa)
    actualizarPlano(plano.id, { capasOcultas: [...siguientes] })
  }

  /** Una página con pistas o escala no se cambia: la página nueva va como plano aparte. */
  function cambiarPagina(pagina: number) {
    if (!plano || pagina === (plano.pagina ?? 1)) {
      setPaginaPedida(null)
      return
    }
    if (plano.calibracion || pistasDelPlano.length > 0) {
      setPaginaPedida(pagina)
      return
    }
    actualizarPlano(plano.id, { pagina })
  }

  function abrirPaginaAparte(pagina: number) {
    if (!plano) return
    const bytes = archivosDePlano[plano.id]
    if (!bytes) return
    const id = agregarPlano({ nombre: `${plano.nombre} · pág. ${pagina}`, formato: 'pdf', pagina, calibracion: null }, bytes)
    elegirPlano(id)
    setModo('calibrar')
    setMensaje({ tipo: 'aviso', texto: `Página ${pagina} abierta como plano aparte. Calibra su escala: cada lámina tiene la suya.` })
  }

  const pistaElegida = seleccion?.tipo === 'pista' ? pistas.find((p) => p.id === seleccion.id) : undefined
  const ejeElegido = seleccion?.tipo === 'eje' ? ejes.find((e) => e.indice === seleccion.indice) : undefined
  // La elegida se dibuja la última, encima de las demás.
  const pistasEnOrden = [...pistasDelPlano].sort((a, b) => Number(a.id === pistaElegida?.id) - Number(b.id === pistaElegida?.id))
  const nombreElegido = modo === 'ver' ? (pistaElegida?.nombre ?? (ejeElegido ? `Eje ${ejeElegido.indice + 1}` : null)) : null

  const botonImportar = (
    <label className={`${BOTON_PRINCIPAL} inline-flex cursor-pointer items-center justify-center focus-within:ring-2 focus-within:ring-marca`}>
      {importando ? 'Leyendo el plano…' : 'Importar plano'}
      <input
        type="file"
        accept=".dxf,.pdf,.dwg"
        aria-label="Importar plano (DXF o PDF)"
        className="sr-only"
        disabled={importando}
        onChange={(e) => {
          void importar(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </label>
  )

  return (
    <section
      aria-labelledby={idTitulo}
      className="relative mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 sm:p-4"
      onDragEnter={alEntrarArrastre}
      onDragOver={(e) => {
        if (traeArchivos(e)) e.preventDefault()
      }}
      onDragLeave={alSalirArrastre}
      onDrop={alSoltarArchivo}
    >
      {arrastrando && (
        // Capa encima, sin empujar nada: lo que está bajo el cursor no se mueve.
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded border-2 border-dashed border-marca bg-white/80 p-4 text-center text-sm font-medium dark:bg-slate-950/80"
        >
          Suelta el plano aquí (DXF o PDF).
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={idTitulo} className="text-lg font-semibold">
          Plano de obra
        </h2>
        {botonImportar}
      </div>

      {/* Siempre montada: los lectores de pantalla anuncian el cambio de texto, no una región que aparece llena. */}
      <div role="status" aria-live="polite">
        {mensaje && mensaje.tipo !== 'error' && (
          <p className={`rounded border p-3 text-sm ${mensaje.tipo === 'aviso' ? 'border-aviso/60 bg-aviso/10' : 'border-pasa/60 bg-pasa/10'}`}>
            {mensaje.tipo === 'aviso' && <span aria-hidden="true">△ </span>}
            {mensaje.texto}
          </p>
        )}
      </div>
      {mensaje?.tipo === 'error' && (
        <p role="alert" className="rounded border border-falla/60 bg-falla/10 p-3 text-sm">
          <span aria-hidden="true">✗ </span>
          {mensaje.texto}
        </p>
      )}

      {!plano ? (
        <div className="flex flex-col items-center gap-3 rounded border-2 border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
          <p className="text-sm">Todavía no hay planos. Importa el plano de la obra en DXF o PDF, o suéltalo aquí.</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Un DWG se pasa antes a DXF con ODA File Converter.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            {planos.length > 1 ? (
              <label className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:flex-none">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Plano a la vista</span>
                <select
                  value={plano.id}
                  onChange={(e) => elegirPlano(e.target.value)}
                  className="min-h-11 rounded border border-slate-300 bg-white px-2 text-sm sm:w-64 dark:border-slate-700 dark:bg-slate-900"
                >
                  {planos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.formato.toUpperCase()})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="min-w-0 flex-1 truncate self-center text-sm font-medium sm:flex-none">
                {plano.nombre} <span className="text-slate-500">({plano.formato.toUpperCase()})</span>
              </p>
            )}
            {cargado.estado === 'pdf' && cargado.pdf.paginas > 1 && (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Página</span>
                <select
                  value={paginaPedida ?? plano.pagina ?? 1}
                  onChange={(e) => cambiarPagina(Number(e.target.value))}
                  className="min-h-11 rounded border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  {Array.from({ length: cargado.pdf.paginas }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="numerico self-center text-sm text-slate-600 dark:text-slate-300">
              {plano.calibracion ? `Escala: ${textoEscala(plano)}` : '△ Sin escala'}
            </p>
            {confirmarQuitarPlano ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm">
                  ¿Quitar «{plano.nombre}» y sus {pistasDelPlano.length} pistas? Las calles se quedan.
                </span>
                <button
                  type="button"
                  className={BOTON_SECUNDARIO}
                  onClick={() => {
                    eliminarPlano(plano.id)
                    setPlanoElegidoId(null)
                    setSeleccion(null)
                    setConfirmarQuitarPlano(false)
                    setMensaje({ tipo: 'ok', texto: `✓ Plano «${plano.nombre}» quitado.` })
                  }}
                >
                  Sí, quitar el plano
                </button>
                <button type="button" className={BOTON_SECUNDARIO} onClick={() => setConfirmarQuitarPlano(false)}>
                  No
                </button>
              </span>
            ) : (
              <button type="button" className={`${BOTON_SECUNDARIO} sm:ml-auto`} onClick={() => setConfirmarQuitarPlano(true)}>
                Quitar este plano
              </button>
            )}
          </div>

          {paginaPedida !== null && (
            <div className="flex flex-col gap-2 rounded border border-aviso/60 bg-aviso/10 p-3 text-sm">
              <p>
                <span aria-hidden="true">△ </span>
                La escala y las {pistasDelPlano.length} pistas de este plano son de la página {plano.pagina ?? 1}. Otra lámina puede
                tener otra escala y otras cotas: la página {paginaPedida} se abre como un plano aparte, sin pistas y por calibrar.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:flex">
                <button type="button" className={BOTON_PRINCIPAL} onClick={() => abrirPaginaAparte(paginaPedida)}>
                  Abrir la página {paginaPedida} como plano aparte
                </button>
                <button type="button" className={BOTON_SECUNDARIO} onClick={() => setPaginaPedida(null)}>
                  Quedarme en la página {plano.pagina ?? 1}
                </button>
              </div>
            </div>
          )}

          <div role="group" aria-label="Herramientas del plano" className="grid grid-cols-3 gap-2 sm:flex">
            {MODOS.map(({ modo: m, texto }) => (
              <button
                key={m}
                type="button"
                aria-pressed={modo === m}
                onClick={() => cambiarModo(m)}
                className={`${BOTON_MODO} ${modo === m ? MODO_ACTIVO : MODO_INACTIVO}`}
              >
                {texto}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex min-w-0 flex-col gap-2">
              {cargado.estado === 'cargando' && <p className="text-sm">Leyendo el plano…</p>}
              {cargado.estado === 'error' && (
                <p role="alert" className="rounded border border-falla/60 bg-falla/10 p-3 text-sm">
                  <span aria-hidden="true">✗ </span>
                  No se pudo abrir el plano: {cargado.mensaje}
                </p>
              )}
              {cargado.estado === 'sinArchivo' && (
                <p className="rounded border border-aviso/60 bg-aviso/10 p-3 text-sm">
                  <span aria-hidden="true">△ </span>
                  Falta el archivo de este plano (no vino con el proyecto). Vuelve a importarlo; las pistas se ven igual.
                </p>
              )}
              {modo === 'calibrar' && <p className="text-sm">Toca dos puntos de distancia conocida.</p>}
              {modo === 'croquis' && <p className="text-sm">Toca el plano para poner cada vértice de la pista.</p>}
              <div className="relative">
                <VisorPlano
                  limites={limites}
                  claveEncuadre={`${plano.id}:${cargado.estado}:${plano.pagina ?? 1}`}
                  alTocar={alTocar}
                  enModoPuntos={modo !== 'ver'}
                >
                  {(upp) => (
                    <>
                      {cargado.estado === 'dxf' && <FondoDxf vectorial={cargado.vectorial} ocultas={ocultas} />}
                      {cargado.estado === 'pdf' && <FondoPdf pdf={cargado.pdf} verCotas={verCotas} upp={upp} />}
                      {modo === 'ver' &&
                        ejes.map(({ eje, indice }) => (
                          <DibujoEje key={indice} indice={indice} puntos={eje.puntos} elegido={ejeElegido?.indice === indice} />
                        ))}
                      {pistasEnOrden.map((p) => (
                        <DibujoPista
                          key={p.id}
                          id={p.id}
                          nombre={p.nombre}
                          polilinea={p.polilinea}
                          datos={datosPorPista.get(p.id) ?? null}
                          elegida={p.id === pistaElegida?.id}
                          upp={upp}
                        />
                      ))}
                      {modo === 'croquis' && <DibujoCroquis puntos={puntosCroquis} estacas={estacasCroquis} upp={upp} />}
                      {modo === 'calibrar' && <MarcasCalibracion puntos={puntosCalibrar} upp={upp} />}
                    </>
                  )}
                </VisorPlano>
                {nombreElegido && (
                  // En pantalla angosta la ficha queda debajo: este rótulo dice que se abrió y lleva a ella.
                  <button
                    type="button"
                    onClick={() => setLlevarAFicha((n) => n + 1)}
                    className="absolute bottom-2 left-2 z-10 min-h-11 max-w-[calc(100%-6rem)] truncate rounded bg-marca px-3 text-sm font-medium text-white shadow lg:hidden"
                  >
                    {nombreElegido} elegida · ver ficha ↓
                  </button>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              {modo === 'calibrar' && (
                <PanelCalibrar
                  key={plano.id}
                  plano={plano}
                  pistas={pistasDelPlano}
                  puntos={puntosCalibrar}
                  alReiniciar={() => setPuntosCalibrar([])}
                  alTerminar={(texto) => {
                    setMensaje({ tipo: 'ok', texto })
                    setPuntosCalibrar([])
                    setModo('ver')
                  }}
                />
              )}
              {modo === 'croquis' && (
                <PanelCroquis
                  plano={plano}
                  puntos={puntosCroquis}
                  estacas={estacasCroquis}
                  borrador={borrador}
                  alCambiarBorrador={(cambio) => setBorrador((b) => ({ ...b, ...cambio }))}
                  alDeshacer={() => setPuntosCroquis((p) => p.slice(0, -1))}
                  alEmpezarDeNuevo={() => setPuntosCroquis([])}
                  alCrear={(pistaId, texto) => {
                    setMensaje({ tipo: 'ok', texto })
                    setPuntosCroquis([])
                    setBorrador(BORRADOR_VACIO)
                    setModo('ver')
                    elegir({ tipo: 'pista', id: pistaId })
                  }}
                />
              )}
              {modo === 'ver' && pistaElegida && (
                <FichaPista
                  key={pistaElegida.id}
                  ref={refTituloFicha}
                  pista={pistaElegida}
                  datos={datosPorPista.get(pistaElegida.id) ?? null}
                  error={erroresPorPista.get(pistaElegida.id) ?? null}
                  alAvisar={setMensaje}
                  alQuitar={() => {
                    eliminarPista(pistaElegida.id)
                    setSeleccion(null)
                    setMensaje({ tipo: 'ok', texto: `✓ Pista «${pistaElegida.nombre}» quitada.` })
                  }}
                />
              )}
              {modo === 'ver' && ejeElegido && (
                <FichaEje
                  key={ejeElegido.indice}
                  ref={refTituloFicha}
                  eje={ejeElegido.eje}
                  indice={ejeElegido.indice}
                  plano={plano}
                  textos={textos}
                  textosCota={textosCota}
                  alUsar={(pistaId, aviso) => {
                    setMensaje(aviso)
                    elegir({ tipo: 'pista', id: pistaId })
                  }}
                />
              )}

              <section aria-label="Pistas de la obra" className={CAJA}>
                <h3 className="text-sm font-semibold">Pistas</h3>
                {pistas.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Sin pistas todavía: dibuja un croquis{cargado.estado === 'dxf' ? ' o toca un eje del plano' : ''}.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {pistas.map((p) => {
                      const enEste = p.planoId === plano.id
                      const datos = enEste ? datosPorPista.get(p.id) : undefined
                      const fallo = enEste && erroresPorPista.has(p.id)
                      const empinada = datos?.tramos.some((t) => t.empinada)
                      const otroPlano = !enEste ? planos.find((x) => x.id === p.planoId)?.nombre : null
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            aria-pressed={pistaElegida?.id === p.id}
                            onClick={() => elegirPista(p.id)}
                            className={`flex min-h-11 w-full flex-col items-start justify-center rounded px-2 py-1 text-left text-sm ${
                              pistaElegida?.id === p.id ? MODO_ACTIVO : MODO_INACTIVO
                            }`}
                          >
                            <span className="font-medium">{p.nombre}</span>
                            <span className="numerico text-xs opacity-80">
                              {datos
                                ? `${datos.largoM.toFixed(1)} m`
                                : fallo
                                  ? '△ no se pudo medir'
                                  : otroPlano
                                    ? `en «${otroPlano}»`
                                    : 'sin escala'}
                              {empinada ? ' · △ empinada' : ''}
                              {p.calleId ? '' : ' · sin calle'}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              {modo === 'ver' && ejes.length > 0 && (
                <section aria-label="Ejes del DXF" className={CAJA}>
                  <h3 className="text-sm font-semibold">Ejes del plano sin calle</h3>
                  <ul className="flex flex-col gap-1">
                    {ejes.map(({ eje, indice }) => (
                      <li key={indice}>
                        <button
                          type="button"
                          aria-pressed={ejeElegido?.indice === indice}
                          onClick={() => elegir({ tipo: 'eje', indice })}
                          className={`numerico min-h-11 w-full rounded px-2 text-left text-sm ${
                            ejeElegido?.indice === indice ? MODO_ACTIVO : MODO_INACTIVO
                          }`}
                        >
                          Eje {indice + 1}
                          {plano.calibracion ? ` · ${(eje.largo * plano.calibracion.metrosPorUnidad).toFixed(1)} m` : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {cargado.estado === 'dxf' && <PanelCapas vectorial={cargado.vectorial} ocultas={ocultas} alCambiar={cambiarCapa} />}
              {cargado.estado === 'pdf' && (
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-5" checked={verCotas} onChange={(e) => setVerCotas(e.target.checked)} />
                  Marcar las cotas que leyó la app ({textosCota.length})
                </label>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
