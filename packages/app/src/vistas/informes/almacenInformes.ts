import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { TipoInforme } from './adaptadores'

/**
 * Lo que la pantalla de Informes recuerda entre visitas: qué informe, el
 * tramo tal como se escribió, las opciones, el supervisor y el logo. Ir a
 * Obra o a Calle desmonta la pantalla; sin esto, el topógrafo tendría que
 * volver a escribir el supervisor y subir el logo cada vez.
 *
 * La calle y la jornada NO se recuerdan aquí: siguen a la calle activa, que
 * es la que se acaba de medir o revisar.
 *
 * Se guarda también en el navegador (hasta que los datos del proyecto
 * tengan supervisor y logo). Si el navegador no deja guardar —ventana
 * privada, sin espacio—, funciona igual, solo en memoria.
 */
export interface LogoInforme {
  /** Cambia con cada logo: lo que decide si hay que rehacer el PDF, sin comparar la imagen entera. */
  id: string
  /** dataURL PNG o JPEG, ya reducido. */
  dataUrl: string
}

export interface PreferenciasInformes {
  tipo: TipoInforme
  desde: string
  hasta: string
  vistaAtras: string
  estacion: string
  conNotas: boolean
  firmas: boolean
  supervisor: string
  logo: LogoInforme | null
}

interface EstadoInformes extends PreferenciasInformes {
  cambiar(cambios: Partial<PreferenciasInformes>): void
  olvidar(): void
}

export const PREFERENCIAS_INICIALES: PreferenciasInformes = {
  tipo: 'protocolo',
  desde: '',
  hasta: '',
  vistaAtras: '',
  estacion: '',
  conNotas: true,
  firmas: true,
  supervisor: '',
  logo: null,
}

/** localStorage que nunca rompe: en una ventana privada o sin permiso, no guarda y ya. */
const almacenSeguro: StateStorage = {
  getItem: (nombre) => {
    try {
      return localStorage.getItem(nombre)
    } catch {
      return null
    }
  },
  setItem: (nombre, valor) => {
    try {
      localStorage.setItem(nombre, valor)
    } catch {
      // Sin espacio o sin permiso: queda en memoria.
    }
  },
  removeItem: (nombre) => {
    try {
      localStorage.removeItem(nombre)
    } catch {
      // Nada que borrar.
    }
  },
}

export const useInformes = create<EstadoInformes>()(
  persist(
    (set) => ({
      ...PREFERENCIAS_INICIALES,
      cambiar: (cambios) => set(cambios),
      olvidar: () => set(PREFERENCIAS_INICIALES),
    }),
    {
      name: 'topo:informes',
      version: 1,
      storage: createJSONStorage(() => almacenSeguro),
      partialize: ({ cambiar: _c, olvidar: _o, ...preferencias }) => preferencias,
    },
  ),
)
