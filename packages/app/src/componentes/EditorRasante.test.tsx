import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { catalogoDeFabrica, type Proyecto, type PuntoCalle } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import EditorRasante from './EditorRasante'

/**
 * Los mismos puntos del proyecto de ejemplo: eje, dos bordes de calzada a
 * ±4.20, dos sardineles a ±4.40 y dos veredas a ±5.60. Con la rasante por
 * defecto (una calzada hasta 4.20) los cuatro puntos más lejanos —los dos
 * sardineles y las dos veredas— quedan sin cota de proyecto.
 */
function puntosEjemplo(): PuntoCalle[] {
  return [
    { concepto: 'veredaIzq', codigo: 'VER-I', distancia: -5.6 },
    { concepto: 'sardinelIzq', codigo: 'SAR-I', distancia: -4.4 },
    { concepto: 'bordeIzq', codigo: 'BOR-I', distancia: -4.2 },
    { concepto: 'eje', codigo: 'EJE', distancia: 0 },
    { concepto: 'bordeDer', codigo: 'BOR-D', distancia: 4.2 },
    { concepto: 'sardinelDer', codigo: 'SAR-D', distancia: 4.4 },
    { concepto: 'veredaDer', codigo: 'VER-D', distancia: 5.6 },
  ]
}

/** Calle sin rasante todavía, con sus propios puntos: lo mínimo que el editor necesita. */
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
    catalogo: catalogoDeFabrica(),
    bms: [],
    calles: [
      {
        id: 'c-1',
        nombre: 'Calle 1',
        puntos: puntosEjemplo(),
        nivelaciones: [],
        rasante: null,
      },
    ],
    capas: [],
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
    render(<EditorRasante calleId="c-1" puntos={puntosEjemplo()} />)
    expect(screen.getByRole('button', { name: /definir la rasante/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('Cota de arranque')).not.toBeInTheDocument()
  })

  it('muestra en vivo la cota al final del tramo, para comprobar el signo', async () => {
    // El editor ya no lee el final de la calle (no existe): enseña la cota a
    // una distancia fija de 100 m desde el arranque (DISTANCIA_VISTA_PREVIA
    // en EditorRasante.tsx). Con -1.25 %, la cota baja 1.250 m en esos 100 m.
    render(<EditorRasante calleId="c-1" puntos={puntosEjemplo()} />)

    await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))

    const cota = screen.getByLabelText('Cota de arranque')
    await userEvent.clear(cota)
    await userEvent.type(cota, '3245.180')
    fireEvent.blur(cota)

    const pendiente = screen.getByLabelText('Pendiente longitudinal')
    await userEvent.clear(pendiente)
    await userEvent.type(pendiente, '-1.25')
    fireEvent.blur(pendiente)

    expect(screen.getByText(/3243\.930/)).toBeInTheDocument()
  })

  it('un tramo que retrocede se rechaza con un mensaje que se entiende', async () => {
    render(<EditorRasante calleId="c-1" puntos={puntosEjemplo()} />)
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
    render(<EditorRasante calleId="c-1" puntos={puntosEjemplo()} />)
    await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))

    const cota = screen.getByLabelText('Cota de arranque')
    await userEvent.clear(cota)
    await userEvent.type(cota, '3245.180')
    fireEvent.blur(cota)

    const calle = useAlmacen.getState().proyecto.calles.find((c) => c.id === 'c-1')
    expect(calle!.rasante!.cotaArranque).toBe(3245.18)
  })

  it('avisa si la vereda queda por debajo de la calzada, sin impedir guardarlo', async () => {
    render(<EditorRasante calleId="c-1" puntos={puntosEjemplo()} />)
    await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))
    await escribirSardinelAlReves()

    expect(screen.getByText(/la vereda queda por debajo/i)).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.calles[0]!.rasante).not.toBeNull()
  })

  it('avisa de los elementos de la plantilla que quedan sin cota, y el aviso desaparece al ampliar la sección', async () => {
    render(<EditorRasante calleId="c-1" puntos={puntosEjemplo()} />)
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
      render(<EditorRasante calleId="c-1" puntos={puntosEjemplo()} />)
      await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))

      await userEvent.click(screen.getByRole('checkbox', { name: /los dos lados son iguales/i }))

      const calle = useAlmacen.getState().proyecto.calles.find((c) => c.id === 'c-1')
      expect(calle!.rasante!.tramosIzquierda).toEqual(calle!.rasante!.tramos)
    })

    it('cada lado se edita por separado', async () => {
      render(<EditorRasante calleId="c-1" puntos={puntosEjemplo()} />)
      await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))
      await userEvent.click(screen.getByRole('checkbox', { name: /los dos lados son iguales/i }))

      await userEvent.click(screen.getByRole('button', { name: 'Añadir tramo (izquierda)' }))

      const calle = useAlmacen.getState().proyecto.calles.find((c) => c.id === 'c-1')
      expect(calle!.rasante!.tramosIzquierda).toHaveLength(2)
      expect(calle!.rasante!.tramos).toHaveLength(1)
    })

    it('un ciclo de marcar y desmarcar la casilla no pierde lo escrito en el lado izquierdo', async () => {
      render(<EditorRasante calleId="c-1" puntos={puntosEjemplo()} />)
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
