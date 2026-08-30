import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { seccionDeFabrica, type Id, type Proyecto } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import VistaSeccion from './VistaSeccion'

/**
 * Una calle recién nacida: la sección de fábrica entera, con las siete
 * distancias todavía puestas por la app. Es el estado en el que Max ve esta
 * pantalla la primera vez.
 */
function proyectoConCalleNueva(): Proyecto {
  return {
    version: 1,
    meta: {
      nombre: 'Proyecto de prueba',
      obra: '',
      cliente: '',
      ubicacion: '',
      responsable: '',
      creado: '2026-08-29T00:00:00.000Z',
      modificado: '2026-08-29T00:00:00.000Z',
    },
    bms: [],
    calles: [
      {
        id: 'c1',
        nombre: 'Detrás del colegio',
        seccion: seccionDeFabrica(),
        nivelaciones: [],
        rasante: null,
      },
    ],
    capas: [],
  }
}

function seccionDe(calleId: Id) {
  return useAlmacen.getState().proyecto.calles.find((c) => c.id === calleId)!.seccion
}

function puntoDe(calleId: Id, puntoId: Id) {
  return seccionDe(calleId).puntos.find((p) => p.id === puntoId)!
}

async function cambiarDistanciaDe(nombre: string, valor: string) {
  const campo = screen.getByLabelText(new RegExp(`distancia de ${nombre}`, 'i'))
  await userEvent.clear(campo)
  await userEvent.type(campo, valor)
  await userEvent.tab()
}

/**
 * Los siete puntos con su distancia medida. El orden de los cambios y los
 * valores están elegidos para que ningún punto adelante a otro mientras se
 * escribe: la lista va de izquierda a derecha y se recoloca en vivo, así que
 * cruzar a un vecino movería de sitio el campo que se está escribiendo.
 */
const MEDIDAS: [string, string][] = [
  ['Vereda izquierda', '-6.5'],
  ['Sardinel izquierdo', '-4.6'],
  ['Borde izquierdo', '-4.4'],
  ['Eje', '0'],
  ['Vereda derecha', '6.5'],
  ['Sardinel derecho', '4.6'],
  ['Borde derecho', '4.4'],
]

async function cambiarTodasLasDistancias() {
  for (const [nombre, valor] of MEDIDAS) await cambiarDistanciaDe(nombre, valor)
}

async function anadirPalabraA(nombre: string, palabra: string) {
  await userEvent.type(screen.getByLabelText(new RegExp(`palabra nueva para ${nombre}`, 'i')), palabra)
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`añadir a ${nombre}`, 'i') }))
}

describe('VistaSeccion', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoConCalleNueva())
  })

  it('dibuja la sección con sus puntos colocados por distancia', () => {
    render(<VistaSeccion calleId="c1" />)

    expect(screen.getByRole('img', { name: /sección de la calle/i })).toBeInTheDocument()
    expect(screen.getByText('Eje')).toBeInTheDocument()
    expect(screen.getByText('Vereda izquierda')).toBeInTheDocument()
  })

  it('avisa mientras las distancias sean las de fábrica', () => {
    render(<VistaSeccion calleId="c1" />)

    expect(screen.getByText(/las distancias son las de fábrica/i)).toBeInTheDocument()
    expect(screen.getByText(/orientativ/i)).toBeInTheDocument()
  })

  it('al cambiar una distancia, ese punto deja de ser de fábrica', async () => {
    render(<VistaSeccion calleId="c1" />)

    await userEvent.clear(screen.getByLabelText(/distancia de Vereda izquierda/i))
    await userEvent.type(screen.getByLabelText(/distancia de Vereda izquierda/i), '-6.5')
    await userEvent.tab()

    expect(puntoDe('c1', 'p-vereda-i').distancia).toBe(-6.5)
    expect(puntoDe('c1', 'p-vereda-i').distanciaDeFabrica).toBe(false)
  })

  it('el aviso sigue mientras QUEDE una distancia de fábrica', async () => {
    // El bombeo entre dos puntos solo vale si los dos están medidos: que Max
    // corrija una vereda no hace fiable la pendiente contra un borde que sigue
    // puesto por la app.
    render(<VistaSeccion calleId="c1" />)
    await cambiarDistanciaDe('Vereda izquierda', '-6.5')

    expect(screen.getByText(/las distancias son las de fábrica/i)).toBeInTheDocument()
  })

  it('cuando ya no queda ninguna de fábrica, el aviso desaparece', async () => {
    render(<VistaSeccion calleId="c1" />)
    await cambiarTodasLasDistancias()

    expect(screen.queryByText(/las distancias son las de fábrica/i)).not.toBeInTheDocument()
  })

  it('se le añade a un punto la palabra con la que Max lo escribe', async () => {
    render(<VistaSeccion calleId="c1" />)

    await userEvent.type(screen.getByLabelText(/palabra nueva para Eje/i), 'ejito')
    await userEvent.click(screen.getByRole('button', { name: /añadir a Eje/i }))

    expect(puntoDe('c1', 'p-eje').palabras).toContain('ejito')
  })

  it('la misma palabra puede estar en los dos lados sin quejarse', async () => {
    render(<VistaSeccion calleId="c1" />)

    await anadirPalabraA('Borde izquierdo', 'bobo')
    await anadirPalabraA('Borde derecho', 'bobo')

    expect(puntoDe('c1', 'p-borde-i').palabras).toContain('bobo')
    expect(puntoDe('c1', 'p-borde-d').palabras).toContain('bobo')
  })

  it('se puede quitar una palabra', async () => {
    render(<VistaSeccion calleId="c1" />)

    await userEvent.click(screen.getByRole('button', { name: /quitar la palabra CL/i }))

    expect(puntoDe('c1', 'p-eje').palabras).not.toContain('CL')
  })

  it('se puede añadir un punto que no venía de fábrica', async () => {
    render(<VistaSeccion calleId="c1" />)

    await userEvent.selectOptions(screen.getByLabelText(/qué es el punto nuevo/i), 'peloAgua')
    await userEvent.type(screen.getByLabelText(/a qué distancia/i), '-2.8')
    await userEvent.click(screen.getByRole('button', { name: /añadir punto/i }))

    expect(seccionDe('c1').puntos.some((p) => p.rol === 'peloAgua' && p.distancia === -2.8)).toBe(true)
  })

  it('los puntos se enseñan ordenados de izquierda a derecha', () => {
    render(<VistaSeccion calleId="c1" />)

    const nombres = screen.getAllByRole('listitem').map((n) => n.textContent)
    expect(nombres[0]).toMatch(/Vereda izquierda/)
  })

  it('con la lista sola se puede trabajar: cada punto trae su distancia y sus palabras', () => {
    // El dibujo no puede ser el único portador del significado. Quien no lo
    // ve tiene que poder hacer lo mismo desde la lista.
    render(<VistaSeccion calleId="c1" />)

    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    for (const punto of seccionDe('c1').puntos) {
      expect(screen.getByLabelText(new RegExp(`distancia de ${punto.nombre}`, 'i'))).toBeInTheDocument()
      expect(screen.getByLabelText(new RegExp(`palabra nueva para ${punto.nombre}`, 'i'))).toBeInTheDocument()
      for (const palabra of punto.palabras) {
        expect(
          screen.getByRole('button', {
            name: new RegExp(`quitar la palabra ${palabra} de ${punto.nombre}`, 'i'),
          }),
        ).toBeInTheDocument()
      }
    }
  })

  it('dice cuántos puntos siguen con la distancia puesta por la app', async () => {
    render(<VistaSeccion calleId="c1" />)
    expect(screen.getByText(/quedan 7 puntos/i)).toBeInTheDocument()

    await cambiarDistanciaDe('Eje', '0')

    expect(screen.getByText(/quedan 6 puntos/i)).toBeInTheDocument()
  })

  it('un punto quitado desaparece de la sección', async () => {
    render(<VistaSeccion calleId="c1" />)

    await userEvent.click(screen.getByRole('button', { name: /quitar Sardinel izquierdo de la sección/i }))

    expect(seccionDe('c1').puntos.some((p) => p.id === 'p-sardinel-i')).toBe(false)
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
  })

  it('el eje no se quita: es el que dice qué cae a cada lado', () => {
    render(<VistaSeccion calleId="c1" />)

    expect(screen.queryByRole('button', { name: /quitar Eje de la sección/i })).not.toBeInTheDocument()
    expect(screen.getByText(/el eje no se quita/i)).toBeInTheDocument()
  })

  it('una palabra que el punto ya tenía no se duplica', async () => {
    render(<VistaSeccion calleId="c1" />)

    await anadirPalabraA('Eje', 'eje')

    expect(puntoDe('c1', 'p-eje').palabras).toEqual(['EJE', 'CL', 'CENTRO'])
  })

  it('un punto nuevo sin distancia no entra, y se dice por qué', async () => {
    render(<VistaSeccion calleId="c1" />)

    await userEvent.selectOptions(screen.getByLabelText(/qué es el punto nuevo/i), 'cuneta')
    await userEvent.click(screen.getByRole('button', { name: /añadir punto/i }))

    expect(seccionDe('c1').puntos).toHaveLength(7)
    expect(screen.getByText(/a qué distancia del eje está/i)).toBeInTheDocument()
  })

  it('el punto nuevo se llama por su lado, con el nombre bien escrito', async () => {
    render(<VistaSeccion calleId="c1" />)

    await userEvent.selectOptions(screen.getByLabelText(/qué es el punto nuevo/i), 'cuneta')
    await userEvent.type(screen.getByLabelText(/a qué distancia/i), '-4.9')
    await userEvent.click(screen.getByRole('button', { name: /añadir punto/i }))

    // «Cuneta izquierda», no «Cuneta izquierdo»: el nombre se escribe en
    // español, y el género lo pone el elemento.
    expect(seccionDe('c1').puntos.find((p) => p.rol === 'cuneta')!.nombre).toBe('Cuneta izquierda')
    const filas = screen.getAllByRole('listitem').map((n) => n.textContent)
    expect(filas.some((texto) => texto?.includes('Cuneta izquierda'))).toBe(true)
  })

  it('una calle que ya no existe se dice con palabras', () => {
    render(<VistaSeccion calleId="c-fantasma" />)

    expect(screen.getByText(/esa calle ya no existe/i)).toBeInTheDocument()
  })
})
