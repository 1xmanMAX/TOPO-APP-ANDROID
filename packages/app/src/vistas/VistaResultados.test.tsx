import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Campania } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import VistaResultados from './VistaResultados'

const CIERRE_CERRADO = {
  tipo: 'cerrado' as const,
  bmFinalId: 'bm-1',
  longitudK: 0.36,
  longitudKAuto: true,
  clase: 'tercerOrden' as const,
  coeficiente: 12,
}

/**
 * Segunda campaña (TERRENO EXISTENTE) sobre la misma calle que camp-1
 * (SUBRASANTE), para poder fijar una comparación y que ambas tablas —
 * TablaResultados y TablaEspesores— convivan en pantalla.
 */
function campaniaTerreno(): Campania {
  return {
    id: 'camp-terreno',
    fecha: '2026-08-10',
    calleId: 'c-1',
    capaId: 'cap-terreno',
    bmInicialId: 'bm-1',
    estado: 'cerrada',
    cierre: CIERRE_CERRADO,
    estaciones: [
      {
        id: 'et-1',
        vistaAtras: { id: 'lt-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.0 },
        intermedias: [
          {
            id: 'lt-2',
            destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } },
            valor: 1.78,
          },
        ],
        vistaAdelante: { id: 'lt-3', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.0 },
      },
    ],
  }
}

describe('VistaResultados', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('al elegir una celda de la tabla, el corte salta a esa progresiva', async () => {
    const usuario = userEvent.setup()
    render(<VistaResultados />)

    await usuario.click(screen.getByLabelText(/Cota en 0\+020 EJE/))

    expect(screen.getByRole('img', { name: /Corte transversal en 0\+020/ })).toBeInTheDocument()
  })

  it('sigue al usuario hasta una progresiva sin lecturas', async () => {
    const usuario = userEvent.setup()
    render(<VistaResultados />)

    await usuario.click(screen.getByLabelText(/Cota en 0\+040 EJE/))

    expect(useAlmacen.getState().seleccion.progresiva).toBe(40)
    expect(screen.getByLabelText('Progresiva')).toHaveValue('2')
  })

  it('el perfil cambia de elemento al elegir otro en el desplegable', async () => {
    const usuario = userEvent.setup()
    render(<VistaResultados />)

    await usuario.selectOptions(screen.getByLabelText('Elemento del perfil'), 'BOR-I')

    expect(screen.getByRole('img', { name: /Perfil longitudinal de BOR-I/ })).toBeInTheDocument()
  })

  it('con el cierre fuera de tolerancia, el título dice que las cotas no están compensadas y se ve el veredicto', () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const lecturaId = useAlmacen.getState().proyecto.campanias[0]!.estaciones[1]!.vistaAdelante!.id
    useAlmacen.getState().actualizarLectura(campaniaId, lecturaId, 1.887)

    render(<VistaResultados />)

    expect(screen.getByText('Cotas sin compensar')).toBeInTheDocument()
    expect(screen.queryByText('Cotas compensadas')).not.toBeInTheDocument()
    expect(screen.getByText(/NO COMPROBADAS/)).toBeInTheDocument()
  })

  it('el perfil cae a otro elemento si el elegido ya no está en la plantilla', async () => {
    render(<VistaResultados />)
    const plantilla = useAlmacen.getState().proyecto.plantillas[0]!

    // La mutación llega desde fuera de un evento de usuario (como lo haría el
    // editor de plantilla en otra pantalla), así que hay que envolverla en
    // act() para que React aplique el re-render antes de la aserción.
    act(() => {
      useAlmacen.getState().actualizarPlantilla(plantilla.id, {
        elementos: plantilla.elementos.filter((elemento) => elemento.clave !== 'EJE'),
      })
    })

    expect(screen.queryByRole('img', { name: /Perfil longitudinal de EJE/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Elemento del perfil')).not.toHaveValue('EJE')
  })

  it('con una comparación elegida, la tabla de cotas y la de espesores conviven sin que sus nombres se confundan', () => {
    const proyecto = proyectoEjemplo()
    proyecto.campanias.push(campaniaTerreno())
    useAlmacen.getState().cargarProyecto(proyecto)
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')

    render(<VistaResultados />)

    // Ambas tablas dibujan una celda en 0+000 EJE: una es la cota, otra el
    // espesor. Antes de la corrección, las dos compartían el mismo nombre
    // accesible («0+000 EJE») y no había forma de pedir «la de la tabla de
    // cotas» sin ambigüedad. getByLabelText lanza si hay más de una
    // coincidencia, así que cada consulta por separado ya prueba que no se
    // confunden.
    const cota = screen.getByLabelText(/^Cota en 0\+000 EJE:/)
    const espesor = screen.getByLabelText(/^Espesor en 0\+000 EJE:/)

    expect(cota).not.toBe(espesor)
    expect(cota.getAttribute('aria-label')).not.toBe(espesor.getAttribute('aria-label'))
  })
})
