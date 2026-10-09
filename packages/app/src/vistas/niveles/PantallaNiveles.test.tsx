import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../../estado/almacen'
import { proyectoDePrueba } from '../analisis/proyectoDePrueba'
import PantallaNiveles from './PantallaNiveles'

/*
 * La obra de prueba de Análisis tiene el BM-1 a 100.000: la puesta que se
 * propone es 100.000 + 1.500 = AI 101.500, la misma del ejemplo del HTML de
 * Max. Vereda: 1.250, 1.260, 1.275, 1.290, 1.300 cada 10 m → 100.250,
 * 100.240, 100.225, 100.210, 100.200. Base: 1.450 … 1.490 → 100.050 … 100.010.
 */
const VEREDA = '0, 1.250\n10, 1.260\n20, 1.275\n30, 1.290\n40, 1.300'
const BASE = '0, 1.450\n10, 1.455\n20, 1.470\n30, 1.480\n40, 1.490'

async function agregarConjunto(usuario: ReturnType<typeof userEvent.setup>, nombre: string, categoria: string, datos: string) {
  await usuario.click(screen.getByRole('button', { name: '+ Agregar conjunto' }))
  const editor = within(screen.getByRole('region', { name: 'Conjuntos de datos' }))
  const campoNombre = editor.getByLabelText('Nombre')
  await usuario.clear(campoNombre)
  await usuario.type(campoNombre, nombre)
  await usuario.type(editor.getByLabelText('Categoría'), categoria)
  fireEvent.change(editor.getByLabelText(/Datos de .*: progresiva, valor/), { target: { value: datos } })
}

describe('Calle › Niveles', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoDePrueba())
    useAlmacen.setState({ espacio: 'calle', pantallaCalle: 'niveles' })
  })

  it('pide el primer conjunto sin tocar el proyecto; al escribir lecturas crea la puesta sobre el BM del proyecto', async () => {
    const usuario = userEvent.setup()
    render(<PantallaNiveles />)
    expect(screen.getByRole('heading', { name: 'Niveles' })).toBeInTheDocument()
    expect(screen.getByText(/Todavía no hay puestas/)).toBeInTheDocument()
    expect(screen.getByText(/Agrega un conjunto/)).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.calles[0]!.niveles).toBeUndefined()

    await usuario.click(screen.getByRole('button', { name: '+ Agregar conjunto' }))
    // La puesta es del proyecto, enlazada al BM-1 (100.000): la misma para el plano, la calculadora y Replantear.
    expect(screen.getByRole('button', { name: 'Puesta 1 · AI 101.500' })).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.puestas).toEqual([expect.objectContaining({ nombre: 'Puesta 1', bmId: 'bm-1', lecturaAtras: 1.5 })])
  })

  it('con dos conjuntos escritos a mano, la gráfica da la separación de su herramienta y se guarda con la calle', async () => {
    const usuario = userEvent.setup()
    render(<PantallaNiveles />)
    await agregarConjunto(usuario, 'Vereda izquierda', 'Vereda', VEREDA)
    await agregarConjunto(usuario, 'Base izquierda', 'Base', BASE)

    const izquierdo = within(screen.getByRole('region', { name: 'Lado izquierdo' }))
    expect(izquierdo.getByRole('status')).toHaveTextContent('✓ CUMPLE — separación mínima 19.0 cm (requerido ≥ 5.0 cm)')
    expect(izquierdo.getByRole('status')).toHaveTextContent('En 0+030')

    const guardada = useAlmacen.getState().proyecto.calles[0]!.niveles!
    expect(guardada.conjuntos.map((c) => [c.nombre, c.categoria])).toEqual([
      ['Vereda izquierda', 'Vereda'],
      ['Base izquierda', 'Base'],
    ])
  })

  it('con un mínimo mayor no cumple, y bajar la línea de abajo 1 cm lo arregla', async () => {
    const usuario = userEvent.setup()
    render(<PantallaNiveles />)
    await agregarConjunto(usuario, 'Vereda', 'Vereda', VEREDA)
    await agregarConjunto(usuario, 'Base', 'Base', BASE)
    const minimo = within(screen.getByRole('region', { name: 'Puestas del nivel' })).getByLabelText('Separación mínima entre líneas (cm)')
    await usuario.clear(minimo)
    await usuario.type(minimo, '19.5')
    const izquierdo = within(screen.getByRole('region', { name: 'Lado izquierdo' }))
    expect(izquierdo.getByRole('status')).toHaveTextContent('✗ NO CUMPLE — separación mínima 19.0 cm')
    await usuario.click(izquierdo.getByRole('button', { name: 'Bajar línea de abajo 1 cm' }))
    expect(izquierdo.getByRole('status')).toHaveTextContent('✓ CUMPLE — separación mínima 20.0 cm')
  })

  it('un replanteo 2 cm por debajo de la vereda: corte y relleno, y qué leer en la mira', async () => {
    const usuario = userEvent.setup()
    render(<PantallaNiveles />)
    await agregarConjunto(usuario, 'Vereda', 'Vereda', VEREDA)

    await usuario.click(screen.getByRole('button', { name: '+ Nuevo replanteo' }))
    const conjuntos = within(screen.getByRole('region', { name: 'Conjuntos de datos' }))
    const subir = conjuntos.getByLabelText('Subir (+) o bajar (−), cm')
    await usuario.clear(subir)
    await usuario.type(subir, '-2')
    await usuario.click(conjuntos.getByRole('button', { name: 'Crear el replanteo' }))
    expect(conjuntos.getByRole('button', { name: /Replanteo de Vereda · 5/ })).toHaveAttribute('aria-pressed', 'true')

    const izquierdo = within(screen.getByRole('region', { name: 'Lado izquierdo' }))
    await usuario.click(izquierdo.getByRole('button', { name: 'Corte y relleno' }))
    expect(izquierdo.getByLabelText('Lo que hay')).toHaveDisplayValue('Vereda (Vereda)')
    expect(izquierdo.getByLabelText('Lo que debe quedar (replanteo)')).toHaveDisplayValue('Replanteo de Vereda (Replanteo)')
    expect(izquierdo.getByRole('status')).toHaveTextContent('Mayor corte: 2.0 cm')

    // Nivel a registrar: el replanteo en la 0+010 es 100.240 − 0.020 = 100.220; la mira, 101.500 − 100.220.
    const registrar = within(screen.getByRole('region', { name: 'Nivel a registrar' }))
    expect(registrar.getByLabelText('Conjunto')).toHaveDisplayValue('Replanteo de Vereda (Replanteo)')
    await usuario.type(registrar.getByLabelText('Progresiva(s)'), '10')
    const lectura = registrar.getByRole('status', { name: 'Lectura a registrar' })
    expect(lectura).toHaveTextContent('En 0+010, cota100.220')
    expect(lectura).toHaveTextContent('La mira debe marcar1.280')
  })

  it('fuera de la línea proyecta desde la más cercana o extrapola, y lo dice', async () => {
    const usuario = userEvent.setup()
    render(<PantallaNiveles />)
    await agregarConjunto(usuario, 'Vereda', 'Vereda', VEREDA)
    const registrar = within(screen.getByRole('region', { name: 'Nivel a registrar' }))
    await usuario.type(registrar.getByLabelText('Progresiva(s)'), '50')
    // Último tramo: −0.10 %/m … 100.200 − 0.010 = 100.190; mira 1.310.
    const lectura = registrar.getByRole('status', { name: 'Lectura a registrar' })
    expect(lectura).toHaveTextContent('100.190')
    expect(lectura).toHaveTextContent('△ extrapolado')
    expect(lectura).toHaveTextContent('1.310')
  })

  it('una puesta nueva con otra lectura atrás mueve las cotas al pasarle los conjuntos', async () => {
    const usuario = userEvent.setup()
    render(<PantallaNiveles />)
    await agregarConjunto(usuario, 'Vereda', 'Vereda', VEREDA)
    const puestas = within(screen.getByRole('region', { name: 'Puestas del nivel' }))
    await usuario.click(puestas.getByRole('button', { name: '+ Nueva puesta' }))
    const atras = puestas.getByLabelText('Lectura atrás (m)')
    await usuario.clear(atras)
    await usuario.type(atras, '1.6')
    await usuario.click(puestas.getByRole('button', { name: 'Pasar todos los conjuntos a esta puesta' }))
    expect(puestas.getByText(/Pasó 1 conjunto a «Puesta 2» \(AI 101\.600\)/)).toBeInTheDocument()

    const registrar = within(screen.getByRole('region', { name: 'Nivel a registrar' }))
    await usuario.type(registrar.getByLabelText('Progresiva(s)'), '0')
    // 101.600 − 1.250 = 100.350
    expect(registrar.getByRole('status', { name: 'Lectura a registrar' })).toHaveTextContent('100.350')
  })

  it('enlaza una capa medida en la app: sigue a la libreta, no es una copia', async () => {
    const usuario = userEvent.setup()
    render(<PantallaNiveles />)
    await usuario.click(screen.getByRole('button', { name: 'Traer de lo medido' }))
    const conjuntos = within(screen.getByRole('region', { name: 'Conjuntos de datos' }))
    await usuario.selectOptions(conjuntos.getByLabelText('Capa medida'), 'cap-sub')
    await usuario.selectOptions(conjuntos.getByLabelText('Punto de la sección'), 'p-eje')
    await usuario.click(conjuntos.getByRole('button', { name: 'Enlazar 3 puntos de la libreta' }))
    const traido = useAlmacen.getState().proyecto.calles[0]!.niveles!.conjuntos[0]!
    expect(traido).toMatchObject({ nombre: 'SUBRASANTE · Eje', categoria: 'SUBRASANTE', tipo: 'medido', capaId: 'cap-sub', puntoId: 'p-eje' })
    // La subrasante compensada en el eje: 100.003, 99.973, 99.946.
    expect(conjuntos.getByText(/0: 100\.003 · 10: 99\.973 · 20: 99\.946/)).toBeInTheDocument()

    // Soltar el enlace lo vuelve cotas escritas, para corregirlas a mano.
    await usuario.click(conjuntos.getByRole('button', { name: 'Soltar el enlace y editar las cotas a mano' }))
    expect(useAlmacen.getState().proyecto.calles[0]!.niveles!.conjuntos[0]!).toMatchObject({ tipo: 'cota', texto: '0+000, 100.003\n0+010, 99.973\n0+020, 99.946' })
  })
})
