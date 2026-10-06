import type { PlanoImportado, Proyecto } from '@topo/core'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { proyectoEjemplo } from '../estado/ejemplo'
import {
  abrirTopoCompleto,
  desempaquetarProyecto,
  desempaquetarTopo,
  empaquetarProyecto,
  migrarProyecto,
} from './topo'

/** Lo justo de Node para leer las muestras; ver pruebas/muestras.ts. */
declare const process: { cwd(): string; getBuiltinModule(nombre: string): unknown }
interface ArchivosDeNode {
  existsSync(ruta: string): boolean
  readFileSync(ruta: string): Uint8Array
}

/** Los bytes de una muestra, buscada desde el paquete o desde la raíz del repositorio. */
function muestra(nombre: string): Uint8Array {
  const fs = process.getBuiltinModule('node:fs') as ArchivosDeNode
  const desdeElPaquete = `${process.cwd()}/src/pruebas/muestras/${nombre}`
  const ruta = fs.existsSync(desdeElPaquete) ? desdeElPaquete : `${process.cwd()}/packages/app/src/pruebas/muestras/${nombre}`
  return new Uint8Array(fs.readFileSync(ruta))
}

const DXF: PlanoImportado = {
  id: 'plano-dxf',
  nombre: 'Expediente de pistas',
  formato: 'dxf',
  calibracion: { metrosPorUnidad: 1 },
  capasOcultas: ['TEXTOS'],
}
const PDF: PlanoImportado = { id: 'plano-pdf', nombre: 'Plano del expediente', formato: 'pdf', pagina: 1, calibracion: null }

/** El ejemplo con dos planos, una pista enlazada a su calle, una nota, un plan y el instrumento. */
function proyectoConPlanos(): Proyecto {
  const proyecto = proyectoEjemplo()
  const calle = proyecto.calles[0]!
  return {
    ...proyecto,
    instrumento: { largoMira: 4, visualMax: 40 },
    planos: [DXF, PDF],
    pistas: [
      {
        id: 'pista-1',
        nombre: calle.nombre,
        planoId: DXF.id,
        polilinea: [
          { x: 0, y: 0 },
          { x: 120, y: 5 },
        ],
        calleId: calle.id,
        origen: 'dxf',
        progresivaInicio: 0,
      },
    ],
    calles: [
      {
        ...calle,
        notas: [{ id: 'nota-1', progresiva: 40, texto: 'Buzón tapado', fecha: '2026-10-05' }],
        planControles: {
          opciones: { maxCambiosPorTramo: 4 },
          controles: [{ progresiva: 0, cota: 3244.5, motivos: [{ tipo: 'inicio', texto: 'Inicio de la pista' }] }],
        },
      },
    ],
  }
}

describe('.topo con planos', () => {
  it('un .topo con un DXF y un PDF de muestra sale igual byte a byte', () => {
    const bytesDxf = muestra('expediente-pistas.dxf')
    const bytesPdf = muestra('plano-expediente.pdf')
    const original = proyectoConPlanos()

    const { proyecto, archivosDePlano } = desempaquetarTopo(
      empaquetarProyecto(original, { [DXF.id]: bytesDxf, [PDF.id]: bytesPdf }),
    )

    expect(archivosDePlano[DXF.id]).toEqual(bytesDxf)
    expect(archivosDePlano[PDF.id]).toEqual(bytesPdf)
    expect(proyecto).toEqual(original)
  })

  it('los planos viajan como planos/<id>.<formato>, fuera del JSON', () => {
    const proyecto = proyectoConPlanos()
    const datos = empaquetarProyecto(proyecto, {
      [DXF.id]: muestra('expediente-pistas.dxf'),
      [PDF.id]: muestra('plano-expediente.pdf'),
    })

    const entradas = unzipSync(datos)
    expect(Object.keys(entradas).sort()).toEqual(['planos/plano-dxf.dxf', 'planos/plano-pdf.pdf', 'proyecto.json'])
    // El JSON no carga con los bytes: es el del proyecto, ni un byte más.
    expect(new TextDecoder().decode(entradas['proyecto.json'])).toBe(JSON.stringify(proyecto, null, 2))
  })

  it('abrir el archivo elegido trae también los planos', async () => {
    const bytesPdf = muestra('plano-expediente.pdf')
    const archivo = new File([empaquetarProyecto(proyectoConPlanos(), { [PDF.id]: bytesPdf })], 'Obra.topo')

    const { archivosDePlano } = await abrirTopoCompleto(archivo)

    expect(archivosDePlano[PDF.id]).toEqual(bytesPdf)
    // Declarado pero sin su archivo: se queda en el proyecto, sin bytes.
    expect(archivosDePlano[DXF.id]).toBeUndefined()
  })

  it('un plano sin su archivo se conserva en el proyecto, con sus pistas', () => {
    const { proyecto, archivosDePlano } = desempaquetarTopo(empaquetarProyecto(proyectoConPlanos()))
    expect(proyecto.planos).toHaveLength(2)
    expect(proyecto.pistas).toHaveLength(1)
    expect(archivosDePlano).toEqual({})
  })

  it('un .topo viejo, sin nada de la ola 2, sigue abriendo y no gana campos inventados', () => {
    const viejo = proyectoEjemplo()
    const { proyecto, archivosDePlano } = desempaquetarTopo(empaquetarProyecto(viejo))

    expect(proyecto).toEqual(viejo)
    expect('instrumento' in proyecto).toBe(false)
    expect('planos' in proyecto).toBe(false)
    expect('pistas' in proyecto).toBe(false)
    expect(proyecto.calles.every((calle) => !('notas' in calle) && !('planControles' in calle))).toBe(true)
    expect(archivosDePlano).toEqual({})
  })

  it('la migración es idempotente', () => {
    const una = migrarProyecto(proyectoConPlanos())
    expect(migrarProyecto(una)).toEqual(una)
    const vieja = migrarProyecto(proyectoEjemplo())
    expect(migrarProyecto(vieja)).toEqual(vieja)
  })

  it('lo que vino roto se arregla sin tirar lo demás', () => {
    const roto = {
      ...proyectoConPlanos(),
      instrumento: 'mira de 5',
      planos: [{ ...PDF, calibracion: { metrosPorUnidad: 0 } }, { nombre: 'sin id', formato: 'pdf' }],
      pistas: [
        { id: 'p-suelta', nombre: 'Huérfana', planoId: PDF.id, polilinea: [], calleId: 'calle-borrada', origen: 'croquis' },
        { nombre: 'sin id' },
      ],
    } as unknown as Proyecto
    const calles = roto.calles.map((calle) => ({ ...calle, notas: 'texto suelto' }))

    const arreglado = desempaquetarProyecto(empaquetarProyecto({ ...roto, calles } as unknown as Proyecto))

    expect('instrumento' in arreglado).toBe(false)
    expect(arreglado.planos).toEqual([{ ...PDF, calibracion: null }])
    expect(arreglado.pistas).toEqual([
      { id: 'p-suelta', nombre: 'Huérfana', planoId: PDF.id, polilinea: [], origen: 'croquis' },
    ])
    expect(arreglado.calles.every((calle) => !('notas' in calle))).toBe(true)
  })
})
