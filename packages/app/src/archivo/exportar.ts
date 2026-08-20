import {
  construirGrilla,
  formatearProgresiva,
  type BM,
  type Calle,
  type Campania,
  type Capa,
  type Plantilla,
  type ResultadoCampania,
  type ResultadoCierre,
} from '@topo/core'
import { formatearCota } from '../formato'
import { armarXlsx } from './xlsx'

export function armarTabla(
  resultado: ResultadoCampania,
  calle: Calle,
  plantilla: Plantilla,
): string[][] {
  const celdas = construirGrilla(calle, plantilla)
  const progresivas = [...new Set(celdas.map((c) => c.progresiva))].sort((a, b) => a - b)

  const vistos = new Map<string, number>()
  for (const celda of celdas) if (!vistos.has(celda.elementoClave)) vistos.set(celda.elementoClave, celda.offset)
  const elementos = [...vistos.entries()].sort((a, b) => a[1] - b[1]).map(([clave]) => clave)

  const filas: string[][] = [['Progresiva', ...elementos]]

  for (const progresiva of progresivas) {
    filas.push([
      formatearProgresiva(progresiva),
      ...elementos.map((elementoClave) => {
        const celda = resultado.cotasPorCelda.get(`${progresiva}|${elementoClave}`)
        return celda ? formatearCota(celda.cota) : ''
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

export function descargarXlsx(tabla: string[][], nombre: string): void {
  const datos = armarXlsx(tabla, 'Cotas')
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
