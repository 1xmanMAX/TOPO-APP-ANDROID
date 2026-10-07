import type { Proyecto } from '@topo/core'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlmacen } from '../../estado/almacen'
import { proyectoEjemplo } from '../../estado/ejemplo'
import PanelCalculadora from './PanelCalculadora'

/**
 * El ejemplo con la libreta de terreno activa (camp-1): estación 1 con
 * AI 3246.605, y en 0+020 Eje una lectura de 2.056 contra una cota de
 * proyecto de 3244.540. El circuito cierra dentro de tolerancia.
 */
function prepararLibreta(proyecto: Proyecto = proyectoEjemplo()) {
  useAlmacen.getState().cargarProyecto(proyecto)
  useAlmacen.setState({
    calleActivaId: proyecto.calles[0]!.id,
    campaniaActivaId: 'camp-1',
    estacionActiva: 0,
    seleccion: { clave: '20|p-eje', progresiva: 20 },
    calculadoraAbierta: true,
  })
}

/** La misma libreta, pero sin cierre: todo lo que salga de ella queda sin comprobar. */
function libretaSinCerrar(): Proyecto {
  const proyecto = proyectoEjemplo()
  const toma = proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!
  toma.cierre = { ...toma.cierre, tipo: 'abierto' }
  return proyecto
}

function resultado(titulo: string) {
  return screen.getByRole('region', { name: `Resultado · ${titulo}` })
}

/** La fila entera de un casillero: su nombre, lo que dice debajo y el casillero. */
function fila(etiqueta: string) {
  return screen.getByLabelText(etiqueta).closest('label')!
}

/** La línea de debajo del título: «Con datos de Av. Sol · 0+020 · Eje · cambiar». */
function lineaDeDatos() {
  return screen.getByText(/Con datos de/, { selector: 'p' })
}

function notasDeLaCalle() {
  return useAlmacen.getState().proyecto.calles[0]!.notas ?? []
}

describe('PanelCalculadora', () => {
  beforeEach(() => prepararLibreta())

  it('muestra las seis pestañas, con Cota elegida', () => {
    render(<PanelCalculadora />)
    const pestanas = within(screen.getByRole('tablist', { name: 'Cálculos' })).getAllByRole('tab')
    expect(pestanas.map((p) => p.textContent)).toEqual([
      'Cota',
      'Lectura objetivo',
      'Pendiente',
      'Interpolar',
      'Volumen',
      'Conversión',
    ])
    expect(screen.getByRole('tab', { name: 'Cota' })).toHaveAttribute('aria-selected', 'true')
  })

  it('se abre llena con la AI de la estación activa y la lectura del punto seleccionado', () => {
    render(<PanelCalculadora />)
    expect(screen.getByLabelText('Altura instrumental')).toHaveValue('3246.605')
    expect(screen.getByLabelText('Lectura')).toHaveValue('2.056')
    expect(within(resultado('Cota')).getByText('3244.549 m')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Calcular' })).toBeInTheDocument()
    expect(lineaDeDatos()).toHaveTextContent(/^Con datos de .+ · 0\+020 · Eje · cambiar$/)
    // Nada que pulsar para traer los datos: ni la caja gris ni su botón.
    expect(screen.queryByRole('button', { name: 'Traer datos de la libreta' })).not.toBeInTheDocument()
    // El circuito cerró: se dice con símbolo y palabras al lado de la AI.
    expect(fila('Altura instrumental')).toHaveTextContent('Estación 1 · ✓ comprobada')
    expect(screen.queryByText(/No comprobado/)).not.toBeInTheDocument()
  })

  it('recalcula la cota al escribir otra lectura, y avisa si no cabe en la mira', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    const lectura = screen.getByLabelText('Lectura')
    await usuario.clear(lectura)
    await usuario.type(lectura, '1,605')
    expect(within(resultado('Cota')).getByText('3245.000 m')).toBeInTheDocument()

    await usuario.clear(lectura)
    await usuario.type(lectura, '19.02')
    expect(within(resultado('Cota')).getByText('—')).toBeInTheDocument()
    expect(within(resultado('Cota')).getByText(/no cabe en una mira de 5 m/)).toBeInTheDocument()
  })

  it('calcula la AI desde un punto conocido y la usa', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    await usuario.click(screen.getByText('Altura instrumental desde un punto conocido'))
    await usuario.type(screen.getByLabelText('Cota del punto conocido'), '3245.180')
    await usuario.type(screen.getByLabelText('Vista atrás'), '1.500')
    await usuario.click(screen.getByRole('button', { name: 'Usar esta altura instrumental' }))
    expect(screen.getByLabelText('Altura instrumental')).toHaveValue('3246.680')
  })

  it('lectura objetivo: AI − cota de proyecto, y con la lectura de la mira dice si corta o rellena', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    await usuario.click(screen.getByRole('tab', { name: 'Lectura objetivo' }))

    expect(screen.getByLabelText('Cota de proyecto')).toHaveValue('3244.540')
    // La mira marca 2.056: el punto está 9 mm alto, sobra material. Una
    // sola tarjeta: lo grande es el corte y el objetivo va como dato.
    const tarjeta = resultado('Lectura objetivo')
    expect(tarjeta.querySelector('output')).toHaveTextContent('Cortar 9 mm')
    expect(within(tarjeta).getByText('2.065 m')).toBeInTheDocument()
    expect(within(tarjeta).getByText(/Conforme/)).toBeInTheDocument()
    expect(within(tarjeta).getAllByRole('button', { name: 'Copiar resultado' })).toHaveLength(1)
    expect(screen.getAllByRole('region', { name: /^Resultado · / })).toHaveLength(1)

    const mira = screen.getByLabelText('Lectura en la mira')
    await usuario.clear(mira)
    await usuario.type(mira, '2.115')
    expect(within(resultado('Lectura objetivo')).getByText('Rellenar 50 mm')).toBeInTheDocument()
    expect(within(resultado('Lectura objetivo')).getByText(/Fuera de tolerancia/)).toBeInTheDocument()

    // Sin lectura de mira, lo grande vuelve a ser el objetivo.
    await usuario.clear(mira)
    expect(resultado('Lectura objetivo').querySelector('output')).toHaveTextContent('2.065 m')
  })

  it('la nota de la lectura objetivo con mira lleva el objetivo, la mira y el corte', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    await usuario.click(screen.getByRole('tab', { name: 'Lectura objetivo' }))
    await usuario.click(within(resultado('Lectura objetivo')).getByRole('button', { name: 'Guardar como nota' }))
    expect(notasDeLaCalle()[0]!.texto).toMatch(/^Lectura objetivo 2.065 m, mira 2.056 m: Cortar 9 mm/)
  })

  it('pendiente prellenada con el mismo punto en la progresiva anterior', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    await usuario.click(screen.getByRole('tab', { name: 'Pendiente' }))
    expect(screen.getByLabelText('Distancia')).toHaveValue('20')
    expect(within(resultado('Pendiente')).getByText(/^−0\.2\d %$/)).toBeInTheDocument()

    await usuario.clear(screen.getByLabelText('Cota inicial'))
    await usuario.type(screen.getByLabelText('Cota inicial'), '100')
    await usuario.clear(screen.getByLabelText('Cota final'))
    await usuario.type(screen.getByLabelText('Cota final'), '100.5')
    await usuario.clear(screen.getByLabelText('Distancia'))
    await usuario.type(screen.getByLabelText('Distancia'), '20')
    expect(within(resultado('Pendiente')).getByText('+2.50 %')).toBeInTheDocument()
    expect(within(resultado('Pendiente')).getByText(/Sube · desnivel \+0\.500 m · \+25\.0 ‰/)).toBeInTheDocument()
  })

  it('interpola entre las progresivas vecinas y avisa cuando extrapola', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    await usuario.click(screen.getByRole('tab', { name: 'Interpolar' }))
    expect(screen.getByLabelText('Progresiva A')).toHaveValue('0')
    expect(screen.getByLabelText('Progresiva B')).toHaveValue('40')
    expect(screen.getByLabelText('Progresiva buscada')).toHaveValue('20')

    for (const [campo, valor] of [
      ['Cota A', '100'],
      ['Cota B', '102'],
      ['Progresiva buscada', '0+050'],
    ] as const) {
      await usuario.clear(screen.getByLabelText(campo))
      await usuario.type(screen.getByLabelText(campo), valor)
    }
    expect(within(resultado('Cota interpolada')).getByText('102.500 m')).toBeInTheDocument()
    expect(within(resultado('Cota interpolada')).getByText(/extrapolación/)).toBeInTheDocument()
  })

  it('volumen por áreas medias', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    await usuario.click(screen.getByRole('tab', { name: 'Volumen' }))
    await usuario.type(screen.getByLabelText('Área inicial'), '2')
    await usuario.type(screen.getByLabelText('Área final'), '3')
    await usuario.type(screen.getByLabelText('Distancia entre secciones'), '20')
    expect(within(resultado('Volumen')).getByText('50.000 m³')).toBeInTheDocument()
  })

  it('convierte una pendiente entre porcentaje, grados y relación', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    await usuario.click(screen.getByRole('tab', { name: 'Conversión' }))
    await usuario.type(screen.getByLabelText('Pendiente a convertir'), '2')
    expect(within(resultado('Conversión')).getByText('+2.000 % = +1.146° = 1:50')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Relación 1:n' }))
    await usuario.clear(screen.getByLabelText('Pendiente a convertir'))
    await usuario.type(screen.getByLabelText('Pendiente a convertir'), '1:4')
    expect(within(resultado('Conversión')).getByText('+25.000 % = +14.036° = 1:4')).toBeInTheDocument()
  })

  it('lo escrito en una pestaña sigue ahí al volver', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    await usuario.click(screen.getByRole('tab', { name: 'Volumen' }))
    await usuario.type(screen.getByLabelText('Área inicial'), '7')
    await usuario.click(screen.getByRole('tab', { name: 'Cota' }))
    await usuario.click(screen.getByRole('tab', { name: 'Volumen' }))
    expect(screen.getByLabelText('Área inicial')).toHaveValue('7')
  })

  it('Copiar pone el número solo en el portapapeles', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    await usuario.click(within(resultado('Cota')).getByRole('button', { name: 'Copiar resultado' }))
    expect(await navigator.clipboard.readText()).toBe('3244.549')
    expect(within(resultado('Cota')).getByText('Copiado: 3244.549')).toBeInTheDocument()
  })

  it('Guardar como nota la anota en la calle activa, en la progresiva del punto elegido, sin preguntarla', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    const tarjeta = resultado('Cota')
    expect(within(tarjeta).queryByLabelText('Progresiva de la nota')).not.toBeInTheDocument()
    await usuario.click(within(tarjeta).getByRole('button', { name: 'Guardar como nota' }))

    const notas = notasDeLaCalle()
    expect(notas).toHaveLength(1)
    expect(notas[0]!.progresiva).toBe(20)
    expect(notas[0]!.texto).toMatch(/^Cota: 3244\.549 m/)
    expect(within(tarjeta).getByText('Nota guardada en 0+020.')).toBeInTheDocument()
  })

  it('sin punto elegido, la progresiva de la nota se pide solo al pulsar «Guardar como nota»', async () => {
    const usuario = userEvent.setup()
    useAlmacen.setState({ seleccion: { clave: null, progresiva: null } })
    render(<PanelCalculadora />)
    await usuario.type(screen.getByLabelText('Lectura'), '1.605')
    const tarjeta = resultado('Cota')
    expect(within(tarjeta).queryByLabelText('Progresiva de la nota')).not.toBeInTheDocument()
    await usuario.click(within(tarjeta).getByRole('button', { name: 'Guardar como nota' }))
    expect(notasDeLaCalle()).toHaveLength(0)
    const campo = within(tarjeta).getByLabelText('Progresiva de la nota')
    expect(campo).toHaveFocus()
    await usuario.type(campo, '0+025')
    await usuario.click(within(tarjeta).getByRole('button', { name: 'Guardar como nota' }))
    expect(notasDeLaCalle()[0]!.progresiva).toBe(25)
    expect(within(tarjeta).getByText('Nota guardada en 0+025.')).toBeInTheDocument()
    expect(within(tarjeta).queryByLabelText('Progresiva de la nota')).not.toBeInTheDocument()
  })

  it('sin resultado no ofrece copiar ni guardar', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    await usuario.clear(screen.getByLabelText('Lectura'))
    const tarjeta = within(resultado('Cota'))
    expect(tarjeta.getByText('—')).toBeInTheDocument()
    expect(tarjeta.queryByRole('button', { name: 'Copiar resultado' })).not.toBeInTheDocument()
    expect(tarjeta.queryByRole('button', { name: 'Guardar como nota' })).not.toBeInTheDocument()
  })

  it('sin calle activa no deja guardar notas, y sin estación pide los datos a mano', async () => {
    const usuario = userEvent.setup()
    useAlmacen.setState({ calleActivaId: null, campaniaActivaId: null, seleccion: { clave: null, progresiva: null } })
    render(<PanelCalculadora />)
    expect(screen.getByText('Sin estación activa: escriba los datos a mano.')).toBeInTheDocument()
    expect(screen.getByLabelText('Altura instrumental')).toHaveValue('')
    await usuario.type(screen.getByLabelText('Altura instrumental'), '100')
    await usuario.type(screen.getByLabelText('Lectura'), '1.5')
    expect(within(resultado('Cota')).getByRole('button', { name: 'Guardar como nota' })).toBeDisabled()
    expect(within(resultado('Cota')).getByText('Elija una calle para poder guardar notas.')).toBeInTheDocument()
  })

  it('«cambiar» vuelve a llenar con el punto elegido ahora', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    act(() => useAlmacen.setState({ seleccion: { clave: '40|p-eje', progresiva: 40 } }))
    await usuario.click(screen.getByRole('button', { name: 'cambiar' }))
    expect(screen.getByLabelText('Lectura')).toHaveValue('2.097')
    expect(lineaDeDatos()).toHaveTextContent(/^Con datos de .+ · 0\+040 · Eje · cambiar$/)
    // La nota va a la progresiva traída, no a la de antes.
    await usuario.click(within(resultado('Cota')).getByRole('button', { name: 'Guardar como nota' }))
    expect(notasDeLaCalle()[0]!.progresiva).toBe(40)
  })

  describe('con una nivelación sin cerrar', () => {
    beforeEach(() => prepararLibreta(libretaSinCerrar()))

    it('marca como no comprobado lo que sale de la libreta, y lo dice en la nota', async () => {
      const usuario = userEvent.setup()
      render(<PanelCalculadora />)
      expect(fila('Altura instrumental')).toHaveTextContent('Estación 1 · △ sin comprobar')
      expect(within(resultado('Cota')).getByText(/No comprobado/)).toBeInTheDocument()

      await usuario.click(within(resultado('Cota')).getByRole('button', { name: 'Guardar como nota' }))
      expect(notasDeLaCalle()[0]!.texto).toMatch(/no comprobado/)
    })

    it('si la AI se escribe a mano sigue sin comprobar, pero dice que es por la AI a mano', async () => {
      const usuario = userEvent.setup()
      render(<PanelCalculadora />)
      for (const campo of ['Altura instrumental', 'Lectura']) {
        await usuario.clear(screen.getByLabelText(campo))
        await usuario.type(screen.getByLabelText(campo), campo === 'Lectura' ? '1.5' : '100')
      }
      const cota = within(resultado('Cota'))
      expect(cota.getByText('98.500 m')).toBeInTheDocument()
      expect(cota.getByText(/No comprobado: AI escrita a mano/)).toBeInTheDocument()
      expect(cota.queryByText(/datos de la libreta/)).not.toBeInTheDocument()
    })
  })

  describe('con la estación 2 activa', () => {
    beforeEach(() => {
      prepararLibreta()
      useAlmacen.setState({ estacionActiva: 1 })
    })

    it('la cota de un punto leído desde la estación 1 usa la AI de la estación 1', () => {
      render(<PanelCalculadora />)
      expect(screen.getByLabelText('Altura instrumental')).toHaveValue('3246.605')
      expect(within(resultado('Cota')).getByText('3244.549 m')).toBeInTheDocument()
      expect(fila('Altura instrumental')).toHaveTextContent('Estación 1, la que leyó el punto · ✓ comprobada')
    })

    it('en Lectura objetivo no junta la AI de la activa con una lectura de otra estación', async () => {
      const usuario = userEvent.setup()
      render(<PanelCalculadora />)
      await usuario.click(screen.getByRole('tab', { name: 'Lectura objetivo' }))
      expect(screen.getByLabelText('Altura instrumental')).not.toHaveValue('3246.605')
      expect(screen.getByLabelText('Lectura en la mira')).toHaveValue('')
      expect(screen.getByText(/es de la estación 1, no de la activa/)).toBeInTheDocument()
      expect(within(resultado('Lectura objetivo')).queryByText(/Cortar|Rellenar/)).not.toBeInTheDocument()
    })
  })

  describe('con un circuito nuevo que arranca de BM en la estación 2', () => {
    /**
     * La estación 1 remata en el BM y la 2 vuelve a salir de él: el cierre
     * respalda solo la estación 2, y lo leído desde la 1 no está comprobado.
     */
    function dosCircuitos(): Proyecto {
      const proyecto = proyectoEjemplo()
      const toma = proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!
      const [e1, e2] = toma.estaciones
      e1!.vistaAdelante = { id: 'l-4', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.15 }
      e2!.vistaAtras = { id: 'l-5', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.91 }
      return proyecto
    }

    beforeEach(() => {
      prepararLibreta(dosCircuitos())
      useAlmacen.setState({ estacionActiva: 1, seleccion: { clave: '40|p-eje', progresiva: 40 } })
    })

    it('marca como no comprobada la cota leída antes del último circuito, aunque la AI activa sí lo esté', async () => {
      const usuario = userEvent.setup()
      render(<PanelCalculadora />)
      expect(fila('Altura instrumental')).toHaveTextContent('Estación 1, la que leyó el punto · △ sin comprobar')
      expect(within(resultado('Cota')).getByText(/No comprobado/)).toBeInTheDocument()
      await usuario.click(screen.getByRole('tab', { name: 'Lectura objetivo' }))
      expect(fila('Altura instrumental')).toHaveTextContent('Estación 2 · ✓ comprobada')
      await usuario.click(screen.getByRole('tab', { name: 'Pendiente' }))
      expect(within(resultado('Pendiente')).getByText(/No comprobado/)).toBeInTheDocument()
    })

    it('una pendiente entre dos cotas del circuito comprobado no se marca', async () => {
      const usuario = userEvent.setup()
      useAlmacen.setState({ seleccion: { clave: '80|p-eje', progresiva: 80 } })
      render(<PanelCalculadora />)
      await usuario.click(screen.getByRole('tab', { name: 'Pendiente' }))
      expect(screen.getByLabelText('Distancia')).toHaveValue('20')
      expect(within(resultado('Pendiente')).queryByText(/No comprobado/)).not.toBeInTheDocument()
    })
  })

  it('si cambia el punto seleccionado lo avisa, sin mezclar los casilleros', () => {
    render(<PanelCalculadora />)
    act(() => useAlmacen.setState({ seleccion: { clave: '40|p-eje', progresiva: 40 } }))
    expect(lineaDeDatos()).toHaveTextContent(/Con datos de .+ · 0\+020 · Eje · ahora tienes 0\+040 · Eje elegido · cambiar$/)
    expect(screen.getByLabelText('Lectura')).toHaveValue('2.056')
  })

  it('si cambia la estación activa en el mismo punto, lo dice así', () => {
    render(<PanelCalculadora />)
    act(() => useAlmacen.setState({ estacionActiva: 1 }))
    // El punto se sigue viendo: ahí caería una nota.
    expect(lineaDeDatos()).toHaveTextContent(
      /Con datos de .+ · 0\+020 · Eje · estación 1 · ahora tienes la estación 2 activa · cambiar$/,
    )
  })

  it('el mensaje de Copiar se borra cuando cambia el resultado', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    await usuario.click(within(resultado('Cota')).getByRole('button', { name: 'Copiar resultado' }))
    expect(within(resultado('Cota')).getByText('Copiado: 3244.549')).toBeInTheDocument()
    await usuario.clear(screen.getByLabelText('Lectura'))
    await usuario.type(screen.getByLabelText('Lectura'), '1.5')
    expect(within(resultado('Cota')).queryByText(/Copiado/)).not.toBeInTheDocument()
  })

  it('las pestañas se recorren con las flechas, Inicio y Fin', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    const cota = screen.getByRole('tab', { name: 'Cota' })
    expect(cota).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Pendiente' })).toHaveAttribute('tabindex', '-1')
    cota.focus()
    await usuario.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Lectura objetivo' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Lectura objetivo' })).toHaveAttribute('aria-selected', 'true')
    await usuario.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Conversión' })).toHaveFocus()
    await usuario.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Cota' })).toHaveFocus()
    await usuario.keyboard('{ArrowLeft}{Home}')
    expect(screen.getByRole('tab', { name: 'Cota' })).toHaveAttribute('aria-selected', 'true')
  })

  it('una AI escrita a mano en Lectura objetivo se dice no comprobada', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    await usuario.click(screen.getByRole('tab', { name: 'Lectura objetivo' }))
    const ai = screen.getByLabelText('Altura instrumental')
    await usuario.clear(ai)
    await usuario.type(ai, '3246.606')
    const control = within(resultado('Lectura objetivo'))
    // Un solo «no comprobado», aunque la tarjeta diga corte y objetivo.
    expect(control.getAllByText(/No comprobado/)).toHaveLength(1)
    // La libreta de este ejemplo SÍ cierra: lo que no está respaldado es la AI
    // escrita a mano, y eso es lo que se dice (no «nivelación sin cerrar»).
    expect(control.getByText(/escrita a mano/)).toBeInTheDocument()
    expect(control.queryByText(/nivelación sin cerrar/)).not.toBeInTheDocument()
    // Y la lectura objetivo misma, que va en la misma tarjeta, también: no
    // basta con no llevar el ✓ al lado de la AI.
    expect(control.getByText('2.066 m')).toBeInTheDocument()
    expect(control.getByText(/No comprobado: AI escrita a mano/)).toBeInTheDocument()
    expect(fila('Altura instrumental')).toHaveTextContent('Escrita a mano')
    expect(fila('Altura instrumental')).not.toHaveTextContent('✓')
  })

  it('la AI sacada de un punto conocido marca la cota como no comprobada, también en la nota', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    expect(within(resultado('Cota')).queryByText(/No comprobado/)).not.toBeInTheDocument()
    await usuario.click(screen.getByText('Altura instrumental desde un punto conocido'))
    await usuario.type(screen.getByLabelText('Cota del punto conocido'), '3245.180')
    await usuario.type(screen.getByLabelText('Vista atrás'), '1.500')
    await usuario.click(screen.getByRole('button', { name: 'Usar esta altura instrumental' }))
    const cota = within(resultado('Cota'))
    expect(cota.getByText('3244.624 m')).toBeInTheDocument()
    expect(cota.getByText(/No comprobado: AI escrita a mano o sacada de un punto conocido/)).toBeInTheDocument()
    await usuario.click(cota.getByRole('button', { name: 'Guardar como nota' }))
    expect(notasDeLaCalle()[0]!.texto).toMatch(/no comprobado, AI escrita a mano/)
    // En Lectura objetivo pasa lo mismo: la AI llegó de un punto conocido.
    await usuario.click(screen.getByRole('tab', { name: 'Lectura objetivo' }))
    expect(within(resultado('Lectura objetivo')).getByText(/No comprobado: AI escrita a mano/)).toBeInTheDocument()
  })

  it('una lectura nueva con la AI comprobada de la libreta no se marca', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    await usuario.clear(screen.getByLabelText('Lectura'))
    await usuario.type(screen.getByLabelText('Lectura'), '1.605')
    expect(within(resultado('Cota')).getByText('3245.000 m')).toBeInTheDocument()
    expect(within(resultado('Cota')).queryByText(/No comprobado/)).not.toBeInTheDocument()
  })

  it('el corte/relleno sale justo debajo de los casilleros, en la única tarjeta', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    await usuario.click(screen.getByRole('tab', { name: 'Lectura objetivo' }))
    const mira = screen.getByLabelText('Lectura en la mira')
    const control = resultado('Lectura objetivo')
    // En el celular el teclado tapa lo que queda abajo: el resultado va
    // pegado a los casilleros.
    expect(mira.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByLabelText('Tolerancia').compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Con la AI de la libreta y una nivelación que cerró, se dice que la cota
    // no reparte el error de cierre (Revisar sí lo reparte).
    expect(within(control).getByText(/sin repartir el error de cierre/)).toBeInTheDocument()
  })

  describe('en el celular', () => {
    const subir = vi.fn()
    beforeEach(() => {
      subir.mockClear()
      vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: consulta.includes('max-width'), media: consulta }))
      Element.prototype.scrollIntoView = subir
    })
    afterEach(() => {
      vi.unstubAllGlobals()
      // jsdom no trae scrollIntoView: se quita para no dejarlo a otras pruebas.
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    })

    it('al tocar la lectura en la mira sube su casillero, para que el resultado quede sobre el teclado', async () => {
      const usuario = userEvent.setup()
      render(<PanelCalculadora />)
      await usuario.click(screen.getByRole('tab', { name: 'Lectura objetivo' }))
      expect(subir).not.toHaveBeenCalled()
      await usuario.click(screen.getByLabelText('Lectura en la mira'))
      expect(subir).toHaveBeenCalledWith({ block: 'start' })
      expect(subir.mock.contexts.at(-1)).toBe(screen.getByLabelText('Lectura en la mira').closest('label'))
      // La AI no tiene nada suyo debajo que el teclado tape: no se mueve.
      subir.mockClear()
      await usuario.click(screen.getByLabelText('Altura instrumental'))
      expect(subir).not.toHaveBeenCalled()
    })
  })

  it('sin rasante, Lectura objetivo pide la cota de proyecto', async () => {
    const usuario = userEvent.setup()
    const proyecto = proyectoEjemplo()
    proyecto.calles[0]!.rasante = null
    prepararLibreta(proyecto)
    render(<PanelCalculadora />)
    await usuario.click(screen.getByRole('tab', { name: 'Lectura objetivo' }))
    expect(screen.getByLabelText('Cota de proyecto')).toHaveValue('')
    expect(within(resultado('Lectura objetivo')).getByText(/Escriba la altura instrumental y la cota de proyecto/)).toBeInTheDocument()
  })

  it('con una estación activa que no existe pide los datos a mano', () => {
    useAlmacen.setState({ estacionActiva: 99, seleccion: { clave: null, progresiva: null } })
    render(<PanelCalculadora />)
    expect(screen.getByText('Sin estación activa: escriba los datos a mano.')).toBeInTheDocument()
    expect(screen.getByLabelText('Altura instrumental')).toHaveValue('')
  })
})
