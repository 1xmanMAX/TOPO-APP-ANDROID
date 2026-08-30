import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Calle, Id } from '@topo/core'
import { strToU8, zipSync } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import { bytesDetrasDelColegio, seccionDeMax } from '../pruebas/muestras'
import VistaSubirDatos from './VistaSubirDatos'

/**
 * El archivo real de Max, tal cual, metido por el mismo campo por el que lo
 * metería él. El nombre es el del archivo guardado en el proyecto, y de él
 * sale el nombre de calle que la pantalla propone.
 */
function archivoDetrasDelColegio(): File {
  return new File([bytesDetrasDelColegio()], 'detras-del-colegio.xlsx')
}

/**
 * Un libro de dos hojas, armado a mano con fflate —que ya está en el
 * proyecto—, porque `armarXlsx` solo sabe escribir libros de una.
 */
function libroDeDosHojas(): Uint8Array<ArrayBuffer> {
  const celda = (referencia: string, texto: string) =>
    `<c r="${referencia}" t="inlineStr"><is><t>${texto}</t></is></c>`

  const hojaXml = (filas: string[][]) =>
    strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
        filas
          .map(
            (fila, indiceFila) =>
              `<row r="${indiceFila + 1}">` +
              fila
                .map((texto, indice) =>
                  celda(`${String.fromCharCode(65 + indice)}${indiceFila + 1}`, texto),
                )
                .join('') +
              '</row>',
          )
          .join('') +
        '</sheetData></worksheet>',
    )

  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        '<sheet name="Portada" sheetId="1" r:id="rId1"/><sheet name="Medidas" sheetId="2" r:id="rId2"/>' +
        '</sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
        '</Relationships>',
    ),
    'xl/worksheets/sheet1.xml': hojaXml([['Obra', 'la de siempre']]),
    'xl/worksheets/sheet2.xml': hojaXml([
      ['', 'VEREDA', 'EJE'],
      ['0', '1.10', '1.20'],
    ]),
  })
}

/** Subir un archivo y esperar a que termine de leerse: la lectura es asíncrona. */
async function elegirArchivo(archivo: File) {
  await userEvent.upload(screen.getByLabelText(/archivo de la hoja/i), archivo)
  await waitFor(() => expect(screen.queryByText(/leyendo el archivo/i)).toBeNull())
}

/** Pegar celdas copiadas de una hoja de cálculo, que es el otro camino de entrada. */
async function pegarTexto(texto: string) {
  const area = screen.getByLabelText(/pegar/i)
  await userEvent.click(area)
  await userEvent.paste(texto)
}

async function escribirCalle(nombre: string) {
  const campo = screen.getByLabelText(/a qué calle/i)
  await userEvent.clear(campo)
  await userEvent.type(campo, nombre)
}

/**
 * Colocar las dos columnas de lado —`IZQ` y `DER`— que la sección de fábrica
 * no reconoce. Si la calle de destino ya las trae declaradas, no aparecen y
 * no hay nada que colocar.
 */
async function colocarIzqYDer() {
  const izq = screen.queryByLabelText(/dónde va la columna IZQ/i)
  if (izq) await userEvent.selectOptions(izq, 'p-borde-i')

  const der = screen.queryByLabelText(/dónde va la columna DER/i)
  if (der) await userEvent.selectOptions(der, 'p-borde-d')
}

/** El recorrido entero: subir la hoja de Max, decir a qué calle va y aceptarla. */
async function importarLaMuestraEn(nombreCalle: string) {
  await elegirArchivo(archivoDetrasDelColegio())
  await escribirCalle(nombreCalle)
  await colocarIzqYDer()
  await userEvent.click(screen.getByRole('button', { name: /importar/i }))
}

function callesLlamadas(nombre: string): Calle[] {
  return useAlmacen.getState().proyecto.calles.filter((calle) => calle.nombre === nombre)
}

function calleImportada(): Calle {
  return callesLlamadas('detras-del-colegio')[0]!
}

function tomasDe(nombre: string) {
  return callesLlamadas(nombre).flatMap((calle) => calle.nivelaciones.flatMap((n) => n.tomas))
}

function puntoDe(calle: Calle, puntoId: Id) {
  return calle.seccion.puntos.find((punto) => punto.id === puntoId)!
}

/** Una calle que ya existe, con la sección declarada y una toma dentro. */
function conCalleYaImportada(nombre: string) {
  const calleId = useAlmacen.getState().agregarCalle({ nombre, rasante: null })
  useAlmacen.getState().actualizarCalle(calleId, { seccion: seccionDeMax() })
  useAlmacen.getState().agregarCampania({
    fecha: '2026-08-01',
    calleId,
    capaId: 'cap-subrasante',
    bmInicialId: 'bm-1',
    cierre: {
      tipo: 'abierto',
      longitudK: 0,
      longitudKAuto: true,
      clase: 'tercerOrden',
      coeficiente: 12,
    },
  })
}

describe('la pantalla de subir datos', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('primero se elige la calle, y propone el nombre del archivo', async () => {
    render(<VistaSubirDatos />)
    await elegirArchivo(archivoDetrasDelColegio())

    expect(screen.getByLabelText(/a qué calle/i)).toHaveValue('detras-del-colegio')
  })

  it('enseña lo que ha entendido antes de aceptar nada', async () => {
    render(<VistaSubirDatos />)
    await elegirArchivo(archivoDetrasDelColegio())

    expect(screen.getByText(/7 progresivas/)).toBeInTheDocument()
    expect(screen.getByText(/vista atrás/i)).toBeInTheDocument()
    expect(screen.getByText(/1\.45/)).toBeInTheDocument()
  })

  it('enseña lo que NO importó, con su contenido', async () => {
    render(<VistaSubirDatos />)
    await elegirArchivo(archivoDetrasDelColegio())

    expect(screen.getByText(/no import/i)).toBeInTheDocument()
    expect(screen.getByText(/0\.125/)).toBeInTheDocument()
    expect(screen.getByText(/2\.11/)).toBeInTheDocument()
  })

  it('lo no importado no se enseña dos veces, aunque saliera por dos caminos', async () => {
    // El cero arrastrado de las filas 12 a 19 queda fuera por dos motivos: su
    // columna no lleva título, y sus filas no llevan progresiva. Es una sola
    // cosa y se enseña una sola vez, con los dos motivos.
    render(<VistaSubirDatos />)
    await elegirArchivo(archivoDetrasDelColegio())

    const lista = screen.getByRole('list', { name: /no import/i })
    const valores = within(lista)
      .getAllByRole('listitem')
      .map((fila) => fila.querySelector('[data-valor]')!.getAttribute('data-valor'))

    expect(new Set(valores).size).toBe(valores.length)
    expect(valores).toContain('0')
    expect(valores).toContain('0.125')
    expect(valores).toContain('2.11')
  })

  it('una columna sin asignar se coloca ahí mismo, y la palabra queda guardada', async () => {
    render(<VistaSubirDatos />)
    await elegirArchivo(archivoDetrasDelColegio())

    // Las dos, porque mientras quede una sin colocar no se puede aceptar la hoja.
    await userEvent.selectOptions(screen.getByLabelText(/dónde va la columna IZQ/i), 'p-borde-i')
    await userEvent.selectOptions(screen.getByLabelText(/dónde va la columna DER/i), 'p-borde-d')
    await userEvent.click(screen.getByRole('button', { name: /importar/i }))

    expect(puntoDe(calleImportada(), 'p-borde-i').palabras).toContain('IZQ')
    expect(puntoDe(calleImportada(), 'p-borde-d').palabras).toContain('DER')
  })

  it('una colocación equivocada se corrige sin volver a cargar la hoja', async () => {
    render(<VistaSubirDatos />)
    await elegirArchivo(archivoDetrasDelColegio())

    // Un clic en el punto de al lado. La columna deja de estar sin colocar
    // —el intérprete ya la reconoce— pero su desplegable sigue a la vista.
    await userEvent.selectOptions(screen.getByLabelText(/dónde va la columna IZQ/i), 'p-sardinel-i')
    expect(screen.getByLabelText(/dónde va la columna IZQ/i)).toHaveValue('p-sardinel-i')

    await colocarIzqYDer()
    await userEvent.click(screen.getByRole('button', { name: /importar/i }))

    expect(puntoDe(calleImportada(), 'p-sardinel-i').palabras).not.toContain('IZQ')
    expect(puntoDe(calleImportada(), 'p-borde-i').palabras).toContain('IZQ')
  })

  it('colocar una columna en el lado que no es no la pinta dos veces, y se dice', async () => {
    render(<VistaSubirDatos />)
    await elegirArchivo(archivoDetrasDelColegio())

    // IZQ cae a la izquierda del eje y el borde derecho está al otro lado, así
    // que esa colocación no puede cuajar: el intérprete devuelve la columna a
    // las que no reconoce mientras aquí sigue elegida.
    await userEvent.selectOptions(screen.getByLabelText(/dónde va la columna IZQ/i), 'p-borde-d')

    expect(screen.getAllByLabelText(/dónde va la columna IZQ/i)).toHaveLength(1)
    expect(screen.getByText(/no llegó a colocarse/i)).toBeInTheDocument()
  })
  it('no deja importar mientras quede una columna medida sin colocar', async () => {
    render(<VistaSubirDatos />)
    await elegirArchivo(archivoDetrasDelColegio())

    // Dejar fuera una columna medida es perder trabajo de campo en silencio.
    expect(screen.getByRole('button', { name: /importar/i })).toBeDisabled()
    expect(screen.getByText(/hay 2 columnas sin colocar/i)).toBeInTheDocument()
  })

  it('una columna con notas arriba y lecturas abajo también bloquea', async () => {
    // Sus tres primeros valores son texto, así que mirar solo la muestra diría
    // que no trae lecturas y el 2.40 se iría con la hoja aceptada.
    render(<VistaSubirDatos />)

    await pegarTexto('\tEJE\tOBS\n0\t1.20\tbacheo\n10\t1.25\troto\n20\t1.30\tojo\n30\t1.35\t2.40\n')
    await escribirCalle('Camino nuevo')

    expect(screen.getByRole('button', { name: /importar/i })).toBeDisabled()
    expect(screen.getByText(/hay 1 columna sin colocar/i)).toBeInTheDocument()
  })

  it('una columna de puras notas no bloquea, y se dice que no bloquea', async () => {
    // Si bloqueara, una columna de observaciones dejaría la hoja encerrada:
    // no se puede colocar en ningún punto sin meter basura en la grilla.
    render(<VistaSubirDatos />)

    await pegarTexto('\tEJE\tOBS\n0\t1.20\tbacheo\n10\t1.25\troto\n')
    await escribirCalle('Camino nuevo')

    expect(screen.getByText(/sin ningún número dentro/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /importar/i })).toBeEnabled()
  })

  it('colocar una columna vuelve a interpretar la hoja entera', async () => {
    render(<VistaSubirDatos />)
    await elegirArchivo(archivoDetrasDelColegio())

    // Con IZQ y DER sin colocar, el 0.23 de la resta entra como si fuera una
    // lectura y nadie se entera. Colocadas, la app ve las dos del mismo lado.
    expect(screen.queryByText(/2 lecturas en el lado derecho/i)).toBeNull()

    await colocarIzqYDer()

    expect(screen.getByText(/2 lecturas en el lado derecho/i)).toBeInTheDocument()
  })

  it('enseña las referencias encontradas, con su lado y su lectura', async () => {
    render(<VistaSubirDatos />)
    await elegirArchivo(archivoDetrasDelColegio())
    await colocarIzqYDer()

    const lista = screen.getByRole('list', { name: /referencias/i })

    expect(within(lista).getAllByRole('listitem')).toHaveLength(3)
    expect(within(lista).getByText(/2\.185/)).toBeInTheDocument()
  })

  it('avisa de que las distancias son las de fábrica', async () => {
    render(<VistaSubirDatos />)
    await elegirArchivo(archivoDetrasDelColegio())

    expect(screen.getByText(/las de fábrica/i)).toBeInTheDocument()
  })

  it('dice de qué banco de nivel cuelgan las cotas', async () => {
    // Con dos BM en la obra, unas cotas colgadas del que no era no se verían
    // por ningún lado antes de aceptar.
    render(<VistaSubirDatos />)
    await elegirArchivo(archivoDetrasDelColegio())

    expect(screen.getByText(/se cuelgan de BM-1/i)).toBeInTheDocument()
  })

  it('acepta datos pegados igual que un archivo', async () => {
    render(<VistaSubirDatos />)

    await pegarTexto('\tVEREDA\tEJE\n0\t1.10\t1.20\n')

    expect(screen.getByText(/1 progresiva/)).toBeInTheDocument()
  })

  it('un .csv entra por el mismo camino que un .xlsx', async () => {
    render(<VistaSubirDatos />)

    await elegirArchivo(new File([',VEREDA,EJE\n0,1.10,1.20\n'], 'jiron-tacna.csv'))

    expect(screen.getByLabelText(/a qué calle/i)).toHaveValue('jiron-tacna')
    expect(screen.getByText(/1 progresiva/)).toBeInTheDocument()
  })

  it('de un libro con varias hojas se elige cuál se lee', async () => {
    render(<VistaSubirDatos />)
    await elegirArchivo(new File([libroDeDosHojas()], 'obra.xlsx'))

    // La primera hoja es una portada: no trae ninguna palabra de la sección.
    expect(screen.getByText(/ninguna de las palabras de la sección/i)).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText(/qué hoja del libro/i), 'Medidas')

    expect(screen.getByText(/1 progresiva/)).toBeInTheDocument()
  })

  it('un archivo que no es una hoja se rechaza con palabras, sin llegar a leerlo', async () => {
    render(<VistaSubirDatos />)

    // El navegador filtra por la extensión antes de entregar el archivo, así
    // que el filtro se apaga a propósito: lo que se prueba es la red de
    // detrás, la que responde si el archivo llega igual.
    const sinFiltro = userEvent.setup({ applyAccept: false })
    await sinFiltro.upload(screen.getByLabelText(/archivo de la hoja/i), new File(['lo que sea'], 'foto.jpg'))
    await waitFor(() => expect(screen.queryByText(/leyendo el archivo/i)).toBeNull())

    expect(screen.getByText(/no sé leer/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /importar/i })).toBeNull()
  })

  it('pegar suelta el nombre de calle que había salido del archivo', async () => {
    render(<VistaSubirDatos />)
    await elegirArchivo(archivoDetrasDelColegio())
    expect(screen.getByLabelText(/a qué calle/i)).toHaveValue('detras-del-colegio')

    // Lo que se ve ya describe otras celdas: seguir enseñando el nombre del
    // .xlsx haría creer que la hoja de la vista previa es aquella.
    await pegarTexto('\tVEREDA\tEJE\n0\t1.10\t1.20\n')

    expect(screen.getByLabelText(/a qué calle/i)).toHaveValue('')
  })

  it('pero el nombre que escribió Max no se le borra al pegar', async () => {
    render(<VistaSubirDatos />)
    await elegirArchivo(archivoDetrasDelColegio())
    await escribirCalle('Av. Sol')

    await pegarTexto('\tVEREDA\tEJE\n0\t1.10\t1.20\n')

    expect(screen.getByLabelText(/a qué calle/i)).toHaveValue('Av. Sol')
  })

  it('nada entra en el proyecto hasta que se confirma', async () => {
    const antes = useAlmacen.getState().proyecto
    render(<VistaSubirDatos />)

    await elegirArchivo(archivoDetrasDelColegio())

    expect(useAlmacen.getState().proyecto).toBe(antes)
  })

  it('pegar tampoco toca el proyecto', async () => {
    const antes = useAlmacen.getState().proyecto
    render(<VistaSubirDatos />)

    await pegarTexto('\tVEREDA\tEJE\n0\t1.10\t1.20\n')

    expect(useAlmacen.getState().proyecto).toBe(antes)
  })

  it('colocar una columna tampoco toca el proyecto', async () => {
    // La palabra colocada vive en la pantalla hasta que se acepta: si se
    // guardara al elegirla, mirar una hoja ya cambiaría la sección.
    render(<VistaSubirDatos />)
    await elegirArchivo(archivoDetrasDelColegio())
    const antes = useAlmacen.getState().proyecto

    await colocarIzqYDer()

    expect(useAlmacen.getState().proyecto).toBe(antes)
  })

  it('las lecturas entran con su progresiva y su punto de la sección', async () => {
    render(<VistaSubirDatos />)
    await importarLaMuestraEn('Detrás del colegio')

    const toma = tomasDe('Detrás del colegio')[0]!
    const celdas = toma.estaciones[0]!.intermedias.filter((l) => l.destino.tipo === 'celda')

    expect(toma.estaciones[0]!.vistaAtras.valor).toBe(1.45)
    expect(celdas).toHaveLength(35)
    expect(
      celdas.some(
        (l) =>
          l.destino.tipo === 'celda' &&
          l.destino.celda.progresiva === 6 &&
          l.destino.celda.elementoClave === 'p-borde-i' &&
          l.valor === 2.24,
      ),
    ).toBe(true)
  })

  it('importar sobre una calle que ya existe añade una toma, no la pisa', async () => {
    conCalleYaImportada('Detrás del colegio')
    const antes = tomasDe('Detrás del colegio').length

    render(<VistaSubirDatos />)
    await importarLaMuestraEn('Detrás del colegio')

    expect(callesLlamadas('Detrás del colegio')).toHaveLength(1)
    expect(tomasDe('Detrás del colegio').length).toBe(antes + 1)
  })

  it('avisa de que la toma no cierra, con palabras de topógrafo', async () => {
    render(<VistaSubirDatos />)
    await importarLaMuestraEn('Detrás del colegio')

    expect(screen.getByText(/no cierra|sin comprobar/i)).toBeInTheDocument()
  })

  it('un archivo ilegible se dice con palabras y no deja el proyecto a medias', async () => {
    const antes = useAlmacen.getState().proyecto
    render(<VistaSubirDatos />)

    await elegirArchivo(new File([new Uint8Array([1, 2, 3])], 'roto.xlsx'))

    expect(screen.getByText(/no se pudo leer/i)).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto).toBe(antes)
  })
})
