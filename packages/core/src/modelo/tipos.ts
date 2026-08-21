export type Id = string

// ---------- Banco de nivel ----------

export type TipoBM = 'oficial' | 'auxiliar'

export interface BM {
  id: Id
  nombre: string
  cota: number
  tipo: TipoBM
  descripcion: string
}

// ---------- Plantilla transversal ----------

export type TipoElemento =
  | 'vereda'
  | 'sardinel'
  | 'calzada'
  | 'eje'
  | 'peloAgua'
  | 'existente'
  | 'otro'

export interface ElementoPlantilla {
  clave: string
  etiqueta: string
  /** Metros desde el eje. Negativo = izquierda. */
  offset: number
  tipo: TipoElemento
}

export interface Plantilla {
  id: Id
  nombre: string
  elementos: ElementoPlantilla[]
}

// ---------- Rasante de proyecto ----------

export type TipoTramo = 'pendiente' | 'salto'

/**
 * Un tramo de la sección transversal, leído desde el eje hacia afuera.
 *
 * Convención de signos, y es la que hay que tener clara: un valor **positivo
 * baja** al alejarse del eje, uno **negativo sube**. Así el bombeo de la
 * calzada es `+2.0` y la vereda, que cae hacia la calzada, es `-1.5`.
 *
 * Un tramo de tipo `salto` aplica su desnivel **entero al alcanzar
 * `hastaOffset`**, no repartido: es la cara vertical del sardinel, que en la
 * plantilla ocupa los pocos centímetros que van del borde de calzada al
 * sardinel.
 */
export interface TramoTransversal {
  nombre: string
  /** Distancia desde el eje, en metros, donde termina este tramo. Siempre positiva. */
  hastaOffset: number
  tipo: TipoTramo
  /** Porcentaje si es `pendiente`; metros si es `salto`. */
  valor: number
}

export interface Rasante {
  progresivaArranque: number
  cotaArranque: number
  /** Porcentaje. Negativo = la calle baja al avanzar de progresiva. */
  pendienteLongitudinal: number
  /** Del eje hacia afuera. Vale para el lado derecho, y para el izquierdo si `simetrica`. */
  tramos: TramoTransversal[]
  simetrica: boolean
  /** Solo se usa cuando `simetrica` es false. */
  tramosIzquierda: TramoTransversal[] | null
}

// ---------- Calle ----------

export interface Calle {
  id: Id
  nombre: string
  plantillaId: Id
  progresivaInicio: number
  progresivaFin: number
  intervalo: number
  progresivasExtra: number[]
  /** Null mientras la calle no tenga proyecto cargado: la app funciona igual, sin cota teórica. */
  rasante: Rasante | null
}

// ---------- Capa ----------

export interface Capa {
  id: Id
  nombre: string
  /**
   * Posición en el paquete estructural, de abajo hacia arriba: 0 es el
   * terreno existente, y el número crece capa por capa hasta la carpeta
   * asfáltica. Consecutivo y sin huecos: se mantiene así con `ordenarCapas`
   * y `renumerarCapas` (`./capas`), de las que depende el espesor real
   * colocado entre una capa y la de abajo.
   */
  orden: number
  /** Metros de material que aporta esta capa. Cero mientras no se defina. */
  espesor: number
  /** Milímetros admitidos por encima y por debajo de la cota teórica. */
  toleranciaMm: number
}

// ---------- Destinos de lectura ----------

export interface Celda {
  progresiva: number
  elementoClave: string
}

export interface PuntoSuelto {
  etiqueta: string
  offset: number
  notas: string
}

export type DestinoLectura =
  | { tipo: 'bm'; bmId: Id }
  | { tipo: 'cambio'; nombre: string }
  | { tipo: 'celda'; celda: Celda }
  | { tipo: 'suelto'; punto: PuntoSuelto }

export interface Lectura {
  id: Id
  destino: DestinoLectura
  /** Lectura de mira en metros. */
  valor: number
}

export interface Estacion {
  id: Id
  vistaAtras: Lectura
  intermedias: Lectura[]
  /** Ausente en la última estación de un circuito abierto. */
  vistaAdelante?: Lectura
}

// ---------- Cierre ----------

export type TipoCierre = 'cerrado' | 'enlace' | 'abierto'
export type ClaseNivelacion = 'precision' | 'tercerOrden' | 'personalizada'

export interface ConfigCierre {
  tipo: TipoCierre
  bmFinalId?: Id
  /** Longitud del circuito en kilómetros. */
  longitudK: number
  /** Si es true, longitudK se recalcula desde las progresivas de la calle. */
  longitudKAuto: boolean
  clase: ClaseNivelacion
  /** Coeficiente e de la fórmula T = e·raiz(K), en milímetros. */
  coeficiente: number
}

export const COEFICIENTE_POR_CLASE: Record<Exclude<ClaseNivelacion, 'personalizada'>, number> = {
  precision: 7,
  tercerOrden: 12,
}

// ---------- Campaña ----------

export interface Campania {
  id: Id
  /** Fecha ISO: 2026-08-19 */
  fecha: string
  calleId: Id
  capaId: Id
  bmInicialId: Id
  estaciones: Estacion[]
  cierre: ConfigCierre
  estado: 'abierta' | 'cerrada'
}

// ---------- Proyecto ----------

export interface MetaProyecto {
  nombre: string
  obra: string
  cliente: string
  ubicacion: string
  responsable: string
  creado: string
  modificado: string
}

export interface Proyecto {
  version: 1
  meta: MetaProyecto
  bms: BM[]
  plantillas: Plantilla[]
  calles: Calle[]
  capas: Capa[]
  campanias: Campania[]
}
