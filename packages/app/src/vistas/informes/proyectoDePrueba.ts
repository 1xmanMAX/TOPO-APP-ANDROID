import type { Estacion, Lectura, Proyecto, Toma } from '@topo/core'

/*
 * Obra pequeña para las pruebas de Informes, hecha a mano para que cada
 * número se pueda seguir con lápiz:
 *
 * - BM-1 (oficial) a 101.000. Rasante plana a 100.000 en el eje, bombeo 2 %
 *   hasta ±3.50 (99.930 en los bordes). La base (0.20 m) va encima de la
 *   subrasante: la subrasante de proyecto es 99.800 en el eje y 99.730 en
 *   los bordes.
 * - Jornada de SUBRASANTE (19/08/2026): dos estaciones, cierra con −2 mm
 *   contra ±3.4 mm de tolerancia (0.08 km): pasa y se compensa +1 y +2 mm.
 * - Jornada de BASE (25/08/2026): una estación que cierra en 0 mm.
 */

let n = 0
const lectura = (destino: Lectura['destino'], valor: number): Lectura => ({ id: `l-${++n}`, destino, valor })
const celda = (progresiva: number, elementoClave: string, valor: number) =>
  lectura({ tipo: 'celda', celda: { progresiva, elementoClave } }, valor)
const bm = (valor: number) => lectura({ tipo: 'bm', bmId: 'bm-1' }, valor)
const cambio = (nombre: string, valor: number) => lectura({ tipo: 'cambio', nombre }, valor)

export function tomaSubrasante(cierreTipo: 'cerrado' | 'abierto' = 'cerrado'): Toma {
  const estaciones: Estacion[] = [
    {
      id: 'e-1',
      vistaAtras: bm(1.5),
      intermedias: [
        celda(0, 'p-borde-i', 2.77),
        celda(0, 'p-eje', 2.7),
        celda(0, 'p-borde-d', 2.775),
        celda(20, 'p-borde-i', 2.8),
        celda(20, 'p-eje', 2.69),
        celda(20, 'p-borde-d', 2.83),
      ],
      vistaAdelante: cambio('PC1', 1.2),
    },
    {
      id: 'e-2',
      vistaAtras: cambio('PC1', 1.1),
      intermedias: [celda(40, 'p-eje', 2.6)],
      ...(cierreTipo === 'cerrado' ? { vistaAdelante: bm(1.402) } : {}),
    },
  ]
  return {
    id: 'toma-sub',
    fecha: '2026-08-19',
    capaId: 'cap-sub',
    bmInicialId: 'bm-1',
    estaciones,
    cierre: {
      tipo: cierreTipo,
      ...(cierreTipo === 'cerrado' ? { bmFinalId: 'bm-1' } : {}),
      longitudK: 0.08,
      longitudKAuto: false,
      clase: 'tercerOrden',
      coeficiente: 12,
    },
  }
}

export function tomaBase(): Toma {
  return {
    id: 'toma-base',
    fecha: '2026-08-25',
    capaId: 'cap-base',
    bmInicialId: 'bm-1',
    estaciones: [
      {
        id: 'eb-1',
        vistaAtras: bm(1.5),
        intermedias: [celda(0, 'p-eje', 2.5), celda(0, 'p-borde-i', 2.57), celda(20, 'p-eje', 2.49)],
        vistaAdelante: bm(1.5),
      },
    ],
    cierre: { tipo: 'cerrado', bmFinalId: 'bm-1', longitudK: 0.04, longitudKAuto: false, clase: 'tercerOrden', coeficiente: 12 },
  }
}

export function proyectoDeInformes(opciones: { subrasante?: Toma; conBase?: boolean; conRasante?: boolean } = {}): Proyecto {
  const { subrasante = tomaSubrasante(), conBase = true, conRasante = true } = opciones
  return {
    version: 1,
    meta: {
      nombre: 'Prueba de informes',
      obra: 'Pavimentación Jr. Ñaña',
      cliente: 'Municipalidad',
      ubicacion: 'Puno',
      responsable: 'Max Mamani',
      creado: '2026-08-01T00:00:00.000Z',
      modificado: '2026-08-01T00:00:00.000Z',
    },
    bms: [{ id: 'bm-1', nombre: 'BM-1', cota: 101, tipo: 'oficial', descripcion: '' }],
    capas: [
      { id: 'cap-terreno', nombre: 'TERRENO', orden: 0, espesor: 0, toleranciaMm: 30 },
      { id: 'cap-sub', nombre: 'SUBRASANTE', orden: 1, espesor: 0, toleranciaMm: 20 },
      { id: 'cap-base', nombre: 'BASE', orden: 2, espesor: 0.2, toleranciaMm: 10 },
    ],
    calles: [
      {
        id: 'c-1',
        nombre: 'Jr. Lima',
        seccion: {
          puntos: [
            { id: 'p-borde-i', rol: 'bordeCalzada', nombre: 'Borde izquierdo', distancia: -3.5, distanciaDeFabrica: false, palabras: ['BI'] },
            { id: 'p-eje', rol: 'eje', nombre: 'Eje', distancia: 0, distanciaDeFabrica: false, palabras: ['EJE'] },
            { id: 'p-borde-d', rol: 'bordeCalzada', nombre: 'Borde derecho', distancia: 3.5, distanciaDeFabrica: false, palabras: ['BD'] },
          ],
          palabrasProgresiva: ['PROG'],
          palabrasPuntoControl: ['PC'],
          palabrasReferencia: ['REF'],
        },
        rasante: conRasante
          ? {
              progresivaArranque: 0,
              cotaArranque: 100,
              pendienteLongitudinal: 0,
              tramos: [{ nombre: 'Calzada', hastaOffset: 3.5, tipo: 'pendiente', valor: 2 }],
              simetrica: true,
              tramosIzquierda: null,
            }
          : null,
        notas: [
          { id: 'n-2', progresiva: 40, texto: 'Tapa de buzón a nivelar', fecha: '2026-08-19T10:00:00.000Z' },
          { id: 'n-1', progresiva: 20, texto: 'Buzón tapado', fecha: '2026-08-19T09:00:00.000Z' },
        ],
        nivelaciones: [
          { id: 'niv-sub', nombre: 'Subrasante', color: '#2563eb', tomas: [subrasante] },
          ...(conBase ? [{ id: 'niv-base', nombre: 'Base', color: '#16a34a', tomas: [tomaBase()] }] : []),
        ],
      },
      {
        id: 'c-2',
        nombre: 'Jr. Puno',
        seccion: { puntos: [], palabrasProgresiva: [], palabrasPuntoControl: [], palabrasReferencia: [] },
        rasante: null,
        nivelaciones: [],
      },
    ],
  }
}
