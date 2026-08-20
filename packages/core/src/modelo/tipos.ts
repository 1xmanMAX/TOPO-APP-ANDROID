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

// ---------- Calle ----------

export interface Calle {
  id: Id
  nombre: string
  plantillaId: Id
  progresivaInicio: number
  progresivaFin: number
  intervalo: number
  progresivasExtra: number[]
}

// ---------- Capa ----------

export interface Capa {
  id: Id
  nombre: string
  orden: number
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
