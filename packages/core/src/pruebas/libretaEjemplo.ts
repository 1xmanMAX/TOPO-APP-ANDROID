import type { BM, Calle, Capa, Toma } from '../modelo/tipos'
import type { Seccion } from '../seccion/seccion'

export const BM_1: BM = {
  id: 'bm-1',
  nombre: 'BM-1',
  cota: 3245.18,
  tipo: 'oficial',
  descripcion: 'clavo en vereda esq. Av. Sol / Jr. Lima',
}

/** La sección de Av. Sol: sus tres puntos, ya con las medidas puestas (no de fábrica). */
const SECCION_EJEMPLO: Seccion = {
  puntos: [
    {
      id: 'p-borde-i', rol: 'bordeCalzada', nombre: 'Borde izquierdo',
      distancia: -4.2, distanciaDeFabrica: false, palabras: ['BOR-I'],
    },
    {
      id: 'p-eje', rol: 'eje', nombre: 'Eje',
      distancia: 0, distanciaDeFabrica: false, palabras: ['EJE'],
    },
    {
      id: 'p-borde-d', rol: 'bordeCalzada', nombre: 'Borde derecho',
      distancia: 4.2, distanciaDeFabrica: false, palabras: ['BOR-D'],
    },
  ],
  palabrasProgresiva: ['PROG', 'PK', 'ABSCISA', 'EST', 'PROGRESIVA'],
  palabrasPuntoControl: ['PC', 'BM', 'PUNTO DE CONTROL'],
  palabrasReferencia: ['EXISTENTE', 'EXIST', 'REF'],
}

export const CALLE_EJEMPLO: Calle = {
  id: 'c-1',
  nombre: 'Av. Sol',
  seccion: SECCION_EJEMPLO,
  nivelaciones: [],
  rasante: null,
}

export const CAPA_EJEMPLO: Capa = {
  id: 'cap-1',
  nombre: 'SUBRASANTE',
  orden: 1,
  espesor: 0.25,
  toleranciaMm: 20,
}

/**
 * Libreta verificada a mano. Cierre -5.0 mm, tolerancia ±7.2 mm, PASA.
 *
 * `longitudKAuto` va en falso a propósito: esta libreta es un ejemplo de dos
 * estaciones (20 m de recorrido real), pero lo que verifica el cierre a mano
 * es el circuito de 0.36 km que describe el plan. Lo automático se prueba
 * aparte, activándolo sobre una copia, donde sí importa cuánto mide de
 * verdad esta toma.
 */
export function tomaEjemplo(): Toma {
  return {
    id: 'camp-1',
    fecha: '2026-08-19',
    capaId: 'cap-1',
    bmInicialId: 'bm-1',
    cierre: {
      tipo: 'cerrado',
      bmFinalId: 'bm-1',
      longitudK: 0.36,
      longitudKAuto: false,
      clase: 'tercerOrden',
      coeficiente: 12,
    },
    estaciones: [
      {
        id: 'e-1',
        vistaAtras: { id: 'l-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.425 },
        intermedias: [
          {
            id: 'l-2',
            destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-eje' } },
            valor: 1.98,
          },
          {
            id: 'l-3',
            destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-borde-i' } },
            valor: 2.045,
          },
        ],
        vistaAdelante: { id: 'l-4', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 1.15 },
      },
      {
        id: 'e-2',
        vistaAtras: { id: 'l-5', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 1.63 },
        intermedias: [
          {
            id: 'l-6',
            destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'p-eje' } },
            valor: 2.47,
          },
        ],
        vistaAdelante: { id: 'l-7', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.91 },
      },
    ],
  }
}
