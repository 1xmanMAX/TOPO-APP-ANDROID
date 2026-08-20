import { calcularCampania } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { proyectoEjemplo } from '../estado/ejemplo'
import { aTextoSeparado, armarCabecera, armarTabla } from './exportar'

function resultadoEjemplo() {
  const proyecto = proyectoEjemplo()
  const campania = proyecto.campanias[0]!
  const calle = proyecto.calles[0]!
  const plantilla = proyecto.plantillas[0]!
  return {
    resultado: calcularCampania({ campania, calle, plantilla, bms: proyecto.bms }),
    calle,
    plantilla,
    campania,
    proyecto,
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

describe('armarCabecera', () => {
  it('incluye calle, capa, fecha, tolerancia y error, con el veredicto VERIFICADO cuando el cierre pasa', () => {
    const { resultado, calle, campania, proyecto } = resultadoEjemplo()
    const capa = proyecto.capas.find((c) => c.id === campania.capaId)
    const bmInicial = proyecto.bms.find((bm) => bm.id === campania.bmInicialId)

    const cabecera = armarCabecera({ calle, capa, campania, bmInicial, resultado })
    const texto = cabecera.map((fila) => fila.join(' ')).join('\n')

    expect(texto).toContain(calle.nombre)
    expect(texto).toContain(capa!.nombre)
    expect(texto).toContain(campania.fecha)
    expect(texto).toContain('±7.2 mm')
    expect(texto).toContain('-5.0 mm')
    expect(texto).toContain('VERIFICADO')
    expect(texto).not.toContain('NO COMPROBADAS')
  })

  it('el estado dice NO COMPROBADAS cuando el cierre no pasa', () => {
    const proyecto = proyectoEjemplo()
    const campaniaId = proyecto.campanias[0]!.id
    const lecturaId = proyecto.campanias[0]!.estaciones[1]!.vistaAdelante!.id
    proyecto.campanias[0]!.estaciones = proyecto.campanias[0]!.estaciones.map((estacion) => ({
      ...estacion,
      vistaAdelante:
        estacion.vistaAdelante?.id === lecturaId
          ? { ...estacion.vistaAdelante, valor: 1.887 }
          : estacion.vistaAdelante,
    }))
    const campania = proyecto.campanias.find((c) => c.id === campaniaId)!
    const calle = proyecto.calles[0]!
    const plantilla = proyecto.plantillas[0]!
    const capa = proyecto.capas.find((c) => c.id === campania.capaId)
    const bmInicial = proyecto.bms.find((bm) => bm.id === campania.bmInicialId)
    const resultado = calcularCampania({ campania, calle, plantilla, bms: proyecto.bms })

    const cabecera = armarCabecera({ calle, capa, campania, bmInicial, resultado })
    const texto = cabecera.map((fila) => fila.join(' ')).join('\n')

    expect(texto).toContain('NO COMPROBADAS')
  })
})

describe('aTextoSeparado', () => {
  it('une con tabulaciones para pegar en Excel', () => {
    expect(aTextoSeparado([['a', 'b'], ['1', '2']], '\t')).toBe('a\tb\n1\t2')
  })

  it('entrecomilla los valores que contienen el separador', () => {
    expect(aTextoSeparado([['a;b', 'c']], ';')).toBe('"a;b";c')
  })

  it('entrecomilla los valores con saltos de línea o retornos de carro', () => {
    expect(aTextoSeparado([['a\nb']], ';')).toBe('"a\nb"')
    expect(aTextoSeparado([['a\rb']], ';')).toBe('"a\rb"')
  })

  it('dobla las comillas internas', () => {
    expect(aTextoSeparado([['dijo "hola"']], ';')).toBe('"dijo ""hola"""')
  })
})
