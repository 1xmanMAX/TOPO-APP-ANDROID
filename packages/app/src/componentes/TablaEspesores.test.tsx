import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { calcularCampania, compararCapas, type Proyecto, type Toma } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import { agregarTomaComoNivelacion, todasLasTomas } from '../estado/proyectoTomas'
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
function campaniaTerreno(): Toma {
  return {
    id: 'camp-terreno',
    fecha: '2026-08-10',
    capaId: 'cap-terreno',
    bmInicialId: 'bm-1',
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
  return agregarTomaComoNivelacion(proyecto, 'c-1', campaniaTerreno(), 'niv-terreno')
}

/**
 * Dos campañas con la MISMA estación —mismo BM de arranque, misma vista
 * atrás, misma lectura intermedia, mismo cierre— así que su cota en 0+040
 * EJE sale bit a bit idéntica y el espesor entre ellas da cero exacto: el
 * caso real de un tramo que ya estaba a nivel, no una celda sin medir.
 */
function campaniaCero(id: string, fecha: string, capaId: string): Toma {
  return {
    id,
    fecha,
    capaId,
    bmInicialId: 'bm-1',
    cierre: CIERRE_CERRADO,
    estaciones: [
      {
        id: `${id}-e1`,
        vistaAtras: { id: `${id}-va`, destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.5 },
        intermedias: [
          {
            id: `${id}-int`,
            destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'EJE' } },
            valor: 2.68,
          },
        ],
        vistaAdelante: { id: `${id}-vd`, destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.5 },
      },
    ],
  }
}

/** Comparación real, calculada con el mismo motor que usa la app. */
function comparacionEsperada(proyecto: Proyecto, idInferior = 'camp-terreno', idSuperior = 'camp-1') {
  const calle = proyecto.calles[0]!
  const tomas = todasLasTomas(proyecto)
  const inferior = calcularCampania({
    campania: tomas.find((t) => t.id === idInferior)!,
    calle,
    bms: proyecto.bms,
  })
  const superior = calcularCampania({
    campania: tomas.find((t) => t.id === idSuperior)!,
    calle,
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

    expect(screen.getByLabelText(/Espesor en 0\+000 EJE/).textContent).toBe(formatearCota(espesor0))
  })

  it('muestra un guion largo cuando falta una de las dos cotas', () => {
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')

    render(<TablaEspesores />)

    // 0|BOR-I solo se midió en camp-1 (SUBRASANTE): no tiene pareja en TERRENO.
    expect(screen.getByLabelText(/Espesor en 0\+000 BOR-I/).textContent).toBe('—')
  })

  it('el nombre accesible de una celda con espesor incluye la cifra', () => {
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')

    render(<TablaEspesores />)

    const boton = screen.getByLabelText(/Espesor en 0\+000 EJE/)
    expect(boton.getAttribute('aria-label')).toContain(boton.textContent)
  })

  it('el nombre accesible de una celda sin comparar dice que no se comparó, y no un cero', () => {
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')

    render(<TablaEspesores />)

    // 0|BOR-I solo se midió en camp-1 (SUBRASANTE): no tiene pareja en TERRENO.
    const boton = screen.getByLabelText(/Espesor en 0\+000 BOR-I/)
    expect(boton.getAttribute('aria-label')).toContain('sin comparar')
    expect(boton.getAttribute('aria-label')).not.toMatch(/0\.000/)
  })

  it('un espesor negativo se distingue a la vista', () => {
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')
    const comparacion = comparacionEsperada(proyecto)
    const celda20 = comparacion.celdas.get('20|EJE')!
    expect(celda20.espesor!).toBeLessThan(0)

    render(<TablaEspesores />)

    const boton = screen.getByLabelText(/Espesor en 0\+020 EJE/)
    expect(boton.textContent).toBe(formatearCota(celda20.espesor!))
    expect(boton.className).toMatch(/falla/)
  })

  it('un espesor negativo conserva la señal de aviso incluso al quedar seleccionado', async () => {
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')
    const usuario = userEvent.setup()
    render(<TablaEspesores />)

    const boton = screen.getByLabelText(/Espesor en 0\+020 EJE/)
    await usuario.click(boton)

    expect(useAlmacen.getState().seleccion.clave).toBe('20|EJE')
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

    await usuario.click(screen.getByLabelText(/Espesor en 0\+000 EJE/))

    expect(useAlmacen.getState().seleccion.clave).toBe('0|EJE')
    expect(useAlmacen.getState().seleccion.progresiva).toBe(0)
  })

  // Un tramo que ya estaba a nivel exacto tiene espesor real cero, y eso no
  // es lo mismo que una celda que nadie comparó: si la pantalla los mezclara
  // en el guion largo, el topógrafo pensaría que ahí falta una medición
  // cuando en realidad ya se comprobó que no hacía falta material.
  it('un espesor real de cero se ve en pantalla como 0.000, no como una celda sin comparar', () => {
    let proyectoCero = proyectoEjemplo()
    proyectoCero = agregarTomaComoNivelacion(
      proyectoCero,
      'c-1',
      campaniaCero('camp-cero-a', '2026-08-05', 'cap-terreno'),
      'niv-cero-a',
    )
    proyectoCero = agregarTomaComoNivelacion(
      proyectoCero,
      'c-1',
      campaniaCero('camp-cero-b', '2026-08-06', 'cap-subrasante'),
      'niv-cero-b',
    )
    useAlmacen.getState().cargarProyecto(proyectoCero)
    useAlmacen.getState().fijarComparacion('camp-cero-a', 'camp-cero-b')

    const comparacion = comparacionEsperada(proyectoCero, 'camp-cero-a', 'camp-cero-b')
    expect(comparacion.celdas.get('40|EJE')?.espesor).toBe(0)

    render(<TablaEspesores />)

    const boton = screen.getByLabelText(/Espesor en 0\+040 EJE/)
    expect(boton.textContent).toBe('0.000')
    expect(boton.getAttribute('aria-label')).not.toContain('sin comparar')
  })
})
