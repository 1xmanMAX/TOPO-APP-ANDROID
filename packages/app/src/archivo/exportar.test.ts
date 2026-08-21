import { calcularCampania, claveCelda, compararCapas, type Campania, type CotaCelda, type ResultadoCampania } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { proyectoEjemplo } from '../estado/ejemplo'
import { aTextoSeparado, armarCabecera, armarCabeceraComparacion, armarTabla, armarTablaEspesores } from './exportar'

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

/** Celda de cota mínima para armar un ResultadoCampania de prueba, como en compararCapas. */
function celda(progresiva: number, elementoClave: string, cota: number): CotaCelda {
  return {
    clave: claveCelda(progresiva, elementoClave),
    progresiva,
    elementoClave,
    offset: 0,
    cota,
    cotaCruda: cota,
    correccion: 0,
    lecturas: [cota],
  }
}

/** ResultadoCampania de prueba, con el veredicto de cierre que pida cada caso. */
function resultadoComparable(celdas: CotaCelda[], pasa: boolean | null = true): ResultadoCampania {
  return {
    cotasPorCelda: new Map(celdas.map((c) => [c.clave, c])),
    cotasInstrumento: [],
    cierre: {
      tipo: 'cerrado',
      cotaLlegadaCalculada: null,
      cotaLlegadaConocida: null,
      errorMm: pasa === true ? 2 : pasa === false ? 20 : null,
      longitudKKm: 0.36,
      toleranciaMm: pasa === null ? null : 7.2,
      pasa,
    },
    avisos: [],
    celdasTotales: 10,
    celdasLlenas: celdas.length,
    error: null,
  }
}

/** Campaña de prueba, solo para tener la fecha y la capa que la cabecera necesita. */
function campaniaEjemplo(campaniaBase: Campania, overrides: Partial<Campania>): Campania {
  return { ...campaniaBase, ...overrides }
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

describe('armarTablaEspesores', () => {
  it('escribe el espesor con tres decimales en las celdas comparables', () => {
    const { calle, plantilla } = resultadoEjemplo()
    const inferior = resultadoComparable([celda(0, 'EJE', 3244.600)])
    const superior = resultadoComparable([celda(0, 'EJE', 3244.848)])
    const comparacion = compararCapas(inferior, superior)

    const tabla = armarTablaEspesores(comparacion, calle, plantilla)
    const fila = tabla.find((f) => f[0] === '0+000')!
    const columnaEje = tabla[0]!.indexOf('EJE')

    expect(fila[columnaEje]).toBe('0.248')
  })

  it('deja vacía, y no en cero, la celda que no tiene pareja en la otra capa', () => {
    const { calle, plantilla } = resultadoEjemplo()
    const inferior = resultadoComparable([celda(0, 'EJE', 3244.600)])
    const superior = resultadoComparable([celda(20, 'EJE', 3244.900)])
    const comparacion = compararCapas(inferior, superior)

    const tabla = armarTablaEspesores(comparacion, calle, plantilla)
    const columnaEje = tabla[0]!.indexOf('EJE')

    expect(tabla.find((f) => f[0] === '0+000')![columnaEje]).toBe('')
    expect(tabla.find((f) => f[0] === '0+020')![columnaEje]).toBe('')
  })

  it('pone las progresivas en la primera columna y los elementos en el encabezado, igual que armarTabla', () => {
    const { calle, plantilla } = resultadoEjemplo()
    const comparacion = compararCapas(resultadoComparable([]), resultadoComparable([]))

    const tabla = armarTablaEspesores(comparacion, calle, plantilla)

    expect(tabla[0]).toEqual(['Progresiva', 'VER-I', 'SAR-I', 'BOR-I', 'EJE', 'BOR-D', 'SAR-D', 'VER-D'])
    expect(tabla).toHaveLength(11)
  })

  // Un tramo que ya estaba a nivel exacto (las dos cotas iguales, no hizo
  // falta material) tiene un espesor real de cero. Confundirlo con la celda
  // sin pareja —que también podría leerse como '' si alguien simplifica la
  // condición a un chequeo de verdad ("truthy")— haría desaparecer del
  // reporte justo los tramos que ya estaban listos.
  it('un espesor real de cero sale como 0.000, no vacío', () => {
    const { calle, plantilla } = resultadoEjemplo()
    const inferior = resultadoComparable([celda(0, 'EJE', 3244.600)])
    const superior = resultadoComparable([celda(0, 'EJE', 3244.600)])
    const comparacion = compararCapas(inferior, superior)

    const tabla = armarTablaEspesores(comparacion, calle, plantilla)
    const columnaEje = tabla[0]!.indexOf('EJE')

    expect(comparacion.celdas.get('0|EJE')?.espesor).toBe(0)
    expect(tabla.find((f) => f[0] === '0+000')![columnaEje]).toBe('0.000')
  })
})

describe('armarCabeceraComparacion', () => {
  it('identifica las dos capas comparadas, con sus fechas, y lleva el resumen de espesores', () => {
    const { calle, campania } = resultadoEjemplo()
    const capaInferior = { id: 'cap-terreno', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 }
    const capaSuperior = { id: 'cap-subrasante', nombre: 'SUBRASANTE', orden: 1, espesor: 0.25, toleranciaMm: 20 }
    const campaniaInferior = campaniaEjemplo(campania, { id: 'camp-terreno', fecha: '2026-08-10', capaId: capaInferior.id })
    const campaniaSuperior = campaniaEjemplo(campania, { id: 'camp-subrasante', fecha: '2026-08-19', capaId: capaSuperior.id })

    const resultadoInferior = resultadoComparable([celda(0, 'EJE', 3244.600), celda(20, 'EJE', 3244.610)])
    const resultadoSuperior = resultadoComparable([celda(0, 'EJE', 3244.848), celda(20, 'EJE', 3244.910)])
    const comparacion = compararCapas(resultadoInferior, resultadoSuperior)

    const cabecera = armarCabeceraComparacion({
      calle,
      capaInferior,
      capaSuperior,
      campaniaInferior,
      campaniaSuperior,
      resultadoInferior,
      resultadoSuperior,
      comparacion,
    })
    const texto = cabecera.map((fila) => fila.join(' ')).join('\n')

    expect(texto).toContain(calle.nombre)
    expect(texto).toContain(capaInferior.nombre)
    expect(texto).toContain(campaniaInferior.fecha)
    expect(texto).toContain(capaSuperior.nombre)
    expect(texto).toContain(campaniaSuperior.fecha)
    expect(texto).toContain('0.248')
    expect(texto).toContain('0.300')
    expect(texto).toContain('0.274')
    expect(texto).not.toContain('NO COMPROBADOS')
  })

  it('si la capa de abajo no cierra, el estado dice ESPESORES NO COMPROBADOS y señala la capa de abajo', () => {
    const { calle, campania } = resultadoEjemplo()
    const capaInferior = { id: 'cap-terreno', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 }
    const capaSuperior = { id: 'cap-subrasante', nombre: 'SUBRASANTE', orden: 1, espesor: 0.25, toleranciaMm: 20 }
    const campaniaInferior = campaniaEjemplo(campania, { id: 'camp-terreno', fecha: '2026-08-10', capaId: capaInferior.id })
    const campaniaSuperior = campaniaEjemplo(campania, { id: 'camp-subrasante', fecha: '2026-08-19', capaId: capaSuperior.id })

    const resultadoInferior = resultadoComparable([celda(0, 'EJE', 3244.600)], false)
    const resultadoSuperior = resultadoComparable([celda(0, 'EJE', 3244.848)], true)
    const comparacion = compararCapas(resultadoInferior, resultadoSuperior)

    const cabecera = armarCabeceraComparacion({
      calle,
      capaInferior,
      capaSuperior,
      campaniaInferior,
      campaniaSuperior,
      resultadoInferior,
      resultadoSuperior,
      comparacion,
    })
    const filaEstado = cabecera.find((fila) => fila[0] === 'Estado')!.join(' ')

    expect(filaEstado).toContain('ESPESORES NO COMPROBADOS')
    expect(filaEstado).toContain(capaInferior.nombre)
    expect(filaEstado).not.toContain(capaSuperior.nombre)
  })

  it('si la capa de arriba no cierra, el estado dice ESPESORES NO COMPROBADOS y señala la capa de arriba', () => {
    const { calle, campania } = resultadoEjemplo()
    const capaInferior = { id: 'cap-terreno', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 }
    const capaSuperior = { id: 'cap-subrasante', nombre: 'SUBRASANTE', orden: 1, espesor: 0.25, toleranciaMm: 20 }
    const campaniaInferior = campaniaEjemplo(campania, { id: 'camp-terreno', fecha: '2026-08-10', capaId: capaInferior.id })
    const campaniaSuperior = campaniaEjemplo(campania, { id: 'camp-subrasante', fecha: '2026-08-19', capaId: capaSuperior.id })

    const resultadoInferior = resultadoComparable([celda(0, 'EJE', 3244.600)], true)
    const resultadoSuperior = resultadoComparable([celda(0, 'EJE', 3244.848)], null)
    const comparacion = compararCapas(resultadoInferior, resultadoSuperior)

    const cabecera = armarCabeceraComparacion({
      calle,
      capaInferior,
      capaSuperior,
      campaniaInferior,
      campaniaSuperior,
      resultadoInferior,
      resultadoSuperior,
      comparacion,
    })
    const filaEstado = cabecera.find((fila) => fila[0] === 'Estado')!.join(' ')

    expect(filaEstado).toContain('ESPESORES NO COMPROBADOS')
    expect(filaEstado).toContain(capaSuperior.nombre)
    expect(filaEstado).not.toContain(capaInferior.nombre)
  })

  it('si ninguna de las dos campañas cierra, el estado señala a las dos', () => {
    const { calle, campania } = resultadoEjemplo()
    const capaInferior = { id: 'cap-terreno', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 }
    const capaSuperior = { id: 'cap-subrasante', nombre: 'SUBRASANTE', orden: 1, espesor: 0.25, toleranciaMm: 20 }
    const campaniaInferior = campaniaEjemplo(campania, { id: 'camp-terreno', fecha: '2026-08-10', capaId: capaInferior.id })
    const campaniaSuperior = campaniaEjemplo(campania, { id: 'camp-subrasante', fecha: '2026-08-19', capaId: capaSuperior.id })

    const resultadoInferior = resultadoComparable([celda(0, 'EJE', 3244.600)], false)
    const resultadoSuperior = resultadoComparable([celda(0, 'EJE', 3244.848)], null)
    const comparacion = compararCapas(resultadoInferior, resultadoSuperior)

    const cabecera = armarCabeceraComparacion({
      calle,
      capaInferior,
      capaSuperior,
      campaniaInferior,
      campaniaSuperior,
      resultadoInferior,
      resultadoSuperior,
      comparacion,
    })
    const filaEstado = cabecera.find((fila) => fila[0] === 'Estado')!.join(' ')

    expect(filaEstado).toContain('ESPESORES NO COMPROBADOS')
    expect(filaEstado).toContain(capaInferior.nombre)
    expect(filaEstado).toContain(capaSuperior.nombre)
  })

  it('sin capa resuelta, la fila de capa muestra un guion en vez de romperse', () => {
    const { calle, campania } = resultadoEjemplo()
    const campaniaInferior = campaniaEjemplo(campania, { id: 'camp-terreno', fecha: '2026-08-10' })
    const campaniaSuperior = campaniaEjemplo(campania, { id: 'camp-subrasante', fecha: '2026-08-19' })
    const resultadoInferior = resultadoComparable([celda(0, 'EJE', 3244.600)])
    const resultadoSuperior = resultadoComparable([celda(0, 'EJE', 3244.848)])
    const comparacion = compararCapas(resultadoInferior, resultadoSuperior)

    const cabecera = armarCabeceraComparacion({
      calle,
      capaInferior: undefined,
      capaSuperior: undefined,
      campaniaInferior,
      campaniaSuperior,
      resultadoInferior,
      resultadoSuperior,
      comparacion,
    })

    expect(cabecera.map((fila) => fila.join(' ')).join('\n')).toContain('—')
  })

  // La combinación que de verdad puede romperse: una campaña sin capa
  // resuelta que ADEMÁS no cierra. El mensaje de estado tiene que poder
  // nombrarla igual, con el guion y la fecha, en vez de tropezar con la
  // capa ausente al armar el motivo.
  it('sin capa resuelta y con el cierre fallando, el estado nombra la campaña por su guion y fecha', () => {
    const { calle, campania } = resultadoEjemplo()
    const campaniaInferior = campaniaEjemplo(campania, { id: 'camp-terreno', fecha: '2026-08-10' })
    const campaniaSuperior = campaniaEjemplo(campania, { id: 'camp-subrasante', fecha: '2026-08-19' })
    const resultadoInferior = resultadoComparable([celda(0, 'EJE', 3244.600)], false)
    const resultadoSuperior = resultadoComparable([celda(0, 'EJE', 3244.848)], true)
    const comparacion = compararCapas(resultadoInferior, resultadoSuperior)

    const cabecera = armarCabeceraComparacion({
      calle,
      capaInferior: undefined,
      capaSuperior: undefined,
      campaniaInferior,
      campaniaSuperior,
      resultadoInferior,
      resultadoSuperior,
      comparacion,
    })

    expect(cabecera.find((fila) => fila[0] === 'Capa de abajo')![1]).toBe('—')
    const filaEstado = cabecera.find((fila) => fila[0] === 'Estado')!.join(' ')
    expect(filaEstado).toContain('ESPESORES NO COMPROBADOS')
    expect(filaEstado).toContain(`— · ${campaniaInferior.fecha}`)
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
