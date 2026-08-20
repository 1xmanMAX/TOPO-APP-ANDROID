import {
  construirGrilla,
  formatearProgresiva,
  type Calle,
  type Plantilla,
  type ResultadoCampania,
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

export function aTextoSeparado(tabla: string[][], separador: string): string {
  return tabla
    .map((fila) =>
      fila
        .map((valor) =>
          valor.includes(separador) || valor.includes('"') || valor.includes('\n')
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
