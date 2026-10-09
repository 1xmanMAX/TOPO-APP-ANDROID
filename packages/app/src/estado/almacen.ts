import {
  anadirPalabra,
  CAMARA_ISOMETRICA,
  calcularCampania,
  capaEnUso,
  esPalabraDe,
  ladoDe,
  mismaPalabra,
  moverCapa,
  nombreDePunto,
  partirClaveCelda,
  progresivasMedidas,
  redondear3,
  renumerarCapas,
  seccionDeFabrica,
  type BM,
  type Calle,
  type Camara,
  type Capa,
  type DestinoLectura,
  type Id,
  type Lectura,
  type Proyecto,
  type Rasante,
  type ResultadoCampania,
  type Rol,
  type Seccion,
  type Toma,
  type Instrumento,
  type Nota,
  type Pista,
  type PlanControles,
  type PlanoImportado,
} from '@topo/core'
import { create } from 'zustand'
import type { ArchivosDePlano } from '../archivo/topo'
import type { HojaInterpretada, ReferenciaLeida } from '../importar/interpretar'
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

// ---------- Navegación (sección 5.1 y 5.2 del diseño del rediseño) ----------

/** Los tres espacios de la barra superior. */
export type Espacio = 'obra' | 'calle' | 'informes'
/** Las dos pantallas de Obra. */
export type SubObra = 'calles' | 'plano'
/** Los tres modos sobre la misma vista de la calle. */
export type ModoCalle = 'medir' | 'revisar' | 'replantear'
/** Pantallas de la calle que tapan los modos mientras están abiertas. */
export type PantallaCalle = 'niveles' | 'analisis' | 'cierre' | 'planificar' | 'guia'
/** Las pestañas de Calle › Análisis. */
export type PestanaAnalisis = 'espesores' | 'separacion' | 'volumenes' | 'drenaje'

/**
 * Las siete pantallas de antes del rediseño. Ya no mandan en la navegación:
 * solo se conservan para que las vistas viejas, que siguen montadas como
 * piezas dentro de las nuevas, puedan seguir llamando a `irA` sin cambios.
 * @deprecated Usar `irAEspacio`, `irASubObra`, `fijarModoCalle` y `abrirPantallaCalle`.
 */
export type Vista = 'proyecto' | 'calle' | 'seccion' | 'subir' | 'campanias' | 'libreta' | 'resultados'

/** Lo que se puede cambiar de un plano después de importarlo (el formato no: son otros bytes). */
export type CambiosPlano = Partial<Omit<PlanoImportado, 'id' | 'formato'>>

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
  /** Bytes de cada plano importado, por id de plano. Ver `PlanoImportado`. */
  archivosDePlano: ArchivosDePlano

  espacio: Espacio
  subObra: SubObra
  modoCalle: ModoCalle
  /** Null: se ven los modos. Con valor, esa pantalla de la calle tapa los modos. */
  pantallaCalle: PantallaCalle | null
  /**
   * La pestaña abierta en Análisis. Vive aquí y no en la pantalla para que
   * Replantear pueda abrir Análisis › Separación directamente.
   */
  pestanaAnalisis: PestanaAnalisis
  calculadoraAbierta: boolean
  /**
   * La calle en la que se trabaja. Va sincronizada con la toma activa:
   * activar una toma activa su calle, y activar una calle activa su última
   * toma (o ninguna, si todavía no tiene).
   */
  calleActivaId: Id | null

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
  /**
   * Cuántas veces se reemplazó el proyecto entero (abrir un .topo, Nuevo,
   * recuperar). Sirve para enterarse de que el proyecto en pantalla ya es
   * otro, sin confundirlo con una edición.
   */
  cargas: number

  /** Los bytes de los planos que trae el proyecto; sin ellos, los planos quedan declarados pero sin archivo. */
  cargarProyecto(proyecto: Proyecto, archivosDePlano?: ArchivosDePlano): void
  nuevoProyecto(): void
  /** @deprecated Traduce una pantalla vieja a la navegación nueva; solo para las vistas viejas. */
  irA(vista: Vista): void

  irAEspacio(espacio: Espacio): void
  irASubObra(sub: SubObra): void
  fijarModoCalle(modo: ModoCalle): void
  abrirPantallaCalle(pantalla: PantallaCalle | null): void
  /** Abre Calle › Análisis en esa pestaña. */
  abrirAnalisis(pestana: PestanaAnalisis): void
  fijarPestanaAnalisis(pestana: PestanaAnalisis): void
  activarCalle(id: Id | null): void
  abrirCalculadora(abierta: boolean): void

  fijarInstrumento(parcial: Partial<Instrumento>): void

  agregarPlano(datos: Omit<PlanoImportado, 'id'>, bytes: Uint8Array): Id
  actualizarPlano(id: Id, cambios: CambiosPlano): void
  eliminarPlano(id: Id): void

  agregarPista(datos: Omit<Pista, 'id'>): Id
  actualizarPista(id: Id, cambios: Partial<Omit<Pista, 'id'>>): void
  eliminarPista(id: Id): void
  /** Crea la calle de la pista (sección de fábrica, nombre de la pista) y las deja enlazadas. Null si la pista no existe. */
  crearCalleDesdePista(pistaId: Id): Id | null

  agregarNota(calleId: Id, datos: Omit<Nota, 'id'>): Id
  eliminarNota(calleId: Id, notaId: Id): void
  fijarPlanControles(calleId: Id, plan: PlanControles | null): void

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

  importarHoja(calleId: Id, hoja: HojaInterpretada, fecha: string, capaId: Id): void

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
  declararProgresiva(campaniaId: Id, progresiva: number): void
  quitarProgresivaDeclarada(campaniaId: Id, progresiva: number): void

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

/**
 * Cómo se llama en la libreta una lectura sobre algo existente y fijo: el
 * elemento tal como se escribió en la hoja —«cuneta», «calzada»— y de qué
 * lado del eje cayó.
 *
 * El lado va en el nombre porque la misma cosa se mide a los dos lados de la
 * calle, y dos lecturas llamadas igual no se distinguirían ni en la libreta
 * ni de oído.
 */
function nombreDeReferencia(referencia: ReferenciaLeida): string {
  const lado = ladoDe(referencia.distancia)
  if (lado === 'eje') return `${referencia.elemento} en el eje`
  return `${referencia.elemento} a la ${lado}`
}

/**
 * La toma que sale de una hoja ya interpretada.
 *
 * Una sola estación, porque la hoja trae una sola lectura al punto de control:
 * el instrumento se plantó una vez. Y el circuito nace **abierto**, que es lo
 * que de verdad es —un punto de control y ninguna vuelta—, así que las cotas
 * salen pero quedan sin comprobar en vez de aparentar estarlo.
 *
 * Las referencias entran como puntos sueltos y no como celdas de la grilla:
 * no pertenecen a ninguna progresiva, pero sí se calculan desde esta misma
 * estación, que es justo lo que Max pidió para ellas.
 */
function tomaDesdeHoja(hoja: HojaInterpretada, fecha: string, capaId: Id, bmInicialId: Id): Toma {
  const deLaGrilla: Lectura[] = hoja.lecturas.map((lectura) => ({
    id: nuevoId('l'),
    destino: {
      tipo: 'celda',
      celda: { progresiva: lectura.progresiva, elementoClave: lectura.puntoId },
    },
    valor: lectura.valor,
  }))

  const deReferencia: Lectura[] = hoja.referencias.map((referencia) => ({
    id: nuevoId('l'),
    destino: {
      tipo: 'suelto',
      punto: {
        etiqueta: nombreDeReferencia(referencia),
        offset: referencia.distancia,
        notas: 'Leída de la hoja como algo existente y fijo.',
      },
    },
    valor: referencia.valor,
  }))

  return {
    id: nuevoId('camp'),
    fecha,
    capaId,
    bmInicialId,
    // Las progresivas de la hoja llegan dentro de sus lecturas, así que la
    // tabla ya las tiene por medidas: declararlas aquí además sería guardar
    // dos veces lo mismo. Queda vacía, lista para las que Max añada a mano.
    progresivasDeclaradas: [],
    cierre: {
      tipo: 'abierto',
      longitudK: 0,
      longitudKAuto: true,
      clase: 'tercerOrden',
      coeficiente: 12,
    },
    estaciones: [
      {
        id: nuevoId('e'),
        // La vista atrás de la hoja es la lectura al punto de control, y se
        // enlaza con el banco de nivel del proyecto, que es lo que le da cota.
        // Si la hoja no la traía, queda en 0: el motor no da por usable una
        // lectura de 0, así que las cotas quedan pendientes en vez de salir
        // inventadas desde una altura de instrumento que nadie midió.
        vistaAtras: {
          id: nuevoId('l'),
          destino: { tipo: 'bm', bmId: bmInicialId },
          valor: hoja.vistaAtras ?? 0,
        },
        intermedias: [...deLaGrilla, ...deReferencia],
      },
    ],
  }
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

/**
 * La toma con la que se sigue trabajando en una calle: la última de su última
 * nivelación, que es la más reciente en entrar. Null si la calle no tiene
 * ninguna todavía.
 */
function ultimaTomaDeCalle(proyecto: Proyecto, calleId: Id | null): Id | null {
  const calle = proyecto.calles.find((c) => c.id === calleId)
  if (!calle) return null
  for (let i = calle.nivelaciones.length - 1; i >= 0; i -= 1) {
    const tomas = calle.nivelaciones[i]!.tomas
    const ultima = tomas[tomas.length - 1]
    if (ultima) return ultima.id
  }
  return null
}

/** La calle activa que corresponde a una toma; sin toma, la que ya estaba si sigue existiendo, o la primera. */
function calleParaToma(proyecto: Proyecto, tomaId: Id | null, calleActual: Id | null): Id | null {
  const deLaToma = calleDeToma(proyecto, tomaId)
  if (deLaToma) return deLaToma
  if (calleActual && proyecto.calles.some((c) => c.id === calleActual)) return calleActual
  return proyecto.calles[0]?.id ?? null
}

/** Solo los bytes de planos que el proyecto declara: los demás no tienen a qué pegarse. */
function archivosDeclarados(proyecto: Proyecto, archivos: ArchivosDePlano): ArchivosDePlano {
  const salida: ArchivosDePlano = {}
  for (const plano of proyecto.planos ?? []) {
    const bytes = archivos[plano.id]
    if (bytes) salida[plano.id] = bytes
  }
  return salida
}

/** Cambia una calle y deja el resto del proyecto como estaba. */
function conCalle(proyecto: Proyecto, calleId: Id, cambiar: (calle: Calle) => Calle): Proyecto {
  return marcarModificado({
    ...proyecto,
    calles: proyecto.calles.map((calle) => (calle.id === calleId ? cambiar(calle) : calle)),
  })
}

/** A dónde lleva cada pantalla vieja en la navegación nueva. */
function navegacionDeVistaVieja(
  vista: Vista,
): Pick<EstadoApp, 'espacio'> & Partial<Pick<EstadoApp, 'subObra' | 'modoCalle' | 'pantallaCalle'>> {
  switch (vista) {
    case 'libreta':
      return { espacio: 'calle', modoCalle: 'medir', pantallaCalle: null }
    case 'resultados':
      return { espacio: 'calle', modoCalle: 'revisar', pantallaCalle: null }
    default:
      // Proyecto, calle, sección, subir datos y campañas viven hoy juntas en Obra › Calles.
      return { espacio: 'obra', subObra: 'calles' }
  }
}

const proyectoInicial = proyectoEjemplo()
const tomaInicial = primeraTomaId(proyectoInicial)

export const useAlmacen = create<EstadoApp>((set, get) => ({
  proyecto: proyectoInicial,
  archivosDePlano: {},
  espacio: 'obra',
  subObra: 'calles',
  modoCalle: 'medir',
  pantallaCalle: null,
  pestanaAnalisis: 'espesores',
  calculadoraAbierta: false,
  calleActivaId: calleParaToma(proyectoInicial, tomaInicial, null),
  campaniaActivaId: tomaInicial,
  estacionActiva: 0,
  seleccion: { clave: null, progresiva: null },
  capasVisibles: [],
  comparacion: SIN_COMPARACION,
  camara: CAMARA_ISOMETRICA,
  modoVista3D: 'estado',
  cargas: 0,

  cargarProyecto: (proyecto, archivosDePlano = {}) => {
    const primeraId = primeraTomaId(proyecto)
    return set((s) => ({
      cargas: s.cargas + 1,
      proyecto,
      archivosDePlano: archivosDeclarados(proyecto, archivosDePlano),
      calleActivaId: calleParaToma(proyecto, primeraId, null),
      campaniaActivaId: primeraId,
      estacionActiva: ultimaEstacion(buscarToma(proyecto, primeraId)?.toma),
      // Una pantalla de la calle abierta (el cierre, el planificador) era de
      // la calle del proyecto anterior: se cierra. El espacio se conserva.
      pantallaCalle: null,
      pestanaAnalisis: 'espesores',
      seleccion: { clave: null, progresiva: null },
      capasVisibles: [],
      comparacion: SIN_COMPARACION,
    }))
  },

  nuevoProyecto: () =>
    set((s) => ({
      cargas: s.cargas + 1,
      proyecto: proyectoVacio(),
      archivosDePlano: {},
      calleActivaId: null,
      campaniaActivaId: null,
      estacionActiva: 0,
      espacio: 'obra',
      subObra: 'calles',
      pantallaCalle: null,
      pestanaAnalisis: 'espesores',
      seleccion: { clave: null, progresiva: null },
      capasVisibles: [],
      comparacion: SIN_COMPARACION,
    })),

  irA: (vista) => set(navegacionDeVistaVieja(vista)),

  irAEspacio: (espacio) => set({ espacio }),

  irASubObra: (sub) => set({ espacio: 'obra', subObra: sub }),

  // Elegir un modo es volver a la vista de la calle: cierra la pantalla que la tapaba.
  fijarModoCalle: (modo) => set({ espacio: 'calle', modoCalle: modo, pantallaCalle: null }),

  abrirPantallaCalle: (pantalla) => set({ espacio: 'calle', pantallaCalle: pantalla }),

  abrirAnalisis: (pestana) => set({ espacio: 'calle', pantallaCalle: 'analisis', pestanaAnalisis: pestana }),

  fijarPestanaAnalisis: (pestana) => set({ pestanaAnalisis: pestana }),

  activarCalle: (id) =>
    set((s) => {
      if (id !== null && !s.proyecto.calles.some((c) => c.id === id)) return {}
      if (id === s.calleActivaId) return {}
      const tomaId = ultimaTomaDeCalle(s.proyecto, id)
      return {
        calleActivaId: id,
        campaniaActivaId: tomaId,
        estacionActiva: ultimaEstacion(buscarToma(s.proyecto, tomaId)?.toma),
        seleccion: { clave: null, progresiva: null },
        ...seleccionDeCapasTrasCambio(s.calleActivaId, id, s),
      }
    }),

  abrirCalculadora: (abierta) => set({ calculadoraAbierta: abierta }),

  fijarInstrumento: (parcial) =>
    set((s) => ({
      proyecto: marcarModificado({ ...s.proyecto, instrumento: { ...s.proyecto.instrumento, ...parcial } }),
    })),

  agregarPlano: (datos, bytes) => {
    const id = nuevoId('plano')
    set((s) => ({
      proyecto: marcarModificado({ ...s.proyecto, planos: [...(s.proyecto.planos ?? []), { ...datos, id }] }),
      // Objeto nuevo, no mutado: el autoguardado de planos mira si cambió la referencia.
      archivosDePlano: { ...s.archivosDePlano, [id]: bytes },
    }))
    return id
  },

  actualizarPlano: (id, cambios) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        planos: (s.proyecto.planos ?? []).map((plano) => (plano.id === id ? { ...plano, ...cambios } : plano)),
      }),
    })),

  eliminarPlano: (id) =>
    set((s) => {
      if (!(s.proyecto.planos ?? []).some((plano) => plano.id === id)) return {}
      const { [id]: _quitado, ...archivosDePlano } = s.archivosDePlano
      return {
        proyecto: marcarModificado({
          ...s.proyecto,
          planos: (s.proyecto.planos ?? []).filter((plano) => plano.id !== id),
          // Las pistas del plano se van con él: su eje está en las unidades de
          // ese dibujo y sin él no ubica nada. Las calles enlazadas se quedan.
          pistas: (s.proyecto.pistas ?? []).filter((pista) => pista.planoId !== id),
        }),
        archivosDePlano,
      }
    }),

  agregarPista: (datos) => {
    const id = nuevoId('pista')
    set((s) => ({
      proyecto: marcarModificado({ ...s.proyecto, pistas: [...(s.proyecto.pistas ?? []), { ...datos, id }] }),
    }))
    return id
  },

  actualizarPista: (id, cambios) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        pistas: (s.proyecto.pistas ?? []).map((pista) => (pista.id === id ? { ...pista, ...cambios } : pista)),
      }),
    })),

  eliminarPista: (id) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        pistas: (s.proyecto.pistas ?? []).filter((pista) => pista.id !== id),
      }),
    })),

  crearCalleDesdePista: (pistaId) => {
    const { proyecto } = get()
    const pista = (proyecto.pistas ?? []).find((p) => p.id === pistaId)
    if (!pista) return null
    // Tocar dos veces no crea dos calles: si ya tiene la suya, es esa.
    if (pista.calleId && proyecto.calles.some((calle) => calle.id === pista.calleId)) return pista.calleId

    const calleId = nuevoId('c')
    set((s) => ({
      calleActivaId: s.calleActivaId ?? calleId,
      proyecto: marcarModificado({
        ...s.proyecto,
        calles: [
          ...s.proyecto.calles,
          { id: calleId, nombre: pista.nombre, seccion: seccionDeFabrica(), nivelaciones: [], rasante: null },
        ],
        pistas: (s.proyecto.pistas ?? []).map((p) => (p.id === pistaId ? { ...p, calleId } : p)),
      }),
    }))
    return calleId
  },

  agregarNota: (calleId, datos) => {
    const id = nuevoId('nota')
    set((s) => ({
      proyecto: conCalle(s.proyecto, calleId, (calle) => ({ ...calle, notas: [...(calle.notas ?? []), { ...datos, id }] })),
    }))
    return id
  },

  eliminarNota: (calleId, notaId) =>
    set((s) => ({
      proyecto: conCalle(s.proyecto, calleId, (calle) => ({
        ...calle,
        notas: (calle.notas ?? []).filter((nota) => nota.id !== notaId),
      })),
    })),

  fijarPlanControles: (calleId, plan) =>
    set((s) => ({ proyecto: conCalle(s.proyecto, calleId, (calle) => ({ ...calle, planControles: plan })) })),

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
      // La primera calle de una obra vacía pasa a ser la activa: si no, la
      // pantalla de la calle seguiría diciendo que no hay ninguna.
      calleActivaId: s.calleActivaId ?? id,
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
    set((s) => {
      const proyecto = marcarModificado({
        ...s.proyecto,
        calles: s.proyecto.calles.filter((c) => c.id !== id),
        // La pista se queda en el plano; solo pierde el enlace a la calle borrada.
        ...(s.proyecto.pistas
          ? {
              pistas: s.proyecto.pistas.map((p) => {
                if (p.calleId !== id) return p
                const { calleId: _borrada, ...suelta } = p
                return suelta
              }),
            }
          : {}),
      })
      if (s.calleActivaId !== id) return { proyecto }

      // Se borró la calle en la que se trabajaba: se pasa a la primera que
      // quede, con su última toma, en vez de dejar ids que no apuntan a nada.
      const calleNueva = proyecto.calles[0]?.id ?? null
      const tomaNueva = ultimaTomaDeCalle(proyecto, calleNueva)
      return {
        proyecto,
        calleActivaId: calleNueva,
        campaniaActivaId: tomaNueva,
        estacionActiva: ultimaEstacion(buscarToma(proyecto, tomaNueva)?.toma),
        pantallaCalle: null,
        seleccion: { clave: null, progresiva: null },
        capasVisibles: [],
        comparacion: SIN_COMPARACION,
      }
    }),

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

  importarHoja: (calleId, hoja, fecha, capaId) =>
    set((s) => {
      const bm = s.proyecto.bms[0]
      const calleExiste = s.proyecto.calles.some((calle) => calle.id === calleId)

      // La pantalla no deja llegar hasta aquí sin banco de nivel ni sin calle.
      // Si algún camino futuro lo hiciera, se dice en voz alta: una hoja de
      // campo que desaparece sin dejar rastro es lo peor que puede pasar aquí.
      if (!bm || !calleExiste) {
        console.error(
          'No se pudo importar la hoja: hace falta una calle de destino y un banco de nivel en el proyecto.',
        )
        return {}
      }

      const toma = tomaDesdeHoja(hoja, fecha, capaId, bm.id)
      const calleAnterior = calleDeToma(s.proyecto, s.campaniaActivaId)

      return {
        // Importar añade y nunca pisa: la hoja entra como una nivelación más
        // de la calle, junto a las que ya estaban.
        proyecto: marcarModificado(
          agregarTomaComoNivelacion(s.proyecto, calleId, toma, nuevoId('niv')),
        ),
        calleActivaId: calleId,
        campaniaActivaId: toma.id,
        estacionActiva: 0,
        ...seleccionDeCapasTrasCambio(calleAnterior, calleId, s),
      }
    }),

  agregarCampania: (datos) => {
    const { calleId, ...restoDatos } = datos
    const id = nuevoId('camp')
    set((s) => {
      const calleAnterior = calleDeToma(s.proyecto, s.campaniaActivaId)
      const toma: Toma = {
        ...restoDatos,
        id,
        // Nace sin ninguna progresiva declarada, salvo que quien la crea traiga
        // las suyas: las declara el topógrafo en la libreta según va midiendo,
        // una a una. No se inventa aquí una serie «cada 20 m» porque las suyas
        // son 6, 10, 20, 30… — irregulares al principio y regulares después.
        progresivasDeclaradas: restoDatos.progresivasDeclaradas ?? [],
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
        calleActivaId: calleId,
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
      // La calle activa sigue a la toma activa: si es ella la que se mudó, se muda también.
      const calleActivaId = calleParaToma(proyecto, s.campaniaActivaId, s.calleActivaId)

      if (calleEditadaAnterior !== calleEditadaNueva) {
        return {
          proyecto,
          calleActivaId,
          capasVisibles: capasVisibles.filter((campaniaId) => campaniaId !== id),
          comparacion:
            comparacion.inferior === id || comparacion.superior === id ? SIN_COMPARACION : comparacion,
        }
      }

      return { proyecto, calleActivaId, capasVisibles, comparacion }
    }),

  activarCampania: (id) =>
    set((s) => {
      const calleAnterior = calleDeToma(s.proyecto, s.campaniaActivaId)
      const calleNueva = calleDeToma(s.proyecto, id)
      return {
        calleActivaId: calleParaToma(s.proyecto, id, s.calleActivaId),
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

  declararProgresiva: (campaniaId, progresiva) =>
    set((s) => {
      const hallado = buscarToma(s.proyecto, campaniaId)
      if (!hallado) return {}

      // Se guarda ya redondeada, igual que la clave de cada celda: así la
      // fila declarada y la celda que va a recibir la lectura son la misma.
      const valor = redondear3(progresiva)
      const declaradas = hallado.toma.progresivasDeclaradas ?? []
      // Declarar dos veces la misma no es un error, pero tampoco es un
      // cambio: no tiene por qué marcar el proyecto como modificado.
      if (declaradas.some((suya) => redondear3(suya) === valor)) return {}

      return {
        proyecto: marcarModificado(
          conToma(s.proyecto, campaniaId, (toma) => ({
            ...toma,
            progresivasDeclaradas: [...declaradas, valor].sort((a, b) => a - b),
          })),
        ),
      }
    }),

  quitarProgresivaDeclarada: (campaniaId, progresiva) =>
    set((s) => {
      const hallado = buscarToma(s.proyecto, campaniaId)
      if (!hallado) return {}

      const valor = redondear3(progresiva)
      // Una progresiva con lecturas no se quita. La lectura seguiría
      // guardada, pero fuera de la tabla: desaparecería de la pantalla y de
      // lo exportado sin que nada lo dijera, que es la manera más silenciosa
      // de perder un dato de campo. La pantalla lo explica antes de llegar
      // aquí; esto es la red por si algún camino futuro no lo hace.
      if (progresivasMedidas(hallado.toma.estaciones).some((medida) => redondear3(medida) === valor)) {
        return {}
      }

      return {
        proyecto: marcarModificado(
          conToma(s.proyecto, campaniaId, (toma) => ({
            ...toma,
            progresivasDeclaradas: (toma.progresivasDeclaradas ?? []).filter(
              (suya) => redondear3(suya) !== valor,
            ),
          })),
        ),
      }
    }),

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
