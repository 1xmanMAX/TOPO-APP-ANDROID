import type { Proyecto } from '@topo/core'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
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
    expect(screen.getByText(/Estación 1 · AI/)).toHaveTextContent('0+020 · Eje')
    // El circuito cerró: se dice con símbolo y palabras.
    expect(screen.getByText(/AI de la estación activa comprobada/)).toBeInTheDocument()
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
    expect(within(resultado('Lectura objetivo')).getByText('2.065 m')).toBeInTheDocument()

    // La mira marca 2.056: el punto está 9 mm alto, sobra material.
    const control = resultado('Lo que marca la mira')
    expect(within(control).getByText('Cortar 9 mm')).toBeInTheDocument()
    expect(within(control).getByText(/Conforme/)).toBeInTheDocument()

    const mira = screen.getByLabelText('Lectura en la mira')
    await usuario.clear(mira)
    await usuario.type(mira, '2.115')
    expect(within(resultado('Lo que marca la mira')).getByText('Rellenar 50 mm')).toBeInTheDocument()
    expect(within(resultado('Lo que marca la mira')).getByText(/Fuera de tolerancia/)).toBeInTheDocument()
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
    await usuario.click(within(resultado('Cota')).getByRole('button', { name: 'Copiar' }))
    expect(await navigator.clipboard.readText()).toBe('3244.549')
    expect(within(resultado('Cota')).getByText('Copiado: 3244.549')).toBeInTheDocument()
  })

  it('Guardar como nota la anota en la calle activa, en la progresiva elegida', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    const tarjeta = resultado('Cota')
    expect(within(tarjeta).getByLabelText('Progresiva de la nota')).toHaveValue('0+020')
    await usuario.clear(within(tarjeta).getByLabelText('Progresiva de la nota'))
    await usuario.type(within(tarjeta).getByLabelText('Progresiva de la nota'), '0+025')
    await usuario.click(within(tarjeta).getByRole('button', { name: 'Guardar como nota' }))

    const notas = notasDeLaCalle()
    expect(notas).toHaveLength(1)
    expect(notas[0]!.progresiva).toBe(25)
    expect(notas[0]!.texto).toMatch(/^Cota: 3244\.549 m/)
    expect(within(tarjeta).getByText('Nota guardada en 0+025.')).toBeInTheDocument()
  })

  it('sin calle activa no deja guardar notas, y sin estación pide los datos a mano', () => {
    useAlmacen.setState({ calleActivaId: null, campaniaActivaId: null, seleccion: { clave: null, progresiva: null } })
    render(<PanelCalculadora />)
    expect(screen.getByText('Sin estación activa: escriba los datos a mano.')).toBeInTheDocument()
    expect(screen.getByLabelText('Altura instrumental')).toHaveValue('')
    expect(within(resultado('Cota')).getByRole('button', { name: 'Guardar como nota' })).toBeDisabled()
  })

  it('Traer datos de la libreta vuelve a llenar con el punto seleccionado ahora', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    act(() => useAlmacen.setState({ seleccion: { clave: '40|p-eje', progresiva: 40 } }))
    await usuario.click(screen.getByRole('button', { name: 'Traer datos de la libreta' }))
    expect(screen.getByLabelText('Lectura')).toHaveValue('2.097')
    // La nota va a la progresiva traída, no a la de antes.
    expect(within(resultado('Cota')).getByLabelText('Progresiva de la nota')).toHaveValue('0+040')
    expect(screen.getByText(/Estación 1 · AI/)).toHaveTextContent('0+040 · Eje')
  })

  describe('con una nivelación sin cerrar', () => {
    beforeEach(() => prepararLibreta(libretaSinCerrar()))

    it('marca como no comprobado lo que sale de la libreta, y lo dice en la nota', async () => {
      const usuario = userEvent.setup()
      render(<PanelCalculadora />)
      expect(screen.getByText(/la nivelación todavía no cierra/)).toBeInTheDocument()
      expect(within(resultado('Cota')).getByText(/No comprobado/)).toBeInTheDocument()

      await usuario.click(within(resultado('Cota')).getByRole('button', { name: 'Guardar como nota' }))
      expect(notasDeLaCalle()[0]!.texto).toMatch(/no comprobado/)
    })

    it('deja de marcarlo si la AI y la lectura se escriben a mano', async () => {
      const usuario = userEvent.setup()
      render(<PanelCalculadora />)
      for (const campo of ['Altura instrumental', 'Lectura']) {
        await usuario.clear(screen.getByLabelText(campo))
        await usuario.type(screen.getByLabelText(campo), campo === 'Lectura' ? '1.5' : '100')
      }
      expect(within(resultado('Cota')).getByText('98.500 m')).toBeInTheDocument()
      expect(within(resultado('Cota')).queryByText(/No comprobado/)).not.toBeInTheDocument()
    })
  })

  describe('con la estación 2 activa', () => {
    beforeEach(() => {
      prepararLibreta()
      useAlmacen.setState({ estacionActiva: 1 })
    })

    it('la cota de un punto leído desde la estación 1 usa la AI de la estación 1', () => {
      render(<PanelCalculadora />)
      expect(screen.getByText(/Estación 2 · AI/)).toBeInTheDocument()
      expect(screen.getByLabelText('Altura instrumental')).toHaveValue('3246.605')
      expect(within(resultado('Cota')).getByText('3244.549 m')).toBeInTheDocument()
      expect(screen.getByText(/se tomó desde la estación 1/)).toBeInTheDocument()
    })

    it('en Lectura objetivo no junta la AI de la activa con una lectura de otra estación', async () => {
      const usuario = userEvent.setup()
      render(<PanelCalculadora />)
      await usuario.click(screen.getByRole('tab', { name: 'Lectura objetivo' }))
      expect(screen.getByLabelText('Altura instrumental')).not.toHaveValue('3246.605')
      expect(screen.getByLabelText('Lectura en la mira')).toHaveValue('')
      expect(screen.getByText(/es de la estación 1, no de la activa/)).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Resultado · Lo que marca la mira' })).not.toBeInTheDocument()
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
      expect(screen.getByText(/AI de la estación activa comprobada/)).toBeInTheDocument()
      expect(within(resultado('Cota')).getByText(/No comprobado/)).toBeInTheDocument()
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
    expect(screen.getByText(/Los datos son de 0\+020 Eje; ahora está seleccionado 0\+040 Eje/)).toBeInTheDocument()
    expect(screen.getByText(/Estación 1 · AI/)).toHaveTextContent('0+020 · Eje')
    expect(within(resultado('Cota')).getByLabelText('Progresiva de la nota')).toHaveValue('0+020')
  })

  it('el mensaje de Copiar se borra cuando cambia el resultado', async () => {
    const usuario = userEvent.setup()
    render(<PanelCalculadora />)
    await usuario.click(within(resultado('Cota')).getByRole('button', { name: 'Copiar' }))
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
    expect(within(resultado('Lo que marca la mira')).getByText(/no comprobada/)).toBeInTheDocument()
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
