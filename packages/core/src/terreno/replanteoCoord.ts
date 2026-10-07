/**
 * Replanteo por coordenadas: con estación total (ángulo horizontal desde el
 * atrás y distancia) o con GNSS (cuánto avanzar al norte y al este). Al
 * llegar al punto, la cota medida se juzga con el mismo semáforo que el
 * resto del motor: diferencia = medida − proyecto, positivo corta.
 *
 * Coordenadas: x = este, y = norte, en metros. Azimut desde el norte en
 * sentido horario, en grados sexagesimales de 0 a 360 (sin incluir 360).
 */

import { redondear3 } from '../numero'
import {
  AVISO_SIN_COMPROBAR,
  AVISO_TOLERANCIA,
  accionDeDiferencia,
  diferenciaEnMm,
  toleranciaValida,
  type EstadoAviso,
  type TipoAccion,
} from '../campo/avisoLectura'
import { estadoDeDiferencia } from '../rasante/evaluar'
import type { CoordenadaPlana } from './amarre'

/** Un punto con cota opcional (la de un GNSS o la de proyecto). */
export interface CoordenadaConCota extends CoordenadaPlana {
  z?: number | null
}

const AVISO_NO_NUMERO = 'Alguna coordenada no es un número: revise los datos.'
/** Por debajo de esto (1 mm) dos puntos se toman por el mismo. */
const MISMO_SITIO_M = 0.0005
/** Un factor de escala combinado razonable (UTM × elevación en Perú anda por 0.998–1.001). */
const FACTOR_MINIMO = 0.99
const FACTOR_MAXIMO = 1.01
/** Orientación débil: el punto a más de tantas veces la distancia del atrás… */
const VECES_ATRAS = 3
/** …o un atrás más cerca que esto con el punto más lejos que él. */
const ATRAS_CERCANO_M = 20
/** El error de centrado del atrás con el que se estima el corrimiento lateral. */
const CENTRADO_M = 0.005

/** Aviso propio de la cota de GNSS (no es una nivelación sin cerrar). */
export const AVISO_COTA_GNSS =
  'Cota de GNSS: confirme que la colectora aplica el modelo de geoide (EGM2008); no reemplaza a la nivelación.'
/** Desde esta diferencia (1 m) no es corte ni relleno: es el sistema de alturas. */
const DIFERENCIA_SISTEMA_ALTURAS_MM = 1000

function finito(p: CoordenadaPlana): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y)
}

function pareceUtm(p: CoordenadaPlana): boolean {
  return p.x >= 100000 && p.x < 1000000 && p.y >= 1000000 && p.y < 10000000
}

function normalizar360(grados: number): number {
  const g = ((grados % 360) + 360) % 360
  // −1e-15 % 360 da 360 tras sumar: se vuelve a 0.
  return g >= 360 ? 0 : g
}

/** Azimut de `desde` a `hacia`. Null si coinciden o algo no es número. */
export function azimutEntre(desde: CoordenadaPlana, hacia: CoordenadaPlana): number | null {
  if (!finito(desde) || !finito(hacia)) return null
  const de = hacia.x - desde.x
  const dn = hacia.y - desde.y
  if (de === 0 && dn === 0) return null
  // atan2(este, norte): cero al norte y crece en sentido horario.
  return normalizar360((Math.atan2(de, dn) * 180) / Math.PI)
}

/** Distancia horizontal al mm. Null si algo no es número. */
export function distanciaEntre(a: CoordenadaPlana, b: CoordenadaPlana): number | null {
  if (!finito(a) || !finito(b)) return null
  return redondear3(Math.hypot(b.x - a.x, b.y - a.y))
}

export interface AnguloSexagesimal {
  grados: number
  minutos: number
  segundos: number
  /** Como se lee en la estación: 47°12′30″. */
  texto: string
}

/**
 * Grados decimales a grados, minutos y segundos, normalizado a 0…360. El
 * redondeo de los segundos arrastra: 10°59′59.7″ se escribe 11°00′00″, y
 * 359°59′59.9″ se escribe 0°00′00″.
 */
export function anguloSexagesimal(grados: number, decimalesSegundos = 0): AnguloSexagesimal | null {
  if (!Number.isFinite(grados)) return null
  const factor = 10 ** decimalesSegundos
  // Todo en unidades enteras de la última cifra del segundo, para que el
  // arrastre sea exacto.
  const vuelta = 360 * 3600 * factor
  let total = Math.round(normalizar360(grados) * 3600 * factor)
  if (total >= vuelta) total -= vuelta
  const unidadesPorGrado = 3600 * factor
  const unidadesPorMinuto = 60 * factor
  const g = Math.floor(total / unidadesPorGrado)
  const m = Math.floor((total - g * unidadesPorGrado) / unidadesPorMinuto)
  const s = (total - g * unidadesPorGrado - m * unidadesPorMinuto) / factor
  const textoSegundos = s.toFixed(decimalesSegundos).padStart(decimalesSegundos > 0 ? 3 + decimalesSegundos : 2, '0')
  return {
    grados: g,
    minutos: m,
    segundos: s,
    texto: `${g}°${String(m).padStart(2, '0')}′${textoSegundos}″`,
  }
}

function textoAngulo(grados: number | null): string | null {
  return grados === null ? null : anguloSexagesimal(grados)!.texto
}

// ─── Estación total ───────────────────────────────────────────────────────

export interface EntradaReplanteoEstacion {
  estacion: CoordenadaPlana
  /** El punto de orientación, donde se pone el ángulo en 0°00′00″. */
  atras: CoordenadaPlana
  objetivo: CoordenadaPlana
  /** Si se midió la distancia al atrás: se compara con la de las coordenadas. */
  distanciaAtrasMedida?: number
  /** Diferencia tolerada en esa comprobación, en metros. Por defecto 0.02. */
  toleranciaAtrasM?: number
  /**
   * Factor de escala combinado (cuadrícula × elevación): distancia de
   * cuadrícula = distancia en el terreno × factor. Con coordenadas UTM hace
   * falta: en Huancayo (~3250 m) ronda 0.9991, y 300 m de cuadrícula son
   * 300.27 m en el terreno.
   */
  factorEscala?: number
  /** El sistema de las coordenadas, si se sabe. Sin él, se mira si parecen UTM. */
  sistema?: 'local' | 'utm'
}

export interface ReplanteoEstacion {
  azimutAtras: number | null
  azimutObjetivo: number | null
  azimutTexto: string | null
  /** Horario desde el atrás, 0 ≤ ángulo < 360. Null si no hay orientación o punto. */
  anguloHorizontal: number | null
  anguloTexto: string | null
  /** La que se mide en el terreno (cuadrícula ÷ factor de escala), al mm. */
  distanciaHorizontal: number | null
  /** La de las coordenadas, sin factor, al mm. */
  distanciaCuadricula: number | null
  /** El factor que se aplicó; null si no se aplicó ninguno. */
  factorEscala: number | null
  /** En el terreno, como `distanciaHorizontal`. */
  distanciaAtras: number | null
  /** Medida − calculada, al mm. Null si no se dio la medida. */
  diferenciaAtrasM: number | null
  avisos: string[]
}

/**
 * Qué poner en la estación para ir a un punto: con el ángulo en 0 mirando al
 * atrás, girar en sentido horario `anguloHorizontal` y medir
 * `distanciaHorizontal`.
 */
export function replanteoConEstacion(entrada: EntradaReplanteoEstacion): ReplanteoEstacion {
  const { estacion, atras, objetivo } = entrada
  const tolerancia = entrada.toleranciaAtrasM ?? 0.02
  const avisos: string[] = []

  if (!finito(estacion) || !finito(atras) || !finito(objetivo)) avisos.push(AVISO_NO_NUMERO)

  // Factor de escala: sin él, con UTM, la distancia de cuadrícula no es la
  // del terreno.
  let factor: number | null = null
  if (entrada.factorEscala !== undefined) {
    if (Number.isFinite(entrada.factorEscala) && entrada.factorEscala >= FACTOR_MINIMO && entrada.factorEscala <= FACTOR_MAXIMO) {
      factor = entrada.factorEscala
    } else {
      avisos.push(
        `El factor de escala «${String(entrada.factorEscala)}» no es válido (entre ${FACTOR_MINIMO} y ${FACTOR_MAXIMO}): ` +
          'no se aplicó y las distancias son de cuadrícula.',
      )
    }
  }
  const utm = entrada.sistema === 'utm' || (entrada.sistema === undefined && [estacion, atras, objetivo].every(pareceUtm))
  if (utm && factor === null && entrada.factorEscala === undefined) {
    avisos.push(
      'Coordenadas UTM sin factor de escala: la distancia es de cuadrícula, no la del terreno. En la sierra difiere ' +
        'cerca de 1 mm por metro (27 cm en 300 m). Declare el factor de escala combinado.',
    )
  }
  const alTerreno = (d: number | null) => (d === null ? null : factor === null ? d : redondear3(d / factor))
  const distanciaCuadricula = distanciaEntre(estacion, objetivo)
  const distanciaAtras = alTerreno(distanciaEntre(estacion, atras))
  const distanciaHorizontal = alTerreno(distanciaCuadricula)
  const atrasEnEstacion = distanciaAtras !== null && Math.hypot(atras.x - estacion.x, atras.y - estacion.y) < MISMO_SITIO_M
  const objetivoEnEstacion =
    distanciaHorizontal !== null && Math.hypot(objetivo.x - estacion.x, objetivo.y - estacion.y) < MISMO_SITIO_M
  if (atrasEnEstacion) avisos.push('El punto atrás coincide con la estación: no hay orientación.')
  if (objetivoEnEstacion) avisos.push('El punto a replantear coincide con la estación: no hay nada que girar ni medir.')

  const azimutAtras = atrasEnEstacion ? null : azimutEntre(estacion, atras)
  const azimutObjetivo = objetivoEnEstacion ? null : azimutEntre(estacion, objetivo)
  const anguloHorizontal =
    azimutAtras === null || azimutObjetivo === null ? null : normalizar360(azimutObjetivo - azimutAtras)

  // Orientación débil: un atrás cerca y un punto lejos multiplican el error
  // de centrado del atrás.
  if (anguloHorizontal !== null && distanciaAtras !== null && distanciaHorizontal !== null) {
    const largo = distanciaHorizontal > distanciaAtras * VECES_ATRAS
    const atrasCerca = distanciaAtras < ATRAS_CERCANO_M && distanciaHorizontal > distanciaAtras
    if (largo || atrasCerca) {
      const lateral = (CENTRADO_M * distanciaHorizontal) / distanciaAtras
      avisos.push(
        `Orientación débil: el atrás está a ${distanciaAtras.toFixed(3)} m y el punto a ${distanciaHorizontal.toFixed(3)} m. ` +
          `Con 5 mm de error en el atrás, el punto se corre ${lateral.toFixed(3)} m de lado. ` +
          'Oriente a un atrás más lejano que el punto.',
      )
    }
  }

  let diferenciaAtrasM: number | null = null
  if (entrada.distanciaAtrasMedida !== undefined) {
    if (!Number.isFinite(entrada.distanciaAtrasMedida)) {
      avisos.push('La distancia medida al atrás no es un número.')
    } else if (distanciaAtras !== null) {
      diferenciaAtrasM = redondear3(entrada.distanciaAtrasMedida - distanciaAtras)
      if (Math.abs(diferenciaAtrasM) > tolerancia) {
        avisos.push(
          `La distancia al atrás medida difiere ${Math.abs(diferenciaAtrasM).toFixed(3)} m de la calculada ` +
            `(${distanciaAtras.toFixed(3)} m): revise la estación, el atrás o la altura del prisma antes de replantear` +
            (factor === null && utm ? ', y declare el factor de escala: con UTM sin él la diferencia es de esperar.' : '.'),
        )
      }
    }
  }

  return {
    azimutAtras,
    azimutObjetivo,
    azimutTexto: textoAngulo(azimutObjetivo),
    anguloHorizontal,
    anguloTexto: textoAngulo(anguloHorizontal),
    distanciaHorizontal,
    distanciaCuadricula,
    factorEscala: factor,
    distanciaAtras,
    diferenciaAtrasM,
    avisos,
  }
}

// ─── Veredicto de cota ────────────────────────────────────────────────────

export interface EntradaVeredictoCota {
  cotaMedida: number
  cotaProyecto: number
  toleranciaMm: number
  /**
   * Si la cota medida viene de algo comprobado (nivelación cerrada). Una cota
   * de GNSS o de estación total sin amarrar a la nivelación no lo es.
   * Obligatorio para que nadie lo olvide.
   */
  comprobado: boolean
}

export interface VeredictoCota {
  /** Medida − proyecto, en mm. Positivo = sobra = corta. */
  diferenciaMm: number | null
  tipo: TipoAccion | null
  /** Sin signo: el sentido lo da `tipo`. */
  mm: number | null
  estado: EstadoAviso
  /** Pasa del doble de la tolerancia: vale la pena volver a medir. */
  sospechosa: boolean
  comprobado: boolean
  avisos: string[]
}

/**
 * El semáforo de siempre sobre una cota ya medida (GNSS, estación total). Usa
 * las mismas piezas que `evaluarLectura` para que redondee y juzgue igual.
 */
export function veredictoDeCota(entrada: EntradaVeredictoCota): VeredictoCota {
  const { cotaMedida, cotaProyecto, toleranciaMm, comprobado } = entrada
  const avisos: string[] = []
  let invalido = false
  if (!Number.isFinite(cotaMedida)) {
    invalido = true
    avisos.push('La cota medida no es un número.')
  }
  if (!Number.isFinite(cotaProyecto)) {
    invalido = true
    avisos.push('La cota de proyecto no es un número.')
  }
  if (!toleranciaValida(toleranciaMm)) {
    invalido = true
    avisos.push(AVISO_TOLERANCIA)
  }
  const diferenciaMm = Number.isFinite(cotaMedida) && Number.isFinite(cotaProyecto) ? diferenciaEnMm(cotaMedida - cotaProyecto) : null
  const accion = invalido || diferenciaMm === null ? null : accionDeDiferencia(diferenciaMm)
  const estado: EstadoAviso = invalido ? 'datoInvalido' : estadoDeDiferencia(diferenciaMm!, toleranciaMm)
  const sospechosa = !invalido && Math.abs(diferenciaMm!) > toleranciaMm * 2
  if (!comprobado) avisos.push(AVISO_SIN_COMPROBAR)
  return {
    diferenciaMm: invalido ? null : diferenciaMm,
    tipo: accion?.tipo ?? null,
    mm: accion?.mm ?? null,
    estado,
    sospechosa,
    comprobado,
    avisos,
  }
}

// ─── GNSS ─────────────────────────────────────────────────────────────────

export interface OpcionesReplanteoGnss {
  /** A menos de esto se da por llegado, en metros. Por defecto 0.02 (RTK). */
  toleranciaLlegadaM?: number
  /** Para juzgar la cota al llegar. Sin ella no hay veredicto de cota. */
  toleranciaMm?: number
  /** La cota de GNSS no sale de la nivelación: por defecto no comprobada. */
  cotaComprobada?: boolean
  /**
   * Lo que la colectora dice de la solución (FIJA, FLOTANTE, AUTÓNOMA…). Si
   * no es fija, no se da por llegado ni se juzga la cota.
   */
  solucion?: string | null
  /** Precisión horizontal que da el equipo (HRMS), en metros. */
  precisionHorizontalM?: number
  /** Precisión vertical que da el equipo (VRMS), en metros. */
  precisionVerticalM?: number
}

export interface ReplanteoGnss {
  /** Con signo: positivo al norte, negativo al sur. Al mm. */
  avanzarNorteM: number | null
  /** Con signo: positivo al este, negativo al oeste. Al mm. */
  avanzarEsteM: number | null
  distanciaM: number | null
  azimut: number | null
  azimutTexto: string | null
  /** Dentro de la tolerancia y con una solución que permite marcar. */
  llego: boolean
  /** «Avance 1.500 m al norte y 1.000 m al oeste», «En el punto» o por qué no se marca aún. */
  indicacion: string
  /** Solo al llegar, con cota en los dos puntos, tolerancia y precisión vertical suficiente. */
  cota: VeredictoCota | null
  avisos: string[]
}

const SOLUCION_FIJA = /^(fij|fix|rtk ?fij|rtk ?fix)/i

function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Desde donde está el GNSS (`actual`) hasta el punto a replantear. */
export function replanteoConGnss(
  actual: CoordenadaConCota,
  objetivo: CoordenadaConCota,
  opciones: OpcionesReplanteoGnss = {},
): ReplanteoGnss {
  const tolerancia = opciones.toleranciaLlegadaM ?? 0.02
  if (!finito(actual) || !finito(objetivo)) {
    return {
      avanzarNorteM: null,
      avanzarEsteM: null,
      distanciaM: null,
      azimut: null,
      azimutTexto: null,
      llego: false,
      indicacion: 'Sin datos',
      cota: null,
      avisos: [AVISO_NO_NUMERO],
    }
  }
  const avisos: string[] = []
  const norte = redondear3(objetivo.y - actual.y)
  const este = redondear3(objetivo.x - actual.x)
  const distancia = Math.hypot(objetivo.x - actual.x, objetivo.y - actual.y)
  const dentro = distancia <= tolerancia
  const azimut = azimutEntre(actual, objetivo)

  // ¿Se puede marcar? Con una solución que no es fija, o una precisión peor
  // que la tolerancia, «en el punto» sería una estaca mal puesta.
  const motivos: string[] = []
  const solucion = typeof opciones.solucion === 'string' ? opciones.solucion.trim() : ''
  if (solucion !== '' && !SOLUCION_FIJA.test(sinAcentos(solucion))) {
    motivos.push(`solución ${solucion}`)
    avisos.push(`Solución ${solucion}: no es fija. No marque el punto ni juzgue la cota hasta tener solución fija.`)
  }
  const hrms = opciones.precisionHorizontalM
  if (hrms !== undefined && (!Number.isFinite(hrms) || hrms > tolerancia)) {
    motivos.push(`precisión horizontal ${Number.isFinite(hrms) ? `${hrms.toFixed(3)} m` : 'desconocida'}`)
    avisos.push(
      `Precisión horizontal ${Number.isFinite(hrms) ? `${hrms.toFixed(3)} m` : 'que no es un número'}: ` +
        `peor que la tolerancia de llegada (${tolerancia.toFixed(3)} m). Espere a que mejore.`,
    )
  }
  if (dentro && solucion === '' && hrms === undefined) {
    avisos.push('No se sabe si la solución es fija: confírmelo en la colectora antes de marcar.')
  }
  const llego = dentro && motivos.length === 0

  let indicacion = 'En el punto'
  if (dentro && !llego) indicacion = `Sobre el punto, pero con ${motivos.join(' y ')}: no marque todavía`
  else if (!dentro) {
    const partes: string[] = []
    if (norte !== 0) partes.push(`${Math.abs(norte).toFixed(3)} m al ${norte > 0 ? 'norte' : 'sur'}`)
    if (este !== 0) partes.push(`${Math.abs(este).toFixed(3)} m al ${este > 0 ? 'este' : 'oeste'}`)
    indicacion = `Avance ${partes.join(' y ')}`
  }

  let cota: VeredictoCota | null = null
  const zActual = actual.z
  const zObjetivo = objetivo.z
  const vrms = opciones.precisionVerticalM
  const toleranciaMm = opciones.toleranciaMm
  const vrmsMala =
    vrms !== undefined && toleranciaMm !== undefined && (!Number.isFinite(vrms) || vrms * 1000 > toleranciaMm)
  if (llego && vrmsMala) {
    avisos.push(
      `Precisión vertical ${Number.isFinite(vrms!) ? `${vrms!.toFixed(3)} m` : 'que no es un número'}: ` +
        'peor que la tolerancia de cota. No se juzga la cota.',
    )
  }
  if (llego && !vrmsMala && toleranciaMm !== undefined && typeof zActual === 'number' && typeof zObjetivo === 'number') {
    const comprobado = opciones.cotaComprobada ?? false
    cota = veredictoDeCota({ cotaMedida: zActual, cotaProyecto: zObjetivo, toleranciaMm, comprobado })
    // El aviso de «nivelación sin cerrar» no es el del GNSS: se cambia por el suyo.
    if (!comprobado) cota.avisos = [...cota.avisos.filter((a) => a !== AVISO_SIN_COMPROBAR), AVISO_COTA_GNSS]
    if (cota.diferenciaMm !== null && Math.abs(cota.diferenciaMm) >= DIFERENCIA_SISTEMA_ALTURAS_MM) {
      const aviso =
        `La cota difiere ${(Math.abs(cota.diferenciaMm) / 1000).toFixed(3)} m del proyecto: más que corte o relleno, ` +
        'parece el sistema de alturas (altura elipsoidal sin modelo de geoide, u otro datum vertical). ' +
        'Revise la configuración de la colectora antes de mover tierra.'
      cota.avisos.unshift(aviso)
      avisos.push(aviso)
    }
  }

  return {
    avanzarNorteM: norte === 0 ? 0 : norte,
    avanzarEsteM: este === 0 ? 0 : este,
    distanciaM: redondear3(distancia),
    azimut,
    azimutTexto: textoAngulo(azimut),
    llego,
    indicacion,
    cota,
    avisos,
  }
}
