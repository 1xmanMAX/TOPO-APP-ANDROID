import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Calle, Lectura, Proyecto, Toma } from '@topo/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlmacen } from '../../estado/almacen'
import EspacioCalle from './EspacioCalle'

// Las notas son de otro agente: aquí solo importa que Revisar las monte con
// la calle activa, no lo que pinten por dentro.
vi.mock('../herramientas/NotasDeCalle', () => ({
  default: ({ calleId }: { calleId: string }) => <p data-testid="notas-de-calle">{calleId}</p>,
}))

/**
 * Una calle de 8 m de calzada, rasante plana en 99.000 con bombeo del 2 %
 * (los bordes a ±4 m quedan en 98.920), y una libreta de una sola estación
 * desde el BM-1 (100.000) con vista atrás 1.500: AI 101.500.
 *
 * Lo medido en 0+000 da los tres estados a la vez, tolerancia ±20 mm:
 * - eje 2.500 → 99.000, 0 mm, conforme;
 * - borde izquierdo 2.550 → 98.950, +30 mm, al límite (corta 30);
 * - borde derecho 2.650 → 98.850, −70 mm, fuera (rellena 70).
 * En 0+010 solo el eje: 2.505 → 98.995, −5 mm, conforme. Los bordes de
 * 0+010 quedan sin medir.
 */
function lectura(id: string, progresiva: number, elementoClave: string, valor: number): Lectura {
  return { id, destino: { tipo: 'celda', celda: { progresiva, elementoClave } }, valor }
}

function tomaSubrasante(cerrada: boolean): Toma {
  return {
    id: 'toma-sub',
    fecha: '2026-10-01',
    capaId: 'cap-sub',
    bmInicialId: 'bm-1',
    progresivasDeclaradas: [0, 10],
    cierre: cerrada
      ? { tipo: 'cerrado', bmFinalId: 'bm-1', longitudK: 0.1, longitudKAuto: false, clase: 'tercerOrden', coeficiente: 12 }
      : { tipo: 'abierto', longitudK: 0, longitudKAuto: true, clase: 'tercerOrden', coeficiente: 12 },
    estaciones: [
      {
        id: 'e-1',
        vistaAtras: { id: 'va-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.5 },
        intermedias: [
          lectura('l-bi', 0, 'p-bi', 2.55),
          lectura('l-eje', 0, 'p-eje', 2.5),
          lectura('l-bd', 0, 'p-bd', 2.65),
          lectura('l-eje10', 10, 'p-eje', 2.505),
        ],
        ...(cerrada ? { vistaAdelante: { id: 'vd-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.5 } } : {}),
      },
    ],
  }
}

function tomaTerreno(): Toma {
  return {
    id: 'toma-ter',
    fecha: '2026-09-01',
    capaId: 'cap-ter',
    bmInicialId: 'bm-1',
    progresivasDeclaradas: [0],
    cierre: { tipo: 'abierto', longitudK: 0, longitudKAuto: true, clase: 'tercerOrden', coeficiente: 12 },
    estaciones: [
      {
        id: 'et-1',
        vistaAtras: { id: 'vat-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.5 },
        intermedias: [lectura('lt-eje', 0, 'p-eje', 2.7)],
      },
    ],
  }
}

function calle(cerrada: boolean): Calle {
  return {
    id: 'c-prueba',
    nombre: 'Jr. Prueba',
    seccion: {
      puntos: [
        { id: 'p-bi', rol: 'bordeCalzada', nombre: 'Borde izquierdo', distancia: -4, distanciaDeFabrica: false, palabras: ['BI'] },
        { id: 'p-eje', rol: 'eje', nombre: 'Eje', distancia: 0, distanciaDeFabrica: false, palabras: ['EJE'] },
        { id: 'p-bd', rol: 'bordeCalzada', nombre: 'Borde derecho', distancia: 4, distanciaDeFabrica: false, palabras: ['BD'] },
      ],
      palabrasProgresiva: ['PROG'],
      palabrasPuntoControl: ['PC'],
      palabrasReferencia: ['REF'],
    },
    rasante: {
      progresivaArranque: 0,
      cotaArranque: 99,
      pendienteLongitudinal: 0,
      tramos: [{ nombre: 'Calzada', hastaOffset: 4, tipo: 'pendiente', valor: 2 }],
      simetrica: true,
      tramosIzquierda: null,
    },
    nivelaciones: [
      { id: 'niv-sub', nombre: 'Subrasante', color: '#2563eb', tomas: [tomaSubrasante(cerrada)] },
      { id: 'niv-ter', nombre: 'Terreno', color: '#dc2626', tomas: [tomaTerreno()] },
    ],
  }
}

function proyecto({ cerrada = true }: { cerrada?: boolean } = {}): Proyecto {
  return {
    version: 1,
    meta: {
      nombre: 'Prueba de la calle',
      obra: '',
      cliente: '',
      ubicacion: '',
      responsable: '',
      creado: '2026-10-01T00:00:00.000Z',
      modificado: '2026-10-01T00:00:00.000Z',
    },
    bms: [
      { id: 'bm-1', nombre: 'BM-1', cota: 100, tipo: 'oficial', descripcion: '' },
      { id: 'bm-2', nombre: 'BM-2', cota: 100.1, tipo: 'auxiliar', descripcion: '' },
    ],
    capas: [
      { id: 'cap-ter', nombre: 'TERRENO', orden: 0, espesor: 0, toleranciaMm: 20 },
      { id: 'cap-sub', nombre: 'SUBRASANTE', orden: 1, espesor: 0, toleranciaMm: 20 },
    ],
    calles: [calle(cerrada)],
  }
}

/**
 * La misma calle, pero la toma de subrasante vuelve a arrancar en el BM-1 en
 * la estación 2: el cierre (que pasa, 0 mm) solo respalda desde ahí. Lo de
 * 0+000 se midió en la estación 1, fuera del circuito; el eje de 0+010, en
 * la 2, dentro.
 */
function proyectoConReArranque(): Proyecto {
  const datos = proyecto()
  const toma = datos.calles[0]!.nivelaciones[0]!.tomas[0]!
  toma.estaciones = [
    {
      id: 'e-1',
      vistaAtras: { id: 'va-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.5 },
      intermedias: [lectura('l-bi', 0, 'p-bi', 2.55), lectura('l-eje', 0, 'p-eje', 2.5), lectura('l-bd', 0, 'p-bd', 2.65)],
      vistaAdelante: { id: 'vd-1', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 1.0 },
    },
    {
      id: 'e-2',
      vistaAtras: { id: 'va-2', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.5 },
      intermedias: [lectura('l-eje10', 10, 'p-eje', 2.505)],
      vistaAdelante: { id: 'vd-2', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.5 },
    },
  ]
  return datos
}

/** La misma calle sin rasante de proyecto: solo hay cotas, no diferencias. */
function proyectoSinRasante(): Proyecto {
  const datos = proyecto()
  datos.calles[0]!.rasante = null
  return datos
}

function cargar(datos: Proyecto, modo: 'medir' | 'revisar' | 'replantear' = 'medir') {
  useAlmacen.getState().cargarProyecto(datos)
  useAlmacen.getState().activarCampania('toma-sub')
  useAlmacen.setState({ espacio: 'calle', modoCalle: modo, pantallaCalle: null, seleccion: { clave: null, progresiva: null } })
}

/** El mapa de la calle: el corte también tiene botones con el nombre de cada punto. */
function mapa() {
  return screen.getByRole('region', { name: 'Mapa de la calle' })
}

beforeEach(() => cargar(proyecto()))

describe('EspacioCalle: lo común a los tres modos', () => {
  it('dibuja el corte de entrada y cambia a perfil y 3D', async () => {
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    const vistas = screen.getByRole('group', { name: 'Vista de la calle' })
    expect(within(vistas).getByRole('button', { name: 'Corte' })).toHaveAttribute('aria-pressed', 'true')

    await usuario.click(within(vistas).getByRole('button', { name: 'Perfil' }))
    expect(within(vistas).getByRole('button', { name: 'Perfil' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Elemento del perfil')).toBeInTheDocument()

    await usuario.click(within(vistas).getByRole('button', { name: '3D' }))
    expect(within(vistas).getByRole('button', { name: '3D' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('group', { name: 'Girar el modelo' })).toBeInTheDocument()
  })

  it('el dibujo elegido se conserva al cambiar de modo', async () => {
    const usuario = userEvent.setup()
    render(<EspacioCalle />)
    await usuario.click(screen.getByRole('button', { name: 'Perfil' }))

    act(() => useAlmacen.getState().fijarModoCalle('revisar'))
    expect(await screen.findByRole('heading', { name: 'Revisar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Perfil' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('la capa activa se cambia desde la calle', async () => {
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    const capa = screen.getByLabelText('Capa activa')
    expect(capa).toHaveValue('toma-sub')
    expect(within(capa).getByRole('option', { name: 'TERRENO · 2026-09-01' })).toBeInTheDocument()

    await usuario.selectOptions(capa, 'TERRENO · 2026-09-01')
    expect(useAlmacen.getState().campaniaActivaId).toBe('toma-ter')
  })

  it('tocar una celda del mapa la elige y el corte salta a su progresiva', async () => {
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    await usuario.click(within(mapa()).getByRole('button', { name: '0+010 Eje: medida' }))

    expect(useAlmacen.getState().seleccion).toEqual({ clave: '10|p-eje', progresiva: 10 })
    expect(screen.getByLabelText('Progresiva')).toHaveValue('1')
    expect(screen.getByText(/celda activa/i)).toHaveTextContent('0+010 Eje')
  })

  it('sin calle activa lo dice', () => {
    useAlmacen.setState({ calleActivaId: null })
    render(<EspacioCalle />)
    expect(screen.getByText(/elige una calle/i)).toBeInTheDocument()
  })

  it('una calle sin capas medidas manda a crearlas', () => {
    const datos = proyecto()
    datos.calles[0]!.nivelaciones = []
    useAlmacen.getState().cargarProyecto(datos)
    render(<EspacioCalle />)
    expect(screen.getByText(/todavía no tiene ninguna capa medida/i)).toBeInTheDocument()
  })
})

describe('Medir', () => {
  it('antes de escribir dice qué lectura se espera y entre cuáles queda conforme', () => {
    useAlmacen.getState().seleccionar('10|p-bi')
    render(<EspacioCalle />)

    const aviso = screen.getByRole('region', { name: 'Aviso al anotar' })
    // 101.500 − 98.920 = 2.580, ±20 mm.
    expect(aviso).toHaveTextContent('Lectura esperada 2.580')
    expect(aviso).toHaveTextContent('conforme entre 2.560 y 2.600')
  })

  it('avisa al instante mientras se escribe, con «¿leíste bien?» si la lectura es sospechosa', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().seleccionar('10|p-bi')
    render(<EspacioCalle />)

    const campo = screen.getByLabelText('Lectura de mira')
    await usuario.type(campo, '2.590')
    const aviso = screen.getByRole('region', { name: 'Aviso al anotar' })
    // 101.500 − 2.590 = 98.910 → −10 mm.
    expect(aviso).toHaveTextContent('conforme')
    expect(aviso).toHaveTextContent('−10 mm')
    expect(aviso).toHaveTextContent('rellena 10 mm')
    expect(aviso).toHaveTextContent('98.910')
    expect(within(aviso).queryByRole('alert')).not.toBeInTheDocument()

    await usuario.clear(campo)
    await usuario.type(campo, '2,700')
    // Con coma decimal: 98.800 → −120 mm, más del doble de la tolerancia.
    expect(aviso).toHaveTextContent('fuera de tolerancia')
    expect(aviso).toHaveTextContent('rellena 120 mm')
    // Mientras se escribe se avisa, pero sin alerta: el lector no grita en cada dígito.
    expect(aviso).toHaveTextContent('¿Leíste bien?')
    expect(within(aviso).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('mientras la lectura no llega al milímetro no juzga: solo dice lo esperado', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().seleccionar('10|p-bi')
    render(<EspacioCalle />)

    const campo = screen.getByLabelText('Lectura de mira')
    const aviso = screen.getByRole('region', { name: 'Aviso al anotar' })
    await usuario.type(campo, '1.4')
    expect(aviso).not.toHaveTextContent('fuera de tolerancia')
    expect(aviso).not.toHaveTextContent('¿Leíste bien?')
    expect(aviso).toHaveTextContent('Lectura esperada 2.580')

    await usuario.type(campo, '25')
    expect(aviso).toHaveTextContent('fuera de tolerancia')
  })

  it('una lectura que no cabe en la mira no se guarda: se queda en el campo para corregirla', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().seleccionar('10|p-bi')
    render(<EspacioCalle />)
    const intermedias = () =>
      useAlmacen.getState().proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[0]!.intermedias
    const antes = intermedias().length

    const campo = screen.getByLabelText('Lectura de mira')
    await usuario.type(campo, '14.25{Enter}')
    expect(intermedias()).toHaveLength(antes)
    expect(screen.getByRole('alert')).toHaveTextContent('no cabe en la mira de 5 m: no se anotó')
    expect(campo).toHaveValue('14.25')
    expect(useAlmacen.getState().seleccion.clave).toBe('10|p-bi')

    // Corregida, entra una sola lectura y la celda queda limpia.
    await usuario.clear(campo)
    await usuario.type(campo, '2.580{Enter}')
    const enLaCelda = intermedias().filter(
      (l) => l.destino.tipo === 'celda' && l.destino.celda.progresiva === 10 && l.destino.celda.elementoClave === 'p-bi',
    )
    expect(enLaCelda.map((l) => l.valor)).toEqual([2.58])
  })

  it('después de anotar el campo sigue con el foco, también al tocar «Anotar»', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().seleccionar('10|p-bi')
    render(<EspacioCalle />)

    const campo = screen.getByLabelText('Lectura de mira')
    expect(campo).toHaveAttribute('enterkeyhint', 'done')
    await usuario.type(campo, '2.580')
    await usuario.click(screen.getByRole('button', { name: 'Anotar' }))
    expect(campo).toHaveFocus()
    expect(campo).toHaveValue('')
  })

  it('al llenar la última celda que faltaba dice «grilla completa» y no se queda en la llena', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().seleccionar('10|p-bi')
    render(<EspacioCalle />)

    const campo = screen.getByLabelText('Lectura de mira')
    await usuario.type(campo, '2.580{Enter}')
    expect(useAlmacen.getState().seleccion.clave).toBe('10|p-bd')
    await usuario.type(campo, '2.580{Enter}')
    expect(useAlmacen.getState().seleccion.clave).toBeNull()
    expect(screen.getByText(/celda activa/i)).toHaveTextContent('grilla completa')
    expect(screen.getByRole('button', { name: 'Anotar' })).toBeDisabled()
  })

  it('cambiar de capa olvida la última lectura de la otra toma, que se queda donde se anotó', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().seleccionar('10|p-bi')
    render(<EspacioCalle />)

    await usuario.type(screen.getByLabelText('Lectura de mira'), '2.700{Enter}')
    expect(screen.getByRole('region', { name: /Última lectura anotada/ })).toBeInTheDocument()

    await usuario.selectOptions(screen.getByLabelText('Capa activa'), 'TERRENO · 2026-09-01')
    expect(screen.queryByRole('region', { name: /Última lectura anotada/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Borrar y volver a leer' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Lectura de mira')).toHaveValue('')
    const sub = useAlmacen.getState().proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!
    expect(sub.estaciones[0]!.intermedias.some((l) => l.valor === 2.7)).toBe(true)
  })

  it('mover el corte de progresiva mueve la celda activa a esa progresiva', () => {
    useAlmacen.getState().seleccionar('10|p-bi')
    render(<EspacioCalle />)

    // A 0+000, donde no falta nada: mismo elemento en la progresiva nueva.
    fireEvent.change(screen.getByLabelText('Progresiva'), { target: { value: '0' } })
    expect(useAlmacen.getState().seleccion).toEqual({ clave: '0|p-bi', progresiva: 0 })
    expect(screen.getByText(/celda activa/i)).toHaveTextContent('0+000 Borde izquierdo')

    // De vuelta a 0+010: la primera que falta allí.
    fireEvent.change(screen.getByLabelText('Progresiva'), { target: { value: '1' } })
    expect(useAlmacen.getState().seleccion.clave).toBe('10|p-bi')
  })

  it('en Medir el mapa marca lo medido con un símbolo neutro, no con el ✓ de conforme', () => {
    render(<EspacioCalle />)
    const medida = within(mapa()).getByRole('button', { name: '0+000 Borde derecho: medida' })
    expect(medida).toHaveTextContent('●')
    expect(within(mapa()).queryByText('✓')).not.toBeInTheDocument()
  })

  it('una toma sin estaciones ofrece empezar la libreta', async () => {
    const datos = proyecto()
    datos.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones = []
    cargar(datos)
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    await usuario.click(screen.getByRole('button', { name: 'Empezar la libreta' }))
    expect(useAlmacen.getState().proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones).toHaveLength(1)
    expect(screen.getByLabelText('Lectura de mira')).toBeInTheDocument()
  })

  it('una estación sin vista atrás avisa que no hay cota', () => {
    const datos = proyecto()
    datos.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[0]!.vistaAtras.valor = Number.NaN
    cargar(datos)
    useAlmacen.getState().seleccionar('10|p-bi')
    render(<EspacioCalle />)
    expect(screen.getByRole('region', { name: 'Aviso al anotar' })).toHaveTextContent('Falta la vista atrás')
  })

  it('añade progresivas, rechaza las repetidas y no quita una que ya tiene lecturas', async () => {
    const usuario = userEvent.setup()
    render(<EspacioCalle />)
    const declaradas = () =>
      useAlmacen.getState().proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!.progresivasDeclaradas

    const campo = screen.getByLabelText('Añadir progresiva')
    await usuario.type(campo, '0+020{Enter}')
    expect(declaradas()).toContain(20)

    await usuario.type(campo, '10{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent('0+010 ya está en la tabla.')

    await usuario.click(screen.getByRole('button', { name: 'Quitar 0+000' }))
    expect(screen.getByRole('status')).toHaveTextContent('ya tiene lecturas anotadas')
    expect(declaradas()).toContain(0)

    await usuario.click(screen.getByRole('button', { name: 'Quitar 0+020' }))
    expect(declaradas()).not.toContain(20)
  })

  it('una estación de antes de volver a arrancar en un BM no está comprobada aunque el cierre pase', () => {
    cargar(proyectoConReArranque())
    useAlmacen.getState().activarEstacion(0)
    useAlmacen.getState().seleccionar('10|p-bi')
    render(<EspacioCalle />)

    const cierre = screen.getByRole('region', { name: 'Cierre en vivo' })
    expect(within(cierre).getByRole('heading', { name: 'Cierra' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Aviso al anotar' })).toHaveTextContent(/no comprobada/)

    act(() => useAlmacen.getState().activarEstacion(1))
    expect(screen.getByRole('region', { name: 'Aviso al anotar' })).not.toHaveTextContent(/no comprobada/)
  })

  it('cuenta con la mira del proyecto: con una de 4 m, una lectura de 4.5 no llena la celda', () => {
    const datos = proyecto()
    datos.instrumento = { largoMira: 4 }
    datos.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[0]!.intermedias.push(lectura('l-larga', 10, 'p-bi', 4.5))
    cargar(datos)
    render(<EspacioCalle />)
    // Siguen llenas las 4 de antes: la de 4.5 no cabe en la mira de 4 m.
    expect(screen.getByText(/llenadas/)).toHaveTextContent('llenadas 4 de 6')
  })

  it('sin rasante, el aviso dice que solo sale la cota', () => {
    cargar(proyectoSinRasante())
    useAlmacen.getState().seleccionar('10|p-bi')
    render(<EspacioCalle />)
    expect(screen.getByRole('region', { name: 'Aviso al anotar' })).toHaveTextContent('Sin rasante en este punto')
  })

  it('el cierre en vivo está siempre a la vista', () => {
    render(<EspacioCalle />)
    const cierre = screen.getByRole('region', { name: 'Cierre en vivo' })
    expect(within(cierre).getByRole('heading', { name: 'Cierra' })).toBeInTheDocument()
    expect(cierre).toHaveTextContent('Circuito cerrado')
  })

  it('con el circuito abierto, el cierre lo dice y el aviso marca lo no comprobado', () => {
    cargar(proyecto({ cerrada: false }))
    useAlmacen.getState().seleccionar('10|p-bi')
    render(<EspacioCalle />)

    const cierre = screen.getByRole('region', { name: 'Cierre en vivo' })
    expect(within(cierre).getByRole('heading', { name: /sin cerrar/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Aviso al anotar' })).toHaveTextContent(/no comprobada/)
  })

  it('anotar con Enter guarda la lectura, salta a la siguiente celda y deja su aviso a la vista', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().seleccionar('10|p-bi')
    render(<EspacioCalle />)

    await usuario.type(screen.getByLabelText('Lectura de mira'), '2.700{Enter}')

    const toma = useAlmacen.getState().proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!
    const anotada = toma.estaciones[0]!.intermedias.at(-1)!
    expect(anotada.valor).toBe(2.7)
    expect(anotada.destino).toEqual({ tipo: 'celda', celda: { progresiva: 10, elementoClave: 'p-bi' } })
    expect(useAlmacen.getState().seleccion.clave).toBe('10|p-bd')

    const ultima = screen.getByRole('region', { name: 'Última lectura anotada · 0+010 Borde izquierdo' })
    expect(within(ultima).getByRole('alert')).toHaveTextContent('¿Leíste bien?')

    await usuario.click(screen.getByRole('button', { name: 'Borrar y volver a leer' }))
    const despues = useAlmacen.getState().proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!
    expect(despues.estaciones[0]!.intermedias.some((l) => l.id === anotada.id)).toBe(false)
    expect(useAlmacen.getState().seleccion.clave).toBe('10|p-bi')
  })

  it('sin celda elegida, la libreta se pone en la primera que falta', () => {
    render(<EspacioCalle />)
    const clave = useAlmacen.getState().seleccion.clave
    expect(['10|p-bi', '10|p-bd']).toContain(clave)
  })
})

describe('Revisar', () => {
  beforeEach(() => cargar(proyecto(), 'revisar'))

  it('el punto elegido trae cota medida, de proyecto, diferencia, semáforo, qué hacer, tolerancia y lectura', async () => {
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    expect(screen.getByRole('region', { name: 'Punto elegido' })).toHaveTextContent(/toca una celda/i)

    await usuario.click(within(mapa()).getByRole('button', { name: /^0\+000 Borde derecho/ }))
    const punto = screen.getByRole('region', { name: 'Punto elegido' })
    expect(within(punto).getByRole('heading', { name: '0+000 Borde derecho' })).toBeInTheDocument()
    expect(punto).toHaveTextContent('✗ fuera de tolerancia · rellena 70 mm')
    expect(punto).toHaveTextContent('Cota medida98.850')
    expect(punto).toHaveTextContent('Cota de proyecto98.920')
    expect(punto).toHaveTextContent('Diferencia−70 mm')
    expect(punto).toHaveTextContent('Tolerancia±20 mm')
    expect(punto).toHaveTextContent('Lectura2.650')
  })

  it('resume la calle por estado y lleva al peor punto', async () => {
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    const resumen = screen.getByRole('region', { name: 'Resumen de la calle' })
    expect(resumen).toHaveTextContent('2 conformes')
    expect(resumen).toHaveTextContent('1 al límite')
    expect(resumen).toHaveTextContent('1 fuera de tolerancia')
    expect(resumen).toHaveTextContent('2 sin medir')

    await usuario.click(within(resumen).getByRole('button', { name: 'Ir al peor punto' }))
    expect(useAlmacen.getState().seleccion).toEqual({ clave: '0|p-bd', progresiva: 0 })
    expect(screen.getByRole('region', { name: 'Punto elegido' })).toHaveTextContent('rellena 70 mm')
  })

  it('con el circuito cerrado dice que las cotas están compensadas y verificadas', () => {
    render(<EspacioCalle />)
    expect(screen.getByRole('heading', { name: 'Cotas compensadas' })).toBeInTheDocument()
    expect(screen.getByText(/DIFERENCIAS VERIFICADAS/)).toBeInTheDocument()
  })

  it('con el circuito abierto avisa que nada está comprobado', async () => {
    cargar(proyecto({ cerrada: false }), 'revisar')
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    expect(screen.getByRole('heading', { name: 'Cotas sin compensar' })).toBeInTheDocument()
    expect(screen.getByText(/NO COMPROBADAS/)).toBeInTheDocument()

    await usuario.click(within(mapa()).getByRole('button', { name: /^0\+000 Eje/ }))
    expect(screen.getByRole('region', { name: 'Punto elegido' })).toHaveTextContent(/no comprobada/)
  })

  it('monta las notas de la calle activa', () => {
    render(<EspacioCalle />)
    expect(screen.getByTestId('notas-de-calle')).toHaveTextContent('c-prueba')
  })

  it('el punto sigue al corte: mover la progresiva lleva al mismo elemento en la nueva', () => {
    useAlmacen.getState().seleccionar('0|p-eje')
    render(<EspacioCalle />)

    fireEvent.change(screen.getByLabelText('Progresiva'), { target: { value: '1' } })
    expect(useAlmacen.getState().seleccion).toEqual({ clave: '10|p-eje', progresiva: 10 })
    const punto = screen.getByRole('region', { name: 'Punto elegido' })
    expect(within(punto).getByRole('heading', { name: '0+010 Eje' })).toBeInTheDocument()
  })

  it('un punto medido antes de volver a arrancar en un BM se marca no comprobado', async () => {
    cargar(proyectoConReArranque(), 'revisar')
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    await usuario.click(within(mapa()).getByRole('button', { name: /^0\+000 Eje/ }))
    expect(screen.getByRole('region', { name: 'Punto elegido' })).toHaveTextContent(/no comprobada/)

    await usuario.click(within(mapa()).getByRole('button', { name: /^0\+010 Eje/ }))
    expect(screen.getByRole('region', { name: 'Punto elegido' })).not.toHaveTextContent(/no comprobada/)
  })

  it('sin rasante enseña lo medido en el punto, sin semáforo', async () => {
    cargar(proyectoSinRasante(), 'revisar')
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    await usuario.click(within(mapa()).getByRole('button', { name: '0+000 Borde derecho: medida' }))
    const punto = screen.getByRole('region', { name: 'Punto elegido' })
    expect(punto).toHaveTextContent('sin rasante de proyecto')
    expect(punto).toHaveTextContent('Cota medida98.850')
    expect(punto).toHaveTextContent('Lectura2.650')
    expect(punto).toHaveTextContent('Cota de proyecto—')
  })
})

describe('Replantear', () => {
  beforeEach(() => cargar(proyecto(), 'replantear'))

  it('muestra la hoja de la progresiva con la lectura objetivo de cada estaca', () => {
    render(<EspacioCalle />)

    expect(screen.getByRole('heading', { name: 'Replantear' })).toBeInTheDocument()
    const hoja = screen.getByRole('region', { name: 'Hoja de replanteo' })
    // AI 101.500: eje 2.500, bordes 2.580.
    expect(within(hoja).getByRole('button', { name: 'Estaca Borde izquierdo, objetivo 2.580' })).toBeInTheDocument()
    expect(within(hoja).getByRole('button', { name: 'Estaca Eje, objetivo 2.500' })).toBeInTheDocument()
    expect(within(hoja).getByRole('button', { name: 'Estaca Borde derecho, objetivo 2.580' })).toBeInTheDocument()

    const estaca = screen.getByRole('region', { name: 'Estaca actual' })
    expect(estaca).toHaveTextContent('Estaca 1 de 3 · 0+000 Borde izquierdo')
    expect(estaca).toHaveTextContent('Lectura objetivo 2.580')
  })

  it('da el veredicto grande al escribir la lectura, y la afina de a 1 mm', async () => {
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    // Leer de más es estar bajo: falta material.
    await usuario.type(screen.getByLabelText('Lectura leída'), '2.590')
    expect(screen.getByRole('status', { name: 'Veredicto' })).toHaveTextContent('RELLENA 10 mm')
    expect(screen.getByRole('status', { name: 'Veredicto' })).toHaveTextContent('conforme')

    await usuario.click(screen.getByRole('button', { name: '−1 mm' }))
    await usuario.click(screen.getByRole('button', { name: '−1 mm' }))
    expect(screen.getByLabelText('Lectura leída')).toHaveValue('2.588')
    expect(screen.getByRole('status', { name: 'Veredicto' })).toHaveTextContent('RELLENA 8 mm')

    await usuario.clear(screen.getByLabelText('Lectura leída'))
    // Sin nada escrito, ±1 mm parte del objetivo.
    await usuario.click(screen.getByRole('button', { name: '−1 mm' }))
    expect(screen.getByLabelText('Lectura leída')).toHaveValue('2.579')
    expect(screen.getByRole('status', { name: 'Veredicto' })).toHaveTextContent('CORTA 1 mm')

    await usuario.click(screen.getByRole('button', { name: '+1 mm' }))
    expect(screen.getByRole('status', { name: 'Veredicto' })).toHaveTextContent('EN COTA')
  })

  it('una lectura muy apartada pide volver a leer', async () => {
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    await usuario.type(screen.getByLabelText('Lectura leída'), '2.480')
    const veredicto = screen.getByRole('status', { name: 'Veredicto' })
    expect(veredicto).toHaveTextContent('CORTA 100 mm')
    expect(veredicto).toHaveTextContent('fuera de tolerancia')
    expect(veredicto).toHaveTextContent('¿Leíste bien?')
  })

  it('«Siguiente estaca» recorre la progresiva y pasa a la siguiente', async () => {
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    const siguiente = () => screen.getByRole('button', { name: 'Siguiente estaca' })
    await usuario.click(siguiente())
    expect(useAlmacen.getState().seleccion.clave).toBe('0|p-eje')
    await usuario.click(siguiente())
    expect(useAlmacen.getState().seleccion.clave).toBe('0|p-bd')
    await usuario.click(siguiente())
    expect(useAlmacen.getState().seleccion).toEqual({ clave: '10|p-bi', progresiva: 10 })
    expect(screen.getByRole('region', { name: 'Estaca actual' })).toHaveTextContent('0+010 Borde izquierdo')

    await usuario.click(siguiente())
    await usuario.click(siguiente())
    expect(screen.getByRole('button', { name: 'Última estaca' })).toBeDisabled()
  })

  it('tocar una estaca del corte o del mapa la vuelve la actual', async () => {
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    await usuario.click(within(mapa()).getByRole('button', { name: /^0\+000 Borde derecho/ }))
    expect(screen.getByRole('region', { name: 'Estaca actual' })).toHaveTextContent('Estaca 3 de 3 · 0+000 Borde derecho')
  })

  it('puede partir de un BM: un BM oficial deja la hoja comprobada aunque la libreta no haya cerrado', async () => {
    cargar(proyecto({ cerrada: false }), 'replantear')
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    expect(screen.getByText(/no comprobadas/)).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Desde un BM' }))
    await usuario.type(screen.getByLabelText('Vista atrás al BM'), '1.600')
    // 100.000 + 1.600 = 101.600 → eje 2.600.
    expect(screen.getByText(/AI/)).toHaveTextContent('AI 101.600')
    expect(screen.getByRole('button', { name: 'Estaca Eje, objetivo 2.600' })).toBeInTheDocument()
    expect(screen.queryByText(/no comprobadas/)).not.toBeInTheDocument()

    await usuario.selectOptions(screen.getByLabelText('BM de partida'), 'BM-2 · 100.100')
    expect(screen.getByText(/no comprobadas/)).toBeInTheDocument()
  })

  it('una vista atrás que no cabe en la mira se dice, no se pide escribirla otra vez', async () => {
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    await usuario.click(screen.getByRole('button', { name: 'Desde un BM' }))
    expect(screen.getByText(/escribe la vista atrás/i)).toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Vista atrás al BM'), '7.2')
    expect(screen.getByText(/la vista atrás 7.2 no cabe en la mira de 5 m/i)).toBeInTheDocument()
  })

  it('sin BMs en el proyecto lo dice y manda a Obra', async () => {
    const datos = proyecto()
    datos.bms = []
    cargar(datos, 'replantear')
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    await usuario.click(screen.getByRole('button', { name: 'Desde un BM' }))
    expect(screen.getByText(/no hay BMs en este proyecto/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('BM de partida')).not.toBeInTheDocument()
  })

  it('si se abre otro proyecto con BMs, el BM de partida es el primero que haya', async () => {
    const sinBms = proyecto()
    sinBms.bms = []
    cargar(sinBms, 'replantear')
    const usuario = userEvent.setup()
    render(<EspacioCalle />)
    await usuario.click(screen.getByRole('button', { name: 'Desde un BM' }))

    act(() => {
      useAlmacen.getState().cargarProyecto(proyecto())
      useAlmacen.getState().activarCampania('toma-sub')
      useAlmacen.setState({ espacio: 'calle', modoCalle: 'replantear' })
    })
    expect(screen.getByLabelText('BM de partida')).toHaveValue('bm-1')
    await usuario.type(screen.getByLabelText('Vista atrás al BM'), '1.600')
    expect(screen.getByText(/AI/)).toHaveTextContent('AI 101.600')
  })

  it('la lectura leída es de su capa: al cambiar de capa el campo queda vacío', async () => {
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    await usuario.type(screen.getByLabelText('Lectura leída'), '2.590')
    await usuario.selectOptions(screen.getByLabelText('Capa activa'), 'TERRENO · 2026-09-01')
    act(() => useAlmacen.getState().seleccionar('0|p-bi'))
    expect(screen.getByLabelText('Lectura leída')).toHaveValue('')
    expect(screen.getByRole('status', { name: 'Veredicto' })).toBeEmptyDOMElement()
  })

  it('el veredicto queda montado vacío antes de escribir, para que se anuncie al llenarse', () => {
    render(<EspacioCalle />)
    expect(screen.getByRole('status', { name: 'Veredicto' })).toBeEmptyDOMElement()
  })

  it('una lectura imposible pide volver a leer sin la ✗ de fuera de tolerancia', async () => {
    const usuario = userEvent.setup()
    render(<EspacioCalle />)

    await usuario.type(screen.getByLabelText('Lectura leída'), '7.000')
    const veredicto = screen.getByRole('status', { name: 'Veredicto' })
    expect(veredicto).toHaveTextContent('VUELVE A LEER')
    expect(veredicto).toHaveTextContent('dato no válido')
    expect(veredicto).not.toHaveTextContent('✗')
  })

  it('la AI de una estación de antes de volver a arrancar en un BM no está comprobada', () => {
    cargar(proyectoConReArranque(), 'replantear')
    useAlmacen.getState().activarEstacion(0)
    const { unmount } = render(<EspacioCalle />)
    expect(screen.getByText(/no comprobadas/)).toBeInTheDocument()
    unmount()

    useAlmacen.getState().activarEstacion(1)
    render(<EspacioCalle />)
    expect(screen.queryByText(/no comprobadas/)).not.toBeInTheDocument()
  })

  it('sin rasante, cada estaca dice por qué no tiene objetivo', () => {
    cargar(proyectoSinRasante(), 'replantear')
    render(<EspacioCalle />)
    expect(screen.getByRole('region', { name: 'Estaca actual' })).toHaveTextContent(
      'Sin lectura objetivo: la calle no tiene rasante de proyecto.',
    )
  })
})
