import type { Id, Punto2, TextoCota } from '@topo/core'
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react'
import { useAlmacen } from '../../estado/almacen'
import { ejesCandidatos, type TextoPlano } from '../../planos/dxf'
import { datosDePista, estacasDeCroquis, type DatosPista } from './datosPista'
import { DibujoCroquis, DibujoEje, DibujoPista, FondoDxf, FondoPdf, MarcasCalibracion } from './Dibujos'
import MenuMas from '../../componentes/MenuMas'
import Plegable from '../../componentes/Plegable'
import Segmentado, { type OpcionSegmentado } from '../../componentes/Segmentado'
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAJA, ENLACE_PELIGRO, ITEM_MENU, TARJETA, type AvisoPantalla } from './estilos'
import FichaEje from './FichaEje'
import { FichaPista } from './FichaPista'
import { limitesDePuntos, mismaPolilinea, pistaCalibrada, unirLimites } from './geometriaVisor'
import { importarPlano } from './importarPlano'
import { BORRADOR_VACIO, PanelCalibrar, PanelCapas, PanelCroquis, textoEscala, textoEscalaCorto, type BorradorCroquis } from './Paneles'
import { usePlanoCargado } from './usePlanoCargado'
import VisorPlano from './VisorPlano'
import { DibujoNiveles, PanelNiveles } from './NivelesPlano'
import { analizarPlano, nivelesVacios, siguienteNombre } from '../../niveles/enPlano'
import { nuevoIdNivel } from '../../niveles/hoja'
import type { NivelesEnPlano } from '@topo/core'

type Modo = 'ver' | 'calibrar' | 'croquis' | 'niveles'
type Seleccion = { tipo: 'pista'; id: Id } | { tipo: 'eje'; indice: number } | null

const MODOS: OpcionSegmentado<Modo>[] = [
  { valor: 'ver', texto: 'Ver' },
  { valor: 'calibrar', texto: 'Calibrar escala' },
  { valor: 'croquis', texto: 'Dibujar croquis' },
  { valor: 'niveles', texto: 'Niveles' },
]
/** Lo que se hace con el dedo en cada herramienta: va junto al título. */
const AYUDA_MODO: Record<Modo, string> = {
  ver: 'Toca una pista para ver su ficha',
  calibrar: 'Toca dos puntos de distancia conocida.',
  croquis: 'Toca el plano para poner cada vértice de la pista.',
  niveles: 'Toca el plano para poner el punto siguiente donde vas a leer; toca un punto para elegirlo.',
}
/** Lo que flota sobre el plano: se lee sobre cualquier dibujo. */
const CHIP = 'pointer-events-auto inline-flex h-11 items-center rounded-full border border-borde bg-tarjeta/95 text-sm shadow-sm'
const ELEGIDA = 'border-cabecera bg-cabecera text-white'
const NO_ELEGIDA = 'border-borde-fuerte bg-tarjeta text-tinta hover:bg-fondo'
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
  const agregarPuesta = useAlmacen((s) => s.agregarPuesta)

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
  const [nivelElegido, setNivelElegido] = useState<string | null>(null)
  const [moviendoNivel, setMoviendoNivel] = useState(false)
  const [verPendientesNivel, setVerPendientesNivel] = useState(false)

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

  // Los puntos de nivel de esta lámina (vacíos con ids estables mientras no se toquen).
  const nivelesVaciosDelPlano = useMemo(() => nivelesVacios(), [plano?.id])
  const niveles = plano?.nivelesEnPlano ?? nivelesVaciosDelPlano
  const analisisNiveles = useMemo(
    () => analizarPlano(niveles, plano?.calibracion ?? null, proyecto),
    [niveles, plano?.calibracion, proyecto],
  )
  function cambiarNiveles(cambio: (n: NivelesEnPlano) => NivelesEnPlano) {
    if (!plano) return
    const actual = useAlmacen.getState().proyecto.planos?.find((p) => p.id === plano.id)?.nivelesEnPlano ?? niveles
    actualizarPlano(plano.id, { nivelesEnPlano: cambio(actual) })
  }

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
    setMoviendoNivel(false)
    if (nuevo !== 'ver') setSeleccion(null)
  }

  function elegirPlano(id: Id) {
    setPlanoElegidoId(id)
    setSeleccion(null)
    setPuntosCroquis([])
    setPuntosCalibrar([])
    setConfirmarQuitarPlano(false)
    setPaginaPedida(null)
    setNivelElegido(null)
    setMoviendoNivel(false)
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
    if (modo === 'niveles') {
      if (moviendoNivel && nivelElegido) {
        cambiarNiveles((n) => ({ ...n, puntos: n.puntos.map((p) => (p.id === nivelElegido ? { ...p, x: punto.x, y: punto.y } : p)) }))
        setMoviendoNivel(false)
        return
      }
      const tocado = objetivo?.closest?.('[data-punto-nivel]')?.getAttribute('data-punto-nivel')
      if (tocado) {
        setNivelElegido(tocado)
        return
      }
      const id = nuevoIdNivel('nivel')
      // El punto se lee con la última puesta del proyecto; sin ninguna, se crea la primera sobre el primer BM.
      const puestas = proyecto.puestas ?? []
      const bm = proyecto.bms[0]
      const puestaId =
        puestas[puestas.length - 1]?.id ??
        agregarPuesta({ nombre: 'Puesta 1', cotaBM: bm?.cota ?? 100, lecturaAtras: 1.5, bmId: bm?.id ?? null })
      cambiarNiveles((n) => ({
        ...n,
        puntos: [...n.puntos, { id, nombre: siguienteNombre(n.puntos), x: punto.x, y: punto.y, puestaId, lectura: null, salida: false }],
      }))
      setNivelElegido(id)
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

  /** El selector de archivo: en el estado vacío es el botón principal; con planos, una fila del menú «⋯». */
  function importarPlanoBoton(clase: string) {
    return (
      <label className={`${clase} cursor-pointer focus-within:ring-2 focus-within:ring-marca`}>
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
  }

  const avisos = (
    <>
      {/* Siempre montada: los lectores de pantalla anuncian el cambio de texto, no una región que aparece llena. */}
      <div role="status" aria-live="polite" className="empty:hidden">
        {mensaje && mensaje.tipo !== 'error' && (
          <p className={`rounded-[10px] px-3 py-2 text-sm ${mensaje.tipo === 'aviso' ? 'bg-aviso-suave text-aviso' : 'bg-pasa-suave text-pasa'}`}>
            {mensaje.tipo === 'aviso' && <span aria-hidden="true">△ </span>}
            {mensaje.texto}
          </p>
        )}
      </div>
      {mensaje?.tipo === 'error' && (
        <p role="alert" className="rounded-[10px] bg-falla-suave px-3 py-2 text-sm text-falla">
          <span aria-hidden="true">✗ </span>
          {mensaje.texto}
        </p>
      )}
    </>
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
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-marca bg-tarjeta/85 p-4 text-center text-base font-semibold"
        >
          Suelta el plano aquí (DXF o PDF).
        </div>
      )}

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 id={idTitulo} className="text-xl font-bold">
          Plano de obra
        </h2>
        {plano && <p className="text-[13px] text-tenue">{AYUDA_MODO[modo]}</p>}
      </div>

      {!plano ? (
        <>
          {avisos}
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-borde-fuerte bg-tarjeta p-8 text-center">
            <p className="text-lg font-semibold">Todavía no hay planos</p>
            <p className="max-w-md text-sm text-tenue">Importa el plano de la obra en DXF o PDF, o suéltalo aquí. Un DWG se pasa antes a DXF con ODA File Converter.</p>
            {importarPlanoBoton(BOTON_PRINCIPAL)}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* En el celular el plano va de borde a borde. */}
          <div className="-mx-3 min-w-0 sm:mx-0">
            <VisorPlano
              limites={limites}
              claveEncuadre={`${plano.id}:${cargado.estado}:${plano.pagina ?? 1}`}
              alTocar={alTocar}
              enModoPuntos={modo !== 'ver'}
              encima={
                <>
                  <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start gap-2">
                    <label className="pointer-events-auto inline-flex min-w-[6rem] max-w-[70%] flex-1 items-center sm:w-auto sm:flex-none sm:min-w-[14.5rem] rounded-full border border-borde bg-tarjeta/95 px-1 text-sm shadow-sm">
                      <span className="sr-only">Plano a la vista</span>
                      <select
                        value={plano.id}
                        onChange={(e) => elegirPlano(e.target.value)}
                        className="h-11 w-full min-w-0 truncate rounded-full bg-transparent pl-3 pr-1 text-sm font-semibold text-tinta outline-none focus-visible:ring-2 focus-visible:ring-marca"
                      >
                        {planos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre} ({p.formato.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="pointer-events-auto shadow-sm">
                      <MenuMas etiqueta="Más del plano" idMenu={`${idTitulo}-mas-plano`} etiquetaGrupo="Opciones del plano">
                        <div className="flex w-64 max-w-full flex-col gap-1">
                          {importarPlanoBoton(ITEM_MENU)}
                          {cargado.estado === 'pdf' && cargado.pdf.paginas > 1 && (
                            <label className="flex min-h-11 items-center justify-between gap-2 px-3 text-[15px]">
                              Página
                              <select
                                value={paginaPedida ?? plano.pagina ?? 1}
                                onChange={(e) => cambiarPagina(Number(e.target.value))}
                                className="numerico min-h-11 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-sm"
                              >
                                {Array.from({ length: cargado.pdf.paginas }, (_, i) => (
                                  <option key={i + 1} value={i + 1}>
                                    {i + 1}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <div className="mt-1 border-t border-borde px-3 pt-1">
                            {confirmarQuitarPlano ? (
                              <div className="flex flex-col gap-2 py-1">
                                <p className="text-sm">
                                  ¿Quitar «{plano.nombre}»{pistasDelPlano.length === 0 ? '' : pistasDelPlano.length === 1 ? ' y su pista' : ` y sus ${pistasDelPlano.length} pistas`}? Las calles se quedan.
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    className={`${BOTON_SECUNDARIO} border-falla text-falla`}
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
                                </div>
                              </div>
                            ) : (
                              <button type="button" className={ENLACE_PELIGRO} onClick={() => setConfirmarQuitarPlano(true)}>
                                Quitar este plano
                              </button>
                            )}
                          </div>
                        </div>
                      </MenuMas>
                    </div>
                    {plano.calibracion ? (
                      <p
                        title={`Escala: ${textoEscala(plano)}`}
                        className={`${CHIP} ml-auto shrink-0 whitespace-nowrap px-3 font-medium tabular-nums text-tinta`}
                      >
                        {`Escala: ${textoEscalaCorto(plano)}`}
                      </p>
                    ) : (
                      <button
                        type="button"
                        className={`${CHIP} ml-auto border-aviso/40 bg-aviso-suave px-3 font-semibold text-aviso`}
                        onClick={() => cambiarModo('calibrar')}
                      >
                        △ Sin escala
                      </button>
                    )}
                  </div>
                  {nombreElegido && (
                    // En pantalla angosta la ficha queda debajo: este rótulo dice que se abrió y lleva a ella.
                    <button
                      type="button"
                      onClick={() => setLlevarAFicha((n) => n + 1)}
                      className="absolute bottom-[4.5rem] left-3 z-10 min-h-11 max-w-[calc(100%-5rem)] truncate rounded-full bg-cabecera px-4 text-sm font-semibold text-white shadow-lg lg:hidden"
                    >
                      {nombreElegido} elegida · ver ficha ↓
                    </button>
                  )}
                  <div className="absolute bottom-3 left-1/2 z-10 w-[min(30rem,calc(100%-1rem))] -translate-x-1/2 rounded-xl bg-tarjeta/95 shadow-lg">
                    <Segmentado etiqueta="Herramientas del plano" como="group" opciones={MODOS} valor={modo} alCambiar={cambiarModo} anchoCompleto />
                  </div>
                </>
              }
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
                  {(modo === 'niveles' || (modo === 'ver' && niveles.puntos.length > 0)) && (
                    <DibujoNiveles
                      niveles={niveles}
                      analisis={analisisNiveles}
                      elegidoId={modo === 'niveles' ? nivelElegido : null}
                      upp={upp}
                      verPendientes={verPendientesNivel}
                    />
                  )}
                </>
              )}
            </VisorPlano>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            {avisos}
            {cargado.estado === 'cargando' && <p className="text-sm text-tenue">Leyendo el plano…</p>}
            {cargado.estado === 'error' && (
              <p role="alert" className="rounded-[10px] bg-falla-suave px-3 py-2 text-sm text-falla">
                <span aria-hidden="true">✗ </span>
                No se pudo abrir el plano: {cargado.mensaje}
              </p>
            )}
            {cargado.estado === 'sinArchivo' && (
              <p className="rounded-[10px] bg-aviso-suave px-3 py-2 text-sm text-aviso">
                <span aria-hidden="true">△ </span>
                Falta el archivo de este plano (no vino con el proyecto). Vuelve a importarlo; las pistas se ven igual.
              </p>
            )}
            {paginaPedida !== null && (
              <div className="flex flex-col gap-2 rounded-xl bg-aviso-suave p-3 text-sm text-aviso">
                <p>
                  <span aria-hidden="true">△ </span>
                  La escala y las {pistasDelPlano.length} pistas de este plano son de la página {plano.pagina ?? 1}. Otra lámina puede
                  tener otra escala y otras cotas: la página {paginaPedida} se abre como un plano aparte, sin pistas y por calibrar.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <button type="button" className={BOTON_PRINCIPAL} onClick={() => abrirPaginaAparte(paginaPedida)}>
                    Abrir la página {paginaPedida} como plano aparte
                  </button>
                  <button type="button" className={BOTON_SECUNDARIO} onClick={() => setPaginaPedida(null)}>
                    Quedarme en la página {plano.pagina ?? 1}
                  </button>
                </div>
              </div>
            )}

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
            {modo === 'niveles' && (
              <PanelNiveles
                plano={plano}
                niveles={niveles}
                analisis={analisisNiveles}
                elegidoId={nivelElegido}
                alElegir={setNivelElegido}
                cambiar={cambiarNiveles}
                moviendo={moviendoNivel}
                alMover={setMoviendoNivel}
                verPendientes={verPendientesNivel}
                alVerPendientes={setVerPendientesNivel}
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
              <h3 className="text-[15px] font-semibold">Pistas</h3>
              {pistas.length === 0 ? (
                <p className="text-sm text-tenue">
                  Sin pistas todavía: dibuja un croquis{cargado.estado === 'dxf' ? ' o toca un eje del plano' : ''}.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-2">
                  {pistas.map((p) => {
                    const enEste = p.planoId === plano.id
                    const datos = enEste ? datosPorPista.get(p.id) : undefined
                    const fallo = enEste && erroresPorPista.has(p.id)
                    const empinada = datos?.tramos.some((t) => t.empinada)
                    const otroPlano = !enEste ? planos.find((x) => x.id === p.planoId)?.nombre : null
                    const elegida = pistaElegida?.id === p.id
                    return (
                      <li key={p.id} className="min-w-0">
                        <button
                          type="button"
                          aria-pressed={elegida}
                          onClick={() => elegirPista(p.id)}
                          className={`flex min-h-11 w-full flex-col items-start justify-center rounded-lg border px-3 py-1.5 text-left text-sm ${
                            elegida ? ELEGIDA : NO_ELEGIDA
                          }`}
                        >
                          <span className="w-full break-words font-semibold">{p.nombre}</span>
                          <span className={`numerico w-full break-words text-xs ${elegida ? 'text-cabecera-texto' : 'text-tenue'}`}>
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
              <section aria-label="Ejes del DXF" className={`${TARJETA} py-1`}>
                <Plegable titulo="Ejes sin calle" resumen={`${ejes.length} del plano, sin pista todavía`}>
                  <ul className="flex flex-col gap-2 pb-3">
                    {ejes.map(({ eje, indice }) => (
                      <li key={indice}>
                        <button
                          type="button"
                          aria-pressed={ejeElegido?.indice === indice}
                          onClick={() => elegir({ tipo: 'eje', indice })}
                          className={`numerico min-h-11 w-full rounded-lg border px-3 text-left text-sm ${
                            ejeElegido?.indice === indice ? ELEGIDA : NO_ELEGIDA
                          }`}
                        >
                          Eje {indice + 1}
                          {plano.calibracion ? ` · ${(eje.largo * plano.calibracion.metrosPorUnidad).toFixed(1)} m` : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Plegable>
              </section>
            )}

            {cargado.estado === 'dxf' && <PanelCapas vectorial={cargado.vectorial} ocultas={ocultas} alCambiar={cambiarCapa} />}
            {cargado.estado === 'pdf' && (
              <label className={`${TARJETA} flex min-h-11 items-center gap-3 py-2 text-sm`}>
                <input type="checkbox" className="size-5 accent-marca" checked={verCotas} onChange={(e) => setVerCotas(e.target.checked)} />
                <span>Marcar las cotas que leyó la app ({textosCota.length})</span>
              </label>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
