import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import VistaResultados from './VistaResultados'

describe('VistaResultados', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('al elegir una celda de la tabla, el corte salta a esa progresiva', async () => {
    const usuario = userEvent.setup()
    render(<VistaResultados />)

    await usuario.click(screen.getByLabelText('0+020 EJE'))

    expect(screen.getByRole('img', { name: /Corte transversal en 0\+020/ })).toBeInTheDocument()
  })

  it('sigue al usuario hasta una progresiva sin lecturas', async () => {
    const usuario = userEvent.setup()
    render(<VistaResultados />)

    await usuario.click(screen.getByLabelText('0+040 EJE'))

    expect(useAlmacen.getState().seleccion.progresiva).toBe(40)
    expect(screen.getByLabelText('Progresiva')).toHaveValue('2')
  })

  it('el perfil cambia de elemento al elegir otro en el desplegable', async () => {
    const usuario = userEvent.setup()
    render(<VistaResultados />)

    await usuario.selectOptions(screen.getByLabelText('Elemento del perfil'), 'BOR-I')

    expect(screen.getByRole('img', { name: /Perfil longitudinal de BOR-I/ })).toBeInTheDocument()
  })

  it('con el cierre fuera de tolerancia, el título dice que las cotas no están compensadas y se ve el veredicto', () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const lecturaId = useAlmacen.getState().proyecto.campanias[0]!.estaciones[1]!.vistaAdelante!.id
    useAlmacen.getState().actualizarLectura(campaniaId, lecturaId, 1.887)

    render(<VistaResultados />)

    expect(screen.getByText('Cotas sin compensar')).toBeInTheDocument()
    expect(screen.queryByText('Cotas compensadas')).not.toBeInTheDocument()
    expect(screen.getByText(/NO COMPROBADAS/)).toBeInTheDocument()
  })

  it('el perfil cae a otro elemento si el elegido ya no está en la plantilla', async () => {
    render(<VistaResultados />)
    const plantilla = useAlmacen.getState().proyecto.plantillas[0]!

    // La mutación llega desde fuera de un evento de usuario (como lo haría el
    // editor de plantilla en otra pantalla), así que hay que envolverla en
    // act() para que React aplique el re-render antes de la aserción.
    act(() => {
      useAlmacen.getState().actualizarPlantilla(plantilla.id, {
        elementos: plantilla.elementos.filter((elemento) => elemento.clave !== 'EJE'),
      })
    })

    expect(screen.queryByRole('img', { name: /Perfil longitudinal de EJE/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Elemento del perfil')).not.toHaveValue('EJE')
  })
})
