import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { calcularCampania, compararCapas, type Proyecto, type Rasante, type Toma } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { armarCabeceraComparacion } from '../archivo/exportar'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import { agregarTomaComoNivelacion, buscarToma, conToma } from '../estado/proyectoTomas'
import VistaResultados from './VistaResultados'

/** Misma rasante de ejemplo que usa `TablaDiferencias.test.tsx`. */
function rasanteDeEjemplo(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 3245.18,
    pendienteLongitudinal: -1.25,
    tramos: [
      { nombre: 'Calzada', hastaOffset: 4.2, tipo: 'pendiente', valor: 2 },
      { nombre: 'Sardinel', hastaOffset: 4.4, tipo: 'salto', valor: 0.15 },
      { nombre: 'Vereda', hastaOffset: 5.6, tipo: 'pendiente', valor: -2 },
    ],
    simetrica: true,
    tramosIzquierda: null,
  }
}

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
 * TablaResultados y TablaEspesores— convivan en pantalla. La asociación con
 * la calle 'c-1' ya no vive en la toma: la pone quien la agrega al proyecto,
 * con `conTerreno` más abajo.
 */
function campaniaTerreno(): Toma {
  return {
    id: 'camp-terreno',
    fecha: '2026-08-10',
    capaId: 'cap-terreno',
    bmInicialId: 'bm-1',
    cierre: CIERRE_CERRADO,
    estaciones: [
      {
        id: 'et-1',
        vistaAtras: { id: 'lt-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.0 },
        intermedias: [
          {
            id: 'lt-2',
            destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-eje' } },
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
 * de nivel). El veredicto ya no sale de un campo `estado` guardado: sale de
 * `cierre.pasa`, que calcula `calcularCampania` a partir de `cierre.tipo`.
 */
function conCircuitoAbierto(campania: Toma): Toma {
  return {
    ...campania,
    cierre: { ...campania.cierre, tipo: 'abierto', bmFinalId: undefined },
  }
}

/** Agrega la toma de terreno como su propia nivelación en la calle del ejemplo. */
function conTerreno(proyecto: Proyecto, toma: Toma = campaniaTerreno()): Proyecto {
  return agregarTomaComoNivelacion(proyecto, 'c-1', toma, 'niv-terreno')
}

/** Reemplaza camp-1 (la toma de SUBRASANTE del ejemplo) por otra versión, dondequiera que esté. */
function conCampUno(proyecto: Proyecto, transformar: (toma: Toma) => Toma): Proyecto {
  return conToma(proyecto, 'camp-1', transformar)
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

    await usuario.selectOptions(screen.getByLabelText('Elemento del perfil'), 'p-borde-i')

    expect(screen.getByRole('img', { name: /Perfil longitudinal de BOR-I/ })).toBeInTheDocument()
  })

  it('con el cierre fuera de tolerancia, el título dice que las cotas no están compensadas y se ve el veredicto', () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const lecturaId = buscarToma(useAlmacen.getState().proyecto, 'camp-1')!.toma.estaciones[1]!.vistaAdelante!.id
    useAlmacen.getState().actualizarLectura(campaniaId, lecturaId, 1.887)

    render(<VistaResultados />)

    expect(screen.getByText('Cotas sin compensar')).toBeInTheDocument()
    expect(screen.queryByText('Cotas compensadas')).not.toBeInTheDocument()
    // La rasante por defecto del ejemplo hace que el grupo de "Diferencias"
    // muestre su propio "NO COMPROBADAS" a la vez que el veredicto de
    // cierre: basta con que aparezca al menos una vez.
    expect(screen.getAllByText(/NO COMPROBADAS/).length).toBeGreaterThan(0)
  })

  it('el perfil cae a otro elemento si el elegido ya no está en la plantilla', async () => {
    render(<VistaResultados />)
    const calle = useAlmacen.getState().proyecto.calles[0]!

    // La mutación llega desde fuera de un evento de usuario (como lo haría el
    // editor de la calle en otra pantalla), así que hay que envolverla en
    // act() para que React aplique el re-render antes de la aserción.
    act(() => {
      useAlmacen.getState().actualizarCalle(calle.id, {
        seccion: {
          ...calle.seccion,
          puntos: calle.seccion.puntos.filter((punto) => punto.id !== 'p-eje'),
        },
      })
    })

    expect(screen.queryByRole('img', { name: /Perfil longitudinal de EJE/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Elemento del perfil')).not.toHaveValue('p-eje')
  })

  it('con una comparación elegida, la tabla de cotas y la de espesores conviven sin que sus nombres se confundan', () => {
    const proyecto = conTerreno(proyectoEjemplo())
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
    const proyecto = conTerreno(proyectoEjemplo())
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
    const proyecto = conTerreno(proyectoEjemplo(), conCircuitoAbierto(campaniaTerreno()))
    useAlmacen.getState().cargarProyecto(proyecto)
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')

    render(<VistaResultados />)

    expect(screen.getByRole('heading', { name: 'Espesores no comprobados' })).toBeInTheDocument()
    const aviso = screen.getByText(/ESPESORES NO COMPROBADOS/)
    expect(aviso.textContent).toContain('TERRENO EXISTENTE')
    expect(aviso.textContent).not.toContain('SUBRASANTE')
  })

  it('si la capa de arriba no cierra, la pantalla avisa y la nombra, aunque la de abajo sí cierre', () => {
    let proyecto = proyectoEjemplo()
    const subrasanteAbierta = conCircuitoAbierto(buscarToma(proyecto, 'camp-1')!.toma)
    proyecto = conCampUno(proyecto, () => subrasanteAbierta)
    proyecto = conTerreno(proyecto)
    useAlmacen.getState().cargarProyecto(proyecto)
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')

    render(<VistaResultados />)

    expect(screen.getByRole('heading', { name: 'Espesores no comprobados' })).toBeInTheDocument()
    const aviso = screen.getByText(/ESPESORES NO COMPROBADOS/)
    expect(aviso.textContent).toContain('SUBRASANTE')
    expect(aviso.textContent).not.toContain('TERRENO EXISTENTE')
  })

  it('si ninguna de las dos capas cierra, la pantalla nombra a las dos', () => {
    let proyecto = proyectoEjemplo()
    const subrasanteAbierta = conCircuitoAbierto(buscarToma(proyecto, 'camp-1')!.toma)
    proyecto = conCampUno(proyecto, () => subrasanteAbierta)
    proyecto = conTerreno(proyecto, conCircuitoAbierto(campaniaTerreno()))
    useAlmacen.getState().cargarProyecto(proyecto)
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')

    render(<VistaResultados />)

    const aviso = screen.getByText(/ESPESORES NO COMPROBADOS/)
    expect(aviso.textContent).toContain('TERRENO EXISTENTE')
    expect(aviso.textContent).toContain('SUBRASANTE')
  })

  it('cuando las dos campañas cierran, la pantalla dice que los espesores están verificados', () => {
    const proyecto = conTerreno(proyectoEjemplo())
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
    let proyecto = proyectoEjemplo()
    const subrasanteAbierta = conCircuitoAbierto(buscarToma(proyecto, 'camp-1')!.toma)
    const terreno = campaniaTerreno()
    proyecto = conCampUno(proyecto, () => subrasanteAbierta)
    proyecto = conTerreno(proyecto, terreno)
    useAlmacen.getState().cargarProyecto(proyecto)
    useAlmacen.getState().fijarComparacion('camp-terreno', 'camp-1')

    render(<VistaResultados />)

    const calle = proyecto.calles[0]!
    const resultadoInferior = calcularCampania({ campania: terreno, calle, bms: proyecto.bms })
    const resultadoSuperior = calcularCampania({ campania: subrasanteAbierta, calle, bms: proyecto.bms })
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
    const proyecto = conTerreno(proyectoEjemplo())
    useAlmacen.getState().cargarProyecto(proyecto)
    useAlmacen.getState().alternarCapaVisible('camp-1')
    useAlmacen.getState().alternarCapaVisible('camp-terreno')

    render(<VistaResultados />)

    const corte = screen.getByRole('img', { name: /Corte transversal en 0\+000/ })
    expect(within(corte).getByText('TERRENO EXISTENTE')).toBeInTheDocument()
    expect(within(corte).getByText('SUBRASANTE')).toBeInTheDocument()
  })

  // Las cuatro vistas de control contra el proyecto (Diferencias, Mapa,
  // Corte, Perfil) viven ahora bajo un solo grupo con un único aviso arriba
  // — este es el arreglo del defecto que bloqueaba la rama: antes solo la
  // tabla de Diferencias llevaba veredicto, y el mapa y el corte seguían en
  // verde con una nivelación que ya no cerraba. Se afirma el texto del
  // aviso, no solo que exista algún componente.
  it('con una rasante definida y el circuito cerrado, el aviso único dice que las cuatro vistas están verificadas', () => {
    useAlmacen.getState().fijarRasante('c-1', rasanteDeEjemplo())

    render(<VistaResultados />)

    const grupo = screen.getByRole('heading', { name: 'Control contra el proyecto' }).parentElement!
    expect(
      within(grupo).getByText('DIFERENCIAS VERIFICADAS — el circuito de la campaña cierra dentro de tolerancia'),
    ).toBeInTheDocument()

    // Las cinco vistas están agrupadas bajo el mismo aviso: ninguna quedó
    // fuera del grupo ni con un veredicto aparte.
    expect(within(grupo).getByRole('heading', { name: 'Modelo 3D' })).toBeInTheDocument()
    expect(within(grupo).getByRole('heading', { name: 'Diferencias' })).toBeInTheDocument()
    expect(within(grupo).getByRole('heading', { name: 'Mapa de la calle' })).toBeInTheDocument()
    expect(within(grupo).getByRole('heading', { name: 'Corte transversal' })).toBeInTheDocument()
    expect(within(grupo).getByRole('heading', { name: 'Perfil longitudinal' })).toBeInTheDocument()

    // La misma celda aparece más de una vez en pantalla (tabla y mapa), así
    // que se acota a la sección de la tabla de diferencias con `within`.
    const encabezadoTabla = within(grupo).getByRole('heading', { name: 'Diferencias' })
    const etiqueta = within(encabezadoTabla.closest('section')!)
      .getByLabelText(/0\+000 EJE/)
      .getAttribute('aria-label')
    expect(etiqueta).toMatch(/−334 mm/)
    expect(etiqueta).toMatch(/rellenar/)
  })

  // El mismo defecto que ya se corrigió para los espesores (VistaResultados
  // > "si la capa de abajo no cierra..."), aplicado ahora a las cuatro
  // vistas de control contra el proyecto: un semáforo verde sobre una
  // nivelación sin comprobar sigue siendo una cota sin comprobar, la vea el
  // topógrafo en la tabla, el mapa, el corte o el perfil.
  it('con una rasante definida pero el circuito sin cerrar, el aviso único dice que las cuatro vistas no están comprobadas', () => {
    useAlmacen.getState().fijarRasante('c-1', rasanteDeEjemplo())
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const lecturaId = buscarToma(useAlmacen.getState().proyecto, 'camp-1')!.toma.estaciones[1]!.vistaAdelante!.id
    useAlmacen.getState().actualizarLectura(campaniaId, lecturaId, 1.887)

    render(<VistaResultados />)

    const grupo = screen.getByRole('heading', { name: 'Control contra el proyecto' }).parentElement!
    expect(within(grupo).getByText(/DIFERENCIAS NO COMPROBADAS/)).toBeInTheDocument()
    expect(within(grupo).getByRole('heading', { name: 'Modelo 3D' })).toBeInTheDocument()
    expect(within(grupo).getByRole('heading', { name: 'Diferencias' })).toBeInTheDocument()
    expect(within(grupo).getByRole('heading', { name: 'Mapa de la calle' })).toBeInTheDocument()
    expect(within(grupo).getByRole('heading', { name: 'Corte transversal' })).toBeInTheDocument()
    expect(within(grupo).getByRole('heading', { name: 'Perfil longitudinal' })).toBeInTheDocument()
  })

  it('sin rasante en la calle, la sección invita a definirla en vez de mostrar un semáforo vacío', () => {
    useAlmacen.getState().fijarRasante('c-1', null)
    render(<VistaResultados />)

    const encabezado = screen.getByRole('heading', { name: 'Diferencias' })
    expect(encabezado).toBeInTheDocument()
    expect(within(encabezado.closest('section')!).getByText(/define la rasante/i)).toBeInTheDocument()
    // Sin rasante no hay nada que verificar todavía: el aviso de veredicto no
    // debe aparecer.
    expect(screen.queryByText(/DIFERENCIAS (VERIFICADAS|NO COMPROBADAS)/)).not.toBeInTheDocument()
  })

  // El mapa de la calle mira la misma rasante que la tabla de diferencias:
  // sin una definida, invita a definirla en vez de dibujar una rejilla vacía.
  it('sin rasante en la calle, el mapa también invita a definirla', () => {
    useAlmacen.getState().fijarRasante('c-1', null)
    render(<VistaResultados />)

    const encabezado = screen.getByRole('heading', { name: 'Mapa de la calle' })
    expect(encabezado).toBeInTheDocument()
    expect(within(encabezado.closest('section')!).getByText(/define la rasante/i)).toBeInTheDocument()
  })

  // ControlesVista3D existía, estaba probado y no estaba montado en ninguna
  // pantalla: en Resultados no había botón de Planta, ni de Alzado, ni de
  // Isométrico, ni deslizador de inclinación, ni de exageración — cero de
  // cinco. Esta prueba fija que desde Resultados se llega a los cinco.
  it('desde Resultados se llega a los controles del visor 3D: modo, vistas guardadas, giro, inclinación y exageración', () => {
    useAlmacen.getState().fijarRasante('c-1', rasanteDeEjemplo())
    render(<VistaResultados />)

    const grupo = screen.getByRole('heading', { name: 'Modelo 3D' }).closest('section')!

    expect(within(grupo).getByRole('button', { name: 'Estado' })).toBeInTheDocument()
    expect(within(grupo).getByRole('button', { name: 'Capas' })).toBeInTheDocument()
    expect(within(grupo).getByRole('button', { name: 'Planta' })).toBeInTheDocument()
    expect(within(grupo).getByRole('button', { name: 'Alzado' })).toBeInTheDocument()
    expect(within(grupo).getByRole('button', { name: 'Isométrico' })).toBeInTheDocument()
    expect(within(grupo).getByLabelText('Inclinación')).toBeInTheDocument()
    expect(within(grupo).getByLabelText('Exageración')).toBeInTheDocument()
  })
})
