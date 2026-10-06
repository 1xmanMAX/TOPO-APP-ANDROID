import { redondear3 } from '@topo/core'
import { formatearCota } from '../formato'
import {
  componerInforme,
  conSigno,
  diferenciaMm,
  esNumero,
  estadoDe,
  faltaDato,
  textoCota,
  textoProgresiva,
  DATO_INVALIDO,
  type Celda,
  type Columna,
} from './maquetacion'
import type { DatosEspesores } from './tipos'

const COLUMNAS: Columna[] = [
  { titulo: 'Progresiva', ancho: 22 },
  { titulo: 'Punto', ancho: 28 },
  { titulo: 'Cota abajo', ancho: 22, alinear: 'der' },
  { titulo: 'Cota arriba', ancho: 22, alinear: 'der' },
  { titulo: 'Espesor (m)', ancho: 22, alinear: 'der' },
  { titulo: 'Proyecto (m)', ancho: 22, alinear: 'der' },
  { titulo: 'Dif. (mm)', ancho: 16, alinear: 'der' },
  { titulo: 'Estado', ancho: 26 },
]

/**
 * Control de espesores: espesor = cota de la capa de arriba − cota de la de
 * abajo en el mismo punto, contra el espesor de proyecto. Diferencia negativa
 * = la capa quedó delgada.
 */
export function espesores(datos: DatosEspesores): Uint8Array {
  const titulo = 'Control de espesores'
  if (datos.capaArriba === null) {
    return componerInforme({
      titulo,
      base: datos,
      secciones: [
        {
          tipo: 'parrafo',
          texto:
            `Todavía no hay una capa medida sobre ${datos.capaAbajo}: el espesor es la diferencia ` +
            'entre dos capas y sale cuando se nivele la de arriba.',
          resaltado: true,
        },
      ],
    })
  }

  const tol = datos.encabezado.toleranciaMm
  const filas: Celda[][] = datos.filas.map((f) => {
    const { cotaAbajo, cotaArriba, espesorProyecto } = f
    const base = [textoProgresiva(f.progresiva), f.punto]
    const abajo = textoCota(cotaAbajo)
    const arriba = textoCota(cotaArriba)
    const proyecto = textoCota(espesorProyecto)
    // Un número roto en cualquier cota no se juzga: ni FUERA ni CONFORME.
    const rota = (v: unknown) => !faltaDato(v) && !esNumero(v)
    if (rota(cotaAbajo) || rota(cotaArriba) || !esNumero(f.progresiva))
      return [...base, abajo, arriba, '-', proyecto, '-', DATO_INVALIDO]
    if (!esNumero(cotaAbajo) || !esNumero(cotaArriba)) return [...base, abajo, arriba, '-', proyecto, '-', 'sin medir']
    const espesor = redondear3(cotaArriba - cotaAbajo)
    if (!esNumero(espesorProyecto)) return [...base, abajo, arriba, formatearCota(espesor), proyecto, '-', DATO_INVALIDO]
    const difMm = diferenciaMm(espesor, espesorProyecto)
    const estado = estadoDe(difMm, tol)
    return [
      ...base,
      abajo,
      arriba,
      formatearCota(espesor),
      proyecto,
      conSigno(difMm),
      estado === 'datoInvalido' ? DATO_INVALIDO : { estado },
    ]
  })

  return componerInforme({
    titulo,
    base: datos,
    secciones: [
      {
        tipo: 'parrafo',
        texto:
          `${datos.capaArriba} sobre ${datos.capaAbajo}. Espesor = cota arriba - cota abajo; ` +
          'diferencia negativa: la capa quedó delgada.',
      },
      { tipo: 'tabla', columnas: COLUMNAS, filas },
    ],
  })
}
