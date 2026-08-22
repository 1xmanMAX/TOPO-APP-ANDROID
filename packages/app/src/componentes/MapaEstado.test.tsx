import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Rasante } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import MapaEstado from './MapaEstado'

/**
 * Misma libreta del proyecto de ejemplo (EJE y BOR-I medidos en 0+000, EJE en
 * 0+020), pero con la calle recortada a 0+000–0+120: así la grilla queda en
 * 7 progresivas × 7 elementos = 49 celdas, un ancho manejable para afirmar
 * "todas las celdas" sin depender de cuántas progresivas tenga el proyecto
 * de ejemplo completo.
 *
 * La rasante arranca en 3245.179 (plana, sin pendiente longitudinal ni
 * transversal). La campaña activa mide en SUBRASANTE, y BASE + CARPETA
 * (0.25 m) van encima de esa capa, así que su cota teórica queda en
 * 3244.929: contra la cota real de 0+000 EJE (3244.6275, la misma libreta
 * que usan las demás pruebas de esta calle) da una diferencia de −302 mm,
 * bien fuera de los 20 mm de tolerancia de SUBRASANTE.
 */
function fijarRasanteDeEjemplo(): void {
  useAlmacen.getState().actualizarCalle('c-1', { progresivaFin: 120 })
  useAlmacen.getState().fijarRasante('c-1', {
    progresivaArranque: 0,
    cotaArranque: 3245.179,
    pendienteLongitudinal: 0,
    tramos: [{ nombre: 'Calzada', hastaOffset: 5.6, tipo: 'pendiente', valor: 0 }],
    simetrica: true,
    tramosIzquierda: null,
  } satisfies Rasante)
}

describe('MapaEstado', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('pinta la calle entera, una celda por progresiva y elemento', () => {
    fijarRasanteDeEjemplo()
    render(<MapaEstado idCampaniaReferencia="camp-1" />)

    expect(screen.getAllByRole('button', { name: /^0\+\d{3} / }).length).toBe(49)
  })

  // La celda tiene que decir los milímetros, qué hacer (cortar/rellenar) y
  // el estado — igual que en TablaDiferencias, sin exigir un orden rígido
  // entre esos tres datos: el criterio es que un lector de pantalla pueda
  // enterarse de los tres, no en qué posición vienen.
  it('cada celda dice sus milímetros, qué hacer y su estado por escrito, no solo por color', () => {
    fijarRasanteDeEjemplo()
    render(<MapaEstado idCampaniaReferencia="camp-1" />)

    const etiqueta = screen.getByLabelText(/0\+000 EJE/).getAttribute('aria-label')
    expect(etiqueta).toMatch(/−302 mm/)
    expect(etiqueta).toMatch(/rellenar/)
    expect(etiqueta).toMatch(/fuera de tolerancia/)
  })

  it('elegir una celda del mapa la selecciona en el resto de vistas', async () => {
    fijarRasanteDeEjemplo()
    render(<MapaEstado idCampaniaReferencia="camp-1" />)

    await userEvent.click(screen.getByLabelText(/0\+020 EJE/))

    expect(useAlmacen.getState().seleccion.clave).toBe('20|EJE')
  })

  it('la leyenda explica qué es cada símbolo', () => {
    fijarRasanteDeEjemplo()
    render(<MapaEstado idCampaniaReferencia="camp-1" />)

    expect(screen.getByText(/dentro de tolerancia/i)).toBeInTheDocument()
    expect(screen.getByText(/al límite/i)).toBeInTheDocument()
    expect(screen.getByText(/fuera/i)).toBeInTheDocument()
  })

  it('sin rasante definida invita a definirla, en vez de un mapa vacío', () => {
    render(<MapaEstado idCampaniaReferencia="camp-1" />)

    expect(screen.getByText(/define la rasante/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^0\+\d{3} / })).not.toBeInTheDocument()
  })

  it('una celda sin medir se distingue de una fuera de la sección, también por escrito', () => {
    fijarRasanteDeEjemplo()
    render(<MapaEstado idCampaniaReferencia="camp-1" />)

    // 0+000 VER-I no se midió en el proyecto de ejemplo, pero la rasante
    // plana sí cubre todo el ancho de la plantilla (hasta 5.6 m): es "sin
    // medir", nunca "fuera de la sección".
    const celda = screen.getByLabelText(/0\+000 VER-I/)
    expect(celda.getAttribute('aria-label')).toMatch(/sin medir/)
    expect(celda.getAttribute('aria-label')).not.toMatch(/fuera de la sección/)
  })
})
