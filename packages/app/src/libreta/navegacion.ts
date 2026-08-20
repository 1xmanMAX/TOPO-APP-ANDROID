import { formatearProgresiva, type CeldaGrilla } from '@topo/core'

export function siguienteCeldaPendiente(
  grilla: CeldaGrilla[],
  llenas: Set<string>,
  desdeClave: string | null,
): CeldaGrilla | null {
  if (grilla.length === 0) return null

  const indiceActual = desdeClave ? grilla.findIndex((c) => c.clave === desdeClave) : -1

  for (let salto = 1; salto <= grilla.length; salto += 1) {
    const celda = grilla[(indiceActual + salto + grilla.length) % grilla.length]!
    if (!llenas.has(celda.clave)) return celda
  }
  return null
}

export function progresivasPendientes(grilla: CeldaGrilla[], llenas: Set<string>): number[] {
  const pendientes = new Set<number>()
  for (const celda of grilla) if (!llenas.has(celda.clave)) pendientes.add(celda.progresiva)
  return [...pendientes].sort((a, b) => a - b)
}

export function resumenPendientes(grilla: CeldaGrilla[], llenas: Set<string>): string {
  const faltantes = grilla.filter((celda) => !llenas.has(celda.clave))
  if (faltantes.length === 0) return 'Grilla completa.'

  const progresivas = progresivasPendientes(grilla, llenas).map(formatearProgresiva)
  const lista =
    progresivas.length === 1
      ? progresivas[0]!
      : `${progresivas.slice(0, -1).join(', ')} y ${progresivas[progresivas.length - 1]}`

  const sustantivo = faltantes.length === 1 ? 'Falta 1 celda' : `Faltan ${faltantes.length} celdas`
  return `${sustantivo} por llenar en ${lista}.`
}
