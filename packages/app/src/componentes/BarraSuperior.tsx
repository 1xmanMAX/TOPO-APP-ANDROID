import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAlmacen, type Espacio } from '../estado/almacen'
import BarraArchivo from './BarraArchivo'
import BotonTema from './BotonTema'

/**
 * Íconos de trazo, del mismo color que el texto. Van siempre con su
 * etiqueta al lado o debajo: un ícono solo no se entiende a pleno sol.
 */
function Icono({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

const ICONO: Record<Espacio | 'calcular' | 'archivo', ReactNode> = {
  // Un casco de obra simplificado: la obra entera.
  obra: (
    <Icono>
      <path d="M3 18h18" />
      <path d="M5 18v-3a7 7 0 0 1 14 0v3" />
      <path d="M12 8V5" />
    </Icono>
  ),
  // Dos bordes y el eje discontinuo: una calle.
  calle: (
    <Icono>
      <path d="M6 3 4 21" />
      <path d="M18 3l2 18" />
      <path d="M12 4v3M12 11v3M12 18v2" />
    </Icono>
  ),
  informes: (
    <Icono>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
      <path d="M10 13h6M10 17h6" />
    </Icono>
  ),
  calcular: (
    <Icono>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8" />
      <path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
    </Icono>
  ),
  archivo: (
    <Icono>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Icono>
  ),
}

const ESPACIOS: { espacio: Espacio; texto: string }[] = [
  { espacio: 'obra', texto: 'Obra' },
  { espacio: 'calle', texto: 'Calle' },
  { espacio: 'informes', texto: 'Informes' },
]

/**
 * En el celular los botones van como una barra de pestañas —ícono arriba,
 * etiqueta corta abajo— para que los seis quepan en una fila de 390 px sin
 * bajar de 44 px de alto. Desde sm, ícono y texto en línea.
 */
const BOTON =
  'flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded px-1.5 py-1 text-[11px] leading-none sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm'
const BOTON_INACTIVO = 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
const BOTON_ACTIVO = 'bg-marca font-medium text-white'

/** El menú de archivo: Nuevo, Abrir y Guardar caben en el celular solo si van plegados. */
function MenuArchivo() {
  const [abierto, setAbierto] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    function alTocarFuera(evento: PointerEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false)
    }
    function alPulsarTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('pointerdown', alTocarFuera)
    document.addEventListener('keydown', alPulsarTecla)
    return () => {
      document.removeEventListener('pointerdown', alTocarFuera)
      document.removeEventListener('keydown', alPulsarTecla)
    }
  }, [abierto])

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls="menu-archivo"
        onClick={() => setAbierto((actual) => !actual)}
        className={`${BOTON} ${abierto ? 'bg-slate-100 dark:bg-slate-800' : BOTON_INACTIVO}`}
      >
        {ICONO.archivo}
        <span>Archivo</span>
      </button>
      {/*
        Se oculta y no se desmonta: el selector de archivo vive dentro, y si
        el menú se cerrara solo al tocar «Abrir», se llevaría el selector con
        el archivo a medio elegir.
      */}
      <div
        id="menu-archivo"
        role="group"
        aria-label="Archivo del proyecto"
        hidden={!abierto}
        className="absolute right-0 top-full z-30 mt-1 w-max max-w-[calc(100vw-1rem)] rounded border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900"
      >
        <BarraArchivo />
      </div>
    </div>
  )
}

/**
 * La barra de arriba: los tres espacios (Obra · Calle · Informes) a la
 * izquierda y, a la derecha, la calculadora, el tema y el archivo. Es la
 * misma en el celular y en la laptop; solo cambia cómo se acomoda.
 */
export default function BarraSuperior() {
  const espacio = useAlmacen((s) => s.espacio)
  const irAEspacio = useAlmacen((s) => s.irAEspacio)
  const calculadoraAbierta = useAlmacen((s) => s.calculadoraAbierta)
  const abrirCalculadora = useAlmacen((s) => s.abrirCalculadora)
  const nombre = useAlmacen((s) => s.proyecto.meta.nombre)

  return (
    <header className="relative z-30 flex items-center gap-1 border-b bg-white dark:bg-slate-950 border-slate-200 px-2 py-1 sm:gap-4 sm:px-4 dark:border-slate-800">
      <span className="hidden max-w-48 truncate text-sm font-semibold lg:block">{nombre}</span>
      <nav aria-label="Espacios" className="flex gap-0.5 sm:gap-1">
        {ESPACIOS.map(({ espacio: destino, texto }) => (
          <button
            key={destino}
            type="button"
            aria-pressed={espacio === destino}
            onClick={() => irAEspacio(destino)}
            className={`${BOTON} ${espacio === destino ? BOTON_ACTIVO : BOTON_INACTIVO}`}
          >
            {ICONO[destino]}
            <span>{texto}</span>
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
        <button
          type="button"
          aria-pressed={calculadoraAbierta}
          onClick={() => abrirCalculadora(!calculadoraAbierta)}
          className={`${BOTON} ${calculadoraAbierta ? BOTON_ACTIVO : BOTON_INACTIVO}`}
        >
          {ICONO.calcular}
          <span>Calcular</span>
        </button>
        <div className="flex min-h-11 items-center">
          <BotonTema />
        </div>
        <MenuArchivo />
      </div>
    </header>
  )
}
