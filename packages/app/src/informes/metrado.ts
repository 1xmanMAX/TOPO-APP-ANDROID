import { redondear3 } from '@topo/core'
import { cuenta } from '../formato'
import {
  componerInforme,
  esNumero,
  textoCota,
  textoProgresiva,
  DATO_INVALIDO,
  type Celda,
  type Columna,
  type Seccion,
} from './maquetacion'
import type { DatosMetrado, SeccionDescartadaMetrado, SeccionMetrado } from './tipos'

const COLUMNAS_AREAS: Columna[] = [
  { titulo: 'Progresiva', ancho: 40 },
  { titulo: 'Corte (m²)', ancho: 35, alinear: 'der' },
  { titulo: 'Relleno (m²)', ancho: 35, alinear: 'der' },
  { titulo: 'Observación', ancho: 70 },
]

const COLUMNAS_VOLUMENES: Columna[] = [
  { titulo: 'Desde', ancho: 24 },
  { titulo: 'Hasta', ancho: 24 },
  { titulo: 'Longitud (m)', ancho: 26, alinear: 'der' },
  { titulo: 'Corte (m³)', ancho: 28, alinear: 'der' },
  { titulo: 'Relleno (m³)', ancho: 28, alinear: 'der' },
  { titulo: 'Observación', ancho: 50 },
]

/**
 * Qué secciones no entraron en los volúmenes. Si llega la lista del núcleo
 * (con índice y motivo) se usa esa; si no, el mismo criterio básico de
 * `volumenesPorAreasMedias`: sale la que tiene algún dato que no es número,
 * y de una progresiva repetida entra solo la primera que llegó. Se marca en
 * la tabla de áreas para que nadie sume a mano una fila que el metrado no usó.
 */
function revisarSecciones(
  secciones: SeccionMetrado[],
  delNucleo: SeccionDescartadaMetrado[] | null,
): { observaciones: string[]; repetidas: number[]; rotas: number } {
  const porIndice = new Map((delNucleo ?? []).map((d) => [d.indice, d.motivo]))
  const vistas = new Set<number>()
  const repetidas: number[] = []
  let rotas = 0
  const observaciones = secciones.map((s, i) => {
    const motivo = porIndice.get(i)
    if (motivo !== undefined) return `no entró: ${motivo}`
    if (!esNumero(s.progresiva) || !esNumero(s.corte) || !esNumero(s.relleno)) {
      rotas += 1
      return `${DATO_INVALIDO}: no entró`
    }
    if (vistas.has(s.progresiva)) {
      if (!repetidas.includes(s.progresiva)) repetidas.push(s.progresiva)
      return 'repetida: no entró'
    }
    vistas.add(s.progresiva)
    return ''
  })
  return { observaciones, repetidas, rotas }
}

/** «fila 4 (sin progresiva)» o «0+020 (area negativa)»: la fila se cuenta desde 1, como la ve el topógrafo. */
function nombrarDescartada(d: SeccionDescartadaMetrado): string {
  const donde = d.progresiva !== null && esNumero(d.progresiva) ? textoProgresiva(d.progresiva) : `fila ${d.indice + 1}`
  return `${donde} (${d.motivo})`
}

/**
 * Metrado de movimiento de tierras: áreas de cada sección y volúmenes por
 * tramo (áreas medias, calculados en el núcleo) con sus totales. Los tramos
 * más largos que la separación usual se marcan: su volumen es más dudoso. Las
 * secciones que no entraron se dicen, y si llegan los totales del núcleo se
 * comprueba que cuadren con la suma de los tramos impresos.
 */
export function metrado(datos: DatosMetrado): Uint8Array {
  const listaDelNucleo = Array.isArray(datos.descartadas) ? datos.descartadas : null
  const revision = revisarSecciones(datos.secciones, listaDelNucleo)
  const areas: Celda[][] = datos.secciones.map((s, i) => [
    textoProgresiva(s.progresiva),
    textoCota(s.corte),
    textoCota(s.relleno),
    revision.observaciones[i] ?? '',
  ])

  const longitudDe = (desde: number, hasta: number) =>
    esNumero(desde) && esNumero(hasta) ? (hasta - desde).toFixed(2) : DATO_INVALIDO
  const volumenes: Celda[][] = datos.tramos.map((t) => [
    textoProgresiva(t.desde),
    textoProgresiva(t.hasta),
    longitudDe(t.desde, t.hasta),
    textoCota(t.volCorte),
    textoCota(t.volRelleno),
    t.hueco === true ? 'hueco sin secciones' : '',
  ])

  // Una suma con un NaN sale «dato inválido» en el total: no se esconde.
  const longitud = datos.tramos.reduce((s, t) => s + (t.hasta - t.desde), 0)
  const sumaCorte = redondear3(datos.tramos.reduce((s, t) => s + t.volCorte, 0))
  const sumaRelleno = redondear3(datos.tramos.reduce((s, t) => s + t.volRelleno, 0))
  const huecos = datos.tramos.filter((t) => t.hueco === true).length

  const secciones: Seccion[] = [
    {
      tipo: 'parrafo',
      texto: 'Método de áreas medias: volumen del tramo = (A1 + A2) / 2 x distancia entre secciones.',
    },
    { tipo: 'tabla', titulo: 'Áreas por sección', columnas: COLUMNAS_AREAS, filas: areas },
  ]

  const repetidas = datos.duplicadas ?? revision.repetidas
  if (repetidas.length > 0)
    secciones.push({
      tipo: 'parrafo',
      texto:
        `${cuenta(repetidas.length, 'progresiva repetida', 'progresivas repetidas')} ` +
        `(${repetidas.map(textoProgresiva).join(', ')}): se usó la primera sección que llegó.`,
      resaltado: true,
    })
  if (listaDelNucleo !== null && listaDelNucleo.length > 0)
    secciones.push({
      tipo: 'parrafo',
      texto:
        `${cuenta(listaDelNucleo.length, 'sección descartada', 'secciones descartadas')}: ` +
        `${listaDelNucleo.map(nombrarDescartada).join(', ')}.`,
      resaltado: true,
    })
  const contadas = typeof datos.descartadas === 'number' ? datos.descartadas : revision.rotas
  if (listaDelNucleo === null && contadas > 0)
    secciones.push({
      tipo: 'parrafo',
      texto: `${cuenta(contadas, 'sección descartada', 'secciones descartadas')} porque algún dato no es número.`,
      resaltado: true,
    })
  const incompletas = datos.seccionesIncompletas ?? []
  if (incompletas.length > 0)
    secciones.push({
      tipo: 'parrafo',
      texto:
        `${cuenta(incompletas.length, 'sección entró', 'secciones entraron')} habiendo perdido puntos ` +
        `(${incompletas.map(textoProgresiva).join(', ')}): su área es dudosa.`,
      resaltado: true,
    })

  secciones.push({
    tipo: 'tabla',
    titulo: 'Volúmenes por tramo',
    columnas: COLUMNAS_VOLUMENES,
    filas: volumenes,
    filaTotal: [
      'TOTAL',
      '',
      esNumero(longitud) ? longitud.toFixed(2) : DATO_INVALIDO,
      textoCota(sumaCorte),
      textoCota(sumaRelleno),
      '',
    ],
  })
  if (datos.sinDatos === true)
    secciones.push({
      tipo: 'parrafo',
      texto: 'Menos de dos secciones válidas: no se pudo calcular ningún volumen. Los totales en cero no son un resultado.',
      resaltado: true,
    })
  if (huecos > 0)
    secciones.push({
      tipo: 'parrafo',
      texto: `${cuenta(huecos, 'tramo pasa', 'tramos pasan')} de la separación usual entre secciones: su volumen se calculó sobre un hueco sin secciones.`,
      resaltado: true,
    })

  // Los totales del núcleo y la suma de lo impreso tienen que ser lo mismo; si
  // no, alguno de los dos está mal y el papel no debe elegir en silencio.
  const recibido = (v: number | undefined, suma: number) => v === undefined || (esNumero(v) && redondear3(v) === suma)
  if (!recibido(datos.totalCorte, sumaCorte) || !recibido(datos.totalRelleno, sumaRelleno))
    secciones.push({
      tipo: 'parrafo',
      texto:
        `Los totales recibidos (corte ${textoCota(datos.totalCorte, '-')} m³, relleno ${textoCota(datos.totalRelleno, '-')} m³) ` +
        `no cuadran con la suma de los tramos (corte ${textoCota(sumaCorte)} m³, relleno ${textoCota(sumaRelleno)} m³).`,
      resaltado: true,
    })

  return componerInforme({ titulo: 'Metrado de movimiento de tierras', base: datos, secciones })
}
