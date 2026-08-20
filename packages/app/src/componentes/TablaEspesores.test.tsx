import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { calcularCampania, compararCapas, type Campania, type Proyecto } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import { formatearCota } from '../formato'
import TablaEspesores from './TablaEspesores'

const CIERRE_CERRADO = {
  tipo: 'cerrado' as const,
  bmFinalId: 'bm-1',
  longitudK: 0.36,
  longitudKAuto: true,
  clase: 'tercerOrden' as const,
  coeficiente: 12,
}

/**
 * Campaña de TERRENO EXISTENTE sobre la misma calle (c-1) que camp-1
 * (SUBRASANTE). Mide EJE en 0 y 20, pero no BOR-I en 0: esa celda queda sin
 * pareja en la comparación. En 0|EJE la subrasante queda claramente por
 * encima (espesor positivo); en 20|EJE queda por debajo (espesor negativo),
 * para poder probar ambos casos con datos reales y no inventados a mano.
 */
function campaniaTerreno(): Campania {
  return {
    id: 'camp-terreno',
    fecha: '2026-08-10',
    calleId: 'c-1',
    capaId: 'cap-terreno',
    bmInicialId: 'bm-1',
    estado: 'cerrada',
    cierre: CIERRE_CERRADO,
    estaciones: [
      {
        id: 'et-1',
        vistaAtras: { id: 'lt-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.0 },
        intermedias: [
          {
            id: 'lt-2',
            destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } },
            valor: 1.78,
          },
        ],
        vistaAdelante: { id: 'lt-3', destino: { tipo: 'cambio', nombre: 'CP-T' }, valor: 1.0 },
      },
      {
        id: 'et-2',
        vistaAtras: { id: 'lt-4', destino: { tipo: 'cambio', nombre: 'CP-T' }, valor: 1.0 },
        intermedias: [
          {
            id: 'lt-5',
            destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'EJE' } },
            valor: 1.53,
          },
        ],
        vistaAdelante: { id: 'lt-6', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.0 },
      },
    ],
  }
}

function proyectoConComparacion(): Proyecto {
  const proyecto = proyectoEjemplo()
  proyecto.campanias.push(campaniaTerreno())
  return proyecto
}

/** Comparación real, calculada con el mismo motor que usa la app. */
function comparacionEsperada(proyecto: Proyecto) {
  const calle = proyecto.calles[0]!
  const plantilla = proyecto.plantillas[0]!
  const inferior = calcularCampania({
    campania: proyecto.campanias.find((c) => c.id === 'camp-terreno')!,
    calle,
    plantilla,
    bms: proyecto.bms,
  })
  const superior = calcularCampania({
    campania: proyecto.campanias.find((c) => c.id === 'camp-1')!,
    calle,
    plantilla,
    bms: proyecto.bms,
  })
  return compararCapas(inferior, superior)
}

describe('TablaEspesores', () => {
  let proyecto: Proyecto

  beforeEach(() => {
    proyecto = proyectoConComparacion()
    useAlmacen.getState().cargarProyecto(proyecto)
  })

  it('sin comparación elegida invita a elegirla en vez de quedarse en blanco', () => {
    render(<TablaEspesores />)

    expect(screen.getByText(/elige dos capas/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('muestra el espesor cuando hay ambas cotas', () => {
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')
    const comparacion = comparacionEsperada(proyecto)
    const espesor0 = comparacion.celdas.get('0|EJE')!.espesor!

    render(<TablaEspesores />)

    expect(screen.getByLabelText('0+000 EJE').textContent).toBe(formatearCota(espesor0))
  })

  it('muestra un guion largo cuando falta una de las dos cotas', () => {
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')

    render(<TablaEspesores />)

    // 0|BOR-I solo se midió en camp-1 (SUBRASANTE): no tiene pareja en TERRENO.
    expect(screen.getByLabelText('0+000 BOR-I').textContent).toBe('—')
  })

  it('un espesor negativo se distingue a la vista', () => {
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')
    const comparacion = comparacionEsperada(proyecto)
    const celda20 = comparacion.celdas.get('20|EJE')!
    expect(celda20.espesor!).toBeLessThan(0)

    render(<TablaEspesores />)

    const boton = screen.getByLabelText('0+020 EJE')
    expect(boton.textContent).toBe(formatearCota(celda20.espesor!))
    expect(boton.className).toMatch(/falla/)
  })

  it('el resumen dice el mínimo, el medio y el máximo', () => {
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')
    const comparacion = comparacionEsperada(proyecto)

    render(<TablaEspesores />)

    const resumen = screen.getByText(/espesor colocado/i)
    expect(resumen.textContent).toContain(`mínimo ${formatearCota(comparacion.espesorMinimo!)} m`)
    expect(resumen.textContent).toContain(`medio ${formatearCota(comparacion.espesorMedio!)} m`)
    expect(resumen.textContent).toContain(`máximo ${formatearCota(comparacion.espesorMaximo!)} m`)
    expect(resumen.textContent).toContain(
      `${comparacion.comparables} de ${comparacion.comparables + comparacion.sinPareja} celdas comparables`,
    )
  })

  it('las celdas son clicables y seleccionan la celda, como en la tabla de cotas', async () => {
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')
    const usuario = userEvent.setup()
    render(<TablaEspesores />)

    await usuario.click(screen.getByLabelText('0+000 EJE'))

    expect(useAlmacen.getState().seleccion.clave).toBe('0|EJE')
    expect(useAlmacen.getState().seleccion.progresiva).toBe(0)
  })
})
