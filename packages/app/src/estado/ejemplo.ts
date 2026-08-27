import { catalogoDeFabrica, type Proyecto } from '@topo/core'

export function nuevoId(prefijo: string): string {
  return `${prefijo}-${Math.random().toString(36).slice(2, 10)}`
}

const AHORA = () => new Date().toISOString()

export function proyectoVacio(): Proyecto {
  return {
    version: 1,
    meta: {
      nombre: 'Proyecto nuevo',
      obra: '',
      cliente: '',
      ubicacion: '',
      responsable: '',
      creado: AHORA(),
      modificado: AHORA(),
    },
    catalogo: catalogoDeFabrica(),
    bms: [],
    calles: [],
    capas: [
      { id: 'cap-terreno', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 },
      { id: 'cap-subrasante', nombre: 'SUBRASANTE', orden: 1, espesor: 0, toleranciaMm: 20 },
    ],
  }
}

/** Proyecto de demostración con la libreta verificada a mano del plan. */
export function proyectoEjemplo(): Proyecto {
  return {
    version: 1,
    meta: {
      nombre: 'Av. Sol — ejemplo',
      obra: 'Pavimentación Av. Sol',
      cliente: 'Municipalidad',
      ubicacion: 'Perú',
      responsable: 'Max',
      creado: AHORA(),
      modificado: AHORA(),
    },
    catalogo: catalogoDeFabrica(),
    bms: [
      {
        id: 'bm-1',
        nombre: 'BM-1',
        cota: 3245.18,
        tipo: 'oficial',
        descripcion: 'clavo en vereda esq. Av. Sol / Jr. Lima',
      },
    ],
    calles: [
      {
        id: 'c-1',
        nombre: 'Av. Sol',
        puntos: [
          { concepto: 'veredaIzq', codigo: 'VER-I', distancia: -5.6 },
          { concepto: 'sardinelIzq', codigo: 'SAR-I', distancia: -4.4 },
          { concepto: 'bordeIzq', codigo: 'BOR-I', distancia: -4.2 },
          { concepto: 'eje', codigo: 'EJE', distancia: 0 },
          { concepto: 'bordeDer', codigo: 'BOR-D', distancia: 4.2 },
          { concepto: 'sardinelDer', codigo: 'SAR-D', distancia: 4.4 },
          { concepto: 'veredaDer', codigo: 'VER-D', distancia: 5.6 },
        ],
        rasante: {
          progresivaArranque: 0,
          cotaArranque: 3244.85,
          pendienteLongitudinal: -0.3,
          // Cubre toda la sección (llega a ±5.60, igual que VER-I/VER-D): no
          // queda ningún punto de la calle fuera de la rasante.
          tramos: [
            { nombre: 'Calzada', hastaOffset: 4.2, tipo: 'pendiente', valor: 2.0 },
            { nombre: 'Sardinel', hastaOffset: 4.4, tipo: 'salto', valor: -0.15 },
            { nombre: 'Vereda', hastaOffset: 5.6, tipo: 'pendiente', valor: -1.5 },
          ],
          simetrica: true,
          tramosIzquierda: null,
        },
        nivelaciones: [
          {
            id: 'niv-1',
            nombre: 'Terreno existente',
            color: '#2563eb',
            tomas: [
              {
                id: 'camp-1',
                fecha: '2026-08-19',
                capaId: 'cap-subrasante',
                bmInicialId: 'bm-1',
                cierre: {
                  tipo: 'cerrado',
                  bmFinalId: 'bm-1',
                  longitudK: 0.36,
                  // A mano, y a propósito, igual que `tomaEjemplo()` en el motor.
                  // Esta libreta es una versión abreviada: mide de 0+000 a 0+080,
                  // pero el circuito que representa es el de 0.36 km de la calle
                  // entera. Puesto en automático, la longitud saldría de lo que
                  // esta libreta recorrió de verdad —0.16 km—, la tolerancia
                  // caería de ±7.2 a ±4.8 mm, el cierre de −5.0 mm dejaría de
                  // pasar y, sin cierre, no se aplica la compensación: todas las
                  // cotas del ejemplo se moverían 2 y 3 mm.
                  longitudKAuto: false,
                  clase: 'tercerOrden',
                  coeficiente: 12,
                },
                // Las visadas de enlace (vista atrás y vista adelante de las dos
                // estaciones) no cambian: el circuito sigue cerrando igual que antes.
                // Lo que crece son las lecturas intermedias, de 9 celdas sueltas a
                // una grilla completa de 5 progresivas por 5 puntos, con un lomo
                // deliberado en 0+040 BOR-I para que el semáforo muestre los tres
                // estados a la vez.
                estaciones: [
                  {
                    id: 'e-1',
                    vistaAtras: { id: 'l-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.425 },
                    intermedias: [
                      {
                        id: 'l-14',
                        destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'SAR-I' } },
                        valor: 1.931,
                      },
                      {
                        id: 'l-15',
                        destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-I' } },
                        valor: 2.084,
                      },
                      {
                        id: 'l-16',
                        destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } },
                        valor: 2.011,
                      },
                      {
                        id: 'l-17',
                        destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-D' } },
                        valor: 2.079,
                      },
                      {
                        id: 'l-18',
                        destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'SAR-D' } },
                        valor: 1.943,
                      },
                      {
                        id: 'l-19',
                        destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'SAR-I' } },
                        valor: 1.987,
                      },
                      {
                        id: 'l-20',
                        destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'BOR-I' } },
                        valor: 2.131,
                      },
                      {
                        id: 'l-21',
                        destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'EJE' } },
                        valor: 2.056,
                      },
                      {
                        id: 'l-22',
                        destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'BOR-D' } },
                        valor: 2.16,
                      },
                      {
                        id: 'l-23',
                        destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'SAR-D' } },
                        valor: 1.993,
                      },
                      {
                        id: 'l-24',
                        destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'SAR-I' } },
                        valor: 2.044,
                      },
                      // El lomo del ejemplo: esta celda queda deliberadamente fuera
                      // de tolerancia, con las vecinas al límite alrededor.
                      {
                        id: 'l-25',
                        destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'BOR-I' } },
                        valor: 2.157,
                      },
                      {
                        id: 'l-26',
                        destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'EJE' } },
                        valor: 2.097,
                      },
                      {
                        id: 'l-27',
                        destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'BOR-D' } },
                        valor: 2.217,
                      },
                      {
                        id: 'l-28',
                        destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'SAR-D' } },
                        valor: 2.048,
                      },
                    ],
                    vistaAdelante: { id: 'l-4', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 1.15 },
                  },
                  {
                    id: 'e-2',
                    vistaAtras: { id: 'l-5', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 1.63 },
                    intermedias: [
                      {
                        id: 'l-29',
                        destino: { tipo: 'celda', celda: { progresiva: 60, elementoClave: 'SAR-I' } },
                        valor: 2.592,
                      },
                      {
                        id: 'l-30',
                        destino: { tipo: 'celda', celda: { progresiva: 60, elementoClave: 'BOR-I' } },
                        valor: 2.716,
                      },
                      {
                        id: 'l-31',
                        destino: { tipo: 'celda', celda: { progresiva: 60, elementoClave: 'EJE' } },
                        valor: 2.651,
                      },
                      {
                        id: 'l-32',
                        destino: { tipo: 'celda', celda: { progresiva: 60, elementoClave: 'BOR-D' } },
                        valor: 2.744,
                      },
                      {
                        id: 'l-33',
                        destino: { tipo: 'celda', celda: { progresiva: 60, elementoClave: 'SAR-D' } },
                        valor: 2.608,
                      },
                      {
                        id: 'l-34',
                        destino: { tipo: 'celda', celda: { progresiva: 80, elementoClave: 'SAR-I' } },
                        valor: 2.664,
                      },
                      {
                        id: 'l-35',
                        destino: { tipo: 'celda', celda: { progresiva: 80, elementoClave: 'BOR-I' } },
                        valor: 2.8,
                      },
                      {
                        id: 'l-36',
                        destino: { tipo: 'celda', celda: { progresiva: 80, elementoClave: 'EJE' } },
                        valor: 2.737,
                      },
                      {
                        id: 'l-37',
                        destino: { tipo: 'celda', celda: { progresiva: 80, elementoClave: 'BOR-D' } },
                        valor: 2.802,
                      },
                      {
                        id: 'l-38',
                        destino: { tipo: 'celda', celda: { progresiva: 80, elementoClave: 'SAR-D' } },
                        valor: 2.646,
                      },
                    ],
                    vistaAdelante: { id: 'l-7', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.91 },
                  },
                ],
              },
            ],
          },
          // Segunda nivelación, sobre la misma calle y una capa más arriba, con
          // fecha posterior: da espesor entre capas para comparar y un segundo
          // circuito, este cerrando con error cero.
          {
            id: 'niv-2',
            nombre: 'Base',
            color: '#dc2626',
            tomas: [
              {
                id: 'camp-base',
                fecha: '2026-08-20',
                capaId: 'cap-base',
                bmInicialId: 'bm-1',
                cierre: {
                  tipo: 'cerrado',
                  bmFinalId: 'bm-1',
                  longitudK: 0.36,
                  // A mano por el mismo motivo que la toma de subrasante.
                  longitudKAuto: false,
                  clase: 'tercerOrden',
                  coeficiente: 12,
                },
                estaciones: [
                  {
                    id: 'e-3',
                    vistaAtras: { id: 'l-39', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.425 },
                    intermedias: [
                      {
                        id: 'l-40',
                        destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'SAR-I' } },
                        valor: 1.735,
                      },
                      {
                        id: 'l-41',
                        destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-I' } },
                        valor: 1.892,
                      },
                      {
                        id: 'l-42',
                        destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } },
                        valor: 1.799,
                      },
                      {
                        id: 'l-43',
                        destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-D' } },
                        valor: 1.887,
                      },
                      {
                        id: 'l-44',
                        destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'SAR-D' } },
                        valor: 1.744,
                      },
                      {
                        id: 'l-45',
                        destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'SAR-I' } },
                        valor: 1.792,
                      },
                      {
                        id: 'l-46',
                        destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'BOR-I' } },
                        valor: 1.957,
                      },
                      {
                        id: 'l-47',
                        destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'EJE' } },
                        valor: 1.862,
                      },
                      {
                        id: 'l-48',
                        destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'BOR-D' } },
                        valor: 1.944,
                      },
                      {
                        id: 'l-49',
                        destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'SAR-D' } },
                        valor: 1.801,
                      },
                      {
                        id: 'l-50',
                        destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'SAR-I' } },
                        valor: 1.85,
                      },
                      {
                        id: 'l-51',
                        destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'BOR-I' } },
                        valor: 1.997,
                      },
                      {
                        id: 'l-52',
                        destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'EJE' } },
                        valor: 1.931,
                      },
                      {
                        id: 'l-53',
                        destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'BOR-D' } },
                        valor: 2.005,
                      },
                      {
                        id: 'l-54',
                        destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'SAR-D' } },
                        valor: 1.851,
                      },
                      {
                        id: 'l-55',
                        destino: { tipo: 'celda', celda: { progresiva: 60, elementoClave: 'SAR-I' } },
                        valor: 1.923,
                      },
                      {
                        id: 'l-56',
                        destino: { tipo: 'celda', celda: { progresiva: 60, elementoClave: 'BOR-I' } },
                        valor: 2.063,
                      },
                      {
                        id: 'l-57',
                        destino: { tipo: 'celda', celda: { progresiva: 60, elementoClave: 'EJE' } },
                        valor: 1.976,
                      },
                      {
                        id: 'l-58',
                        destino: { tipo: 'celda', celda: { progresiva: 60, elementoClave: 'BOR-D' } },
                        valor: 2.076,
                      },
                      {
                        id: 'l-59',
                        destino: { tipo: 'celda', celda: { progresiva: 60, elementoClave: 'SAR-D' } },
                        valor: 1.916,
                      },
                      {
                        id: 'l-60',
                        destino: { tipo: 'celda', celda: { progresiva: 80, elementoClave: 'SAR-I' } },
                        valor: 1.974,
                      },
                      {
                        id: 'l-61',
                        destino: { tipo: 'celda', celda: { progresiva: 80, elementoClave: 'BOR-I' } },
                        valor: 2.135,
                      },
                      {
                        id: 'l-62',
                        destino: { tipo: 'celda', celda: { progresiva: 80, elementoClave: 'EJE' } },
                        valor: 2.043,
                      },
                      {
                        id: 'l-63',
                        destino: { tipo: 'celda', celda: { progresiva: 80, elementoClave: 'BOR-D' } },
                        valor: 2.121,
                      },
                      {
                        id: 'l-64',
                        destino: { tipo: 'celda', celda: { progresiva: 80, elementoClave: 'SAR-D' } },
                        valor: 1.983,
                      },
                    ],
                    // Misma lectura que la vista atrás: el circuito cierra con error
                    // cero y la campaña sale verificada.
                    vistaAdelante: { id: 'l-65', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.425 },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    capas: [
      { id: 'cap-terreno', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 },
      { id: 'cap-subrasante', nombre: 'SUBRASANTE', orden: 1, espesor: 0.25, toleranciaMm: 20 },
      { id: 'cap-base', nombre: 'BASE', orden: 2, espesor: 0.2, toleranciaMm: 10 },
      { id: 'cap-carpeta', nombre: 'CARPETA', orden: 3, espesor: 0.05, toleranciaMm: 5 },
    ],
  }
}
