import type { Id } from './ids'
import type { Instrumento } from './instrumento'
import type { Seccion } from '../seccion/seccion'
import type { Calibracion, Punto2 } from '../planos/geometria'
import type { MotivoControl, OpcionesControles } from '../planificar/controles'

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
  /**
   * Lo que el topógrafo anotó en campo sobre la calle («buzón tapado en la
   * 0+040»). Ausente en los archivos de antes de la ola 2: es lo mismo que vacía.
   */
  notas?: Nota[]
  /**
   * Los puntos de control que se decidieron en el planificador, para
   * dibujarlos en el plano y en la guía de campo. Ausente o null mientras no
   * se haya planificado.
   */
  planControles?: PlanControles | null
  /**
   * El perfil escrito a mano en el planificador (progresiva, cota), cuando no
   * hay rasante ni cotas del plano. Antes vivía solo en el navegador.
   */
  perfilDigitado?: { progresiva: number; cota: number }[]
  /**
   * La hoja de niveles de la calle: la herramienta «Pistas y veredas» de Max,
   * con sus puestas y sus conjuntos escritos a mano. Ausente en los archivos
   * de antes: es lo mismo que una hoja vacía.
   */
  niveles?: HojaNiveles
}

// ---------- Hoja de niveles («Pistas y veredas») ----------

/**
 * Una puesta del nivel: dónde se plantó el equipo y con qué altura
 * instrumental. Es del proyecto, una sola lista para todas las pantallas
 * (Niveles, el plano, la calculadora, Replantear, la hoja de estacas): la
 * vista atrás se escribe una vez y se usa en todas.
 *
 * La AI sale, por orden:
 *  - de una estación de la libreta (`libreta`), con la AI que calcula el
 *    motor, compensada si el circuito cerró;
 *  - de un BM del proyecto (`bmId`) + la lectura atrás: si la cota del BM se
 *    corrige, la puesta la sigue;
 *  - de `cotaBM` escrita a mano + la lectura atrás.
 */
export interface PuestaDeNivel {
  id: Id
  nombre: string
  /** Metros. Se usa si no hay `bmId` (o si ese BM ya no existe). */
  cotaBM: number
  /** Metros, siempre: es la lectura atrás al BM. */
  lecturaAtras: number
  /** El BM del proyecto sobre el que se leyó atrás. */
  bmId?: Id | null
  /** Una estación de la libreta: entonces la AI es la de esa estación. */
  libreta?: { tomaId: Id; indiceEstacion: number } | null
}

/**
 * Un conjunto de niveles tal como se guarda: una línea a lo largo de la calle,
 * escrita «progresiva, valor» una por renglón, como en la hoja de Max.
 */
export interface ConjuntoDeNivel {
  id: Id
  nombre: string
  /** Base, Subbase, Vereda, Replanteo… Agrupa y da color; es texto libre. */
  categoria: string
  /**
   * - `lectura`: lecturas de mira escritas, con su puesta.
   * - `cota`: cotas escritas, en metros.
   * - `medido`: enlazado a lo medido en la libreta (`capaId` en `puntoId`):
   *   sigue a la libreta, no es una copia.
   * - `derivado`: sigue a otro conjunto (`origenId`) más su ajuste: un
   *   replanteo «2 cm bajo la vereda» que se mueve si la vereda cambia.
   */
  tipo: 'lectura' | 'cota' | 'medido' | 'derivado'
  /** El texto «progresiva, valor» (solo `lectura` y `cota`). */
  texto: string
  /** `medido`: la capa y el punto de la sección. */
  capaId?: Id
  puntoId?: Id
  /** `derivado`: el conjunto al que sigue. */
  origenId?: Id
  /** La puesta con la que se leyó (solo `lectura`). */
  puestaId: Id | null
  /** Sube (+) o baja (−) la línea entera, en cm. */
  ajusteCm: number
}

export interface HojaNiveles {
  /** @deprecated Las puestas son del proyecto (`Proyecto.puestas`); solo la traen archivos viejos. */
  puestas?: PuestaDeNivel[]
  conjuntos: ConjuntoDeNivel[]
  /** En qué unidad se escriben las lecturas. */
  unidad: 'm' | 'cm' | 'mm'
  /** `normal`: Z = AI − L. `invertida`: Z = AI + L. */
  mira: 'normal' | 'invertida'
  /** La separación mínima que se exige entre dos líneas, en cm. */
  minimoCm: number
  /** Las gráficas de comparación (una o dos), con lo que se eligió en cada una. */
  paneles?: PanelDeNiveles[]
  /** Se ven las dos gráficas (izquierda y derecha) o solo la primera. */
  dosPaneles?: boolean
  /** Lo último que se pidió en «Nivel a registrar». */
  registrar?: { conjuntoId: Id | null; progresivas: string; puestaId: Id | null }
}

/**
 * Una gráfica de comparación entre dos conjuntos. En `separacion` se mide de
 * la línea de arriba a la de abajo contra el mínimo; en `corteRelleno` la de
 * arriba es lo que hay y la de abajo lo que debe quedar (el replanteo): lo
 * que sobra se corta, lo que falta se rellena.
 */
export interface PanelDeNiveles {
  superiorId: Id | null
  inferiorId: Id | null
  modo: 'separacion' | 'corteRelleno'
}

// ---------- Notas de campo ----------

export interface Nota {
  id: Id
  /** Metros, la misma progresiva que en la libreta. */
  progresiva: number
  texto: string
  /** ISO 8601. */
  fecha: string
  /** Foto como dataURL: viaja dentro del JSON del proyecto. */
  foto?: string
}

// ---------- Plan de puntos de control ----------

/**
 * Un punto de control tal como quedó decidido. `cota` es la del perfil con
 * que se planificó (rasante o digitado), NO una cota comprobada: la estaca
 * solo tiene cota cuando una nivelación cerrada desde un BM se la da.
 */
export interface ControlPlaneado {
  progresiva: number
  cota: number
  motivos: MotivoControl[]
}

export interface PlanControles {
  /** Las reglas con que se planificó; lo que falte se completa con las de fábrica. */
  opciones: Partial<OpcionesControles>
  controles: ControlPlaneado[]
}

// ---------- Planos y pistas ----------

export type FormatoPlano = 'dxf' | 'pdf'

/**
 * Un plano de obra importado. Sus bytes NO van aquí: viven aparte (en el
 * almacén de la app como `archivosDePlano`, y dentro del .topo como la
 * entrada `planos/<id>.<formato>` del zip), para que el JSON del proyecto no
 * cargue con varios megas de PDF en cada autoguardado.
 */
export interface PlanoImportado {
  id: Id
  nombre: string
  formato: FormatoPlano
  /** Página del PDF que se usa (desde 1). En un DXF no significa nada. */
  pagina?: number
  /** Null hasta que se calibra con dos puntos de distancia conocida. */
  calibracion: Calibracion | null
  /** Capas del DXF que no se dibujan. */
  capasOcultas?: string[]
  /** Los puntos de nivel puestos sobre esta lámina para controlar por dónde se va el agua. */
  nivelesEnPlano?: NivelesEnPlano
}

/**
 * Un punto de nivel sobre el plano: Max lo pone donde va a leer («punto 7»),
 * después escribe la lectura que hizo ahí y la cota sale de su puesta.
 */
export interface PuntoNivelPlano {
  id: Id
  /** Como se llama en el plano y en la tabla: «7». */
  nombre: string
  /** En unidades del plano, Y hacia arriba (como las pistas). */
  x: number
  y: number
  puestaId: Id | null
  /** Lectura de mira en metros; null mientras no se haya leído. */
  lectura: number | null
  /** Es por donde el agua tiene que salir: sumidero, cuneta, canal. */
  salida: boolean
}

export interface NivelesEnPlano {
  /** @deprecated Las puestas son del proyecto (`Proyecto.puestas`); solo la traen archivos viejos. */
  puestas?: PuestaDeNivel[]
  puntos: PuntoNivelPlano[]
  /** Por debajo de esta pendiente (%) el agua puede quedarse. */
  pendienteMinimaPct: number
  /**
   * Suma al análisis del agua lo medido en la libreta de esta capa, en las
   * calles que tienen su pista en este plano: no hay que volver a poner
   * esos puntos. Null o ausente: solo los puntos del plano.
   */
  capaMedidaId?: Id | null
}

export type OrigenPista = 'croquis' | 'dxf'

/**
 * Una pista (el eje de una calle) sobre un plano, tal como se guarda. Para
 * calcular sobre ella (progresivas, cotas del plano) se arma, con la
 * calibración de su plano, la `PistaCalibrada` de `planos/geometria`.
 */
export interface Pista {
  id: Id
  nombre: string
  planoId: Id
  /** Eje en unidades del plano, en el sentido de avance. */
  polilinea: Punto2[]
  /** La calle cuyos cálculos abre esta pista, si ya se enlazó. */
  calleId?: Id
  /** Dibujada a mano sobre el plano, o tomada de una polilínea del DXF. */
  origen: OrigenPista
  /** Progresiva del primer vértice, en metros. Ausente es 0+000. */
  progresivaInicio?: number
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
  /**
   * Las progresivas que el topógrafo declaró en esta jornada, midiera o no
   * en ellas. Son las filas que quiere tener delante para anotar: las suyas
   * de verdad son 6, 10, 20, 30, 40, 50, 60 —irregulares al principio y cada
   * 10 después—, así que se declaran una a una, no con un intervalo.
   *
   * Se guardan con la jornada y no solo en la pantalla: si declara diez y
   * mide seis, al volver siguen ahí las cuatro que faltan.
   *
   * La tabla sale de la **unión** de estas y las medidas (`progresivasDeLaToma`),
   * nunca de estas solas: una hoja importada trae progresivas que nadie
   * declaró y tienen que seguir apareciendo. Declarar no borra lo importado,
   * e importar no pisa lo declarado.
   *
   * Ausente es lo mismo que vacía —es lo que trae un archivo guardado antes
   * de que esto existiera—: entonces la tabla sale de lo medido, exactamente
   * como salía antes.
   */
  progresivasDeclaradas?: number[]
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
  /** Quien firma como supervisor en los informes. */
  supervisor?: string
  /** El logo de los informes: dataURL PNG o JPEG ya reducido, con un id que cambia con cada logo. */
  logo?: { id: string; dataUrl: string }
}

export interface Proyecto {
  version: 1
  meta: MetaProyecto
  bms: BM[]
  calles: Calle[]
  capas: Capa[]
  /**
   * El equipo y las reglas de precisión de esta obra. Parcial: lo que falte
   * sale de fábrica. La libreta, el aviso al anotar, el replanteo, la
   * calculadora y el planificador lo leen con `instrumentoCompleto`, nunca
   * tal cual.
   */
  instrumento?: Partial<Instrumento>
  /** Planos de obra importados (sin sus bytes, ver `PlanoImportado`). */
  planos?: PlanoImportado[]
  /** Pistas dibujadas o tomadas de los planos. */
  pistas?: Pista[]
  /** Las puestas del nivel de toda la obra, compartidas por todas las pantallas. */
  puestas?: PuestaDeNivel[]
}
