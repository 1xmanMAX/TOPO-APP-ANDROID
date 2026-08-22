import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Rasante } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import TablaDiferencias from './TablaDiferencias'

/**
 * Arranca en el eje con la misma cota que el BM del proyecto de ejemplo
 * (3245.18) y baja 1.25% por progresiva. Los tramos cubren hasta 5.6 m de
 * offset, el ancho completo de la plantilla del ejemplo: ningún elemento
 * queda fuera de sección sin querer. Misma rasante que usa
 * `estado/derivados.test.tsx`.
 */
function rasanteDeEjemplo(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 3245.18,
    pendienteLongitudinal: -1.25,
    tramos: [
      { nombre: 'Calzada', hastaOffset: 4.2, tipo: 'pendiente', valor: 2 },
      { nombre: 'Sardinel', hastaOffset: 4.4, tipo: 'salto', valor: 0.15 },
      { nombre: 'Vereda', hastaOffset: 5.6, tipo: 'pendiente', valor: -2 },
    ],
    simetrica: true,
    tramosIzquierda: null,
  }
}

function fijarRasanteDeEjemplo(): void {
  useAlmacen.getState().fijarRasante('c-1', rasanteDeEjemplo())
}

/**
 * Rasante angosta, que no llega hasta la vereda (solo cubre hasta el
 * sardinel, offset 4.4). Para que VER-I quede realmente "fuera de sección" —
 * medida pero sin cota teórica que compararle — hace falta que esté medida:
 * el proyecto de ejemplo no la mide en 0+000, así que se agrega esa lectura
 * a la misma estación que ya mide EJE y BOR-I ahí.
 */
function fijarRasanteEstrecha(): void {
  useAlmacen.getState().fijarRasante('c-1', {
    progresivaArranque: 0,
    cotaArranque: 3245.18,
    pendienteLongitudinal: -1.25,
    tramos: [{ nombre: 'Calzada', hastaOffset: 4.4, tipo: 'pendiente', valor: 2 }],
    simetrica: true,
    tramosIzquierda: null,
  })
  useAlmacen.getState().agregarIntermedia('camp-1', 0, {
    destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'VER-I' } },
    valor: 1.5,
  })
}

describe('TablaDiferencias', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('invita a definir la rasante cuando la calle todavía no tiene una', () => {
    render(<TablaDiferencias />)

    expect(screen.getByText(/define la rasante/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  // La cota real en 0+000 EJE es 3244.6275 (misma libreta que
  // `estado/derivados.test.tsx`), y la rasante de ejemplo pone la cota
  // teórica ahí en 3245.180: 552.5 mm por debajo, que redondeado a
  // milímetros enteros da -553. Está por debajo del proyecto → falta
  // material → rellenar. Con tolerancia de 20 mm en SUBRASANTE, el doble es
  // 40 mm: 553 mm de diferencia queda claramente fuera de tolerancia.
  it('muestra la diferencia en milímetros con signo y dice qué hacer', () => {
    fijarRasanteDeEjemplo()
    render(<TablaDiferencias />)

    expect(screen.getByLabelText(/0\+000 EJE: −553 mm, rellenar/)).toBeInTheDocument()
  })

  it('el interruptor cambia entre cota real, cota teórica y diferencia', async () => {
    fijarRasanteDeEjemplo()
    const usuario = userEvent.setup()
    render(<TablaDiferencias />)

    await usuario.click(screen.getByRole('button', { name: 'Cota teórica' }))
    expect(screen.getByText('3245.180')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Cota real' }))
    expect(screen.getByText('3244.628')).toBeInTheDocument()
  })

  it('el estado no viaja solo en el color: va en el nombre de la celda', () => {
    fijarRasanteDeEjemplo()
    render(<TablaDiferencias />)

    const celda = screen.getByLabelText(/0\+000 EJE/)
    expect(celda.getAttribute('aria-label')).toMatch(/fuera de tolerancia/)
  })

  it('una celda fuera de la sección definida sale vacía, no en cero', () => {
    fijarRasanteEstrecha()
    render(<TablaDiferencias />)

    const celda = screen.getByLabelText(/0\+000 VER-I/)
    expect(celda.textContent).toBe('')
    expect(celda.getAttribute('aria-label')).toMatch(/fuera de la sección/)
  })

  it('esa misma celda sí muestra su cota real en el modo Cota real: se midió, solo que el proyecto no dice nada ahí', async () => {
    fijarRasanteEstrecha()
    const usuario = userEvent.setup()
    render(<TablaDiferencias />)

    await usuario.click(screen.getByRole('button', { name: 'Cota real' }))

    const celda = screen.getByLabelText(/0\+000 VER-I/)
    expect(celda.textContent).not.toBe('')
  })

  it('una celda sin medir dice que no se midió, y no se confunde con la fuera de sección', () => {
    fijarRasanteDeEjemplo()
    render(<TablaDiferencias />)

    // 0+000 VER-I no se mide en el proyecto de ejemplo, pero la rasante
    // ancha sí la cubre: es "sin medir", no "fuera de sección".
    const celda = screen.getByLabelText(/0\+000 VER-I/)
    expect(celda.textContent).toBe('')
    expect(celda.getAttribute('aria-label')).toMatch(/sin medir/)
    expect(celda.getAttribute('aria-label')).not.toMatch(/fuera de la sección/)
  })

  it('el resumen cuenta conformes, al límite, fuera y sin medir', () => {
    fijarRasanteDeEjemplo()
    render(<TablaDiferencias />)

    // 10 progresivas × 7 elementos = 70 celdas; solo 3 están medidas
    // (0|EJE, 0|BOR-I, 20|EJE), y las tres caen fuera de tolerancia con esta
    // rasante y esta libreta.
    expect(screen.getByText('Conformes 0 · Al límite 0 · Fuera 3 · Sin medir 67')).toBeInTheDocument()
  })

  it('las celdas son clicables y seleccionan la celda, como en las otras tablas', async () => {
    fijarRasanteDeEjemplo()
    const usuario = userEvent.setup()
    render(<TablaDiferencias />)

    await usuario.click(screen.getByLabelText(/0\+000 EJE/))

    expect(useAlmacen.getState().seleccion.clave).toBe('0|EJE')
  })
})
