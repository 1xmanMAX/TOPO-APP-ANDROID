import {
  anadirPalabra,
  CAMARA_ISOMETRICA,
  calcularCampania,
  capaEnUso,
  esPalabraDe,
  ETIQUETA_ROL,
  ladoDe,
  mismaPalabra,
  moverCapa,
  partirClaveCelda,
  renumerarCapas,
  seccionDeFabrica,
  type BM,
  type Calle,
  type Camara,
  type Capa,
  type DestinoLectura,
  type Id,
  type Proyecto,
  type Rasante,
  type ResultadoCampania,
  type Rol,
  type Seccion,
  type Toma,
} from '@topo/core'
import { create } from 'zustand'
import { nuevoId, proyectoEjemplo, proyectoVacio } from './ejemplo'
import {
  buscarToma,
  calleDeToma,
  conToma,
  moverTomaDeCalle,
  primeraTomaId,
  todasLasTomas,
  agregarTomaComoNivelacion,
} from './proyectoTomas'

export type Vista = 'proyecto' | 'calle' | 'campanias' | 'libreta' | 'resultados'

/**
 * Las tres palabras de la hoja que no son puntos de la sección: la que
 * encabeza las progresivas, la que marca la lectura al punto de control y la
 * que abre una fila de referencia. No se dibujan, pero sin ellas la
 * importación no sabe dónde está mirando.
 */
export type ListaDePalabras = 'progresiva' | 'puntoControl' | 'referencia'

/** Qué manda el color en el visor 3D: el estado de la celda o la capa activa. */
export type ModoVista3D = 'estado' | 'capas'

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
  seleccion: Seleccion
  /** Campañas que se dibujan superpuestas en el corte transversal. */
  capasVisibles: Id[]
  /** Qué dos campañas se comparan para calcular el espesor colocado entre ellas. */
  comparacion: Comparacion
  /** Cómo se está mirando el modelo 3D: giro, inclinación y exageración vertical. */
  camara: Camara
  /** Qué manda el color en el visor 3D. */
  modoVista3D: ModoVista3D

  cargarProyecto(proyecto: Proyecto): void
  nuevoProyecto(): void
  irA(vista: Vista): void

  actualizarMeta(cambios: Partial<Proyecto['meta']>): void

  agregarBM(datos: Omit<BM, 'id'>): void
  actualizarBM(id: Id, cambios: Partial<Omit<BM, 'id'>>): void
  eliminarBM(id: Id): void

  agregarCapa(nombre: string): void
  actualizarCapa(id: Id, cambios: Partial<Omit<Capa, 'id'>>): void
  eliminarCapa(id: Id): void
  moverCapa(capaId: Id, direccion: -1 | 1): void

  agregarCalle(datos: Omit<Calle, 'id' | 'seccion' | 'nivelaciones'>): Id
  actualizarCalle(id: Id, cambios: Partial<Omit<Calle, 'id'>>): void
  eliminarCalle(id: Id): void
  fijarRasante(calleId: Id, rasante: Rasante | null): void

  cambiarDistancia(calleId: Id, puntoId: Id, distancia: number): void
  anadirPalabraAPunto(calleId: Id, puntoId: Id, palabra: string): void
  quitarPalabraDePunto(calleId: Id, puntoId: Id, palabra: string): void
  anadirPunto(calleId: Id, rol: Rol, distancia: number): void
  quitarPunto(calleId: Id, puntoId: Id): void
  anadirPalabraSuelta(calleId: Id, lista: ListaDePalabras, palabra: string): void
  quitarPalabraSuelta(calleId: Id, lista: ListaDePalabras, palabra: string): void

  agregarCampania(datos: Omit<Toma, 'id' | 'estaciones'> & { calleId: Id }): Id
  actualizarCampania(id: Id, cambios: Partial<Omit<Toma, 'id'>> & { calleId?: Id }): void
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

  girarCamara(grados: number): void
  fijarCamara(camara: Camara): void
  fijarExageracion(factor: number): void
  fijarModoVista3D(modo: ModoVista3D): void

  calcular(): ResultadoCampania | null
}

function marcarModificado(proyecto: Proyecto): Proyecto {
  return { ...proyecto, meta: { ...proyecto.meta, modificado: new Date().toISOString() } }
}

/**
 * Cambia la sección de una calle y deja el resto del proyecto como estaba.
 * Las cinco acciones de la sección pasan por aquí para no repetir cinco
 * veces el mismo recorrido de calles.
 */
function conSeccion(proyecto: Proyecto, calleId: Id, cambiar: (seccion: Seccion) => Seccion): Proyecto {
  return marcarModificado({
    ...proyecto,
    calles: proyecto.calles.map((calle) =>
      calle.id === calleId ? { ...calle, seccion: cambiar(calle.seccion) } : calle,
    ),
  })
}

/**
 * Cambia una de las tres listas de palabras que no son puntos y deja las
 * otras dos como estaban. Escrito con un `switch` y no con una llave
 * calculada para que sea el compilador, y no un `as`, quien garantice que la
 * sección que sale sigue siendo una sección.
 */
function conListaDePalabras(
  seccion: Seccion,
  lista: ListaDePalabras,
  cambiar: (palabras: string[]) => string[],
): Seccion {
  switch (lista) {
    case 'progresiva':
      return { ...seccion, palabrasProgresiva: cambiar(seccion.palabrasProgresiva) }
    case 'puntoControl':
      return { ...seccion, palabrasPuntoControl: cambiar(seccion.palabrasPuntoControl) }
    case 'referencia':
      return { ...seccion, palabrasReferencia: cambiar(seccion.palabrasReferencia) }
  }
}

/** Los roles de nombre femenino: «Vereda izquierda», pero «Sardinel izquierdo». */
const ROLES_FEMENINOS: readonly Rol[] = ['vereda', 'cuneta']

/**
 * Cómo se llama un punto nuevo: su elemento y el lado donde cayó, escrito en
 * español de verdad. El lado sale del signo de la distancia, igual que en el
 * resto de la app; un punto en el eje no lleva lado porque no lo tiene.
 */
function nombreDePunto(rol: Rol, distancia: number): string {
  const lado = ladoDe(distancia)
  if (lado === 'eje') return ETIQUETA_ROL[rol]

  const femenino = ROLES_FEMENINOS.includes(rol)
  const izquierda = femenino ? 'izquierda' : 'izquierdo'
  const derecha = femenino ? 'derecha' : 'derecho'

  return `${ETIQUETA_ROL[rol]} ${lado === 'izquierda' ? izquierda : derecha}`
}

/**
 * El nombre con el que el punto entra sin confundirse con otro que ya esté.
 * Dos cunetas del mismo lado son posibles —Max declara lo que mide—, pero
 * dos puntos llamados igual dejarían dos campos indistinguibles para quien
 * navega con lector de pantalla.
 */
function nombreLibre(seccion: Seccion, base: string): string {
  if (!seccion.puntos.some((punto) => punto.nombre === base)) return base

  let numero = 2
  while (seccion.puntos.some((punto) => punto.nombre === `${base} ${numero}`)) numero += 1
  return `${base} ${numero}`
}

/**
 * La estación activa de una campaña recién activada es la última: es donde
 * se sigue trabajando. 0 si la campaña no existe o no tiene estaciones.
 */
function ultimaEstacion(campania: Toma | undefined): number {
  return Math.max(0, (campania?.estaciones.length ?? 0) - 1)
}

const SIN_COMPARACION: Comparacion = { inferior: null, superior: null }

/** Recorta un valor al rango [minimo, maximo]: un deslizador que se resiste en el extremo se siente roto. */
function recortar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor))
}

/** Normaliza un giro a [0, 360): da la vuelta en vez de crecer sin fin. */
function normalizarGiro(grados: number): number {
  return ((grados % 360) + 360) % 360
}

/** La cámara tal como se guarda: giro normalizado, inclinación y exageración recortadas. */
function camaraValida(camara: Camara): Camara {
  return {
    giro: normalizarGiro(camara.giro),
    inclinacion: recortar(camara.inclinacion, 0, 90),
    exageracion: recortar(camara.exageracion, 1, 50),
  }
}

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
  campaniaActivaId: primeraTomaId(proyectoEjemplo()),
  estacionActiva: 0,
  seleccion: { clave: null, progresiva: null },
  capasVisibles: [],
  comparacion: SIN_COMPARACION,
  camara: CAMARA_ISOMETRICA,
  modoVista3D: 'estado',

  cargarProyecto: (proyecto) => {
    const primeraId = primeraTomaId(proyecto)
    return set({
      proyecto,
      campaniaActivaId: primeraId,
      estacionActiva: ultimaEstacion(buscarToma(proyecto, primeraId)?.toma),
      seleccion: { clave: null, progresiva: null },
      capasVisibles: [],
      comparacion: SIN_COMPARACION,
    })
  },

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
          // Los 20 mm de toleranciaMm son solo un valor de arranque, elegido
          // para coincidir con las capas del proyecto de ejemplo: no es una
          // norma. Se ajusta luego desde la pantalla de la capa.
          { id: nuevoId('cap'), nombre, orden: s.proyecto.capas.length, espesor: 0, toleranciaMm: 20 },
        ]),
      }),
    })),

  actualizarCapa: (id, cambios) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        capas: s.proyecto.capas.map((capa) => (capa.id === id ? { ...capa, ...cambios } : capa)),
      }),
    })),

  eliminarCapa: (id) =>
    set((s) => {
      // Borrar una capa en uso dejaría tomas apuntando a algo inexistente, y
      // al comparar capas produciría comparaciones fantasma.
      if (capaEnUso(todasLasTomas(s.proyecto), id)) return {}
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

  agregarCalle: (datos) => {
    const id = nuevoId('c')
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        // Una calle nueva nace con la sección urbana típica ya puesta, no
        // vacía: es un punto de partida que se edita entero, y sin él no
        // habría dónde caer las lecturas de la primera libreta.
        calles: [...s.proyecto.calles, { ...datos, id, seccion: seccionDeFabrica(), nivelaciones: [] }],
      }),
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

  fijarRasante: (calleId, rasante) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        calles: s.proyecto.calles.map((calle) =>
          calle.id === calleId ? { ...calle, rasante } : calle,
        ),
      }),
    })),

  cambiarDistancia: (calleId, puntoId, distancia) =>
    set((s) => ({
      proyecto: conSeccion(s.proyecto, calleId, (seccion) => ({
        ...seccion,
        puntos: seccion.puntos.map((punto) => {
          if (punto.id !== puntoId) return punto

          // Escribir la distancia es medirla, aunque salga la misma cifra que
          // traía: la app deja de responder por ella y ya no la cuenta como
          // suya en el aviso de las pendientes orientativas. Quien llama se
          // encarga de que esto sea un acto y no un roce (`confirmarAlSalir`
          // en el campo, o el botón de confirmar).
          //
          // El eje es la excepción: es el origen de las distancias y se queda
          // en 0 pase lo que pase. Con el eje corrido, `ladoDe` lo daría por
          // un punto de la derecha y el reparto de lados de la hoja —que
          // cuelga entero de encontrar el eje— se vendría abajo por una
          // errata. Confirmarlo sí cuenta, y por eso pasa por aquí.
          const medida = punto.rol === 'eje' ? 0 : distancia
          return { ...punto, distancia: medida, distanciaDeFabrica: false }
        }),
      })),
    })),

  anadirPalabraAPunto: (calleId, puntoId, palabra) =>
    set((s) => ({
      // `anadirPalabra` compara ya normalizado: la misma palabra escrita de
      // otra manera no entra dos veces, y la misma palabra en los dos lados
      // del eje sí, que es justo lo que Max pidió.
      proyecto: conSeccion(s.proyecto, calleId, (seccion) => anadirPalabra(seccion, puntoId, palabra)),
    })),

  quitarPalabraDePunto: (calleId, puntoId, palabra) =>
    set((s) => ({
      proyecto: conSeccion(s.proyecto, calleId, (seccion) => ({
        ...seccion,
        puntos: seccion.puntos.map((punto) =>
          punto.id === puntoId
            ? { ...punto, palabras: punto.palabras.filter((suya) => !mismaPalabra(suya, palabra)) }
            : punto,
        ),
      })),
    })),

  anadirPunto: (calleId, rol, distancia) =>
    set((s) => {
      const calle = s.proyecto.calles.find((c) => c.id === calleId)
      // Hay un eje, y solo uno: es el que reparte los lados. La pantalla ya
      // no lo ofrece mientras exista, pero un invariante que solo vive en una
      // pantalla no es un invariante.
      if (rol === 'eje' && calle?.seccion.puntos.some((punto) => punto.rol === 'eje')) return {}

      return {
        proyecto: conSeccion(s.proyecto, calleId, (seccion) => ({
          ...seccion,
          puntos: [
            ...seccion.puntos,
            {
              id: nuevoId('p'),
              rol,
              nombre: nombreLibre(seccion, nombreDePunto(rol, distancia)),
              distancia,
              // La escribió Max al añadirlo, así que nace medida.
              distanciaDeFabrica: false,
              palabras: [],
            },
          ],
        })),
      }
    }),

  quitarPunto: (calleId, puntoId) =>
    set((s) => {
      const calle = s.proyecto.calles.find((c) => c.id === calleId)
      const punto = calle?.seccion.puntos.find((p) => p.id === puntoId)
      // El eje no se quita: es el que dice qué cae a la izquierda y qué a la
      // derecha, tanto al dibujar la sección como al repartir las columnas de
      // una hoja. Sin él no habría con qué deducir el lado de nada.
      if (!punto || punto.rol === 'eje') return {}

      return {
        proyecto: conSeccion(s.proyecto, calleId, (seccion) => ({
          ...seccion,
          puntos: seccion.puntos.filter((p) => p.id !== puntoId),
        })),
      }
    }),

  anadirPalabraSuelta: (calleId, lista, palabra) =>
    set((s) => ({
      proyecto: conSeccion(s.proyecto, calleId, (seccion) =>
        conListaDePalabras(seccion, lista, (palabras) =>
          // Ya normalizado, igual que en los puntos: `PROG` y `prog` son la
          // misma palabra y no entran dos veces.
          esPalabraDe(palabras, palabra) ? palabras : [...palabras, palabra],
        ),
      ),
    })),

  quitarPalabraSuelta: (calleId, lista, palabra) =>
    set((s) => ({
      proyecto: conSeccion(s.proyecto, calleId, (seccion) =>
        conListaDePalabras(seccion, lista, (palabras) =>
          palabras.filter((suya) => !mismaPalabra(suya, palabra)),
        ),
      ),
    })),

  agregarCampania: (datos) => {
    const { calleId, ...restoDatos } = datos
    const id = nuevoId('camp')
    set((s) => {
      const calleAnterior = calleDeToma(s.proyecto, s.campaniaActivaId)
      const toma: Toma = {
        ...restoDatos,
        id,
        // Toda nivelación empieza plantando el nivel y leyendo hacia atrás al
        // banco de nivel. Sin esa primera estación no hay dónde escribir, y la
        // toma nace inutilizable.
        estaciones: [
          {
            id: nuevoId('e'),
            vistaAtras: {
              id: nuevoId('l'),
              destino: { tipo: 'bm', bmId: restoDatos.bmInicialId },
              valor: 0,
            },
            intermedias: [],
          },
        ],
      }
      return {
        proyecto: marcarModificado(
          agregarTomaComoNivelacion(s.proyecto, calleId, toma, nuevoId('niv')),
        ),
        campaniaActivaId: id,
        estacionActiva: 0,
        ...seleccionDeCapasTrasCambio(calleAnterior, calleId, s),
      }
    })
    return id
  },

  actualizarCampania: (id, cambios) =>
    set((s) => {
      const { calleId: calleDestinoId, ...restoCambios } = cambios
      const calleActivaAnterior = calleDeToma(s.proyecto, s.campaniaActivaId)
      const calleEditadaAnterior = calleDeToma(s.proyecto, id)

      // Cambiar de calle mueve la toma entera (con su nivelación) de una
      // calle a otra; el resto de cambios se aplican donde quede.
      let proyecto =
        calleDestinoId !== undefined && calleDestinoId !== calleEditadaAnterior
          ? moverTomaDeCalle(s.proyecto, id, calleDestinoId, () => nuevoId('niv'))
          : s.proyecto

      proyecto = marcarModificado(conToma(proyecto, id, (toma) => ({ ...toma, ...restoCambios })))

      const calleEditadaNueva = calleDeToma(proyecto, id)
      // Solo cambiar la calle de la campaña activa mueve la calle activa: las
      // demás campañas pueden reasignarse sin afectar lo que se está viendo.
      const calleActivaNueva = id === s.campaniaActivaId ? calleEditadaNueva : calleActivaAnterior
      const { capasVisibles, comparacion } = seleccionDeCapasTrasCambio(calleActivaAnterior, calleActivaNueva, s)

      // La campaña editada puede no ser la activa (el selector de calle de
      // VistaCampanias deja tocar cualquiera de la lista). Si de todos modos
      // cambió de calle y seguía en la comparación o en capasVisibles, hay
      // que sacarla de ahí: sus claves de celda (`progresiva|elemento`)
      // coinciden con las de cualquier otra calle, así que dejarla sería
      // comparar o dibujar cotas de sitios distintos como si fueran uno.
      if (calleEditadaAnterior !== calleEditadaNueva) {
        return {
          proyecto,
          capasVisibles: capasVisibles.filter((campaniaId) => campaniaId !== id),
          comparacion:
            comparacion.inferior === id || comparacion.superior === id ? SIN_COMPARACION : comparacion,
        }
      }

      return { proyecto, capasVisibles, comparacion }
    }),

  activarCampania: (id) =>
    set((s) => {
      const calleAnterior = calleDeToma(s.proyecto, s.campaniaActivaId)
      const calleNueva = calleDeToma(s.proyecto, id)
      return {
        campaniaActivaId: id,
        estacionActiva: ultimaEstacion(buscarToma(s.proyecto, id)?.toma),
        ...seleccionDeCapasTrasCambio(calleAnterior, calleNueva, s),
      }
    }),

  activarEstacion: (indice) => set({ estacionActiva: indice }),

  agregarEstacion: (campaniaId, vistaAtras) =>
    set((s) => ({
      proyecto: marcarModificado(
        conToma(s.proyecto, campaniaId, (toma) => ({
          ...toma,
          estaciones: [
            ...toma.estaciones,
            {
              id: nuevoId('e'),
              vistaAtras: { id: nuevoId('l'), ...vistaAtras },
              intermedias: [],
            },
          ],
        })),
      ),
    })),

  fijarVistaAdelante: (campaniaId, estacionIndice, lectura) =>
    set((s) => ({
      proyecto: marcarModificado(
        conToma(s.proyecto, campaniaId, (toma) => ({
          ...toma,
          estaciones: toma.estaciones.map((e, i) =>
            i === estacionIndice
              ? { ...e, vistaAdelante: { id: e.vistaAdelante?.id ?? nuevoId('l'), ...lectura } }
              : e,
          ),
        })),
      ),
    })),

  quitarVistaAdelante: (campaniaId, estacionIndice) =>
    set((s) => ({
      proyecto: marcarModificado(
        conToma(s.proyecto, campaniaId, (toma) => ({
          ...toma,
          estaciones: toma.estaciones.map((e, i) => {
            if (i !== estacionIndice) return e
            const copia = { ...e }
            delete copia.vistaAdelante
            return copia
          }),
        })),
      ),
    })),

  agregarIntermedia: (campaniaId, estacionIndice, lectura) =>
    set((s) => {
      const hallado = buscarToma(s.proyecto, campaniaId)
      if (!hallado || !hallado.toma.estaciones[estacionIndice]) {
        // Perder una lectura en silencio es lo peor que puede hacer esta app.
        console.error(
          `Se intentó escribir una lectura en la estación ${estacionIndice + 1}, que no existe.`,
        )
        return {}
      }

      return {
        proyecto: marcarModificado(
          conToma(s.proyecto, campaniaId, (toma) => ({
            ...toma,
            estaciones: toma.estaciones.map((e, i) =>
              i === estacionIndice
                ? { ...e, intermedias: [...e.intermedias, { id: nuevoId('l'), ...lectura }] }
                : e,
            ),
          })),
        ),
      }
    }),

  actualizarLectura: (campaniaId, lecturaId, valor) =>
    set((s) => ({
      proyecto: marcarModificado(
        conToma(s.proyecto, campaniaId, (toma) => ({
          ...toma,
          estaciones: toma.estaciones.map((e) => ({
            ...e,
            vistaAtras: e.vistaAtras.id === lecturaId ? { ...e.vistaAtras, valor } : e.vistaAtras,
            intermedias: e.intermedias.map((l) => (l.id === lecturaId ? { ...l, valor } : l)),
            vistaAdelante:
              e.vistaAdelante && e.vistaAdelante.id === lecturaId
                ? { ...e.vistaAdelante, valor }
                : e.vistaAdelante,
          })),
        })),
      ),
    })),

  eliminarLectura: (campaniaId, lecturaId) =>
    set((s) => ({
      proyecto: marcarModificado(
        conToma(s.proyecto, campaniaId, (toma) => ({
          ...toma,
          estaciones: toma.estaciones.map((e) => ({
            ...e,
            intermedias: e.intermedias.filter((l) => l.id !== lecturaId),
          })),
        })),
      ),
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
    set((s) => {
      // Una capa no se compara consigo misma: si ambos lados quedarían
      // apuntando a la misma campaña, la de arriba se limpia.
      const mismaCampania = superior !== null && superior === inferior

      // Red de seguridad para si algún camino futuro llega hasta aquí con
      // una pareja de calles distintas sin que actualizarCampania la haya
      // limpiado antes: sus claves de celda coinciden entre calles, así que
      // la resta daría un número sin ningún sentido físico.
      const calleInferior = calleDeToma(s.proyecto, inferior)
      const calleSuperior = calleDeToma(s.proyecto, superior)
      const callesDistintas = calleInferior !== null && calleSuperior !== null && calleInferior !== calleSuperior

      return {
        comparacion: { inferior, superior: mismaCampania || callesDistintas ? null : superior },
      }
    }),

  girarCamara: (grados) =>
    set((s) => ({ camara: camaraValida({ ...s.camara, giro: s.camara.giro + grados }) })),

  fijarCamara: (camara) => set({ camara: camaraValida(camara) }),

  fijarExageracion: (factor) =>
    set((s) => ({ camara: camaraValida({ ...s.camara, exageracion: factor }) })),

  fijarModoVista3D: (modo) => set({ modoVista3D: modo }),

  calcular: () => {
    const { proyecto, campaniaActivaId } = get()
    const hallado = buscarToma(proyecto, campaniaActivaId)
    if (!hallado) return null

    const calle = proyecto.calles.find((c) => c.id === hallado.calleId)
    if (!calle) return null

    return calcularCampania({ campania: hallado.toma, calle, bms: proyecto.bms })
  },
}))
