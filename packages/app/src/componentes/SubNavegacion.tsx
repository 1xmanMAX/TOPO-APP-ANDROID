import type { ReactNode } from 'react'
import { useAlmacen, type ModoCalle, type PantallaCalle, type SubObra } from '../estado/almacen'
import Segmentado from './Segmentado'

const SUB_OBRA: { valor: SubObra; texto: string }[] = [
  { valor: 'calles', texto: 'Calles' },
  { valor: 'plano', texto: 'Plano' },
]

/** Dentro de Obra: la lista de calles o el plano de obra. */
export function NavegacionObra() {
  const subObra = useAlmacen((s) => s.subObra)
  const irASubObra = useAlmacen((s) => s.irASubObra)

  return (
    <div className="bg-fondo px-4 pt-3">
      <Segmentado
        etiqueta="Pantallas de la obra"
        como="nav"
        tono="claro"
        opciones={SUB_OBRA}
        valor={subObra}
        alCambiar={irASubObra}
        className="w-full sm:w-80"
      />
    </div>
  )
}

function IconoModo({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
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

/** Los íconos de Calle.dc.html: lápiz, lupa con visto y diana. */
const MODOS: { valor: ModoCalle; texto: string; icono: ReactNode }[] = [
  {
    valor: 'medir',
    texto: 'Medir',
    icono: (
      <IconoModo>
        <path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3" />
      </IconoModo>
    ),
  },
  {
    valor: 'revisar',
    texto: 'Revisar',
    icono: (
      <IconoModo>
        <circle cx="11" cy="11" r="6" />
        <path d="M20 20l-4.5-4.5M8.5 11l2 2 3.5-4" />
      </IconoModo>
    ),
  },
  {
    valor: 'replantear',
    texto: 'Replantear',
    icono: (
      <IconoModo>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      </IconoModo>
    ),
  },
]

/**
 * Dentro de Calle: los tres modos sobre la misma vista, en la banda oscura
 * pegada a la cabecera. Va fuera de lo que se desplaza: la libreta enfoca su
 * campo al abrirse y, si la banda se desplazara con ella, quedaría fuera de
 * la vista justo cuando hace falta cambiar de modo. La calle y la capa están
 * en la cabecera; Análisis, Cierre y Planificar, en `NavegacionPantallasCalle`.
 */
export function NavegacionCalle() {
  const modoCalle = useAlmacen((s) => s.modoCalle)
  const pantallaCalle = useAlmacen((s) => s.pantallaCalle)
  const fijarModoCalle = useAlmacen((s) => s.fijarModoCalle)

  return (
    <div className="flex justify-center bg-cabecera px-3 pb-2 md:border-t md:border-cabecera-2 md:px-4 md:py-2">
      <Segmentado
        etiqueta="Modos de la calle"
        como="nav"
        tono="oscuro"
        opciones={MODOS}
        valor={pantallaCalle === null ? modoCalle : null}
        alCambiar={fijarModoCalle}
        className="w-full md:w-auto"
      />
    </div>
  )
}

const PANTALLAS: { pantalla: Exclude<PantallaCalle, 'guia'>; texto: string }[] = [
  { pantalla: 'niveles', texto: 'Niveles' },
  { pantalla: 'analisis', texto: 'Análisis' },
  { pantalla: 'cierre', texto: 'Cierre' },
  { pantalla: 'planificar', texto: 'Planificar' },
]

const TEXTO_MODO: Record<ModoCalle, string> = { medir: 'Medir', revisar: 'Revisar', replantear: 'Replantear' }

/**
 * Las pantallas de la calle (Niveles, Análisis, Cierre, Planificar), como pestañas de
 * texto. Va dentro de <main>, al principio: se desplaza con el contenido y no
 * le quita alto fijo a la libreta en el celular. Con una pantalla abierta, lo
 * primero es volver al modo en el que se estaba.
 */
export function NavegacionPantallasCalle() {
  const modoCalle = useAlmacen((s) => s.modoCalle)
  const pantallaCalle = useAlmacen((s) => s.pantallaCalle)
  const abrirPantallaCalle = useAlmacen((s) => s.abrirPantallaCalle)
  const hayVolver = pantallaCalle !== null

  return (
    <nav
      aria-label="Pantallas de la calle"
      className={`flex items-center gap-1 border-b border-borde bg-fondo px-3 md:px-4 ${
        hayVolver ? 'max-md:overflow-x-auto' : 'max-md:grid max-md:grid-cols-4'
      }`}
    >
      {hayVolver && (
        <button
          type="button"
          aria-label={`Volver a ${TEXTO_MODO[modoCalle]}`}
          onClick={() => abrirPantallaCalle(null)}
          className="mr-auto inline-flex min-h-11 min-w-11 shrink-0 items-center gap-1 pr-2 text-[15px] font-semibold whitespace-nowrap text-tinta md:mr-2"
        >
          <span aria-hidden="true" className="text-xl leading-none">
            ‹
          </span>
          {TEXTO_MODO[modoCalle]}
        </button>
      )}
      {PANTALLAS.map(({ pantalla, texto }) => {
        // La guía de campo es parte del planificador: con ella abierta, Planificar sigue marcado.
        const activo = pantallaCalle === pantalla || (pantalla === 'planificar' && pantallaCalle === 'guia')
        return (
          <button
            key={pantalla}
            type="button"
            aria-pressed={activo}
            onClick={() => abrirPantallaCalle(pantalla)}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-3 text-[15px] font-semibold whitespace-nowrap max-md:px-1 max-[379px]:text-[14px] ${
              activo ? 'border-marca text-marca' : 'border-transparent text-tenue hover:text-tinta'
            }`}
          >
            {texto}
          </button>
        )
      })}
    </nav>
  )
}
