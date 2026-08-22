import {
  claveCelda,
  formatearProgresiva,
  type BM,
  type Calle,
  type Campania,
  type Capa,
  type Plantilla,
  type Rasante,
  type ResultadoCampania,
  type ResultadoCierre,
  type ResultadoComparacion,
  type ResultadoEvaluacion,
} from '@topo/core'
import { armarEsqueletoTabla } from '../esqueletoTabla'
import { formatearCota } from '../formato'
import { calcularEstadoComparacion, calcularEstadoRasante } from '../estadoComparacion'
import { armarXlsx } from './xlsx'

export function armarTabla(
  resultado: ResultadoCampania,
  calle: Calle,
  plantilla: Plantilla,
): string[][] {
  const esqueleto = armarEsqueletoTabla(calle, plantilla)
  if (!esqueleto) return []
  const { progresivas, elementos } = esqueleto

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
 * comparó porque falta una de las dos cotas». Un espesor real de cero (dos
 * cotas exactamente iguales) sí escribe 0.000: `celda.espesor !== null` es lo
 * que decide, nunca la verdad del número.
 */
export function armarTablaEspesores(
  comparacion: ResultadoComparacion,
  calle: Calle,
  plantilla: Plantilla,
): string[][] {
  const esqueleto = armarEsqueletoTabla(calle, plantilla)
  if (!esqueleto) return []
  const { progresivas, elementos } = esqueleto

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

/**
 * Milímetros con signo para el archivo exportado: sin la unidad pegada al
 * número (va en la cabecera de columna) y con el guion normal, no el menos
 * tipográfico que usa la pantalla — así Excel reconoce la celda como número
 * y no como texto. El cero no lleva signo, igual que en pantalla.
 */
function formatearDiferenciaExportada(diferenciaMm: number): string {
  return diferenciaMm > 0 ? `+${diferenciaMm}` : `${diferenciaMm}`
}

/**
 * La tabla de diferencias contra el proyecto que baja a obra: misma forma
 * que `armarTabla` y `armarTablaEspesores`, con la diferencia de cada celda
 * en milímetros con signo. Igual que en espesores, `celda.diferenciaMm !==
 * null` decide si la celda va vacía o en cero — nunca la verdad del número:
 * una celda sin medir o fuera de la sección definida por el proyecto sale
 * vacía; un cero real (clavado en la cota del proyecto, la mejor noticia
 * posible) sí escribe 0.
 */
export function armarTablaDiferencias(
  evaluacion: ResultadoEvaluacion,
  calle: Calle,
  plantilla: Plantilla,
): string[][] {
  const esqueleto = armarEsqueletoTabla(calle, plantilla)
  if (!esqueleto) return []
  const { progresivas, elementos } = esqueleto

  const filas: string[][] = [['Progresiva', ...elementos]]

  for (const progresiva of progresivas) {
    filas.push([
      formatearProgresiva(progresiva),
      ...elementos.map((elementoClave) => {
        const celda = evaluacion.celdas.get(claveCelda(progresiva, elementoClave))
        return celda && celda.diferenciaMm !== null ? formatearDiferenciaExportada(celda.diferenciaMm) : ''
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
    ['Estado', calcularEstadoComparacion(datos).texto],
  ]
}

export interface DatosDeCabeceraDiferencias {
  calle: Calle
  capa: Capa | undefined
  campania: Campania
  rasante: Rasante
  resultado: ResultadoCampania
}

/**
 * Encabezado del entregable de diferencias contra el proyecto: identifica
 * calle, capa y campaña, la pendiente longitudinal y la tolerancia de la
 * capa con las que se juzgó cada celda, y si el resultado está comprobado —
 * mismo criterio que la pantalla y que el entregable de espesores, vía
 * `calcularEstadoRasante` sobre el cierre de esta única campaña (aquí no
 * hay una segunda campaña que comprobar, a diferencia de los espesores).
 */
export function armarCabeceraDiferencias(datos: DatosDeCabeceraDiferencias): string[][] {
  const { calle, capa, campania, rasante, resultado } = datos

  return [
    ['Calle', calle.nombre],
    ['Capa', capa?.nombre ?? '—'],
    ['Fecha', campania.fecha],
    ['Pendiente longitudinal', `${rasante.pendienteLongitudinal.toFixed(3)} %`],
    ['Tolerancia de la capa', capa ? `±${capa.toleranciaMm} mm` : '—'],
    ['Estado', calcularEstadoRasante(resultado.cierre).texto],
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
