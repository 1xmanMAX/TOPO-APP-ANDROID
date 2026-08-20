import {
  calcularCampania,
  capaEnUso,
  moverCapa,
  partirClaveCelda,
  renumerarCapas,
  type BM,
  type Calle,
  type Campania,
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

/** Cuál campaña va abajo y cuál arriba al calcular el espesor entre dos capas. */
export interface Comparacion {
  inferior: Id | null
  superior: Id | null
}

interface EstadoApp {
  proyecto: Proyecto
  vista: Vista
  campaniaActivaId: Id | null
  estacionActiva: number
  plantillaEnEdicionId: Id | null
  seleccion: Seleccion
  /** Campañas que se dibujan superpuestas en el corte transversal. */
  capasVisibles: Id[]
  /** Qué dos campañas se comparan para calcular el espesor colocado entre ellas. */
  comparacion: Comparacion

  cargarProyecto(proyecto: Proyecto): void
  nuevoProyecto(): void
  irA(vista: Vista): void

  actualizarMeta(cambios: Partial<Proyecto['meta']>): void

  agregarBM(datos: Omit<BM, 'id'>): void
  actualizarBM(id: Id, cambios: Partial<Omit<BM, 'id'>>): void
  eliminarBM(id: Id): void

  agregarCapa(nombre: string): void
  eliminarCapa(id: Id): void
  moverCapa(capaId: Id, direccion: -1 | 1): void

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

  alternarCapaVisible(campaniaId: Id): void
  fijarComparacion(inferior: Id | null, superior: Id | null): void

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

/** La calle de la campaña activa, o null si no hay campaña activa. */
function calleDeCampania(proyecto: Proyecto, campaniaId: Id | null): Id | null {
  if (!campaniaId) return null
  return proyecto.campanias.find((c) => c.id === campaniaId)?.calleId ?? null
}

const SIN_COMPARACION: Comparacion = { inferior: null, superior: null }

/**
 * Qué se dibuja y qué se compara vive por calle: si la calle activa cambia,
 * seguir arrastrando ids de campañas de otra calle no significaría nada
 * (los espesores saldrían de restar cotas de sitios distintos). Cuando la
 * calle no cambió, se conserva tal cual.
 */
function seleccionDeCapasTrasCambio(
  calleAnterior: Id | null,
  calleNueva: Id | null,
  actual: { capasVisibles: Id[]; comparacion: Comparacion },
): { capasVisibles: Id[]; comparacion: Comparacion } {
  if (calleAnterior === calleNueva) {
    // Devolver solo estos dos campos, nunca el objeto `actual` completo: quien
    // llama hace `...seleccionDeCapasTrasCambio(...)` junto a otros campos ya
    // calculados (campaniaActivaId, estacionActiva, proyecto), y devolver
    // `actual` entero los pisaría con sus valores viejos.
    return { capasVisibles: actual.capasVisibles, comparacion: actual.comparacion }
  }
  return { capasVisibles: [], comparacion: SIN_COMPARACION }
}

export const useAlmacen = create<EstadoApp>((set, get) => ({
  proyecto: proyectoEjemplo(),
  vista: 'proyecto',
  campaniaActivaId: 'camp-1',
  estacionActiva: 0,
  plantillaEnEdicionId: null,
  seleccion: { clave: null, progresiva: null },
  capasVisibles: [],
  comparacion: SIN_COMPARACION,

  cargarProyecto: (proyecto) =>
    set({
      proyecto,
      campaniaActivaId: proyecto.campanias[0]?.id ?? null,
      estacionActiva: ultimaEstacion(proyecto.campanias[0]),
      seleccion: { clave: null, progresiva: null },
      capasVisibles: [],
      comparacion: SIN_COMPARACION,
    }),

  nuevoProyecto: () =>
    set({
      proyecto: proyectoVacio(),
      campaniaActivaId: null,
      estacionActiva: 0,
      vista: 'proyecto',
      seleccion: { clave: null, progresiva: null },
      capasVisibles: [],
      comparacion: SIN_COMPARACION,
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
        capas: renumerarCapas([
          ...s.proyecto.capas,
          { id: nuevoId('cap'), nombre, orden: s.proyecto.capas.length },
        ]),
      }),
    })),

  eliminarCapa: (id) =>
    set((s) => {
      // Borrar una capa en uso dejaría campañas apuntando a algo inexistente,
      // y al comparar capas produciría comparaciones fantasma.
      if (capaEnUso(s.proyecto.campanias, id)) return {}
      return {
        proyecto: marcarModificado({
          ...s.proyecto,
          capas: renumerarCapas(s.proyecto.capas.filter((capa) => capa.id !== id)),
        }),
      }
    }),

  moverCapa: (capaId, direccion) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        capas: moverCapa(s.proyecto.capas, capaId, direccion),
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
    set((s) => {
      const calleAnterior = calleDeCampania(s.proyecto, s.campaniaActivaId)
      return {
        proyecto: marcarModificado({
          ...s.proyecto,
          campanias: [...s.proyecto.campanias, { ...datos, id, estaciones: [] }],
        }),
        campaniaActivaId: id,
        // La campaña recién creada no tiene estaciones todavía.
        estacionActiva: 0,
        ...seleccionDeCapasTrasCambio(calleAnterior, datos.calleId, s),
      }
    })
    return id
  },

  actualizarCampania: (id, cambios) =>
    set((s) => {
      const calleAnterior = calleDeCampania(s.proyecto, s.campaniaActivaId)
      const proyecto = marcarModificado({
        ...s.proyecto,
        campanias: s.proyecto.campanias.map((c) => (c.id === id ? { ...c, ...cambios } : c)),
      })
      // Solo cambiar la calle de la campaña activa mueve la calle activa: las
      // demás campañas pueden reasignarse sin afectar lo que se está viendo.
      const calleNueva = id === s.campaniaActivaId ? calleDeCampania(proyecto, id) : calleAnterior
      return { proyecto, ...seleccionDeCapasTrasCambio(calleAnterior, calleNueva, s) }
    }),

  activarCampania: (id) =>
    set((s) => {
      const calleAnterior = calleDeCampania(s.proyecto, s.campaniaActivaId)
      const calleNueva = calleDeCampania(s.proyecto, id)
      return {
        campaniaActivaId: id,
        estacionActiva: ultimaEstacion(s.proyecto.campanias.find((c) => c.id === id)),
        ...seleccionDeCapasTrasCambio(calleAnterior, calleNueva, s),
      }
    }),

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
      const partes = partirClaveCelda(clave)
      return { seleccion: { clave, progresiva: partes?.progresiva ?? null } }
    }),

  irAProgresiva: (progresiva) => set((s) => ({ seleccion: { ...s.seleccion, progresiva } })),

  alternarCapaVisible: (campaniaId) =>
    set((s) => ({
      capasVisibles: s.capasVisibles.includes(campaniaId)
        ? s.capasVisibles.filter((id) => id !== campaniaId)
        : [...s.capasVisibles, campaniaId],
    })),

  fijarComparacion: (inferior, superior) =>
    set({
      // Una capa no se compara consigo misma: si ambos lados quedarían
      // apuntando a la misma campaña, la de arriba se limpia.
      comparacion: { inferior, superior: superior !== null && superior === inferior ? null : superior },
    }),

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
