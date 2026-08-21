import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Proyecto } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import EditorRasante from './EditorRasante'

/** Calle de 0+000 a 0+140, sin rasante todavía: lo mínimo que el editor necesita. */
function proyectoConCalle(): Proyecto {
  return {
    version: 1,
    meta: {
      nombre: 'Proyecto de prueba',
      obra: '',
      cliente: '',
      ubicacion: '',
      responsable: '',
      creado: '2026-08-19T00:00:00.000Z',
      modificado: '2026-08-19T00:00:00.000Z',
    },
    bms: [],
    plantillas: [],
    calles: [
      {
        id: 'c-1',
        nombre: 'Calle 1',
        plantillaId: '',
        progresivaInicio: 0,
        progresivaFin: 140,
        intervalo: 20,
        progresivasExtra: [],
        rasante: null,
      },
    ],
    capas: [],
    campanias: [],
  }
}

/**
 * Añade un tramo de tipo salto sin corregir su signo: el valor por defecto
 * de un tramo nuevo es positivo, y para un salto positivo significa «baja»,
 * justo el sardinel al revés que describe el aviso.
 */
async function escribirSardinelAlReves() {
  await userEvent.click(screen.getByRole('button', { name: /añadir tramo/i }))
  const tipos = screen.getAllByLabelText(/^Tipo del tramo/)
  await userEvent.selectOptions(tipos.at(-1)!, 'salto')
  await userEvent.click(screen.getByRole('button', { name: /añadir tramo/i }))
}

describe('EditorRasante', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoConCalle())
  })

  it('empieza plegado, con un botón para definir la rasante', () => {
    render(<EditorRasante calleId="c-1" />)
    expect(screen.getByRole('button', { name: /definir la rasante/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('Cota de arranque')).not.toBeInTheDocument()
  })

  it('muestra en vivo la cota al final del tramo, para comprobar el signo', async () => {
    // Calle de 0+000 a 0+140. Con -1.25 %, la cota baja 1.750 m en 140 m.
    render(<EditorRasante calleId="c-1" />)

    await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))

    const cota = screen.getByLabelText('Cota de arranque')
    await userEvent.clear(cota)
    await userEvent.type(cota, '3245.180')
    fireEvent.blur(cota)

    const pendiente = screen.getByLabelText('Pendiente longitudinal')
    await userEvent.clear(pendiente)
    await userEvent.type(pendiente, '-1.25')
    fireEvent.blur(pendiente)

    expect(screen.getByText(/3243\.430/)).toBeInTheDocument()
  })

  it('un tramo que retrocede se rechaza con un mensaje que se entiende', async () => {
    render(<EditorRasante calleId="c-1" />)
    await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))
    await userEvent.click(screen.getByRole('button', { name: /añadir tramo/i }))

    const hasta = screen.getAllByLabelText(/Hasta el metro/).at(-1)!
    await userEvent.clear(hasta)
    await userEvent.type(hasta, '1')
    fireEvent.blur(hasta)

    expect(screen.getByText(/del eje hacia afuera/i)).toBeInTheDocument()
  })

  it('la rasante escrita queda guardada en la calle', async () => {
    render(<EditorRasante calleId="c-1" />)
    await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))

    const cota = screen.getByLabelText('Cota de arranque')
    await userEvent.clear(cota)
    await userEvent.type(cota, '3245.180')
    fireEvent.blur(cota)

    const calle = useAlmacen.getState().proyecto.calles.find((c) => c.id === 'c-1')
    expect(calle!.rasante!.cotaArranque).toBe(3245.18)
  })

  it('avisa si la vereda queda por debajo de la calzada, sin impedir guardarlo', async () => {
    render(<EditorRasante calleId="c-1" />)
    await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))
    await escribirSardinelAlReves()

    expect(screen.getByText(/la vereda queda por debajo/i)).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.calles[0]!.rasante).not.toBeNull()
  })
})
