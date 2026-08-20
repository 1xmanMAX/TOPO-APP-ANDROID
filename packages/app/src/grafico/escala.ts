export function escalaLineal(
  dominio: [number, number],
  rango: [number, number],
): (valor: number) => number {
  const [d0, d1] = dominio
  const [r0, r1] = rango
  const amplitud = d1 - d0

  if (amplitud === 0) return () => (r0 + r1) / 2
  return (valor) => r0 + ((valor - d0) / amplitud) * (r1 - r0)
}

export function extension(valores: number[], margenRelativo: number): [number, number] {
  if (valores.length === 0) return [0, 1]

  const minimo = Math.min(...valores)
  const maximo = Math.max(...valores)

  if (minimo === maximo) return [minimo - 0.05, maximo + 0.05]

  const margen = (maximo - minimo) * margenRelativo
  return [minimo - margen, maximo + margen]
}

export function marcas(dominio: [number, number], cantidadObjetivo: number): number[] {
  const [minimo, maximo] = dominio
  if (minimo === maximo) return [minimo]

  const paso = pasoLegible((maximo - minimo) / Math.max(1, cantidadObjetivo))
  const primera = Math.ceil(minimo / paso) * paso

  const salida: number[] = []
  for (let valor = primera; valor <= maximo + paso / 1e6; valor += paso) {
    salida.push(Number(valor.toPrecision(12)))
  }
  return salida
}

/** Redondea un paso al 1, 2, 2.5 o 5 más cercano dentro de su potencia de diez. */
function pasoLegible(bruto: number): number {
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const normalizado = bruto / potencia

  if (normalizado <= 1) return potencia
  if (normalizado <= 2) return 2 * potencia
  if (normalizado <= 2.5) return 2.5 * potencia
  if (normalizado <= 5) return 5 * potencia
  return 10 * potencia
}
