import { aMilimetros, redondear3 } from '@topo/core'
import { formatearCota } from '../formato'
import {
  componerInforme,
  conSigno,
  esNumero,
  faltaDato,
  formatearMm,
  textoCota,
  DATO_INVALIDO,
  type Celda,
  type Columna,
  type Seccion,
} from './maquetacion'
import type { CierreLibreta, DatosLibreta, FilaLibreta } from './tipos'

const COLUMNAS: Columna[] = [
  { titulo: 'Punto', ancho: 24 },
  { titulo: 'Atrás', ancho: 19, alinear: 'der' },
  { titulo: 'Intermedia', ancho: 21, alinear: 'der' },
  { titulo: 'Adelante', ancho: 20, alinear: 'der' },
  { titulo: 'Alt. instr.', ancho: 23, alinear: 'der' },
  { titulo: 'Cota', ancho: 23, alinear: 'der' },
  { titulo: 'Corr. (mm)', ancho: 20, alinear: 'der' },
  { titulo: 'Cota compensada', ancho: 30, alinear: 'der' },
]

/** Lo que se sabe del cierre. Solo `juzgado` con `pasa` hace válidas las cotas compensadas. */
export type JuicioCierre =
  | { tipo: 'sinCierre' }
  | { tipo: 'invalido' }
  | { tipo: 'juzgado'; errorMm: number; pasa: boolean }

/**
 * El mismo criterio que `calcularCierre` del núcleo, para que el PDF y la
 * pantalla den siempre el mismo veredicto: el error SIN redondear contra la
 * tolerancia con una milésima de mm de holgura (por el punto flotante).
 * Redondear antes el error a mm enteros haría pasar en el papel un 6.4 mm
 * contra 6.2 mm que la pantalla rechaza.
 */
export function juzgarCierre(cierre: CierreLibreta | null): JuicioCierre {
  if (cierre === null) return { tipo: 'sinCierre' }
  const { cotaCalculada, cotaConocida, toleranciaMm } = cierre
  if (!esNumero(cotaCalculada) || !esNumero(cotaConocida) || !esNumero(toleranciaMm) || toleranciaMm < 0)
    return { tipo: 'invalido' }
  const errorMm = aMilimetros(cotaCalculada - cotaConocida)
  return { tipo: 'juzgado', errorMm, pasa: Math.abs(errorMm) <= toleranciaMm + 1e-3 }
}

/** «+0.006», «-0.010», «0.000»: metros con el signo a la vista. */
function metrosConSigno(valor: number): string {
  return `${valor > 0 ? '+' : ''}${formatearCota(valor)}`
}

/** «+6.4», «-20», «0»: milímetros con un decimal como mucho y el signo a la vista. */
function mmConSigno(valor: number): string {
  const texto = formatearMm(valor)
  return valor > 0 && texto !== '0' ? `+${texto}` : texto
}

/** Una lectura escrita no numérica no se suma: se cuenta, para decirlo. */
function sumar(filas: FilaLibreta[], campo: 'atras' | 'adelante'): { suma: number; invalidas: number } {
  let suma = 0
  let invalidas = 0
  for (const f of filas) {
    const v = f[campo]
    if (faltaDato(v)) continue
    if (esNumero(v)) suma += v
    else invalidas += 1
  }
  return { suma: redondear3(suma), invalidas }
}

/**
 * La comprobación aritmética hecha, no solo enunciada: Σ atrás − Σ adelante
 * contra la cota del último punto de cambio menos la del primero. Si las
 * cotas no salen de esas lecturas (un error al pasarlas), aquí se ve.
 */
function comprobacionAritmetica(filas: FilaLibreta[], desnivel: number, invalidas: number): Seccion {
  if (invalidas > 0)
    return {
      tipo: 'parrafo',
      texto: `No se pudo hacer la comprobación aritmética: hay lecturas de cambio con ${DATO_INVALIDO}.`,
      resaltado: true,
    }
  const primera = filas.find((f) => esNumero(f.atras) && esNumero(f.cota))
  const ultima = [...filas].reverse().find((f) => esNumero(f.adelante) && esNumero(f.cota))
  if (primera === undefined || ultima === undefined)
    return {
      tipo: 'parrafo',
      texto: 'No se pudo hacer la comprobación aritmética: faltan las cotas de los puntos de cambio.',
      resaltado: true,
    }
  const diferencia = redondear3((ultima.cota as number) - (primera.cota as number))
  const descuadreMm = Math.round(aMilimetros(redondear3(desnivel - diferencia)))
  if (descuadreMm === 0)
    return { tipo: 'parrafo', texto: `Comprobación correcta: última cota - primera = ${metrosConSigno(diferencia)} m.` }
  return {
    tipo: 'parrafo',
    texto:
      `No cuadra por ${Math.abs(descuadreMm)} mm: última cota - primera = ${metrosConSigno(diferencia)} m. ` +
      'Revise las cotas o las lecturas anotadas.',
    resaltado: true,
  }
}

/**
 * Libreta de nivelación con su cierre: las lecturas tal como se tomaron
 * (atrás, intermedia, adelante), las sumas para la comprobación aritmética
 * (las intermedias no entran: no son puntos de cambio) y el error de cierre
 * contra la tolerancia del circuito.
 *
 * Regla dura (diseño §3): si la nivelación no cerró, o cerró fuera de
 * tolerancia, sus cotas no están comprobadas. La franja sale entonces aunque
 * quien llama diga `comprobado: true`, y las cotas compensadas no se
 * presentan como válidas.
 */
export function libretaConCierre(datos: DatosLibreta): Uint8Array {
  const atras = sumar(datos.filas, 'atras')
  const adelante = sumar(datos.filas, 'adelante')
  const desnivel = redondear3(atras.suma - adelante.suma)
  const juicio = juzgarCierre(datos.cierre)
  const compensacionValida = juicio.tipo === 'juzgado' && juicio.pasa
  const comprobado = datos.comprobado && compensacionValida

  // Una cota compensada con un cierre que no vale no se imprime como si valiera.
  const compensada = (v: number | null | undefined, formato: (n: number) => string): string => {
    if (faltaDato(v)) return ''
    if (!compensacionValida) return 'no válida'
    return esNumero(v) ? formato(v) : DATO_INVALIDO
  }

  const filas: Celda[][] = datos.filas.map((f) => [
    f.punto,
    textoCota(f.atras, ''),
    textoCota(f.intermedia, ''),
    textoCota(f.adelante, ''),
    textoCota(f.alturaInstrumental, ''),
    textoCota(f.cota, ''),
    compensada(f.correccionMm, conSigno),
    compensada(f.cotaCompensada, formatearCota),
  ])
  const filaTotal: Celda[] = ['Sumas', formatearCota(atras.suma), '', formatearCota(adelante.suma), '', '', '', '']

  const secciones: Seccion[] = [
    { tipo: 'tabla', columnas: COLUMNAS, filas, filaTotal },
    {
      tipo: 'parrafo',
      texto:
        `Suma atrás - suma adelante = ${metrosConSigno(desnivel)} m ` +
        '(debe igualar la última cota menos la primera; las intermedias no entran).',
    },
    comprobacionAritmetica(datos.filas, desnivel, atras.invalidas + adelante.invalidas),
    { tipo: 'titulo', texto: 'Cierre' },
  ]

  const c = datos.cierre
  if (c === null) {
    secciones.push({
      tipo: 'parrafo',
      texto:
        'Sin cierre: la nivelación no volvió a un punto de cota conocida, así que su error no se puede medir ni compensar.',
      resaltado: true,
    })
  } else if (juicio.tipo !== 'juzgado') {
    secciones.push({
      tipo: 'parrafo',
      texto:
        `Cierre con datos inválidos: no se puede juzgar. Cota calculada ${textoCota(c.cotaCalculada)}, ` +
        `cota conocida ${textoCota(c.cotaConocida)}, tolerancia ${formatearMm(c.toleranciaMm)} mm.`,
      resaltado: true,
    })
  } else {
    const km = esNumero(c.distanciaKm) ? ` (${c.distanciaKm.toFixed(2)} km)` : ''
    secciones.push(
      {
        tipo: 'parrafo',
        texto: `Error de cierre en ${c.puntoDeCierre}: ${formatearCota(c.cotaCalculada)} - ${formatearCota(c.cotaConocida)} = ${mmConSigno(juicio.errorMm)} mm`,
      },
      { tipo: 'parrafo', texto: `Tolerancia: ±${formatearMm(c.toleranciaMm)} mm${km}` },
      {
        tipo: 'parrafo',
        texto: juicio.pasa
          ? 'Dentro de tolerancia.'
          : 'Fuera de tolerancia: hay que repetir la nivelación; compensar no arregla un error así.',
        resaltado: true,
      },
      {
        tipo: 'parrafo',
        texto: juicio.pasa
          ? `Compensación: ${c.compensacion}`
          : 'Compensación: no se aplica, el cierre está fuera de tolerancia.',
      },
    )
  }

  return componerInforme({
    titulo: 'Libreta de nivelación con cierre',
    base: { ...datos, comprobado },
    secciones,
  })
}
