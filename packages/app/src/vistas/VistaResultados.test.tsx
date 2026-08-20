import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { calcularCampania, compararCapas, type Campania } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { armarCabeceraComparacion } from '../archivo/exportar'
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

/**
 * La misma campaña, pero con el circuito sin cerrar: es la forma más directa
 * de reproducir "el circuito no se verificó", el motivo del defecto real que
 * corrige esta tarea (una campaña que nunca llegó a cerrar contra un banco
 * de nivel).
 */
function conCircuitoAbierto(campania: Campania): Campania {
  return {
    ...campania,
    estado: 'abierta',
    cierre: { ...campania.cierre, tipo: 'abierto', bmFinalId: undefined },
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

  it('sin una comparación elegida, no hay botones para exportar espesores', () => {
    render(<VistaResultados />)

    expect(screen.queryByRole('button', { name: /Exportar espesores/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Exportar cotas a Excel/ })).toBeInTheDocument()
  })

  it('con una comparación elegida, los botones de exportar dejan claro si bajan cotas o espesores', () => {
    const proyecto = proyectoEjemplo()
    proyecto.campanias.push(campaniaTerreno())
    useAlmacen.getState().cargarProyecto(proyecto)
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')

    render(<VistaResultados />)

    expect(screen.getByRole('button', { name: /Exportar cotas a Excel/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Exportar espesores a Excel/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Exportar cotas a CSV/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Exportar espesores a CSV/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copiar cotas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copiar espesores' })).toBeInTheDocument()
  })

  it('si la capa de abajo no cierra, la pantalla avisa y la nombra, aunque la de arriba sí cierre', () => {
    const proyecto = proyectoEjemplo()
    proyecto.campanias.push(conCircuitoAbierto(campaniaTerreno()))
    useAlmacen.getState().cargarProyecto(proyecto)
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')

    render(<VistaResultados />)

    expect(screen.getByRole('heading', { name: 'Espesores no comprobados' })).toBeInTheDocument()
    const aviso = screen.getByText(/ESPESORES NO COMPROBADOS/)
    expect(aviso.textContent).toContain('TERRENO EXISTENTE')
    expect(aviso.textContent).not.toContain('SUBRASANTE')
  })

  it('si la capa de arriba no cierra, la pantalla avisa y la nombra, aunque la de abajo sí cierre', () => {
    const proyecto = proyectoEjemplo()
    const subrasanteAbierta = conCircuitoAbierto(proyecto.campanias[0]!)
    proyecto.campanias = [subrasanteAbierta, campaniaTerreno()]
    useAlmacen.getState().cargarProyecto(proyecto)
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')

    render(<VistaResultados />)

    expect(screen.getByRole('heading', { name: 'Espesores no comprobados' })).toBeInTheDocument()
    const aviso = screen.getByText(/ESPESORES NO COMPROBADOS/)
    expect(aviso.textContent).toContain('SUBRASANTE')
    expect(aviso.textContent).not.toContain('TERRENO EXISTENTE')
  })

  it('si ninguna de las dos capas cierra, la pantalla nombra a las dos', () => {
    const proyecto = proyectoEjemplo()
    const subrasanteAbierta = conCircuitoAbierto(proyecto.campanias[0]!)
    proyecto.campanias = [subrasanteAbierta, conCircuitoAbierto(campaniaTerreno())]
    useAlmacen.getState().cargarProyecto(proyecto)
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')

    render(<VistaResultados />)

    const aviso = screen.getByText(/ESPESORES NO COMPROBADOS/)
    expect(aviso.textContent).toContain('TERRENO EXISTENTE')
    expect(aviso.textContent).toContain('SUBRASANTE')
  })

  it('cuando las dos campañas cierran, la pantalla dice que los espesores están verificados', () => {
    const proyecto = proyectoEjemplo()
    proyecto.campanias.push(campaniaTerreno())
    useAlmacen.getState().cargarProyecto(proyecto)
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')

    render(<VistaResultados />)

    expect(screen.getByRole('heading', { name: 'Espesores comprobados' })).toBeInTheDocument()
    expect(screen.getByText(/ESPESORES VERIFICADOS/)).toBeInTheDocument()
  })

  // El requisito no es que el texto "se parezca" al de la cabecera del
  // archivo exportado: tiene que ser exactamente el mismo, porque los dos
  // salen de la misma función (`calcularEstadoComparacion`). Se compara
  // contra lo que arma `armarCabeceraComparacion` — la misma función que usa
  // `exportar.ts` — y no contra una cadena copiada a mano, que podría quedar
  // desactualizada sin que la prueba se enterara.
  it('el texto que ve el topógrafo es exactamente el mismo que lleva la cabecera del archivo exportado', () => {
    const proyecto = proyectoEjemplo()
    const subrasanteAbierta = conCircuitoAbierto(proyecto.campanias[0]!)
    const terreno = campaniaTerreno()
    proyecto.campanias = [subrasanteAbierta, terreno]
    useAlmacen.getState().cargarProyecto(proyecto)
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')

    render(<VistaResultados />)

    const calle = proyecto.calles[0]!
    const plantilla = proyecto.plantillas[0]!
    const resultadoInferior = calcularCampania({ campania: terreno, calle, plantilla, bms: proyecto.bms })
    const resultadoSuperior = calcularCampania({ campania: subrasanteAbierta, calle, plantilla, bms: proyecto.bms })
    const capaInferior = proyecto.capas.find((c) => c.id === terreno.capaId)
    const capaSuperior = proyecto.capas.find((c) => c.id === subrasanteAbierta.capaId)

    const cabecera = armarCabeceraComparacion({
      calle,
      capaInferior,
      capaSuperior,
      campaniaInferior: terreno,
      campaniaSuperior: subrasanteAbierta,
      resultadoInferior,
      resultadoSuperior,
      comparacion: compararCapas(resultadoInferior, resultadoSuperior),
    })
    const textoDeCabecera = cabecera.find((fila) => fila[0] === 'Estado')![1]!

    expect(textoDeCabecera).toContain('ESPESORES NO COMPROBADOS')
    expect(screen.getByText(textoDeCabecera)).toBeInTheDocument()
  })

  // Regresión del arreglo que hizo que CorteTransversal reciba `idsVisibles`
  // por parámetro: Resultados es la única pantalla que debe seguir mandando
  // `capasVisibles` sobre lo que dibuja el corte.
  it('con dos capas marcadas en el selector, el corte sigue dibujando las dos con su etiqueta', () => {
    const proyecto = proyectoEjemplo()
    proyecto.campanias.push(campaniaTerreno())
    useAlmacen.getState().cargarProyecto(proyecto)
    useAlmacen.getState().alternarCapaVisible('camp-1')
    useAlmacen.getState().alternarCapaVisible('camp-terreno')

    render(<VistaResultados />)

    const corte = screen.getByRole('img', { name: /Corte transversal en 0\+000/ })
    expect(within(corte).getByText('TERRENO EXISTENTE')).toBeInTheDocument()
    expect(within(corte).getByText('SUBRASANTE')).toBeInTheDocument()
  })
})
