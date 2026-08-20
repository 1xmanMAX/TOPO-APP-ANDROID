import { calcularCampania } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { proyectoEjemplo } from '../estado/ejemplo'
import { aTextoSeparado, armarTabla } from './exportar'

function resultadoEjemplo() {
  const proyecto = proyectoEjemplo()
  const campania = proyecto.campanias[0]!
  const calle = proyecto.calles[0]!
  const plantilla = proyecto.plantillas[0]!
  return {
    resultado: calcularCampania({ campania, calle, plantilla, bms: proyecto.bms }),
    calle,
    plantilla,
  }
}

describe('armarTabla', () => {
  it('pone las progresivas en la primera columna y los elementos en el encabezado', () => {
    const { resultado, calle, plantilla } = resultadoEjemplo()
    const tabla = armarTabla(resultado, calle, plantilla)

    expect(tabla[0]).toEqual(['Progresiva', 'VER-I', 'SAR-I', 'BOR-I', 'EJE', 'BOR-D', 'SAR-D', 'VER-D'])
    expect(tabla[1]![0]).toBe('0+000')
  })

  it('escribe las cotas con tres decimales', () => {
    const { resultado, calle, plantilla } = resultadoEjemplo()
    const tabla = armarTabla(resultado, calle, plantilla)
    const fila = tabla.find((f) => f[0] === '0+000')!
    expect(fila[4]).toBe('3244.628')
  })

  it('deja vacías las celdas sin medir', () => {
    const { resultado, calle, plantilla } = resultadoEjemplo()
    const tabla = armarTabla(resultado, calle, plantilla)
    const fila = tabla.find((f) => f[0] === '0+040')!
    expect(fila[4]).toBe('')
  })

  it('incluye una fila por cada progresiva de la calle', () => {
    const { resultado, calle, plantilla } = resultadoEjemplo()
    expect(armarTabla(resultado, calle, plantilla)).toHaveLength(11)
  })
})

describe('aTextoSeparado', () => {
  it('une con tabulaciones para pegar en Excel', () => {
    expect(aTextoSeparado([['a', 'b'], ['1', '2']], '\t')).toBe('a\tb\n1\t2')
  })

  it('entrecomilla los valores que contienen el separador', () => {
    expect(aTextoSeparado([['a;b', 'c']], ';')).toBe('"a;b";c')
  })
})
