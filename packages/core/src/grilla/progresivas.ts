import { redondear3 } from '../numero'

export function generarProgresivas(
  inicio: number,
  fin: number,
  intervalo: number,
  extras: number[],
): number[] {
  if (intervalo <= 0) throw new Error('El intervalo debe ser mayor que cero')
  if (fin < inicio) throw new Error('La progresiva final no puede ser menor que la inicial')

  const valores = new Set<number>()
  for (let p = inicio; p < fin; p += intervalo) valores.add(redondear3(p))
  valores.add(redondear3(fin))

  for (const extra of extras) {
    const valor = redondear3(extra)
    if (valor >= inicio && valor <= fin) valores.add(valor)
  }

  return [...valores].sort((a, b) => a - b)
}

export function formatearProgresiva(metros: number): string {
  const negativa = metros < 0
  const absoluto = Math.abs(metros)
  const kilometro = Math.floor(absoluto / 1000)
  const resto = absoluto - kilometro * 1000
  const entero = Math.floor(resto)
  const decimal = redondear3(resto - entero)

  const cuerpo =
    decimal > 0
      ? `${String(entero).padStart(3, '0')}.${String(Math.round(decimal * 100)).padStart(2, '0')}`
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
