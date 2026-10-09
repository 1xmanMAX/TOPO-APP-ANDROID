import { useEffect, useRef, useState } from 'react'
import { leerBorrador, type Borrador } from './archivo/autoguardado'
import { useAutoguardado } from './archivo/useAutoguardado'
import BarraSuperior from './componentes/BarraSuperior'
import AvisoLinea from './componentes/AvisoLinea'
import { NavegacionCalle, NavegacionObra, NavegacionPantallasCalle } from './componentes/SubNavegacion'
import { BOTON_ICONO, BOTON_PRINCIPAL, BOTON_SECUNDARIO } from './componentes/ui'
import { useAlmacen } from './estado/almacen'
import PantallaAnalisis from './vistas/analisis/PantallaAnalisis'
import PantallaNiveles from './vistas/niveles/PantallaNiveles'
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
  if (pantalla === 'niveles') return <PantallaNiveles />
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
  const nuevoProyecto = useAlmacen((s) => s.nuevoProyecto)
  // El trabajo guardado en el teléfono (o el navegador) se abre solo al
  // volver: antes se preguntaba «Recuperar / Descartar» con la pantalla
  // bloqueada, y quien no lo tocaba veía un proyecto vacío y creía perdido
  // su plano. Queda un aviso, sin bloquear nada, por si quiere empezar otro.
  const [recuperado, setRecuperado] = useState<Borrador | null>(null)
  const [confirmarNuevo, setConfirmarNuevo] = useState(false)
  const [revisado, setRevisado] = useState(false)
  const falloAutoguardado = useAutoguardado(revisado)

  // Si se abre otro .topo o se pulsa Nuevo, el aviso ya no viene al caso.
  const cargas = useAlmacen((s) => s.cargas)
  const cargasAlRecuperar = useRef<number | null>(null)
  useEffect(() => {
    if (cargasAlRecuperar.current !== null && cargas !== cargasAlRecuperar.current) setRecuperado(null)
  }, [cargas])

  useEffect(() => {
    let vigente = true
    const cargasAlEmpezar = useAlmacen.getState().cargas
    leerBorrador()
      .then((encontrado) => {
        // Si mientras se leía ya se abrió otro archivo, se respeta lo abierto.
        if (!vigente || !encontrado || useAlmacen.getState().cargas !== cargasAlEmpezar) return
        cargarProyecto(encontrado.proyecto, encontrado.archivosDePlano)
        cargasAlRecuperar.current = useAlmacen.getState().cargas
        setRecuperado(encontrado)
      })
      .catch(() => {})
      .finally(() => vigente && setRevisado(true))
    return () => {
      vigente = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {recuperado && (
        <div className="flex flex-wrap items-center gap-2 border-b border-borde bg-fondo px-3 py-2 md:px-4">
          <p role="status" className="min-w-0 flex-1 text-sm text-tenue">
            <span aria-hidden="true">✓ </span>
            Abrí tu trabajo guardado del{' '}
            {new Date(recuperado.guardado).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} —{' '}
            {recuperado.proyecto.meta.nombre}
            {(recuperado.proyecto.planos?.length ?? 0) > 0 ? `, con ${recuperado.proyecto.planos!.length === 1 ? 'su plano' : `sus ${recuperado.proyecto.planos!.length} planos`}` : ''}.
          </p>
          {confirmarNuevo ? (
            <>
              <button
                type="button"
                onClick={() => {
                  nuevoProyecto()
                  setConfirmarNuevo(false)
                }}
                className={`${BOTON_SECUNDARIO} border-falla text-falla`}
              >
                Sí, empezar de cero
              </button>
              <button type="button" onClick={() => setConfirmarNuevo(false)} className={BOTON_SECUNDARIO}>
                No
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setConfirmarNuevo(true)} className={BOTON_SECUNDARIO}>
                Empezar uno nuevo
              </button>
              <button type="button" aria-label="Cerrar el aviso" onClick={() => setRecuperado(null)} className={BOTON_SECUNDARIO}>
                ✕
              </button>
            </>
          )}
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
        className={`flex min-h-0 flex-1 flex-col ${calculadoraAbierta ? 'max-md:hidden md:pr-96' : ''}`}
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
