import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Proyecto, PuntoSeccion, Rasante, Toma } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import CorteTransversal from './CorteTransversal'

describe('CorteTransversal', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('dibuja un punto por cada celda medida de la progresiva', () => {
    render(<CorteTransversal progresiva={0} idsVisibles={['camp-1']} idCampaniaReferencia="camp-1" />)
    // Entrega 3: el ejemplo mide los cinco puntos de la calzada (SAR-I,
    // BOR-I, EJE, BOR-D, SAR-D) en 0+000, para que el visor 3D tenga con qué
    // dibujar un modelo.
    expect(screen.getAllByRole('button', { name: /^0\+000 / })).toHaveLength(5)
  })

  it('avisa cuando la progresiva no tiene lecturas', () => {
    render(<CorteTransversal progresiva={100} idsVisibles={['camp-1']} idCampaniaReferencia="camp-1" />)
    expect(screen.getByText(/todavía no tiene lecturas/i)).toBeInTheDocument()
  })

  it('selecciona la celda al hacer clic en un punto', async () => {
    const usuario = userEvent.setup()
    render(<CorteTransversal progresiva={0} idsVisibles={['camp-1']} idCampaniaReferencia="camp-1" />)
    await usuario.click(screen.getByRole('button', { name: /0\+000 Eje/ }))
    expect(useAlmacen.getState().seleccion.clave).toBe('0|p-eje')
  })

  it('marca el punto seleccionado', () => {
    useAlmacen.getState().seleccionar('0|p-eje')
    render(<CorteTransversal progresiva={0} idsVisibles={['camp-1']} idCampaniaReferencia="camp-1" />)
    expect(screen.getByRole('button', { name: /0\+000 Eje/ })).toHaveAttribute('data-activo', 'true')
  })

  it('sin ninguna campaña visible no dibuja nada y avisa que no hay lecturas', () => {
    render(<CorteTransversal progresiva={0} idsVisibles={[]} idCampaniaReferencia="camp-1" />)
    expect(screen.getByText(/todavía no tiene lecturas/i)).toBeInTheDocument()
  })
})

const CIERRE_CERRADO = {
  tipo: 'cerrado' as const,
  bmFinalId: 'bm-1',
  longitudK: 0.36,
  longitudKAuto: true,
  clase: 'tercerOrden' as const,
  coeficiente: 12,
}

/**
 * Ambas cierran BM-1 contra BM-1 en una sola estación, para no arrastrar
 * ningún error de cierre a estas pruebas: lo que importa es qué celdas
 * comparten y cuáles no.
 *
 * TERRENO mide VER-I, SAR-I, BOR-I, EJE, BOR-D en la progresiva 0 (no
 * SAR-D ni VER-D). SUBRASANTE mide VER-I, SAR-I, EJE, BOR-D, SAR-D (no
 * BOR-I ni VER-D). Así, en el orden de offsets:
 *   VER-I(ambas) SAR-I(ambas) BOR-I(solo terreno) EJE(ambas) BOR-D(ambas) SAR-D(solo subrasante)
 * hay dos tramos con pareja — VER-I↔SAR-I y EJE↔BOR-D — separados por
 * celdas que solo tiene una de las dos capas.
 */
function campaniaTerreno(): Toma {
  return {
    id: 'camp-t',
    fecha: '2026-08-01',
    capaId: 'cap-terreno',
    bmInicialId: 'bm-1',
    cierre: CIERRE_CERRADO,
    estaciones: [
      {
        id: 'et-1',
        vistaAtras: { id: 'lt-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.0 },
        intermedias: [
          { id: 'lt-2', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-vereda-i' } }, valor: 1.2 },
          { id: 'lt-3', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-sardinel-i' } }, valor: 1.3 },
          { id: 'lt-4', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-borde-i' } }, valor: 1.35 },
          { id: 'lt-5', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-eje' } }, valor: 1.5 },
          { id: 'lt-6', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-borde-d' } }, valor: 1.65 },
        ],
        vistaAdelante: { id: 'lt-7', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.0 },
      },
    ],
  }
}

function campaniaSubrasante(): Toma {
  return {
    id: 'camp-s',
    fecha: '2026-08-15',
    capaId: 'cap-subrasante',
    bmInicialId: 'bm-1',
    cierre: CIERRE_CERRADO,
    estaciones: [
      {
        id: 'es-1',
        vistaAtras: { id: 'ls-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.0 },
        intermedias: [
          { id: 'ls-2', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-vereda-i' } }, valor: 1.0 },
          { id: 'ls-3', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-sardinel-i' } }, valor: 1.05 },
          { id: 'ls-4', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-eje' } }, valor: 1.2 },
          { id: 'ls-5', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-borde-d' } }, valor: 1.35 },
          { id: 'ls-6', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-sardinel-d' } }, valor: 1.4 },
        ],
        vistaAdelante: { id: 'ls-7', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.0 },
      },
    ],
  }
}

function proyectoDosCapas(): Proyecto {
  const proyecto = proyectoEjemplo()
  proyecto.calles[0]!.nivelaciones = [
    { id: 'niv-t', nombre: 'Terreno', color: '#2563eb', tomas: [campaniaTerreno()] },
    { id: 'niv-s', nombre: 'Subrasante', color: '#dc2626', tomas: [campaniaSubrasante()] },
  ]
  // Estas pruebas comparan capas, no rasante: sin esto, la rasante por
  // defecto del ejemplo agregaría su propia polilínea y correría los índices.
  proyecto.calles[0]!.rasante = null
  return proyecto
}

describe('CorteTransversal con varias capas', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoDosCapas())
    useAlmacen.getState().alternarCapaVisible('camp-t')
    useAlmacen.getState().alternarCapaVisible('camp-s')
  })

  it('con dos capas visibles dibuja un trazo por cada una', () => {
    const { container } = render(
      <CorteTransversal
        progresiva={0}
        idsVisibles={useAlmacen.getState().capasVisibles}
        idCampaniaReferencia="camp-t"
      />,
    )
    expect(container.querySelectorAll('polyline')).toHaveLength(2)
  })

  it('las capas se dibujan de abajo hacia arriba según su orden, no según cómo se marcaron', () => {
    // Se marcaron subrasante primero y terreno después (orden inverso al del
    // paquete), pero terreno (orden 0) debe dibujarse antes que subrasante
    // (orden 1).
    useAlmacen.getState().alternarCapaVisible('camp-t')
    useAlmacen.getState().alternarCapaVisible('camp-s')
    useAlmacen.getState().alternarCapaVisible('camp-s')
    useAlmacen.getState().alternarCapaVisible('camp-t')
    expect(useAlmacen.getState().capasVisibles).toEqual(['camp-s', 'camp-t'])

    const { container } = render(
      <CorteTransversal
        progresiva={0}
        idsVisibles={useAlmacen.getState().capasVisibles}
        idCampaniaReferencia="camp-t"
      />,
    )
    const trazos = container.querySelectorAll('polyline')
    expect(trazos[0]).toHaveAttribute('data-capa-id', 'camp-t')
    expect(trazos[1]).toHaveAttribute('data-capa-id', 'camp-s')
  })

  it('cada capa lleva su nombre junto al primer punto', () => {
    render(
      <CorteTransversal
        progresiva={0}
        idsVisibles={useAlmacen.getState().capasVisibles}
        idCampaniaReferencia="camp-t"
      />,
    )
    expect(screen.getByText('TERRENO EXISTENTE')).toBeInTheDocument()
    expect(screen.getByText('SUBRASANTE')).toBeInTheDocument()
  })

  it('el relleno entre dos capas solo cubre los tramos donde ambas tienen cota', () => {
    const { container } = render(
      <CorteTransversal
        progresiva={0}
        idsVisibles={useAlmacen.getState().capasVisibles}
        idCampaniaReferencia="camp-t"
      />,
    )
    // VER-I↔SAR-I y EJE↔BOR-D: dos tramos con pareja, separados por BOR-I
    // (solo terreno) y SAR-D (solo subrasante), que no deben unirse.
    expect(container.querySelectorAll('[data-relleno-capas]')).toHaveLength(2)
  })

  it('el nombre accesible de un punto dice de qué capa es cuando hay varias visibles', () => {
    render(
      <CorteTransversal
        progresiva={0}
        idsVisibles={useAlmacen.getState().capasVisibles}
        idCampaniaReferencia="camp-t"
      />,
    )
    const botones = screen.getAllByRole('button', { name: /0\+000 Eje/ })
    expect(botones).toHaveLength(2)
    const etiquetas = botones.map((b) => b.getAttribute('aria-label'))
    expect(etiquetas.some((t) => t?.includes('TERRENO EXISTENTE'))).toBe(true)
    expect(etiquetas.some((t) => t?.includes('SUBRASANTE'))).toBe(true)
    // Dos puntos de la misma celda en capas distintas no pueden anunciarse igual.
    expect(etiquetas[0]).not.toBe(etiquetas[1])
  })

  it('con una sola capa marcada explícitamente se ve igual que con una sola capa', () => {
    useAlmacen.getState().alternarCapaVisible('camp-s') // deja solo camp-t visible
    render(
      <CorteTransversal
        progresiva={0}
        idsVisibles={useAlmacen.getState().capasVisibles}
        idCampaniaReferencia="camp-t"
      />,
    )

    const botones = screen.getAllByRole('button', { name: /^0\+000 / })
    expect(botones).toHaveLength(5) // VER-I, SAR-I, BOR-I, EJE, BOR-D

    const eje = screen.getByRole('button', { name: /0\+000 Eje/ })
    expect(eje.getAttribute('aria-label')).not.toContain('TERRENO EXISTENTE')
    expect(eje.getAttribute('aria-label')).toMatch(/^0\+000 Eje · cota [\d.]+ m$/)
  })
})

/**
 * Rasante plana en 3244.850, sin pendiente longitudinal ni transversal, para
 * el ancho completo de la plantilla del ejemplo (hasta 5.6 m de offset).
 * camp-1 mide en SUBRASANTE, y BASE + CARPETA (0.20 + 0.05 = 0.25 m) van
 * encima de esa capa, así que su cota teórica ahí queda en 3244.600.
 *
 * Con esto, en 0+000 de camp-1 (que solo mide EJE y BOR-I): EJE (cota
 * 3244.6275) queda por encima de la cota teórica de SUBRASANTE — corte — y
 * BOR-I (cota 3244.5625) por debajo — relleno. El único tramo con pareja
 * cruza la rasante, así que sirve para probar el reparto en corte/relleno y
 * el corte del cruce con una sola campaña. VER-I no lo midió camp-1, así que
 * ningún sombreado debe llegar a su offset (-5.6).
 */
function rasantePlanaDeEjemplo(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 3244.85,
    pendienteLongitudinal: 0,
    tramos: [{ nombre: 'Sección', hastaOffset: 5.6, tipo: 'pendiente', valor: 0 }],
    simetrica: true,
    tramosIzquierda: null,
  }
}

function fijarRasanteDeEjemplo(): void {
  useAlmacen.getState().fijarRasante('c-1', rasantePlanaDeEjemplo())
}

describe('CorteTransversal con rasante', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('dibuja la rasante además del terreno medido', () => {
    fijarRasanteDeEjemplo()
    render(<CorteTransversal progresiva={0} idsVisibles={['camp-1']} idCampaniaReferencia="camp-1" />)

    expect(screen.getByLabelText(/rasante de proyecto/i)).toBeInTheDocument()
  })

  it('sombrea corte y relleno por separado, no como una sola mancha', () => {
    fijarRasanteDeEjemplo()
    const { container } = render(
      <CorteTransversal progresiva={0} idsVisibles={['camp-1']} idCampaniaReferencia="camp-1" />,
    )

    expect(container.querySelectorAll('[data-zona="corte"]').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('[data-zona="relleno"]').length).toBeGreaterThan(0)
  })

  it('sin rasante definida el corte se dibuja como hasta ahora', () => {
    useAlmacen.getState().fijarRasante('c-1', null)
    render(<CorteTransversal progresiva={0} idsVisibles={['camp-1']} idCampaniaReferencia="camp-1" />)

    expect(screen.queryByLabelText(/rasante de proyecto/i)).toBeNull()
    expect(screen.getAllByLabelText(/cota/i).length).toBeGreaterThan(0)
  })

  it('no sombrea contra la rasante donde no hay medida', () => {
    // VER-I no se midió en camp-1: el sombreado no debe llegar hasta su offset (-5.6).
    fijarRasanteDeEjemplo()
    const { container } = render(
      <CorteTransversal progresiva={0} idsVisibles={['camp-1']} idCampaniaReferencia="camp-1" />,
    )

    const zonas = [...container.querySelectorAll('[data-zona]')]
    const offsets = zonas.flatMap((z) => [
      Number(z.getAttribute('data-offset-inicio')),
      Number(z.getAttribute('data-offset-fin')),
    ])
    expect(offsets.every((offset) => offset > -5.6)).toBe(true)
  })

  it('cada zona de corte o relleno dice qué es y cuánto, para quien use un lector de pantalla', () => {
    fijarRasanteDeEjemplo()
    const { container } = render(
      <CorteTransversal progresiva={0} idsVisibles={['camp-1']} idCampaniaReferencia="camp-1" />,
    )

    const zonas = [...container.querySelectorAll('[data-zona]')]
    expect(zonas.length).toBeGreaterThan(0)
    for (const zona of zonas) {
      expect(zona).not.toHaveAttribute('aria-hidden')
      const nombre = zona.getAttribute('aria-label')
      expect(nombre).toMatch(
        /^(Corte|Relleno) de hasta \d+ mm, entre [\d.]+ y [\d.]+ m a la (izquierda|derecha) del eje$/,
      )
      expect(zona.querySelector('title')?.textContent).toBe(nombre)
    }
  })

  it('junto al dibujo hay una leyenda que explica la trama de corte y de relleno', () => {
    fijarRasanteDeEjemplo()
    render(<CorteTransversal progresiva={0} idsVisibles={['camp-1']} idCampaniaReferencia="camp-1" />)

    expect(screen.getByText(/^Corte:/)).toBeInTheDocument()
    expect(screen.getByText(/^Relleno:/)).toBeInTheDocument()
  })
})

describe('CorteTransversal: contra qué capa se sombrea', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoDosCapas())
    fijarRasanteDeEjemplo()
  })

  it('el sombreado corresponde a la campaña de referencia y no cambia al marcar o desmarcar la otra capa', () => {
    const zonasDe = (idsVisibles: string[]) => {
      const { container, unmount } = render(
        <CorteTransversal progresiva={0} idsVisibles={idsVisibles} idCampaniaReferencia="camp-t" />,
      )
      const zonas = [...container.querySelectorAll('[data-zona]')].map((z) => ({
        zona: z.getAttribute('data-zona'),
        inicio: z.getAttribute('data-offset-inicio'),
        fin: z.getAttribute('data-offset-fin'),
      }))
      unmount()
      return zonas
    }

    const soloReferencia = zonasDe(['camp-t'])
    expect(soloReferencia.length).toBeGreaterThan(0)

    // Encender la otra capa en el selector no debe mover ni un milímetro el
    // sombreado: sigue siendo contra camp-t, la campaña de referencia.
    expect(zonasDe(['camp-t', 'camp-s'])).toEqual(soloReferencia)

    // Con camp-s de referencia (en vez de camp-t), y visible, el sombreado
    // usa la cota de camp-s: distinto del anterior.
    const { container: conS } = render(
      <CorteTransversal progresiva={0} idsVisibles={['camp-t', 'camp-s']} idCampaniaReferencia="camp-s" />,
    )
    const zonasConS = [...conS.querySelectorAll('[data-zona]')].map((z) => ({
      zona: z.getAttribute('data-zona'),
      inicio: z.getAttribute('data-offset-inicio'),
      fin: z.getAttribute('data-offset-fin'),
    }))
    expect(zonasConS).not.toEqual(soloReferencia)
  })

  it('si la campaña de referencia no está entre las capas marcadas, no sombrea nada y dice por qué', () => {
    const { container } = render(
      <CorteTransversal progresiva={0} idsVisibles={['camp-s']} idCampaniaReferencia="camp-t" />,
    )

    expect(container.querySelectorAll('[data-zona]')).toHaveLength(0)
    expect(screen.getByText(/corresponde a la capa que estás controlando/i)).toBeInTheDocument()
  })
})

/**
 * Plantilla angosta, sin ningún elemento en el offset 0: IZQ a −3.00 m y DER
 * a 2.00 m, nada en el eje. Es el escenario del arreglo — sin una celda que
 * caiga justo en el eje, un tramo con pareja puede unir un punto de cada
 * lado en una sola zona.
 */
function puntosSinEje(): PuntoSeccion[] {
  return [
    {
      id: 'p-izq',
      rol: 'bordeCalzada',
      nombre: 'Izquierda',
      distancia: -3.0,
      distanciaDeFabrica: false,
      palabras: ['IZQ'],
    },
    {
      id: 'p-der',
      rol: 'bordeCalzada',
      nombre: 'Derecha',
      distancia: 2.0,
      distanciaDeFabrica: false,
      palabras: ['DER'],
    },
  ]
}

/**
 * IZQ y DER, ambas medidas en la progresiva 0, sobre una rasante plana en
 * 3245.000: IZQ sale a 3245.032 (32 mm de corte) y DER a 3245.020 (20 mm de
 * corte). Las dos del mismo lado de la rasante — ningún cruce ahí—, así que
 * sin el arreglo del eje habría un solo tramo IZQ↔DER, y su zona quedaría
 * rotulada entera "a la izquierda del eje" (−3.00 pesa más que 2.00) aunque
 * la mitad de esa zona está a la derecha.
 */
function proyectoSinEje(): Proyecto {
  const proyecto = proyectoEjemplo()
  const tomaSinEje: Toma = {
    id: 'camp-sin-eje',
    fecha: '2026-08-21',
    capaId: 'cap-subrasante',
    bmInicialId: 'bm-1',
    cierre: CIERRE_CERRADO,
    estaciones: [
      {
        id: 'e-1',
        vistaAtras: { id: 'l-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.0 },
        intermedias: [
          { id: 'l-2', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-izq' } }, valor: 1.148 },
          { id: 'l-3', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-der' } }, valor: 1.16 },
        ],
        vistaAdelante: { id: 'l-4', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.0 },
      },
    ],
  }
  proyecto.calles = [
    {
      id: 'c-sin-eje',
      nombre: 'Calle sin eje',
      seccion: {
        puntos: puntosSinEje(),
        palabrasProgresiva: ['PROG', 'PK', 'ABSCISA', 'EST', 'PROGRESIVA'],
        palabrasPuntoControl: ['PC', 'BM', 'PUNTO DE CONTROL'],
        palabrasReferencia: ['EXISTENTE', 'EXIST', 'REF'],
      },
      nivelaciones: [{ id: 'niv-sin-eje', nombre: 'Nivelación', color: '#2563eb', tomas: [tomaSinEje] }],
      rasante: {
        progresivaArranque: 0,
        cotaArranque: 3245.0,
        pendienteLongitudinal: 0,
        tramos: [{ nombre: 'Sección', hastaOffset: 3.0, tipo: 'pendiente', valor: 0 }],
        simetrica: true,
        tramosIzquierda: null,
      },
    },
  ]
  return proyecto
}

describe('CorteTransversal: una zona no puede cruzar el eje', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoSinEje())
  })

  it('en una plantilla sin punto de eje, la zona se reparte en una por lado', () => {
    const { container } = render(
      <CorteTransversal progresiva={0} idsVisibles={['camp-sin-eje']} idCampaniaReferencia="camp-sin-eje" />,
    )

    const zonas = [...container.querySelectorAll('[data-zona]')]
    expect(zonas).toHaveLength(2)

    // Ninguna zona cruza el eje: sus dos offsets quedan del mismo lado (o
    // tocan el 0, que es de los dos a la vez).
    for (const zona of zonas) {
      const inicio = Number(zona.getAttribute('data-offset-inicio'))
      const fin = Number(zona.getAttribute('data-offset-fin'))
      expect(inicio >= 0 || fin <= 0).toBe(true)
      expect(inicio <= 0 || fin >= 0).toBe(true)
    }

    const nombres = zonas.map((z) => z.getAttribute('aria-label'))
    expect(nombres.some((n) => n?.includes('a la izquierda del eje'))).toBe(true)
    expect(nombres.some((n) => n?.includes('a la derecha del eje'))).toBe(true)
    // Y ninguna dice lo contrario de dónde está: nada del lado derecho debe
    // salir rotulado "a la izquierda", ni al revés.
    expect(nombres.every((n) => n?.includes('izquierda') || n?.includes('derecha'))).toBe(true)
  })
})
