import { useEffect, useRef, useState } from 'react'
import { borrarBorrador, contarLecturas, leerBorrador, type Borrador } from './archivo/autoguardado'
import { useAutoguardado } from './archivo/useAutoguardado'
import BarraSuperior from './componentes/BarraSuperior'
import AvisoLinea from './componentes/AvisoLinea'
import { NavegacionCalle, NavegacionObra, NavegacionPantallasCalle } from './componentes/SubNavegacion'
import { BOTON_ICONO, BOTON_PRINCIPAL, BOTON_SECUNDARIO } from './componentes/ui'
import { useAlmacen } from './estado/almacen'
import PantallaAnalisis from './vistas/analisis/PantallaAnalisis'
import EspacioCalle from './vistas/calle/EspacioCalle'
import PantallaCierre from './vistas/cierre/PantallaCierre'
import PanelCalculadora from './vistas/herramientas/PanelCalculadora'
import EspacioInformes from './vistas/informes/EspacioInformes'
import EspacioObra from './vistas/obra/EspacioObra'
import PantallaGuia from './vistas/planificador/PantallaGuia'
import PantallaPlanificar from './vistas/planificador/PantallaPlanificar'
import EspacioPlano from './vistas/plano/EspacioPlano'

/** Obra › Calles u Obra › Plano. */
function Obra() {
  const subObra = useAlmacen((s) => s.subObra)
  return subObra === 'calles' ? <EspacioObra /> : <EspacioPlano />
}

/** Calle: los modos o, encima de ellos, la pantalla de la calle si hay una abierta. */
function Calle() {
  const pantalla = useAlmacen((s) => s.pantallaCalle)
  if (pantalla === 'analisis') return <PantallaAnalisis />
  if (pantalla === 'cierre') return <PantallaCierre />
  if (pantalla === 'planificar') return <PantallaPlanificar />
  if (pantalla === 'guia') return <PantallaGuia />
  return <EspacioCalle />
}

/**
 * La calculadora se abre encima de cualquier pantalla sin taparla del todo:
 * en el celular ocupa todo lo que hay bajo la barra de arriba (la pantalla de
 * debajo se esconde mientras tanto, y la barra sigue a mano: antes la barra le
 * tapaba «Cerrar calculadora»); en la laptop queda a la derecha. No es
 * modal a propósito: se calcula mirando la libreta.
 */
function Calculadora() {
  const abrirCalculadora = useAlmacen((s) => s.abrirCalculadora)

  useEffect(() => {
    function alPulsarTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') abrirCalculadora(false)
    }
    document.addEventListener('keydown', alPulsarTecla)
    return () => document.removeEventListener('keydown', alPulsarTecla)
  }, [abrirCalculadora])

  return (
    <aside
      role="dialog"
      aria-label="Calculadora de campo"
      className="relative min-h-0 flex-1 overflow-auto bg-fondo md:fixed md:top-16 md:right-0 md:bottom-0 md:z-20 md:w-96 md:flex-none md:border-l md:border-borde md:shadow-2xl"
    >
      <button
        type="button"
        aria-label="Cerrar calculadora"
        onClick={() => abrirCalculadora(false)}
        className={`${BOTON_ICONO} absolute top-3 right-3 z-10`}
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <PanelCalculadora />
    </aside>
  )
}

export default function App() {
  const espacio = useAlmacen((s) => s.espacio)
  const calculadoraAbierta = useAlmacen((s) => s.calculadoraAbierta)
  const cargarProyecto = useAlmacen((s) => s.cargarProyecto)
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [revisado, setRevisado] = useState(false)
  const falloAutoguardado = useAutoguardado(revisado && borrador === null)

  // Si mientras se decide se abre otro .topo o se pulsa Nuevo, el borrador ya
  // no es la duda: Max eligió trabajar en otra cosa. El aviso se quita y el
  // autoguardado se enciende; si no, lo que haga después no se guardaría y
  // un «Recuperar» pulsado tarde pisaría el proyecto abierto.
  const cargas = useAlmacen((s) => s.cargas)
  const cargasAlEmpezar = useRef(cargas)
  useEffect(() => {
    if (cargas !== cargasAlEmpezar.current) setBorrador(null)
  }, [cargas])

  useEffect(() => {
    leerBorrador()
      .then((encontrado) => setBorrador(encontrado))
      .catch(() => setBorrador(null))
      .finally(() => setRevisado(true))
  }, [])

  return (
    // En el celular la barra de los espacios va fija abajo (72 px): el
    // contenido y los pies pegados (la Guía) terminan encima de ella.
    <div className="flex h-full flex-col max-md:pb-[72px]">
      <BarraSuperior />
      {falloAutoguardado && (
        <div className="border-b border-borde bg-fondo px-3 py-2 md:px-4">
          <AvisoLinea tono="aviso">{falloAutoguardado}</AvisoLinea>
        </div>
      )}
      {borrador && (
        <div className="flex flex-col gap-2 border-b border-borde bg-fondo px-3 py-3 md:px-4">
          <AvisoLinea tono="aviso">
            Recuperé tu trabajo del{' '}
            {new Date(borrador.guardado).toLocaleString('es-PE', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            — {borrador.proyecto.meta.nombre}, {contarLecturas(borrador.proyecto)} lecturas. Elige
            antes de seguir: lo de abajo no se guarda hasta que decidas. Si abres otro archivo, este
            borrador se descarta.
          </AvisoLinea>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                cargarProyecto(borrador.proyecto, borrador.archivosDePlano)
                setBorrador(null)
              }}
              className={BOTON_PRINCIPAL}
            >
              Recuperar
            </button>
            <button
              type="button"
              onClick={() => {
                void borrarBorrador()
                setBorrador(null)
              }}
              className={BOTON_SECUNDARIO}
            >
              Descartar
            </button>
          </div>
        </div>
      )}
      {/*
        La banda de los modos va fuera de lo que se desplaza: la libreta
        enfoca su campo al abrirse y, si la banda se desplazara con ella,
        quedaría fuera de la vista justo cuando hace falta cambiar de modo.
        Las pantallas de la calle (Análisis, Cierre, Planificar) sí van
        dentro de <main>: se desplazan con el contenido.
      */}
      {/* En la laptop, con la calculadora abierta, la pantalla se corre a su izquierda en vez de quedar tapada. */}
      {/*
        Mientras el aviso está a la vista, lo de abajo no se edita: no se
        guardaría y se perdería al pulsar Recuperar.
      */}
      <div
        inert={borrador !== null}
        className={`flex min-h-0 flex-1 flex-col ${calculadoraAbierta ? 'max-md:hidden md:pr-96' : ''} ${borrador ? 'opacity-40' : ''}`}
      >
        {espacio === 'obra' && <NavegacionObra />}
        {espacio === 'calle' && <NavegacionCalle />}
        <main className="flex-1 overflow-auto">
          {espacio === 'calle' && <NavegacionPantallasCalle />}
          {espacio === 'obra' && <Obra />}
          {espacio === 'calle' && <Calle />}
          {espacio === 'informes' && <EspacioInformes />}
        </main>
      </div>
      {calculadoraAbierta && <Calculadora />}
    </div>
  )
}
