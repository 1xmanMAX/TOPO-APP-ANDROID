import { useEffect, useState } from 'react'

type Tema = 'sistema' | 'oscuro' | 'claro' | 'sol'

const CLAVE = 'topo:tema'
const TEMAS: Tema[] = ['sistema', 'oscuro', 'claro', 'sol']
const SIGUIENTE: Record<Tema, Tema> = { sistema: 'oscuro', oscuro: 'claro', claro: 'sol', sol: 'sistema' }
const TEXTO: Record<Tema, string> = { sistema: 'Sistema', oscuro: 'Oscuro', claro: 'Claro', sol: 'Sol' }
const AYUDA: Record<Tema, string> = {
  sistema: 'Tema del equipo',
  oscuro: 'Tema oscuro',
  claro: 'Tema claro',
  sol: 'Modo sol: alto contraste negro y amarillo, para leer la pantalla a pleno sol',
}

/** Lo guardado puede no ser un tema válido: una versión anterior, o basura. */
function temaGuardado(): Tema {
  const guardado = localStorage.getItem(CLAVE)
  return TEMAS.includes(guardado as Tema) ? (guardado as Tema) : 'sistema'
}

/**
 * El modo sol se monta sobre el oscuro: lleva `dark` (fondos oscuros en toda
 * la app sin tocar cada pantalla) y además `sol`, que en estilos.css cambia la
 * paleta por negro y amarillo de alto contraste.
 */
function aplicar(tema: Tema): void {
  const oscuroDelSistema = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  const oscuro = tema === 'oscuro' || tema === 'sol' || (tema === 'sistema' && oscuroDelSistema)
  document.documentElement.classList.toggle('dark', oscuro)
  document.documentElement.classList.toggle('sol', tema === 'sol')
}

export default function BotonTema() {
  const [tema, setTema] = useState<Tema>(temaGuardado)

  useEffect(() => {
    aplicar(tema)
    if (tema === 'sistema') localStorage.removeItem(CLAVE)
    else localStorage.setItem(CLAVE, tema)
  }, [tema])

  useEffect(() => {
    // En modo Sistema hay que seguir escuchando: en obra se pasa del día a la
    // noche sin cerrar la app, y el equipo cambia de tema solo.
    if (tema !== 'sistema') return

    const consulta = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!consulta) return

    const alCambiarElSistema = () => aplicar('sistema')
    consulta.addEventListener('change', alCambiarElSistema)
    return () => consulta.removeEventListener('change', alCambiarElSistema)
  }, [tema])

  return (
    <button
      type="button"
      aria-label="Cambiar tema"
      title={AYUDA[tema]}
      onClick={() => setTema(SIGUIENTE[tema])}
      className="min-h-11 min-w-11 rounded px-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      {tema === 'sol' && <span aria-hidden="true">☀ </span>}
      {TEXTO[tema]}
    </button>
  )
}
