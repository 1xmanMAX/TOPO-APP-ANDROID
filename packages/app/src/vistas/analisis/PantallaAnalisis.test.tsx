import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../../estado/almacen'
import PantallaAnalisis from './PantallaAnalisis'
import { proyectoDePrueba, proyectoSinCerrar } from './proyectoDePrueba'

async function abrirPestana(nombre: string) {
  const usuario = userEvent.setup()
  render(<PantallaAnalisis />)
  await usuario.click(screen.getByRole('tab', { name: nombre }))
  return usuario
}

describe('PantallaAnalisis', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoDePrueba())
  })

  it('tiene el título y las tres pestañas, con Espesores de entrada', () => {
    render(<PantallaAnalisis />)

    expect(screen.getByRole('heading', { name: 'Análisis' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Espesores' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Volúmenes' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Drenaje' })).toBeInTheDocument()
  })

  describe('Espesores', () => {
    it('pide elegir las dos capas y luego enseña el mapa, las delgadas y el volumen colocado', async () => {
      const usuario = userEvent.setup()
      render(<PantallaAnalisis />)

      expect(screen.getByText(/Elige arriba la capa de abajo y la de arriba/)).toBeInTheDocument()

      await usuario.selectOptions(screen.getByLabelText('Capa de abajo en la comparación'), 'toma-sub')
      await usuario.selectOptions(screen.getByLabelText('Capa de arriba en la comparación'), 'toma-base')

      expect(screen.getByText(/ESPESORES VERIFICADOS/)).toBeInTheDocument()
      expect(screen.getByText('0.200 m ± 10 mm')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Espesor en 0+020 Eje: 0.104 m, fuera de tolerancia, delgada' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Espesor en 0+000 Eje: 0.197 m, conforme' })).toBeInTheDocument()

      const delgadas = within(screen.getByRole('region', { name: 'Celdas delgadas' }))
      expect(delgadas.getByRole('button', { name: /0\+020 Eje: 0\.104 m, faltan 96 mm/ })).toBeInTheDocument()

      const volumen = within(screen.getByRole('region', { name: 'Volumen colocado' }))
      expect(volumen.getByText(/m³/)).toBeInTheDocument()
      expect(volumen.queryByText(/no comprobado/)).not.toBeInTheDocument()
    })

    it('dice que faltan nivelaciones si la calle tiene una sola', () => {
      const proyecto = proyectoDePrueba()
      proyecto.calles[0]!.nivelaciones.pop()
      useAlmacen.getState().cargarProyecto(proyecto)
      render(<PantallaAnalisis />)

      expect(screen.getByText(/hacen falta dos nivelaciones de esta calle/)).toBeInTheDocument()
    })

    it('marca no comprobados los espesores si una capa no cerró', async () => {
      const proyecto = proyectoDePrueba()
      proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[1]!.vistaAdelante!.valor = 1.75
      useAlmacen.getState().cargarProyecto(proyecto)
      useAlmacen.getState().fijarComparacion('toma-sub', 'toma-base')
      render(<PantallaAnalisis />)

      expect(screen.getByText(/ESPESORES NO COMPROBADOS/)).toBeInTheDocument()
      expect(screen.getByText(/· no comprobado/)).toBeInTheDocument()
    })

    it('dos tomas de la misma capa: no manda a poner espesores, pide la capa siguiente', () => {
      const proyecto = proyectoDePrueba()
      proyecto.calles[0]!.nivelaciones[1]!.tomas[0]!.capaId = 'cap-sub'
      useAlmacen.getState().cargarProyecto(proyecto)
      useAlmacen.getState().fijarComparacion('toma-sub', 'toma-base')
      render(<PantallaAnalisis />)

      expect(screen.getByText(/Las dos nivelaciones son de la misma capa/)).toBeInTheDocument()
      expect(screen.queryByText(/Pon el espesor de cada capa/)).not.toBeInTheDocument()
    })

    it('capas elegidas al revés: lo dice', () => {
      useAlmacen.getState().fijarComparacion('toma-base', 'toma-sub')
      render(<PantallaAnalisis />)

      expect(screen.getByText(/Elegiste las capas al revés/)).toBeInTheDocument()
      expect(screen.queryByText(/Pon el espesor de cada capa/)).not.toBeInTheDocument()
    })

    it('capas sin espesor de diseño: pide ponerlo en Obra › Calles', () => {
      const proyecto = proyectoDePrueba()
      proyecto.capas[2]!.espesor = 0
      useAlmacen.getState().cargarProyecto(proyecto)
      useAlmacen.getState().fijarComparacion('toma-sub', 'toma-base')
      render(<PantallaAnalisis />)

      expect(screen.getByText(/Pon el espesor de cada capa en Obra › Calles/)).toBeInTheDocument()
    })
  })

  describe('Volúmenes', () => {
    it('de entrada compara lo medido de la toma activa con el proyecto de su capa', async () => {
      await abrirPestana('Volúmenes')

      expect(screen.getByLabelText('Superficie de arriba')).toHaveDisplayValue('Medido · SUBRASANTE · 2026-09-01')
      expect(screen.getByLabelText('Superficie de abajo')).toHaveDisplayValue('Proyecto · SUBRASANTE')
      expect(screen.getByText(/Corte \(sobra\)/)).toBeInTheDocument()
      expect(screen.getByText(/Relleno \(falta\)/)).toBeInTheDocument()
      expect(within(screen.getByRole('list', { name: 'Volumen por tramo' })).getAllByRole('listitem')).toHaveLength(2)
      expect(screen.getByLabelText('Factor de esponjamiento')).toHaveValue('1.25')
      expect(screen.getByLabelText('Capacidad del volquete')).toHaveValue('15.0')
      expect(screen.queryByText(/NO COMPROBADOS/)).not.toBeInTheDocument()
    })

    it('entre dos nivelaciones no habla de sobra ni falta: dice cuánto queda encima', async () => {
      const usuario = await abrirPestana('Volúmenes')

      await usuario.selectOptions(screen.getByLabelText('Superficie de arriba'), 'toma:toma-base')
      await usuario.selectOptions(screen.getByLabelText('Superficie de abajo'), 'toma:toma-sub')

      const tramos = within(screen.getByRole('list', { name: 'Volumen por tramo' })).getAllByRole('listitem')
      expect(tramos[0]).toHaveTextContent('0+000 → 0+010')
      expect(tramos[0]).toHaveTextContent(/Encima \d+\.\d m³/)
      expect(screen.getByText('Arriba queda encima')).toBeInTheDocument()
      expect(screen.queryByText(/Corte \(sobra\)/)).not.toBeInTheDocument()
    })

    it('con el proyecto puesto arriba, «sobra» sigue siendo lo medido de más', async () => {
      const usuario = await abrirPestana('Volúmenes')
      const tarjeta = (rotulo: RegExp) => screen.getByText(rotulo).closest('div')!.textContent
      const sobraDeFabrica = tarjeta(/Corte \(sobra\)/)
      const faltaDeFabrica = tarjeta(/Relleno \(falta\)/)
      // Sobra 0.5 m³ y falta 0.0 m³: si se diera vuelta, se notaría.
      expect(sobraDeFabrica).toContain('0.5 m³')
      expect(faltaDeFabrica).toContain('0.0 m³')

      await usuario.selectOptions(screen.getByLabelText('Superficie de arriba'), 'proyecto:cap-sub')
      await usuario.selectOptions(screen.getByLabelText('Superficie de abajo'), 'toma:toma-sub')

      expect(tarjeta(/Corte \(sobra\)/)).toBe(sobraDeFabrica)
      expect(tarjeta(/Relleno \(falta\)/)).toBe(faltaDeFabrica)
    })

    it('con dos superficies de proyecto pide una nivelación medida', async () => {
      const usuario = await abrirPestana('Volúmenes')
      await usuario.selectOptions(screen.getByLabelText('Superficie de arriba'), 'proyecto:cap-base')
      expect(screen.getByText(/Dos superficies de proyecto no tienen progresivas propias/)).toBeInTheDocument()
    })

    it('sin rasante y con dos nivelaciones pide elegir las dos', async () => {
      const proyecto = proyectoDePrueba()
      proyecto.calles[0]!.rasante = null
      useAlmacen.getState().cargarProyecto(proyecto)
      await abrirPestana('Volúmenes')

      expect(screen.getByText(/elige dos nivelaciones/)).toBeInTheDocument()
      expect(screen.queryByText(/tiene una sola nivelación/)).not.toBeInTheDocument()
    })

    it('con rasante pero sin nivelaciones dice que falta medir, no que falta la rasante', async () => {
      const proyecto = proyectoDePrueba()
      proyecto.capas = [proyecto.capas[1]!]
      proyecto.calles[0]!.nivelaciones = []
      useAlmacen.getState().cargarProyecto(proyecto)
      await abrirPestana('Volúmenes')

      expect(screen.getByText(/Falta lo medido/)).toBeInTheDocument()
      expect(screen.queryByText(/no tiene rasante/)).not.toBeInTheDocument()
    })

    it('una nivelación sin cerrar contra el BM no se da por fuera de tolerancia', async () => {
      useAlmacen.getState().cargarProyecto(proyectoSinCerrar())
      await abrirPestana('Volúmenes')

      expect(screen.getByText(/VOLÚMENES NO COMPROBADOS — la nivelación no se ha cerrado contra un BM/)).toBeInTheDocument()
      expect(screen.queryByText(/tolerancia/)).not.toBeInTheDocument()
    })

    it('un esponjamiento de cero se avisa en vez de callarse', async () => {
      const usuario = await abrirPestana('Volúmenes')
      const campo = screen.getByLabelText('Factor de esponjamiento')
      await usuario.clear(campo)
      await usuario.type(campo, '0')

      expect(screen.getByText(/El esponjamiento tiene que ser mayor que cero/)).toBeInTheDocument()
      expect(screen.getAllByText(/revisa el factor y el volquete/)).toHaveLength(2)
    })

    it('avisa si arriba y abajo son la misma superficie', async () => {
      const usuario = await abrirPestana('Volúmenes')
      await usuario.selectOptions(screen.getByLabelText('Superficie de abajo'), 'toma:toma-sub')
      expect(screen.getByText(/Arriba y abajo son la misma superficie/)).toBeInTheDocument()
    })

    it('sin rasante y con una sola nivelación dice qué falta medir', async () => {
      const proyecto = proyectoDePrueba()
      proyecto.calles[0]!.rasante = null
      proyecto.calles[0]!.nivelaciones.pop()
      useAlmacen.getState().cargarProyecto(proyecto)
      await abrirPestana('Volúmenes')

      expect(screen.getByText(/Falta la otra superficie/)).toBeInTheDocument()
      expect(screen.getByText(/carga la rasante en Obra › Calles/i)).toBeInTheDocument()
    })

    it('lo medido sin cierre sale no comprobado', async () => {
      const proyecto = proyectoDePrueba()
      proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[1]!.vistaAdelante!.valor = 1.75
      useAlmacen.getState().cargarProyecto(proyecto)
      await abrirPestana('Volúmenes')

      expect(screen.getByText(/VOLÚMENES NO COMPROBADOS/)).toBeInTheDocument()
    })
  })

  describe('Drenaje', () => {
    it('enseña hacia dónde corre el agua por el eje y el bombeo contra el proyecto', async () => {
      await abrirPestana('Drenaje')

      expect(screen.getByLabelText('Punto del perfil')).toHaveDisplayValue('Eje')
      const tramos = within(screen.getByRole('list', { name: 'Sentido del agua por tramo' })).getAllByRole('listitem')
      expect(tramos).toHaveLength(2)
      expect(tramos[0]).toHaveAccessibleName(/0\+000 a 0\+010: el agua corre hacia adelante, −0\.30 %, proyecto −0\.30 %/)
      expect(screen.getByText('Ningún empozamiento')).toBeInTheDocument()
      expect(screen.getByText('Ningún tramo a contrapendiente')).toBeInTheDocument()

      const bombeo = within(screen.getByRole('table', { name: 'Bombeo por progresiva' }))
      expect(bombeo.getAllByRole('row')).toHaveLength(1 + 6)
      expect(bombeo.getAllByText('+2.00 %').length).toBeGreaterThan(0)
      expect(bombeo.getAllByText(/✓ conforme/).length).toBe(6)
    })

    it('encuentra el empozamiento y la contrapendiente; un sumidero lo recoge', async () => {
      const proyecto = proyectoDePrueba()
      // 0+010 eje 7 cm más abajo: el agua se junta ahí.
      proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[0]!.intermedias[4]!.valor = 1.6
      useAlmacen.getState().cargarProyecto(proyecto)
      const usuario = await abrirPestana('Drenaje')

      expect(screen.getByText('1 empozamiento')).toBeInTheDocument()
      expect(screen.getByText('1 tramo a contrapendiente')).toBeInTheDocument()
      const bajos = within(screen.getByRole('list', { name: 'Puntos bajos' }))
      expect(bajos.getByText(/se empoza: junta 43 mm/)).toBeInTheDocument()

      await usuario.type(screen.getByLabelText('Sumideros'), '0+010')

      expect(screen.getByText('Ningún empozamiento')).toBeInTheDocument()
      expect(bajos.getByText(/lo recoge un sumidero/)).toBeInTheDocument()
    })

    it('sin rasante explica que no se compara con el proyecto', async () => {
      const proyecto = proyectoDePrueba()
      proyecto.calles[0]!.rasante = null
      useAlmacen.getState().cargarProyecto(proyecto)
      await abrirPestana('Drenaje')

      expect(screen.getByText(/no tiene rasante de proyecto/)).toBeInTheDocument()
      expect(screen.getByText('Contrapendiente: sin proyecto')).toBeInTheDocument()
      expect(within(screen.getByRole('table', { name: 'Bombeo por progresiva' })).getAllByText('sin proyecto').length).toBe(6)
    })

    it('si la sección no tiene puntos lo dice en vez de quedar en blanco', async () => {
      const proyecto = proyectoDePrueba()
      proyecto.calles[0]!.seccion.puntos = []
      useAlmacen.getState().cargarProyecto(proyecto)
      await abrirPestana('Drenaje')

      expect(screen.getByText(/La sección de esta calle no tiene puntos/)).toBeInTheDocument()
    })

    it('sin nivelaciones en la calle dice qué medir', async () => {
      const proyecto = proyectoDePrueba()
      proyecto.calles[0]!.nivelaciones = []
      useAlmacen.getState().cargarProyecto(proyecto)
      await abrirPestana('Drenaje')

      expect(screen.getByText(/todavía no tiene nivelaciones: el drenaje sale de lo medido/)).toBeInTheDocument()
    })

    it('los sumideros abren el teclado de texto, que trae «+» y «;»', async () => {
      await abrirPestana('Drenaje')
      expect(screen.getByLabelText('Sumideros')).toHaveAttribute('inputmode', 'text')
    })

    it('si la nivelación no cerró lo dice y lleva al cierre', async () => {
      const proyecto = proyectoDePrueba()
      proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[1]!.vistaAdelante!.valor = 1.75
      useAlmacen.getState().cargarProyecto(proyecto)
      const usuario = await abrirPestana('Drenaje')

      expect(screen.getByText(/DRENAJE Y BOMBEO NO COMPROBADOS — la nivelación está fuera de tolerancia/)).toBeInTheDocument()
      await usuario.click(screen.getByRole('button', { name: 'Ver el cierre' }))
      expect(useAlmacen.getState().pantallaCalle).toBe('cierre')
    })
  })

  it('al pasar de una pestaña a otra no se pierde lo escrito', async () => {
    const usuario = await abrirPestana('Drenaje')
    await usuario.type(screen.getByLabelText('Sumideros'), '0+010')
    await usuario.selectOptions(screen.getByLabelText('Punto del perfil'), 'p-bd')

    await usuario.click(screen.getByRole('tab', { name: 'Volúmenes' }))
    await usuario.selectOptions(screen.getByLabelText('Superficie de abajo'), 'proyecto:cap-base')
    const factor = screen.getByLabelText('Factor de esponjamiento')
    await usuario.clear(factor)
    await usuario.type(factor, '1.3')

    await usuario.click(screen.getByRole('tab', { name: 'Drenaje' }))
    expect(screen.getByLabelText('Sumideros')).toHaveValue('0+010')
    expect(screen.getByLabelText('Punto del perfil')).toHaveDisplayValue('Borde derecho')

    await usuario.click(screen.getByRole('tab', { name: 'Volúmenes' }))
    expect(screen.getByLabelText('Superficie de abajo')).toHaveDisplayValue('Proyecto · BASE')
    expect(screen.getByLabelText('Factor de esponjamiento')).toHaveValue('1.30')
  })

  it('las pestañas se recorren con las flechas, y solo la activa está en el orden de Tab', async () => {
    const usuario = userEvent.setup()
    render(<PantallaAnalisis />)
    const espesores = screen.getByRole('tab', { name: 'Espesores' })
    expect(espesores).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Drenaje' })).toHaveAttribute('tabindex', '-1')

    espesores.focus()
    await usuario.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Volúmenes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Volúmenes' })).toHaveFocus()

    await usuario.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Drenaje' })).toHaveFocus()
    await usuario.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Espesores' })).toHaveAttribute('aria-selected', 'true')
    await usuario.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Drenaje' })).toHaveAttribute('aria-selected', 'true')
    await usuario.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Espesores' })).toHaveFocus()
  })

  it('sin calle activa lo dice', () => {
    useAlmacen.getState().activarCalle(null)
    render(<PantallaAnalisis />)
    expect(screen.getByText(/No hay una calle activa/)).toBeInTheDocument()
  })
})
