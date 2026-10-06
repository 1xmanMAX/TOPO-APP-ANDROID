import { cuenta } from '../formato'
import {
  componerInforme,
  formatearMm,
  textoCortaRellena,
  textoCota,
  textoProgresiva,
  DATO_INVALIDO,
  type Celda,
  type Columna,
  type Seccion,
} from './maquetacion'
import { celdaDeEstado, evaluarPuntos } from './protocoloNivelacion'
import type { DatosControl, EstadoPunto } from './tipos'

const COLUMNAS: Columna[] = [
  { titulo: 'Progresiva', ancho: 24 },
  { titulo: 'Punto', ancho: 40 },
  { titulo: 'Cota proyecto', ancho: 26, alinear: 'der' },
  { titulo: 'Cota medida', ancho: 26, alinear: 'der' },
  { titulo: 'Corrección', ancho: 32 },
  { titulo: 'Estado', ancho: 32 },
]

/**
 * Control contra proyecto: la lista de trabajo para el operador de la
 * máquina. Solo van los puntos al límite o fuera, cada uno con lo que hay
 * que hacer («corta 46 mm», «rellena 23 mm»). Los que no van se cuentan al
 * pie, para que nadie crea que se olvidaron; los que tienen un dato roto se
 * nombran aparte, para que se vuelvan a anotar y no para mover tierra.
 */
export function controlContraProyecto(datos: DatosControl): Uint8Array {
  const tol = datos.encabezado.toleranciaMm
  const puntos = evaluarPuntos(datos.filas, tol)
  const aCorregir = puntos.filter((p) => p.estado === 'alLimite' || p.estado === 'fuera')
  const contar = (e: EstadoPunto) => puntos.filter((p) => p.estado === e).length
  const invalidos = puntos.filter((p) => p.estado === 'datoInvalido')
  const medidos = puntos.filter((p) => p.estado !== 'sinMedir' && p.estado !== 'datoInvalido').length

  const filas: Celda[][] = aCorregir.map(({ fila, difMm, estado }) => [
    textoProgresiva(fila.progresiva),
    fila.punto,
    textoCota(fila.cotaProyecto),
    textoCota(fila.cotaMedida),
    // Al límite o fuera siempre tiene diferencia: evaluarPuntos solo juzga números.
    textoCortaRellena(difMm ?? Number.NaN),
    celdaDeEstado(estado),
  ])

  const secciones: Seccion[] = []
  if (aCorregir.length > 0) {
    secciones.push(
      {
        tipo: 'parrafo',
        texto:
          `Puntos al límite (hasta ±${formatearMm(2 * tol)} mm) o fuera de tolerancia. ` +
          'Corta: sobra material; rellena: falta.',
      },
      { tipo: 'tabla', columnas: COLUMNAS, filas },
    )
  } else if (medidos === 0) {
    // Sin nada medido, «ningún punto fuera» se leería como «todo conforme».
    secciones.push({
      tipo: 'parrafo',
      texto: 'Ningún punto medido todavía: no hay nada que controlar.',
      resaltado: true,
    })
  } else {
    secciones.push({
      tipo: 'parrafo',
      texto: `Ningún punto al límite ni fuera de tolerancia (±${formatearMm(tol)} mm).`,
      resaltado: true,
    })
  }

  if (invalidos.length > 0) {
    const nombres = invalidos.map(({ fila }) => `${fila.punto} (${textoProgresiva(fila.progresiva)})`).join(', ')
    secciones.push({
      tipo: 'parrafo',
      texto: `${cuenta(invalidos.length, 'punto', 'puntos')} con ${DATO_INVALIDO}, revise la anotación: ${nombres}.`,
      resaltado: true,
    })
  }

  secciones.push({
    tipo: 'parrafo',
    texto:
      `No se listan ${cuenta(contar('conforme'), 'punto conforme', 'puntos conformes')}, ` +
      `${cuenta(contar('sinRasante'), 'punto sin rasante', 'puntos sin rasante')} y ` +
      `${cuenta(contar('sinMedir'), 'punto sin medir', 'puntos sin medir')}.`,
  })

  return componerInforme({ titulo: 'Control contra proyecto', base: datos, secciones })
}
