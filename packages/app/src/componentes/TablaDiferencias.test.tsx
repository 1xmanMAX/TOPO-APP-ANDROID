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
    useAlmacen.getState().fijarRasante('c-1', null)
    render(<TablaDiferencias idCampaniaReferencia="camp-1" />)

    expect(screen.getByText(/define la rasante/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  // La cota real en 0+000 EJE es 3244.5965 (misma libreta que
  // `estado/derivados.test.tsx`), y la rasante de ejemplo pone la rasante ahí
  // en 3245.180. BASE + CARPETA (0.25 m) van encima de SUBRASANTE, así que
  // su cota teórica queda en 3244.930: 333.5 mm por debajo, que redondeado a
  // milímetros enteros da -334. Está por debajo del proyecto → falta
  // material → rellenar. Con tolerancia de 20 mm en SUBRASANTE, el doble es
  // 40 mm: 334 mm de diferencia queda claramente fuera de tolerancia.
  it('muestra la diferencia en milímetros con signo y dice qué hacer', () => {
    fijarRasanteDeEjemplo()
    render(<TablaDiferencias idCampaniaReferencia="camp-1" />)

    expect(screen.getByLabelText(/0\+000 EJE: −334 mm, rellenar/)).toBeInTheDocument()
  })

  it('el interruptor cambia entre cota real, cota teórica y diferencia', async () => {
    fijarRasanteDeEjemplo()
    const usuario = userEvent.setup()
    render(<TablaDiferencias idCampaniaReferencia="camp-1" />)

    await usuario.click(screen.getByRole('button', { name: 'Cota teórica' }))
    expect(screen.getByText('3244.930')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Cota real' }))
    expect(screen.getByText('3244.597')).toBeInTheDocument()
  })

  it('el estado no viaja solo en el color: va en el nombre de la celda', () => {
    fijarRasanteDeEjemplo()
    render(<TablaDiferencias idCampaniaReferencia="camp-1" />)

    const celda = screen.getByLabelText(/0\+000 EJE/)
    expect(celda.getAttribute('aria-label')).toMatch(/fuera de tolerancia/)
  })

  it('una celda fuera de la sección definida sale vacía, no en cero', () => {
    fijarRasanteEstrecha()
    render(<TablaDiferencias idCampaniaReferencia="camp-1" />)

    const celda = screen.getByLabelText(/0\+000 VER-I/)
    expect(celda.textContent).toBe('')
    expect(celda.getAttribute('aria-label')).toMatch(/fuera de la sección/)
  })

  it('esa misma celda sí muestra su cota real en el modo Cota real: se midió, solo que el proyecto no dice nada ahí', async () => {
    fijarRasanteEstrecha()
    const usuario = userEvent.setup()
    render(<TablaDiferencias idCampaniaReferencia="camp-1" />)

    await usuario.click(screen.getByRole('button', { name: 'Cota real' }))

    const celda = screen.getByLabelText(/0\+000 VER-I/)
    expect(celda.textContent).not.toBe('')
  })

  it('una celda sin medir dice que no se midió, y no se confunde con la fuera de sección', () => {
    fijarRasanteDeEjemplo()
    render(<TablaDiferencias idCampaniaReferencia="camp-1" />)

    // 0+000 VER-I no se mide en el proyecto de ejemplo, pero la rasante
    // ancha sí la cubre: es "sin medir", no "fuera de sección".
    const celda = screen.getByLabelText(/0\+000 VER-I/)
    expect(celda.textContent).toBe('')
    expect(celda.getAttribute('aria-label')).toMatch(/sin medir/)
    expect(celda.getAttribute('aria-label')).not.toMatch(/fuera de la sección/)
  })

  // Sin medir y fuera de sección son cosas distintas para quien trabaja: una
  // se resuelve saliendo a medir, la otra nunca será comparable. Sumarlas en
  // el resumen escondería cuántas de esas celdas todavía tienen arreglo, así
  // que el resumen las cuenta por separado.
  it('el resumen cuenta las cinco categorías por separado, sin sumar sin medir y fuera de sección', () => {
    fijarRasanteDeEjemplo()
    render(<TablaDiferencias idCampaniaReferencia="camp-1" />)

    // 10 progresivas × 7 elementos = 70 celdas. La campaña de SUBRASANTE del
    // ejemplo (Entrega 3) mide una grilla completa de 25 celdas, de 0+000 a
    // 0+080. Esta rasante de prueba tiene una pendiente longitudinal mucho
    // más fuerte (-1.25 %) que la del proyecto (-0.30 %), así que se aparta
    // cada vez más de lo medido según avanza la progresiva: con esta rasante
    // y esta libreta, 23 celdas quedan fuera de tolerancia y una al límite
    // (0+000 SAR-D). La rasante de ejemplo cubre todo el ancho de la
    // plantilla, así que ninguna celda medida queda fuera de sección.
    expect(
      screen.getByText('Conformes 1 · Al límite 1 · Fuera 23 — Sin medir 45 · Fuera de sección 0'),
    ).toBeInTheDocument()
  })

  // Encontrado en la revisión: el símbolo solo se calculaba en el modo
  // Diferencia. En «Cota real» y «Cota teórica», «al límite» y «fuera de
  // tolerancia» compartían la misma negrita y solo el color los distinguía
  // — justo lo que la regla del color como único portador de significado
  // prohíbe. Ninguna prueba anterior lo detectaba porque todas corrían en
  // el modo por defecto.
  it('el símbolo acompaña a la cifra también en Cota real, no solo en Diferencia', async () => {
    fijarRasanteDeEjemplo()
    const usuario = userEvent.setup()
    render(<TablaDiferencias idCampaniaReferencia="camp-1" />)

    await usuario.click(screen.getByRole('button', { name: 'Cota real' }))

    // 0+000 EJE está fuera de tolerancia con esta rasante y esta libreta.
    const celda = screen.getByLabelText(/0\+000 EJE/)
    expect(celda.textContent).toBe('✗ 3244.597')
    // La cifra sigue siendo buscable sola: el símbolo no la contamina.
    expect(screen.getByText('3244.597')).toBeInTheDocument()
  })

  it('las celdas son clicables y seleccionan la celda, como en las otras tablas', async () => {
    fijarRasanteDeEjemplo()
    const usuario = userEvent.setup()
    render(<TablaDiferencias idCampaniaReferencia="camp-1" />)

    await usuario.click(screen.getByLabelText(/0\+000 EJE/))

    expect(useAlmacen.getState().seleccion.clave).toBe('0|EJE')
  })
})
