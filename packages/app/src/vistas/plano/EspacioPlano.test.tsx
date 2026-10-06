import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { seccionDeFabrica, type PlanoImportado, type Proyecto, type Toma } from '@topo/core'
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlmacen } from '../../estado/almacen'
import { proyectoVacio } from '../../estado/ejemplo'
import { abrirPdf, textosDePagina, type BibliotecaPdf } from '../../planos/pdf'
import { rasanteDeCroquis } from './datosPista'
import EspacioPlano from './EspacioPlano'
import { pantallaAMundo } from './geometriaVisor'

/**
 * En jsdom no hay <canvas> para pintar un PDF ni trabajador de pdfjs: se
 * cambia solo la carga del PDF. Los textos sí son los de verdad, leídos de
 * la muestra con el build «legacy» de pdfjs; la imagen es una dirección falsa.
 */
/** Cuántas páginas dice tener el PDF de prueba: la muestra tiene una, y se lee siempre esa. */
const estadoPdf = vi.hoisted(() => ({ paginas: 1 }))

vi.mock('./cargarPlano', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('./cargarPlano')>()
  return {
    ...real,
    revisarPdf: vi.fn(async () => 1),
    cargarPdf: vi.fn(async (bytes: Uint8Array, pagina: number) => {
      const doc = await abrirPdf(bytes, { biblioteca: pdfjsLegacy as unknown as BibliotecaPdf })
      const { anchoPt, altoPt } = await doc.tamanoPagina(1)
      const textos = await textosDePagina(doc, 1)
      await doc.cerrar()
      return { url: 'blob:plano-de-prueba', anchoPt, altoPt, paginas: estadoPdf.paginas, pagina, textos }
    }),
  }
})

// ─── Muestras ─────────────────────────────────────────────────────────────

declare const process: { cwd(): string; getBuiltinModule(nombre: string): unknown }
interface ArchivosDeNode {
  existsSync(ruta: string): boolean
  readFileSync(ruta: string): Uint8Array
}
function muestra(nombre: string): Uint8Array<ArrayBuffer> {
  const fs = process.getBuiltinModule('node:fs') as ArchivosDeNode
  const enPaquete = `${process.cwd()}/src/pruebas/muestras/${nombre}`
  const ruta = fs.existsSync(enPaquete) ? enPaquete : `${process.cwd()}/packages/app/src/pruebas/muestras/${nombre}`
  return new Uint8Array(fs.readFileSync(ruta))
}
const DXF = muestra('expediente-pistas.dxf')
const PDF = muestra('plano-expediente.pdf')

const PLANO_DXF: PlanoImportado = { id: 'plano-dxf', nombre: 'expediente-pistas', formato: 'dxf', calibracion: { metrosPorUnidad: 1, ejeY: 'arriba' } }
/** A4 a 1:1000: 1 mm de papel es 1 m, y 1 punto PDF es 25.4/72 mm. */
const PLANO_PDF: PlanoImportado = { id: 'plano-pdf', nombre: 'plano-expediente', formato: 'pdf', pagina: 1, calibracion: { metrosPorUnidad: 25.4 / 72, ejeY: 'arriba' } }

/** Proyecto con el DXF del expediente ya importado y el Jr. Lima como pista con su calle. */
function proyectoConDxf(extra: Partial<Proyecto> = {}): Proyecto {
  const base = proyectoVacio()
  return {
    ...base,
    calles: [
      {
        id: 'c-lomas',
        nombre: 'PSJE. LAS LOMAS',
        seccion: seccionDeFabrica(),
        nivelaciones: [],
        rasante: null,
        planControles: {
          opciones: {},
          controles: [
            { progresiva: 0, cota: 3244, motivos: [{ tipo: 'inicio', texto: 'inicio de la pista' }] },
            { progresiva: 60, cota: 3248.42, motivos: [{ tipo: 'quiebre', texto: 'quiebre de pendiente' }] },
          ],
        },
      },
    ],
    planos: [PLANO_DXF],
    pistas: [
      {
        id: 'pista-lomas',
        nombre: 'PSJE. LAS LOMAS',
        planoId: 'plano-dxf',
        polilinea: [{ x: 1150, y: 2000 }, { x: 1150, y: 1940 }, { x: 1186, y: 1892 }],
        calleId: 'c-lomas',
        origen: 'dxf',
      },
    ],
    ...extra,
  }
}

const BM_1 = { tipo: 'bm' as const, bmId: 'bm-1' }
function toma(id: string, fecha: string, capaId: string, adelante: number | null): Toma {
  return {
    id,
    fecha,
    capaId,
    bmInicialId: 'bm-1',
    cierre: { tipo: 'cerrado', bmFinalId: 'bm-1', longitudK: 1, longitudKAuto: false, clase: 'tercerOrden', coeficiente: 12 },
    estaciones: [
      {
        id: `${id}-e1`,
        vistaAtras: { id: `${id}-va`, destino: BM_1, valor: 1.3 },
        intermedias: [],
        // Sin vista adelante la nivelación no ha vuelto al BM: está sin cerrar.
        ...(adelante === null ? {} : { vistaAdelante: { id: `${id}-vd`, destino: BM_1, valor: adelante } }),
      },
    ],
  }
}

/**
 * El pasaje con rasante puesta a mano y tres nivelaciones: una que cierra
 * (vuelve al BM con 0 mm), una que no (200 mm) y una sin cerrar.
 */
function proyectoConNivelaciones(): Proyecto {
  const base = proyectoConDxf()
  const rasante = { ...rasanteDeCroquis(3240, 2, null), tramos: [{ nombre: 'Calzada', hastaOffset: 3, tipo: 'pendiente' as const, valor: 3 }] }
  return {
    ...base,
    bms: [{ id: 'bm-1', nombre: 'BM-1', cota: 3245, tipo: 'oficial', descripcion: '' }],
    capas: [
      { id: 'cap-terreno', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 },
      { id: 'cap-sub', nombre: 'SUBRASANTE', orden: 1, espesor: 0, toleranciaMm: 20 },
      { id: 'cap-base', nombre: 'BASE', orden: 2, espesor: 0.2, toleranciaMm: 10 },
    ],
    calles: [
      {
        ...base.calles[0]!,
        rasante,
        nivelaciones: [
          { id: 'n-sub', nombre: 'Subrasante', color: '#2563eb', tomas: [toma('t-sub', '2026-09-01', 'cap-sub', 1.3)] },
          { id: 'n-base', nombre: 'Base', color: '#16a34a', tomas: [toma('t-base', '2026-09-05', 'cap-base', 1.5)] },
          { id: 'n-ter', nombre: 'Terreno', color: '#a16207', tomas: [toma('t-ter', '2026-09-08', 'cap-terreno', null)] },
        ],
      },
    ],
  }
}

function archivo(bytes: Uint8Array<ArrayBuffer>, nombre: string): File {
  return new File([bytes], nombre)
}

/** El SVG mide 800 × 500 en pantalla; jsdom no mide nada por su cuenta. */
function visor(): SVGSVGElement {
  const svg = screen.getByRole('application', { name: 'Visor del plano' }) as unknown as SVGSVGElement
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 500, right: 800, bottom: 500, x: 0, y: 0, toJSON: () => ({}) })
  return svg
}

/** Toca el plano en el punto (x, y) del plano, como lo haría un dedo sin arrastrar. */
function tocarEnPlano(svg: SVGSVGElement, x: number, y: number) {
  const [vx, vy, ancho, alto] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number]
  const vista = { x: vx, y: vy, ancho, alto }
  const caja = { left: 0, top: 0, width: 800, height: 500 }
  // Se busca el píxel que cae en (x, y): la vuelta exacta de pantallaAMundo.
  const escala = Math.min(800 / ancho, 500 / alto)
  const margenX = (800 - ancho * escala) / 2
  const margenY = (500 - alto * escala) / 2
  const clientX = (x - vx) * escala + margenX
  const clientY = (-y - vy) * escala + margenY
  expect(pantallaAMundo(clientX, clientY, caja, vista).x).toBeCloseTo(x, 6)
  fireEvent.pointerDown(svg, { pointerId: 1, clientX, clientY })
  fireEvent.pointerUp(svg, { pointerId: 1, clientX, clientY })
}

/**
 * jsdom no trae PointerEvent: sin él, fireEvent arma un evento genérico sin
 * clientX y el toque caería en NaN. Basta un MouseEvent con pointerId.
 */
if (typeof window.PointerEvent === 'undefined') {
  class EventoPunteroDePrueba extends MouseEvent {
    readonly pointerId: number
    constructor(tipo: string, inicio: PointerEventInit = {}) {
      super(tipo, inicio)
      this.pointerId = inicio.pointerId ?? 1
    }
  }
  window.PointerEvent = EventoPunteroDePrueba as unknown as typeof PointerEvent
}

beforeEach(() => {
  useAlmacen.getState().cargarProyecto(proyectoVacio())
  useAlmacen.getState().irASubObra('plano')
})

afterEach(() => {
  vi.clearAllMocks()
})

// ─── Importar ─────────────────────────────────────────────────────────────

describe('Plano de obra: importar', () => {
  it('sin planos, invita a importar uno', () => {
    render(<EspacioPlano />)
    expect(screen.getByRole('heading', { name: 'Plano de obra' })).toBeInTheDocument()
    expect(screen.getByText(/todavía no hay planos/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Importar plano (DXF o PDF)')).toBeInTheDocument()
  })

  it('un DWG no se intenta leer: dice que se pase a DXF con ODA File Converter', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await usuario.upload(screen.getByLabelText('Importar plano (DXF o PDF)'), archivo(new Uint8Array([65, 67, 49, 48]), 'obra.dwg'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/ODA File Converter/)
    expect(useAlmacen.getState().proyecto.planos ?? []).toHaveLength(0)
  })

  it('un DXF en metros se guarda ya calibrado, con sus bytes aparte, y dibuja sus capas', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await usuario.upload(screen.getByLabelText('Importar plano (DXF o PDF)'), archivo(DXF, 'expediente-pistas.dxf'))

    expect(await screen.findByText('✓ Plano importado.')).toBeInTheDocument()
    const { proyecto, archivosDePlano } = useAlmacen.getState()
    expect(proyecto.planos).toHaveLength(1)
    const plano = proyecto.planos![0]!
    expect(plano).toMatchObject({ nombre: 'expediente-pistas', formato: 'dxf', calibracion: { metrosPorUnidad: 1 } })
    // Los bytes guardados son los del archivo, y viven aparte: el JSON del proyecto no los lleva.
    const guardados = archivosDePlano[plano.id]!
    expect(guardados.byteLength).toBe(DXF.byteLength)
    expect(guardados.every((b, i) => b === DXF[i])).toBe(true)
    expect(JSON.stringify(proyecto)).not.toMatch(/ENTITIES/)
    expect(screen.getByText(/Escala: 1 unidad del dibujo = 1 m/)).toBeInTheDocument()

    const capas = screen.getByRole('group', { name: 'Capas del plano' })
    expect(within(capas).getAllByRole('checkbox')).toHaveLength(7)
    expect(within(capas).getByText(/1 INSERT/)).toBeInTheDocument()
  })

  it('ocultar una capa la guarda en capasOcultas', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().cargarProyecto(proyectoConDxf(), { 'plano-dxf': DXF })
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('checkbox', { name: 'CURVAS_NIVEL' }))
    expect(useAlmacen.getState().proyecto.planos![0]!.capasOcultas).toEqual(['CURVAS_NIVEL'])
    expect(screen.getByRole('checkbox', { name: 'CURVAS_NIVEL' })).not.toBeChecked()
    await usuario.click(screen.getByRole('checkbox', { name: 'CURVAS_NIVEL' }))
    expect(useAlmacen.getState().proyecto.planos![0]!.capasOcultas).toEqual([])
  })

  it('un PDF se guarda sin escala y abre la calibración', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await usuario.upload(screen.getByLabelText('Importar plano (DXF o PDF)'), archivo(PDF, 'plano-expediente.pdf'))
    expect(await screen.findByText(/Un PDF no trae escala/)).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.planos![0]).toMatchObject({ formato: 'pdf', pagina: 1, calibracion: null })
    expect(screen.getByRole('button', { name: 'Calibrar escala' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Calibrar escala' })).toBeInTheDocument()
  })

  it('un archivo que no es DXF ni PDF se rechaza con un mensaje claro', async () => {
    const usuario = userEvent.setup({ applyAccept: false })
    render(<EspacioPlano />)
    await usuario.upload(screen.getByLabelText('Importar plano (DXF o PDF)'), archivo(new TextEncoder().encode('hola') as Uint8Array<ArrayBuffer>, 'notas.txt'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Solo se importan planos en DXF o PDF.')
  })

  it('soltar el archivo sobre la pantalla también lo importa', async () => {
    render(<EspacioPlano />)
    fireEvent.drop(screen.getByRole('region', { name: 'Plano de obra' }), { dataTransfer: { files: [archivo(DXF, 'soltado.dxf')] } })
    expect(await screen.findByText('✓ Plano importado.')).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.planos![0]!.nombre).toBe('soltado')
  })
})

// ─── Visor PDF ────────────────────────────────────────────────────────────

describe('Plano de obra: PDF', () => {
  it('pinta la página de fondo y marca las cotas que leyó', async () => {
    useAlmacen.getState().cargarProyecto({ ...proyectoVacio(), planos: [PLANO_PDF] }, { 'plano-pdf': PDF })
    const { container } = render(<EspacioPlano />)
    expect(await screen.findByText(/Marcar las cotas que leyó la app \(5\)/)).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('image')?.getAttribute('href')).toBe('blob:plano-de-prueba'))
    expect(screen.getByText('cota 3244.400')).toBeInTheDocument()
  })

  it('calibrar: dos toques y la distancia real fijan la escala', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().cargarProyecto({ ...proyectoVacio(), planos: [{ ...PLANO_PDF, calibracion: null }] }, { 'plano-pdf': PDF })
    render(<EspacioPlano />)
    await screen.findByText(/Marcar las cotas/)
    await usuario.click(screen.getByRole('button', { name: 'Calibrar escala' }))
    const svg = visor()
    // Jr. Lima: de x = 40 mm a 240 mm de papel = 200 m. En puntos: mm · 72 / 25.4.
    const pt = 72 / 25.4
    tocarEnPlano(svg, 40 * pt, 100)
    tocarEnPlano(svg, 240 * pt, 100)
    expect(screen.getByText(/Toca el segundo punto/).textContent).toMatch(/^✓/)
    await usuario.type(screen.getByLabelText('Distancia real'), '200')
    await usuario.click(screen.getByRole('button', { name: 'Fijar escala' }))

    const calibracion = useAlmacen.getState().proyecto.planos![0]!.calibracion!
    expect(calibracion.metrosPorUnidad).toBeCloseTo(25.4 / 72, 6)
    expect(calibracion.ejeY).toBe('arriba')
    expect(screen.getByRole('status')).toHaveTextContent(/✓ Escala fijada: 1 punto del PDF = 0.352778 m/)
  })
})

// ─── Pistas ───────────────────────────────────────────────────────────────

describe('Plano de obra: pistas', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoConDxf(), { 'plano-dxf': DXF })
  })

  it('la pista empinada se marca en la lista y en el plano, con su pendiente', () => {
    render(<EspacioPlano />)
    const lista = screen.getByRole('region', { name: 'Pistas de la obra' })
    expect(within(lista).getByRole('button', { name: /PSJE\. LAS LOMAS/ })).toHaveTextContent('△ empinada')
    // Rótulos del plano: 0+000 → 0+060 sube 7.37 %.
    expect(screen.getByText('+7.37 % △ empinada')).toBeInTheDocument()
  })

  it('tocar la pista en el plano abre su ficha: tramo, largo, pendientes, capas y controles', async () => {
    render(<EspacioPlano />)
    const svg = visor()
    const trazo = svg.querySelector('[data-pista="pista-lomas"] polyline')!
    fireEvent.pointerDown(trazo, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 10, clientY: 10 })

    const ficha = screen.getByRole('region', { name: 'PSJE. LAS LOMAS' })
    expect(within(ficha).getByText('0+000 → 0+120')).toBeInTheDocument()
    expect(within(ficha).getByText('120.000 m')).toBeInTheDocument()
    const pendientes = within(ficha).getByRole('list', { name: 'Pendientes por tramo' })
    expect(within(pendientes).getAllByRole('listitem')[0]).toHaveTextContent('0+000 → 0+060: +7.37 % sube · △ empinada')
    expect(within(ficha).getByText('Sin nivelaciones todavía.')).toBeInTheDocument()
    const controles = within(ficha).getByRole('list', { name: 'Controles planificados' })
    expect(within(controles).getAllByRole('listitem')[1]).toHaveTextContent('0+060 · cota prevista 3248.420 · quiebre de pendiente')
    expect(within(ficha).getByText(/no comprobadas/)).toBeInTheDocument()
  })

  it('«Abrir sus cálculos» activa su calle y va a Calle › Revisar', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await usuario.click(within(screen.getByRole('region', { name: 'Pistas de la obra' })).getByRole('button', { name: /PSJE\. LAS LOMAS/ }))
    await usuario.click(screen.getByRole('button', { name: 'Abrir sus cálculos' }))
    const s = useAlmacen.getState()
    expect(s.calleActivaId).toBe('c-lomas')
    expect(s.espacio).toBe('calle')
    expect(s.modoCalle).toBe('revisar')
  })

  it('«Planificar cambios» lleva al planificador de su calle', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: /PSJE\. LAS LOMAS/ }))
    await usuario.click(screen.getByRole('button', { name: 'Planificar cambios' }))
    const s = useAlmacen.getState()
    expect(s.calleActivaId).toBe('c-lomas')
    expect(s.espacio).toBe('calle')
    expect(s.pantallaCalle).toBe('planificar')
  })

  it('«Tomar la rasante de las cotas del plano» enseña antes las cotas y su progresiva, y sin quiebres guarda con ✓', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: /PSJE\. LAS LOMAS/ }))
    await usuario.click(screen.getByRole('button', { name: 'Tomar la rasante de las cotas del plano' }))
    // Antes de guardar: qué cotas y en qué progresiva cae cada una (y a cuánto del eje).
    const vista = screen.getByRole('region', { name: 'Rasante desde las cotas del plano' })
    expect(within(vista).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual([
      '0+000 · cota 3244.000 m',
      '0+060 · cota 3248.420 m · a 1.0 m del eje',
      '0+120 · cota 3252.860 m · a 1.0 m del eje',
    ])
    // El pasaje sube parejo (+7.37 % y +7.40 %): no hay quiebre que avisar.
    expect(vista).not.toHaveTextContent(/solo vale/i)
    expect(useAlmacen.getState().proyecto.calles[0]!.rasante).toBeNull()

    await usuario.click(within(vista).getByRole('button', { name: 'Sí, tomar esta rasante' }))
    const rasante = useAlmacen.getState().proyecto.calles.find((c) => c.id === 'c-lomas')!.rasante!
    expect(rasante.cotaArranque).toBe(3244)
    expect(rasante.progresivaArranque).toBe(0)
    expect(rasante.pendienteLongitudinal).toBeCloseTo(7.3667, 3)
    expect(screen.getByRole('status')).toHaveTextContent('✓ Rasante tomada: 3244.000 m en 0+000, +7.37 %.')
  })

  it('si la calle ya tiene rasante, tomarla del plano pide confirmar y dice cuántas nivelaciones cambian', async () => {
    const usuario = userEvent.setup()
    const conRasante = proyectoConNivelaciones()
    useAlmacen.getState().cargarProyecto(conRasante, { 'plano-dxf': DXF })
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: /PSJE\. LAS LOMAS/ }))
    await usuario.click(screen.getByRole('button', { name: 'Tomar la rasante de las cotas del plano' }))
    const vista = screen.getByRole('region', { name: 'Rasante desde las cotas del plano' })
    expect(vista).toHaveTextContent('La calle ya tiene rasante: 3240.000 m en 0+000, +2.00 %')
    expect(vista).toHaveTextContent('cambian la cota de proyecto y la diferencia de 3 nivelaciones ya medidas')

    // «No» la deja como estaba.
    await usuario.click(within(vista).getByRole('button', { name: 'No, dejarla como está' }))
    expect(useAlmacen.getState().proyecto.calles[0]!.rasante).toEqual(conRasante.calles[0]!.rasante)

    await usuario.click(screen.getByRole('button', { name: 'Tomar la rasante de las cotas del plano' }))
    await usuario.click(screen.getByRole('button', { name: 'Sí, reemplazar la rasante' }))
    const rasante = useAlmacen.getState().proyecto.calles[0]!.rasante!
    expect(rasante.cotaArranque).toBe(3244)
    // La sección transversal que ya tenía se conserva.
    expect(rasante.tramos).toEqual(conRasante.calles[0]!.rasante!.tramos)
  })

  it('quitar una cota (la de un cruce) cambia la rasante que se toma', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: /PSJE\. LAS LOMAS/ }))
    await usuario.click(screen.getByRole('button', { name: 'Tomar la rasante de las cotas del plano' }))
    const vista = screen.getByRole('region', { name: 'Rasante desde las cotas del plano' })
    await usuario.click(within(vista).getByRole('checkbox', { name: /0\+000 · cota/ }))
    // Sin la del 0+000, arranca en la siguiente.
    expect(vista).toHaveTextContent(/Nueva: 3248\.420 m en 0\+060/)
    await usuario.click(within(vista).getByRole('button', { name: 'Sí, tomar esta rasante' }))
    expect(useAlmacen.getState().proyecto.calles[0]!.rasante).toMatchObject({ progresivaArranque: 60, cotaArranque: 3248.42 })
  })

  it('la ficha dice de cada nivelación si cerró ✓, no cerró ✗ o está sin comprobar △', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().cargarProyecto(proyectoConNivelaciones(), { 'plano-dxf': DXF })
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: /PSJE\. LAS LOMAS/ }))
    const capas = screen.getByRole('list', { name: 'Capas medidas' })
    expect(within(capas).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '✓ SUBRASANTE · 2026-09-01 — cerró',
      '✗ BASE · 2026-09-05 — no cerró',
      '△ TERRENO EXISTENTE · 2026-09-08 — sin comprobar',
    ])
  })

  it('una pista sobre un plano sin escala lo dice en la ficha y en la lista', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().cargarProyecto(proyectoConDxf({ planos: [{ ...PLANO_DXF, calibracion: null }] }), { 'plano-dxf': DXF })
    render(<EspacioPlano />)
    const lista = screen.getByRole('region', { name: 'Pistas de la obra' })
    expect(within(lista).getByRole('button', { name: /PSJE\. LAS LOMAS/ })).toHaveTextContent('sin escala')
    await usuario.click(within(lista).getByRole('button', { name: /PSJE\. LAS LOMAS/ }))
    expect(screen.getByText(/Este plano no tiene escala/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tomar la rasante de las cotas del plano' })).not.toBeInTheDocument()
  })

  it('una pista que el motor no puede medir sobre un plano calibrado no se confunde con «sin escala»', async () => {
    const usuario = userEvent.setup()
    // 10 km por unidad: el pasaje mediría 1200 km y saldrían más estacas de las que el motor acepta.
    useAlmacen.getState().cargarProyecto(proyectoConDxf({ planos: [{ ...PLANO_DXF, calibracion: { metrosPorUnidad: 10000, ejeY: 'arriba' } }] }), {
      'plano-dxf': DXF,
    })
    render(<EspacioPlano />)
    const lista = screen.getByRole('region', { name: 'Pistas de la obra' })
    const boton = within(lista).getByRole('button', { name: /PSJE\. LAS LOMAS/ })
    expect(boton).toHaveTextContent('△ no se pudo medir')
    expect(boton).not.toHaveTextContent('sin escala')
    await usuario.click(boton)
    expect(screen.getByText(/No se pudo medir esta pista/)).toBeInTheDocument()
    expect(screen.queryByText(/Este plano no tiene escala/)).not.toBeInTheDocument()
  })

  it('una pista sin calle ofrece «Crear su calle», y tomar la rasante también la crea', async () => {
    const usuario = userEvent.setup()
    const base = proyectoConDxf()
    useAlmacen.getState().cargarProyecto({ ...base, calles: [], pistas: base.pistas!.map((p) => ({ ...p, calleId: undefined })) }, { 'plano-dxf': DXF })
    render(<EspacioPlano />)
    const lista = screen.getByRole('region', { name: 'Pistas de la obra' })
    expect(within(lista).getByRole('button', { name: /PSJE\. LAS LOMAS/ })).toHaveTextContent('sin calle')
    await usuario.click(within(lista).getByRole('button', { name: /PSJE\. LAS LOMAS/ }))
    expect(screen.getByRole('button', { name: 'Crear su calle' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Tomar la rasante de las cotas del plano' }))
    await usuario.click(screen.getByRole('button', { name: 'Sí, tomar esta rasante' }))
    const { proyecto } = useAlmacen.getState()
    const calle = proyecto.calles.find((c) => c.id === proyecto.pistas![0]!.calleId)!
    expect(calle.nombre).toBe('PSJE. LAS LOMAS')
    expect(calle.rasante!.cotaArranque).toBe(3244)
    expect(screen.getByRole('button', { name: 'Abrir sus cálculos' })).toBeInTheDocument()
  })

  it('«Crear su calle» crea la calle sin rasante', async () => {
    const usuario = userEvent.setup()
    const base = proyectoConDxf()
    useAlmacen.getState().cargarProyecto({ ...base, calles: [], pistas: base.pistas!.map((p) => ({ ...p, calleId: undefined })) }, { 'plano-dxf': DXF })
    render(<EspacioPlano />)
    await usuario.click(within(screen.getByRole('region', { name: 'Pistas de la obra' })).getByRole('button', { name: /PSJE\. LAS LOMAS/ }))
    await usuario.click(screen.getByRole('button', { name: 'Crear su calle' }))
    const { proyecto } = useAlmacen.getState()
    expect(proyecto.calles).toHaveLength(1)
    expect(proyecto.calles[0]!.rasante).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('✓ Calle «PSJE. LAS LOMAS» creada con la pista. Sin rasante todavía.')
  })

  it('sin cotas del plano, las pendientes salen de la rasante de la calle', async () => {
    const usuario = userEvent.setup()
    const base = proyectoConDxf()
    const calle = { ...base.calles[0]!, rasante: rasanteDeCroquis(3240, -3, null) }
    // Sin el archivo no hay textos: la única fuente es la rasante.
    useAlmacen.getState().cargarProyecto({ ...base, calles: [calle] })
    render(<EspacioPlano />)
    await usuario.click(within(screen.getByRole('region', { name: 'Pistas de la obra' })).getByRole('button', { name: /PSJE\. LAS LOMAS/ }))
    expect(screen.getByText('Según la rasante de la calle')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Pendientes por tramo' })).getAllByRole('listitem')[0]).toHaveTextContent(
      '0+000 → 0+120: -3.00 % baja',
    )
    expect(screen.queryByRole('button', { name: 'Tomar la rasante de las cotas del plano' })).not.toBeInTheDocument()
  })

  it('elegir en la lista una pista de otro plano cambia el plano a la vista', async () => {
    const usuario = userEvent.setup()
    const base = proyectoConDxf()
    const otro: PlanoImportado = { ...PLANO_DXF, id: 'plano-otro', nombre: 'otro plano' }
    useAlmacen.getState().cargarProyecto(
      {
        ...base,
        planos: [otro, PLANO_DXF],
      },
      { 'plano-dxf': DXF, 'plano-otro': DXF },
    )
    render(<EspacioPlano />)
    expect(screen.getByLabelText('Plano a la vista')).toHaveValue('plano-otro')
    const lista = screen.getByRole('region', { name: 'Pistas de la obra' })
    expect(within(lista).getByRole('button', { name: /PSJE\. LAS LOMAS/ })).toHaveTextContent('en «expediente-pistas»')
    await usuario.click(within(lista).getByRole('button', { name: /PSJE\. LAS LOMAS/ }))
    expect(screen.getByLabelText('Plano a la vista')).toHaveValue('plano-dxf')
    expect(screen.getByRole('region', { name: 'PSJE. LAS LOMAS' })).toBeInTheDocument()
  })

  it('al elegir una pista, el visor lo dice y la ficha recibe el foco', async () => {
    render(<EspacioPlano />)
    const svg = visor()
    fireEvent.pointerDown(svg.querySelector('[data-pista="pista-lomas"] polyline')!, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 10, clientY: 10 })
    expect(screen.getByRole('button', { name: 'PSJE. LAS LOMAS elegida · ver ficha ↓' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'PSJE. LAS LOMAS' })).toHaveFocus())
  })

  it('quitar la pista pide confirmación y deja la calle', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: /PSJE\. LAS LOMAS/ }))
    await usuario.click(screen.getByRole('button', { name: 'Quitar la pista' }))
    await usuario.click(screen.getByRole('button', { name: 'Sí, quitar la pista' }))
    expect(useAlmacen.getState().proyecto.pistas).toEqual([])
    expect(useAlmacen.getState().proyecto.calles).toHaveLength(1)
  })

  it('sin el archivo del plano, avisa y sigue mostrando las pistas', () => {
    useAlmacen.getState().cargarProyecto(proyectoConDxf())
    render(<EspacioPlano />)
    expect(screen.getByText(/Falta el archivo de este plano/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /PSJE\. LAS LOMAS/ })).toBeInTheDocument()
  })
})

// ─── Ejes del DXF ─────────────────────────────────────────────────────────

describe('Plano de obra: ejes del DXF', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoConDxf(), { 'plano-dxf': DXF })
  })

  it('los ejes que aún no son pista se ofrecen; el que ya es pista no', () => {
    render(<EspacioPlano />)
    const ejes = screen.getByRole('region', { name: 'Ejes del DXF' })
    // Jr. Lima (200 m) y Av. Sol (120 m); el pasaje ya es pista.
    expect(within(ejes).getAllByRole('button').map((b) => b.textContent)).toEqual(['Eje 1 · 200.0 m', 'Eje 2 · 120.0 m'])
  })

  it('tocar un eje y «Usar como eje de una calle» crea la pista y su calle con el nombre del plano', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    const svg = visor()
    fireEvent.pointerDown(svg.querySelector('[data-eje="0"] polyline')!, { pointerId: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 5, clientY: 5 })

    const ficha = screen.getByRole('region', { name: 'Eje del plano 1' })
    expect(within(ficha).getByLabelText('Nombre de la calle')).toHaveValue('JR. LIMA')
    expect(within(ficha).getByText('5 cotas del plano junto a este eje.')).toBeInTheDocument()
    await usuario.click(within(ficha).getByRole('button', { name: 'Usar como eje de una calle' }))

    const { proyecto } = useAlmacen.getState()
    const pista = proyecto.pistas!.find((p) => p.nombre === 'JR. LIMA')!
    expect(pista).toMatchObject({ origen: 'dxf', planoId: 'plano-dxf', progresivaInicio: 0 })
    expect(pista.polilinea).toEqual([{ x: 1000, y: 2000 }, { x: 1200, y: 2000 }])
    expect(proyecto.calles.find((c) => c.id === pista.calleId)!.nombre).toBe('JR. LIMA')
    expect(screen.getByRole('status')).toHaveTextContent('✓ Calle «JR. LIMA» creada con el eje del plano.')
    // Ya es pista: sale de la lista de ejes y su ficha queda abierta.
    expect(screen.getByRole('region', { name: 'JR. LIMA' })).toBeInTheDocument()
  })

  it('«Tomar la rasante de las cotas del plano» desde el eje avisa del quiebre', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: 'Eje 1 · 200.0 m' }))
    await usuario.click(screen.getByRole('button', { name: 'Tomar la rasante de las cotas del plano' }))
    // Hasta confirmar no se crea nada.
    expect(useAlmacen.getState().proyecto.pistas).toHaveLength(1)
    const vista = screen.getByRole('region', { name: 'Rasante desde las cotas del plano' })
    expect(within(vista).getAllByRole('checkbox')).toHaveLength(5)
    await usuario.click(within(vista).getByRole('button', { name: 'Sí, tomar esta rasante' }))
    const { proyecto } = useAlmacen.getState()
    const pista = proyecto.pistas!.find((p) => p.nombre === 'JR. LIMA')!
    const rasante = proyecto.calles.find((c) => c.id === pista.calleId)!.rasante!
    expect(rasante.cotaArranque).toBe(3244.4)
    expect(rasante.pendienteLongitudinal).toBeCloseTo(-0.5)
    const estado = screen.getByRole('status')
    expect(estado).toHaveTextContent(/△ Calle «JR\. LIMA» creada con el eje del plano\. Rasante tomada solo del primer tramo/)
    expect(estado).toHaveTextContent(/4 tramos/)
    expect(estado).not.toHaveTextContent('✓')
  })

  it('un eje con una escala absurda avisa en su ficha en vez de tumbar la pantalla', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().cargarProyecto(proyectoConDxf({ planos: [{ ...PLANO_DXF, calibracion: { metrosPorUnidad: 1000, ejeY: 'arriba' } }] }), {
      'plano-dxf': DXF,
    })
    render(<EspacioPlano />)
    await usuario.click(within(screen.getByRole('region', { name: 'Ejes del DXF' })).getByRole('button', { name: /^Eje 1/ }))
    const ficha = screen.getByRole('region', { name: 'Eje del plano 1' })
    expect(within(ficha).getByText(/La escala parece errada: con ella este eje mediría 200\.0 km/)).toBeInTheDocument()
    expect(within(ficha).getByRole('button', { name: 'Tomar la rasante de las cotas del plano' })).toBeDisabled()
    expect(screen.getByRole('heading', { name: 'Plano de obra' })).toBeInTheDocument()
  })

  it('el nombre de la calle del eje se escribe en un campo de 44 px', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: 'Eje 1 · 200.0 m' }))
    expect(within(screen.getByRole('region', { name: 'Eje del plano 1' })).getByLabelText('Nombre de la calle')).toHaveClass('min-h-11')
  })
})

// ─── Croquis ──────────────────────────────────────────────────────────────

describe('Plano de obra: croquis', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto({ ...proyectoVacio(), planos: [PLANO_DXF] }, { 'plano-dxf': DXF })
  })

  it('dibujar vértice a vértice, deshacer y crear la calle con su rasante', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: 'Dibujar croquis' }))
    const svg = visor()
    tocarEnPlano(svg, 1000, 1950)
    tocarEnPlano(svg, 1030, 1950)
    tocarEnPlano(svg, 1030, 1990)
    expect(screen.getByText('3 vértices · 70.000 m')).toBeInTheDocument()
    // Las progresivas cada 20 m sobre el dibujo.
    expect(screen.getByText('0+040')).toBeInTheDocument()
    expect(screen.getByText('0+070')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(screen.getByText('2 vértices · 30.000 m')).toBeInTheDocument()
    tocarEnPlano(svg, 1030, 1990)

    await usuario.type(screen.getByLabelText('Nombre de la calle'), 'Jr. Nuevo')
    await usuario.type(screen.getByLabelText('Cota de arranque'), '3250')
    await usuario.type(screen.getByLabelText('Pendiente'), '-6')
    const dl = screen.getByLabelText('Resultado del croquis')
    expect(dl).toHaveTextContent('Cota final3245.800 m')
    expect(dl).toHaveTextContent('Desnivel-4.200 m · △ empinada')

    await usuario.click(screen.getByRole('button', { name: 'Crear calle con este croquis' }))
    const { proyecto } = useAlmacen.getState()
    const pista = proyecto.pistas![0]!
    expect(pista.origen).toBe('croquis')
    expect(pista.polilinea).toHaveLength(3)
    expect(pista.polilinea[2]!.x).toBeCloseTo(1030, 6)
    expect(pista.polilinea[2]!.y).toBeCloseTo(1990, 6)
    const calle = proyecto.calles.find((c) => c.id === pista.calleId)!
    expect(calle.nombre).toBe('Jr. Nuevo')
    expect(calle.rasante).toMatchObject({ cotaArranque: 3250, pendienteLongitudinal: -6, progresivaArranque: 0 })
    expect(screen.getByRole('status')).toHaveTextContent('✓ Calle «Jr. Nuevo» creada con el croquis.')
    expect(screen.getByRole('button', { name: 'Ver' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('«Empezar de nuevo» borra el dibujo y sin nombre no se crea nada', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: 'Dibujar croquis' }))
    const svg = visor()
    tocarEnPlano(svg, 1000, 1950)
    tocarEnPlano(svg, 1030, 1950)
    expect(screen.getByRole('button', { name: 'Crear calle con este croquis' })).toBeDisabled()
    expect(screen.getByText('Falta el nombre de la calle.')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Empezar de nuevo' }))
    expect(screen.getByText('0 vértices')).toBeInTheDocument()
  })

  it('arrastrar mueve el plano y no pone vértices', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: 'Dibujar croquis' }))
    const svg = visor()
    const antes = svg.getAttribute('viewBox')
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 160, clientY: 130 })
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 160, clientY: 130 })
    expect(svg.getAttribute('viewBox')).not.toBe(antes)
    expect(screen.getByText('0 vértices')).toBeInTheDocument()
  })

  it('la rueda acerca y «Encuadrar» vuelve a mostrar todo', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    const svg = visor()
    const antes = svg.getAttribute('viewBox')!
    fireEvent.wheel(svg, { deltaY: -400, clientX: 400, clientY: 250 })
    const despues = svg.getAttribute('viewBox')!
    expect(Number(despues.split(' ')[2])).toBeLessThan(Number(antes.split(' ')[2]))
    await usuario.click(screen.getByRole('button', { name: 'Encuadrar' }))
    expect(svg.getAttribute('viewBox')).toBe(antes)
  })
})

describe('Plano de obra: croquis, lo escrito', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto({ ...proyectoVacio(), planos: [PLANO_DXF] }, { 'plano-dxf': DXF })
  })

  async function dibujarDosVertices(usuario: ReturnType<typeof userEvent.setup>) {
    await usuario.click(screen.getByRole('button', { name: 'Dibujar croquis' }))
    const svg = visor()
    tocarEnPlano(svg, 1000, 1950)
    tocarEnPlano(svg, 1050, 1950)
    await usuario.type(screen.getByLabelText('Nombre de la calle'), 'Jr. Nuevo')
  }

  it('con cota y sin pendiente no inventa un 0 %: ni cota final ni rasante', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await dibujarDosVertices(usuario)
    await usuario.type(screen.getByLabelText('Cota de arranque'), '3250')
    expect(screen.queryByLabelText('Resultado del croquis')).not.toBeInTheDocument()
    expect(screen.getByText('Falta la pendiente: sin rasante todavía.')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Crear calle con este croquis' }))
    const { proyecto } = useAlmacen.getState()
    expect(proyecto.calles[0]!.rasante).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Sin rasante todavía')
  })

  it('una pendiente que no es número no se toma como 0 %: no deja crear la calle', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await dibujarDosVertices(usuario)
    await usuario.type(screen.getByLabelText('Cota de arranque'), '3250')
    await usuario.type(screen.getByLabelText('Pendiente'), '6,5,')
    expect(screen.getByLabelText('Pendiente')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Crear calle con este croquis' })).toBeDisabled()
    expect(screen.getByText(/no es un número: corrígela o déjala vacía/)).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.calles).toHaveLength(0)
  })

  it('una cota de arranque ilegible tampoco deja crear la calle', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await dibujarDosVertices(usuario)
    await usuario.type(screen.getByLabelText('Cota de arranque'), '32a0')
    expect(screen.getByRole('button', { name: 'Crear calle con este croquis' })).toBeDisabled()
  })

  it('acepta «−6» con el menos tipográfico y «5%»; el botón ± cambia el signo', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await dibujarDosVertices(usuario)
    await usuario.type(screen.getByLabelText('Cota de arranque'), '3250')
    await usuario.type(screen.getByLabelText('Pendiente'), '−6')
    expect(screen.getByLabelText('Resultado del croquis')).toHaveTextContent('Desnivel-3.000 m')
    await usuario.clear(screen.getByLabelText('Pendiente'))
    await usuario.type(screen.getByLabelText('Pendiente'), '5%')
    expect(screen.getByLabelText('Resultado del croquis')).toHaveTextContent('Desnivel+2.500 m')
    await usuario.click(screen.getByRole('button', { name: 'Cambiar el signo de pendiente' }))
    expect(screen.getByLabelText('Pendiente')).toHaveValue('-5%')
    expect(screen.getByText('+ sube, − baja en el sentido de avance.')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Crear calle con este croquis' }))
    expect(useAlmacen.getState().proyecto.calles[0]!.rasante).toMatchObject({ cotaArranque: 3250, pendienteLongitudinal: -5 })
  })

  it('lo escrito se conserva al pasar a otra herramienta y volver', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await dibujarDosVertices(usuario)
    await usuario.type(screen.getByLabelText('Cota de arranque'), '3250')
    await usuario.type(screen.getByLabelText('Pendiente'), '-2')
    await usuario.click(screen.getByRole('button', { name: 'Ver' }))
    await usuario.click(screen.getByRole('button', { name: 'Calibrar escala' }))
    await usuario.click(screen.getByRole('button', { name: 'Dibujar croquis' }))
    expect(screen.getByLabelText('Nombre de la calle')).toHaveValue('Jr. Nuevo')
    expect(screen.getByLabelText('Cota de arranque')).toHaveValue('3250')
    expect(screen.getByLabelText('Pendiente')).toHaveValue('-2')
    expect(screen.getByText('2 vértices · 50.000 m')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre de la calle')).toHaveClass('min-h-11')
  })
})

describe('Plano de obra: importar, casos raros', () => {
  it('un DXF sin unidades se guarda sin escala, avisa y abre la calibración', async () => {
    const usuario = userEvent.setup()
    const texto = new TextDecoder('latin1').decode(DXF).replace(/(\$INSUNITS\r?\n\s*70\r?\n\s*)6/, '$10')
    expect(texto).not.toBe(new TextDecoder('latin1').decode(DXF))
    render(<EspacioPlano />)
    await usuario.upload(screen.getByLabelText('Importar plano (DXF o PDF)'), archivo(new TextEncoder().encode(texto) as Uint8Array<ArrayBuffer>, 'sin-unidades.dxf'))
    expect(await screen.findByText(/no dice en qué unidades está/)).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.planos![0]!.calibracion).toBeNull()
    expect(screen.getByRole('button', { name: 'Calibrar escala' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('un DWG con extensión .dxf se reconoce por su firma AC10', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    const dwg = new TextEncoder().encode('AC1032\u0000\u0000basura binaria') as Uint8Array<ArrayBuffer>
    await usuario.upload(screen.getByLabelText('Importar plano (DXF o PDF)'), archivo(dwg, 'renombrado.dxf'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/ODA File Converter/)
    expect(useAlmacen.getState().proyecto.planos ?? []).toHaveLength(0)
  })

  it('el aviso de soltar sale solo con archivos y no parpadea al pasar por encima de los hijos', () => {
    render(<EspacioPlano />)
    const seccion = screen.getByRole('region', { name: 'Plano de obra' })
    const hijo = screen.getByRole('heading', { name: 'Plano de obra' })
    fireEvent.dragEnter(seccion, { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(screen.queryByText(/Suelta el plano aquí/)).not.toBeInTheDocument()
    fireEvent.dragEnter(seccion, { dataTransfer: { types: ['Files'], files: [] } })
    fireEvent.dragEnter(hijo, { dataTransfer: { types: ['Files'], files: [] } })
    fireEvent.dragLeave(seccion, { dataTransfer: { types: ['Files'], files: [] } })
    expect(screen.getByText(/Suelta el plano aquí/)).toBeInTheDocument()
    fireEvent.dragLeave(hijo, { dataTransfer: { types: ['Files'], files: [] } })
    expect(screen.queryByText(/Suelta el plano aquí/)).not.toBeInTheDocument()
  })

  it('un segundo archivo soltado mientras se lee el primero no se importa', async () => {
    render(<EspacioPlano />)
    const seccion = screen.getByRole('region', { name: 'Plano de obra' })
    fireEvent.drop(seccion, { dataTransfer: { files: [archivo(DXF, 'uno.dxf')] } })
    fireEvent.drop(seccion, { dataTransfer: { files: [archivo(DXF, 'dos.dxf')] } })
    expect(await screen.findByText('✓ Plano importado.')).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.planos!.map((p) => p.nombre)).toEqual(['uno'])
  })
})

describe('Plano de obra: escala', () => {
  it('dos toques en el mismo punto no calibran: lo dice el motor', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().cargarProyecto({ ...proyectoVacio(), planos: [{ ...PLANO_DXF, calibracion: null }] }, { 'plano-dxf': DXF })
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: 'Calibrar escala' }))
    const svg = visor()
    tocarEnPlano(svg, 1000, 2000)
    tocarEnPlano(svg, 1000, 2000)
    await usuario.type(screen.getByLabelText('Distancia real'), '10')
    await usuario.click(screen.getByRole('button', { name: 'Fijar escala' }))
    expect(screen.getByRole('alert')).toHaveTextContent('dos puntos distintos')
    expect(useAlmacen.getState().proyecto.planos![0]!.calibracion).toBeNull()
  })

  it('recalibrar un plano con pistas avisa cuánto cambia cada una y pide un segundo toque', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().cargarProyecto(proyectoConDxf(), { 'plano-dxf': DXF })
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: 'Calibrar escala' }))
    const svg = visor()
    tocarEnPlano(svg, 1000, 2000)
    tocarEnPlano(svg, 1100, 2000)
    await usuario.type(screen.getByLabelText('Distancia real'), '50')
    await usuario.click(screen.getByRole('button', { name: 'Fijar escala' }))
    expect(within(screen.getByRole('list', { name: 'Pistas que cambian de largo' })).getByRole('listitem')).toHaveTextContent(
      'PSJE. LAS LOMAS: 120.0 m → 60.0 m',
    )
    expect(useAlmacen.getState().proyecto.planos![0]!.calibracion!.metrosPorUnidad).toBe(1)
    await usuario.click(screen.getByRole('button', { name: 'Sí, cambiar la escala' }))
    expect(useAlmacen.getState().proyecto.planos![0]!.calibracion!.metrosPorUnidad).toBeCloseTo(0.5, 9)
  })

  it('«No, dejarla» no cambia la escala', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().cargarProyecto(proyectoConDxf(), { 'plano-dxf': DXF })
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: 'Calibrar escala' }))
    const svg = visor()
    tocarEnPlano(svg, 1000, 2000)
    tocarEnPlano(svg, 1100, 2000)
    await usuario.type(screen.getByLabelText('Distancia real'), '50')
    await usuario.click(screen.getByRole('button', { name: 'Fijar escala' }))
    await usuario.click(screen.getByRole('button', { name: 'No, dejarla' }))
    expect(useAlmacen.getState().proyecto.planos![0]!.calibracion!.metrosPorUnidad).toBe(1)
  })
})

describe('Plano de obra: páginas de un PDF', () => {
  beforeEach(() => {
    estadoPdf.paginas = 3
  })
  afterEach(() => {
    estadoPdf.paginas = 1
  })

  it('sin escala ni pistas, la página se cambia sin más', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().cargarProyecto({ ...proyectoVacio(), planos: [{ ...PLANO_PDF, calibracion: null }] }, { 'plano-pdf': PDF })
    render(<EspacioPlano />)
    await usuario.selectOptions(await screen.findByLabelText('Página'), '2')
    expect(useAlmacen.getState().proyecto.planos![0]!.pagina).toBe(2)
  })

  it('con escala o pistas, otra página se abre como plano aparte y la de las pistas no cambia', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().cargarProyecto(
      {
        ...proyectoVacio(),
        planos: [PLANO_PDF],
        pistas: [{ id: 'p-lima', nombre: 'JR. LIMA', planoId: 'plano-pdf', polilinea: [{ x: 113, y: 100 }, { x: 680, y: 100 }], origen: 'croquis' }],
      },
      { 'plano-pdf': PDF },
    )
    render(<EspacioPlano />)
    await usuario.selectOptions(await screen.findByLabelText('Página'), '2')
    expect(screen.getByText(/son de la página 1/)).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.planos![0]!.pagina).toBe(1)
    await usuario.click(screen.getByRole('button', { name: 'Abrir la página 2 como plano aparte' }))
    const { proyecto, archivosDePlano } = useAlmacen.getState()
    expect(proyecto.planos).toHaveLength(2)
    const nuevo = proyecto.planos![1]!
    expect(nuevo).toMatchObject({ nombre: 'plano-expediente · pág. 2', formato: 'pdf', pagina: 2, calibracion: null })
    expect(archivosDePlano[nuevo.id]!.byteLength).toBe(PDF.byteLength)
    expect(proyecto.planos![0]!.pagina).toBe(1)
    // El plano nuevo no tiene pistas: las de la página 1 no se pintan encima de otra lámina.
    expect(screen.getByLabelText('Plano a la vista')).toHaveValue(nuevo.id)
    expect(within(screen.getByRole('region', { name: 'Pistas de la obra' })).getByRole('button', { name: /JR\. LIMA/ })).toHaveTextContent(
      'en «plano-expediente»',
    )
  })
})

describe('Plano de obra: zoom', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoConDxf(), { 'plano-dxf': DXF })
  })

  function ancho(svg: SVGSVGElement): number {
    return Number(svg.getAttribute('viewBox')!.split(' ')[2])
  }

  it('«Acercar» y «Alejar» cambian el zoom', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    const svg = visor()
    const antes = ancho(svg)
    await usuario.click(screen.getByRole('button', { name: 'Acercar' }))
    expect(ancho(svg)).toBeLessThan(antes)
    await usuario.click(screen.getByRole('button', { name: 'Alejar' }))
    expect(ancho(svg)).toBeCloseTo(antes, 6)
  })

  it('el pellizco con dos dedos acerca y no pone vértices', async () => {
    const usuario = userEvent.setup()
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: 'Dibujar croquis' }))
    const svg = visor()
    const antes = ancho(svg)
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 380, clientY: 250 })
    fireEvent.pointerDown(svg, { pointerId: 2, clientX: 420, clientY: 250 })
    fireEvent.pointerMove(svg, { pointerId: 2, clientX: 500, clientY: 250 })
    fireEvent.pointerUp(svg, { pointerId: 2, clientX: 500, clientY: 250 })
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 380, clientY: 250 })
    expect(ancho(svg)).toBeLessThan(antes)
    expect(screen.getByText('0 vértices')).toBeInTheDocument()
  })
})

describe('Plano de obra: quitar el plano', () => {
  it('pide confirmación y se lleva sus pistas', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().cargarProyecto(proyectoConDxf(), { 'plano-dxf': DXF })
    render(<EspacioPlano />)
    await usuario.click(screen.getByRole('button', { name: 'Quitar este plano' }))
    await usuario.click(screen.getByRole('button', { name: 'Sí, quitar el plano' }))
    await waitFor(() => expect(useAlmacen.getState().proyecto.planos).toEqual([]))
    expect(useAlmacen.getState().proyecto.pistas).toEqual([])
    expect(screen.getByText(/todavía no hay planos/i)).toBeInTheDocument()
  })
})
