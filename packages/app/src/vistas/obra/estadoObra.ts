import {
  accionDeDiferencia,
  calcularCampania,
  compararCapas,
  esLecturaUsable,
  evaluarContraRasante,
  formatearProgresiva,
  INSTRUMENTO_DE_FABRICA,
  instrumentoCompleto,
  ordenarCapas,
  progresivasDeLaToma,
  type Calle,
  type Capa,
  type CeldaEvaluada,
  type Id,
  type Proyecto,
  type ResultadoCampania,
  type ResultadoComparacion,
  type Toma,
} from '@topo/core'
import { calcularEstadoComparacion, type EstadoComparacion } from '../../estadoComparacion'
import { cuenta } from '../../formato'
import { evaluarEspesores } from '../analisis/superficies'

/**
 * Lo que la pantalla de Obra dice de cada calle, de cada capa y de cada
 * jornada. Aquí no se calcula ninguna cota: todo sale de `calcularCampania`,
 * `evaluarContraRasante` y `compararCapas` del motor. Lo único que se hace es
 * decidir qué palabra y qué símbolo le tocan a lo que el motor devolvió,
 * para que la lista de calles, el historial y la tarjeta de «Seguir» digan
 * siempre lo mismo de la misma jornada.
 */

export type Simbolo = '✓' | '△' | '✗' | '·'

// ---------- Una jornada ----------

export interface JornadaDeCalle {
  toma: Toma
  calle: Calle
  capa: Capa | undefined
  resultado: ResultadoCampania
}

/** Calcula una toma con el largo de mira de la obra, el mismo que usan la libreta y el replanteo. */
export function calcularToma(proyecto: Proyecto, calle: Calle, toma: Toma): ResultadoCampania {
  return calcularCampania({
    campania: toma,
    calle,
    bms: proyecto.bms,
    largoMira: instrumentoCompleto(proyecto.instrumento).largoMira,
  })
}

/**
 * Las jornadas de una calle, de la más reciente a la más antigua. A igual
 * fecha manda el orden en que entraron: la última en entrar va primero.
 */
export function jornadasDeCalle(proyecto: Proyecto, calle: Calle): JornadaDeCalle[] {
  const tomas = calle.nivelaciones.flatMap((nivelacion) => nivelacion.tomas)
  return tomas
    .map((toma, indice) => ({ toma, indice }))
    .sort((a, b) => b.toma.fecha.localeCompare(a.toma.fecha) || b.indice - a.indice)
    .map(({ toma }) => ({
      toma,
      calle,
      capa: proyecto.capas.find((capa) => capa.id === toma.capaId),
      resultado: calcularToma(proyecto, calle, toma),
    }))
}

/**
 * Cuántas lecturas de mira de verdad tiene la toma (atrás, intermedias y
 * adelante). Se cuentan solo las usables, con la misma regla del motor: una
 * jornada recién creada trae su vista atrás en cero, y eso no es haber leído.
 */
export function lecturasDeToma(toma: Toma, largoMira: number = INSTRUMENTO_DE_FABRICA.largoMira): number {
  let suma = 0
  for (const estacion of toma.estaciones) {
    const lecturas = [estacion.vistaAtras, ...estacion.intermedias]
    if (estacion.vistaAdelante) lecturas.push(estacion.vistaAdelante)
    for (const lectura of lecturas) if (esLecturaUsable(lectura.valor, largoMira)) suma += 1
  }
  return suma
}

/**
 * La jornada más reciente de toda la obra (por fecha; a igual fecha, la última
 * en entrar), o null si la obra no tiene ninguna. Es dónde se dejó el trabajo
 * cuando no hay una jornada activa.
 */
export function jornadaMasReciente(proyecto: Proyecto): { calle: Calle; toma: Toma } | null {
  let mejor: { calle: Calle; toma: Toma } | null = null
  for (const calle of proyecto.calles) {
    for (const toma of calle.nivelaciones.flatMap((n) => n.tomas)) {
      if (!mejor || toma.fecha >= mejor.toma.fecha) mejor = { calle, toma }
    }
  }
  return mejor
}

/**
 * La fecha de hoy en el reloj del celular («2026-10-05»). No sale de
 * toISOString, que da la de Greenwich: en Perú, desde las 19:00 sería mañana,
 * y la fecha manda en el orden de las jornadas.
 */
export function fechaLocalISO(ahora: Date = new Date()): string {
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${ahora.getFullYear()}-${mes}-${dia}`
}

/** «0+000 – 0+120», o null si la toma todavía no tiene ninguna progresiva. */
export function tramoDeTomas(tomas: Toma[]): string | null {
  const progresivas = tomas.flatMap((toma) => progresivasDeLaToma(toma))
  if (progresivas.length === 0) return null
  const desde = Math.min(...progresivas)
  const hasta = Math.max(...progresivas)
  return desde === hasta
    ? formatearProgresiva(desde)
    : `${formatearProgresiva(desde)} – ${formatearProgresiva(hasta)}`
}

/** Milímetros con su signo, como se dicen en obra: «+5 mm», «−3 mm». */
export function milimetros(valor: number): string {
  const redondeado = Math.round(valor)
  if (redondeado === 0) return '0 mm'
  return `${redondeado > 0 ? '+' : '−'}${Math.abs(redondeado)} mm`
}

/**
 * La tolerancia del cierre con un decimal, como la escriben la barra de
 * cierre, la pantalla de Cierre y los PDF: «±5.9 mm». Redondearla al
 * milímetro diría «±6 mm» y, con 6 mm de error, «no cierra con ±6» se
 * contradiría.
 */
export function toleranciaDeCierre(toleranciaMm: number): string {
  return `±${toleranciaMm.toFixed(1)} mm`
}

export interface EstadoCierre {
  simbolo: Simbolo
  /** Corto, para la lista: «✓ cerró −3 mm». */
  corto: string
  /** La frase entera, para la tarjeta de «Seguir» y para quien lee en voz alta. */
  largo: string
  comprobado: boolean
}

/**
 * Qué dice el cierre de una toma. Lo que no cerró —porque no volvió al BM,
 * porque es una hoja importada sin vuelta o porque se pasó de tolerancia—
 * deja todo lo calculado sobre ella sin comprobar, y así se dice.
 */
export function estadoDeCierre(toma: Toma, resultado: ResultadoCampania): EstadoCierre {
  const { cierre } = resultado
  if (cierre.pasa === true && cierre.errorMm !== null && cierre.toleranciaMm !== null) {
    return {
      simbolo: '✓',
      corto: `cerró ${milimetros(cierre.errorMm)}`,
      largo: `Circuito cerrado: ${milimetros(cierre.errorMm)} de error, tolerancia ${toleranciaDeCierre(cierre.toleranciaMm)}.`,
      comprobado: true,
    }
  }
  if (cierre.pasa === false && cierre.errorMm !== null && cierre.toleranciaMm !== null) {
    return {
      simbolo: '✗',
      corto: `no cierra ${milimetros(cierre.errorMm)}`,
      largo:
        `El circuito no cierra: ${milimetros(cierre.errorMm)} de error con tolerancia ${toleranciaDeCierre(cierre.toleranciaMm)}. ` +
        'Las cotas de esta jornada quedan no comprobadas.',
      comprobado: false,
    }
  }
  if (toma.cierre.tipo === 'abierto') {
    return {
      simbolo: '△',
      corto: 'sin vuelta al BM',
      largo: 'Sin vuelta al banco de nivel: las cotas salen, pero quedan no comprobadas.',
      comprobado: false,
    }
  }
  return {
    simbolo: '△',
    corto: 'sin cerrar',
    largo: 'Circuito sin cerrar: las cotas quedan no comprobadas hasta volver al banco de nivel.',
    comprobado: false,
  }
}

// ---------- El estado de cada capa en una calle ----------

export type EstadoCapa =
  | 'sinMedir'
  | 'enCurso'
  | 'conforme'
  | 'alLimite'
  | 'conPuntosFuera'
  | 'sinComprobar'
  | 'sinComparar'

export const NOMBRE_DEL_ESTADO: Record<EstadoCapa, string> = {
  sinMedir: 'sin medir',
  enCurso: 'en curso',
  conforme: 'conforme',
  alLimite: 'con puntos al límite',
  conPuntosFuera: 'con puntos fuera',
  sinComprobar: 'no comprobada',
  sinComparar: 'cerrada, sin comparar',
}

export interface CapaEnCalle {
  capa: Capa
  estado: EstadoCapa
  simbolo: Simbolo
  /** Una frase con lo que hay que saber de esta capa en esta calle. */
  detalle: string
  /** La jornada más reciente de esa capa con alguna lectura. Null si no hay. */
  tomaId: Id | null
}

/** Cuántos puntos se nombran uno por uno; del resto se dice cuántos quedan. */
const PUNTOS_A_NOMBRAR = 3

/**
 * «Eje 0+080 +54 mm, corta · Borde derecho 0+040 −26 mm, rellena»: qué punto
 * de la sección, en qué progresiva, cuánto (medida − proyecto) y qué hacer,
 * que es lo que decide si la máquina corta o se echa material. Van por
 * progresiva; pasados tres se dice cuántos más hay.
 */
export function puntosConDiferencia(celdas: CeldaEvaluada[], nombreDe: (celda: CeldaEvaluada) => string): string {
  const ordenadas = [...celdas].sort((a, b) => a.progresiva - b.progresiva || a.offset - b.offset)
  const textos = ordenadas.slice(0, PUNTOS_A_NOMBRAR).map((celda) => {
    const donde = `${nombreDe(celda)} ${formatearProgresiva(celda.progresiva)}`
    if (celda.diferenciaMm === null) return donde
    const accion = accionDeDiferencia(celda.diferenciaMm)
    const queHacer = accion?.tipo === 'corta' ? ', corta' : accion?.tipo === 'rellena' ? ', rellena' : ''
    return `${donde} ${milimetros(celda.diferenciaMm)}${queHacer}`
  })
  const resto = ordenadas.length - textos.length
  return resto > 0 ? `${textos.join(' · ')} y ${resto} más` : textos.join(' · ')
}

/** Un circuito que todavía no volvió al BM, pero que va a volver: se está midiendo. */
function estaEnCurso(jornada: JornadaDeCalle): boolean {
  return jornada.resultado.cierre.pasa === null && jornada.toma.cierre.tipo !== 'abierto'
}

/**
 * Lo que cada capa del paquete tiene en una calle, de abajo hacia arriba.
 *
 * Una capa se nivela por tramos, en varios días: por eso se juntan todas sus
 * jornadas y no solo la última. Las jornadas sin ninguna lectura usable (una
 * «Nueva jornada» tocada de más) no cuentan. De cada celda manda la medición
 * comprobada más reciente que la cubre: remedir un punto corrige lo de antes,
 * medir otro tramo no lo borra.
 *
 * El orden de lo que se dice, de lo más urgente a lo que está en orden:
 * - algún punto fuera de tolerancia → «con puntos fuera» ✗;
 * - la jornada más reciente con el circuito todavía abierto → «en curso» △;
 * - una jornada sin vuelta al BM o con cierre fuera de tolerancia, cuyo tramo
 *   no se volvió a medir con un circuito cerrado → «sin comprobar» △;
 * - puntos al límite (hasta 2× la tolerancia) → «con puntos al límite» △;
 * - cerró, pero sin rasante o sin ninguna celda donde el proyecto tenga cota
 *   → «cerrada, sin comparar» △: cerrar no es cumplir el proyecto;
 * - si no, «conforme» ✓.
 */
export function capasDeCalle(proyecto: Proyecto, calle: Calle): CapaEnCalle[] {
  const largoMira = instrumentoCompleto(proyecto.instrumento).largoMira
  const jornadas = jornadasDeCalle(proyecto, calle)

  return ordenarCapas(proyecto.capas).map((capa): CapaEnCalle => {
    const deLaCapa = jornadas.filter((j) => j.toma.capaId === capa.id)
    const medidas = deLaCapa.filter((j) => lecturasDeToma(j.toma, largoMira) > 0)
    const ultima = medidas[0]
    if (!ultima) {
      return {
        capa,
        estado: 'sinMedir',
        simbolo: '·',
        detalle:
          deLaCapa.length > 0
            ? `${capa.nombre}: jornada abierta, sin lecturas todavía`
            : `${capa.nombre}: sin medir`,
        tomaId: null,
      }
    }

    const tramo = tramoDeTomas(medidas.map((j) => j.toma))
    const hasta = tramo ? ` (${tramo})` : ''
    const enCurso = estaEnCurso(ultima)

    const comprobadas = medidas.filter((j) => estadoDeCierre(j.toma, j.resultado).comprobado)

    // Una jornada sin comprobar sigue pendiente mientras quede alguna de sus
    // progresivas sin volver a medir con un circuito que sí cerró después.
    const pendiente = medidas.find((j, indice) => {
      if (estaEnCurso(j) || estadoDeCierre(j.toma, j.resultado).comprobado) return false
      const posteriores = medidas.slice(0, indice).filter((p) => comprobadas.includes(p))
      const cubiertas = new Set(posteriores.flatMap((p) => progresivasDeLaToma(p.toma)))
      const suyas = progresivasDeLaToma(j.toma)
      return suyas.length === 0 || suyas.some((progresiva) => !cubiertas.has(progresiva))
    })

    // Celda por celda, la medición comprobada más reciente: se recorren de la
    // más antigua a la más nueva y cada una pisa lo que vuelve a medir. Lo
    // medido en una jornada sin comprobar va aparte: no cuenta para el
    // semáforo, pero un punto que sale fuera ahí se avisa como posible, «no
    // comprobado», para que Max lo remida antes de irse de la calle. Si
    // después lo cubre una medición comprobada, manda esa.
    const porCelda = new Map<string, CeldaEvaluada>()
    const sinComprobarPorCelda = new Map<string, CeldaEvaluada>()
    if (calle.rasante) {
      for (const jornada of [...medidas].reverse()) {
        const comprobada = comprobadas.includes(jornada)
        const evaluacion = evaluarContraRasante({
          resultado: jornada.resultado,
          calle,
          toma: jornada.toma,
          rasante: calle.rasante,
          capas: proyecto.capas,
          capaId: capa.id,
        })
        for (const celda of evaluacion.celdas.values()) {
          if (celda.estado === 'conforme' || celda.estado === 'alLimite' || celda.estado === 'fuera') {
            if (comprobada) {
              porCelda.set(celda.clave, celda)
              sinComprobarPorCelda.delete(celda.clave)
            } else {
              sinComprobarPorCelda.set(celda.clave, celda)
            }
          }
        }
      }
    }
    const celdas = [...porCelda.values()]
    const fuera = celdas.filter((c) => c.estado === 'fuera')
    const alLimite = celdas.filter((c) => c.estado === 'alLimite')
    const conformes = celdas.filter((c) => c.estado === 'conforme').length
    const posiblesFuera = [...sinComprobarPorCelda.values()].filter((c) => c.estado === 'fuera')
    const nombreDe = (celda: CeldaEvaluada) =>
      calle.seccion.puntos.find((p) => p.id === celda.elementoClave)?.nombre ?? celda.elementoClave
    const avisoPosibles =
      posiblesFuera.length > 0
        ? `; ${posiblesFuera.length === 1 ? 'posible punto fuera' : `${posiblesFuera.length} posibles puntos fuera`}: ${puntosConDiferencia(posiblesFuera, nombreDe)}, no comprobado`
        : ''

    const base = { capa, tomaId: ultima.toma.id }

    if (fuera.length > 0) {
      const partes = [`${cuenta(fuera.length, 'punto fuera', 'puntos fuera')} de tolerancia: ${puntosConDiferencia(fuera, nombreDe)}`]
      if (alLimite.length > 0) {
        partes.push(`${cuenta(alLimite.length, 'punto al límite', 'puntos al límite')}: ${puntosConDiferencia(alLimite, nombreDe)}`)
      }
      const ademas = enCurso ? '; sigue en curso' : pendiente ? '; hay un tramo no comprobado' : ''
      return {
        ...base,
        estado: 'conPuntosFuera',
        simbolo: '✗',
        detalle: `${capa.nombre}: ${partes.join('; ')}${ademas}${avisoPosibles}`,
      }
    }

    if (enCurso) {
      return {
        ...base,
        estado: 'enCurso',
        simbolo: '△',
        detalle: `${capa.nombre} en curso${hasta}: circuito sin cerrar, no comprobada${avisoPosibles}`,
      }
    }

    if (pendiente) {
      const cierre = estadoDeCierre(pendiente.toma, pendiente.resultado)
      const suTramo = tramoDeTomas([pendiente.toma])
      return {
        ...base,
        estado: 'sinComprobar',
        simbolo: '△',
        detalle: `${capa.nombre}${suTramo ? ` (${suTramo})` : ''}: ${cierre.corto}, no comprobada${avisoPosibles}`,
      }
    }

    if (alLimite.length > 0) {
      return {
        ...base,
        estado: 'alLimite',
        simbolo: '△',
        detalle: `${capa.nombre}: ${cuenta(alLimite.length, 'punto al límite', 'puntos al límite')}: ${puntosConDiferencia(alLimite, nombreDe)}`,
      }
    }

    const cierre = estadoDeCierre(ultima.toma, ultima.resultado)
    if (!calle.rasante) {
      return {
        ...base,
        estado: 'sinComparar',
        simbolo: '△',
        detalle: `${capa.nombre}${hasta}: ${cierre.corto}; sin rasante para comparar con el proyecto`,
      }
    }
    if (conformes === 0) {
      return {
        ...base,
        estado: 'sinComparar',
        simbolo: '△',
        detalle: `${capa.nombre}${hasta}: ${cierre.corto}; ningún punto medido cae donde el proyecto tiene cota`,
      }
    }

    return {
      ...base,
      estado: 'conforme',
      simbolo: '✓',
      detalle: `${capa.nombre}${hasta}: conforme, ${cierre.corto}`,
    }
  })
}

/**
 * La frase que va debajo de la franja de una calle: lo más urgente primero
 * (puntos fuera), después lo que se está midiendo, lo que no está comprobado,
 * lo que está al límite y lo que no se pudo comparar; si todo está en orden,
 * la última capa medida.
 */
export function fraseDeCalle(capas: CapaEnCalle[]): string {
  const prioridad: EstadoCapa[] = ['conPuntosFuera', 'enCurso', 'sinComprobar', 'alLimite', 'sinComparar']
  for (const estado of prioridad) {
    const capa = capas.find((c) => c.estado === estado)
    if (capa) return capa.detalle
  }
  const medidas = capas.filter((c) => c.estado === 'conforme')
  return medidas.length > 0 ? medidas[medidas.length - 1]!.detalle : 'Todavía sin medir'
}

// ---------- Comparar dos jornadas ----------

export type TipoComparacion = 'repetibilidad' | 'corte' | 'espesor' | 'acumulada'

export interface ComparacionDeJornadas {
  tipo: TipoComparacion
  titulo: string
  /** «Terreno → Subrasante». */
  que: string
  inferior: JornadaDeCalle
  superior: JornadaDeCalle
  comparacion: ResultadoComparacion
  /** Milímetros, ya en el sentido en que se leen (la profundidad de corte, positiva). Null si no hay celdas comparables. */
  minimoMm: number | null
  medioMm: number | null
  maximoMm: number | null
  lectura: string
  estado: EstadoComparacion
}

/**
 * Cuál va abajo: la capa de orden menor; si son la misma capa, la jornada
 * más antigua. Así «A → B» se lee siempre de abajo arriba y en el tiempo.
 */
function ordenarPareja(a: JornadaDeCalle, b: JornadaDeCalle): [JornadaDeCalle, JornadaDeCalle] {
  const ordenA = a.capa?.orden ?? 0
  const ordenB = b.capa?.orden ?? 0
  if (ordenA !== ordenB) return ordenA < ordenB ? [a, b] : [b, a]
  return a.toma.fecha <= b.toma.fecha ? [a, b] : [b, a]
}

function clasificar(inferior: JornadaDeCalle, superior: JornadaDeCalle): TipoComparacion {
  if (inferior.toma.capaId === superior.toma.capaId) return 'repetibilidad'
  const ordenInferior = inferior.capa?.orden ?? 0
  const ordenSuperior = superior.capa?.orden ?? 0
  if (ordenSuperior - ordenInferior !== 1) return 'acumulada'
  return ordenInferior === 0 ? 'corte' : 'espesor'
}

export const TEXTO_CIRCUITOS_COMPROBADOS =
  'Circuitos comprobados: las dos jornadas cierran dentro de tolerancia.'

/**
 * Compara dos jornadas de la misma calle con `compararCapas` del motor y dice
 * qué significa la resta según qué capas sean:
 * - la misma capa dos veces: cuánto varía la nivelación al repetirla;
 * - del terreno a la capa de encima: cuánto se excavó (la resta, al revés);
 * - dos capas seguidas: el espesor colocado, contra el de proyecto;
 * - capas salteadas: la diferencia acumulada del paquete.
 */
export function compararJornadas(
  primera: JornadaDeCalle,
  segunda: JornadaDeCalle,
): ComparacionDeJornadas {
  const [inferior, superior] = ordenarPareja(primera, segunda)
  const tipo = clasificar(inferior, superior)
  const comparacion = compararCapas(inferior.resultado, superior.resultado)
  const nombreInferior = inferior.capa?.nombre ?? '—'
  const nombreSuperior = superior.capa?.nombre ?? '—'
  const veredicto = calcularEstadoComparacion({
    capaInferior: inferior.capa,
    capaSuperior: superior.capa,
    campaniaInferior: inferior.toma,
    campaniaSuperior: superior.toma,
    resultadoInferior: inferior.resultado,
    resultadoSuperior: superior.resultado,
  })
  // Lo comprobado son los circuitos, no los espesores: debajo de «✗ 1 celda
  // fuera», un «ESPESORES VERIFICADOS» en verde se leería como que la capa
  // está bien. Lo que no cerró sigue diciéndose igual que en el archivo.
  const estado: EstadoComparacion = veredicto.comprobado
    ? { comprobado: true, texto: tipo === 'espesor' ? `${TEXTO_CIRCUITOS_COMPROBADOS} Los espesores se juzgan con el semáforo de arriba.` : TEXTO_CIRCUITOS_COMPROBADOS }
    : veredicto

  // El corte se lee al revés que un espesor: la subrasante queda por debajo
  // del terreno, y lo que interesa es cuánto se bajó, en positivo.
  const signo = tipo === 'corte' ? -1 : 1
  const aMm = (metros: number | null) => (metros === null ? null : Math.round(signo * metros * 1000))
  const uno = aMm(comparacion.espesorMinimo)
  const otro = aMm(comparacion.espesorMaximo)
  const minimoMm = uno === null || otro === null ? null : Math.min(uno, otro)
  const maximoMm = uno === null || otro === null ? null : Math.max(uno, otro)

  const base = {
    tipo,
    inferior,
    superior,
    comparacion,
    minimoMm,
    medioMm: aMm(comparacion.espesorMedio),
    maximoMm,
    estado,
  }

  switch (tipo) {
    case 'repetibilidad':
      return {
        ...base,
        titulo: 'Misma superficie, dos tomas',
        que: `${nombreInferior} ${inferior.toma.fecha} → ${superior.toma.fecha}`,
        lectura: 'Lo que varía tu nivelación al repetirla: tu repetibilidad.',
      }
    case 'corte':
      return {
        ...base,
        titulo: 'Profundidad de corte',
        que: `${nombreInferior} → ${nombreSuperior}`,
        lectura: 'Cuánto se bajó del terreno a la subrasante. Un valor negativo es relleno.',
      }
    case 'espesor':
      return {
        ...base,
        titulo: 'Espesor colocado',
        que: `${nombreInferior} → ${nombreSuperior}`,
        lectura: lecturaDeEspesor(superior.capa, comparacion),
      }
    case 'acumulada':
      return {
        ...base,
        titulo: 'Diferencia acumulada',
        que: `${nombreInferior} → ${nombreSuperior}`,
        lectura: 'El paquete entero entre las dos capas: útil para verlo de una vez.',
      }
  }
}

/**
 * El espesor colocado contra el de proyecto de la capa de arriba, con el
 * mismo semáforo y el mismo redondeo que Análisis › Espesores: la cuenta es
 * `evaluarEspesores`, la misma función, para que el historial y Análisis
 * nunca digan cosas distintas de la misma celda. ✓ hasta la tolerancia,
 * △ al límite hasta el doble, ✗ fuera. De las que quedan fuera se dice
 * cuántas son delgadas (falta material) y cuántas gruesas (sobra), que es
 * lo que decide qué hacer en obra.
 */
function lecturaDeEspesor(capa: Capa | undefined, comparacion: ResultadoComparacion): string {
  if (!capa || capa.espesor <= 0) {
    return 'La capa de arriba no tiene espesor de proyecto: defínelo en Capas para compararlo.'
  }
  let delgadas = 0
  let gruesas = 0
  let alLimite = 0
  for (const celda of evaluarEspesores(comparacion, capa.espesor, capa.toleranciaMm).values()) {
    if (celda.estado === 'alLimite') alLimite += 1
    else if (celda.estado === 'fuera') {
      if (celda.delgada) delgadas += 1
      else gruesas += 1
    }
  }
  const cabeza = `Proyecto ${Math.round(capa.espesor * 1000)} mm ±${capa.toleranciaMm}`
  if (comparacion.comparables === 0) return `${cabeza}: ninguna celda medida en las dos capas.`
  if (delgadas + gruesas + alLimite === 0) return `${cabeza}: ✓ todo conforme.`
  const partes: string[] = []
  if (delgadas + gruesas > 0) {
    const cuales: string[] = []
    if (delgadas > 0) cuales.push(cuenta(delgadas, 'delgada', 'delgadas'))
    if (gruesas > 0) cuales.push(cuenta(gruesas, 'gruesa', 'gruesas'))
    partes.push(`✗ ${cuenta(delgadas + gruesas, 'celda fuera', 'celdas fuera')} (${cuales.join(' y ')})`)
  }
  if (alLimite > 0) partes.push(`△ ${cuenta(alLimite, 'celda al límite', 'celdas al límite')}`)
  return `${cabeza}: ${partes.join(' · ')}.`
}
