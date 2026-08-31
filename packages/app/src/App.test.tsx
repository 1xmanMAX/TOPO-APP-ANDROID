import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { useAlmacen } from './estado/almacen'
import { proyectoEjemplo } from './estado/ejemplo'

describe('App', () => {
  it('muestra la navegación principal', async () => {
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Libreta' })).toBeInTheDocument()
  })

  it('se llega a subir datos desde la barra', async () => {
    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: 'Subir datos' }))

    expect(screen.getByLabelText(/archivo de la hoja/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pegar/i)).toBeInTheDocument()
  })

  it('se llega a la sección de la calle desde la barra', async () => {
    // Sin esta pestaña la pantalla existe y nadie puede abrirla, y es donde se
    // declaran las palabras con las que se lee la hoja.
    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: 'Sección' }))

    expect(screen.getByRole('heading', { name: /sección de la calle/i })).toBeInTheDocument()
  })

  // Regresión (tarea E1): el botón «Nueva campaña» estaba habilitado y llevaba
  // a un callejón sin salida. La tabla de la libreta salía solo de las
  // progresivas ya medidas, así que una jornada recién creada no tenía ni una
  // celda donde escribir y su primera lectura era imposible para siempre. Este
  // es el recorrido entero: crear la jornada, declarar dónde se va a medir y
  // anotar ahí la primera lectura.
  it('una jornada recién creada declara su primera progresiva y recibe su primera lectura', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())

    render(<App />)

    await usuario.click(await screen.findByRole('button', { name: 'Campañas' }))
    await usuario.click(screen.getByRole('button', { name: /nueva campaña/i }))

    // Crearla abre su libreta, y nace sin una sola lectura.
    expect(screen.getByText(/llenadas 0 de 0/)).toBeInTheDocument()

    // Max declara la progresiva donde va a medir, escrita como la escribe él.
    await usuario.type(screen.getByLabelText(/añadir progresiva/i), '0+006')
    await usuario.click(screen.getByRole('button', { name: 'Añadir' }))

    // La calle del ejemplo tiene 7 puntos: la progresiva declarada trae sus 7.
    expect(screen.getByText(/llenadas 0 de 7/)).toBeInTheDocument()

    // Sin la visada al banco de nivel no hay altura de aparato, y por tanto
    // ninguna cota: se escribe primero.
    const vistaAtras = screen.getByLabelText(/vista atrás a BM/i)
    await usuario.clear(vistaAtras)
    await usuario.type(vistaAtras, '1.425')

    await usuario.click(screen.getByRole('button', { name: '0+006 Eje' }))
    await usuario.type(screen.getByLabelText(/lectura de mira/i), '2.230{Enter}')

    expect(screen.getByText(/llenadas 1 de 7/)).toBeInTheDocument()

    // 3245.180 (BM-1) + 1.425 − 2.230 = 3244.375
    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.cotasPorCelda.get('6|p-eje')?.cota).toBeCloseTo(3244.375, 6)
  })
})
