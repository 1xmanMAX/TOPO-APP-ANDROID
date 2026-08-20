import {
  calcularCampania,
  type BM,
  type Calle,
  type Campania,
  type Capa,
  type DestinoLectura,
  type Id,
  type Plantilla,
  type Proyecto,
  type ResultadoCampania,
} from '@topo/core'
import { create } from 'zustand'
import { nuevoId, proyectoEjemplo, proyectoVacio } from './ejemplo'

export type Vista = 'proyecto' | 'plantilla' | 'calle' | 'campanias' | 'libreta' | 'resultados'

export interface Seleccion {
  clave: string | null
  progresiva: number | null
}

interface EstadoApp {
  proyecto: Proyecto
  vista: Vista
  campaniaActivaId: Id | null
  estacionActiva: number
  plantillaEnEdicionId: Id | null
  seleccion: Seleccion

  cargarProyecto(proyecto: Proyecto): void
  nuevoProyecto(): void
  irA(vista: Vista): void

  actualizarMeta(cambios: Partial<Proyecto['meta']>): void

  agregarBM(datos: Omit<BM, 'id'>): void
  actualizarBM(id: Id, cambios: Partial<Omit<BM, 'id'>>): void
  eliminarBM(id: Id): void

  agregarCapa(nombre: string): void
  eliminarCapa(id: Id): void

  agregarPlantilla(nombre: string): Id
  actualizarPlantilla(id: Id, cambios: Partial<Omit<Plantilla, 'id'>>): void
  eliminarPlantilla(id: Id): void
  editarPlantilla(id: Id | null): void

  agregarCalle(datos: Omit<Calle, 'id'>): Id
  actualizarCalle(id: Id, cambios: Partial<Omit<Calle, 'id'>>): void
  eliminarCalle(id: Id): void

  agregarCampania(datos: Omit<Campania, 'id' | 'estaciones'>): Id
  actualizarCampania(id: Id, cambios: Partial<Omit<Campania, 'id'>>): void
  activarCampania(id: Id | null): void
  activarEstacion(indice: number): void
  agregarEstacion(campaniaId: Id, vistaAtras: { destino: DestinoLectura; valor: number }): void
  fijarVistaAdelante(
    campaniaId: Id,
    estacionIndice: number,
    lectura: { destino: DestinoLectura; valor: number },
  ): void
  quitarVistaAdelante(campaniaId: Id, estacionIndice: number): void
  agregarIntermedia(
    campaniaId: Id,
    estacionIndice: number,
    lectura: { destino: DestinoLectura; valor: number },
  ): void
  actualizarLectura(campaniaId: Id, lecturaId: Id, valor: number): void
  eliminarLectura(campaniaId: Id, lecturaId: Id): void

  seleccionar(clave: string | null): void
  irAProgresiva(progresiva: number | null): void

  calcular(): ResultadoCampania | null
}

function marcarModificado(proyecto: Proyecto): Proyecto {
  return { ...proyecto, meta: { ...proyecto.meta, modificado: new Date().toISOString() } }
}

/**
 * La estación activa de una campaña recién activada es la última: es donde
 * se sigue trabajando. 0 si la campaña no existe o no tiene estaciones.
 */
function ultimaEstacion(campania: Campania | undefined): number {
  return Math.max(0, (campania?.estaciones.length ?? 0) - 1)
}

export const useAlmacen = create<EstadoApp>((set, get) => ({
  proyecto: proyectoEjemplo(),
  vista: 'proyecto',
  campaniaActivaId: 'camp-1',
  estacionActiva: 0,
  plantillaEnEdicionId: null,
  seleccion: { clave: null, progresiva: null },

  cargarProyecto: (proyecto) =>
    set({
      proyecto,
      campaniaActivaId: proyecto.campanias[0]?.id ?? null,
      estacionActiva: ultimaEstacion(proyecto.campanias[0]),
      seleccion: { clave: null, progresiva: null },
    }),

  nuevoProyecto: () =>
    set({
      proyecto: proyectoVacio(),
      campaniaActivaId: null,
      estacionActiva: 0,
      vista: 'proyecto',
      seleccion: { clave: null, progresiva: null },
    }),

  irA: (vista) => set({ vista }),

  actualizarMeta: (cambios) =>
    set((s) => ({ proyecto: marcarModificado({ ...s.proyecto, meta: { ...s.proyecto.meta, ...cambios } }) })),

  agregarBM: (datos) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        bms: [...s.proyecto.bms, { ...datos, id: nuevoId('bm') }],
      }),
    })),

  actualizarBM: (id, cambios) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        bms: s.proyecto.bms.map((bm) => (bm.id === id ? { ...bm, ...cambios } : bm)),
      }),
    })),

  eliminarBM: (id) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        bms: s.proyecto.bms.filter((bm) => bm.id !== id),
      }),
    })),

  agregarCapa: (nombre) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        capas: [
          ...s.proyecto.capas,
          { id: nuevoId('cap'), nombre, orden: s.proyecto.capas.length } as Capa,
        ],
      }),
    })),

  eliminarCapa: (id) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        capas: s.proyecto.capas.filter((capa) => capa.id !== id),
      }),
    })),

  agregarPlantilla: (nombre) => {
    const id = nuevoId('pl')
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        plantillas: [...s.proyecto.plantillas, { id, nombre, elementos: [] }],
      }),
      plantillaEnEdicionId: id,
    }))
    return id
  },

  actualizarPlantilla: (id, cambios) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        plantillas: s.proyecto.plantillas.map((p) => (p.id === id ? { ...p, ...cambios } : p)),
      }),
    })),

  eliminarPlantilla: (id) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        plantillas: s.proyecto.plantillas.filter((p) => p.id !== id),
      }),
    })),

  editarPlantilla: (id) => set({ plantillaEnEdicionId: id }),

  agregarCalle: (datos) => {
    const id = nuevoId('c')
    set((s) => ({
      proyecto: marcarModificado({ ...s.proyecto, calles: [...s.proyecto.calles, { ...datos, id }] }),
    }))
    return id
  },

  actualizarCalle: (id, cambios) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        calles: s.proyecto.calles.map((c) => (c.id === id ? { ...c, ...cambios } : c)),
      }),
    })),

  eliminarCalle: (id) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        calles: s.proyecto.calles.filter((c) => c.id !== id),
      }),
    })),

  agregarCampania: (datos) => {
    const id = nuevoId('camp')
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        campanias: [...s.proyecto.campanias, { ...datos, id, estaciones: [] }],
      }),
      campaniaActivaId: id,
      // La campaña recién creada no tiene estaciones todavía.
      estacionActiva: 0,
    }))
    return id
  },

  actualizarCampania: (id, cambios) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        campanias: s.proyecto.campanias.map((c) => (c.id === id ? { ...c, ...cambios } : c)),
      }),
    })),

  activarCampania: (id) =>
    set((s) => ({
      campaniaActivaId: id,
      estacionActiva: ultimaEstacion(s.proyecto.campanias.find((c) => c.id === id)),
    })),

  activarEstacion: (indice) => set({ estacionActiva: indice }),

  agregarEstacion: (campaniaId, vistaAtras) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        campanias: s.proyecto.campanias.map((c) =>
          c.id === campaniaId
            ? {
                ...c,
                estaciones: [
                  ...c.estaciones,
                  {
                    id: nuevoId('e'),
                    vistaAtras: { id: nuevoId('l'), ...vistaAtras },
                    intermedias: [],
                  },
                ],
              }
            : c,
        ),
      }),
    })),

  fijarVistaAdelante: (campaniaId, estacionIndice, lectura) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        campanias: s.proyecto.campanias.map((c) =>
          c.id === campaniaId
            ? {
                ...c,
                estaciones: c.estaciones.map((e, i) =>
                  i === estacionIndice
                    ? {
                        ...e,
                        vistaAdelante: { id: e.vistaAdelante?.id ?? nuevoId('l'), ...lectura },
                      }
                    : e,
                ),
              }
            : c,
        ),
      }),
    })),

  quitarVistaAdelante: (campaniaId, estacionIndice) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        campanias: s.proyecto.campanias.map((c) =>
          c.id === campaniaId
            ? {
                ...c,
                estaciones: c.estaciones.map((e, i) => {
                  if (i !== estacionIndice) return e
                  const copia = { ...e }
                  delete copia.vistaAdelante
                  return copia
                }),
              }
            : c,
        ),
      }),
    })),

  agregarIntermedia: (campaniaId, estacionIndice, lectura) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        campanias: s.proyecto.campanias.map((c) =>
          c.id === campaniaId
            ? {
                ...c,
                estaciones: c.estaciones.map((e, i) =>
                  i === estacionIndice
                    ? { ...e, intermedias: [...e.intermedias, { id: nuevoId('l'), ...lectura }] }
                    : e,
                ),
              }
            : c,
        ),
      }),
    })),

  actualizarLectura: (campaniaId, lecturaId, valor) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        campanias: s.proyecto.campanias.map((c) =>
          c.id === campaniaId
            ? {
                ...c,
                estaciones: c.estaciones.map((e) => ({
                  ...e,
                  vistaAtras:
                    e.vistaAtras.id === lecturaId ? { ...e.vistaAtras, valor } : e.vistaAtras,
                  intermedias: e.intermedias.map((l) => (l.id === lecturaId ? { ...l, valor } : l)),
                  vistaAdelante:
                    e.vistaAdelante && e.vistaAdelante.id === lecturaId
                      ? { ...e.vistaAdelante, valor }
                      : e.vistaAdelante,
                })),
              }
            : c,
        ),
      }),
    })),

  eliminarLectura: (campaniaId, lecturaId) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        campanias: s.proyecto.campanias.map((c) =>
          c.id === campaniaId
            ? {
                ...c,
                estaciones: c.estaciones.map((e) => ({
                  ...e,
                  intermedias: e.intermedias.filter((l) => l.id !== lecturaId),
                })),
              }
            : c,
        ),
      }),
    })),

  seleccionar: (clave) =>
    set(() => {
      if (!clave) return { seleccion: { clave: null, progresiva: null } }
      const progresiva = Number(clave.split('|')[0])
      return {
        seleccion: { clave, progresiva: Number.isFinite(progresiva) ? progresiva : null },
      }
    }),

  irAProgresiva: (progresiva) => set((s) => ({ seleccion: { ...s.seleccion, progresiva } })),

  calcular: () => {
    const { proyecto, campaniaActivaId } = get()
    const campania = proyecto.campanias.find((c) => c.id === campaniaActivaId)
    if (!campania) return null

    const calle = proyecto.calles.find((c) => c.id === campania.calleId)
    if (!calle) return null

    const plantilla = proyecto.plantillas.find((p) => p.id === calle.plantillaId)
    if (!plantilla) return null

    return calcularCampania({ campania, calle, plantilla, bms: proyecto.bms })
  },
}))
