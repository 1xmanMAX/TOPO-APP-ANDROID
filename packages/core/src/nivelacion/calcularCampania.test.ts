import { describe, expect, it } from 'vitest'
import { BM_1, CALLE_EJEMPLO, tomaEjemplo } from '../pruebas/libretaEjemplo'
import { calcularCampania } from './calcularCampania'

function entrada(campania = tomaEjemplo()) {
  return { campania, calle: CALLE_EJEMPLO, bms: [BM_1] }
}

describe('calcularCampania', () => {
  it('entrega las cotas compensadas por celda', () => {
    const resultado = calcularCampania(entrada())
    expect(resultado.cotasPorCelda.get('0|EJE')?.cota).toBeCloseTo(3244.6275, 9)
    expect(resultado.cotasPorCelda.get('20|EJE')?.cota).toBeCloseTo(3244.62, 9)
  })

  it('lleva el offset de cada celda desde los puntos de la calle', () => {
    const resultado = calcularCampania(entrada())
    expect(resultado.cotasPorCelda.get('0|BOR-I')?.offset).toBe(-4.2)
  })

  it('calcula la longitud K automáticamente cuando está en automático', () => {
    const campania = tomaEjemplo()
    campania.cierre = { ...campania.cierre, longitudKAuto: true }
    const resultado = calcularCampania(entrada(campania))

    // La toma de ejemplo mide de 0+000 a 0+020: 20 m ida y vuelta = 0.04 km.
    expect(resultado.cierre.longitudKKm).toBeCloseTo(0.04, 9)
    // Con una longitud tan corta la tolerancia es de solo ±2.4 mm: el cierre
    // de -5.0 mm de esta libreta, que sí pasaba contra el circuito de 0.36 km
    // del plan, ya no pasa contra su propio recorrido real.
    expect(resultado.cierre.pasa).toBe(false)
  })

  it('respeta la longitud K escrita a mano', () => {
    const campania = tomaEjemplo()
    campania.cierre = { ...campania.cierre, longitudKAuto: false, longitudK: 1 }
    const resultado = calcularCampania(entrada(campania))
    expect(resultado.cierre.longitudKKm).toBe(1)
    expect(resultado.cierre.toleranciaMm).toBeCloseTo(12, 9)
  })

  it('cuenta celdas llenas y totales', () => {
    const resultado = calcularCampania(entrada())
    // Dos progresivas medidas (0 y 20) por tres puntos de la calle (BOR-I,
    // EJE, BOR-D) = 6 celdas posibles; solo 3 tienen lectura.
    expect(resultado.celdasTotales).toBe(6)
    expect(resultado.celdasLlenas).toBe(3)
  })

  it('no compensa cuando el cierre no pasa', () => {
    const campania = tomaEjemplo()
    campania.estaciones[1]!.vistaAdelante!.valor = 1.887
    const resultado = calcularCampania(entrada(campania))

    expect(resultado.cierre.pasa).toBe(false)
    expect(resultado.cotasPorCelda.get('0|EJE')?.cota).toBeCloseTo(3244.625, 9)
    expect(resultado.cotasPorCelda.get('0|EJE')?.correccion).toBe(0)
  })

  it('avisa cuando el cierre no pasa', () => {
    const campania = tomaEjemplo()
    campania.estaciones[1]!.vistaAdelante!.valor = 1.887
    const resultado = calcularCampania(entrada(campania))
    const aviso = resultado.avisos.find((a) => a.nivel === 'error')

    expect(aviso?.mensaje).toContain('Cierre fuera de tolerancia')
    expect(aviso?.mensaje).toContain('18.0 mm')
    expect(aviso?.mensaje).toContain('±7.2 mm')
  })

  it('avisa cuando el circuito quedó abierto', () => {
    const campania = tomaEjemplo()
    campania.cierre = { ...campania.cierre, tipo: 'abierto', bmFinalId: undefined }
    delete campania.estaciones[1]!.vistaAdelante
    const resultado = calcularCampania(entrada(campania))

    expect(resultado.avisos.some((a) => a.mensaje.includes('sin verificación'))).toBe(true)
  })

  it('guarda todas las lecturas de una celda medida dos veces y usa la última', () => {
    const campania = tomaEjemplo()
    campania.estaciones[1]!.intermedias.push({
      id: 'l-8',
      destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } },
      valor: 2.462,
    })
    const resultado = calcularCampania(entrada(campania))
    const celda = resultado.cotasPorCelda.get('0|EJE')

    expect(celda?.lecturas).toEqual([1.98, 2.462])
    expect(celda?.cotaCruda).toBeCloseTo(3244.623, 9)
  })

  it('advierte cuando dos lecturas de la misma celda difieren más de 5 mm', () => {
    const campania = tomaEjemplo()
    campania.estaciones[1]!.intermedias.push({
      id: 'l-8',
      destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } },
      valor: 2.47,
    })
    const resultado = calcularCampania(entrada(campania))
    const aviso = resultado.avisos.find((a) => a.clave === '0|EJE')

    expect(aviso?.nivel).toBe('advertencia')
    expect(aviso?.mensaje).toContain('se midió 2 veces')
  })

  it('avisa de una lectura que se aparta de sus vecinas de la misma progresiva', () => {
    const campania = tomaEjemplo()
    campania.estaciones[0]!.intermedias.push({
      id: 'l-9',
      destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-D' } },
      valor: 2.45,
    })
    const resultado = calcularCampania(entrada(campania))
    const aviso = resultado.avisos.find((a) => a.clave === '0|BOR-D')

    expect(aviso?.nivel).toBe('advertencia')
    expect(aviso?.mensaje).toContain('se aparta')
  })

  it('expone la cota instrumento de cada estación', () => {
    const resultado = calcularCampania(entrada())
    expect(resultado.cotasInstrumento[0]).toBeCloseTo(3246.605, 6)
    expect(resultado.cotasInstrumento[1]).toBeCloseTo(3247.085, 6)
  })

  it('devuelve el error legible en vez de reventar si el BM no existe', () => {
    const resultado = calcularCampania({ ...entrada(), bms: [] })
    expect(resultado.error).toBe('No se encontró el banco de nivel inicial de la campaña')
    expect(resultado.cotasPorCelda.size).toBe(0)
    expect(resultado.cotasInstrumento).toEqual([])
  })

  it('devuelve el error legible si la longitud K escrita a mano es negativa', () => {
    const campania = tomaEjemplo()
    campania.cierre = { ...campania.cierre, longitudKAuto: false, longitudK: -1 }
    const resultado = calcularCampania(entrada(campania))

    expect(resultado.error).toBe('La longitud del circuito no puede ser negativa')
    expect(resultado.cotasPorCelda.size).toBe(0)
    expect(resultado.cotasInstrumento).toEqual([])
  })

  it('una lectura fuera de rango genera un aviso que menciona la mira, y el cálculo no revienta', () => {
    const campania = tomaEjemplo()
    campania.estaciones[0]!.intermedias[0]!.valor = 0
    const resultado = calcularCampania(entrada(campania))

    expect(resultado.error).toBeNull()
    const aviso = resultado.avisos.find((a) => a.mensaje.includes('mira'))
    expect(aviso?.nivel).toBe('advertencia')
  })

  it('poner la vista adelante de cierre en 0 deja el cierre sin veredicto, no en fuera de tolerancia', () => {
    const campania = tomaEjemplo()
    campania.estaciones[1]!.vistaAdelante!.valor = 0
    const resultado = calcularCampania(entrada(campania))

    expect(resultado.cierre.pasa).toBeNull()
    expect(resultado.avisos.some((a) => a.mensaje.includes('fuera de tolerancia'))).toBe(false)
  })

  it('avisa de las lecturas que quedan huérfanas al renombrar el código de un punto ya medido', () => {
    const calleConCodigoRenombrado = {
      ...CALLE_EJEMPLO,
      puntos: CALLE_EJEMPLO.puntos.map((punto) =>
        punto.codigo === 'EJE' ? { ...punto, codigo: 'EJE-C' } : punto,
      ),
    }
    const resultado = calcularCampania({
      campania: tomaEjemplo(),
      calle: calleConCodigoRenombrado,
      bms: [BM_1],
    })

    const aviso = resultado.avisos.find((a) => a.mensaje.includes('ya no caen en la grilla'))
    expect(aviso).toBeDefined()
    expect(aviso?.nivel).toBe('advertencia')
    expect(aviso?.mensaje).toContain('0+000 EJE')
    expect(aviso?.mensaje).toContain('0+020 EJE')
  })

  it('avisa si el banco de nivel de cierre ya no existe en el proyecto', () => {
    const campania = tomaEjemplo()
    campania.cierre = { ...campania.cierre, bmFinalId: 'bm-borrado' }
    const resultado = calcularCampania(entrada(campania))

    const aviso = resultado.avisos.find((a) => a.mensaje.includes('ya no existe en el proyecto'))
    expect(aviso?.nivel).toBe('advertencia')
    expect(resultado.error).toBeNull()
  })
})
