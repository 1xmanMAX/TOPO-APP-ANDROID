import type { Proyecto } from '@topo/core'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../../estado/almacen'
import { proyectoEjemplo, proyectoVacio } from '../../estado/ejemplo'
import EspacioObra from './EspacioObra'
import { entregarArchivo } from './SubirHojaEmbebida'

/** El ejemplo, más una segunda calle vacía para poder elegir entre dos. */
function obraConDosCalles(): Proyecto {
  const p = structuredClone(proyectoEjemplo())
  p.calles.push({ ...structuredClone(p.calles[0]!), id: 'c-lima', nombre: 'Jr. Lima', nivelaciones: [], rasante: null })
  return p
}

beforeEach(() => {
  useAlmacen.getState().cargarProyecto(obraConDosCalles())
  useAlmacen.setState({ espacio: 'obra', subObra: 'calles', modoCalle: 'medir', pantallaCalle: null })
})

describe('Obra › Calles: inicio', () => {
  it('«Seguir donde lo dejaste» dice calle y capa de la jornada activa, y lleva a Calle › Medir', async () => {
    const usuario = userEvent.setup()
    useAlmacen.setState({ espacio: 'obra', modoCalle: 'revisar' })
    render(<EspacioObra />)

    const seguir = screen.getByRole('region', { name: 'Seguir donde lo dejaste' })
    const toma = useAlmacen.getState().campaniaActivaId
    const capa = useAlmacen.getState().proyecto.capas.find(
      (c) => c.id === useAlmacen.getState().proyecto.calles[0]!.nivelaciones.flatMap((n) => n.tomas).find((t) => t.id === toma)!.capaId,
    )!
    expect(within(seguir).getByText(`Av. Sol · ${capa.nombre}`)).toBeInTheDocument()
    expect(within(seguir).getByText(/\d+ \/ \d+ puntos/)).toBeInTheDocument()
    expect(within(seguir).getByText(/Circuito cerrado/)).toBeInTheDocument()

    await usuario.click(within(seguir).getByRole('button', { name: 'Continuar midiendo' }))
    expect(useAlmacen.getState().espacio).toBe('calle')
    expect(useAlmacen.getState().modoCalle).toBe('medir')
  })

  it('avisa cuando el circuito de la jornada activa no cierra todavía', () => {
    const p = obraConDosCalles()
    for (const toma of p.calles[0]!.nivelaciones.flatMap((n) => n.tomas)) {
      delete toma.estaciones[toma.estaciones.length - 1]!.vistaAdelante
    }
    useAlmacen.getState().cargarProyecto(p)
    render(<EspacioObra />)
    const seguir = screen.getByRole('region', { name: 'Seguir donde lo dejaste' })
    expect(within(seguir).getByText(/Circuito sin cerrar/)).toBeInTheDocument()
  })

  it('cada calle trae su franja de capas con el estado real de cada una', () => {
    render(<EspacioObra />)
    const franja = screen.getByRole('list', { name: 'Capas de Av. Sol' })
    const casillas = within(franja).getAllByRole('listitem')
    expect(casillas.map((c) => c.getAttribute('aria-label'))).toEqual([
      'TERRENO EXISTENTE: sin medir',
      'SUBRASANTE: con puntos fuera',
      'BASE: con puntos al límite',
      'CARPETA: sin medir',
    ])
    expect(casillas[1]).toHaveTextContent('✗')
    expect(casillas[2]).toHaveTextContent('△')
    expect(casillas[0]).toHaveTextContent('·')
    expect(screen.getByText(/SUBRASANTE: 1 punto fuera de tolerancia en 0\+040/)).toBeInTheDocument()

    const lima = screen.getByRole('list', { name: 'Capas de Jr. Lima' })
    expect(within(lima).getAllByRole('listitem').every((c) => c.textContent?.startsWith('·'))).toBe(true)
  })

  it('muestra los bancos de nivel con su cota en el inicio', () => {
    render(<EspacioObra />)
    const bms = screen.getByRole('region', { name: 'Bancos de nivel de la obra' })
    expect(within(bms).getByText('3245.180')).toBeInTheDocument()
    expect(within(bms).getByText(/BM-1/)).toBeInTheDocument()
  })

  it('una capa sin comprobar se marca △ «sin comprobar» en la franja', () => {
    const p = obraConDosCalles()
    for (const toma of p.calles[0]!.nivelaciones.flatMap((n) => n.tomas)) toma.cierre.tipo = 'abierto'
    useAlmacen.getState().cargarProyecto(p)
    render(<EspacioObra />)
    const casillas = within(screen.getByRole('list', { name: 'Capas de Av. Sol' })).getAllByRole('listitem')
    expect(casillas[1]).toHaveAttribute('aria-label', 'SUBRASANTE: sin comprobar')
    expect(casillas[1]).toHaveTextContent('△')
  })

  it('sin rasante, una capa que cerró no dice «conforme»: dice «cerrada, sin comparar»', () => {
    const p = obraConDosCalles()
    p.calles[0]!.rasante = null
    useAlmacen.getState().cargarProyecto(p)
    render(<EspacioObra />)
    const casillas = within(screen.getByRole('list', { name: 'Capas de Av. Sol' })).getAllByRole('listitem')
    expect(casillas[1]).toHaveAttribute('aria-label', 'SUBRASANTE: cerrada, sin comparar')
    expect(casillas[1]).not.toHaveTextContent('✓')
  })

  it('mirar otra calle no cambia «Seguir donde lo dejaste» ni la jornada activa', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    const antes = useAlmacen.getState().campaniaActivaId
    await usuario.click(screen.getByRole('button', { name: 'Abrir Jr. Lima' }))

    expect(useAlmacen.getState().campaniaActivaId).toBe(antes)
    const seguir = screen.getByRole('region', { name: 'Seguir donde lo dejaste' })
    expect(within(seguir).getByText(/^Av\. Sol · /)).toBeInTheDocument()
    expect(within(seguir).queryByText(/Todavía no hay ninguna jornada/)).not.toBeInTheDocument()
  })

  it('sin jornada activa, «Seguir» toma la más reciente de la obra y «Continuar» la activa', async () => {
    const usuario = userEvent.setup()
    useAlmacen.setState({ campaniaActivaId: null })
    render(<EspacioObra />)
    const seguir = screen.getByRole('region', { name: 'Seguir donde lo dejaste' })
    expect(within(seguir).getByText('Av. Sol · BASE')).toBeInTheDocument()
    expect(within(seguir).getByText(/la última jornada de la obra/)).toBeInTheDocument()

    await usuario.click(within(seguir).getByRole('button', { name: 'Continuar midiendo' }))
    const base = useAlmacen
      .getState()
      .proyecto.calles[0]!.nivelaciones.flatMap((n) => n.tomas)
      .find((t) => t.capaId === 'cap-base')!
    expect(useAlmacen.getState().campaniaActivaId).toBe(base.id)
    expect(useAlmacen.getState().modoCalle).toBe('medir')
  })

  it('«Nueva jornada» con calles pero sin banco de nivel queda desactivada y dice qué falta', () => {
    const p = obraConDosCalles()
    p.bms = []
    for (const calle of p.calles) calle.nivelaciones = []
    useAlmacen.getState().cargarProyecto(p)
    render(<EspacioObra />)
    expect(screen.getByRole('button', { name: 'Nueva jornada' })).toBeDisabled()
    expect(screen.getByText('Para empezar una jornada falta un banco de nivel.')).toBeInTheDocument()
  })

  it('«Nueva jornada» va a la calle que se está mirando, con la fecha local', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    await usuario.click(screen.getByRole('button', { name: 'Abrir Jr. Lima' }))
    await usuario.click(screen.getByRole('button', { name: 'Nueva jornada' }))
    const lima = useAlmacen.getState().proyecto.calles.find((c) => c.id === 'c-lima')!
    const nueva = lima.nivelaciones.at(-1)!.tomas[0]!
    const hoy = new Date()
    const local = [hoy.getFullYear(), String(hoy.getMonth() + 1).padStart(2, '0'), String(hoy.getDate()).padStart(2, '0')].join('-')
    expect(nueva.fecha).toBe(local)
    expect(useAlmacen.getState().calleActivaId).toBe('c-lima')
  })

  it('«Nueva jornada» la crea en la calle activa, con la capa de su última jornada, y abre Medir', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    const antes = useAlmacen.getState().proyecto.calles[0]!.nivelaciones.length

    await usuario.click(screen.getByRole('button', { name: 'Nueva jornada' }))

    const estado = useAlmacen.getState()
    expect(estado.proyecto.calles[0]!.nivelaciones).toHaveLength(antes + 1)
    const nueva = estado.proyecto.calles[0]!.nivelaciones.at(-1)!.tomas[0]!
    expect(estado.campaniaActivaId).toBe(nueva.id)
    expect(nueva.capaId).toBe('cap-base')
    expect(nueva.cierre).toMatchObject({ tipo: 'cerrado', bmFinalId: 'bm-1', coeficiente: 12 })
    expect(estado.espacio).toBe('calle')
    expect(estado.modoCalle).toBe('medir')
  })

  it('crear una calle nueva la activa y abre su panel', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    await usuario.type(screen.getByLabelText('Nombre de la calle nueva'), 'Pasaje Los Olivos')
    await usuario.click(screen.getByRole('button', { name: '+ Nueva calle' }))

    expect(useAlmacen.getState().proyecto.calles.some((c) => c.nombre === 'Pasaje Los Olivos')).toBe(true)
    expect(screen.getByRole('region', { name: 'Panel de Pasaje Los Olivos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir Pasaje Los Olivos' })).toHaveAttribute('aria-pressed', 'true')
    // Seguir no dice que no hay jornadas: la obra sí las tiene.
    const seguir = screen.getByRole('region', { name: 'Seguir donde lo dejaste' })
    expect(within(seguir).queryByText(/Todavía no hay ninguna jornada/)).not.toBeInTheDocument()
  })
})

describe('Obra › Calles: panel de la calle', () => {
  it('elegir una calle muestra su panel; «Abrir la calle» la activa y lleva a Calle', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    expect(screen.getByRole('region', { name: 'Panel de Av. Sol' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Abrir Jr. Lima' }))

    expect(useAlmacen.getState().calleActivaId).not.toBe('c-lima')
    expect(screen.getByRole('button', { name: 'Abrir Jr. Lima' })).toHaveAttribute('aria-pressed', 'true')
    const panel = screen.getByRole('region', { name: 'Panel de Jr. Lima' })
    expect(within(panel).getByRole('heading', { name: 'Jr. Lima' })).toBeInTheDocument()

    await usuario.click(within(panel).getByRole('button', { name: 'Abrir la calle ›' }))
    expect(useAlmacen.getState().calleActivaId).toBe('c-lima')
    expect(useAlmacen.getState().espacio).toBe('calle')
  })

  it('«Abrir la calle» de la calle activa no cambia la jornada en que se estaba', async () => {
    const usuario = userEvent.setup()
    const tomas = useAlmacen.getState().proyecto.calles[0]!.nivelaciones.flatMap((n) => n.tomas)
    const vieja = tomas.find((t) => t.capaId === 'cap-subrasante')!
    useAlmacen.getState().activarCampania(vieja.id)
    render(<EspacioObra />)
    await usuario.click(screen.getByRole('button', { name: 'Abrir la calle ›' }))
    expect(useAlmacen.getState().campaniaActivaId).toBe(vieja.id)
  })

  it('en el celular, abrir una calle lleva el foco a su panel y «Volver a la obra» lo devuelve a la calle', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    await usuario.click(screen.getByRole('button', { name: 'Abrir Jr. Lima' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Jr. Lima' })).toHaveFocus())

    await usuario.click(screen.getByRole('button', { name: /Volver a la obra/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir Jr. Lima' })).toHaveFocus())
  })

  it('el botón de cada calle describe su tramo y lo más urgente', () => {
    render(<EspacioObra />)
    expect(screen.getByRole('button', { name: 'Abrir Av. Sol' })).toHaveAccessibleDescription(
      /0\+000 – 0\+080 .*SUBRASANTE: 1 punto fuera/,
    )
  })

  it('los apartados dicen qué tienen sin abrirlos; la sección viene abierta', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)

    const seccion = screen.getByRole('button', { name: 'Sección' })
    expect(seccion).toHaveAttribute('aria-expanded', 'true')
    expect(seccion).toHaveAccessibleDescription(/7 puntos · de −5\.60 a \+5\.60 m/)
    expect(screen.getByRole('heading', { name: /sección de la calle/i })).toBeInTheDocument()

    const rasante = screen.getByRole('button', { name: 'Rasante' })
    expect(rasante).toHaveAttribute('aria-expanded', 'false')
    expect(rasante).toHaveAccessibleDescription(/en 0\+000 · .*%/)

    expect(screen.getByRole('button', { name: 'Jornadas y hojas' })).toHaveAccessibleDescription(
      /2 jornadas · la última 2026-08-20, BASE: ✓ cerró/,
    )

    await usuario.click(seccion)
    expect(seccion).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('heading', { name: /sección de la calle/i })).not.toBeInTheDocument()
  })

  it('una calle sin rasante lo dice en el resumen', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    await usuario.click(screen.getByRole('button', { name: 'Abrir Jr. Lima' }))
    expect(screen.getByRole('button', { name: 'Rasante' })).toHaveAccessibleDescription(/Sin rasante/)
  })

  it('Anchos dice que el modelo todavía no tiene anchos por progresiva y enseña la sección', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    const anchos = screen.getByRole('button', { name: 'Anchos' })
    expect(anchos).toHaveAccessibleDescription(/todavía no están en el modelo/)
    await usuario.click(anchos)
    const tabla = screen.getByRole('table', { name: 'Distancias al eje de la sección' })
    expect(within(tabla).getByText('Vereda izquierda')).toBeInTheDocument()
    expect(within(tabla).getByText('−5.60')).toBeInTheDocument()
  })

  it('tocar dos jornadas las compara con el motor y «Ver celda por celda» lleva a Revisar', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    await usuario.click(screen.getByRole('button', { name: 'Jornadas y hojas' }))

    const base = screen.getByRole('button', { name: 'Comparar la jornada 2026-08-20 · BASE' })
    const subrasante = screen.getByRole('button', { name: 'Comparar la jornada 2026-08-19 · SUBRASANTE' })
    expect(base).toHaveTextContent('✓ cerró')
    expect(base).toHaveAccessibleDescription(/lecturas .*✓ cerró/)

    await usuario.click(base)
    expect(base).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Elige otra jornada para compararla con esta.')).toBeInTheDocument()

    await usuario.click(subrasante)
    const comparacion = screen.getByRole('region', { name: 'Comparación de las dos jornadas' })
    expect(within(comparacion).getByText('Espesor colocado · mm')).toBeInTheDocument()
    expect(within(comparacion).getByText('SUBRASANTE → BASE')).toBeInTheDocument()
    expect(within(comparacion).getByText('158')).toBeInTheDocument()
    expect(within(comparacion).getByText(/Proyecto 200 mm ±10/)).toBeInTheDocument()
    expect(within(comparacion).getByText(/ESPESORES VERIFICADOS/)).toBeInTheDocument()

    await usuario.click(within(comparacion).getByRole('button', { name: 'Ver celda por celda' }))
    const estado = useAlmacen.getState()
    expect(estado.modoCalle).toBe('revisar')
    expect(estado.espacio).toBe('calle')
    const ids = estado.proyecto.calles[0]!.nivelaciones.flatMap((n) => n.tomas)
    expect(estado.comparacion).toEqual({
      inferior: ids.find((t) => t.capaId === 'cap-subrasante')!.id,
      superior: ids.find((t) => t.capaId === 'cap-base')!.id,
    })
  })

  it('una jornada se abre en la libreta y se corrige su capa desde el historial', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    await usuario.click(screen.getByRole('button', { name: 'Jornadas y hojas' }))

    await usuario.click(screen.getByRole('button', { name: 'Corregir la jornada 2026-08-19 · SUBRASANTE' }))
    await usuario.selectOptions(screen.getByLabelText('Capa de la jornada 2026-08-19 · SUBRASANTE'), 'cap-terreno')
    const tomas = useAlmacen.getState().proyecto.calles[0]!.nivelaciones.flatMap((n) => n.tomas)
    const corregida = tomas.find((t) => t.fecha === '2026-08-19')!
    expect(corregida.capaId).toBe('cap-terreno')

    await usuario.click(screen.getByRole('button', { name: 'Abrir la jornada 2026-08-19 · TERRENO EXISTENTE' }))
    expect(useAlmacen.getState().campaniaActivaId).toBe(corregida.id)
    expect(useAlmacen.getState().modoCalle).toBe('medir')
  })

  it('«Subir hoja» abre el apartado con la subida de datos de siempre', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    const apartado = screen.getByRole('button', { name: 'Subir una hoja de campo' })
    expect(apartado).toHaveAttribute('aria-expanded', 'true')
    // No promete «a esta calle»: avisa de que la calle sale del nombre del archivo.
    expect(screen.getByText(/La calle sale del nombre del archivo/)).toHaveTextContent(/«Av\. Sol»/)
    await usuario.click(apartado)
    expect(apartado).toHaveAttribute('aria-expanded', 'false')
    // Plegado se esconde, pero sigue ahí: una hoja a medio aceptar no se pierde.
    expect(screen.getByLabelText(/archivo de la hoja/i)).not.toBeVisible()
    expect(document.getElementById(apartado.getAttribute('aria-controls')!)).not.toBeNull()

    // El botón del inicio lo vuelve a abrir.
    await usuario.click(screen.getByRole('button', { name: 'Subir hoja' }))
    expect(apartado).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText(/archivo de la hoja/i)).toBeVisible()
    expect(screen.getByLabelText(/pegar/i)).toBeInTheDocument()
  })

  it('lo pegado sobrevive a plegar y desplegar el apartado', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    const texto = 'Punto\tLectura\nBM-1\t1.234'
    fireEvent.change(screen.getByLabelText(/pegar/i), { target: { value: texto } })
    const apartado = screen.getByRole('button', { name: 'Subir una hoja de campo' })
    await usuario.click(apartado)
    await usuario.click(apartado)
    expect(screen.getByLabelText(/pegar/i)).toHaveValue(texto)
  })

  it('soltar el archivo sobre la zona lo lee la subida de datos de siempre', async () => {
    render(<EspacioObra />)
    const zona = screen.getByTestId('zona-subir-hoja')
    const archivo = new File(['Punto,Lectura\nBM-1,1.234\n'], 'Av Sol terreno.csv', { type: 'text/csv' })
    fireEvent.drop(zona, { dataTransfer: { files: [archivo] } })
    expect(await screen.findByDisplayValue('Av Sol terreno')).toBeInTheDocument()
  })

  it('cambiar de calle desarma un borrado a medio confirmar', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    await usuario.click(screen.getByRole('button', { name: 'Abrir Jr. Lima' }))
    // Se arma sin que el botón reciba el foco (Safari al tocar), así que no hay onBlur que lo desarme.
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar la calle' }))
    expect(screen.getByRole('button', { name: /¿Seguro\?/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Av. Sol' }))
    expect(screen.getByRole('button', { name: 'Eliminar la calle' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /¿Seguro\?/ })).not.toBeInTheDocument()
  })

  it('borrar la calle pide confirmación', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    await usuario.click(screen.getByRole('button', { name: 'Abrir Jr. Lima' }))
    await usuario.click(screen.getByRole('button', { name: 'Eliminar la calle' }))
    expect(useAlmacen.getState().proyecto.calles).toHaveLength(2)
    await usuario.click(screen.getByRole('button', { name: /¿Seguro\? Se borran 0 jornadas/ }))
    expect(useAlmacen.getState().proyecto.calles.map((c) => c.nombre)).toEqual(['Av. Sol'])
  })
})

describe('Obra › Calles: lo de toda la obra', () => {
  it('el instrumento se ajusta y vuelve a los valores de fábrica', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    const instrumento = screen.getByRole('button', { name: 'Instrumento' })
    expect(instrumento).toHaveAccessibleDescription(/mira 5 m · visual ≤ 50 m · k 12 mm/)
    await usuario.click(instrumento)

    const mira = screen.getByLabelText('Largo de la mira')
    await usuario.clear(mira)
    await usuario.type(mira, '4')
    expect(useAlmacen.getState().proyecto.instrumento?.largoMira).toBe(4)
    expect(screen.getByText(/de fábrica: 5/)).toBeInTheDocument()

    const visual = screen.getByLabelText('Visual máxima')
    await usuario.clear(visual)
    await usuario.type(visual, '40')
    expect(useAlmacen.getState().proyecto.instrumento?.visualMax).toBe(40)

    await usuario.click(screen.getByRole('button', { name: 'Volver a los valores de fábrica' }))
    expect(useAlmacen.getState().proyecto.instrumento).toMatchObject({ largoMira: 5, visualMax: 50 })
  })

  it('un valor del instrumento sin sentido no se guarda y se dice por qué', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    await usuario.click(screen.getByRole('button', { name: 'Instrumento' }))

    const k = screen.getByLabelText('k de la tolerancia k·√K')
    await usuario.clear(k)
    await usuario.type(k, '0')
    expect(useAlmacen.getState().proyecto.instrumento?.coeficienteK ?? 12).toBe(12)
    expect(screen.getByRole('alert')).toHaveTextContent(/mayor que cero/)

    const minima = screen.getByLabelText('Lectura mínima')
    await usuario.clear(minima)
    await usuario.type(minima, '6')
    expect(useAlmacen.getState().proyecto.instrumento?.lecturaMin ?? 0.3).toBe(0.3)
    expect(screen.getAllByRole('alert').some((a) => /no dejan mira útil/.test(a.textContent ?? ''))).toBe(true)
  })

  it('bancos de nivel y capas se agregan desde la misma pantalla', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    await usuario.click(screen.getByRole('button', { name: 'Bancos de nivel' }))
    await usuario.click(screen.getByRole('button', { name: 'Agregar banco de nivel' }))
    expect(useAlmacen.getState().proyecto.bms.map((b) => b.nombre)).toEqual(['BM-1', 'BM-2'])

    await usuario.click(screen.getByRole('button', { name: 'Capas' }))
    await usuario.click(screen.getByRole('button', { name: 'Agregar capa' }))
    expect(useAlmacen.getState().proyecto.capas).toHaveLength(5)
    expect(screen.getByText(/Capas sin espesor: CAPA NUEVA/)).toBeInTheDocument()
  })

  it('un banco de nivel que usan las jornadas no se puede borrar, y se dice cuáles', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    await usuario.click(screen.getByRole('button', { name: 'Bancos de nivel' }))
    await usuario.click(screen.getByRole('button', { name: 'Eliminar BM-1' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/No se puede borrar BM-1: lo usan 2 jornadas .*2026-08-19 · Av\. Sol/)
    await usuario.click(screen.getByRole('button', { name: 'Eliminar BM-1' }))
    expect(useAlmacen.getState().proyecto.bms).toHaveLength(1)
  })

  it('una capa que usa una jornada no se puede borrar, y se dice por qué', async () => {
    const usuario = userEvent.setup()
    render(<EspacioObra />)
    await usuario.click(screen.getByRole('button', { name: 'Capas' }))
    await usuario.click(screen.getByRole('button', { name: 'Eliminar capa BASE' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/No se puede borrar BASE/)
    expect(useAlmacen.getState().proyecto.capas).toHaveLength(4)
  })
})

describe('Obra › Calles: obra vacía', () => {
  it('sin calles ofrece subir la primera hoja y dice qué falta para una jornada', () => {
    useAlmacen.getState().cargarProyecto(proyectoVacio())
    render(<EspacioObra />)
    expect(screen.getByRole('region', { name: 'Subir la primera hoja' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nueva jornada' })).toBeDisabled()
    expect(screen.getByText(/falta una calle, un banco de nivel/)).toBeInTheDocument()
    expect(screen.getByText(/Todavía no hay ninguna jornada/)).toBeInTheDocument()
  })
})

describe('soltar el Excel encima: la pieza suelta', () => {
  it('entrega el archivo soltado al campo de archivo, como si se hubiera elegido', () => {
    const contenedor = document.createElement('div')
    const campo = document.createElement('input')
    campo.type = 'file'
    contenedor.appendChild(campo)
    let recibido: string | undefined
    campo.addEventListener('change', () => {
      recibido = campo.files?.[0]?.name
    })

    const archivo = new File(['a,b'], 'Av Sol terreno.csv', { type: 'text/csv' })
    const lista = { 0: archivo, length: 1, item: () => archivo } as unknown as FileList

    expect(entregarArchivo(contenedor, lista)).toBe(true)
    expect(recibido).toBe('Av Sol terreno.csv')
    expect(entregarArchivo(document.createElement('div'), lista)).toBe(false)
  })
})
