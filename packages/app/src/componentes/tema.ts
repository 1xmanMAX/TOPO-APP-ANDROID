import { create } from 'zustand'

export type Tema = 'sistema' | 'oscuro' | 'claro' | 'sol'
export type TemaBase = Exclude<Tema, 'sol'>

const CLAVE = 'topo:tema'
const CLAVE_BASE = 'topo:tema-base'
const TEMAS: Tema[] = ['sistema', 'oscuro', 'claro', 'sol']
const BASES: TemaBase[] = ['sistema', 'oscuro', 'claro']
const SIGUIENTE_BASE: Record<TemaBase, TemaBase> = { sistema: 'oscuro', oscuro: 'claro', claro: 'sistema' }

interface EstadoTema {
  /** Lo que se ve: la base o, encima de ella, el modo sol. */
  tema: Tema
  /** El tema al que se vuelve al apagar el sol. */
  base: TemaBase
  /** Enciende el modo sol (guardando la base) o vuelve a la base. Un toque. */
  alternarSol(): void
  /** Sistema → Oscuro → Claro → Sistema. Apaga el sol. */
  ciclarBase(): void
  /** Vuelve a leer lo guardado y lo aplica. Al arrancar, y en las pruebas. */
  cargar(): void
}

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}

/** Sin almacenamiento (ventana privada, sitio bloqueado) el tema vale igual: solo no se recuerda. */
function guardar(tema: Tema, base: TemaBase): void {
  try {
    if (tema === 'sistema') localStorage.removeItem(CLAVE)
    else localStorage.setItem(CLAVE, tema)
    if (base === 'sistema') localStorage.removeItem(CLAVE_BASE)
    else localStorage.setItem(CLAVE_BASE, base)
  } catch {
    /* no se recuerda, pero se aplica */
  }
}

/** Lo guardado puede no ser un tema válido: una versión anterior, o basura. */
function guardado(): { tema: Tema; base: TemaBase } {
  const t = leer(CLAVE)
  const tema = TEMAS.includes(t as Tema) ? (t as Tema) : 'sistema'
  const b = leer(CLAVE_BASE)
  const base = BASES.includes(b as TemaBase) ? (b as TemaBase) : tema === 'sol' ? 'sistema' : (tema as TemaBase)
  return { tema, base }
}

function consultaOscuro(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia('(prefers-color-scheme: dark)') ?? null
}

/**
 * El modo sol se monta sobre el oscuro: lleva `dark` (fondos oscuros en las
 * pantallas que aún usan `dark:`) y además `sol`, que en estilos.css cambia
 * la paleta por negro, blanco y amarillo.
 */
function aplicar(tema: Tema): void {
  if (typeof document === 'undefined') return
  const oscuroDelSistema = consultaOscuro()?.matches ?? false
  const oscuro = tema === 'oscuro' || tema === 'sol' || (tema === 'sistema' && oscuroDelSistema)
  document.documentElement.classList.toggle('dark', oscuro)
  document.documentElement.classList.toggle('sol', tema === 'sol')
}

/*
 * En la base Sistema hay que seguir escuchando: en obra se pasa del día a la
 * noche sin cerrar la app, y el equipo cambia de tema solo. Con otra base,
 * el equipo deja de mandar.
 */
let consultaEscuchada: MediaQueryList | null = null
function alCambiarElSistema() {
  aplicar(useTema.getState().tema)
}
function sincronizarOyente(base: TemaBase): void {
  if (consultaEscuchada) {
    consultaEscuchada.removeEventListener?.('change', alCambiarElSistema)
    consultaEscuchada = null
  }
  if (base !== 'sistema') return
  const consulta = consultaOscuro()
  if (!consulta?.addEventListener) return
  consulta.addEventListener('change', alCambiarElSistema)
  consultaEscuchada = consulta
}

function fijar(tema: Tema, base: TemaBase) {
  guardar(tema, base)
  aplicar(tema)
  sincronizarOyente(base)
}

export const useTema = create<EstadoTema>((set, get) => ({
  ...guardado(),
  alternarSol() {
    const { tema, base } = get()
    const nuevo: Tema = tema === 'sol' ? base : 'sol'
    set({ tema: nuevo })
    fijar(nuevo, base)
  },
  ciclarBase() {
    const { base } = get()
    const nueva = SIGUIENTE_BASE[base]
    set({ tema: nueva, base: nueva })
    fijar(nueva, nueva)
  },
  cargar() {
    const { tema, base } = guardado()
    set({ tema, base })
    aplicar(tema)
    sincronizarOyente(base)
  },
}))

// Al arrancar, lo guardado se aplica antes de pintar nada.
useTema.getState().cargar()
