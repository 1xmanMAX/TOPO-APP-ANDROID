import { redondear3 } from '@topo/core'
// El núcleo todavía no exporta estos módulos desde su índice: se importan directo.
import { clasificarLectura, reglasDeMira, type ReglasMira } from '../../../core/src/campo/avisoLectura'
import type { HojaDeReplanteo, MotivoSinObjetivo } from '../../../core/src/campo/replanteo'
import { formatearCota } from '../formato'
import {
  componerInforme,
  esNumero,
  faltaDato,
  textoCota,
  textoProgresiva,
  DATO_INVALIDO,
  type Celda,
  type Columna,
  type Seccion,
} from './maquetacion'
import type { DatosEstacas, FilaEstaca } from './tipos'

const COLUMNAS: Columna[] = [
  { titulo: 'Progresiva', ancho: 22 },
  { titulo: 'Punto', ancho: 34 },
  { titulo: 'Cota proyecto', ancho: 26, alinear: 'der' },
  // Ancha: aquí van también los avisos de la mira.
  { titulo: 'Lectura objetivo', ancho: 58, alinear: 'der' },
  // En blanco a propósito: se llena a mano en campo.
  { titulo: 'Lectura en campo', ancho: 40 },
]

/** Por qué una fila del núcleo no tiene cota de proyecto, en palabras de obra. */
const MOTIVOS: Record<MotivoSinObjetivo, string | undefined> = {
  sinRasante: 'la calle no tiene rasante',
  capaInexistente: 'la capa no está en el paquete',
  fueraDeSeccion: 'fuera de sección',
  // Con este motivo la cota sí está; lo que falta es la altura instrumental.
  alturaInvalida: undefined,
}

/**
 * Pasa la hoja que calcula el núcleo (`hojaDeReplanteo`) a los datos del
 * informe, sin perder nada: las filas sin cota siguen ahí con su motivo, las
 * visuales largas quedan marcadas y los avisos se imprimen. La comprobación
 * también viaja: una hoja sobre una AI sin cerrar sale con la franja.
 */
export function datosDeEstacasDesdeHoja(
  hoja: HojaDeReplanteo,
): Pick<DatosEstacas, 'alturaInstrumental' | 'filas' | 'avisos' | 'comprobado'> {
  return {
    alturaInstrumental: hoja.alturaInstrumental,
    comprobado: hoja.comprobado,
    avisos: [...hoja.avisos],
    filas: hoja.filas.map((f): FilaEstaca => {
      const motivo = f.motivoSinObjetivo === null ? undefined : MOTIVOS[f.motivoSinObjetivo]
      return {
        progresiva: f.progresiva,
        punto: f.nombre,
        cotaProyecto: f.cotaProyecto,
        lecturaObjetivo: f.lecturaObjetivo,
        ...(motivo === undefined ? {} : { motivoSinCota: motivo }),
        visualLarga: f.fueraDeAlcance,
      }
    }),
  }
}

/**
 * La lectura objetivo con lo que conviene saber antes de ir al punto, según
 * las reglas de la mira (diseño §2). Nada que no se pueda leer sale como si
 * fuera una lectura normal.
 */
function textoObjetivo(objetivo: number | null, reglas: ReglasMira): string {
  if (objetivo === null) return 'falta altura instr.'
  if (!esNumero(objetivo)) return DATO_INVALIDO
  const t = formatearCota(objetivo)
  // La mira no puede marcar negativo: el punto queda por encima del instrumento.
  if (objetivo < 0) return `${t} (cota sobre el instrumento: cambiar de estación)`
  const rango = clasificarLectura(objetivo, reglas)
  if (rango === 'imposible')
    return objetivo > reglas.largoMira
      ? `${t} (no cabe en la mira de ${reglas.largoMira} m: cambiar de estación)`
      : // El cero: el hilo no cae en el pie de la mira.
        `${t} (lectura imposible: cambiar de estación)`
  if (rango === 'pocoPrecisa') return `${t} (poco precisa)`
  return t
}

function lecturaDeFila(f: FilaEstaca, ai: number | null, reglas: ReglasMira): string {
  const cota = f.cotaProyecto
  if (faltaDato(cota)) return `sin cota de proyecto${f.motivoSinCota === undefined ? '' : ` (${f.motivoSinCota})`}`
  if (!esNumero(cota)) return DATO_INVALIDO
  let objetivo: number | null
  if (!faltaDato(f.lecturaObjetivo)) objetivo = f.lecturaObjetivo
  else if (ai === null) objetivo = null
  else objetivo = esNumero(ai) ? redondear3(ai - cota) : Number.NaN
  const texto = textoObjetivo(objetivo, reglas)
  return f.visualLarga === true ? `${texto} (visual demasiado larga)` : texto
}

/**
 * Hoja de estacas para replantear: la lectura que debería marcar la mira en
 * cada punto si estuviera a cota de proyecto (altura instrumental − cota), y
 * una columna vacía para anotar lo que de verdad marcó. Las lecturas que no
 * caben en la mira, las imposibles y las poco precisas salen marcadas.
 */
export function hojaDeEstacas(datos: DatosEstacas): Uint8Array {
  const reglas = reglasDeMira(datos.mira ?? {})
  // Con reglas absurdas cada aviso de la hoja sería falso: mejor no hacerla.
  if (reglas === null) throw new Error('Las reglas de la mira no son válidas (largo, lectura mínima, margen).')
  const ai = datos.alturaInstrumental
  const filas: Celda[][] = datos.filas.map((f) => [
    textoProgresiva(f.progresiva),
    f.punto,
    textoCota(f.cotaProyecto),
    lecturaDeFila(f, ai, reglas),
    '',
  ])

  const maxima = formatearCota(redondear3(reglas.largoMira - reglas.margenSuperior))
  const secciones: Seccion[] = [
    {
      tipo: 'parrafo',
      texto: `Altura instrumental: ${ai === null ? 'sin plantar el equipo' : textoCota(ai)}`,
      resaltado: true,
    },
    {
      tipo: 'parrafo',
      texto:
        'Lectura objetivo = altura instrumental - cota de proyecto. ' +
        'Si la mira marca más que el objetivo, falta material (rellena); si marca menos, sobra (corta).',
    },
    {
      tipo: 'parrafo',
      texto: `Mira de ${reglas.largoMira} m: lectura legible entre ${formatearCota(reglas.lecturaMin)} y ${maxima} m.`,
    },
    ...(datos.avisos ?? []).map((aviso): Seccion => ({ tipo: 'parrafo', texto: aviso, resaltado: true })),
    { tipo: 'tabla', columnas: COLUMNAS, filas },
  ]

  return componerInforme({ titulo: 'Hoja de estacas', base: datos, secciones })
}
