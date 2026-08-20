import {
  claveCelda,
  construirGrilla,
  formatearProgresiva,
  type BM,
  type Calle,
  type Campania,
  type Capa,
  type Plantilla,
  type ResultadoCampania,
  type ResultadoCierre,
  type ResultadoComparacion,
} from '@topo/core'
import { formatearCota } from '../formato'
import { armarXlsx } from './xlsx'

export function armarTabla(
  resultado: ResultadoCampania,
  calle: Calle,
  plantilla: Plantilla,
): string[][] {
  let celdas: ReturnType<typeof construirGrilla> = []
  try {
    celdas = construirGrilla(calle, plantilla)
  } catch {
    return []
  }

  const progresivas = [...new Set(celdas.map((c) => c.progresiva))].sort((a, b) => a - b)

  const vistos = new Map<string, number>()
  for (const celda of celdas) if (!vistos.has(celda.elementoClave)) vistos.set(celda.elementoClave, celda.offset)
  const elementos = [...vistos.entries()].sort((a, b) => a[1] - b[1]).map(([clave]) => clave)

  const filas: string[][] = [['Progresiva', ...elementos]]

  for (const progresiva of progresivas) {
    filas.push([
      formatearProgresiva(progresiva),
      ...elementos.map((elementoClave) => {
        const celda = resultado.cotasPorCelda.get(claveCelda(progresiva, elementoClave))
        return celda ? formatearCota(celda.cota) : ''
      }),
    ])
  }

  return filas
}

/**
 * La tabla de espesores que baja a obra: misma forma que `armarTabla`, pero
 * la celda sin pareja en la otra capa sale vacía y no en cero. Un cero se lee
 * como «aquí no se colocó material», y eso no es lo mismo que «aquí no se
 * comparó porque falta una de las dos cotas».
 */
export function armarTablaEspesores(
  comparacion: ResultadoComparacion,
  calle: Calle,
  plantilla: Plantilla,
): string[][] {
  let celdas: ReturnType<typeof construirGrilla> = []
  try {
    celdas = construirGrilla(calle, plantilla)
  } catch {
    return []
  }

  const progresivas = [...new Set(celdas.map((c) => c.progresiva))].sort((a, b) => a - b)

  const vistos = new Map<string, number>()
  for (const celda of celdas) if (!vistos.has(celda.elementoClave)) vistos.set(celda.elementoClave, celda.offset)
  const elementos = [...vistos.entries()].sort((a, b) => a[1] - b[1]).map(([clave]) => clave)

  const filas: string[][] = [['Progresiva', ...elementos]]

  for (const progresiva of progresivas) {
    filas.push([
      formatearProgresiva(progresiva),
      ...elementos.map((elementoClave) => {
        const celda = comparacion.celdas.get(claveCelda(progresiva, elementoClave))
        return celda && celda.espesor !== null ? formatearCota(celda.espesor) : ''
      }),
    ])
  }

  return filas
}

export interface DatosDeCabecera {
  calle: Calle
  capa: Capa | undefined
  campania: Campania
  bmInicial: BM | undefined
  resultado: ResultadoCampania
}

function veredicto(cierre: ResultadoCierre): string {
  if (cierre.pasa === true) return 'VERIFICADO — cierra dentro de tolerancia'
  if (cierre.pasa === false) return 'COTAS NO COMPROBADAS — el cierre está fuera de tolerancia'
  return 'COTAS NO COMPROBADAS — el circuito no se verificó'
}

/**
 * Encabezado del entregable. Sin esto, el archivo que llega a la obra son
 * cotas desnudas: nadie puede saber de qué calle y capa son, ni si el
 * trabajo llegó a verificarse.
 */
export function armarCabecera(datos: DatosDeCabecera): string[][] {
  const { calle, capa, campania, bmInicial, resultado } = datos
  const { cierre } = resultado

  return [
    ['Calle', calle.nombre],
    ['Capa', capa?.nombre ?? '—'],
    ['Fecha', campania.fecha],
    ['Banco de nivel de arranque', bmInicial ? `${bmInicial.nombre} · ${formatearCota(bmInicial.cota)}` : '—'],
    ['Longitud del circuito', `${cierre.longitudKKm.toFixed(3)} km`],
    ['Tolerancia', cierre.toleranciaMm === null ? '—' : `±${cierre.toleranciaMm.toFixed(1)} mm`],
    ['Error de cierre', cierre.errorMm === null ? '—' : `${cierre.errorMm > 0 ? '+' : ''}${cierre.errorMm.toFixed(1)} mm`],
    ['Estado', veredicto(cierre)],
  ]
}

export interface DatosDeCabeceraComparacion {
  calle: Calle
  capaInferior: Capa | undefined
  capaSuperior: Capa | undefined
  campaniaInferior: Campania
  campaniaSuperior: Campania
  resultadoInferior: ResultadoCampania
  resultadoSuperior: ResultadoCampania
  comparacion: ResultadoComparacion
}

function etiquetaCapa(capa: Capa | undefined, campania: Campania): string {
  return `${capa?.nombre ?? '—'} · ${campania.fecha}`
}

function motivoNoComprobado(cierre: ResultadoCierre): string {
  if (cierre.pasa === false) return 'el cierre está fuera de tolerancia'
  return 'el circuito no se verificó'
}

/**
 * Un espesor sale de restar dos cotas. Si cualquiera de las dos campañas no
 * cerró, el espesor calculado sobre ella tampoco está comprobado — aunque la
 * resta en sí dé un número. El estado tiene que decir cuál de las dos falla,
 * porque de eso depende qué campaña hay que volver a nivelar.
 */
function veredictoComparacion(datos: DatosDeCabeceraComparacion): string {
  const { capaInferior, capaSuperior, campaniaInferior, campaniaSuperior, resultadoInferior, resultadoSuperior } = datos
  const falloInferior = resultadoInferior.cierre.pasa !== true
  const falloSuperior = resultadoSuperior.cierre.pasa !== true

  if (!falloInferior && !falloSuperior) {
    return 'ESPESORES VERIFICADOS — las dos campañas cierran dentro de tolerancia'
  }

  const motivos: string[] = []
  if (falloInferior) {
    motivos.push(
      `la capa de abajo (${etiquetaCapa(capaInferior, campaniaInferior)}): ${motivoNoComprobado(resultadoInferior.cierre)}`,
    )
  }
  if (falloSuperior) {
    motivos.push(
      `la capa de arriba (${etiquetaCapa(capaSuperior, campaniaSuperior)}): ${motivoNoComprobado(resultadoSuperior.cierre)}`,
    )
  }

  return `ESPESORES NO COMPROBADOS — ${motivos.join('; ')}`
}

/**
 * Encabezado del entregable de espesores. Identifica las dos capas
 * comparadas con sus fechas, resume mínimo, máximo y medio, y dice si el
 * espesor está comprobado — lo que exige que las dos nivelaciones de origen
 * hayan cerrado, no solo que la resta haya sido posible.
 */
export function armarCabeceraComparacion(datos: DatosDeCabeceraComparacion): string[][] {
  const { calle, capaInferior, capaSuperior, campaniaInferior, campaniaSuperior, comparacion } = datos
  const totalCeldas = comparacion.comparables + comparacion.sinPareja

  return [
    ['Calle', calle.nombre],
    ['Capa de abajo', capaInferior?.nombre ?? '—'],
    ['Fecha capa de abajo', campaniaInferior.fecha],
    ['Capa de arriba', capaSuperior?.nombre ?? '—'],
    ['Fecha capa de arriba', campaniaSuperior.fecha],
    ['Espesor mínimo', comparacion.espesorMinimo === null ? '—' : formatearCota(comparacion.espesorMinimo)],
    ['Espesor máximo', comparacion.espesorMaximo === null ? '—' : formatearCota(comparacion.espesorMaximo)],
    ['Espesor medio', comparacion.espesorMedio === null ? '—' : formatearCota(comparacion.espesorMedio)],
    ['Celdas comparables', `${comparacion.comparables} de ${totalCeldas}`],
    ['Estado', veredictoComparacion(datos)],
  ]
}

export function aTextoSeparado(tabla: string[][], separador: string): string {
  return tabla
    .map((fila) =>
      fila
        .map((valor) =>
          valor.includes(separador) || valor.includes('"') || valor.includes('\n') || valor.includes('\r')
            ? `"${valor.replace(/"/g, '""')}"`
            : valor,
        )
        .join(separador),
    )
    .join('\n')
}

export async function copiarAlPortapapeles(tabla: string[][]): Promise<void> {
  await navigator.clipboard.writeText(aTextoSeparado(tabla, '\t'))
}

export function descargarCsv(tabla: string[][], nombre: string): void {
  // El BOM hace que Excel en Windows abra el archivo con acentos correctos.
  const contenido = `﻿${aTextoSeparado(tabla, ';')}`
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }))
  const enlace = document.createElement('a')

  enlace.href = url
  enlace.download = `${nombre}.csv`
  enlace.click()
  URL.revokeObjectURL(url)
}

export function descargarXlsx(tabla: string[][], nombre: string, nombreHoja = 'Cotas'): void {
  const datos = armarXlsx(tabla, nombreHoja)
  const url = URL.createObjectURL(
    new Blob([datos], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
  const enlace = document.createElement('a')

  enlace.href = url
  enlace.download = `${nombre}.xlsx`
  enlace.click()
  URL.revokeObjectURL(url)
}
