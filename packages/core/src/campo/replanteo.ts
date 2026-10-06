import type { Calle, Capa, Id } from '../modelo/tipos'
import { INSTRUMENTO_DE_FABRICA } from '../modelo/instrumento'
import { cotaTeoricaDeCapa } from '../rasante/espesores'
import {
  AVISO_REGLAS_MIRA,
  clasificarLectura,
  evaluarLectura,
  lecturaMaximaLegible,
  rangoEsperado,
  reglasDeMira,
  type EstadoAviso,
  type RangoLectura,
  type ReglasMira,
  type TipoAccion,
} from './avisoLectura'
import { lecturaObjetivo as lecturaObjetivoDe } from './calculadora'

export interface EntradaReplanteo {
  calle: Calle
  /** El paquete entero: hace falta para restar lo que va encima de la capa. */
  capas: Capa[]
  capaId: Id
  progresivas: number[]
  alturaInstrumental: number
  /**
   * Si la AI sale de un circuito ya cerrado (o de un BM oficial). Si no, la
   * hoja sirve igual, pero sus cotas no están comprobadas y se dice (§3).
   */
  alturaComprobada: boolean
  /** Por defecto, las del instrumento de fábrica: mira de 5 m, leer entre 0.30 y 4.70. */
  mira?: Partial<ReglasMira>
  /**
   * Dónde está plantado el nivel, en progresiva. Sin él no se puede saber el
   * largo de cada visual y esa comprobación queda a cargo de quien llama.
   * La distancia se mide a lo largo del eje: el desvío lateral de la
   * estación no se conoce, y con calles de pocos metros de ancho no cambia
   * el veredicto.
   */
  progresivaEstacion?: number
  /** Visual más larga permitida, en metros. Por defecto la del instrumento de fábrica (50, diseño §2). */
  visualMax?: number
}

/**
 * Por qué una fila no tiene lectura objetivo. Los tres primeros también
 * dejan la fila sin cota de proyecto; con `alturaInvalida` la cota sí está,
 * lo que falta es desde dónde leerla.
 */
export type MotivoSinObjetivo = 'sinRasante' | 'capaInexistente' | 'fueraDeSeccion' | 'alturaInvalida'

export interface FilaReplanteo {
  progresiva: number
  puntoId: Id
  nombre: string
  /** Metros desde el eje, con el signo del lado (negativo = izquierda). */
  offset: number
  cotaProyecto: number | null
  /** Altura instrumental − cota de proyecto: lo que la mira tiene que marcar. */
  lecturaObjetivo: number | null
  /** Null cuando hay lecturaObjetivo. */
  motivoSinObjetivo: MotivoSinObjetivo | null
  /**
   * Si el objetivo se puede leer desde esta estación: `imposible` no cabe en
   * la mira, `pocoPrecisa` cabe pero cerca del suelo o de la punta. Null si
   * no hay objetivo o las reglas de la mira no son válidas.
   */
  rangoObjetivo: RangoLectura | null
  /** Lecturas con las que el punto queda conforme (objetivo ± tolerancia de la capa). */
  aceptable: { desde: number; hasta: number } | null
  /** |progresiva − progresivaEstacion|; null si no se dio la estación. */
  distanciaEstacion: number | null
  /** La visual pasa de la máxima: la lectura no es fiable aunque se vea. */
  fueraDeAlcance: boolean
}

export interface HojaDeReplanteo {
  alturaInstrumental: number
  capaId: Id
  /** La de la capa; null si la capa no está en el paquete. */
  toleranciaMm: number | null
  /** Copia de `alturaComprobada`: toda la hoja depende de esa AI. */
  comprobado: boolean
  /** Por progresiva ascendente y, dentro de cada una, de izquierda a derecha. */
  filas: FilaReplanteo[]
  /** Resumen en palabras para la pantalla; el detalle por fila está en `filas`. */
  avisos: string[]
}

function contar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

function m3(valor: number): string {
  return valor.toFixed(3)
}

/**
 * La hoja que se lleva al campo para replantear una capa desde una estación:
 * para cada progresiva y cada punto de la sección de la calle, la cota que
 * pide el proyecto y la lectura que la mira tiene que marcar.
 *
 * Nada se calcula a medias en silencio: sin rasante, con una capa que no
 * existe, con un punto fuera de la sección o con una AI que no es número, la
 * fila sale igual pero sin objetivo y con su motivo; un objetivo que no
 * conviene leer (fuera de mira, poco preciso o con una visual muy larga) sale
 * marcado. `avisos` lo resume.
 */
export function hojaDeReplanteo(entrada: EntradaReplanteo): HojaDeReplanteo {
  const { calle, capas, capaId, alturaInstrumental, alturaComprobada } = entrada
  const reglas = reglasDeMira(entrada.mira)
  const visualMax = entrada.visualMax ?? INSTRUMENTO_DE_FABRICA.visualMax
  const avisos: string[] = []

  const validas = entrada.progresivas.filter((p) => Number.isFinite(p))
  const descartadas = entrada.progresivas.length - validas.length
  const progresivas = [...new Set(validas)].sort((a, b) => a - b)
  const puntos = [...calle.seccion.puntos].sort((a, b) => a.distancia - b.distancia)

  const capa = capas.find((c) => c.id === capaId) ?? null
  const rasante = calle.rasante
  const aiValida = Number.isFinite(alturaInstrumental)

  // `cotaTeoricaDeCapa` toma una capa inexistente como si no tuviera nada
  // encima, es decir, como la carpeta terminada: replantear con eso pondría
  // la estaca varios centímetros alta. Mejor no dar cota.
  if (rasante === null) avisos.push(`La calle «${calle.nombre}» no tiene rasante de proyecto cargada.`)
  if (capa === null) avisos.push(`La capa «${capaId}» no está en el paquete de capas.`)
  if (descartadas > 0) {
    avisos.push(contar(descartadas, 'progresiva no es un número y se dejó fuera.', 'progresivas no son números y se dejaron fuera.'))
  }
  if (progresivas.length === 0) avisos.push('No hay progresivas que replantear.')
  if (puntos.length === 0) avisos.push(`La sección de la calle «${calle.nombre}» no tiene puntos.`)
  if (!aiValida) avisos.push('La altura instrumental no es un número: no hay lecturas objetivo.')
  if (reglas === null) avisos.push(AVISO_REGLAS_MIRA)

  // El largo de la visual solo se comprueba si se sabe dónde está la estación.
  let estacion: number | null = null
  if (entrada.progresivaEstacion !== undefined) {
    if (!Number.isFinite(entrada.progresivaEstacion)) {
      avisos.push('La progresiva de la estación no es un número: no se comprobó el largo de las visuales.')
    } else if (!Number.isFinite(visualMax) || visualMax <= 0) {
      avisos.push('La visual máxima no es válida: no se comprobó el largo de las visuales.')
    } else {
      estacion = entrada.progresivaEstacion
    }
  }

  const filas: FilaReplanteo[] = []
  // Puntos (no filas) fuera de sección, y en cuántas progresivas: así el aviso
  // habla de lo que hay que corregir en la sección, no de su repetición.
  const fueraDeSeccion = new Map<Id, string>()
  const progresivasFueraDeSeccion = new Set<number>()
  const progresivasLejos = new Set<number>()
  let imposibles = 0
  let pocoPrecisas = 0

  for (const progresiva of progresivas) {
    const distanciaEstacion = estacion === null ? null : Math.abs(progresiva - estacion)
    const fueraDeAlcance = distanciaEstacion !== null && distanciaEstacion > visualMax
    if (fueraDeAlcance) progresivasLejos.add(progresiva)

    for (const punto of puntos) {
      let cotaProyecto: number | null = null
      let motivo: MotivoSinObjetivo | null = null
      if (rasante === null) motivo = 'sinRasante'
      else if (capa === null) motivo = 'capaInexistente'
      else {
        cotaProyecto = cotaTeoricaDeCapa(rasante, capas, capaId, progresiva, punto.distancia)
        if (cotaProyecto === null) {
          motivo = 'fueraDeSeccion'
          fueraDeSeccion.set(punto.id, punto.nombre)
          progresivasFueraDeSeccion.add(progresiva)
        } else if (!aiValida) {
          motivo = 'alturaInvalida'
        }
      }

      const lecturaObjetivo = motivo === null ? lecturaObjetivoDe(alturaInstrumental, cotaProyecto!) : null
      const rangoObjetivo = lecturaObjetivo === null || reglas === null ? null : clasificarLectura(lecturaObjetivo, reglas)
      if (rangoObjetivo === 'imposible') imposibles += 1
      if (rangoObjetivo === 'pocoPrecisa') pocoPrecisas += 1
      const aceptable =
        lecturaObjetivo === null || capa === null ? null : rangoEsperado(alturaInstrumental, cotaProyecto!, capa.toleranciaMm)

      filas.push({
        progresiva,
        puntoId: punto.id,
        nombre: punto.nombre,
        offset: punto.distancia,
        cotaProyecto,
        lecturaObjetivo,
        motivoSinObjetivo: motivo,
        rangoObjetivo,
        aceptable,
        distanciaEstacion,
        fueraDeAlcance,
      })
    }
  }

  if (fueraDeSeccion.size > 0) {
    const n = fueraDeSeccion.size
    const nombres = [...fueraDeSeccion.values()].join(', ')
    avisos.push(
      `${contar(n, 'punto', 'puntos')} (${nombres}) ${n === 1 ? 'cae' : 'caen'} fuera de la sección del proyecto ` +
        `en ${contar(progresivasFueraDeSeccion.size, 'progresiva', 'progresivas')} y no ${n === 1 ? 'tiene' : 'tienen'} cota.`,
    )
  }
  if (imposibles > 0) {
    avisos.push(
      `${contar(imposibles, 'lectura objetivo no cabe', 'lecturas objetivo no caben')} en la mira de ${reglas!.largoMira} m: cambie de estación.`,
    )
  }
  if (pocoPrecisas > 0) {
    const maxima = m3(lecturaMaximaLegible(reglas!))
    avisos.push(
      `${contar(pocoPrecisas, 'lectura objetivo queda', 'lecturas objetivo quedan')} fuera de ` +
        `${m3(reglas!.lecturaMin)} … ${maxima} m: ${pocoPrecisas === 1 ? 'poco precisa' : 'poco precisas'}, mejor otra estación.`,
    )
  }
  if (progresivasLejos.size > 0) {
    avisos.push(
      `${contar(progresivasLejos.size, 'progresiva queda', 'progresivas quedan')} a más de ${visualMax} m de la estación: visual demasiado larga.`,
    )
  }
  if (!alturaComprobada) avisos.push('Cotas sobre una nivelación sin cerrar: no comprobadas.')

  return {
    alturaInstrumental,
    capaId,
    toleranciaMm: capa?.toleranciaMm ?? null,
    comprobado: alturaComprobada,
    filas,
    avisos,
  }
}

export interface OpcionesVeredicto {
  /** Si la AI con la que se calculó el objetivo viene de un circuito cerrado. */
  alturaComprobada: boolean
  mira?: Partial<ReglasMira>
}

export interface VeredictoReplanteo {
  /** Null si la cuenta no se pudo hacer (ver `estado` y `avisos`). */
  tipo: TipoAccion | null
  /** Sin signo: el sentido lo da `tipo`. */
  mm: number | null
  estado: EstadoAviso
  /** Vale la pena volver a leer antes de mover material. */
  sospechosa: boolean
  rangoLectura: RangoLectura | null
  comprobado: boolean
  avisos: string[]
}

/**
 * Qué hacer con el punto después de leer la mira sobre él.
 *
 * Objetivo − leída = cota medida − cota de proyecto (la altura instrumental
 * se cancela). Si la mira marca más que el objetivo, el suelo está más bajo
 * de lo pedido: falta, rellena. Si marca menos, sobra: corta.
 *
 * Por eso es el mismo juicio que `evaluarLectura` con la AI puesta en el
 * objetivo y el proyecto en 0: se le delega para que las dos pantallas
 * validen y redondeen igual el mismo punto.
 */
export function veredictoReplanteo(
  lecturaObjetivo: number,
  lecturaLeida: number,
  toleranciaMm: number,
  opciones: OpcionesVeredicto,
): VeredictoReplanteo {
  const { alturaComprobada, mira } = opciones
  if (!Number.isFinite(lecturaObjetivo)) {
    const reglas = reglasDeMira(mira)
    return {
      tipo: null,
      mm: null,
      estado: 'datoInvalido',
      sospechosa: false,
      rangoLectura: reglas === null ? null : clasificarLectura(lecturaLeida, reglas),
      comprobado: alturaComprobada,
      avisos: [
        'La lectura objetivo no es un número.',
        ...(alturaComprobada ? [] : ['Cota sobre una nivelación sin cerrar: no comprobada.']),
      ],
    }
  }

  const aviso = evaluarLectura({
    alturaInstrumental: lecturaObjetivo,
    lectura: lecturaLeida,
    cotaProyecto: 0,
    toleranciaMm,
    alturaComprobada,
    mira,
  })
  return {
    tipo: aviso.accion?.tipo ?? null,
    mm: aviso.accion?.mm ?? null,
    estado: aviso.estado,
    sospechosa: aviso.sospechosa,
    rangoLectura: aviso.rangoLectura,
    comprobado: aviso.comprobado,
    avisos: aviso.avisos,
  }
}
