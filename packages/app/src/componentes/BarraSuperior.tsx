import type { ReactNode } from 'react'
import { useAlmacen, type Espacio } from '../estado/almacen'
import BarraArchivo from './BarraArchivo'
import BotonTema, { InterruptorSol } from './BotonTema'
import MenuMas, { PUNTOS } from './MenuMas'
import SelectorCapaActiva, { ChipSelect } from './SelectorCapaActiva'

/**
 * Íconos de trazo del lienzo (Inicio.dc.html), del mismo color que el texto.
 * Van siempre con su etiqueta al lado o debajo: un ícono solo no se entiende
 * a pleno sol.
 */
function Icono({ children, trazo = 2 }: { children: ReactNode; trazo?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-[22px] w-[22px] shrink-0 md:h-[18px] md:w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={trazo}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

type Destino = Espacio | 'calcular'

const ICONO: Record<Destino | 'archivo', ReactNode> = {
  // Una casa: la obra entera.
  obra: (
    <Icono>
      <path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z" />
    </Icono>
  ),
  // Dos bordes y el eje discontinuo: una calle.
  calle: (
    <Icono>
      <path d="M7 3L4 21M17 3l3 18M12 5v3M12 11v3M12 17v3" />
    </Icono>
  ),
  informes: (
    <Icono>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5M10 13h6M10 17h6" />
    </Icono>
  ),
  calcular: (
    <Icono trazo={1.8}>
      <rect x="5" y="2.5" width="14" height="19" rx="2" />
      <path d="M8 6.5h8M8 11h2M12 11h2M8 14.5h2M12 14.5h2M8 18h2M12 18h2M16 11v7" />
    </Icono>
  ),
  archivo: (
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
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
}

/** El logo del lienzo: dos curvas de nivel, la naranja y una blanca más tenue. */
function Logo() {
  return (
    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 36 36" fill="none" strokeWidth={2.4} className="shrink-0">
      <path d="M4 26c6-8 10-2 16-8s8-10 12-10" stroke="#F97316" />
      <path d="M4 31c7-6 12-1 18-6s8-8 10-8" stroke="#FFFFFF" opacity={0.55} />
    </svg>
  )
}

/**
 * El orden en el DOM es Obra, Calle, Informes, Calcular (el de los guiones y
 * el lector de pantalla). En la barra de abajo del celular Calcular va antes
 * que Informes, como en Inicio.dc.html: se usa más en obra.
 */
const DESTINOS: { destino: Destino; texto: string; orden: string }[] = [
  { destino: 'obra', texto: 'Obra', orden: '' },
  { destino: 'calle', texto: 'Calle', orden: '' },
  { destino: 'informes', texto: 'Informes', orden: 'max-md:order-4' },
  { destino: 'calcular', texto: 'Calcular', orden: 'max-md:order-3 md:ml-2 md:border md:border-cabecera-borde' },
]

const BOTON_NAV =
  'flex min-h-12 flex-col items-center justify-center gap-0.5 text-xs md:min-h-11 md:min-w-11 md:flex-row md:gap-2 md:rounded-[9px] md:px-2 md:text-sm lg:px-3'
const NAV_INACTIVO = 'text-tenue md:text-cabecera-texto md:hover:bg-cabecera-2'
const NAV_ACTIVO =
  'font-semibold text-marca md:bg-cabecera-2 md:text-white md:shadow-[inset_0_-2px_0_var(--color-marca-viva)]'

/** La calle y su capa, en chips oscuros. Sin calles, el aviso de dónde crearlas. */
function SelectoresCalle() {
  const calles = useAlmacen((s) => s.proyecto.calles)
  const calleActivaId = useAlmacen((s) => s.calleActivaId)
  const activarCalle = useAlmacen((s) => s.activarCalle)
  const calle = calles.find((c) => c.id === calleActivaId) ?? null

  if (calles.length === 0) {
    return <p className="min-w-0 flex-1 truncate text-sm text-cabecera-tenue md:flex-none">Todavía no hay calles: créalas en Obra.</p>
  }

  // En el celular, la calle y la capa a partes iguales: ninguna pasa de la mitad.
  const celda = 'max-md:max-w-[50%] max-md:flex-1 max-md:basis-0'
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none md:gap-3">
      <ChipSelect
        etiqueta="Calle activa"
        valor={calleActivaId ?? ''}
        alCambiar={(valor) => activarCalle(valor || null)}
        claseTexto="text-[17px] font-bold"
        className={`${celda} md:w-40 lg:w-56`}
      >
        {calleActivaId === null && <option value="">Elige una calle</option>}
        {calles.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </ChipSelect>
      {calle && <SelectorCapaActiva calle={calle} className={`${celda} md:w-48 lg:w-64`} />}
    </div>
  )
}

/**
 * La cabecera oscura, en todos los tamaños.
 *
 * En el celular, arriba van el nombre de la obra (o, en Calle, la calle y la
 * capa), el modo sol y el «⋯» de Archivo; los cuatro espacios van en la barra
 * de abajo, al alcance del pulgar. Desde md, todo en una fila: logo, obra,
 * calle y capa, los espacios, el sol y Archivo.
 *
 * La barra de abajo es el mismo <nav> que la fila de la laptop (fixed por
 * debajo de md): un solo elemento, para que los guiones no vean dos.
 */
export default function BarraSuperior() {
  const espacio = useAlmacen((s) => s.espacio)
  const irAEspacio = useAlmacen((s) => s.irAEspacio)
  const calculadoraAbierta = useAlmacen((s) => s.calculadoraAbierta)
  const abrirCalculadora = useAlmacen((s) => s.abrirCalculadora)
  const nombre = useAlmacen((s) => s.proyecto.meta.nombre)
  const enCalle = espacio === 'calle'

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 bg-cabecera px-3 text-white md:h-16 md:gap-2 md:px-4 lg:gap-4">
      {/*
        En el celular el logo y la obra se ven en Obra e Informes. En Calle
        manda la calle (como en Calle.dc.html): el nombre de la obra queda
        solo para el lector de pantalla, y sigue en el texto de la cabecera.
      */}
      <div className={`flex shrink-0 items-center gap-2 ${enCalle ? 'max-md:hidden' : ''}`}>
        <Logo />
        <span className="text-lg font-bold max-lg:hidden">Topo</span>
      </div>
      <span
        className={`min-w-0 truncate ${
          enCalle
            ? 'sr-only'
            : 'text-[17px] font-bold max-md:flex-1 md:max-w-56 md:text-sm md:font-normal md:text-cabecera-tenue'
        }`}
      >
        {nombre}
      </span>
      {enCalle && <SelectoresCalle />}

      <div className="flex-1 max-md:hidden" />

      <nav
        aria-label="Espacios"
        className="fixed inset-x-0 bottom-0 z-30 grid h-[72px] grid-cols-4 border-t border-borde bg-tarjeta pb-[env(safe-area-inset-bottom)] md:static md:flex md:h-auto md:items-center md:gap-1 md:border-0 md:bg-transparent md:pb-0"
      >
        {DESTINOS.map(({ destino, texto, orden }) => {
          const esCalcular = destino === 'calcular'
          const pulsado = esCalcular ? calculadoraAbierta : espacio === destino
          // Con la calculadora abierta, ella es la que se ve activa; el espacio
          // de debajo sigue pulsado (aria-pressed), pero sin resaltar.
          const resaltado = esCalcular ? calculadoraAbierta : pulsado && !calculadoraAbierta
          return (
            <button
              key={destino}
              type="button"
              aria-pressed={pulsado}
              onClick={() => (esCalcular ? abrirCalculadora(!calculadoraAbierta) : irAEspacio(destino))}
              className={`${BOTON_NAV} ${orden} ${resaltado ? NAV_ACTIVO : NAV_INACTIVO}`}
            >
              {ICONO[destino]}
              {/* Entre md y lg (tablet) no caben los textos junto a la calle y la capa: quedan para el lector. */}
              <span className="md:max-lg:sr-only">{texto}</span>
            </button>
          )
        })}
      </nav>

      <InterruptorSol />
      <MenuMas
        etiqueta="Archivo"
        textoVisible="Archivo"
        claseTexto="hidden lg:inline"
        icono={
          <>
            <span className="contents md:hidden">{PUNTOS}</span>
            <span className="contents max-md:hidden">{ICONO.archivo}</span>
          </>
        }
        idMenu="menu-archivo"
        etiquetaGrupo="Archivo del proyecto"
        tono="oscuro"
      >
        <div className="flex flex-col gap-2">
          <BarraArchivo />
          <BotonTema />
        </div>
      </MenuMas>
    </header>
  )
}
