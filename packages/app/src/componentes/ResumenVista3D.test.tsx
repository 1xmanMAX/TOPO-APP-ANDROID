import { render, screen } from '@testing-library/react'
import type { Proyecto } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo, proyectoVacio } from '../estado/ejemplo'
import ResumenVista3D from './ResumenVista3D'

/**
 * La libreta de ejemplo ya trae rasante y una grilla de 5 progresivas
 * medida en 5 de sus 7 elementos, con un lomo deliberado en 0+040 BOR-I
 * (fuera de tolerancia, con vecinas al límite alrededor) — el mismo caso que
 * usa `Vista3D` y `MapaEstado` para ejercitar los tres estados a la vez.
 */
function conRasanteYMedidasConUnBache(): void {
  useAlmacen.getState().cargarProyecto(proyectoEjemplo())
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
              {
                id: 'i-1',
                destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-I' } },
                valor: 1.5,
              },
              {
                id: 'i-2',
                destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } },
                valor: 1.5,
              },
              {
                id: 'i-3',
                destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'BOR-I' } },
                valor: 1.5,
              },
              {
                id: 'i-4',
                destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'EJE' } },
                valor: 1.5,
              },
            ],
            vistaAdelante: { id: 'v-2', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.5 },
          },
        ],
      },
    ],
  }
  useAlmacen.getState().cargarProyecto(proyecto)
}

describe('ResumenVista3D', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('cuenta las caras de cada estado', () => {
    conRasanteYMedidasConUnBache()
    render(<ResumenVista3D idCampaniaReferencia="camp-1" />)

    expect(screen.getByText(/El modelo dibuja \d+ tramos/)).toBeInTheDocument()
  })

  it('nombra la peor zona por progresiva y elemento', () => {
    conRasanteYMedidasConUnBache()
    render(<ResumenVista3D idCampaniaReferencia="camp-1" />)

    expect(screen.getByText(/La mayor diferencia está en 0\+040 BOR-I: \+54 mm/)).toBeInTheDocument()
  })

  it('cuando todo está conforme, lo dice y no inventa una peor zona', () => {
    conTodoConforme()
    render(<ResumenVista3D idCampaniaReferencia="camp-1" />)

    expect(screen.getByText(/todo dentro de tolerancia/i)).toBeInTheDocument()
    expect(screen.queryByText(/La mayor diferencia/)).toBeNull()
  })
})
