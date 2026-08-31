import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Proyecto, Toma } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import VistaLibreta from './VistaLibreta'

const CIERRE_CERRADO = {
  tipo: 'cerrado' as const,
  bmFinalId: 'bm-1',
  longitudK: 0.36,
  longitudKAuto: true,
  clase: 'tercerOrden' as const,
  coeficiente: 12,
}

/**
 * TERRENO mide el borde izquierdo y el eje; SUBRASANTE mide el eje y el
 * sardinel derecho. El borde izquierdo es exclusivo de TERRENO, el sardinel
 * derecho exclusivo de SUBRASANTE: sirven para distinguir sin ambigüedad qué
 * campaña dibujó el corte.
 *
 * Las lecturas apuntan a su punto por el **id** de la sección de la calle
 * (`p-borde-i`…), que es la llave que queda guardada en el proyecto, no por
 * la palabra con la que Max lo escribe. Escritas con la palabra —como
 * estuvieron hasta la tarea D7a, herencia del modelo anterior— no casaban con
 * ningún punto de la calle: caían fuera de la grilla, salían con offset cero
 * y el corte las rotulaba con la clave cruda de respaldo. La prueba pasaba,
 * pero por el camino de los puntos que ya no existen, no por el que vigila.
 */
function tomaTerreno(): Toma {
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
          { id: 'lt-4', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-borde-i' } }, valor: 1.35 },
          { id: 'lt-5', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-eje' } }, valor: 1.5 },
        ],
        vistaAdelante: { id: 'lt-7', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.0 },
      },
    ],
  }
}

function tomaSubrasante(): Toma {
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
          { id: 'ls-4', destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-eje' } }, valor: 1.2 },
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
    { id: 'niv-t', nombre: 'Terreno', color: '#2563eb', tomas: [tomaTerreno()] },
    { id: 'niv-s', nombre: 'Subrasante', color: '#dc2626', tomas: [tomaSubrasante()] },
  ]
  return proyecto
}

describe('VistaLibreta', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('abre en la última estación, que es donde se sigue trabajando', () => {
    render(<VistaLibreta />)

    expect(screen.getByText('3247.085')).toBeInTheDocument()
    expect(screen.queryByText(/que no es la última/)).not.toBeInTheDocument()
  })

  it('muestra la cota instrumento de la estación que se elija', async () => {
    const usuario = userEvent.setup()
    render(<VistaLibreta />)

    await usuario.click(screen.getByRole('button', { name: '1' }))

    expect(screen.getByText('3246.605')).toBeInTheDocument()
    expect(screen.getByText(/Estás escribiendo en la estación 1 de 2, que no es la última/)).toBeInTheDocument()
  })

  it('muestra el veredicto del cierre en verde cuando pasa', () => {
    render(<VistaLibreta />)
    expect(screen.getByText(/PASA/)).toBeInTheDocument()
    expect(screen.getByText(/−5.0 mm|-5.0 mm/)).toBeInTheDocument()
    expect(screen.getByText(/±7.2 mm/)).toBeInTheDocument()
  })

  it('muestra cuántas celdas de la grilla ya están llenas', () => {
    render(<VistaLibreta />)

    // La toma de SUBRASANTE del ejemplo mide 5 progresivas (0,20,40,60,80) ×
    // 5 puntos (SAR-I, BOR-I, EJE, BOR-D, SAR-D) = 25 celdas llenas, contadas
    // a mano en `estaciones[0].intermedias` (15) + `estaciones[1].intermedias`
    // (10). La calle tiene 7 puntos en total (suma VER-I y VER-D, que esta
    // toma nunca midió): el total de la grilla es 5 progresivas × 7 puntos = 35.
    expect(screen.getByText(/llenadas 25 de 35/)).toBeInTheDocument()
  })

  it('registra una lectura y salta a la siguiente celda pendiente', async () => {
    const usuario = userEvent.setup()
    render(<VistaLibreta />)

    const campo = screen.getByLabelText(/lectura de mira/i)
    await usuario.type(campo, '2.100{Enter}')

    const resultado = useAlmacen.getState().calcular()!
    // La toma de SUBRASANTE del ejemplo mide 25 celdas; con la lectura recién
    // escrita (en la primera celda pendiente, 0+000 VER-I) quedan 26.
    expect(resultado.celdasLlenas).toBe(26)
    expect(screen.getByText(/celda activa/i).textContent).not.toContain('0+000 VER-I')
  })

  // NOTA (tarea C3): existía aquí una prueba «muestra cuántas celdas faltan»
  // que esperaba el texto «llenadas 25 de 70». Ese 70 salía de la plantilla
  // completa (7 puntos) por el rango configurado de la calle (0 a 180 m cada
  // 20 m): un total que representaba TODA la calle, se hubiera medido o no.
  // Con el nuevo modelo la grilla sale de las progresivas medidas —no de un
  // rango inventado—, así que el total ya no puede representar «toda la
  // calle»: solo puede contar las progresivas que ya se tocaron (35 en este
  // ejemplo: 5 progresivas medidas × 7 puntos de la calle). Cambiar el 70 por
  // un 35 sin decirlo escondería que el número ya no significa lo mismo —
  // antes avisaba cuánta calle faltaba por recorrer; ahora, como mucho, avisa
  // cuánto falta de lo ya empezado, y no dice nada de lo que ni se ha tocado.
  // Se retira la prueba en vez de renumerarla en silencio: queda anotada en
  // el informe de la tarea para que se decida qué reemplaza esa lectura de
  // avance sobre la calle completa.

  // NOTA (tarea C3): existía aquí una prueba «con una calle de progresiva
  // final menor que la inicial, se dibuja sin lanzar», que fijaba
  // `progresivaInicio`/`progresivaFin` al revés en la calle para comprobar
  // que la vista no revienta. Esos campos ya no existen en `Calle`: no hay
  // forma de dejarla «mal configurada» en ese sentido. Misma causa que la
  // prueba equivalente retirada en `evaluar.test.ts`; se anota una sola vez
  // en el informe de la tarea.

  it('muestra el aviso de cierre fuera de tolerancia', async () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const lecturaId = useAlmacen
      .getState()
      .proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[1]!.vistaAdelante!.id
    useAlmacen.getState().actualizarLectura(campaniaId, lecturaId, 1.887)

    render(<VistaLibreta />)
    expect(screen.getByText(/Cierre fuera de tolerancia/i)).toBeInTheDocument()
  })

  it('con una campaña sin estaciones, ofrece empezar la libreta en vez de no mostrar nada', async () => {
    const usuario = userEvent.setup()
    const proyecto = proyectoEjemplo()
    proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones = []
    useAlmacen.getState().cargarProyecto(proyecto)

    render(<VistaLibreta />)

    expect(
      screen.getByText(/esta libreta todavía no tiene ninguna estación/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/estación 1/i)).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: /empezar la libreta/i }))

    expect(screen.getByRole('heading', { name: 'Estación 1' })).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones).toHaveLength(1)
  })

  describe('declarar las progresivas donde se va a medir', () => {
    /** El campo de la libreta con el que se declara dónde se va a medir. */
    function campoProgresiva(): HTMLElement {
      return screen.getByLabelText(/añadir progresiva/i)
    }

    it('acepta la progresiva escrita con kilómetro o sin él', async () => {
      const usuario = userEvent.setup()
      render(<VistaLibreta />)

      // La toma del ejemplo mide 5 progresivas × 7 puntos de la calle = 35.
      expect(screen.getByText(/llenadas 25 de 35/)).toBeInTheDocument()

      await usuario.type(campoProgresiva(), '0+100')
      await usuario.click(screen.getByRole('button', { name: 'Añadir' }))

      expect(screen.getByText(/llenadas 25 de 42/)).toBeInTheDocument()
      // El campo queda limpio para la siguiente, que es como se declaran en
      // serie las progresivas de una jornada.
      expect(campoProgresiva()).toHaveValue('')

      await usuario.type(campoProgresiva(), '120')
      await usuario.click(screen.getByRole('button', { name: 'Añadir' }))

      expect(screen.getByText(/llenadas 25 de 49/)).toBeInTheDocument()
    })

    it('una progresiva que no se entiende lo dice, en vez de no hacer nada', async () => {
      const usuario = userEvent.setup()
      render(<VistaLibreta />)

      await usuario.type(campoProgresiva(), 'por la esquina')
      await usuario.click(screen.getByRole('button', { name: 'Añadir' }))

      expect(screen.getByText(/no se entiende/i)).toBeInTheDocument()
      expect(screen.getByText(/llenadas 25 de 35/)).toBeInTheDocument()
    })

    it('declarar una progresiva que ya está en la tabla no la duplica y lo dice', async () => {
      const usuario = userEvent.setup()
      render(<VistaLibreta />)

      await usuario.type(campoProgresiva(), '0+020')
      await usuario.click(screen.getByRole('button', { name: 'Añadir' }))

      expect(screen.getByText(/ya está en la tabla/i)).toBeInTheDocument()
      expect(screen.getByText(/llenadas 25 de 35/)).toBeInTheDocument()
    })

    it('quita una progresiva declarada mientras siga vacía', async () => {
      const usuario = userEvent.setup()
      render(<VistaLibreta />)

      await usuario.type(campoProgresiva(), '0+100')
      await usuario.click(screen.getByRole('button', { name: 'Añadir' }))
      expect(screen.getByText(/llenadas 25 de 42/)).toBeInTheDocument()

      await usuario.click(screen.getByRole('button', { name: 'Quitar 0+100' }))

      expect(screen.getByText(/llenadas 25 de 35/)).toBeInTheDocument()
    })

    it('no quita una progresiva que ya tiene lecturas: lo dice en vez de tirarlas', async () => {
      const usuario = userEvent.setup()
      render(<VistaLibreta />)

      await usuario.click(screen.getByRole('button', { name: 'Quitar 0+000' }))

      expect(screen.getByText(/ya tiene lecturas/i)).toBeInTheDocument()
      expect(screen.getByText(/llenadas 25 de 35/)).toBeInTheDocument()
      expect(useAlmacen.getState().calcular()!.cotasPorCelda.has('0|p-eje')).toBe(true)
    })
  })

  describe('el corte de la libreta dibuja la campaña activa', () => {
    beforeEach(() => {
      useAlmacen.getState().cargarProyecto(proyectoDosCapas())
      useAlmacen.getState().irAProgresiva(0)
    })

    // Regresión: el corte de la libreta leía `capasVisibles`, que es estado
    // del selector de capas de Resultados. Si el topógrafo dejaba marcada
    // otra capa ahí antes de volver a la libreta, su propia medición —la
    // campaña activa— desaparecía del corte justo cuando más se necesita
    // para cazar una lectura mal anotada en la calle.
    it('dibuja la campaña activa aunque el selector de Resultados tenga marcada otra', () => {
      expect(useAlmacen.getState().campaniaActivaId).toBe('camp-t')
      // El topógrafo dejó marcada solo SUBRASANTE en el selector de Resultados.
      useAlmacen.getState().alternarCapaVisible('camp-s')

      render(<VistaLibreta />)

      const nombres = screen
        .getAllByRole('button', { name: /^0\+000 .*cota/ })
        .map((b) => b.getAttribute('aria-label'))
      // El borde izquierdo solo lo midió TERRENO, la campaña activa: tiene que aparecer.
      expect(nombres.some((n) => n?.includes('Borde izquierdo'))).toBe(true)
      // El sardinel derecho solo lo midió SUBRASANTE, que no es la activa: no debe aparecer.
      expect(nombres.some((n) => n?.includes('Sardinel derecho'))).toBe(false)
    })

    it('sigue dibujando la campaña activa si además no hay ninguna capa marcada en Resultados', () => {
      render(<VistaLibreta />)

      const nombres = screen
        .getAllByRole('button', { name: /^0\+000 .*cota/ })
        .map((b) => b.getAttribute('aria-label'))
      expect(nombres.some((n) => n?.includes('Borde izquierdo'))).toBe(true)
      expect(nombres.some((n) => n?.includes('Sardinel derecho'))).toBe(false)
    })
  })
})
