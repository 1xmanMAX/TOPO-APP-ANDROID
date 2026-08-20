import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Campania, Proyecto } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import VistaLibreta from './VistaLibreta'

const CIERRE_CERRADO = {
  tipo: 'cerrado' as const,
  bmFinalId: 'bm-1',
  longitudK: 0.36,
  longitudKAuto: true,
  clase: 'tercerOrden' as const,
  coeficiente: 12,
}

/**
 * TERRENO mide BOR-I y EJE; SUBRASANTE mide EJE y SAR-D. BOR-I es exclusivo
 * de TERRENO, SAR-D exclusivo de SUBRASANTE: sirven para distinguir sin
 * ambigüedad qué campaña dibujó el corte.
 */
function campaniaTerreno(): Campania {
  return {
    id: 'camp-t',
    fecha: '2026-08-01',
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
          { id: 'lt-4', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-I' } }, valor: 1.35 },
          { id: 'lt-5', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } }, valor: 1.5 },
        ],
        vistaAdelante: { id: 'lt-7', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.0 },
      },
    ],
  }
}

function campaniaSubrasante(): Campania {
  return {
    id: 'camp-s',
    fecha: '2026-08-15',
    calleId: 'c-1',
    capaId: 'cap-subrasante',
    bmInicialId: 'bm-1',
    estado: 'cerrada',
    cierre: CIERRE_CERRADO,
    estaciones: [
      {
        id: 'es-1',
        vistaAtras: { id: 'ls-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.0 },
        intermedias: [
          { id: 'ls-4', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } }, valor: 1.2 },
          { id: 'ls-6', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'SAR-D' } }, valor: 1.4 },
        ],
        vistaAdelante: { id: 'ls-7', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.0 },
      },
    ],
  }
}

function proyectoDosCapas(): Proyecto {
  const proyecto = proyectoEjemplo()
  proyecto.campanias = [campaniaTerreno(), campaniaSubrasante()]
  return proyecto
}

describe('VistaLibreta', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('abre en la última estación, que es donde se sigue trabajando', () => {
    render(<VistaLibreta />)

    expect(screen.getByText('3247.085')).toBeInTheDocument()
    expect(screen.queryByText(/que no es la última/)).not.toBeInTheDocument()
  })

  it('muestra la cota instrumento de la estación que se elija', async () => {
    const usuario = userEvent.setup()
    render(<VistaLibreta />)

    await usuario.click(screen.getByRole('button', { name: '1' }))

    expect(screen.getByText('3246.605')).toBeInTheDocument()
    expect(screen.getByText(/Estás escribiendo en la estación 1 de 2, que no es la última/)).toBeInTheDocument()
  })

  it('muestra el veredicto del cierre en verde cuando pasa', () => {
    render(<VistaLibreta />)
    expect(screen.getByText(/PASA/)).toBeInTheDocument()
    expect(screen.getByText(/−5.0 mm|-5.0 mm/)).toBeInTheDocument()
    expect(screen.getByText(/±7.2 mm/)).toBeInTheDocument()
  })

  it('registra una lectura y salta a la siguiente celda pendiente', async () => {
    const usuario = userEvent.setup()
    render(<VistaLibreta />)

    const campo = screen.getByLabelText(/lectura de mira/i)
    await usuario.type(campo, '2.100{Enter}')

    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.celdasLlenas).toBe(4)
    expect(screen.getByText(/celda activa/i).textContent).not.toContain('0+000 VER-I')
  })

  it('muestra cuántas celdas faltan', () => {
    render(<VistaLibreta />)
    expect(screen.getByText(/llenadas 3 de 70/i)).toBeInTheDocument()
  })

  it('con una calle de progresiva final menor que la inicial, se dibuja sin lanzar', () => {
    const proyecto = proyectoEjemplo()
    proyecto.calles[0]!.progresivaInicio = 200
    proyecto.calles[0]!.progresivaFin = 180
    useAlmacen.getState().cargarProyecto(proyecto)

    expect(() => render(<VistaLibreta />)).not.toThrow()
  })

  it('muestra el aviso de cierre fuera de tolerancia', async () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const lecturaId = useAlmacen.getState().proyecto.campanias[0]!.estaciones[1]!.vistaAdelante!.id
    useAlmacen.getState().actualizarLectura(campaniaId, lecturaId, 1.887)

    render(<VistaLibreta />)
    expect(screen.getByText(/Cierre fuera de tolerancia/i)).toBeInTheDocument()
  })

  it('con una campaña sin estaciones, ofrece empezar la libreta en vez de no mostrar nada', async () => {
    const usuario = userEvent.setup()
    const proyecto = proyectoEjemplo()
    proyecto.campanias[0]!.estaciones = []
    useAlmacen.getState().cargarProyecto(proyecto)

    render(<VistaLibreta />)

    expect(
      screen.getByText(/esta libreta todavía no tiene ninguna estación/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/estación 1/i)).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: /empezar la libreta/i }))

    expect(screen.getByRole('heading', { name: 'Estación 1' })).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.campanias[0]!.estaciones).toHaveLength(1)
  })

  describe('el corte de la libreta dibuja la campaña activa', () => {
    beforeEach(() => {
      useAlmacen.getState().cargarProyecto(proyectoDosCapas())
      useAlmacen.getState().irAProgresiva(0)
    })

    // Regresión: el corte de la libreta leía `capasVisibles`, que es estado
    // del selector de capas de Resultados. Si el topógrafo dejaba marcada
    // otra capa ahí antes de volver a la libreta, su propia medición —la
    // campaña activa— desaparecía del corte justo cuando más se necesita
    // para cazar una lectura mal anotada en la calle.
    it('dibuja la campaña activa aunque el selector de Resultados tenga marcada otra', () => {
      expect(useAlmacen.getState().campaniaActivaId).toBe('camp-t')
      // El topógrafo dejó marcada solo SUBRASANTE en el selector de Resultados.
      useAlmacen.getState().alternarCapaVisible('camp-s')

      render(<VistaLibreta />)

      const nombres = screen
        .getAllByRole('button', { name: /^0\+000 .*cota/ })
        .map((b) => b.getAttribute('aria-label'))
      // BOR-I solo lo midió TERRENO, la campaña activa: tiene que aparecer.
      expect(nombres.some((n) => n?.includes('BOR-I'))).toBe(true)
      // SAR-D solo lo midió SUBRASANTE, que no es la activa: no debe aparecer.
      expect(nombres.some((n) => n?.includes('SAR-D'))).toBe(false)
    })

    it('sigue dibujando la campaña activa si además no hay ninguna capa marcada en Resultados', () => {
      render(<VistaLibreta />)

      const nombres = screen
        .getAllByRole('button', { name: /^0\+000 .*cota/ })
        .map((b) => b.getAttribute('aria-label'))
      expect(nombres.some((n) => n?.includes('BOR-I'))).toBe(true)
      expect(nombres.some((n) => n?.includes('SAR-D'))).toBe(false)
    })
  })
})
