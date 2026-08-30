import { redondear3 } from '../numero'

/*
 * Este archivo tuvo también `generarProgresivas(inicio, fin, intervalo, extras)`,
 * que fabricaba de un tirón la serie de progresivas de una calle a partir de
 * un rango configurado. Se retiró con sus ocho pruebas: la grilla sale de las
 * progresivas que de verdad se midieron —`progresivasMedidas` alimentando a
 * `construirGrilla`—, y de la hoja de campo cada progresiva entra fila a
 * fila por `parsearProgresiva`. Ni `Calle` ni ninguna pantalla guardan ya el
 * rango ni el intervalo de los que salían sus cuatro argumentos, así que no
 * había forma de llamarla sin inventárselos.
 */

export function formatearProgresiva(metros: number): string {
  const negativa = metros < 0
  // Se redondea una sola vez, sobre el total en centésimas. Repartir después
  // el resultado entero evita que el acarreo de la fracción se pierda.
  const centesimas = Math.round(redondear3(Math.abs(metros)) * 100)
  const kilometro = Math.floor(centesimas / 100000)
  const restoCentesimas = centesimas - kilometro * 100000
  const entero = Math.floor(restoCentesimas / 100)
  const decimal = restoCentesimas - entero * 100

  const cuerpo =
    decimal > 0
      ? `${String(entero).padStart(3, '0')}.${String(decimal).padStart(2, '0')}`
      : String(entero).padStart(3, '0')

  return `${negativa ? '-' : ''}${kilometro}+${cuerpo}`
}

export function parsearProgresiva(texto: string): number | null {
  const limpio = texto.trim()
  if (limpio === '') return null

  const conMas = /^(-?)(\d+)\+(\d+(?:[.,]\d+)?)$/.exec(limpio)
  if (conMas) {
    const signo = conMas[1] === '-' ? -1 : 1
    const km = Number(conMas[2])
    const metros = Number(conMas[3]!.replace(',', '.'))
    return signo * (km * 1000 + metros)
  }

  const suelto = /^-?\d+(?:[.,]\d+)?$/.exec(limpio)
  if (suelto) return Number(limpio.replace(',', '.'))

  return null
}
