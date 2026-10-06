import { useEffect, useRef, useState } from 'react'
import { borrarBorrador, contarLecturas, leerBorrador, type Borrador } from './archivo/autoguardado'
import { useAutoguardado } from './archivo/useAutoguardado'
import BarraSuperior from './componentes/BarraSuperior'
import { NavegacionCalle, NavegacionObra } from './componentes/SubNavegacion'
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
      className="min-h-0 flex-1 overflow-auto border-slate-200 bg-white sm:fixed sm:top-14 sm:right-0 sm:bottom-0 sm:z-20 sm:w-96 sm:flex-none sm:border-l sm:shadow-2xl dark:border-slate-800 dark:bg-slate-950"
    >
      <div className="flex justify-end p-2">
        <button
          type="button"
          onClick={() => abrirCalculadora(false)}
          className="min-h-11 rounded px-3 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Cerrar calculadora
        </button>
      </div>
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
    <div className="flex h-full flex-col">
      <BarraSuperior />
      {falloAutoguardado && (
        <p className="border-b border-aviso bg-aviso/10 px-4 py-2 text-sm text-aviso">
          {falloAutoguardado}
        </p>
      )}
      {borrador && (
        <div className="flex flex-wrap items-center gap-3 border-b border-aviso bg-aviso/10 px-4 py-2 text-sm">
          <span>
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
          </span>
          <button
            type="button"
            onClick={() => {
              cargarProyecto(borrador.proyecto, borrador.archivosDePlano)
              setBorrador(null)
            }}
            className="min-h-11 rounded bg-marca px-3 py-1 text-white"
          >
            Recuperar
          </button>
          <button
            type="button"
            onClick={() => {
              void borrarBorrador()
              setBorrador(null)
            }}
            className="min-h-11 rounded px-3 py-1"
          >
            Descartar
          </button>
        </div>
      )}
      {/*
        La sub-barra va fuera de lo que se desplaza: la libreta enfoca su
        campo al abrirse y, si la sub-barra se desplazara con ella, quedaría
        fuera de la vista justo cuando hace falta cambiar de modo.
      */}
      {/* En la laptop, con la calculadora abierta, la pantalla se corre a su izquierda en vez de quedar tapada. */}
      {/*
        Mientras el aviso está a la vista, lo de abajo no se edita: no se
        guardaría y se perdería al pulsar Recuperar.
      */}
      <div
        inert={borrador !== null}
        className={`flex min-h-0 flex-1 flex-col ${calculadoraAbierta ? 'max-sm:hidden sm:pr-96' : ''} ${borrador ? 'opacity-40' : ''}`}
      >
        {espacio === 'obra' && <NavegacionObra />}
        {espacio === 'calle' && <NavegacionCalle />}
        <main className="flex-1 overflow-auto">
          {espacio === 'obra' && <Obra />}
          {espacio === 'calle' && <Calle />}
          {espacio === 'informes' && <EspacioInformes />}
        </main>
      </div>
      {calculadoraAbierta && <Calculadora />}
    </div>
  )
}
