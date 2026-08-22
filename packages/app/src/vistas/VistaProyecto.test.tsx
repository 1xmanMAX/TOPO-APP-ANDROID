import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import VistaProyecto from './VistaProyecto'

describe('VistaProyecto', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('lista los bancos de nivel del proyecto', () => {
    render(<VistaProyecto />)
    expect(screen.getByDisplayValue('BM-1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('3245.180')).toBeInTheDocument()
  })

  it('agrega un banco de nivel', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)
    await usuario.click(screen.getByRole('button', { name: /agregar banco de nivel/i }))
    expect(useAlmacen.getState().proyecto.bms).toHaveLength(2)
  })

  it('corrige la cota de un banco de nivel', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)
    const campo = screen.getByDisplayValue('3245.180')
    await usuario.clear(campo)
    await usuario.type(campo, '3245.280')
    expect(useAlmacen.getState().proyecto.bms[0]!.cota).toBeCloseTo(3245.28, 6)
  })

  it('acepta la coma como separador decimal', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)
    const campo = screen.getByDisplayValue('3245.180')
    await usuario.clear(campo)
    await usuario.type(campo, '3245,5')
    expect(useAlmacen.getState().proyecto.bms[0]!.cota).toBeCloseTo(3245.5, 6)
  })

  it('lista las capas del proyecto', () => {
    render(<VistaProyecto />)
    expect(screen.getByDisplayValue('SUBRASANTE')).toBeInTheDocument()
  })

  it('pide confirmación antes de eliminar un banco de nivel', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)

    await usuario.click(screen.getByRole('button', { name: 'Eliminar BM-1' }))
    expect(useAlmacen.getState().proyecto.bms).toHaveLength(1)

    await usuario.click(screen.getByRole('button', { name: 'Confirmar eliminación de BM-1' }))
    expect(useAlmacen.getState().proyecto.bms).toHaveLength(0)
  })

  it('advierte que el banco de nivel está en uso por una campaña', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)

    await usuario.click(screen.getByRole('button', { name: 'Eliminar BM-1' }))
    expect(screen.getByRole('button', { name: 'Confirmar eliminación de BM-1' })).toHaveTextContent(
      'Hay campañas que lo usan',
    )
  })

  it('pide confirmación antes de eliminar una capa', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)

    await usuario.click(screen.getByRole('button', { name: 'Eliminar capa TERRENO EXISTENTE' }))
    expect(useAlmacen.getState().proyecto.capas).toHaveLength(4)

    await usuario.click(
      screen.getByRole('button', { name: 'Confirmar eliminación de la capa TERRENO EXISTENTE' }),
    )
    expect(useAlmacen.getState().proyecto.capas).toHaveLength(3)
  })

  it('no deja borrar una capa que alguna campaña está usando', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)

    await usuario.click(screen.getByRole('button', { name: 'Eliminar capa SUBRASANTE' }))

    expect(screen.getByText(/la usa una campaña/i)).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.capas).toHaveLength(4)
  })

  it('sube una capa y cambia su posición en la lista dibujada', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)

    // El nombre ahora vive en un campo editable, no en texto plano: se lee
    // por su valor, no por el contenido de texto de la fila.
    const nombreDe = (fila: HTMLElement) => within(fila).getByLabelText('Nombre') as HTMLInputElement

    // Orden inicial: TERRENO EXISTENTE, SUBRASANTE.
    let filas = screen.getAllByRole('listitem')
    expect(nombreDe(filas[0]!).value).toBe('TERRENO EXISTENTE')
    expect(nombreDe(filas[1]!).value).toBe('SUBRASANTE')

    await usuario.click(screen.getByRole('button', { name: 'Subir la capa SUBRASANTE' }))

    filas = screen.getAllByRole('listitem')
    expect(nombreDe(filas[0]!).value).toBe('SUBRASANTE')
    expect(nombreDe(filas[1]!).value).toBe('TERRENO EXISTENTE')
    expect(useAlmacen.getState().proyecto.capas.map((c) => c.orden)).toEqual([0, 1, 2, 3])
  })

  it('se puede renombrar una capa y el nombre queda guardado', async () => {
    render(<VistaProyecto />)

    const nombre = screen.getByDisplayValue('SUBRASANTE')
    await userEvent.clear(nombre)
    await userEvent.type(nombre, 'BASE GRANULAR')

    const capa = useAlmacen.getState().proyecto.capas.find((c) => c.id === 'cap-subrasante')
    expect(capa!.nombre).toBe('BASE GRANULAR')
  })

  it('tras crear dos capas y renombrar una, los campos de espesor de ambas se distinguen por su nombre', async () => {
    render(<VistaProyecto />)

    await userEvent.click(screen.getByRole('button', { name: /agregar capa/i }))
    await userEvent.click(screen.getByRole('button', { name: /agregar capa/i }))

    // Las dos nacen con el mismo nombre literal: antes de renombrar, sus
    // campos de espesor comparten nombre accesible y no se pueden distinguir.
    const nombres = screen.getAllByDisplayValue('CAPA NUEVA')
    expect(nombres).toHaveLength(2)

    await userEvent.clear(nombres[1]!)
    await userEvent.type(nombres[1]!, 'RODADURA')

    expect(screen.getByLabelText('Espesor de CAPA NUEVA')).toBeInTheDocument()
    expect(screen.getByLabelText('Espesor de RODADURA')).toBeInTheDocument()
  })

  it('se puede escribir el espesor de una capa y queda guardado', async () => {
    render(<VistaProyecto />)

    const campo = screen.getByLabelText('Espesor de SUBRASANTE')
    await userEvent.clear(campo)
    await userEvent.type(campo, '0.25')
    fireEvent.blur(campo)

    const capa = useAlmacen.getState().proyecto.capas.find((c) => c.nombre === 'SUBRASANTE')
    expect(capa!.espesor).toBe(0.25)
  })

  it('avisa de las capas que todavía no tienen espesor, diciendo cuáles', () => {
    // Escenario propio, no el del ejemplo: lo que importa aquí es que una
    // capa de orden > 0 con espesor cero dispare el aviso y quede nombrada
    // en él, no qué capa en concreto trae el proyecto de demostración.
    const proyecto = useAlmacen.getState().proyecto
    useAlmacen.getState().cargarProyecto({
      ...proyecto,
      capas: [
        { id: 'cap-terreno', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 },
        { id: 'cap-base', nombre: 'BASE SIN ESPESOR', orden: 1, espesor: 0, toleranciaMm: 20 },
      ],
    })

    render(<VistaProyecto />)

    // El nombre de la capa aparece dos veces en la pantalla —en la lista de
    // capas y en el aviso—, así que se comprueba que el propio aviso la
    // nombra, no que el nombre exista en algún sitio de la página.
    const aviso = screen.getByText(/sin espesor definido/i)
    expect(aviso).toBeInTheDocument()
    expect(aviso).toHaveTextContent('BASE SIN ESPESOR')
  })

  it('cuando todas las capas tienen espesor, no queda ningún aviso', () => {
    const proyecto = useAlmacen.getState().proyecto
    useAlmacen.getState().cargarProyecto({
      ...proyecto,
      capas: proyecto.capas.map((capa) => ({ ...capa, espesor: capa.orden === 0 ? 0 : 0.2 })),
    })

    render(<VistaProyecto />)

    expect(screen.queryByText(/sin espesor definido/i)).toBeNull()
  })
})
