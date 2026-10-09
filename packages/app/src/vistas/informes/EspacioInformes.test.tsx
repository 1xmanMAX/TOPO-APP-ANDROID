import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlmacen } from '../../estado/almacen'
import type { BibliotecaPdf, Dibujante } from '../../planos/pdf'
import type { Proyecto, Toma } from '@topo/core'
import { SIN_CALLES } from './adaptadores'
import { useInformes } from './almacenInformes'
import type { Compartidor } from './salida'
import EspacioInformes from './EspacioInformes'
import { proyectoDeInformes, tomaSubrasante } from './proyectoDePrueba'

const biblioteca = pdfjsLegacy as unknown as BibliotecaPdf

/** Lienzo falso: pdfjs dibuja en él sin hacer nada y anota el tamaño pedido. */
function dibujanteFalso(): { dibujante: Dibujante; pedidos: number } {
  const estado = { pedidos: 0 }
  const lienzo = { width: 0, height: 0, getContext: () => contexto }
  const contexto: object = new Proxy(
    {},
    {
      get: (_o, clave) => {
        if (clave === 'canvas') return lienzo
        if (clave === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
        if (clave === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) })
        if (clave === 'createImageData')
          return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
        if (clave === 'measureText') return () => ({ width: 0 })
        if (clave === 'getLineDash') return () => []
        return () => undefined
      },
      set: () => true,
    },
  )
  const dibujante: Dibujante = {
    crearLienzo(anchoPx, altoPx) {
      estado.pedidos += 1
      lienzo.width = anchoPx
      lienzo.height = altoPx
      return lienzo as unknown as HTMLCanvasElement
    },
    exportar: async () => ({ blob: null, url: `data:image/png;base64,cGFnaW5h${estado.pedidos}` }),
  }
  return {
    dibujante,
    get pedidos() {
      return estado.pedidos
    },
  }
}

function montar(compartidor?: Compartidor) {
  const falso = dibujanteFalso()
  render(<EspacioInformes biblioteca={biblioteca} dibujante={falso.dibujante} compartidor={compartidor} />)
  return falso
}

const vistaPrevia = () => screen.getByRole('region', { name: 'Vista previa' })

describe('EspacioInformes', () => {
  let descargas: string[]
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {
      // sin almacenamiento: da igual
    }
    useInformes.getState().olvidar()
    useAlmacen.getState().cargarProyecto(proyectoDeInformes())
    useAlmacen.getState().activarCampania('toma-sub')
    descargas = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargas.push(this.download)
    })
    URL.createObjectURL = vi.fn(() => 'blob:prueba')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => vi.restoreAllMocks())

  it('muestra una tarjeta por informe y arranca en el protocolo', () => {
    montar()
    const grupo = screen.getByRole('group', { name: 'Tipo de informe' })
    const tarjetas = within(grupo).getAllByRole('button')
    expect(tarjetas.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Protocolo de nivelación',
      'Libreta con cierre',
      'Control contra proyecto',
      'Control de espesores',
      'Metrado',
      'Hoja de estacas',
    ])
    expect(screen.getByRole('button', { name: 'Protocolo de nivelación' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Protocolo de nivelación' })).toHaveAccessibleDescription(/semáforo/)
  })

  it('dibuja la primera página del PDF de verdad en la vista previa', async () => {
    montar()
    const imagen = await within(vistaPrevia()).findByRole('img', { name: 'Primera página: Protocolo de nivelación' })
    expect(imagen.getAttribute('src')).toMatch(/^data:image\/png/)
    // A4 vertical a 900 px de ancho.
    expect(imagen).toHaveAttribute('width', '900')
    expect(imagen).toHaveAttribute('height', '1273')
    expect(within(vistaPrevia()).getByText(/✓ Comprobado/)).toBeInTheDocument()
  })

  it('arranca en la calle y la jornada activas', () => {
    montar()
    expect(screen.getByRole('combobox', { name: 'Calle' })).toHaveValue('c-1')
    expect(screen.getByRole('combobox', { name: 'Jornada' })).toHaveValue('toma-sub')
  })

  it('cambiar de informe rehace la vista previa', async () => {
    const usuario = userEvent.setup()
    montar()
    await within(vistaPrevia()).findByRole('img', { name: /Protocolo/ })
    await usuario.click(screen.getByRole('button', { name: 'Libreta con cierre' }))
    expect(screen.getByRole('button', { name: 'Libreta con cierre' })).toHaveAttribute('aria-pressed', 'true')
    expect(await within(vistaPrevia()).findByRole('img', { name: 'Primera página: Libreta con cierre' })).toBeInTheDocument()
    // La libreta va entera: no hay tramo.
    expect(screen.queryByRole('textbox', { name: 'Desde' })).not.toBeInTheDocument()
  })

  it('una nivelación sin cerrar se marca como no comprobada', async () => {
    useAlmacen.getState().cargarProyecto(proyectoDeInformes({ subrasante: tomaSubrasante('abierto') }))
    useAlmacen.getState().activarCampania('toma-sub')
    montar()
    expect(await within(vistaPrevia()).findByText(/△ No comprobado/)).toBeInTheDocument()
    expect(within(vistaPrevia()).getByRole('list', { name: 'Avisos del informe' })).toHaveTextContent(/NO COMPROBADAS/)
  })

  it('dice por qué un informe no se puede armar y no deja descargar', async () => {
    const usuario = userEvent.setup()
    montar()
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Calle' }), 'c-2')
    expect(within(vistaPrevia()).getByText(/no tiene una jornada medida/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Compartir' })).toBeDisabled()
  })

  it('el tramo recorta y, si no queda nada, lo dice', async () => {
    const usuario = userEvent.setup()
    montar()
    await usuario.type(screen.getByRole('textbox', { name: 'Desde' }), '0+050')
    expect(await within(vistaPrevia()).findByText('No hay puntos en el tramo elegido.')).toBeInTheDocument()
  })

  it('espesores elige sola la capa de abajo', async () => {
    const usuario = userEvent.setup()
    montar()
    await usuario.click(screen.getByRole('button', { name: 'Control de espesores' }))
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Capa de arriba' }), 'toma-base')
    expect(screen.getByRole('combobox', { name: 'Capa de abajo' })).toHaveValue('toma-sub')
    expect(await within(vistaPrevia()).findByRole('img', { name: 'Primera página: Control de espesores' })).toBeInTheDocument()
  })

  it('la hoja de estacas pide capa, BM y vista atrás', async () => {
    const usuario = userEvent.setup()
    montar()
    await usuario.click(screen.getByRole('button', { name: 'Hoja de estacas' }))
    expect(screen.queryByRole('combobox', { name: 'Jornada' })).not.toBeInTheDocument()
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Capa a replantear' }), 'cap-base')
    expect(within(vistaPrevia()).getByText(/Sin vista atrás al BM/)).toBeInTheDocument()
    await usuario.type(screen.getByRole('textbox', { name: 'Vista atrás al BM (m)' }), '1.2')
    await waitFor(() => expect(within(vistaPrevia()).getByText(/✓ Comprobado/)).toBeInTheDocument())
  })

  it('la hoja de estacas con lecturas que no caben va con △ y «cambie de estación», sin prometer una franja que no lleva', async () => {
    const usuario = userEvent.setup()
    // Un BM 3 m más abajo: todas las cotas de la base quedan sobre el instrumento.
    const p = proyectoDeInformes()
    useAlmacen.getState().cargarProyecto({ ...p, bms: p.bms.map((b) => ({ ...b, cota: b.cota - 3 })) })
    useAlmacen.getState().activarCampania('toma-sub')
    montar()
    await usuario.click(screen.getByRole('button', { name: 'Hoja de estacas' }))
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Capa a replantear' }), 'cap-base')
    await usuario.type(screen.getByRole('textbox', { name: 'Vista atrás al BM (m)' }), '1.2')
    const v = await within(vistaPrevia()).findByText(/△ No comprobado: desde esta estación .* cambie de estación/)
    expect(v).not.toHaveTextContent(/franja/)
    expect(within(vistaPrevia()).queryByText(/✓ Comprobado/)).toBeNull()
    // La imagen dice de qué PDF es: los guiones esperan por eso y no por tiempo.
    await waitFor(() =>
      expect(
        within(vistaPrevia()).getByRole('img', { name: 'Primera página: Hoja de estacas' }).getAttribute('data-archivo'),
      ).toMatch(/^Hoja de estacas.*Jr\. Lima.*\.pdf$/),
    )
  })

  it('las notas de campo se pueden quitar, y sin notas la opción no se puede marcar', async () => {
    const usuario = userEvent.setup()
    montar()
    const notas = screen.getByRole('checkbox', { name: /Notas de campo/ })
    expect(notas).toBeChecked()
    await usuario.click(notas)
    expect(notas).not.toBeChecked()
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Calle' }), 'c-2')
    expect(screen.getByRole('checkbox', { name: /Notas de campo/ })).toBeDisabled()
  })

  it('Descargar PDF baja el archivo con su nombre', async () => {
    const usuario = userEvent.setup()
    montar()
    await usuario.click(screen.getByRole('button', { name: 'Descargar PDF' }))
    expect(descargas).toEqual(['Protocolo de nivelación — Jr. Lima — SUBRASANTE — 19-08-2026.pdf'])
  })

  it('Descargar Excel baja la tabla que acompaña al informe', async () => {
    const usuario = userEvent.setup()
    montar()
    await usuario.click(screen.getByRole('button', { name: 'Descargar Excel' }))
    expect(descargas).toEqual(['Jr. Lima — Diferencias SUBRASANTE.xlsx'])
    await usuario.click(screen.getByRole('button', { name: 'Hoja de estacas' }))
    expect(screen.getByRole('button', { name: 'Descargar Excel' })).toBeDisabled()
  })

  it('Compartir usa el menú del teléfono si existe; si no, descarga', async () => {
    const usuario = userEvent.setup()
    const share = vi.fn(async () => undefined)
    montar({ share, canShare: () => true })
    await usuario.click(screen.getByRole('button', { name: 'Compartir' }))
    expect(share).toHaveBeenCalledTimes(1)
    expect(descargas).toEqual([])
  })

  it('sin compartir en el navegador, Compartir descarga y lo dice', async () => {
    const usuario = userEvent.setup()
    montar({})
    await usuario.click(screen.getByRole('button', { name: 'Compartir' }))
    expect(descargas).toHaveLength(1)
    expect(screen.getByText(/no comparte archivos: se descargó el PDF/)).toBeInTheDocument()
  })

  it('siguen las exportaciones de antes: cotas, diferencias y espesores', async () => {
    const usuario = userEvent.setup()
    montar()
    await usuario.click(screen.getByRole('button', { name: 'Exportar cotas a Excel' }))
    await usuario.click(screen.getByRole('button', { name: 'Más formatos de cotas' }))
    await usuario.click(screen.getByRole('button', { name: 'Exportar cotas a CSV' }))
    await usuario.click(screen.getByRole('button', { name: 'Exportar diferencias a Excel' }))
    expect(descargas).toEqual(['Jr. Lima — SUBRASANTE.xlsx', 'Jr. Lima — SUBRASANTE.csv', 'Jr. Lima — Diferencias SUBRASANTE.xlsx'])
    // La subrasante no tiene capa medida debajo.
    expect(screen.getByRole('button', { name: 'Exportar espesores a Excel' })).toBeDisabled()
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Jornada' }), 'toma-base')
    await usuario.click(screen.getByRole('button', { name: 'Exportar espesores a Excel' }))
    expect(descargas.at(-1)).toBe('Jr. Lima — Espesores SUBRASANTE a BASE.xlsx')
    // Guardar el proyecto está en Archivo › Guardar: aquí ya no se repite.
    expect(screen.queryByRole('button', { name: 'Guardar el proyecto (.topo)' })).toBeNull()
  })

  it('Tablas para Excel: con jornada y sin rasante dice que falta la rasante', () => {
    useAlmacen.getState().cargarProyecto(proyectoDeInformes({ conRasante: false }))
    useAlmacen.getState().activarCampania('toma-sub')
    montar()
    const tablas = screen.getByRole('region', { name: 'Tablas para Excel' })
    expect(within(tablas).getByRole('button', { name: 'Exportar cotas a Excel' })).toBeEnabled()
    expect(within(tablas).getByRole('button', { name: 'Exportar diferencias a Excel' })).toBeDisabled()
    expect(within(tablas).getByText('(la calle no tiene rasante)')).toBeInTheDocument()
    expect(within(tablas).queryByText('(no hay jornada medida)')).toBeNull()
  })

  it('Tablas para Excel: con rasante y sin jornadas dice que no hay jornada, no que falta la rasante', async () => {
    const usuario = userEvent.setup()
    const p = proyectoDeInformes()
    const lima = p.calles[0]!
    useAlmacen.getState().cargarProyecto({ ...p, calles: [lima, { ...p.calles[1]!, seccion: lima.seccion, rasante: lima.rasante }] })
    useAlmacen.getState().activarCampania('toma-sub')
    montar()
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Calle' }), 'c-2')
    const tablas = screen.getByRole('region', { name: 'Tablas para Excel' })
    expect(within(tablas).getByRole('button', { name: 'Exportar diferencias a Excel' })).toBeDisabled()
    // Cotas, diferencias y espesores: las tres dicen lo mismo, que es lo que falta de verdad.
    expect(within(tablas).getAllByText('(no hay jornada medida)')).toHaveLength(3)
    expect(within(tablas).queryByText('(la calle no tiene rasante)')).toBeNull()
  })

  it('todos los botones miden al menos 44 px de alto', () => {
    montar()
    for (const boton of screen.getAllByRole('button')) expect(boton.className).toMatch(/(^| )(min-h-1[1-9]|h-11|inset-0)( |$)/)
  })
})

describe('EspacioInformes tras la revisión', () => {
  let descargas: string[]
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {
      // sin almacenamiento: da igual
    }
    useInformes.getState().olvidar()
    useAlmacen.getState().cargarProyecto(proyectoDeInformes())
    useAlmacen.getState().activarCampania('toma-sub')
    descargas = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargas.push(this.download)
    })
    URL.createObjectURL = vi.fn(() => 'blob:prueba')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => vi.restoreAllMocks())

  it('el veredicto dice el porqué con las palabras de cada informe', async () => {
    const usuario = userEvent.setup()
    montar()
    expect(
      await within(vistaPrevia()).findByText(
        /✓ Comprobado: la nivelación cerró dentro de tolerancia \(error −2\.0 mm, tolerancia ±3\.4 mm\)/,
      ),
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Hoja de estacas' }))
    expect(within(vistaPrevia()).getByText(/△ No comprobado: sin vista atrás al BM no hay altura instrumental/)).toBeInTheDocument()
    await usuario.type(screen.getByRole('textbox', { name: 'Vista atrás al BM (m)' }), '1.2')
    expect(
      await within(vistaPrevia()).findByText(/✓ Comprobado: la altura instrumental \(102\.200\) sale del BM oficial BM-1/),
    ).toBeInTheDocument()
  })

  it('una nivelación que cerró fuera de tolerancia sale con ✗, no con △', async () => {
    const t: Toma = tomaSubrasante()
    const e2 = t.estaciones[1]!
    t.estaciones[1] = { ...e2, vistaAdelante: { id: 'x', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.45 } }
    useAlmacen.getState().cargarProyecto(proyectoDeInformes({ subrasante: t }))
    useAlmacen.getState().activarCampania('toma-sub')
    montar()
    expect(await within(vistaPrevia()).findByText(/✗ No comprobado: la nivelación cerró fuera de tolerancia/)).toBeInTheDocument()
  })

  it('una progresiva que no se entiende se dice junto al campo y no deja bajar la calle entera', async () => {
    const usuario = userEvent.setup()
    montar()
    const desde = screen.getByRole('textbox', { name: 'Desde' })
    // Teclado de texto: el numérico del celular no tiene «+».
    expect(desde).toHaveAttribute('inputmode', 'text')
    await usuario.type(desde, '0+0a')
    await waitFor(() => expect(desde).toHaveAttribute('aria-invalid', 'true'))
    expect(desde).toHaveAccessibleDescription(/No se entiende la progresiva \(usa 0\+020 o 20\)/)
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeDisabled()
  })

  it('escribir no rehace el PDF en cada tecla', async () => {
    const usuario = userEvent.setup()
    const falso = montar()
    await within(vistaPrevia()).findByRole('img', { name: /Protocolo/ })
    const antes = falso.pedidos
    await usuario.type(screen.getByRole('textbox', { name: 'Supervisor' }), 'Ing. Pérez Quispe')
    await waitFor(() => expect(falso.pedidos).toBeGreaterThan(antes))
    // Diecisiete teclas, a lo más un par de dibujos.
    expect(falso.pedidos - antes).toBeLessThanOrEqual(2)
  })

  it('en la libreta las notas no dependen de un tramo que no se ve', async () => {
    const usuario = userEvent.setup()
    montar()
    await usuario.type(screen.getByRole('textbox', { name: 'Desde' }), '0+050')
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Notas de campo/ })).toBeDisabled())
    await usuario.click(screen.getByRole('button', { name: 'Libreta con cierre' }))
    const notas = screen.getByRole('checkbox', { name: /Notas de campo/ })
    expect(notas).toBeEnabled()
    expect(notas).toHaveAccessibleName('Notas de campo (2)')
  })

  it('el informe, el tramo y el supervisor siguen ahí al volver a Informes', async () => {
    const usuario = userEvent.setup()
    const { unmount } = render(<EspacioInformes biblioteca={biblioteca} dibujante={dibujanteFalso().dibujante} />)
    await usuario.click(screen.getByRole('button', { name: 'Metrado' }))
    await usuario.type(screen.getByRole('textbox', { name: 'Supervisor' }), 'Ing. Pérez')
    await usuario.type(screen.getByRole('textbox', { name: 'Hasta' }), '0+020')
    unmount()
    // El supervisor es de la obra: queda en el proyecto y viaja en el .topo.
    expect(useAlmacen.getState().proyecto.meta.supervisor).toBe('Ing. Pérez')
    montar()
    expect(screen.getByRole('button', { name: 'Metrado' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: 'Supervisor' })).toHaveValue('Ing. Pérez')
    expect(screen.getByRole('textbox', { name: 'Hasta' })).toHaveValue('0+020')
  })

  it('el logo se pone, se quita y se puede volver a poner el mismo', async () => {
    const usuario = userEvent.setup()
    montar()
    const png = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' })
    const entrada = screen.getByLabelText('Poner logo')
    await usuario.upload(entrada, png)
    expect(await screen.findByRole('img', { name: 'Logo elegido' })).toBeInTheDocument()
    expect(entrada).toHaveValue('')
    await usuario.click(screen.getByRole('button', { name: 'Quitar logo' }))
    expect(screen.queryByRole('img', { name: 'Logo elegido' })).not.toBeInTheDocument()
    await usuario.upload(screen.getByLabelText('Poner logo'), png)
    expect(await screen.findByRole('img', { name: 'Logo elegido' })).toBeInTheDocument()
  })

  it('el Excel junto al PDF es del mismo tramo y dice qué lleva', async () => {
    const usuario = userEvent.setup()
    montar()
    await usuario.click(screen.getByRole('button', { name: 'Metrado' }))
    expect(screen.getByRole('button', { name: 'Descargar Excel' })).toHaveAccessibleDescription(
      /las áreas y los volúmenes van solo en el PDF/,
    )
    await usuario.type(screen.getByRole('textbox', { name: 'Desde' }), '10')
    await usuario.type(screen.getByRole('textbox', { name: 'Hasta' }), '0+030')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Hasta' })).not.toHaveAttribute('aria-invalid'))
    await waitFor(async () => {
      descargas.length = 0
      await usuario.click(screen.getByRole('button', { name: 'Descargar Excel' }))
      expect(descargas).toEqual(['Jr. Lima — Diferencias SUBRASANTE (0+010 a 0+030).xlsx'])
    })
    // Las de siempre siguen siendo de la jornada entera.
    descargas.length = 0
    await usuario.click(screen.getByRole('button', { name: 'Exportar diferencias a Excel' }))
    expect(descargas).toEqual(['Jr. Lima — Diferencias SUBRASANTE.xlsx'])
  })

  it('se pueden copiar cotas, diferencias y espesores', async () => {
    const usuario = userEvent.setup()
    montar()
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Jornada' }), 'toma-base')
    for (const nombre of ['cotas', 'diferencias', 'espesores']) {
      await usuario.click(screen.getByRole('button', { name: `Más formatos de ${nombre}` }))
      expect(screen.getByRole('button', { name: `Copiar ${nombre}` })).toBeEnabled()
    }
  })

  it('la hoja de estacas propone la capa que sigue a la última medida y dice de dónde sale', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().cargarProyecto(proyectoDeInformes({ conBase: false }))
    useAlmacen.getState().activarCampania('toma-sub')
    montar()
    await usuario.click(screen.getByRole('button', { name: 'Hoja de estacas' }))
    expect(screen.getByRole('combobox', { name: 'Capa a replantear' })).toHaveValue('cap-base')
    expect(screen.getByText(/Se propone la capa que sigue a SUBRASANTE, medida el 19\/08\/2026/)).toBeInTheDocument()
  })

  it('la ayuda de un campo es su descripción, no parte de su nombre', async () => {
    const usuario = userEvent.setup()
    montar()
    await usuario.click(screen.getByRole('button', { name: 'Hoja de estacas' }))
    expect(screen.getByRole('textbox', { name: 'Vista atrás al BM (m)' })).toHaveAccessibleDescription(
      'Vacía: la lectura objetivo se calcula en campo.',
    )
  })

  it('un proyecto sin calles dice dónde se crean', () => {
    const vacio: Proyecto = { ...proyectoDeInformes(), calles: [] }
    useAlmacen.getState().cargarProyecto(vacio)
    montar()
    expect(within(vistaPrevia()).getByText(SIN_CALLES)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeDisabled()
  })

  it('avisos repetidos de dos capas no se duplican y dicen de qué capa son', async () => {
    const usuario = userEvent.setup()
    const errores = vi.spyOn(console, 'error')
    const base = proyectoDeInformes({ subrasante: tomaSubrasante('abierto') })
    const nivBase = base.calles[0]!.nivelaciones[1]!
    nivBase.tomas = [{ ...nivBase.tomas[0]!, cierre: { ...nivBase.tomas[0]!.cierre, tipo: 'abierto' } }]
    useAlmacen.getState().cargarProyecto(base)
    useAlmacen.getState().activarCampania('toma-base')
    montar()
    await usuario.click(screen.getByRole('button', { name: 'Control de espesores' }))
    const avisos = within(vistaPrevia()).getByRole('list', { name: 'Avisos del informe' })
    const textos = within(avisos)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(new Set(textos).size).toBe(textos.length)
    expect(textos.some((t) => t?.includes('SUBRASANTE: '))).toBe(true)
    expect(textos.some((t) => t?.includes('BASE: '))).toBe(true)
    expect(errores.mock.calls.flat().join(' ')).not.toMatch(/same key/)
  })
})

describe('EspacioInformes rediseñado', () => {
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {
      // sin almacenamiento: da igual
    }
    useInformes.getState().olvidar()
    useAlmacen.getState().cargarProyecto(proyectoDeInformes())
    useAlmacen.getState().activarCampania('toma-sub')
    URL.createObjectURL = vi.fn(() => 'blob:prueba')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => vi.restoreAllMocks())

  const alcance = () => screen.getByText('Cambiar calle, jornada o tramo').closest('details')!

  it('lo ya elegido se ve en chips y el formulario va plegado', () => {
    montar()
    const resumen = alcance().querySelector('summary')!
    expect(resumen).toHaveTextContent('Jr. Lima')
    expect(resumen).toHaveTextContent(/SUBRASANTE/)
    expect(resumen).toHaveTextContent('19/08/2026')
    expect(resumen).toHaveTextContent(/toda la calle/)
    expect(alcance()).not.toHaveAttribute('open')
    expect(screen.getByRole('heading', { name: 'Informes', level: 2 })).toHaveClass('text-[26px]')
  })

  it('el tramo escrito sale en los chips', async () => {
    const usuario = userEvent.setup()
    montar()
    await usuario.type(screen.getByRole('textbox', { name: 'Hasta' }), '0+030')
    await waitFor(() => expect(alcance().querySelector('summary')).toHaveTextContent('inicio–0+030'))
    expect(screen.getByRole('textbox', { name: 'Desde' })).toHaveAccessibleDescription('vacío = toda la calle')
    expect(screen.getByRole('textbox', { name: 'Desde' })).not.toHaveAttribute('placeholder')
  })

  it('si falta algo en el alcance el formulario se abre solo', async () => {
    const usuario = userEvent.setup()
    montar()
    expect(alcance()).not.toHaveAttribute('open')
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Calle' }), 'c-2')
    await waitFor(() => expect(alcance()).toHaveAttribute('open'))
    expect(screen.getByText(/falta algo en el alcance/)).toBeInTheDocument()
  })

  it('el tipo elegido va con borde oscuro y sin punto', () => {
    montar()
    const elegido = screen.getByRole('button', { name: 'Protocolo de nivelación' })
    expect(elegido).toHaveClass('border-2', 'border-tinta')
    expect(elegido).not.toHaveTextContent('●')
    expect(screen.getByRole('button', { name: 'Metrado' })).toHaveClass('border-borde')
  })

  it('los nombres de las firmas solo aparecen con los cuadros de firma', async () => {
    const usuario = userEvent.setup()
    montar()
    const firmas = screen.getByRole('checkbox', { name: 'Cuadros de firma' })
    expect(screen.getByRole('textbox', { name: 'Supervisor' })).toBeInTheDocument()
    await usuario.click(firmas)
    expect(screen.queryByRole('textbox', { name: 'Supervisor' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Incluir' })).toBeInTheDocument()
  })

  it('la hoja se abre a pantalla completa y se cierra', async () => {
    const usuario = userEvent.setup()
    montar()
    await within(vistaPrevia()).findByRole('img', { name: 'Primera página: Protocolo de nivelación' })
    await usuario.click(screen.getByRole('button', { name: 'Ver la página a pantalla completa' }))
    const dialogo = screen.getByRole('dialog', { name: 'Página a pantalla completa' })
    expect(dialogo).toHaveClass('fixed', 'inset-0')
    // En el celular la página sale chica: se acerca para leer las cotas.
    const acercar = within(dialogo).getByRole('button', { name: 'Acercar' })
    expect(acercar).toHaveAttribute('aria-pressed', 'false')
    await usuario.click(acercar)
    expect(within(dialogo).getByRole('button', { name: 'Alejar' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialogo).getByRole('img')).toHaveClass('max-w-none')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cerrar la página' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('los avisos del informe van encima de la hoja como avisos de una línea', async () => {
    useAlmacen.getState().cargarProyecto(proyectoDeInformes({ subrasante: tomaSubrasante('abierto') }))
    useAlmacen.getState().activarCampania('toma-sub')
    montar()
    const avisos = await within(vistaPrevia()).findByRole('list', { name: 'Avisos del informe' })
    expect(avisos.querySelector('.bg-aviso-suave')).not.toBeNull()
  })

  it('las tablas sueltas van plegadas bajo «Datos sueltos», sin «Proyecto completo»', () => {
    montar()
    const tablas = screen.getByRole('region', { name: 'Tablas para Excel' })
    const plegable = within(tablas).getByText('Datos sueltos').closest('details')!
    expect(plegable).not.toHaveAttribute('open')
    expect(within(tablas).getByRole('button', { name: 'Exportar cotas a Excel' })).toHaveTextContent('Excel')
    expect(screen.queryByText('Proyecto completo')).toBeNull()
  })
})
