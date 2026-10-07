import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../../estado/almacen'
import { proyectoDePrueba } from '../analisis/proyectoDePrueba'
import EspacioCalle from './EspacioCalle'

/*
 * Obra de prueba de Análisis. La subrasante cerró con −6 mm: en el eje queda
 * 100.003, 99.973 y 99.946 (compensada), y la AI de su última estación,
 * compensada, es 101.706. La base pide +0.200 m, así que se da en el eje
 * 100.203, 100.173 y 100.146, y la mira tiene que marcar 1.503, 1.533 y
 * 1.560. El proyecto de la base en el eje es 100.200, 100.170 y 100.140.
 */
async function abrirDesdeCapaMedida() {
  const usuario = userEvent.setup()
  render(<EspacioCalle />)
  await usuario.click(screen.getByRole('button', { name: 'Desde una capa medida' }))
  return usuario
}

describe('Replantear › Desde una capa medida', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoDePrueba())
    useAlmacen.getState().activarCampania('toma-sub')
    useAlmacen.setState({ espacio: 'calle', modoCalle: 'replantear', pantallaCalle: null })
  })

  it('con rasante, de entrada se replantea desde el proyecto', () => {
    render(<EspacioCalle />)
    expect(screen.getByRole('button', { name: 'Desde el proyecto' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('da la capa de encima sobre la medida, con la AI compensada de la libreta', async () => {
    await abrirDesdeCapaMedida()

    expect(screen.getByText('BASE = SUBRASANTE + 0.200 m')).toBeInTheDocument()
    expect(screen.getByLabelText('Sumar (m)')).toHaveValue('0.200')
    expect(screen.getByText('101.706')).toBeInTheDocument()

    const nivel = within(screen.getByRole('region', { name: 'Nivel a registrar' }))
    expect(nivel.getByText('100.203')).toBeInTheDocument()
    expect(nivel.getByText('1.503')).toBeInTheDocument()
    expect(nivel.getByRole('status')).toHaveTextContent('✓ Interpolado · Sobre la subrasante medida, comprobada; 3 mm alta frente al proyecto.')

    const tabla = within(screen.getByRole('region', { name: 'Niveles a registrar' }))
    expect(tabla.getByRole('button', { name: '0+010: cota 100.173, mira 1.533' })).toBeInTheDocument()
    expect(tabla.getByRole('button', { name: '0+020: cota 100.146, mira 1.560' })).toBeInTheDocument()
  })

  it('una progresiva más allá de lo medido sale extrapolada y no comprobada', async () => {
    const usuario = await abrirDesdeCapaMedida()
    await usuario.type(screen.getByLabelText(/Más progresivas/), '0+030')

    const tabla = within(screen.getByRole('region', { name: 'Niveles a registrar' }))
    // Pendiente del último tramo: (99.946 − 99.973) / 10 = −0.27 %; 100.146 − 0.027 = 100.119.
    await usuario.click(tabla.getByRole('button', { name: '0+030: cota 100.119, mira 1.587 △' }))
    expect(within(screen.getByRole('region', { name: 'Nivel a registrar' })).getByRole('status')).toHaveTextContent(
      /△ Extrapolado · extrapolado a 10 m del punto extremo \(0\+020\).*No comprobada\./,
    )
  })

  it('cambiar el punto de la sección sigue esa línea', async () => {
    const usuario = await abrirDesdeCapaMedida()
    await usuario.click(within(screen.getByRole('group', { name: 'Punto de la sección' })).getByRole('button', { name: 'Borde izquierdo' }))
    // 99.943 + 0.200
    expect(within(screen.getByRole('region', { name: 'Nivel a registrar' })).getByText('100.143')).toBeInTheDocument()
  })

  it('desde un BM, la AI sale de la vista atrás', async () => {
    const usuario = await abrirDesdeCapaMedida()
    await usuario.click(screen.getByRole('button', { name: 'Desde un BM' }))
    await usuario.type(screen.getByLabelText('Vista atrás al BM'), '1.5')
    // AI 101.500 − 100.203
    expect(within(screen.getByRole('region', { name: 'Nivel a registrar' })).getByText('1.297')).toBeInTheDocument()
  })

  it('la lectura en cm y con la mira invertida', async () => {
    const usuario = await abrirDesdeCapaMedida()
    await usuario.click(screen.getByText('Cómo se lee la mira'))
    await usuario.click(screen.getByRole('button', { name: 'cm' }))
    const nivel = () => within(screen.getByRole('region', { name: 'Nivel a registrar' }))
    expect(nivel().getByText('150.3')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Invertida' }))
    // Invertida: lectura = cota − AI = −1.503 m: negativa, imposible.
    expect(nivel().getByRole('status')).toHaveTextContent('✗ Cambie de estación')
  })

  it('«Comprobar separación» abre Análisis en Separación', async () => {
    const usuario = await abrirDesdeCapaMedida()
    await usuario.click(screen.getByRole('button', { name: 'Comprobar separación' }))
    expect(useAlmacen.getState().pantallaCalle).toBe('analisis')
    expect(useAlmacen.getState().pestanaAnalisis).toBe('separacion')
  })
})
