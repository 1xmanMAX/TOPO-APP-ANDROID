import type { Lectura, Proyecto } from '@topo/core'

/*
 * Obra de prueba para Análisis y Cierre, con números redondos para poder
 * seguir las cuentas a mano.
 *
 * Calle de 6 m (bordes a ±3 m, bombeo 2 %), BM-1 a 100.000, K = 1 km.
 *
 * Toma «sub» (subrasante, 2026-09-01), dos estaciones:
 *   E1: atrás BM-1 1.500 → AI 101.500. Cotas crudas 0+000: eje 100.000,
 *       bordes 99.940; 0+010: eje 99.970, bordes 99.910. Adelante PC1 1.200.
 *   E2: atrás PC1 1.400 → AI 101.700. 0+020: eje 99.940, bordes 99.880.
 *       Adelante BM-1 1.706 → llega a 99.994: error −6 mm.
 *   Con k = 12 la tolerancia es ±12 mm y pasa; con k = 4, ±4 mm y no pasa.
 *   Compensada: E1 +3 mm, E2 +6 mm.
 *
 * Toma «base» (base, 2026-09-10), una estación, cierra en 0 mm:
 *   atrás BM-1 1.300 → AI 101.300. 0+000: eje 100.200, bordes 100.140;
 *   0+010: eje 100.170, bordes 100.110; 0+020: eje 100.050 (delgada), bordes 100.080.
 *
 * Espesor de diseño entre subrasante y base: 0.20 m ± 10 mm.
 */

let contador = 0
function lectura(destino: Lectura['destino'], valor: number): Lectura {
  contador += 1
  return { id: `l-${contador}`, destino, valor }
}

function celda(progresiva: number, elementoClave: string, valor: number): Lectura {
  return lectura({ tipo: 'celda', celda: { progresiva, elementoClave } }, valor)
}

const BM = { tipo: 'bm' as const, bmId: 'bm-1' }

export function proyectoDePrueba(): Proyecto {
  return {
    version: 1,
    meta: {
      nombre: 'Prueba',
      obra: 'Obra de prueba',
      cliente: '',
      ubicacion: '',
      responsable: '',
      creado: '2026-09-01T00:00:00.000Z',
      modificado: '2026-09-01T00:00:00.000Z',
    },
    bms: [{ id: 'bm-1', nombre: 'BM-1', cota: 100, tipo: 'oficial', descripcion: '' }],
    capas: [
      { id: 'cap-terreno', nombre: 'TERRENO', orden: 0, espesor: 0, toleranciaMm: 20 },
      { id: 'cap-sub', nombre: 'SUBRASANTE', orden: 1, espesor: 0, toleranciaMm: 20 },
      { id: 'cap-base', nombre: 'BASE', orden: 2, espesor: 0.2, toleranciaMm: 10 },
    ],
    calles: [
      {
        id: 'c-1',
        nombre: 'Jr. Prueba',
        seccion: {
          puntos: [
            { id: 'p-bi', rol: 'bordeCalzada', nombre: 'Borde izquierdo', distancia: -3, distanciaDeFabrica: false, palabras: ['BI'] },
            { id: 'p-eje', rol: 'eje', nombre: 'Eje', distancia: 0, distanciaDeFabrica: false, palabras: ['EJE'] },
            { id: 'p-bd', rol: 'bordeCalzada', nombre: 'Borde derecho', distancia: 3, distanciaDeFabrica: false, palabras: ['BD'] },
          ],
          palabrasProgresiva: ['PROG'],
          palabrasPuntoControl: ['PC'],
          palabrasReferencia: [],
        },
        rasante: {
          progresivaArranque: 0,
          cotaArranque: 100.2,
          pendienteLongitudinal: -0.3,
          tramos: [{ nombre: 'Calzada', hastaOffset: 3, tipo: 'pendiente', valor: 2 }],
          simetrica: true,
          tramosIzquierda: null,
        },
        nivelaciones: [
          {
            id: 'niv-sub',
            nombre: 'Subrasante',
            color: '#2563eb',
            tomas: [
              {
                id: 'toma-sub',
                fecha: '2026-09-01',
                capaId: 'cap-sub',
                bmInicialId: 'bm-1',
                cierre: { tipo: 'cerrado', bmFinalId: 'bm-1', longitudK: 1, longitudKAuto: false, clase: 'tercerOrden', coeficiente: 12 },
                estaciones: [
                  {
                    id: 'e-1',
                    vistaAtras: lectura(BM, 1.5),
                    intermedias: [
                      celda(0, 'p-bi', 1.56),
                      celda(0, 'p-eje', 1.5),
                      celda(0, 'p-bd', 1.56),
                      celda(10, 'p-bi', 1.59),
                      celda(10, 'p-eje', 1.53),
                      celda(10, 'p-bd', 1.59),
                    ],
                    vistaAdelante: lectura({ tipo: 'cambio', nombre: 'PC1' }, 1.2),
                  },
                  {
                    id: 'e-2',
                    vistaAtras: lectura({ tipo: 'cambio', nombre: 'PC1' }, 1.4),
                    intermedias: [celda(20, 'p-bi', 1.82), celda(20, 'p-eje', 1.76), celda(20, 'p-bd', 1.82)],
                    vistaAdelante: lectura(BM, 1.706),
                  },
                ],
              },
            ],
          },
          {
            id: 'niv-base',
            nombre: 'Base',
            color: '#16a34a',
            tomas: [
              {
                id: 'toma-base',
                fecha: '2026-09-10',
                capaId: 'cap-base',
                bmInicialId: 'bm-1',
                cierre: { tipo: 'cerrado', bmFinalId: 'bm-1', longitudK: 1, longitudKAuto: false, clase: 'tercerOrden', coeficiente: 12 },
                estaciones: [
                  {
                    id: 'e-b1',
                    vistaAtras: lectura(BM, 1.3),
                    intermedias: [
                      celda(0, 'p-bi', 1.16),
                      celda(0, 'p-eje', 1.1),
                      celda(0, 'p-bd', 1.16),
                      celda(10, 'p-bi', 1.19),
                      celda(10, 'p-eje', 1.13),
                      celda(10, 'p-bd', 1.19),
                      celda(20, 'p-bi', 1.22),
                      celda(20, 'p-eje', 1.25),
                      celda(20, 'p-bd', 1.22),
                    ],
                    vistaAdelante: lectura(BM, 1.3),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
}

/** La misma obra, con la libreta de la subrasante abierta: falta visar el BM de cierre. */
export function proyectoSinCerrar(): Proyecto {
  const proyecto = proyectoDePrueba()
  const toma = proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!
  delete toma.estaciones[1]!.vistaAdelante
  return proyecto
}
