import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Plantilla, Proyecto } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import EditorRasante from './EditorRasante'

/**
 * La misma plantilla del proyecto de ejemplo: eje, dos bordes de calzada a
 * ±4.20, dos sardineles a ±4.40 y dos veredas a ±5.60. Con la rasante por
 * defecto (una calzada hasta 4.20) los cuatro puntos más lejanos —los dos
 * sardineles y las dos veredas— quedan sin cota de proyecto.
 */
function plantillaEjemplo(): Plantilla {
  return {
    id: 'pl-1',
    nombre: 'Calle con vereda',
    elementos: [
      { clave: 'VER-I', etiqueta: 'Vereda izquierda', offset: -5.6, tipo: 'vereda' },
      { clave: 'SAR-I', etiqueta: 'Sardinel izquierdo', offset: -4.4, tipo: 'sardinel' },
      { clave: 'BOR-I', etiqueta: 'Borde izquierdo', offset: -4.2, tipo: 'calzada' },
      { clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' },
      { clave: 'BOR-D', etiqueta: 'Borde derecho', offset: 4.2, tipo: 'calzada' },
      { clave: 'SAR-D', etiqueta: 'Sardinel derecho', offset: 4.4, tipo: 'sardinel' },
      { clave: 'VER-D', etiqueta: 'Vereda derecha', offset: 5.6, tipo: 'vereda' },
    ],
  }
}

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
    render(<EditorRasante calleId="c-1" plantilla={plantillaEjemplo()} />)
    expect(screen.getByRole('button', { name: /definir la rasante/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('Cota de arranque')).not.toBeInTheDocument()
  })

  it('muestra en vivo la cota al final del tramo, para comprobar el signo', async () => {
    // Calle de 0+000 a 0+140. Con -1.25 %, la cota baja 1.750 m en 140 m.
    render(<EditorRasante calleId="c-1" plantilla={plantillaEjemplo()} />)

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
    render(<EditorRasante calleId="c-1" plantilla={plantillaEjemplo()} />)
    await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))
    await userEvent.click(screen.getByRole('button', { name: /añadir tramo/i }))

    const hasta = screen.getAllByLabelText(/Hasta el metro/).at(-1)!
    await userEvent.clear(hasta)
    await userEvent.type(hasta, '1')
    fireEvent.blur(hasta)

    expect(screen.getByText(/del eje hacia afuera/i)).toBeInTheDocument()

    // No basta con que aparezca el mensaje: el valor rechazado no puede haber
    // entrado en el modelo. El tramo añadido nace en 5.20 (4.20 + 1); tiene
    // que seguir ahí.
    const calle = useAlmacen.getState().proyecto.calles.find((c) => c.id === 'c-1')
    expect(calle!.rasante!.tramos[1]!.hastaOffset).toBe(5.2)
  })

  it('la rasante escrita queda guardada en la calle', async () => {
    render(<EditorRasante calleId="c-1" plantilla={plantillaEjemplo()} />)
    await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))

    const cota = screen.getByLabelText('Cota de arranque')
    await userEvent.clear(cota)
    await userEvent.type(cota, '3245.180')
    fireEvent.blur(cota)

    const calle = useAlmacen.getState().proyecto.calles.find((c) => c.id === 'c-1')
    expect(calle!.rasante!.cotaArranque).toBe(3245.18)
  })

  it('avisa si la vereda queda por debajo de la calzada, sin impedir guardarlo', async () => {
    render(<EditorRasante calleId="c-1" plantilla={plantillaEjemplo()} />)
    await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))
    await escribirSardinelAlReves()

    expect(screen.getByText(/la vereda queda por debajo/i)).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.calles[0]!.rasante).not.toBeNull()
  })

  it('avisa de los elementos de la plantilla que quedan sin cota, y el aviso desaparece al ampliar la sección', async () => {
    render(<EditorRasante calleId="c-1" plantilla={plantillaEjemplo()} />)
    await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))

    // La rasante por defecto solo llega a 4.20: los dos sardineles (±4.40) y
    // las dos veredas (±5.60) quedan fuera.
    const aviso = screen.getByText(/quedan sin cota de proyecto/i)
    expect(aviso).toHaveTextContent('SAR-I, SAR-D, VER-I, VER-D')

    const hasta = screen.getByLabelText('Hasta el metro 1')
    await userEvent.clear(hasta)
    await userEvent.type(hasta, '5.60')
    fireEvent.blur(hasta)

    expect(screen.queryByText(/quedan sin cota de proyecto/i)).not.toBeInTheDocument()
  })

  describe('lado no simétrico', () => {
    it('al desmarcar «Los dos lados son iguales», el lado izquierdo se siembra con lo que había', async () => {
      render(<EditorRasante calleId="c-1" plantilla={plantillaEjemplo()} />)
      await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))

      await userEvent.click(screen.getByRole('checkbox', { name: /los dos lados son iguales/i }))

      const calle = useAlmacen.getState().proyecto.calles.find((c) => c.id === 'c-1')
      expect(calle!.rasante!.tramosIzquierda).toEqual(calle!.rasante!.tramos)
    })

    it('cada lado se edita por separado', async () => {
      render(<EditorRasante calleId="c-1" plantilla={plantillaEjemplo()} />)
      await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))
      await userEvent.click(screen.getByRole('checkbox', { name: /los dos lados son iguales/i }))

      await userEvent.click(screen.getByRole('button', { name: 'Añadir tramo (izquierda)' }))

      const calle = useAlmacen.getState().proyecto.calles.find((c) => c.id === 'c-1')
      expect(calle!.rasante!.tramosIzquierda).toHaveLength(2)
      expect(calle!.rasante!.tramos).toHaveLength(1)
    })

    it('un ciclo de marcar y desmarcar la casilla no pierde lo escrito en el lado izquierdo', async () => {
      render(<EditorRasante calleId="c-1" plantilla={plantillaEjemplo()} />)
      await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))

      const casilla = screen.getByRole('checkbox', { name: /los dos lados son iguales/i })
      await userEvent.click(casilla) // desmarcar
      await userEvent.click(screen.getByRole('button', { name: 'Añadir tramo (izquierda)' }))
      await userEvent.click(casilla) // marcar de nuevo
      await userEvent.click(casilla) // y desmarcar otra vez

      const calle = useAlmacen.getState().proyecto.calles.find((c) => c.id === 'c-1')
      expect(calle!.rasante!.tramosIzquierda).toHaveLength(2)
    })
  })
})
