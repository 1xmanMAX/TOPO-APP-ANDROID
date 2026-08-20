import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Campania, Proyecto } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import CorteTransversal from './CorteTransversal'

describe('CorteTransversal', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('dibuja un punto por cada celda medida de la progresiva', () => {
    render(<CorteTransversal progresiva={0} />)
    expect(screen.getAllByRole('button', { name: /^0\+000 / })).toHaveLength(2)
  })

  it('avisa cuando la progresiva no tiene lecturas', () => {
    render(<CorteTransversal progresiva={60} />)
    expect(screen.getByText(/todavía no tiene lecturas/i)).toBeInTheDocument()
  })

  it('selecciona la celda al hacer clic en un punto', async () => {
    const usuario = userEvent.setup()
    render(<CorteTransversal progresiva={0} />)
    await usuario.click(screen.getByRole('button', { name: /0\+000 EJE/ }))
    expect(useAlmacen.getState().seleccion.clave).toBe('0|EJE')
  })

  it('marca el punto seleccionado', () => {
    useAlmacen.getState().seleccionar('0|EJE')
    render(<CorteTransversal progresiva={0} />)
    expect(screen.getByRole('button', { name: /0\+000 EJE/ })).toHaveAttribute('data-activo', 'true')
  })
})

const CIERRE_CERRADO = {
  tipo: 'cerrado' as const,
  bmFinalId: 'bm-1',
  longitudK: 0.36,
  longitudKAuto: true,
  clase: 'tercerOrden' as const,
  coeficiente: 12,
}

/**
 * Ambas cierran BM-1 contra BM-1 en una sola estación, para no arrastrar
 * ningún error de cierre a estas pruebas: lo que importa es qué celdas
 * comparten y cuáles no.
 *
 * TERRENO mide VER-I, SAR-I, BOR-I, EJE, BOR-D en la progresiva 0 (no
 * SAR-D ni VER-D). SUBRASANTE mide VER-I, SAR-I, EJE, BOR-D, SAR-D (no
 * BOR-I ni VER-D). Así, en el orden de offsets:
 *   VER-I(ambas) SAR-I(ambas) BOR-I(solo terreno) EJE(ambas) BOR-D(ambas) SAR-D(solo subrasante)
 * hay dos tramos con pareja — VER-I↔SAR-I y EJE↔BOR-D — separados por
 * celdas que solo tiene una de las dos capas.
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
          { id: 'lt-2', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'VER-I' } }, valor: 1.2 },
          { id: 'lt-3', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'SAR-I' } }, valor: 1.3 },
          { id: 'lt-4', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-I' } }, valor: 1.35 },
          { id: 'lt-5', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } }, valor: 1.5 },
          { id: 'lt-6', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-D' } }, valor: 1.65 },
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
          { id: 'ls-2', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'VER-I' } }, valor: 1.0 },
          { id: 'ls-3', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'SAR-I' } }, valor: 1.05 },
          { id: 'ls-4', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } }, valor: 1.2 },
          { id: 'ls-5', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-D' } }, valor: 1.35 },
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

describe('CorteTransversal con varias capas', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoDosCapas())
    useAlmacen.getState().alternarCapaVisible('camp-t')
    useAlmacen.getState().alternarCapaVisible('camp-s')
  })

  it('con dos capas visibles dibuja un trazo por cada una', () => {
    const { container } = render(<CorteTransversal progresiva={0} />)
    expect(container.querySelectorAll('polyline')).toHaveLength(2)
  })

  it('las capas se dibujan de abajo hacia arriba según su orden, no según cómo se marcaron', () => {
    // Se marcaron subrasante primero y terreno después (orden inverso al del
    // paquete), pero terreno (orden 0) debe dibujarse antes que subrasante
    // (orden 1).
    useAlmacen.getState().alternarCapaVisible('camp-t')
    useAlmacen.getState().alternarCapaVisible('camp-s')
    useAlmacen.getState().alternarCapaVisible('camp-s')
    useAlmacen.getState().alternarCapaVisible('camp-t')
    expect(useAlmacen.getState().capasVisibles).toEqual(['camp-s', 'camp-t'])

    const { container } = render(<CorteTransversal progresiva={0} />)
    const trazos = container.querySelectorAll('polyline')
    expect(trazos[0]).toHaveAttribute('data-capa-id', 'camp-t')
    expect(trazos[1]).toHaveAttribute('data-capa-id', 'camp-s')
  })

  it('cada capa lleva su nombre junto al primer punto', () => {
    render(<CorteTransversal progresiva={0} />)
    expect(screen.getByText('TERRENO EXISTENTE')).toBeInTheDocument()
    expect(screen.getByText('SUBRASANTE')).toBeInTheDocument()
  })

  it('el relleno entre dos capas solo cubre los tramos donde ambas tienen cota', () => {
    const { container } = render(<CorteTransversal progresiva={0} />)
    // VER-I↔SAR-I y EJE↔BOR-D: dos tramos con pareja, separados por BOR-I
    // (solo terreno) y SAR-D (solo subrasante), que no deben unirse.
    expect(container.querySelectorAll('[data-relleno-capas]')).toHaveLength(2)
  })

  it('el nombre accesible de un punto dice de qué capa es cuando hay varias visibles', () => {
    render(<CorteTransversal progresiva={0} />)
    const botones = screen.getAllByRole('button', { name: /0\+000 EJE/ })
    expect(botones).toHaveLength(2)
    const etiquetas = botones.map((b) => b.getAttribute('aria-label'))
    expect(etiquetas.some((t) => t?.includes('TERRENO EXISTENTE'))).toBe(true)
    expect(etiquetas.some((t) => t?.includes('SUBRASANTE'))).toBe(true)
    // Dos puntos de la misma celda en capas distintas no pueden anunciarse igual.
    expect(etiquetas[0]).not.toBe(etiquetas[1])
  })

  it('con una sola capa marcada explícitamente se ve igual que con una sola capa', () => {
    useAlmacen.getState().alternarCapaVisible('camp-s') // deja solo camp-t visible
    render(<CorteTransversal progresiva={0} />)

    const botones = screen.getAllByRole('button', { name: /^0\+000 / })
    expect(botones).toHaveLength(5) // VER-I, SAR-I, BOR-I, EJE, BOR-D

    const eje = screen.getByRole('button', { name: /0\+000 EJE/ })
    expect(eje.getAttribute('aria-label')).not.toContain('TERRENO EXISTENTE')
    expect(eje.getAttribute('aria-label')).toMatch(/^0\+000 EJE · cota [\d.]+ m$/)
  })
})
