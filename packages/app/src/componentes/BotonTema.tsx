import { useEffect, useState } from 'react'

type Tema = 'sistema' | 'oscuro' | 'claro'

const CLAVE = 'topo:tema'
const SIGUIENTE: Record<Tema, Tema> = { sistema: 'oscuro', oscuro: 'claro', claro: 'sistema' }
const TEXTO: Record<Tema, string> = { sistema: 'Sistema', oscuro: 'Oscuro', claro: 'Claro' }

function aplicar(tema: Tema): void {
  const oscuroDelSistema = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  const oscuro = tema === 'oscuro' || (tema === 'sistema' && oscuroDelSistema)
  document.documentElement.classList.toggle('dark', oscuro)
}

export default function BotonTema() {
  const [tema, setTema] = useState<Tema>(() => (localStorage.getItem(CLAVE) as Tema) ?? 'sistema')

  useEffect(() => {
    aplicar(tema)
    if (tema === 'sistema') localStorage.removeItem(CLAVE)
    else localStorage.setItem(CLAVE, tema)
  }, [tema])

  return (
    <button
      type="button"
      aria-label="Cambiar tema"
      onClick={() => setTema(SIGUIENTE[tema])}
      className="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      {TEXTO[tema]}
    </button>
  )
}
