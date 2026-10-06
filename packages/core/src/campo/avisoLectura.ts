import { aMetros, aMilimetros, redondear3 } from '../numero'
import { OPCIONES_NIVELACION, type OpcionesNivelacion } from '../planificar/cambios'
import { estadoDeDiferencia, type EstadoTolerancia } from '../rasante/evaluar'
import { lecturaObjetivo } from './calculadora'

export type TipoAccion = 'corta' | 'rellena' | 'enCota'

/**
 * Qué hay que hacer en el terreno. `mm` va siempre sin signo: el sentido ya
 * lo dice `tipo`, y así la pantalla escribe «corta 12 mm» sin pensar en signos.
 */
export interface Accion {
  tipo: TipoAccion
  mm: number
}

/**
 * El semáforo de siempre, más `'datoInvalido'`: algún dato de entrada no es un
 * número, la lectura no cabe en la mira o las reglas de la mira no tienen
 * sentido. Es un estado propio, y no `'fuera'`, para que la pantalla no pinte
 * una ✗ sobre una cuenta que no se pudo hacer: lo que toca es volver a anotar.
 */
export type EstadoAviso = EstadoTolerancia | 'datoInvalido'

/**
 * Las tres reglas de la mira del diseño (§2). Son las mismas que usa el
 * planificador, y salen de su misma constante, para que si Max cambia el
 * largo de la mira el planificador y el campo sigan diciendo lo mismo.
 */
export type ReglasMira = Pick<OpcionesNivelacion, 'largoMira' | 'lecturaMin' | 'margenSuperior'>

/**
 * Dónde cae una lectura en la mira:
 * - `legible`: entre la lectura mínima y largo − margen superior.
 * - `pocoPrecisa`: cabe en la mira, pero cerca del suelo (refracción) o de la
 *   punta (oscila). Se puede usar, avisando.
 * - `imposible`: cero, negativa o más larga que la mira. Siempre es un error
 *   de anotación o una estación que no ve el punto. El cero cuenta como
 *   imposible igual que en la libreta (`esLecturaUsable`): el hilo no cae en
 *   el cero de la mira.
 * - `noEsNumero`: casillero vacío, coma decimal mal leída…
 */
export type RangoLectura = 'legible' | 'pocoPrecisa' | 'imposible' | 'noEsNumero'

/**
 * Completa las reglas con las de fábrica y las revisa. Null si no tienen
 * sentido (largo no positivo, márgenes negativos o ninguna lectura legible):
 * aplicarlas daría avisos falsos, y eso es peor que decir que no se puede.
 */
export function reglasDeMira(parciales: Partial<ReglasMira> = {}): ReglasMira | null {
  const reglas: ReglasMira = {
    largoMira: parciales.largoMira ?? OPCIONES_NIVELACION.largoMira,
    lecturaMin: parciales.lecturaMin ?? OPCIONES_NIVELACION.lecturaMin,
    margenSuperior: parciales.margenSuperior ?? OPCIONES_NIVELACION.margenSuperior,
  }
  const { largoMira, lecturaMin, margenSuperior } = reglas
  if (![largoMira, lecturaMin, margenSuperior].every((v) => Number.isFinite(v))) return null
  if (largoMira <= 0 || lecturaMin < 0 || margenSuperior < 0) return null
  if (lecturaMin > lecturaMaximaLegible(reglas)) return null
  return reglas
}

/** Redondeada al mm: 4 − 0.3 podría no dar 3.7 exacto en coma flotante. */
function lecturaMaximaLegible(reglas: ReglasMira): number {
  return redondear3(reglas.largoMira - reglas.margenSuperior)
}

/** Los bordes cuentan como dentro, igual que en el semáforo. */
export function clasificarLectura(lectura: number, reglas: ReglasMira): RangoLectura {
  if (!Number.isFinite(lectura)) return 'noEsNumero'
  if (lectura <= 0 || lectura > reglas.largoMira) return 'imposible'
  if (lectura < reglas.lecturaMin || lectura > lecturaMaximaLegible(reglas)) return 'pocoPrecisa'
  return 'legible'
}

export interface EntradaLectura {
  /** Cota del plano de colimación: cota conocida + vista atrás. */
  alturaInstrumental: number
  /** Lo que marca la mira, en metros. */
  lectura: number
  /** Cota que pide el proyecto en ese punto. Null si el punto no tiene rasante. */
  cotaProyecto: number | null
  toleranciaMm: number
  /**
   * Si la cota de partida de la AI viene de un circuito que ya cerró (o de un
   * BM oficial). Mientras se anota, el circuito normalmente todavía no cerró:
   * el resultado sirve, pero no está comprobado y la pantalla tiene que
   * decirlo (diseño §3). Es obligatorio para que nadie lo olvide.
   */
  alturaComprobada: boolean
  /** Por defecto, las del planificador (mira de 4 m, 0.30 abajo y arriba). */
  mira?: Partial<ReglasMira>
}

export interface AvisoLectura {
  /** Cota medida: AI − lectura. Null si alguno no es número o la lectura no cabe en la mira. */
  cota: number | null
  /** Medida − proyecto, en mm enteros. Positivo = sobra = corta. */
  diferenciaMm: number | null
  /** `'sinRasante'` si no hay proyecto; `'datoInvalido'` si algo no se pudo juzgar (ver `avisos`). */
  estado: EstadoAviso
  accion: Accion | null
  /**
   * Vale la pena volver a mirar la lectura antes de anotarla: pasa del doble
   * de la tolerancia, no es un número o no cabe en la mira. Un decímetro
   * cambiado es el error de lectura más común, y se corrige mientras la mira
   * sigue en el punto, no en gabinete.
   */
  sospechosa: boolean
  /** Null solo si las reglas de la mira no son válidas. */
  rangoLectura: RangoLectura | null
  /** Lo que la mira debería marcar si el punto estuviera en cota. */
  lecturaEsperada: number | null
  /** Si esa lectura esperada se puede leer desde esta estación. */
  rangoLecturaEsperada: RangoLectura | null
  /** Copia de `alturaComprobada`: el dato hereda la comprobación de su AI. */
  comprobado: boolean
  /** Todo lo anterior que merece decirse, en palabras para la pantalla. */
  avisos: string[]
}

/** Signo de la diferencia en mm → qué hacer. Null si no es un número: NaN no es «en cota». */
export function accionDeDiferencia(diferenciaMm: number): Accion | null {
  if (!Number.isFinite(diferenciaMm)) return null
  if (diferenciaMm > 0) return { tipo: 'corta', mm: diferenciaMm }
  if (diferenciaMm < 0) return { tipo: 'rellena', mm: -diferenciaMm }
  return { tipo: 'enCota', mm: 0 }
}

/**
 * Metros a milímetros enteros. Se redondea a 3 decimales antes de pasar a
 * mm porque `aMilimetros(-0.302)` da -302.00000000000006, y ese ruido
 * acabaría escrito en pantalla.
 */
export function diferenciaEnMm(metros: number): number {
  const mm = Math.round(aMilimetros(redondear3(metros)))
  // Evita un −0 que se pintaría como «-0».
  return mm === 0 ? 0 : mm
}

export function toleranciaValida(toleranciaMm: number): boolean {
  return Number.isFinite(toleranciaMm) && toleranciaMm >= 0
}

export const AVISO_SIN_COMPROBAR = 'Cota sobre una nivelación sin cerrar: no comprobada.'
export const AVISO_REGLAS_MIRA = 'Las reglas de la mira no son válidas (largo, lectura mínima, margen).'
export const AVISO_TOLERANCIA = 'La tolerancia no es un número válido (≥ 0 mm).'

function m3(valor: number): string {
  return valor.toFixed(3)
}

/** Qué decir de una lectura anotada según dónde cae en la mira. Null si no hay nada que decir. */
export function avisoDeLectura(lectura: number, rango: RangoLectura, reglas: ReglasMira): string | null {
  switch (rango) {
    case 'noEsNumero':
      return 'La lectura no es un número: vuelva a anotarla.'
    case 'imposible':
      return `La lectura ${m3(lectura)} no cabe en una mira de ${reglas.largoMira} m: revise la anotación.`
    case 'pocoPrecisa':
      return (
        `La lectura ${m3(lectura)} está fuera de ${m3(reglas.lecturaMin)} … ` +
        `${m3(lecturaMaximaLegible(reglas))} m: poco precisa, mejor cambiar de estación.`
      )
    case 'legible':
      return null
  }
}

/**
 * El aviso que se da al anotar una lectura, antes de pasar a la siguiente:
 * qué cota sale, cuánto se aparta del proyecto, si corta o rellena, y si
 * la lectura merece repetirse.
 *
 * Nada se juzga sobre un dato roto: si algo no es número o la lectura no cabe
 * en la mira, no hay acción ni semáforo, el estado es `'datoInvalido'` y
 * `avisos` dice qué falló.
 */
export function evaluarLectura(entrada: EntradaLectura): AvisoLectura {
  const { alturaInstrumental, lectura, cotaProyecto, toleranciaMm, alturaComprobada } = entrada
  const reglas = reglasDeMira(entrada.mira)
  const avisos: string[] = []
  let invalido = false

  // 1. La lectura misma: es lo que el operario puede corregir ahora.
  let rangoLectura: RangoLectura | null
  if (!Number.isFinite(lectura)) rangoLectura = 'noEsNumero'
  else rangoLectura = reglas === null ? null : clasificarLectura(lectura, reglas)
  const lecturaRota = rangoLectura === 'noEsNumero' || rangoLectura === 'imposible'
  if (lecturaRota) {
    invalido = true
    // `reglas` no hace falta para «noEsNumero»; para «imposible» existe seguro.
    avisos.push(avisoDeLectura(lectura, rangoLectura!, reglas ?? OPCIONES_NIVELACION)!)
  }

  // 2. Los demás datos.
  const aiValida = Number.isFinite(alturaInstrumental)
  if (!aiValida) {
    invalido = true
    avisos.push('La altura instrumental no es un número.')
  }
  const hayProyecto = cotaProyecto !== null
  const proyectoValido = hayProyecto && Number.isFinite(cotaProyecto)
  if (hayProyecto && !proyectoValido) {
    invalido = true
    avisos.push('La cota de proyecto no es un número.')
  }
  const tolValida = toleranciaValida(toleranciaMm)
  if (hayProyecto && !tolValida) {
    invalido = true
    avisos.push(AVISO_TOLERANCIA)
  }
  if (reglas === null) {
    invalido = true
    avisos.push(AVISO_REGLAS_MIRA)
  }

  // 3. Las cuentas que sí se pueden hacer.
  // No se usa `cotaDesdeLectura` de la calculadora: esa valida contra la mira
  // fija de la libreta (5 m), y aquí la mira es la configurada, ya revisada.
  const cota = lecturaRota || !aiValida ? null : redondear3(alturaInstrumental - lectura)
  const lecturaEsperada = proyectoValido ? lecturaObjetivo(alturaInstrumental, cotaProyecto) : null
  const diferenciaMm = cota !== null && proyectoValido ? diferenciaEnMm(cota - cotaProyecto) : null
  const accion = diferenciaMm === null ? null : accionDeDiferencia(diferenciaMm)

  let estado: EstadoAviso
  if (invalido) estado = 'datoInvalido'
  else if (!hayProyecto) estado = 'sinRasante'
  else estado = estadoDeDiferencia(diferenciaMm!, toleranciaMm)

  const sospechosa =
    lecturaRota || (diferenciaMm !== null && tolValida && Math.abs(diferenciaMm) > toleranciaMm * 2)

  // 4. Avisos de precisión: la cuenta vale, pero conviene saberlo.
  if (rangoLectura === 'pocoPrecisa') avisos.push(avisoDeLectura(lectura, rangoLectura, reglas!)!)
  const rangoLecturaEsperada =
    lecturaEsperada === null || reglas === null ? null : clasificarLectura(lecturaEsperada, reglas)
  // Si la lectura anotada ya está mal puesta, su aviso ya manda cambiar de
  // estación: repetirlo con la esperada solo haría ruido.
  if (rangoLectura === 'legible' && rangoLecturaEsperada !== null && rangoLecturaEsperada !== 'legible') {
    avisos.push(avisoDeEsperada(lecturaEsperada!, rangoLecturaEsperada, reglas!))
  }

  if (!alturaComprobada) avisos.push(AVISO_SIN_COMPROBAR)

  return {
    cota,
    diferenciaMm,
    estado,
    accion,
    sospechosa,
    rangoLectura,
    lecturaEsperada,
    rangoLecturaEsperada,
    comprobado: alturaComprobada,
    avisos,
  }
}

function avisoDeEsperada(esperada: number, rango: RangoLectura, reglas: ReglasMira): string {
  if (rango === 'imposible') {
    return (
      `La lectura esperada ${m3(esperada)} no cabe en la mira de ${reglas.largoMira} m: ` +
      'desde esta estación no se puede dejar el punto en cota.'
    )
  }
  return (
    `La lectura esperada ${m3(esperada)} está fuera de ${m3(reglas.lecturaMin)} … ` +
    `${m3(lecturaMaximaLegible(reglas))} m: poco precisa desde esta estación.`
  )
}

/**
 * Entre qué lecturas de mira el punto queda conforme. Es la lectura
 * esperada ± la tolerancia: como la cota es AI − lectura, el signo se
 * invierte (leer más es estar más bajo), pero al ser simétrica la tolerancia
 * el intervalo es el mismo. Los bordes son conformes, igual que en
 * `estadoDeDiferencia`. Null si algún dato no es número o la tolerancia es negativa.
 */
export function rangoEsperado(
  alturaInstrumental: number,
  cotaProyecto: number,
  toleranciaMm: number,
): { desde: number; hasta: number } | null {
  const esperada = lecturaObjetivo(alturaInstrumental, cotaProyecto)
  if (esperada === null || !toleranciaValida(toleranciaMm)) return null
  const margen = aMetros(toleranciaMm)
  return {
    desde: redondear3(esperada - margen),
    hasta: redondear3(esperada + margen),
  }
}
