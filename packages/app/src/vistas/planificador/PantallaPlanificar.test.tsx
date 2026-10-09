import type { Proyecto } from '@topo/core'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../../estado/almacen'
import { usePlanificador } from './almacenPlanificador'
import { obraEmpinada } from './obraDePrueba'
import PantallaPlanificar from './PantallaPlanificar'

const estado = () => useAlmacen.getState()
const calle = () => estado().proyecto.calles[0]!

beforeEach(() => {
  estado().cargarProyecto(obraEmpinada())
  estado().activarCalle('c-empinada')
  useAlmacen.setState({ espacio: 'calle', pantallaCalle: 'planificar' })
  usePlanificador.getState().olvidar()
})

/** La calle empinada sin rasante: ni rasante ni pista de donde sacar el perfil. */
function obraSinPerfil(): Proyecto {
  const p = obraEmpinada()
  return { ...p, calles: [{ ...p.calles[0]!, rasante: null }] }
}

/** Un DXF mínimo con textos de cota sobre el eje y = 0 (cada unidad, un metro). */
function dxfConCotas(cotas: [number, number][]): Uint8Array {
  const texto = ([x, v]: [number, number]) => `0\nTEXT\n8\nCOTAS\n10\n${x}\n20\n2\n30\n0\n40\n1\n1\n${v.toFixed(2)}\n`
  return new TextEncoder().encode(`0\nSECTION\n2\nENTITIES\n${cotas.map(texto).join('')}0\nENDSEC\n0\nEOF\n`)
}

/** La calle sin rasante, con su pista sobre un plano DXF; calibrado o no. */
function obraConPlano(calibrado: boolean): [Proyecto, Record<string, Uint8Array>] {
  const p = obraSinPerfil()
  return [
    {
      ...p,
      planos: [
        {
          id: 'plano-1',
          nombre: 'Plano de la obra',
          formato: 'dxf',
          calibracion: calibrado ? { metrosPorUnidad: 1 } : null,
        },
      ],
      pistas: [
        {
          id: 'pista-1',
          nombre: 'Pasaje Empinado',
          planoId: 'plano-1',
          polilinea: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
          calleId: 'c-empinada',
          origen: 'dxf',
        },
      ],
    },
    {
      'plano-1': dxfConCotas([
        [0, 3200],
        [50, 3206],
        [100, 3208],
      ]),
    },
  ]
}

describe('PantallaPlanificar', () => {
  it('planifica la calle desde su rasante: dibujo, estaciones, controles y tramos', () => {
    render(<PantallaPlanificar />)

    expect(screen.getByRole('heading', { name: 'Planificar' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'De dónde sale el perfil' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Rasante' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Cotas del plano' })).toBeDisabled()

    expect(screen.getByRole('img', { name: /Escala vertical exagerada/ })).toBeInTheDocument()
    expect(screen.getByText(/Escala vertical exagerada ×/)).toBeInTheDocument()

    const filas = within(screen.getByRole('table', { name: 'Estaciones del plan' })).getAllByRole('row')
    expect(filas.length).toBeGreaterThan(2)
    // Al centímetro: la lectura sale del perfil, no de la mira.
    expect(within(filas[1]!).getByText(/Control 1 \(0\+000\) ≈ \d+\.\d{2} m$/)).toBeInTheDocument()

    const controles = within(screen.getByRole('list', { name: 'Puntos de control' }))
    expect(controles.getByText('inicio de la pista')).toBeInTheDocument()
    expect(controles.getByText('fin de la pista')).toBeInTheDocument()
    expect(controles.getAllByText(/sin comprobar/).length).toBeGreaterThan(0)

    const tramos = within(screen.getByRole('list', { name: 'Tramos entre controles' }))
    expect(tramos.getAllByText(/Error esperado ida y vuelta/).length).toBeGreaterThan(0)
    expect(tramos.getAllByText(/^(Cumple|No cumple|No se puede mejorar \(una estación\))$/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Sin comprobar: las cotas de los controles/)).toBeInTheDocument()
  })

  it('con 12 % de pendiente y 4 cambios por tramo hacen falta controles intermedios', () => {
    render(<PantallaPlanificar />)
    const controles = within(screen.getByRole('list', { name: 'Puntos de control' }))
    expect(controles.getAllByText(/para no pasar de 4 cambios/).length).toBeGreaterThan(0)
  })

  it('las reglas del nivel se guardan en el instrumento de la obra', async () => {
    const usuario = userEvent.setup()
    render(<PantallaPlanificar />)

    const mira = screen.getByRole('textbox', { name: 'Largo de la mira' })
    expect(mira).toHaveValue('5.00')
    await usuario.clear(mira)
    await usuario.type(mira, '4{Enter}')
    expect(estado().proyecto.instrumento).toEqual({ largoMira: 4 })

    const cambios = screen.getByRole('textbox', {
      name: 'Máx. cambios por tramo',
    })
    await usuario.clear(cambios)
    await usuario.type(cambios, '2{Enter}')
    expect(estado().proyecto.instrumento).toMatchObject({
      maxCambiosPorTramo: 2,
    })
    expect(screen.getAllByText(/para no pasar de 2 cambios/).length).toBeGreaterThan(0)
  })

  it('una regla absurda, en cero o negativa no se guarda y se dice junto al campo', async () => {
    const usuario = userEvent.setup()
    render(<PantallaPlanificar />)

    const mira = screen.getByRole('textbox', { name: 'Largo de la mira' })
    await usuario.clear(mira)
    await usuario.type(mira, '50{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent(/Largo de la mira: tiene que estar entre 1 y 10.*No se guardó/)
    expect(estado().proyecto.instrumento).toBeUndefined()

    await usuario.clear(mira)
    await usuario.type(mira, '0{Enter}')
    expect(estado().proyecto.instrumento).toBeUndefined()

    const visual = screen.getByRole('textbox', { name: 'Visual máxima' })
    await usuario.clear(visual)
    await usuario.type(visual, '-20{Enter}')
    expect(estado().proyecto.instrumento).toBeUndefined()
    expect(screen.getAllByRole('alert').some((a) => /Visual máxima/.test(a.textContent ?? ''))).toBe(true)

    const cambios = screen.getByRole('textbox', {
      name: 'Máx. cambios por tramo',
    })
    await usuario.clear(cambios)
    await usuario.type(cambios, '2.5{Enter}')
    expect(estado().proyecto.instrumento).toBeUndefined()

    // Un valor bueno guarda y borra su error.
    await usuario.clear(mira)
    await usuario.type(mira, '4{Enter}')
    expect(estado().proyecto.instrumento).toEqual({ largoMira: 4 })
    expect(screen.getAllByRole('alert').some((a) => /Largo de la mira/.test(a.textContent ?? ''))).toBe(false)
  })

  it('«Guardar en la calle» deja los controles en la calle, y se quitan solo confirmando', async () => {
    const usuario = userEvent.setup()
    render(<PantallaPlanificar />)

    expect(screen.getByText('Todavía no se guardó en la calle.')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Guardar en la calle' }))

    const guardado = calle().planControles!
    expect(guardado.controles[0]).toMatchObject({ progresiva: 0, cota: 3200 })
    expect(guardado.controles.at(-1)).toMatchObject({
      progresiva: 100,
      cota: 3212,
    })
    expect(guardado.controles[0]!.motivos[0]!.tipo).toBe('inicio')
    expect(guardado.opciones).toMatchObject({
      largoMira: 5,
      maxCambiosPorTramo: 4,
    })
    expect(screen.getByText(/Guardado en la calle/)).toBeInTheDocument()

    // Cambiar una regla deja el plan guardado desfasado: se dice qué cambió y no se empuja a pisarlo.
    act(() => estado().fijarInstrumento({ visualMax: 30 }))
    expect(await screen.findByText(/La calle guarda otro plan/)).toHaveTextContent(/cambiaron las reglas del nivel/)
    expect(screen.getByText(/Si ya clavaste sus estacas, no lo reemplaces/)).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Quitar el plan guardado' }))
    const confirmar = screen.getByRole('group', {
      name: 'Confirmar quitar el plan',
    })
    expect(confirmar).toHaveTextContent(/¿Quitar los \d+ controles guardados de la calle\?/)
    await usuario.click(within(confirmar).getByRole('button', { name: 'Cancelar' }))
    expect(calle().planControles).not.toBeNull()

    await usuario.click(screen.getByRole('button', { name: 'Quitar el plan guardado' }))
    await usuario.click(screen.getByRole('button', { name: 'Sí, quitar' }))
    expect(calle().planControles).toBeNull()
  })

  it('si cambian los controles, dice cuál se movió respecto de lo guardado', async () => {
    const usuario = userEvent.setup()
    render(<PantallaPlanificar />)
    await usuario.click(screen.getByRole('button', { name: 'Guardar en la calle' }))

    const hasta = screen.getByRole('textbox', { name: 'Hasta (m)' })
    await usuario.clear(hasta)
    await usuario.type(hasta, '80{Enter}')
    expect(screen.getByText(/La calle guarda otro plan/)).toHaveTextContent(/C\d estaba en 0\+\d{3}, ahora 0\+\d{3}/)
  })

  it('un perfil digitado con quiebre pone un control en el quiebre, con su porqué', async () => {
    const usuario = userEvent.setup()
    render(<PantallaPlanificar />)

    await usuario.click(screen.getByRole('radio', { name: 'Digitado' }))
    expect(screen.getByRole('radio', { name: 'Digitado' })).toBeChecked()
    // Copia el perfil de la rasante para empezar.
    expect(screen.getByRole('textbox', { name: 'Cota del vértice 2' })).toHaveValue('3212.000')

    await usuario.click(screen.getByRole('button', { name: 'Agregar vértice' }))
    const cota3 = screen.getByRole('textbox', { name: 'Cota del vértice 3' })
    await usuario.clear(cota3)
    await usuario.type(cota3, '3213{Enter}')

    const controles = within(screen.getByRole('list', { name: 'Puntos de control' }))
    expect(controles.getByText(/quiebre de pendiente: de \+12/)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Pendientes del perfil' }).children).toHaveLength(2)
  })

  it('Digitado → Rasante → Digitado conserva los vértices escritos', async () => {
    const usuario = userEvent.setup()
    render(<PantallaPlanificar />)

    await usuario.click(screen.getByRole('radio', { name: 'Digitado' }))
    for (let i = 0; i < 4; i++) await usuario.click(screen.getByRole('button', { name: 'Agregar vértice' }))
    const cota6 = screen.getByRole('textbox', { name: 'Cota del vértice 6' })
    await usuario.clear(cota6)
    await usuario.type(cota6, '3215{Enter}')
    // Los vértices escritos van al proyecto (viajan en el .topo), no solo al navegador.
    const perfilDe = () => useAlmacen.getState().proyecto.calles.find((c) => c.id === 'c-empinada')!.perfilDigitado
    const escritos = perfilDe()
    expect(escritos).toHaveLength(6)

    await usuario.click(screen.getByRole('radio', { name: 'Rasante' }))
    expect(screen.queryByRole('list', { name: 'Vértices del perfil' })).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('radio', { name: 'Digitado' }))

    expect(within(screen.getByRole('list', { name: 'Vértices del perfil' })).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByRole('textbox', { name: 'Cota del vértice 6' })).toHaveValue('3215.000')
    expect(perfilDe()).toEqual(escritos)
  })

  it('un perfil que no avanza se dice y no se planifica', async () => {
    const usuario = userEvent.setup()
    render(<PantallaPlanificar />)

    await usuario.click(screen.getByRole('radio', { name: 'Digitado' }))
    const prog2 = screen.getByRole('textbox', {
      name: 'Progresiva del vértice 2',
    })
    await usuario.clear(prog2)
    await usuario.type(prog2, '0{Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent(/no avanza/)
    expect(screen.queryByRole('table', { name: 'Estaciones del plan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar en la calle' })).not.toBeInTheDocument()
  })

  it('sin rasante ni pista no inventa un perfil: da un ejemplo para editar y no planifica', async () => {
    estado().cargarProyecto(obraSinPerfil())
    estado().activarCalle('c-empinada')
    const usuario = userEvent.setup()
    render(<PantallaPlanificar />)

    expect(screen.getByRole('radio', { name: 'Digitado' })).toBeChecked()
    expect(screen.getByText(/Estos vértices son de ejemplo/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/perfil de ejemplo/)
    expect(screen.queryByRole('table', { name: 'Estaciones del plan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar en la calle' })).not.toBeInTheDocument()

    // Al escribir una cota, el perfil ya es de la pista y se planifica.
    const cota2 = screen.getByRole('textbox', { name: 'Cota del vértice 2' })
    await usuario.clear(cota2)
    await usuario.type(cota2, '104{Enter}')
    expect(screen.queryByText(/Estos vértices son de ejemplo/)).not.toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Estaciones del plan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar en la calle' })).toBeEnabled()
  })

  it('con un plan imposible lo dice y no muestra listas vacías', () => {
    // Con 0.50 m de mira no queda nada legible: el motor no arma ningún tramo.
    estado().fijarInstrumento({ largoMira: 0.5 })
    render(<PantallaPlanificar />)
    expect(screen.getByText(/No se puede nivelar con estas reglas/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Puntos de control' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tramos entre controles' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar en la calle' })).not.toBeInTheDocument()
  })

  it('un tramo de una sola estación que no alcanza no se pinta como que cumple', () => {
    // Escalinata: dos quiebres a 4 m uno del otro dejan un tramo de una estación.
    usePlanificador.getState().cambiar('c-empinada', {
      fuente: 'digitado',
      digitados: [
        { progresiva: 0, cota: 3200 },
        { progresiva: 40, cota: 3204.8 },
        { progresiva: 44, cota: 3205.6 },
        { progresiva: 100, cota: 3208 },
      ],
    })
    render(<PantallaPlanificar />)
    const tramos = within(screen.getByRole('list', { name: 'Tramos entre controles' }))
    const corto = tramos.getByText(/Tramo \d+: 0\+040 a 0\+044/).closest('li')!
    expect(corto).toHaveTextContent('No se puede mejorar (una estación)')
    expect(corto).not.toHaveTextContent(/✓|Cumple$/)
  })

  it('«Cotas del plano» lee las cotas del DXF calibrado a lo largo de la pista', () => {
    const [proyecto, archivos] = obraConPlano(true)
    estado().cargarProyecto(proyecto, archivos)
    estado().activarCalle('c-empinada')
    render(<PantallaPlanificar />)

    expect(screen.getByRole('radio', { name: 'Cotas del plano' })).toBeChecked()
    expect(screen.getByText(/3 cotas leídas del plano/)).toBeInTheDocument()
    const controles = within(screen.getByRole('list', { name: 'Puntos de control' }))
    expect(controles.getByText(/Control \d · 0\+050/)).toBeInTheDocument()
  })

  it('con el plano sin calibrar, «Cotas del plano» no se puede usar y dice por qué', () => {
    const [proyecto, archivos] = obraConPlano(false)
    estado().cargarProyecto(proyecto, archivos)
    estado().activarCalle('c-empinada')
    render(<PantallaPlanificar />)

    expect(screen.getByRole('radio', { name: 'Cotas del plano' })).toBeDisabled()
    expect(screen.getByText(/Cotas del plano: el plano de la pista aún no está calibrado/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/perfil de ejemplo/)
  })

  it('la rasante se planifica en el tramo que se pida', async () => {
    const usuario = userEvent.setup()
    render(<PantallaPlanificar />)
    const hasta = screen.getByRole('textbox', { name: 'Hasta (m)' })
    await usuario.clear(hasta)
    await usuario.type(hasta, '40{Enter}')
    const controles = within(screen.getByRole('list', { name: 'Puntos de control' }))
    expect(controles.getByText(/0\+040/)).toBeInTheDocument()
  })

  it('«Guía de campo» abre la guía', async () => {
    const usuario = userEvent.setup()
    render(<PantallaPlanificar />)
    await usuario.click(screen.getByRole('button', { name: 'Guía de campo' }))
    expect(estado().pantallaCalle).toBe('guia')
  })

  it('sin calle activa pide elegir una', () => {
    useAlmacen.setState({ calleActivaId: null })
    render(<PantallaPlanificar />)
    expect(screen.getByText(/Elige una calle/)).toBeInTheDocument()
  })
})
