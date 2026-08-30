import type { Id } from './ids'
import type { Seccion } from '../seccion/seccion'

export type { Id }

// ---------- Banco de nivel ----------

export type TipoBM = 'oficial' | 'auxiliar'

export interface BM {
  id: Id
  nombre: string
  cota: number
  tipo: TipoBM
  descripcion: string
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

/**
 * Una calle, con su sección transversal declarada.
 *
 * La sección es **de cada calle**, no de una plantilla compartida: la misma
 * obra puede tener una avenida de 4.20 m de media calzada y un jirón de
 * 3.10 m, y las dos usan la misma palabra para el borde. Max señaló que
 * atarlas a una plantilla global era justo lo que no servía.
 */
export interface Calle {
  id: Id
  nombre: string
  seccion: Seccion
  nivelaciones: Nivelacion[]
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

export interface ConfiguracionCierre {
  tipo: TipoCierre
  bmFinalId?: Id
  /** Longitud del circuito en kilómetros. */
  longitudK: number
  /** Si es true, longitudK se recalcula desde las progresivas medidas de la toma. */
  longitudKAuto: boolean
  clase: ClaseNivelacion
  /** Coeficiente e de la fórmula T = e·raiz(K), en milímetros. */
  coeficiente: number
}

export const COEFICIENTE_POR_CLASE: Record<Exclude<ClaseNivelacion, 'personalizada'>, number> = {
  precision: 7,
  tercerOrden: 12,
}

// ---------- Nivelación ----------

/** Una salida a campo. Es lo que hasta ahora se llamaba campaña. */
export interface Toma {
  id: Id
  fecha: string
  capaId: Id
  bmInicialId: Id
  estaciones: Estacion[]
  cierre: ConfiguracionCierre
}

/**
 * Una superficie completa, que puede haber costado varios días de campo.
 *
 * Hoy se mide del 0+000 al 0+100 y mañana del 0+100 al 0+200, enlazando por el
 * punto de cambio que dejó la anterior: las dos tomas son **la misma
 * superficie**. Lo que se compara entre sí son nivelaciones, nunca tomas.
 */
export interface Nivelacion {
  id: Id
  nombre: string
  /** El que la identifica en la lista y en todas las vistas. */
  color: string
  tomas: Toma[]
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
  calles: Calle[]
  capas: Capa[]
}
