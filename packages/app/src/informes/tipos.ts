/*
 * Entradas de los informes PDF. Son estructuras propias y planas a propósito:
 * el informe no lee el almacén de la app, recibe lo que tiene que imprimir.
 * Así se prueba con datos escritos a mano y la interfaz decide de dónde salen.
 *
 * Unidades: progresivas, cotas, lecturas y espesores en metros; diferencias y
 * tolerancias en milímetros.
 */

export interface BancoDeNivel {
  nombre: string
  cota: number
}

export interface Encabezado {
  obra: string
  calle: string
  capa: string
  /** Tal como se quiere ver impresa: «05/10/2026». */
  fecha: string
  /** Texto libre: «0+000 a 0+120». */
  tramo: string
  bm: BancoDeNivel
  /** Tolerancia de obra (± mm) con la que se juzga cada punto. */
  toleranciaMm: number
  topografo?: string
  supervisor?: string
  /** Logo de la empresa como dataURL (PNG o JPEG). */
  logo?: string
}

export interface BaseInforme {
  encabezado: Encabezado
  /**
   * La nivelación de la que salen las cotas cerró contra el banco de nivel.
   * Si es `false`, cada página lleva la franja de aviso: regla dura del
   * proyecto, un dato sin comprobar no se imprime como si lo estuviera.
   */
  comprobado: boolean
  /** Notas de campo, una por línea. */
  notas?: string[]
  /**
   * Cuadros de firma al final. Si no se dice nada, salen cuando el encabezado
   * trae el nombre del topógrafo o del supervisor.
   */
  firmas?: boolean
}

/** Semáforo de tolerancia: hasta tol conforme, hasta 2×tol al límite, más allá fuera. */
export type EstadoInforme = 'conforme' | 'alLimite' | 'fuera'

/**
 * Lo que puede pasarle a un punto en el protocolo y el control. Además del
 * semáforo, las mismas categorías que cuenta la pantalla (`evaluarContraRasante`):
 * `sinMedir` y `sinRasante` (medido donde el proyecto no da cota). Y
 * `datoInvalido`: algún número de entrada no es número. Es su propia
 * categoría para que un NaN nunca se imprima como FUERA ni como «en cota».
 */
export type EstadoPunto = EstadoInforme | 'sinMedir' | 'sinRasante' | 'datoInvalido'

// ---- Protocolo de nivelación y control contra proyecto ----

export interface FilaProtocolo {
  progresiva: number
  punto: string
  /** `null` si el proyecto no define cota en ese punto (fuera de la sección): «sin rasante». */
  cotaProyecto: number | null
  /** `null` (o `undefined`) si el punto todavía no se midió. */
  cotaMedida: number | null
}

export interface DatosProtocolo extends BaseInforme {
  filas: FilaProtocolo[]
}

/** El control lista lo que hay que corregir; usa las mismas filas que el protocolo. */
export type DatosControl = DatosProtocolo

// ---- Libreta con cierre ----

export interface FilaLibreta {
  punto: string
  /** Vista atrás (lectura sobre un punto de cota conocida). */
  atras: number | null
  /**
   * Vista intermedia: un punto que se lee sin cambiar de estación (casi todos
   * los de una calle). No entra en las sumas de la comprobación aritmética.
   */
  intermedia: number | null
  adelante: number | null
  alturaInstrumental: number | null
  cota: number | null
  /** Corrección que le tocó en la compensación, en mm. */
  correccionMm?: number | null
  cotaCompensada?: number | null
}

export interface CierreLibreta {
  /** Punto donde se cerró (el BM u otro de cota conocida). */
  puntoDeCierre: string
  /** Cota a la que llegó la nivelación en el punto de cierre. */
  cotaCalculada: number
  /** Cota que ese punto tiene de verdad. */
  cotaConocida: number
  /**
   * Tolerancia del circuito (12 mm·√K en la app), tal como la da el núcleo:
   * sin redondear. El informe la imprime con un decimal y juzga el cierre con
   * el mismo criterio que `calcularCierre` (error sin redondear, holgura de
   * una milésima de mm), para que el PDF y la pantalla no discrepen.
   */
  toleranciaMm: number
  distanciaKm?: number
  /** Cómo se repartió el error, en palabras. */
  compensacion: string
}

export interface DatosLibreta extends BaseInforme {
  filas: FilaLibreta[]
  /** `null`: la nivelación no volvió a un punto de cota conocida. */
  cierre: CierreLibreta | null
}

// ---- Espesores ----

export interface FilaEspesor {
  progresiva: number
  punto: string
  cotaAbajo: number | null
  cotaArriba: number | null
  /** Espesor de proyecto, en metros. */
  espesorProyecto: number
}

export interface DatosEspesores extends BaseInforme {
  capaAbajo: string
  /** `null` si la capa de arriba todavía no existe. */
  capaArriba: string | null
  filas: FilaEspesor[]
}

// ---- Metrado ----

/** Áreas de una sección transversal (m²). Mismo formato que `SeccionConAreas` del núcleo. */
export interface SeccionMetrado {
  progresiva: number
  corte: number
  relleno: number
}

/** Volumen de un tramo entre dos secciones (m³). Mismo formato que `TramoDeVolumen` del núcleo. */
export interface TramoMetrado {
  desde: number
  hasta: number
  volCorte: number
  volRelleno: number
  /** El tramo es más largo que la separación usual de secciones: volumen más dudoso. */
  hueco?: boolean
}

/** Una sección que el núcleo dejó fuera, con el porqué. Mismo formato que `SeccionDescartada`. */
export interface SeccionDescartadaMetrado {
  /** Posición en `secciones`: así se señala aunque no tenga progresiva. */
  indice: number
  progresiva: number | null
  /** «sin progresiva», «area sin numero», «area negativa»… se imprime tal cual. */
  motivo: string
}

/**
 * Las secciones tal como llegaron (con repetidas o rotas, si las hubo) y el
 * resultado de `volumenesPorAreasMedias` del núcleo. Se puede pasar ese
 * resultado entero con `...volumenes`: los campos opcionales son los suyos.
 * Ojo: el resultado del núcleo trae su propio `comprobado`, y al esparcirlo
 * después de la base manda el suyo (que es el que vale para los volúmenes).
 */
export interface DatosMetrado extends BaseInforme {
  secciones: SeccionMetrado[]
  tramos: TramoMetrado[]
  /** Totales del núcleo; si vienen, se comprueba que cuadren con la suma de los tramos. */
  totalCorte?: number
  totalRelleno?: number
  /** Progresivas que llegaron más de una vez (el núcleo usó la primera sección). */
  duplicadas?: number[]
  /**
   * Secciones que no entraron: la lista del núcleo (con índice y motivo) o
   * solo cuántas. Si no viene, el informe las busca con el mismo criterio
   * básico (algún dato que no es número).
   */
  descartadas?: number | SeccionDescartadaMetrado[]
  /** Progresivas de secciones que entraron habiendo perdido puntos. */
  seccionesIncompletas?: number[]
  /** Menos de dos secciones válidas: los totales en 0 son «no se pudo calcular». */
  sinDatos?: boolean
  huecos?: { desde: number; hasta: number; longitud: number }[]
}

// ---- Hoja de estacas ----

export interface FilaEstaca {
  progresiva: number
  punto: string
  /** `null`: el proyecto no da cota aquí (sin rasante, fuera de sección…); ver `motivoSinCota`. */
  cotaProyecto: number | null
  /** Por qué no hay cota de proyecto, en palabras: «fuera de sección». */
  motivoSinCota?: string
  /** Si no viene, se calcula como altura instrumental − cota de proyecto. */
  lecturaObjetivo?: number | null
  /** La visual desde la estación pasa de la máxima (`fueraDeAlcance` del núcleo). */
  visualLarga?: boolean
}

/** Las reglas de la mira (diseño §2). Mismos nombres que `ReglasMira` del núcleo. */
export interface MiraInforme {
  largoMira?: number
  lecturaMin?: number
  margenSuperior?: number
}

export interface DatosEstacas extends BaseInforme {
  /** Altura instrumental de la puesta; `null` si todavía no se plantó el equipo. */
  alturaInstrumental: number | null
  filas: FilaEstaca[]
  /** Por defecto las de fábrica: mira de 5 m, leer entre 0.30 y 4.70. */
  mira?: MiraInforme
  /** Avisos generales (los de `hojaDeReplanteo` del núcleo), impresos tal cual. */
  avisos?: string[]
}
