import type { Proyecto } from '@topo/core'

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
    bms: [],
    plantillas: [],
    calles: [],
    capas: [
      { id: 'cap-terreno', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 },
      { id: 'cap-subrasante', nombre: 'SUBRASANTE', orden: 1, espesor: 0, toleranciaMm: 20 },
    ],
    campanias: [],
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
    bms: [
      {
        id: 'bm-1',
        nombre: 'BM-1',
        cota: 3245.18,
        tipo: 'oficial',
        descripcion: 'clavo en vereda esq. Av. Sol / Jr. Lima',
      },
    ],
    plantillas: [
      {
        id: 'pl-1',
        nombre: 'Calle con vereda',
        elementos: [
          { clave: 'VER-I', etiqueta: 'Vereda izquierda', offset: -5.6, tipo: 'vereda' },
          { clave: 'SAR-I', etiqueta: 'Sardinel izquierdo', offset: -4.4, tipo: 'sardinel' },
          { clave: 'BOR-I', etiqueta: 'Borde izquierdo', offset: -4.2, tipo: 'calzada' },
          { clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' },
          { clave: 'BOR-D', etiqueta: 'Borde derecho', offset: 4.2, tipo: 'calzada' },
          { clave: 'SAR-D', etiqueta: 'Sardinel derecho', offset: 4.4, tipo: 'sardinel' },
          { clave: 'VER-D', etiqueta: 'Vereda derecha', offset: 5.6, tipo: 'vereda' },
        ],
      },
    ],
    calles: [
      {
        id: 'c-1',
        nombre: 'Av. Sol',
        plantillaId: 'pl-1',
        progresivaInicio: 0,
        progresivaFin: 180,
        intervalo: 20,
        progresivasExtra: [],
        rasante: null,
      },
    ],
    capas: [
      { id: 'cap-terreno', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 },
      { id: 'cap-subrasante', nombre: 'SUBRASANTE', orden: 1, espesor: 0.25, toleranciaMm: 20 },
      { id: 'cap-base', nombre: 'BASE', orden: 2, espesor: 0.2, toleranciaMm: 10 },
      { id: 'cap-carpeta', nombre: 'CARPETA', orden: 3, espesor: 0.05, toleranciaMm: 5 },
    ],
    campanias: [
      {
        id: 'camp-1',
        fecha: '2026-08-19',
        calleId: 'c-1',
        capaId: 'cap-subrasante',
        bmInicialId: 'bm-1',
        estado: 'abierta',
        cierre: {
          tipo: 'cerrado',
          bmFinalId: 'bm-1',
          longitudK: 0.36,
          longitudKAuto: true,
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
                destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } },
                valor: 1.98,
              },
              {
                id: 'l-3',
                destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-I' } },
                valor: 2.045,
              },
              // Completa la esquina que faltaba en 0+000: con BOR-I, BOR-D y
              // EJE medidos en las dos progresivas iniciales queda el primer
              // cuadro cerrado, con qué levantar el modelo 3D.
              {
                id: 'l-8',
                destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-D' } },
                valor: 2.035,
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
                destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'EJE' } },
                valor: 2.47,
              },
              // Estas cinco, junto con la de arriba, dejan tres progresivas
              // (0+000, 0+020, 0+040) por tres elementos (BOR-I, EJE, BOR-D)
              // medidas: suficiente para armar cuatro cuadros contiguos y que
              // el visor 3D tenga con qué dibujar un modelo, no solo el
              // aviso de que faltan esquinas.
              {
                id: 'l-9',
                destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'BOR-I' } },
                valor: 2.535,
              },
              {
                id: 'l-10',
                destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'BOR-D' } },
                valor: 2.525,
              },
              {
                id: 'l-11',
                destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'BOR-I' } },
                valor: 2.555,
              },
              {
                id: 'l-12',
                destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'EJE' } },
                valor: 2.49,
              },
              {
                id: 'l-13',
                destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'BOR-D' } },
                valor: 2.545,
              },
            ],
            vistaAdelante: { id: 'l-7', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.91 },
          },
        ],
      },
    ],
  }
}
