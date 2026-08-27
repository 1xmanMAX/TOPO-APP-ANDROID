import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import TablaResultados from './TablaResultados'

describe('TablaResultados', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('muestra las cotas compensadas con tres decimales', () => {
    render(<TablaResultados />)
    expect(screen.getByText('3244.597')).toBeInTheDocument()
    expect(screen.getByText('3244.677')).toBeInTheDocument()
  })

  it('deja vacías las celdas sin medir', () => {
    render(<TablaResultados />)
    // La toma de SUBRASANTE del ejemplo mide SAR-I, BOR-I, EJE, BOR-D y SAR-D
    // en cada progresiva, pero nunca VER-I ni VER-D: esa columna queda vacía
    // en toda fila, incluida 0+000, aunque la progresiva sí se haya medido.
    expect(screen.getByLabelText(/Cota en 0\+000 VER-I/).textContent).toBe('—')
  })

  it('selecciona la celda al hacer clic', async () => {
    const usuario = userEvent.setup()
    render(<TablaResultados />)
    await usuario.click(screen.getByLabelText(/Cota en 0\+020 EJE/))
    expect(useAlmacen.getState().seleccion.clave).toBe('20|EJE')
    expect(useAlmacen.getState().seleccion.progresiva).toBe(20)
  })

  it('el nombre accesible de una celda con cota incluye la cota', () => {
    render(<TablaResultados />)
    const boton = screen.getByLabelText(/Cota en 0\+020 EJE/)
    expect(boton.getAttribute('aria-label')).toContain(boton.textContent)
  })

  // NOTA (tarea C3): existía aquí una prueba «con una calle de progresiva
  // final menor que la inicial, se dibuja sin lanzar», del mismo tipo que
  // las retiradas en `evaluar.test.ts` y otros. `Calle` ya no tiene
  // `progresivaInicio`/`progresivaFin`: no hay forma de reproducir ese
  // escenario. Se anota una sola vez en el informe de la tarea.
})
