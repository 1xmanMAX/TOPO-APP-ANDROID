import {
  calcularCampania,
  claveCelda,
  compararCapas,
  evaluarContraRasante,
  progresivasMedidas,
  type CotaCelda,
  type Rasante,
  type ResultadoCampania,
  type ResultadoEvaluacion,
  type Toma,
} from '@topo/core'
import { describe, expect, it } from 'vitest'
import { proyectoEjemplo } from '../estado/ejemplo'
import { buscarToma, conToma, todasLasTomas } from '../estado/proyectoTomas'
import {
  aTextoSeparado,
  armarCabecera,
  armarCabeceraComparacion,
  armarCabeceraDiferencias,
  armarTabla,
  armarTablaDiferencias,
  armarTablaEspesores,
  type DatosDeCabeceraDiferencias,
} from './exportar'

function resultadoEjemplo() {
  const proyecto = proyectoEjemplo()
  const campania = todasLasTomas(proyecto)[0]!
  const calle = proyecto.calles[0]!
  return {
    resultado: calcularCampania({ campania, calle, bms: proyecto.bms }),
    calle,
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
function campaniaEjemplo(campaniaBase: Toma, overrides: Partial<Toma>): Toma {
  return { ...campaniaBase, ...overrides }
}

function calle() {
  return proyectoEjemplo().calles[0]!
}

/** Las progresivas de la toma de ejemplo (camp-1): lo que alimenta a `armarTablaDiferencias` ahora, en vez de una plantilla. */
function progresivasEjemplo(): number[] {
  return progresivasMedidas(todasLasTomas(proyectoEjemplo())[0]!.estaciones)
}

/**
 * Rasante plana (sin pendiente longitudinal ni transversal) que cubre todo
 * el ancho de la plantilla del ejemplo (hasta 5.6 m): ningún elemento queda
 * fuera de sección sin querer. La campaña de referencia mide en SUBRASANTE,
 * y BASE + CARPETA (0.25 m) van encima de esa capa: la cota de arranque
 * está elegida para que, ya restado ese espesor, 0+000 EJE (cota real
 * 3244.5965, la misma libreta que usan las demás pruebas de esta calle) dé
 * exactamente −333 mm de diferencia — la misma rasante que usa
 * `MapaEstado.test.tsx`.
 */
function rasantePlana(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 3245.179,
    pendienteLongitudinal: 0,
    tramos: [{ nombre: 'Calzada', hastaOffset: 5.6, tipo: 'pendiente', valor: 0 }],
    simetrica: true,
    tramosIzquierda: null,
  }
}

/** Lo mínimo para evaluar la calle del ejemplo contra una rasante cualquiera. */
function evaluacionBase() {
  const proyecto = proyectoEjemplo()
  const campania = todasLasTomas(proyecto)[0]!
  const calle = proyecto.calles[0]!
  const resultado = calcularCampania({ campania, calle, bms: proyecto.bms })
  return { campania, calle, resultado, capas: proyecto.capas, capaId: campania.capaId }
}

function evaluacionEjemplo(): ResultadoEvaluacion {
  const { campania, calle, capas, capaId, resultado } = evaluacionBase()
  return evaluarContraRasante({ resultado, calle, toma: campania, rasante: rasantePlana(), capas, capaId })
}

/**
 * Rasante angosta, que no llega hasta la vereda (solo cubre hasta el borde de
 * calzada, offset 4.4). Para que VER-I quede de verdad "fuera de sección" —
 * medida pero sin cota teórica que compararle, no simplemente sin medir — se
 * le agrega a mano una lectura ahí: el proyecto de ejemplo no la mide en
 * 0+000.
 */
function evaluacionEstrecha(): ResultadoEvaluacion {
  const { campania, calle, capas, capaId, resultado } = evaluacionBase()
  const cotasPorCelda = new Map(resultado.cotasPorCelda)
  cotasPorCelda.set(claveCelda(0, 'VER-I'), celda(0, 'VER-I', 3244.0))
  const resultadoConVerI: ResultadoCampania = { ...resultado, cotasPorCelda }
  const rasanteEstrecha: Rasante = {
    progresivaArranque: 0,
    cotaArranque: 3244.929,
    pendienteLongitudinal: 0,
    tramos: [{ nombre: 'Calzada', hastaOffset: 4.4, tipo: 'pendiente', valor: 0 }],
    simetrica: true,
    tramosIzquierda: null,
  }
  return evaluarContraRasante({ resultado: resultadoConVerI, calle, toma: campania, rasante: rasanteEstrecha, capas, capaId })
}

/** La cota real de 0+000 EJE se lleva a mano a la misma cota teórica: diferencia cero exacta. */
function evaluacionConCeroExacto(): ResultadoEvaluacion {
  const { campania, calle, capas, capaId, resultado } = evaluacionBase()
  const cotasPorCelda = new Map(resultado.cotasPorCelda)
  cotasPorCelda.set(claveCelda(0, 'EJE'), celda(0, 'EJE', 3244.929))
  const resultadoAjustado: ResultadoCampania = { ...resultado, cotasPorCelda }
  return evaluarContraRasante({ resultado: resultadoAjustado, calle, toma: campania, rasante: rasantePlana(), capas, capaId })
}

/** ResultadoCampania de prueba cuyo circuito no cerró, para la cabecera de diferencias. */
function resultadoSinCerrar(): ResultadoCampania {
  return resultadoComparable([celda(0, 'EJE', 3244.6275)], false)
}

function datosEjemplo(): DatosDeCabeceraDiferencias {
  const { calle, campania, resultado, capas, capaId } = evaluacionBase()
  const capa = capas.find((c) => c.id === capaId)
  const rasante: Rasante = {
    progresivaArranque: 0,
    cotaArranque: 3245.18,
    pendienteLongitudinal: -1.25,
    tramos: [{ nombre: 'Calzada', hastaOffset: 5.6, tipo: 'pendiente', valor: 0 }],
    simetrica: true,
    tramosIzquierda: null,
  }
  return { calle, capa, campania, rasante, resultado }
}

describe('armarTabla', () => {
  it('pone las progresivas en la primera columna y los elementos en el encabezado', () => {
    const { resultado, calle, campania } = resultadoEjemplo()
    const tabla = armarTabla(resultado, calle, progresivasMedidas(campania.estaciones))

    expect(tabla[0]).toEqual(['Progresiva', 'VER-I', 'SAR-I', 'BOR-I', 'EJE', 'BOR-D', 'SAR-D', 'VER-D'])
    expect(tabla[1]![0]).toBe('0+000')
  })

  it('escribe las cotas con tres decimales', () => {
    const { resultado, calle, campania } = resultadoEjemplo()
    const tabla = armarTabla(resultado, calle, progresivasMedidas(campania.estaciones))
    const fila = tabla.find((f) => f[0] === '0+000')!
    expect(fila[4]).toBe('3244.597')
  })

  it('deja vacías las celdas sin medir', () => {
    const { resultado, calle, campania } = resultadoEjemplo()
    const tabla = armarTabla(resultado, calle, progresivasMedidas(campania.estaciones))
    // VER-I es un punto de la calle, pero esta toma nunca lo mide: la grilla
    // lo incluye igual en cada progresiva (une calle.puntos con las
    // progresivas medidas), y la celda queda vacía en vez de un cero inventado.
    const fila = tabla.find((f) => f[0] === '0+000')!
    const columnaVerI = tabla[0]!.indexOf('VER-I')
    expect(fila[columnaVerI]).toBe('')
  })

  it('incluye una fila por cada progresiva de la calle', () => {
    const { resultado, calle, campania } = resultadoEjemplo()
    const progresivas = progresivasMedidas(campania.estaciones)
    expect(armarTabla(resultado, calle, progresivas)).toHaveLength(progresivas.length + 1)
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
    const proyectoOriginal = proyectoEjemplo()
    const tomaOriginal = todasLasTomas(proyectoOriginal)[0]!
    const lecturaId = tomaOriginal.estaciones[1]!.vistaAdelante!.id
    const proyecto = conToma(proyectoOriginal, tomaOriginal.id, (toma) => ({
      ...toma,
      estaciones: toma.estaciones.map((estacion) => ({
        ...estacion,
        vistaAdelante:
          estacion.vistaAdelante?.id === lecturaId
            ? { ...estacion.vistaAdelante, valor: 1.887 }
            : estacion.vistaAdelante,
      })),
    }))
    const campania = buscarToma(proyecto, tomaOriginal.id)!.toma
    const calle = proyecto.calles[0]!
    const capa = proyecto.capas.find((c) => c.id === campania.capaId)
    const bmInicial = proyecto.bms.find((bm) => bm.id === campania.bmInicialId)
    const resultado = calcularCampania({ campania, calle, bms: proyecto.bms })

    const cabecera = armarCabecera({ calle, capa, campania, bmInicial, resultado })
    const texto = cabecera.map((fila) => fila.join(' ')).join('\n')

    expect(texto).toContain('NO COMPROBADAS')
  })
})

describe('armarTablaEspesores', () => {
  it('escribe el espesor con tres decimales en las celdas comparables', () => {
    const { calle } = resultadoEjemplo()
    const inferior = resultadoComparable([celda(0, 'EJE', 3244.600)])
    const superior = resultadoComparable([celda(0, 'EJE', 3244.848)])
    const comparacion = compararCapas(inferior, superior)

    const tabla = armarTablaEspesores(comparacion, calle, [0])
    const fila = tabla.find((f) => f[0] === '0+000')!
    const columnaEje = tabla[0]!.indexOf('EJE')

    expect(fila[columnaEje]).toBe('0.248')
  })

  it('deja vacía, y no en cero, la celda que no tiene pareja en la otra capa', () => {
    const { calle } = resultadoEjemplo()
    const inferior = resultadoComparable([celda(0, 'EJE', 3244.600)])
    const superior = resultadoComparable([celda(20, 'EJE', 3244.900)])
    const comparacion = compararCapas(inferior, superior)

    const tabla = armarTablaEspesores(comparacion, calle, [0, 20])
    const columnaEje = tabla[0]!.indexOf('EJE')

    expect(tabla.find((f) => f[0] === '0+000')![columnaEje]).toBe('')
    expect(tabla.find((f) => f[0] === '0+020')![columnaEje]).toBe('')
  })

  it('pone las progresivas en la primera columna y los elementos en el encabezado, igual que armarTabla', () => {
    const { calle, campania } = resultadoEjemplo()
    const progresivas = progresivasMedidas(campania.estaciones)
    const comparacion = compararCapas(resultadoComparable([]), resultadoComparable([]))

    const tabla = armarTablaEspesores(comparacion, calle, progresivas)

    expect(tabla[0]).toEqual(['Progresiva', 'VER-I', 'SAR-I', 'BOR-I', 'EJE', 'BOR-D', 'SAR-D', 'VER-D'])
    expect(tabla).toHaveLength(progresivas.length + 1)
  })

  // Un tramo que ya estaba a nivel exacto (las dos cotas iguales, no hizo
  // falta material) tiene un espesor real de cero. Confundirlo con la celda
  // sin pareja —que también podría leerse como '' si alguien simplifica la
  // condición a un chequeo de verdad ("truthy")— haría desaparecer del
  // reporte justo los tramos que ya estaban listos.
  it('un espesor real de cero sale como 0.000, no vacío', () => {
    const { calle } = resultadoEjemplo()
    const inferior = resultadoComparable([celda(0, 'EJE', 3244.600)])
    const superior = resultadoComparable([celda(0, 'EJE', 3244.600)])
    const comparacion = compararCapas(inferior, superior)

    const tabla = armarTablaEspesores(comparacion, calle, [0])
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

describe('armarTablaDiferencias', () => {
  it('pone las progresivas en la primera columna y los elementos en el encabezado, igual que armarTabla', () => {
    const tabla = armarTablaDiferencias(evaluacionEjemplo(), calle(), progresivasEjemplo())

    expect(tabla[0]).toEqual(['Progresiva', 'VER-I', 'SAR-I', 'BOR-I', 'EJE', 'BOR-D', 'SAR-D', 'VER-D'])
  })

  // La prueba que más ha costado en este proyecto: una celda fuera de la
  // sección definida por el proyecto no es lo mismo que una diferencia de
  // cero. Confundirlas ya pasó dos veces en la Entrega 2A.
  it('una celda fuera de la sección definida sale vacía, nunca en cero', () => {
    const tabla = armarTablaDiferencias(evaluacionEstrecha(), calle(), progresivasEjemplo())
    const columnaVerI = tabla[0]!.indexOf('VER-I')

    expect(tabla.find((f) => f[0] === '0+000')![columnaVerI]).toBe('')
  })

  it('las diferencias van en milímetros con signo', () => {
    const tabla = armarTablaDiferencias(evaluacionEjemplo(), calle(), progresivasEjemplo())
    const columnaEje = tabla[0]!.indexOf('EJE')

    expect(tabla.find((f) => f[0] === '0+000')![columnaEje]).toBe('-333')
  })

  // El cero de una diferencia significa «clavado en la cota del proyecto»,
  // la mejor noticia posible: nunca puede confundirse con «sin dato».
  it('un cero real sale como cero, porque significa que está justo en la cota', () => {
    const tabla = armarTablaDiferencias(evaluacionConCeroExacto(), calle(), progresivasEjemplo())
    const columnaEje = tabla[0]!.indexOf('EJE')

    expect(tabla.find((f) => f[0] === '0+000')![columnaEje]).toBe('0')
  })
})

describe('armarCabeceraDiferencias', () => {
  it('la cabecera lleva la rasante y la tolerancia con la que se juzgó', () => {
    const cabecera = armarCabeceraDiferencias(datosEjemplo())

    expect(cabecera).toContainEqual(['Pendiente longitudinal', '-1.250 %'])
    expect(cabecera).toContainEqual(['Tolerancia de la capa', '±20 mm'])
  })

  it('si el circuito no cerró, la cabecera dice que el resultado no está comprobado', () => {
    const cabecera = armarCabeceraDiferencias({ ...datosEjemplo(), resultado: resultadoSinCerrar() })

    expect(cabecera.find((f) => f[0] === 'Estado')![1]).toMatch(/NO COMPROBAD/)
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
