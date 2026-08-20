/** Redondeo a 3 decimales, estable frente al error de punto flotante. */
export function redondear3(valor: number): number {
  const escalado = Number((Math.abs(valor) * 1000).toPrecision(12))
  const redondeado = Math.round(escalado) / 1000
  return valor < 0 ? -redondeado : redondeado
}

export function aMilimetros(metros: number): number {
  return metros * 1000
}

export function aMetros(milimetros: number): number {
  return milimetros / 1000
}
