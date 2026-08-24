import { render, screen } from '@testing-library/react'
import type { Campania, Proyecto, Rasante } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo, proyectoVacio } from '../estado/ejemplo'
import Vista3D from './Vista3D'

/** Rasante plana, sin pendiente longitudinal ni transversal, hasta el ancho de la plantilla. */
function rasanteEjemplo(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 3245.179,
    pendienteLongitudinal: 0,
    tramos: [{ nombre: 'Calzada', hastaOffset: 5.6, tipo: 'pendiente', valor: 0 }],
    simetrica: true,
    tramosIzquierda: null,
  }
}

/**
 * La libreta de ejemplo mide EJE y BOR-I en 0+000 y solo EJE en 0+020: le
 * falta la cuarta esquina (0+020 BOR-I) para cerrar el único cuadro que cabe
 * entre esas dos progresivas y esos dos elementos vecinos de la plantilla.
 * Se agrega esa lectura a la segunda estación, sin tocar las demás, y se fija
 * la rasante plana para que haya algo contra qué evaluar el estado.
 */
function conRasanteYMedidas(): void {
  useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  useAlmacen.getState().fijarRasante('c-1', rasanteEjemplo())
  useAlmacen.getState().agregarIntermedia('camp-1', 1, {
    destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'BOR-I' } },
    valor: 2.52,
  })
}

/**
 * Misma libreta de ejemplo, pero con las dos estaciones remedidas en
 * 0+000: toda la campaña queda con una sola progresiva con algo medido, así
 * que no hay dos progresivas entre las que cerrar un cuadro.
 */
function conUnaSolaProgresivaMedida(): void {
  const proyecto = proyectoEjemplo()
  proyecto.campanias[0]!.estaciones[0]!.intermedias = [
    {
      id: 'l-14b',
      destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'SAR-I' } },
      valor: 1.931,
    },
  ]
  proyecto.campanias[0]!.estaciones[1]!.intermedias = [
    {
      id: 'l-29b',
      destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'SAR-D' } },
      valor: 1.943,
    },
  ]
  useAlmacen.getState().cargarProyecto(proyecto)
  useAlmacen.getState().fijarRasante('c-1', rasanteEjemplo())
}

function sinRasante(): void {
  useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  useAlmacen.getState().fijarRasante('c-1', null)
}

/**
 * Segunda campaña de la misma calle, con un cuadro completo entre 0+020 y
 * 0+040 — un tramo que la campaña activa (camp-1) no mide en absoluto — para
 * comprobar que el visor dibuja la campaña que se le pasa por parámetro y no
 * la campaña activa del almacén (que sigue siendo camp-1 tras `cargarProyecto`).
 */
function campaniaDos(): Campania {
  return {
    id: 'camp-2',
    fecha: '2026-08-20',
    calleId: 'c-1',
    capaId: 'cap-subrasante',
    bmInicialId: 'bm-1',
    estado: 'abierta',
    cierre: {
      tipo: 'cerrado',
      bmFinalId: 'bm-1',
      longitudK: 0.36,
      longitudKAuto: true,
      clase: 'tercerOrden',
      coeficiente: 12,
    },
    estaciones: [
      {
        id: 'f-1',
        vistaAtras: { id: 'm-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.4 },
        intermedias: [
          { id: 'm-2', destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'EJE' } }, valor: 2.0 },
          { id: 'm-3', destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'BOR-I' } }, valor: 2.05 },
          { id: 'm-4', destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'EJE' } }, valor: 2.1 },
          { id: 'm-5', destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'BOR-I' } }, valor: 2.15 },
        ],
        vistaAdelante: { id: 'm-6', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.4 },
      },
    ],
  }
}

function conDosCampanias(): void {
  const proyecto = proyectoEjemplo()
  proyecto.campanias.push(campaniaDos())
  useAlmacen.getState().cargarProyecto(proyecto)
  useAlmacen.getState().fijarRasante('c-1', rasanteEjemplo())
}

/**
 * El proyecto de ejemplo ya trae dos campañas completas sobre la misma
 * calle — camp-1 (SUBRASANTE) y camp-base (BASE), cada una con su grilla
 * entera de 0+000 a 0+080 — así que apilarlas en modo capas tiene algo real
 * que dibujar sin fabricar datos nuevos. Se marcan las dos en el selector
 * que ya usa el corte transversal.
 */
function conDosCapasMedidas(): void {
  useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  useAlmacen.getState().fijarRasante('c-1', rasanteEjemplo())
  useAlmacen.getState().alternarCapaVisible('camp-1')
  useAlmacen.getState().alternarCapaVisible('camp-base')
}

/**
 * Segunda campaña (camp-2) que solo mide su grilla completa en 0+000 y
 * 0+020 — nunca en 0+040, 0+060 ni 0+080, que sí mide camp-1 — para
 * comprobar que un tramo sin medir en una capa deja el hueco en esa capa en
 * vez de rellenarlo con algo que nadie midió. Se marcan ambas capas en el
 * selector.
 */
function campaniaSoloAlPrincipio(): Campania {
  return {
    id: 'camp-2',
    fecha: '2026-08-21',
    calleId: 'c-1',
    capaId: 'cap-base',
    bmInicialId: 'bm-1',
    estado: 'abierta',
    cierre: {
      tipo: 'cerrado',
      bmFinalId: 'bm-1',
      longitudK: 0.36,
      longitudKAuto: true,
      clase: 'tercerOrden',
      coeficiente: 12,
    },
    estaciones: [
      {
        id: 'f-2',
        vistaAtras: { id: 'm-10', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.4 },
        intermedias: [
          { id: 'm-11', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'SAR-I' } }, valor: 1.7 },
          { id: 'm-12', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-I' } }, valor: 1.85 },
          { id: 'm-13', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } }, valor: 1.78 },
          { id: 'm-14', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-D' } }, valor: 1.86 },
          { id: 'm-15', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'SAR-D' } }, valor: 1.72 },
          { id: 'm-16', destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'SAR-I' } }, valor: 1.76 },
          { id: 'm-17', destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'BOR-I' } }, valor: 1.94 },
          { id: 'm-18', destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'EJE' } }, valor: 1.85 },
          { id: 'm-19', destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'BOR-D' } }, valor: 1.93 },
          { id: 'm-20', destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'SAR-D' } }, valor: 1.79 },
        ],
        vistaAdelante: { id: 'm-21', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.4 },
      },
    ],
  }
}

function conCapaMedidaSoloAlPrincipio(): void {
  const proyecto = proyectoEjemplo()
  proyecto.campanias.push(campaniaSoloAlPrincipio())
  useAlmacen.getState().cargarProyecto(proyecto)
  useAlmacen.getState().fijarRasante('c-1', rasanteEjemplo())
  useAlmacen.getState().alternarCapaVisible('camp-1')
  useAlmacen.getState().alternarCapaVisible('camp-2')
}

/**
 * Calle de 0+000 a 0+080, pero la campaña solo empezó a medir en 0+060: hay
 * un único cuadro completo, entre 0+060 y 0+080. Sirve para distinguir, con
 * el deslizador en el extremo inicial, el aviso de "falta medir" del aviso
 * de "el corte tapa lo que sí hay" — las progresivas antes de 0+060 nunca se
 * midieron, así que el deslizador es lo único que decide qué se ve.
 */
function conMedidasSoloDesde60(): void {
  const proyecto: Proyecto = {
    ...proyectoVacio(),
    bms: [{ id: 'bm-1', nombre: 'BM-1', cota: 100, tipo: 'oficial', descripcion: '' }],
    plantillas: [
      {
        id: 'pl-1',
        nombre: 'Plantilla mínima',
        elementos: [
          { clave: 'BOR-I', etiqueta: 'Borde izquierdo', offset: -2, tipo: 'calzada' },
          { clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' },
        ],
      },
    ],
    calles: [
      {
        id: 'c-1',
        nombre: 'Calle mínima',
        plantillaId: 'pl-1',
        progresivaInicio: 0,
        progresivaFin: 80,
        intervalo: 20,
        progresivasExtra: [],
        rasante: rasanteEjemplo(),
      },
    ],
    campanias: [
      {
        id: 'camp-1',
        fecha: '2026-08-21',
        calleId: 'c-1',
        capaId: 'cap-subrasante',
        bmInicialId: 'bm-1',
        estado: 'abierta',
        cierre: {
          tipo: 'cerrado',
          bmFinalId: 'bm-1',
          longitudK: 0.16,
          longitudKAuto: true,
          clase: 'tercerOrden',
          coeficiente: 12,
        },
        estaciones: [
          {
            id: 'e-1',
            vistaAtras: { id: 'v-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.5 },
            intermedias: [
              { id: 'i-1', destino: { tipo: 'celda', celda: { progresiva: 60, elementoClave: 'BOR-I' } }, valor: 1.5 },
              { id: 'i-2', destino: { tipo: 'celda', celda: { progresiva: 60, elementoClave: 'EJE' } }, valor: 1.5 },
              { id: 'i-3', destino: { tipo: 'celda', celda: { progresiva: 80, elementoClave: 'BOR-I' } }, valor: 1.5 },
              { id: 'i-4', destino: { tipo: 'celda', celda: { progresiva: 80, elementoClave: 'EJE' } }, valor: 1.5 },
            ],
            vistaAdelante: { id: 'v-2', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.5 },
          },
        ],
      },
    ],
  }
  useAlmacen.getState().cargarProyecto(proyecto)
}

/**
 * Una calle mínima, propia de esta prueba: dos progresivas y dos elementos
 * (un solo cuadro), con una rasante plana y una capa sin espesor por encima
 * — así la cota teórica es la cota de rasante tal cual, sin restar nada — y
 * una estación cuyas cuatro lecturas caen justo en esa cota teórica. Cierra
 * con la misma lectura de ida y vuelta al BM, así que el error de cierre es
 * cero y no hay compensación que mueva las cotas.
 */
function conTodoConforme(): void {
  const proyecto: Proyecto = {
    ...proyectoVacio(),
    bms: [{ id: 'bm-1', nombre: 'BM-1', cota: 100, tipo: 'oficial', descripcion: '' }],
    plantillas: [
      {
        id: 'pl-1',
        nombre: 'Plantilla mínima',
        elementos: [
          { clave: 'BOR-I', etiqueta: 'Borde izquierdo', offset: -2, tipo: 'calzada' },
          { clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' },
        ],
      },
    ],
    calles: [
      {
        id: 'c-1',
        nombre: 'Calle mínima',
        plantillaId: 'pl-1',
        progresivaInicio: 0,
        progresivaFin: 20,
        intervalo: 20,
        progresivasExtra: [],
        rasante: {
          progresivaArranque: 0,
          cotaArranque: 100,
          pendienteLongitudinal: 0,
          tramos: [{ nombre: 'Todo', hastaOffset: 2, tipo: 'pendiente', valor: 0 }],
          simetrica: true,
          tramosIzquierda: null,
        },
      },
    ],
    campanias: [
      {
        id: 'camp-1',
        fecha: '2026-08-21',
        calleId: 'c-1',
        capaId: 'cap-subrasante',
        bmInicialId: 'bm-1',
        estado: 'abierta',
        cierre: {
          tipo: 'cerrado',
          bmFinalId: 'bm-1',
          longitudK: 0.04,
          longitudKAuto: true,
          clase: 'tercerOrden',
          coeficiente: 12,
        },
        estaciones: [
          {
            id: 'e-1',
            vistaAtras: { id: 'v-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.5 },
            intermedias: [
              { id: 'i-1', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-I' } }, valor: 1.5 },
              { id: 'i-2', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } }, valor: 1.5 },
              { id: 'i-3', destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'BOR-I' } }, valor: 1.5 },
              { id: 'i-4', destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'EJE' } }, valor: 1.5 },
            ],
            vistaAdelante: { id: 'v-2', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.5 },
          },
        ],
      },
    ],
  }
  useAlmacen.getState().cargarProyecto(proyecto)
}

describe('Vista3D', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
    // `cargarProyecto` no reinicia el modo del visor (no es dato del
    // proyecto): sin esto, una prueba que deja el modo en 'capas' se cuela
    // en la siguiente, que asume el modo por defecto.
    useAlmacen.getState().fijarModoVista3D('estado')
  })

  it('dibuja una cara por cada cuadro con sus cuatro esquinas medidas', () => {
    conRasanteYMedidas()
    const { container } = render(<Vista3D idCampaniaReferencia="camp-1" />)

    expect(container.querySelectorAll('[data-cara]').length).toBeGreaterThan(0)
  })

  it('cada cara dice entre qué puntos está y en qué estado, sin depender del color', () => {
    conRasanteYMedidas()
    render(<Vista3D idCampaniaReferencia="camp-1" />)

    expect(
      screen.getByLabelText(/Entre 0\+000 y 0\+020, de BOR-I a EJE: .*tolerancia/),
    ).toBeInTheDocument()
  })

  it('escribe en pantalla cuánto se están exagerando las alturas', () => {
    conRasanteYMedidas()
    render(<Vista3D idCampaniaReferencia="camp-1" />)

    expect(screen.getByText(/Alturas exageradas 25×/)).toBeInTheDocument()
  })

  it('sin dos progresivas medidas no hay modelo, y se dice con palabras', () => {
    conUnaSolaProgresivaMedida()
    render(<Vista3D idCampaniaReferencia="camp-1" />)

    expect(screen.getByText(/hacen falta al menos dos progresivas/i)).toBeInTheDocument()
  })

  it('sin rasante definida, el modo estado lo dice en vez de dibujar un modelo sin color', () => {
    sinRasante()
    render(<Vista3D idCampaniaReferencia="camp-1" />)

    expect(screen.getByText(/Define la rasante/i)).toBeInTheDocument()
  })

  it('no lee la campaña del almacén: la recibe por parámetro', () => {
    conDosCampanias()
    render(<Vista3D idCampaniaReferencia="camp-2" />)

    // camp-2 midió una celda que camp-1 no tiene: su cara solo puede salir
    // si el componente usó de verdad la campaña que se le pasó.
    expect(screen.getByLabelText(/Entre 0\+020 y 0\+040/)).toBeInTheDocument()
  })

  it('en modo capas dibuja una superficie por cada campaña marcada', () => {
    conDosCapasMedidas()
    useAlmacen.getState().fijarModoVista3D('capas')
    const { container } = render(<Vista3D idCampaniaReferencia="camp-1" />)

    const capas = new Set(
      [...container.querySelectorAll('[data-capa-id]')].map((n) => n.getAttribute('data-capa-id')),
    )
    expect(capas.size).toBe(2)
  })

  it('en modo capas cada superficie dice de qué capa es', () => {
    conDosCapasMedidas()
    useAlmacen.getState().fijarModoVista3D('capas')
    render(<Vista3D idCampaniaReferencia="camp-1" />)

    expect(screen.getByText('SUBRASANTE')).toBeInTheDocument()
    expect(screen.getByText('BASE')).toBeInTheDocument()
  })

  it('una capa sin medidas en un tramo deja el hueco, no lo rellena', () => {
    conCapaMedidaSoloAlPrincipio()
    useAlmacen.getState().fijarModoVista3D('capas')
    const { container } = render(<Vista3D idCampaniaReferencia="camp-1" />)

    const caras = [...container.querySelectorAll('[data-capa-id="camp-2"]')]
    expect(caras.length).toBeGreaterThan(0)
    expect(caras.every((c) => Number(c.getAttribute('data-progresiva-hasta')) <= 20)).toBe(true)
  })

  it('el deslizador de progresiva secciona el modelo', () => {
    conRasanteYMedidas()
    useAlmacen.getState().irAProgresiva(20)
    const { container } = render(<Vista3D idCampaniaReferencia="camp-1" />)

    const caras = [...container.querySelectorAll('[data-cara]')]
    expect(caras.length).toBeGreaterThan(0)
    expect(caras.every((c) => Number(c.getAttribute('data-progresiva-desde')) <= 20)).toBe(true)
  })

  it('con el deslizador al final del tramo se ve la calle entera', () => {
    conRasanteYMedidas()
    useAlmacen.getState().irAProgresiva(180)
    const { container } = render(<Vista3D idCampaniaReferencia="camp-1" />)

    expect(container.querySelectorAll('[data-cara]').length).toBeGreaterThan(0)
  })

  it('el resumen cuenta exactamente las caras que el corte deja ver, no las que habría sin corte', () => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
    useAlmacen.getState().irAProgresiva(20)
    const { container } = render(<Vista3D idCampaniaReferencia="camp-1" />)

    // Con el corte en 0+020 solo caben las caras entre 0+000 y 0+020, en los
    // cuatro pares de elementos vecinos de la plantilla: 8 caras.
    const carasDibujadas = container.querySelectorAll('[data-cara]').length
    expect(carasDibujadas).toBe(8)
    expect(screen.getByText(new RegExp(`El modelo dibuja ${carasDibujadas} tramos`))).toBeInTheDocument()
    // El lomo real del ejemplo está en 0+040 BOR-I, fuera del corte: el
    // resumen no puede nombrarlo como la peor zona si no se está dibujando.
    expect(screen.queryByText(/0\+040 BOR-I/)).toBeNull()
  })

  it('en modo capas el resumen nombra las capas y sus tramos, no el vocabulario de tolerancia', () => {
    conDosCapasMedidas()
    useAlmacen.getState().fijarModoVista3D('capas')
    render(<Vista3D idCampaniaReferencia="camp-1" />)

    expect(screen.getByText(/El modelo dibuja 2 capas/)).toBeInTheDocument()
    expect(screen.getByText(/SUBRASANTE \(\d+ tramos\)/)).toBeInTheDocument()
    expect(screen.getByText(/BASE \(\d+ tramos\)/)).toBeInTheDocument()
    expect(screen.queryByText(/conforme|al límite|fuera de tolerancia/i)).toBeNull()
  })

  it('sin rasante definida, el modo capas sigue dibujando la superficie medida', () => {
    sinRasante()
    useAlmacen.getState().alternarCapaVisible('camp-1')
    useAlmacen.getState().fijarModoVista3D('capas')
    const { container } = render(<Vista3D idCampaniaReferencia="camp-1" />)

    expect(container.querySelectorAll('[data-cara]').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Define la rasante/i)).toBeNull()
  })

  it('con el deslizador en el extremo inicial, el aviso culpa al corte cuando sí hay algo medido más adelante', () => {
    conMedidasSoloDesde60()
    useAlmacen.getState().irAProgresiva(0)
    render(<Vista3D idCampaniaReferencia="camp-1" />)

    expect(screen.getByText(/el corte.*0\+000.*deja fuera todo lo medido/i)).toBeInTheDocument()
    expect(screen.queryByText(/no hay cuadro que dibujar/i)).toBeNull()
  })

  it('sin mover el deslizador, esa misma campaña sí dibuja lo que midió', () => {
    conMedidasSoloDesde60()
    const { container } = render(<Vista3D idCampaniaReferencia="camp-1" />)

    expect(container.querySelectorAll('[data-cara]').length).toBeGreaterThan(0)
  })

  it('sin corte, el resumen nombra la peor zona real de la libreta de ejemplo', () => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
    render(<Vista3D idCampaniaReferencia="camp-1" />)

    expect(screen.getByText(/El modelo dibuja 16 tramos/)).toBeInTheDocument()
    expect(screen.getByText(/La mayor diferencia está en 0\+040 BOR-I: \+54 mm/)).toBeInTheDocument()
  })

  it('cuando todo está conforme, el resumen lo dice y no inventa una peor zona', () => {
    conTodoConforme()
    render(<Vista3D idCampaniaReferencia="camp-1" />)

    expect(screen.getByText(/todo dentro de tolerancia/i)).toBeInTheDocument()
    expect(screen.queryByText(/La mayor diferencia/)).toBeNull()
  })
})
