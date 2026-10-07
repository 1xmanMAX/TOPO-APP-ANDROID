import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { useAlmacen } from './estado/almacen'
import { proyectoEjemplo } from './estado/ejemplo'

beforeEach(() => {
  useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  // La navegación vive en el almacén y no se reinicia al cargar un proyecto:
  // cada prueba arranca desde Obra › Calles, como la app al abrirse.
  useAlmacen.setState({
    espacio: 'obra',
    subObra: 'calles',
    modoCalle: 'medir',
    pantallaCalle: null,
    calculadoraAbierta: false,
  })
})

describe('App', () => {
  it('muestra la navegación principal: los tres espacios, la calculadora, el sol, el archivo y, dentro, el tema', async () => {
    const usuario = userEvent.setup()
    render(<App />)

    const espacios = await screen.findByRole('navigation', { name: 'Espacios' })
    expect(within(espacios).getByRole('button', { name: 'Obra' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(espacios).getByRole('button', { name: 'Calle' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(espacios).getByRole('button', { name: 'Informes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calcular' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modo sol' })).toBeInTheDocument()
    // El tema de base se cambia poco: vive dentro del menú Archivo.
    expect(screen.queryByRole('button', { name: 'Cambiar tema' })).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Archivo' }))
    const menu = screen.getByRole('group', { name: 'Archivo del proyecto' })
    expect(within(menu).getByRole('button', { name: 'Cambiar tema' })).toBeInTheDocument()
  })

  it('el menú Archivo guarda Nuevo, Abrir y Guardar hasta que se abre', async () => {
    const usuario = userEvent.setup()
    render(<App />)

    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
    await usuario.click(await screen.findByRole('button', { name: 'Archivo' }))

    const menu = screen.getByRole('group', { name: 'Archivo del proyecto' })
    expect(within(menu).getByRole('button', { name: 'Nuevo' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: 'Abrir' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
  })

  it('Obra arranca en Calles, con la subida de datos a la vista', async () => {
    render(<App />)

    const obra = await screen.findByRole('navigation', { name: 'Pantallas de la obra' })
    expect(within(obra).getByRole('button', { name: 'Calles' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/archivo de la hoja/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pegar/i)).toBeInTheDocument()
  })

  it('la sección de la calle está en Obra › Calles', async () => {
    // Sin ella la pantalla existe y nadie puede abrirla, y es donde se
    // declaran las palabras con las que se lee la hoja.
    // Viene plegada en su apartado: se abre con un toque.
    const usuario = userEvent.setup()
    render(<App />)

    await usuario.click(await screen.findByRole('button', { name: /^Sección$/ }))
    expect(await screen.findByRole('heading', { name: /sección de la calle/i })).toBeInTheDocument()
  })

  it('Obra › Plano abre el plano de obra', async () => {
    const usuario = userEvent.setup()
    render(<App />)

    await usuario.click(await screen.findByRole('button', { name: 'Plano' }))

    expect(screen.getByRole('heading', { name: 'Plano de obra' })).toBeInTheDocument()
    expect(useAlmacen.getState().subObra).toBe('plano')
  })

  it('Calle tiene los tres modos y las tres pantallas, y cada una abre lo suyo', async () => {
    const usuario = userEvent.setup()
    render(<App />)

    await usuario.click(await screen.findByRole('button', { name: 'Calle' }))

    // Medir es la libreta de la calle activa.
    const modos = screen.getByRole('navigation', { name: 'Modos de la calle' })
    expect(within(modos).getByRole('button', { name: 'Medir' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/lectura de mira/i)).toBeInTheDocument()

    await usuario.click(within(modos).getByRole('button', { name: 'Revisar' }))
    expect(screen.getByRole('heading', { name: /cotas (compensadas|sin compensar)/i })).toBeInTheDocument()

    await usuario.click(within(modos).getByRole('button', { name: 'Replantear' }))
    expect(screen.getByRole('heading', { name: 'Replantear' })).toBeInTheDocument()

    const pantallas = screen.getByRole('navigation', { name: 'Pantallas de la calle' })
    await usuario.click(within(pantallas).getByRole('button', { name: 'Análisis' }))
    expect(screen.getByRole('heading', { name: 'Análisis' })).toBeInTheDocument()
    // Con una pantalla abierta, ningún modo queda marcado: no es lo que se ve.
    expect(within(modos).getByRole('button', { name: 'Replantear' })).toHaveAttribute('aria-pressed', 'false')

    await usuario.click(within(pantallas).getByRole('button', { name: 'Cierre' }))
    expect(screen.getByRole('heading', { name: 'Cierre' })).toBeInTheDocument()

    await usuario.click(within(pantallas).getByRole('button', { name: 'Planificar' }))
    expect(screen.getByRole('heading', { name: 'Planificar' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Guía de campo' }))
    expect(screen.getByRole('heading', { name: /^Guía de campo/ })).toBeInTheDocument()
    expect(within(pantallas).getByRole('button', { name: 'Planificar' })).toHaveAttribute('aria-pressed', 'true')

    // Volver a un modo cierra la pantalla.
    await usuario.click(within(modos).getByRole('button', { name: 'Medir' }))
    expect(useAlmacen.getState().pantallaCalle).toBeNull()
    expect(screen.getByLabelText(/lectura de mira/i)).toBeInTheDocument()
  })

  it('cambiar de calle activa su última toma', async () => {
    const usuario = userEvent.setup()
    const proyecto = proyectoEjemplo()
    const original = proyecto.calles[0]!
    // Una segunda calle con una toma propia, copiada de la primera.
    const segunda = {
      ...original,
      id: 'c-segunda',
      nombre: 'Jr. Segunda',
      nivelaciones: original.nivelaciones.map((n) => ({
        ...n,
        id: `${n.id}-2`,
        tomas: n.tomas.map((t) => ({ ...t, id: `${t.id}-2` })),
      })),
    }
    useAlmacen.getState().cargarProyecto({ ...proyecto, calles: [original, segunda] })
    render(<App />)

    await usuario.click(await screen.findByRole('button', { name: 'Calle' }))
    await usuario.selectOptions(screen.getByLabelText('Calle activa'), 'Jr. Segunda')

    const estado = useAlmacen.getState()
    expect(estado.calleActivaId).toBe('c-segunda')
    const ultimaToma = segunda.nivelaciones.at(-1)!.tomas.at(-1)!
    expect(estado.campaniaActivaId).toBe(ultimaToma.id)
  })

  it('Calcular abre la calculadora encima de la pantalla, y se cierra', async () => {
    const usuario = userEvent.setup()
    render(<App />)

    await usuario.click(await screen.findByRole('button', { name: 'Calcular' }))
    const dialogo = screen.getByRole('dialog', { name: 'Calculadora de campo' })
    expect(within(dialogo).getByRole('heading', { name: 'Calcular' })).toBeInTheDocument()
    // La pantalla de debajo sigue ahí.
    expect(screen.getByRole('heading', { name: 'Calles y sus capas' })).toBeInTheDocument()

    await usuario.click(within(dialogo).getByRole('button', { name: 'Cerrar calculadora' }))
    expect(screen.queryByRole('dialog', { name: 'Calculadora de campo' })).not.toBeInTheDocument()
  })

  it('Informes ofrece exportar las cotas y dice si no están comprobadas (el .topo se guarda desde Archivo)', async () => {
    const usuario = userEvent.setup()
    render(<App />)

    await usuario.click(await screen.findByRole('button', { name: 'Informes' }))

    expect(screen.getByRole('heading', { name: 'Informes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar cotas a Excel' })).toBeInTheDocument()
    // CSV y Copiar van en el «⋯» de cada tabla, para que haya un solo botón a la vista.
    await usuario.click(screen.getByRole('button', { name: 'Más formatos de cotas' }))
    expect(screen.getByRole('button', { name: 'Exportar cotas a CSV' })).toBeInTheDocument()
    expect(screen.getByText(/[✓✗△] .*(cerró|sin cerrar)/)).toBeInTheDocument()
  })

  // Regresión (tarea E1): el botón «Nueva campaña» estaba habilitado y llevaba
  // a un callejón sin salida. La tabla de la libreta salía solo de las
  // progresivas ya medidas, así que una jornada recién creada no tenía ni una
  // celda donde escribir y su primera lectura era imposible para siempre. Este
  // es el recorrido entero: crear la jornada, declarar dónde se va a medir y
  // anotar ahí la primera lectura.
  it('una jornada recién creada declara su primera progresiva y recibe su primera lectura', async () => {
    const usuario = userEvent.setup()

    render(<App />)

    // Las jornadas se crean desde Obra › Calles; crear una lleva a Calle › Medir.
    await usuario.click(await screen.findByRole('button', { name: /^nueva jornada$/i }))
    expect(useAlmacen.getState().espacio).toBe('calle')
    expect(useAlmacen.getState().modoCalle).toBe('medir')

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

    // Con rasante, el mapa de Medir nombra la celda con su estado («0+006 Eje, sin medir»).
    await usuario.click(screen.getByRole('button', { name: /^0\+006 Eje([:,]|$)/ }))
    await usuario.type(screen.getByLabelText(/lectura de mira/i), '2.230{Enter}')

    expect(screen.getByText(/llenadas 1 de 7/)).toBeInTheDocument()

    // 3245.180 (BM-1) + 1.425 − 2.230 = 3244.375
    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.cotasPorCelda.get('6|p-eje')?.cota).toBeCloseTo(3244.375, 6)
  })
})
