import { useTema, type TemaBase } from './tema'
import { BOTON_SECUNDARIO } from './ui'

const TEXTO: Record<TemaBase, string> = { sistema: 'Sistema', oscuro: 'Oscuro', claro: 'Claro' }
const AYUDA: Record<TemaBase, string> = {
  sistema: 'Tema del equipo',
  oscuro: 'Tema oscuro',
  claro: 'Tema claro',
}

/**
 * El tema de base (Sistema → Oscuro → Claro): se cambia poco, así que vive
 * dentro del menú Archivo. El modo sol, que se cambia en obra a cada rato,
 * tiene su propio botón en la cabecera: `InterruptorSol`.
 */
export default function BotonTema() {
  const base = useTema((s) => s.base)
  const ciclarBase = useTema((s) => s.ciclarBase)

  return (
    <button
      type="button"
      aria-label="Cambiar tema"
      title={AYUDA[base]}
      onClick={ciclarBase}
      className={`${BOTON_SECUNDARIO} w-full min-w-11`}
    >
      Tema: {TEXTO[base]}
    </button>
  )
}

/**
 * El modo sol de un toque (lienzo ModoSol): negro, blanco y amarillo de alto
 * contraste para leer a pleno sol. Va siempre en la cabecera.
 */
export function InterruptorSol() {
  const encendido = useTema((s) => s.tema === 'sol')
  const alternarSol = useTema((s) => s.alternarSol)

  return (
    <button
      type="button"
      aria-label="Modo sol"
      aria-pressed={encendido}
      title="Alto contraste negro y amarillo para leer a pleno sol"
      onClick={alternarSol}
      className={`inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border-2 px-2.5 text-sm font-bold ${
        encendido ? 'border-[#FFD60A] bg-[#FFD60A] text-black' : 'border-cabecera-borde text-white hover:bg-cabecera-2'
      }`}
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
        className="shrink-0"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
      </svg>
      <span aria-hidden="true" className="max-sm:hidden md:max-lg:hidden">
        Sol
      </span>
    </button>
  )
}
