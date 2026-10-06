import { opcionesDeInstrumento, planificarConControles, type Perfil } from '@topo/core'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../../estado/almacen'
import { usePlanificador } from './almacenPlanificador'
import { obraEmpinada } from './obraDePrueba'
import PantallaGuia from './PantallaGuia'
import { recorridoDelPlan } from './recorrido'

const estado = () => useAlmacen.getState()

const RASANTE: Perfil = [
  { progresiva: 0, cota: 3200 },
  { progresiva: 100, cota: 3212 },
]

/** El mismo recorrido que debe mostrar la guía, sacado del motor. */
function recorridoEsperado(perfil: Perfil = RASANTE) {
  return recorridoDelPlan(planificarConControles(perfil))
}

/** Guarda en la calle el plan de este perfil, como lo hace «Guardar en la calle». */
function guardarPlan(perfil: Perfil) {
  const opciones = opcionesDeInstrumento(estado().proyecto.instrumento)
  const plan = planificarConControles(perfil, opciones)
  estado().fijarPlanControles('c-empinada', {
    opciones,
    controles: plan.controles.map((c) => ({
      progresiva: c.progresiva,
      cota: c.cotaPerfil,
      motivos: c.motivos,
    })),
  })
  return plan
}

beforeEach(() => {
  estado().cargarProyecto(obraEmpinada())
  estado().activarCalle('c-empinada')
  useAlmacen.setState({ espacio: 'calle', pantallaCalle: 'guia' })
  usePlanificador.getState().olvidar()
})

describe('PantallaGuia', () => {
  it('el primer paso dice dónde plantar, qué leer atrás, qué progresivas y qué adelante', () => {
    const primero = recorridoEsperado().pasos[0]!
    // El caso de prueba tiene que traer progresivas intermedias en el primer paso.
    expect(primero.lecturas.length).toBeGreaterThan(0)
    render(<PantallaGuia />)

    expect(screen.getByRole('heading', { name: 'Guía de campo' })).toBeInTheDocument()
    const tarjeta = screen.getByRole('article')
    expect(within(tarjeta).getByRole('heading')).toHaveTextContent('Estación 1 · tramo 1, ida')
    expect(tarjeta).toHaveTextContent(/Planta el nivel en ≈ 0\+0/)
    // Al centímetro: salen del perfil, no son para comprobar.
    expect(tarjeta).toHaveTextContent(
      `Mira atrás en Control 1 (0+000): debería marcar ≈ ${primero.atras.lectura.toFixed(2)} m`,
    )
    expect(tarjeta).toHaveTextContent(`Clava el PC 1`)
    expect(tarjeta).toHaveTextContent(`lee adelante ≈ ${primero.adelante.lectura.toFixed(2)} m`)
    const lecturas = within(tarjeta).getByRole('list', {
      name: 'Lecturas esperadas',
    })
    expect(lecturas.children).toHaveLength(primero.lecturas.length)
    expect(lecturas).toHaveTextContent(primero.lecturas[0]!.lectura.toFixed(2))
    expect(lecturas).not.toHaveTextContent('0+000')
    expect(screen.getByText(/Lecturas aproximadas: salen del perfil con el nivel a 1\.50 m/)).toBeInTheDocument()

    const avance = screen.getByRole('progressbar', {
      name: 'Avance de la guía',
    })
    expect(avance).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByText(/^Paso 1 de \d+ · tramo 1 de \d+, ida$/)).toBeInTheDocument()
    expect(screen.getByText(/Ida: estaciones 0 de \d+ · Cambios 0 de \d+ · Controles 0 de \d+/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
  })

  it('antes del primer paso pide llevar cota desde el BM al Control 1', () => {
    render(<PantallaGuia />)
    const nota = screen.getAllByRole('note').find((n) => /Antes de empezar/.test(n.textContent ?? ''))!
    expect(nota).toHaveTextContent(/lleva cota desde el BM BM-1 hasta el Control 1 con una nivelación cerrada/)
    expect(nota).toHaveTextContent(/no están comprobadas/)
  })

  it('si el plan no cumple, lo avisa arriba y en el control del tramo', async () => {
    const recorrido = recorridoEsperado()
    const llegada = recorrido.pasos.find((p) => p.sentido === 'ida' && p.llegaA)!
    expect(llegada.llegaA!.tramo.ok).toBe(false)
    const usuario = userEvent.setup()
    render(<PantallaGuia />)

    expect(screen.getByText(/tramos no cumplen: su cierre puede salir fuera de la tolerancia/)).toBeInTheDocument()
    for (let i = 0; i < llegada.indice; i++)
      await usuario.click(screen.getByRole('button', { name: 'Hecho, siguiente' }))
    expect(within(screen.getByRole('article')).getByRole('note')).toHaveTextContent(/✗ Este tramo no cumple en el plan/)
  })

  it('«Hecho, siguiente» avanza, «Anterior» vuelve, el paso se recuerda y la tarjeta nueva toma el foco', async () => {
    const usuario = userEvent.setup()
    const { unmount } = render(<PantallaGuia />)

    await usuario.click(screen.getByRole('button', { name: 'Hecho, siguiente' }))
    expect(screen.getByRole('article')).toHaveTextContent('Estación 2')
    expect(within(screen.getByRole('article')).getByRole('heading')).toHaveFocus()
    expect(screen.getByText(/^Paso 2 de/)).toBeInTheDocument()
    expect(screen.getByText(/estaciones 1 de/)).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveTextContent(/Mira atrás en PC 1/)

    unmount()
    render(<PantallaGuia />)
    expect(screen.getByRole('article')).toHaveTextContent('Estación 2')

    await usuario.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(screen.getByRole('article')).toHaveTextContent('Estación 1')
  })

  it('el paso dice si va de ida o de vuelta en el tramo', async () => {
    const vuelta = recorridoEsperado().pasos.find((p) => p.sentido === 'vuelta')!
    const usuario = userEvent.setup()
    render(<PantallaGuia />)
    for (let i = 0; i < vuelta.indice; i++)
      await usuario.click(screen.getByRole('button', { name: 'Hecho, siguiente' }))
    expect(
      screen.getByText(new RegExp(`^Paso ${vuelta.indice + 1} de \\d+ · tramo 1 de \\d+, vuelta$`)),
    ).toBeInTheDocument()
  })

  it('al llegar a un control recuerda comparar su cota y cerrar el tramo, sin dar nada por bueno', async () => {
    const recorrido = recorridoEsperado()
    const llegada = recorrido.pasos.find((p) => p.sentido === 'ida' && p.llegaA)!
    const vuelta = recorrido.pasos.find((p) => p.sentido === 'vuelta' && p.llegaA)!
    const usuario = userEvent.setup()
    render(<PantallaGuia />)

    for (let i = 0; i < llegada.indice; i++)
      await usuario.click(screen.getByRole('button', { name: 'Hecho, siguiente' }))
    const nota = within(screen.getByRole('article')).getByRole('note')
    expect(nota).toHaveTextContent(`Llegaste al ${llegada.llegaA!.nombre}`)
    expect(nota).toHaveTextContent(/Compara su cota con la prevista ≈ .*sin comprobar/)
    expect(nota).toHaveTextContent(/cierra el tramo de ida y vuelta/)
    expect(nota).toHaveTextContent('⚑')
    expect(nota).not.toHaveTextContent('✓')
    expect(screen.getByRole('article')).toHaveTextContent(`Remata en el ${llegada.llegaA!.nombre}`)

    for (let i = llegada.indice; i < vuelta.indice; i++)
      await usuario.click(screen.getByRole('button', { name: 'Hecho, siguiente' }))
    expect(screen.getByRole('article')).toHaveTextContent('tramo 1, vuelta')
    const notaVuelta = within(screen.getByRole('article')).getByRole('note')
    expect(notaVuelta).toHaveTextContent(`Llegaste de vuelta al Control 1. Cierra el tramo`)
    expect(notaVuelta).not.toHaveTextContent('✓')
  })

  it('la orden de cerrar va también junto a «Hecho, siguiente», con la tolerancia y sin el ambiguo «si pasa»', async () => {
    const recorrido = recorridoEsperado()
    const llegada = recorrido.pasos.find((p) => p.sentido === 'ida' && p.llegaA)!
    const vuelta = recorrido.pasos.find((p) => p.sentido === 'vuelta' && p.llegaA)!
    const usuario = userEvent.setup()
    render(<PantallaGuia />)
    const recordatorio = () => screen.queryByRole('note', { name: 'Recordatorio de cierre' })
    const siguiente = () => screen.getByRole('button', { name: 'Hecho, siguiente' })
    const tolerancia = (el: HTMLElement) => /± \d+\.\d mm/.exec(el.textContent ?? '')?.[0]

    // Un paso que no llega a un control no lleva recordatorio.
    expect(recordatorio()).toBeNull()

    // La lectura adelante va junto al botón en cada paso, igual que en la tarjeta.
    for (const p of recorrido.pasos) {
      if (p.indice > 0) await usuario.click(siguiente())
      const barra = screen.getByLabelText('Lectura adelante')
      expect(barra.parentElement).toBe(siguiente().parentElement)
      expect(barra).toHaveTextContent(`Adelante: ${p.adelante.nombre} (`)
      expect(barra).toHaveTextContent(`≈ ${p.adelante.lectura.toFixed(2)} m`)
      expect(screen.getByRole('article')).toHaveTextContent(`lee adelante ≈ ${p.adelante.lectura.toFixed(2)} m`)
    }
    await usuario.click(siguiente())
    expect(screen.queryByLabelText('Lectura adelante')).toBeNull()
    await usuario.click(screen.getByRole('button', { name: 'Empezar de nuevo' }))

    for (let i = 0; i < llegada.indice; i++) await usuario.click(siguiente())
    expect(recordatorio()).toHaveTextContent(`Llegaste al ${llegada.llegaA!.nombre}`)
    expect(recordatorio()).toHaveTextContent(/cerrar el tramo \(± \d+\.\d mm\)/)
    // En la misma barra fija que el botón: si el botón se ve, el recordatorio también.
    expect(recordatorio()!.parentElement).toBe(siguiente().parentElement)

    for (let i = llegada.indice; i < vuelta.indice; i++) await usuario.click(siguiente())
    const notaVuelta = within(screen.getByRole('article')).getByRole('note')
    const tol = tolerancia(notaVuelta)!
    expect(tol).toBeDefined()
    expect(recordatorio()).toHaveTextContent(`cierra el tramo en el ${vuelta.llegaA!.nombre}`)
    expect(tolerancia(recordatorio()!)).toBe(tol)
    expect(recordatorio()).toHaveTextContent('Si se pasa, repítelo')
    expect(recordatorio()).not.toHaveTextContent('✓')
    // «Pasa» en la app es conforme: aquí se dice «si se pasa de la tolerancia».
    expect(notaVuelta).toHaveTextContent(`Si se pasa de ${tol}, repite el tramo`)
    expect(notaVuelta).not.toHaveTextContent(/Si pasa/)
  })

  it('al terminar dice que la guía está completa y deja empezar de nuevo', async () => {
    const total = recorridoEsperado().pasos.length
    const usuario = userEvent.setup()
    render(<PantallaGuia />)

    for (let i = 0; i < total; i++) await usuario.click(screen.getByRole('button', { name: 'Hecho, siguiente' }))
    expect(screen.getByText(/Guía completa/)).not.toHaveTextContent('✓')
    expect(screen.getByText(/Controles (\d+) de \1/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Empezar de nuevo' }))
    expect(screen.getByRole('article')).toHaveTextContent('Estación 1')
  })

  it('avisa si el plan no está guardado en la calle, y deja de avisar al guardarlo', () => {
    const { unmount } = render(<PantallaGuia />)
    expect(screen.getByText(/no está guardado en la calle/)).toBeInTheDocument()
    unmount()

    guardarPlan(RASANTE)
    render(<PantallaGuia />)
    expect(screen.queryByText(/no está guardado en la calle/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Esta guía sigue el plan guardado/)).not.toBeInTheDocument()
  })

  it('sigue el plan guardado aunque después cambien las reglas, y dice qué es distinto', () => {
    const plan = guardarPlan(RASANTE)
    estado().fijarInstrumento({ maxCambiosPorTramo: 1 })
    render(<PantallaGuia />)

    // Los mismos pasos que el plan guardado, no los de las reglas nuevas.
    const esperado = recorridoDelPlan(plan)
    expect(screen.getByText(new RegExp(`^Paso 1 de ${esperado.pasos.length} `))).toBeInTheDocument()
    const aviso = screen.getByText(/Esta guía sigue el plan guardado en la calle/)
    expect(aviso).toHaveTextContent(/cambiaron las reglas del nivel/)
    expect(aviso).not.toHaveTextContent(/guárdalo/)
  })

  it('tras recargar (se pierde lo digitado) sigue el plan guardado, con su quiebre', () => {
    const conQuiebre: Perfil = [
      { progresiva: 0, cota: 3200 },
      { progresiva: 60, cota: 3207.2 },
      { progresiva: 100, cota: 3208.8 },
    ]
    const plan = guardarPlan(conQuiebre)
    // Lo que el planificador recordaba se perdió: solo queda lo guardado en la calle.
    usePlanificador.getState().olvidar()
    render(<PantallaGuia />)

    const esperado = recorridoDelPlan(plan)
    expect(screen.getByText(new RegExp(`^Paso 1 de ${esperado.pasos.length} `))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Controles 0 de ${plan.controles.length}`))).toBeInTheDocument()
    expect(plan.controles.some((c) => c.progresiva === 60)).toBe(true)
    // La rasante (una sola pendiente) da otros controles: se dice, sin proponer guardar encima.
    expect(screen.getByText(/Esta guía sigue el plan guardado/)).toHaveTextContent(/C\d/)
  })

  it('si el plan cambia a mitad de la guía, vuelve al inicio y lo dice', async () => {
    const usuario = userEvent.setup()
    render(<PantallaGuia />)
    for (let i = 0; i < 3; i++) await usuario.click(screen.getByRole('button', { name: 'Hecho, siguiente' }))
    expect(screen.getByText(/^Paso 4 de/)).toBeInTheDocument()

    act(() => estado().fijarInstrumento({ maxCambiosPorTramo: 1 }))
    expect(screen.getByText(/^Paso 1 de/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/El plan cambió desde que dejaste la guía en el paso 4/)
  })

  it('sin plan posible lo dice y deja volver a Planificar', async () => {
    estado().fijarInstrumento({ largoMira: 1 })
    const usuario = userEvent.setup()
    render(<PantallaGuia />)

    expect(screen.getByText(/No hay guía/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hecho, siguiente' })).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Volver a Planificar' }))
    expect(estado().pantallaCalle).toBe('planificar')
  })
})
