import type { Id } from '@topo/core'
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { FuentePerfil, Vertice } from './perfilDeLaCalle'

/**
 * Lo que el planificador recuerda mientras se va y viene entre Planificar y
 * la Guía de campo: de dónde sale el perfil, el tramo y los vértices
 * digitados, por calle; y en qué paso de la guía se quedó. No va al
 * proyecto: lo que se decide de verdad (los controles) se guarda en la calle
 * con `fijarPlanControles`.
 *
 * Se recuerda también en el navegador: en campo el celular recarga la
 * pestaña a menudo, y perder los vértices escritos a mano o el paso de la
 * guía a mitad de la pista es justo lo que no puede pasar. Si el navegador
 * no deja guardar (ventana privada), funciona igual, solo en memoria.
 */
export interface PlanificadorDeCalle {
  fuente?: FuentePerfil
  desde?: number
  hasta?: number
  digitados?: Vertice[]
  pasoGuia?: number
  /** De qué plan es `pasoGuia`: si el plan cambia, el número ya no apunta al mismo lugar. */
  firmaGuia?: string
}

interface EstadoPlanificador {
  porCalle: Record<Id, PlanificadorDeCalle>
  cambiar(calleId: Id, cambios: Partial<PlanificadorDeCalle>): void
  olvidar(): void
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

export const usePlanificador = create<EstadoPlanificador>()(
  persist(
    (set) => ({
      porCalle: {},
      cambiar: (calleId, cambios) =>
        set((s) => ({
          porCalle: {
            ...s.porCalle,
            [calleId]: { ...s.porCalle[calleId], ...cambios },
          },
        })),
      olvidar: () => set({ porCalle: {} }),
    }),
    {
      name: 'topo:planificador',
      version: 1,
      storage: createJSONStorage(() => almacenSeguro),
      partialize: (s) => ({ porCalle: s.porCalle }),
    },
  ),
)
