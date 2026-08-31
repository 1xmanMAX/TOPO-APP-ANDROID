import { calcularCampania, progresivasMedidas, type Proyecto } from '@topo/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { proyectoEjemplo } from '../estado/ejemplo'
import { abrirTopo, descargarTopo, desempaquetarProyecto, empaquetarProyecto } from './topo'

// ---------- Fixtures del modelo anterior a la sección declarada ----------
//
// Antes de la sección, la calle no tenía sus propios puntos: apuntaba por
// `plantillaId` a una `Plantilla` compartida del proyecto, y cada campaña de
// campo era una entidad suelta del proyecto (`proyecto.campanias`), no de su
// calle. Un código aprendido a mano quedaba en `proyecto.catalogo`, aparte de
// la plantilla. Estas funciones arman esa forma vieja a pelo, tal como
// hubiera quedado en un `.topo` guardado antes de esta migración.

function metaAntigua(nombre: string) {
  return {
    nombre,
    obra: '',
    cliente: '',
    ubicacion: '',
    responsable: 'Max',
    creado: '2026-01-01T00:00:00.000Z',
    modificado: '2026-01-01T00:00:00.000Z',
  }
}

function capaAntigua() {
  return { id: 'cap-1', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 }
}

/** Una calle con plantilla: borde izquierdo a -4.2 m y eje. Sin campañas. */
function proyectoAnterior(): Proyecto {
  return {
    version: 1,
    meta: metaAntigua('Jr. Viejo'),
    bms: [{ id: 'bm-1', nombre: 'BM-1', cota: 100, tipo: 'oficial', descripcion: 'clavo en vereda' }],
    plantillas: [
      {
        id: 'pl-1',
        nombre: 'Plantilla urbana',
        elementos: [
          { clave: 'BOR-I', etiqueta: 'Borde izquierdo', offset: -4.2, tipo: 'calzada' },
          { clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' },
        ],
      },
    ],
    calles: [{ id: 'c-1', nombre: 'Jr. Viejo', plantillaId: 'pl-1', rasante: null }],
    capas: [capaAntigua()],
    campanias: [],
  } as unknown as Proyecto
}

/** Una calle cuyo plantillaId no aparece en proyecto.plantillas. */
function proyectoAnteriorSinPlantilla(): Proyecto {
  return {
    version: 1,
    meta: metaAntigua('Jr. Sin Plantilla'),
    bms: [],
    plantillas: [],
    calles: [{ id: 'c-1', nombre: 'Jr. Sin Plantilla', plantillaId: 'pl-fantasma', rasante: null }],
    capas: [capaAntigua()],
    campanias: [],
  } as unknown as Proyecto
}

/**
 * Dos campañas de la misma calle. La primera —camp-1, la que usan las
 * pruebas de «intactas»— no lleva ninguna lectura de celda a propósito: así
 * su igualdad exacta con el original no depende de si la migración remapea
 * `elementoClave` o no. La segunda —camp-2— sí lleva una, con la clave vieja
 * de la plantilla (`BOR-I`), que es la que ejercita el remapeo.
 */
function proyectoAnteriorConDosCampanias(): Proyecto {
  const base = proyectoAnterior()
  return {
    ...base,
    campanias: [
      {
        id: 'camp-1',
        fecha: '2026-01-10',
        calleId: 'c-1',
        capaId: 'cap-1',
        bmInicialId: 'bm-1',
        estado: 'cerrada',
        cierre: { tipo: 'abierto', longitudK: 0.1, longitudKAuto: false, clase: 'tercerOrden', coeficiente: 12 },
        estaciones: [
          {
            id: 'e-1',
            vistaAtras: { id: 'l-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.2 },
            intermedias: [],
          },
        ],
      },
      {
        id: 'camp-2',
        fecha: '2026-01-11',
        calleId: 'c-1',
        capaId: 'cap-1',
        bmInicialId: 'bm-1',
        estado: 'cerrada',
        cierre: { tipo: 'abierto', longitudK: 0.1, longitudKAuto: false, clase: 'tercerOrden', coeficiente: 12 },
        estaciones: [
          {
            id: 'e-2',
            vistaAtras: { id: 'l-2', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.25 },
            intermedias: [
              {
                id: 'l-3',
                destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-I' } },
                valor: 1.9,
              },
            ],
          },
        ],
      },
    ],
  } as unknown as Proyecto
}

/** La calle trae solo el eje en su plantilla, y el catálogo aprendió que ZKJ también es el eje. */
function proyectoAnteriorConCatalogoAprendido(): Proyecto {
  return {
    version: 1,
    meta: metaAntigua('Jr. Catálogo'),
    bms: [],
    plantillas: [
      { id: 'pl-1', nombre: 'Plantilla urbana', elementos: [{ clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' }] },
    ],
    calles: [{ id: 'c-1', nombre: 'Jr. Catálogo', plantillaId: 'pl-1', rasante: null }],
    capas: [capaAntigua()],
    campanias: [],
    catalogo: { codigos: { zkj: 'eje' } },
  } as unknown as Proyecto
}

/** El catálogo aprendió un código de un concepto (sardinelIzq) que esta calle no tiene entre sus puntos. */
function proyectoAnteriorConCodigoHuerfano(): Proyecto {
  return {
    version: 1,
    meta: metaAntigua('Jr. Huérfano'),
    bms: [],
    plantillas: [
      { id: 'pl-1', nombre: 'Plantilla urbana', elementos: [{ clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' }] },
    ],
    calles: [{ id: 'c-1', nombre: 'Jr. Huérfano', plantillaId: 'pl-1', rasante: null }],
    capas: [capaAntigua()],
    campanias: [],
    catalogo: { codigos: { 'sar-i': 'sardinelIzq' } },
  } as unknown as Proyecto
}

/** Una lectura guardada con un elementoClave que ninguna clave vieja de la calle explica. */
function proyectoAnteriorConLecturaHuerfana(): Proyecto {
  return {
    version: 1,
    meta: metaAntigua('Jr. Lectura Huérfana'),
    bms: [{ id: 'bm-1', nombre: 'BM-1', cota: 100, tipo: 'oficial', descripcion: 'clavo' }],
    plantillas: [
      { id: 'pl-1', nombre: 'Plantilla urbana', elementos: [{ clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' }] },
    ],
    calles: [{ id: 'c-1', nombre: 'Jr. Lectura Huérfana', plantillaId: 'pl-1', rasante: null }],
    capas: [capaAntigua()],
    campanias: [
      {
        id: 'camp-1',
        fecha: '2026-01-10',
        calleId: 'c-1',
        capaId: 'cap-1',
        bmInicialId: 'bm-1',
        estado: 'cerrada',
        cierre: { tipo: 'abierto', longitudK: 0.1, longitudKAuto: false, clase: 'tercerOrden', coeficiente: 12 },
        estaciones: [
          {
            id: 'e-1',
            vistaAtras: { id: 'l-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.2 },
            intermedias: [
              {
                id: 'l-2',
                // 'BOR-I' no está en la plantilla de esta calle ni en su catálogo:
                // es una lectura huérfana, como la dejaría un archivo tocado a mano
                // o una columna que se borró de la plantilla después de medir.
                destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-I' } },
                valor: 2.05,
              },
            ],
          },
        ],
      },
    ],
  } as unknown as Proyecto
}

// ---------- Fixtures del modelo intermedio (calle con puntos propios) ----------
//
// No es hipotético: es la forma que tuvo el modelo en esta misma rama entre
// el commit que retiró la plantilla y el catálogo (introduciendo
// `PuntoCalle { concepto, codigo, distancia }` y las nivelaciones ya en su
// forma de hoy) y el que introdujo `Seccion`. La app se llegó a abrir con
// esta forma. `nivelaciones` ya trae la forma de toma de hoy: no hay
// `proyecto.campanias` en esta ventana, así que no hace falta convertir nada
// ahí, solo remapear las lecturas guardadas.

function proyectoIntermedioConPuntos(): Proyecto {
  return {
    version: 1,
    meta: metaAntigua('Jr. Intermedio'),
    bms: [{ id: 'bm-1', nombre: 'BM-1', cota: 100, tipo: 'oficial', descripcion: 'clavo' }],
    calles: [
      {
        id: 'c-1',
        nombre: 'Jr. Intermedio',
        rasante: null,
        puntos: [
          { concepto: 'bordeIzq', codigo: 'BI', distancia: -4.2 },
          { concepto: 'eje', codigo: 'EJE', distancia: 0 },
        ],
        nivelaciones: [
          {
            id: 'niv-1',
            nombre: 'Toma del 2026-01-10',
            color: '#2563eb',
            tomas: [
              {
                id: 'toma-1',
                fecha: '2026-01-10',
                capaId: 'cap-1',
                bmInicialId: 'bm-1',
                cierre: { tipo: 'abierto', longitudK: 0.1, longitudKAuto: false, clase: 'tercerOrden', coeficiente: 12 },
                estaciones: [
                  {
                    id: 'e-1',
                    vistaAtras: { id: 'l-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.2 },
                    intermedias: [
                      {
                        id: 'l-2',
                        destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BI' } },
                        valor: 1.9,
                      },
                      {
                        id: 'l-3',
                        destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } },
                        valor: 1.85,
                      },
                      {
                        id: 'l-4',
                        destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'BI' } },
                        valor: 1.92,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    capas: [capaAntigua()],
  } as unknown as Proyecto
}

/** El catálogo aprendió sardinelIzq, pero esta calle intermedia solo tiene borde y eje. */
function proyectoIntermedioConCodigoHuerfano(): Proyecto {
  return {
    version: 1,
    meta: metaAntigua('Jr. Intermedio Huérfano'),
    bms: [],
    calles: [
      {
        id: 'c-1',
        nombre: 'Jr. Intermedio Huérfano',
        rasante: null,
        puntos: [{ concepto: 'eje', codigo: 'EJE', distancia: 0 }],
        nivelaciones: [],
      },
    ],
    capas: [capaAntigua()],
    catalogo: { codigos: { 'sar-i': 'sardinelIzq' } },
  } as unknown as Proyecto
}

// ---------- Fixtures de la revisión (2026-08-30) ----------

/**
 * Una campaña cuya calle ya no está entre las calles del proyecto: el sitio
 * clásico donde se acumula un huérfano si borrar una calle no hacía cascada
 * sobre sus campañas.
 */
function proyectoAnteriorConCampaniaHuerfana(): Proyecto {
  return {
    version: 1,
    meta: metaAntigua('Jr. Campaña Huérfana'),
    bms: [{ id: 'bm-1', nombre: 'BM-1', cota: 100, tipo: 'oficial', descripcion: 'clavo' }],
    plantillas: [
      { id: 'pl-1', nombre: 'Plantilla urbana', elementos: [{ clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' }] },
    ],
    calles: [{ id: 'c-1', nombre: 'Jr. Campaña Huérfana', plantillaId: 'pl-1', rasante: null }],
    capas: [capaAntigua()],
    campanias: [
      {
        id: 'camp-fantasma',
        fecha: '2026-01-05',
        // 'c-borrada' no es el id de ninguna calle del proyecto.
        calleId: 'c-borrada',
        capaId: 'cap-1',
        bmInicialId: 'bm-1',
        estado: 'cerrada',
        cierre: { tipo: 'abierto', longitudK: 0.1, longitudKAuto: false, clase: 'tercerOrden', coeficiente: 12 },
        estaciones: [
          {
            id: 'e-1',
            vistaAtras: { id: 'l-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.2 },
            intermedias: [],
          },
        ],
      },
    ],
  } as unknown as Proyecto
}

/**
 * Una lectura cuyo `elementoClave` guardado es un código que el catálogo
 * había aprendido —no una clave de la plantilla—, y en otra mayúscula que la
 * que quedó guardada en `catalogo.codigos`: prueba que el mapa que arma
 * `aplicarCatalogoAntiguo` normaliza igual que las otras dos entradas.
 */
function proyectoAnteriorConLecturaPorCodigoDeCatalogo(): Proyecto {
  return {
    version: 1,
    meta: metaAntigua('Jr. Lectura Por Catálogo'),
    bms: [{ id: 'bm-1', nombre: 'BM-1', cota: 100, tipo: 'oficial', descripcion: 'clavo' }],
    plantillas: [
      { id: 'pl-1', nombre: 'Plantilla urbana', elementos: [{ clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' }] },
    ],
    calles: [{ id: 'c-1', nombre: 'Jr. Lectura Por Catálogo', plantillaId: 'pl-1', rasante: null }],
    capas: [capaAntigua()],
    // La clave del catálogo va en mayúscula: si el mapa la guardara cruda, no
    // casaría con la lectura de abajo, que la trae en minúscula.
    catalogo: { codigos: { ZKJ: 'eje' } },
    campanias: [
      {
        id: 'camp-1',
        fecha: '2026-01-10',
        calleId: 'c-1',
        capaId: 'cap-1',
        bmInicialId: 'bm-1',
        estado: 'cerrada',
        cierre: { tipo: 'abierto', longitudK: 0.1, longitudKAuto: false, clase: 'tercerOrden', coeficiente: 12 },
        estaciones: [
          {
            id: 'e-1',
            vistaAtras: { id: 'l-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.2 },
            intermedias: [
              {
                id: 'l-2',
                // 'zkj' nunca fue clave de la plantilla: es el código que el
                // catálogo había aprendido para el eje, y en minúscula.
                destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'zkj' } },
                valor: 1.85,
              },
            ],
          },
        ],
      },
    ],
  } as unknown as Proyecto
}

/**
 * Una calle sin plantilla, con una lectura cuyo `elementoClave` es una
 * palabra de fábrica ('BOR-I', que `seccionDeFabrica` ya declara en
 * `p-borde-i'): la plantilla se pudo haber borrado después de medir, y eso
 * no tiene por qué huerfanizar la lectura.
 */
function proyectoAnteriorSinPlantillaConLecturas(): Proyecto {
  return {
    version: 1,
    meta: metaAntigua('Jr. Sin Plantilla Con Lecturas'),
    bms: [{ id: 'bm-1', nombre: 'BM-1', cota: 100, tipo: 'oficial', descripcion: 'clavo' }],
    plantillas: [],
    calles: [{ id: 'c-1', nombre: 'Jr. Sin Plantilla Con Lecturas', plantillaId: 'pl-fantasma', rasante: null }],
    capas: [capaAntigua()],
    campanias: [
      {
        id: 'camp-1',
        fecha: '2026-01-10',
        calleId: 'c-1',
        capaId: 'cap-1',
        bmInicialId: 'bm-1',
        estado: 'cerrada',
        cierre: { tipo: 'abierto', longitudK: 0.1, longitudKAuto: false, clase: 'tercerOrden', coeficiente: 12 },
        estaciones: [
          {
            id: 'e-1',
            vistaAtras: { id: 'l-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.2 },
            intermedias: [
              {
                id: 'l-2',
                destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-I' } },
                valor: 2.084,
              },
            ],
          },
        ],
      },
    ],
  } as unknown as Proyecto
}

/**
 * Una calle sin plantilla, con una lectura cuyo `elementoClave` guardado es
 * 'VEREDA': la sección de fábrica declara esa palabra en los DOS puntos de
 * vereda a la vez (`p-vereda-i` y `p-vereda-d`), así que no hay una
 * correspondencia única que leer. Resolverla de todos modos adivinaría un
 * lado, y colocaría la lectura en la vereda derecha aunque la medida fuera
 * de la izquierda.
 */
function proyectoAnteriorSinPlantillaConLecturaAmbigua(): Proyecto {
  return {
    version: 1,
    meta: metaAntigua('Jr. Sin Plantilla Ambigua'),
    bms: [{ id: 'bm-1', nombre: 'BM-1', cota: 100, tipo: 'oficial', descripcion: 'clavo' }],
    plantillas: [],
    calles: [{ id: 'c-1', nombre: 'Jr. Sin Plantilla Ambigua', plantillaId: 'pl-fantasma', rasante: null }],
    capas: [capaAntigua()],
    campanias: [
      {
        id: 'camp-1',
        fecha: '2026-01-10',
        calleId: 'c-1',
        capaId: 'cap-1',
        bmInicialId: 'bm-1',
        estado: 'cerrada',
        cierre: { tipo: 'abierto', longitudK: 0.1, longitudKAuto: false, clase: 'tercerOrden', coeficiente: 12 },
        estaciones: [
          {
            id: 'e-1',
            vistaAtras: { id: 'l-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.2 },
            intermedias: [
              {
                id: 'l-2',
                destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'VEREDA' } },
                valor: 1.75,
              },
            ],
          },
        ],
      },
    ],
  } as unknown as Proyecto
}

/** Una plantilla que existe pero no tiene ni un elemento declarado. */
function proyectoAnteriorConPlantillaVacia(): Proyecto {
  return {
    version: 1,
    meta: metaAntigua('Jr. Plantilla Vacía'),
    bms: [],
    plantillas: [{ id: 'pl-1', nombre: 'Plantilla urbana', elementos: [] }],
    calles: [{ id: 'c-1', nombre: 'Jr. Plantilla Vacía', plantillaId: 'pl-1', rasante: null }],
    capas: [capaAntigua()],
    campanias: [],
  } as unknown as Proyecto
}

/**
 * Una calle de la forma más vieja (con plantilla) que, además, ya trae una
 * nivelación puesta a mano: no es la forma habitual —esta calle debería
 * traer sus campañas aparte, en `proyecto.campanias`—, pero si la trajera de
 * todos modos, `nivelaciones: []` a secas se la comería en silencio.
 */
function proyectoAnteriorConNivelacionesSueltas(): Proyecto {
  return {
    version: 1,
    meta: metaAntigua('Jr. Nivelaciones Sueltas'),
    bms: [{ id: 'bm-1', nombre: 'BM-1', cota: 100, tipo: 'oficial', descripcion: 'clavo' }],
    plantillas: [
      { id: 'pl-1', nombre: 'Plantilla urbana', elementos: [{ clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' }] },
    ],
    calles: [
      {
        id: 'c-1',
        nombre: 'Jr. Nivelaciones Sueltas',
        plantillaId: 'pl-1',
        rasante: null,
        nivelaciones: [
          {
            id: 'niv-suelta',
            nombre: 'Nivelación suelta',
            color: '#16a34a',
            tomas: [],
          },
        ],
      },
    ],
    capas: [capaAntigua()],
    campanias: [],
  } as unknown as Proyecto
}

describe('archivo .topo', () => {
  it('empaqueta y desempaqueta sin perder datos', () => {
    const original = proyectoEjemplo()
    const recuperado = desempaquetarProyecto(empaquetarProyecto(original))
    expect(recuperado).toEqual(original)
  })

  it('conserva las lecturas crudas exactas', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoEjemplo()))
    expect(
      recuperado.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[0]!.intermedias[0]!.valor,
    ).toBe(1.931)
  })

  it('avisa en cristiano si el archivo está dañado', () => {
    expect(() => desempaquetarProyecto(new Uint8Array([1, 2, 3]))).toThrow(
      'No se pudo leer el archivo .topo: parece estar dañado o no ser un archivo de la app.',
    )
  })

  it('avisa si el archivo trae una versión que no conoce', () => {
    const proyecto = { ...proyectoEjemplo(), version: 99 } as never
    const datos = empaquetarProyecto(proyecto)
    expect(() => desempaquetarProyecto(datos)).toThrow(
      'Este archivo fue creado con una versión más nueva de la app.',
    )
  })

  it('rechaza un archivo sin número de versión', () => {
    const proyecto = { ...proyectoEjemplo(), version: undefined } as never
    expect(() => desempaquetarProyecto(empaquetarProyecto(proyecto))).toThrow(
      'los datos del proyecto no se entienden',
    )
  })

  // El campo `orden` de las capas es nuevo en la 2A: un .topo de la Entrega 1
  // trae capas sin él, y desempaquetarProyecto tiene que dejarlas usables.
  it('un proyecto de la Entrega 1 sin el campo orden en las capas sale con orden 0, 1, 2… por posición', () => {
    const original = proyectoEjemplo()
    const sinOrden = {
      ...original,
      capas: original.capas.map(({ orden: _orden, ...resto }) => resto),
    } as never

    const recuperado = desempaquetarProyecto(empaquetarProyecto(sinOrden))

    expect(recuperado.capas.map((capa) => capa.orden)).toEqual(
      original.capas.map((_, indice) => indice),
    )
    // El resto de cada capa (id, nombre) se conserva tal cual venía.
    expect(recuperado.capas.map((capa) => capa.id)).toEqual(original.capas.map((capa) => capa.id))
  })

  // Un archivo a medio migrar —unas capas con el campo y otras sin él— es el
  // caso que de verdad exige asignar el orden POR POSICIÓN del array. Aquí las
  // capas vienen deliberadamente en un orden que no coincide con el campo que
  // sí traen: la de en medio dice 'orden 7' y tiene que acabar en la 1, porque
  // manda la posición en el archivo, que es como se guardaba el paquete.
  it('un proyecto a medio migrar se renumera por posición, no por el campo que traen algunas capas', () => {
    const aMedias = {
      ...proyectoEjemplo(),
      capas: [
        { id: 'cap-terreno', nombre: 'TERRENO EXISTENTE' },
        { id: 'cap-sub', nombre: 'SUBRASANTE', orden: 7 },
        { id: 'cap-base', nombre: 'BASE' },
      ],
    } as never

    const recuperado = desempaquetarProyecto(empaquetarProyecto(aMedias))

    expect(recuperado.capas.map((capa) => [capa.id, capa.orden])).toEqual([
      ['cap-terreno', 0],
      ['cap-sub', 1],
      ['cap-base', 2],
    ])
  })

  it('un proyecto que ya trae el campo orden en sus capas no se toca', () => {
    const original = proyectoEjemplo()
    const recuperado = desempaquetarProyecto(empaquetarProyecto(original))

    expect(recuperado.capas).toEqual(original.capas)
  })

  // `espesor`, `toleranciaMm` (en la capa) y `rasante` (en la calle) son
  // nuevos en la Entrega 2B: un .topo guardado antes trae las capas y calles
  // sin ellos, y desempaquetarProyecto tiene que dejarlos usables.
  it('un proyecto guardado antes de la 2B sale con espesor cero y tolerancia por defecto', () => {
    const original = proyectoEjemplo()
    const viejo = {
      ...original,
      capas: original.capas.map(({ espesor: _e, toleranciaMm: _t, ...resto }) => resto),
    } as never

    const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))

    expect(recuperado.capas.every((capa) => capa.espesor === 0)).toBe(true)
    expect(recuperado.capas.every((capa) => capa.toleranciaMm > 0)).toBe(true)
  })

  it('un proyecto guardado antes de la 2B sale con las calles sin rasante', () => {
    const original = proyectoEjemplo()
    const viejo = {
      ...original,
      calles: original.calles.map(({ rasante: _r, ...resto }) => resto),
    } as never

    const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))

    expect(recuperado.calles.every((calle) => calle.rasante === null)).toBe(true)
  })

  it('un proyecto que ya trae espesor y tolerancia no se toca', () => {
    const original = proyectoEjemplo()
    original.capas[1]!.espesor = 0.25
    // 15 y no el valor por defecto de la migración (20): si el código pisara
    // la tolerancia siempre, esta prueba seguiría en verde con 20 porque
    // coincidiría por casualidad con el valor por defecto.
    original.capas[1]!.toleranciaMm = 15

    const recuperado = desempaquetarProyecto(empaquetarProyecto(original))

    expect(recuperado.capas[1]!.espesor).toBe(0.25)
    expect(recuperado.capas[1]!.toleranciaMm).toBe(15)
  })

  // `progresivasDeclaradas` es nueva: hasta ahora las filas de la libreta
  // solo podían salir de lo ya medido. Un .topo guardado antes no la trae, y
  // se deduce de lo medido para que se abra exactamente igual que antes: ni
  // una fila de más ni una de menos.
  it('un proyecto guardado sin progresivas declaradas las deduce de lo que midió', () => {
    const original = proyectoEjemplo()
    const viejo = {
      ...original,
      calles: original.calles.map((calle) => ({
        ...calle,
        nivelaciones: calle.nivelaciones.map((nivelacion) => ({
          ...nivelacion,
          tomas: nivelacion.tomas.map(({ progresivasDeclaradas: _p, ...resto }) => resto),
        })),
      })),
    } as never

    const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))
    const toma = recuperado.calles[0]!.nivelaciones[0]!.tomas[0]!

    expect(toma.progresivasDeclaradas).toEqual(progresivasMedidas(toma.estaciones))
    // Y la libreta sale con la misma tabla de siempre: 5 progresivas medidas
    // por los 7 puntos de la calle del ejemplo.
    const resultado = calcularCampania({
      campania: toma,
      calle: recuperado.calles[0]!,
      bms: recuperado.bms,
    })
    expect(resultado.celdasTotales).toBe(35)
  })

  it('un proyecto que ya declara progresivas sin medir no las pierde al abrirse', () => {
    const original = proyectoEjemplo()
    // 0+100 no la midió nadie: si la migración recalculara desde lo medido,
    // se la llevaría por delante.
    original.calles[0]!.nivelaciones[0]!.tomas[0]!.progresivasDeclaradas = [0, 100]

    const recuperado = desempaquetarProyecto(empaquetarProyecto(original))

    expect(recuperado.calles[0]!.nivelaciones[0]!.tomas[0]!.progresivasDeclaradas).toEqual([0, 100])
  })
})

describe('migración de calles del modelo anterior a la sección declarada', () => {
  // Las rutas de aviso llaman a console.warn a propósito (es lo único
  // disponible desde `archivo/topo.ts` para anotar sin tirar el dato). Se
  // espía para que la salida de las pruebas quede sin avisos, y para poder
  // comprobar que el aviso de verdad se emitió.
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('una calle del modelo anterior estrena sección con los puntos de su plantilla', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnterior()))
    const puntos = recuperado.calles[0]!.seccion.puntos

    expect(puntos.map((p) => p.rol)).toEqual(['bordeCalzada', 'eje'])
    expect(puntos[0]!.distancia).toBe(-4.2)
    expect(puntos[0]!.palabras).toContain('BOR-I')
  })

  it('las distancias que venían de la plantilla NO se marcan como de fábrica', () => {
    // Son medidas que Max puso; decir que las puso la app sería mentir en pantalla.
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnterior()))

    // every(...) === false solo diría «no todos»: con dos puntos, uno mal
    // marcado dejaría esto en verde igual. Lo que hay que afirmar es que
    // NINGUNO quedó de fábrica.
    expect(recuperado.calles[0]!.seccion.puntos.every((p) => !p.distanciaDeFabrica)).toBe(true)
  })

  it('una calle sin plantilla estrena la sección de fábrica y se anota', () => {
    // Antes se quedaba sin puntos. Ahora puede arrancar de fábrica porque el aviso
    // de «distancias de fábrica» impide que se lean como medidas.
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnteriorSinPlantilla()))

    expect(recuperado.calles[0]!.seccion.puntos).toHaveLength(7)
    expect(recuperado.calles[0]!.seccion.puntos.every((p) => p.distanciaDeFabrica)).toBe(true)
    expect(console.warn).toHaveBeenCalled()
  })

  it('cada campaña se convierte en una nivelación de una sola toma', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnteriorConDosCampanias()))

    expect(recuperado.calles[0]!.nivelaciones).toHaveLength(2)
    expect(recuperado.calles[0]!.nivelaciones[0]!.tomas).toHaveLength(1)
  })

  it('las lecturas sobreviven intactas a la migración', () => {
    const viejo = proyectoAnteriorConDosCampanias()
    const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))

    expect(recuperado.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones).toEqual(
      (viejo as unknown as { campanias: { estaciones: unknown }[] }).campanias[0]!.estaciones,
    )
  })

  it('cada nivelación migrada recibe un color distinto', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnteriorConDosCampanias()))
    const colores = recuperado.calles[0]!.nivelaciones.map((n) => n.color)

    expect(new Set(colores).size).toBe(colores.length)
  })

  it('el catálogo viejo se convierte en palabras de los puntos, no se tira', () => {
    const viejo = proyectoAnteriorConCatalogoAprendido() // trae ZKJ → eje
    const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))
    const eje = recuperado.calles[0]!.seccion.puntos.find((p) => p.rol === 'eje')!

    expect(eje.palabras.map((p) => p.toLowerCase())).toContain('zkj')
  })

  it('un código aprendido que no encuentra su punto se anota, y no rompe la migración', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnteriorConCodigoHuerfano()))

    // La calle solo tenía el eje: el código de sardinel izquierdo no tiene
    // dónde caer, y no se inventa un punto nuevo para colocarlo.
    expect(recuperado.calles[0]!.seccion.puntos).toHaveLength(1)
    expect(console.warn).toHaveBeenCalled()
  })

  it('un proyecto que ya trae el modelo nuevo no se toca', () => {
    const nuevo = proyectoEjemplo()

    expect(desempaquetarProyecto(empaquetarProyecto(nuevo)).calles).toEqual(nuevo.calles)
  })

  // ---------- Enmienda del controlador (2026-08-30) ----------
  //
  // Celda.elementoClave pasa a ser punto.id, no el código del punto. Un
  // proyecto guardado con el modelo anterior tiene lecturas cuyo
  // elementoClave es el código viejo ('BOR-I'): si la migración no las
  // remapea, esas lecturas quedan apuntando a una columna que no existe y el
  // proyecto se abre con la grilla vacía.

  it('las lecturas guardadas siguen apuntando a su columna tras migrar', () => {
    const viejo = proyectoAnteriorConDosCampanias()
    const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))

    const seccion = recuperado.calles[0]!.seccion
    const claves = recuperado.calles[0]!.nivelaciones
      .flatMap((n) => n.tomas)
      .flatMap((t) => t.estaciones)
      .flatMap((e) => [e.vistaAtras, ...e.intermedias, ...(e.vistaAdelante ? [e.vistaAdelante] : [])])
      .filter((l) => l.destino.tipo === 'celda')
      .map((l) => (l.destino as { celda: { elementoClave: string } }).celda.elementoClave)

    // Ni una sola lectura puede quedar apuntando a una columna que no existe.
    expect(claves.length).toBeGreaterThan(0)
    for (const clave of claves) {
      expect(seccion.puntos.some((p) => p.id === clave)).toBe(true)
    }
  })

  it('una lectura cuyo elementoClave guardado no encuentra punto no se tira ni se inventa uno: se anota', () => {
    const viejo = proyectoAnteriorConLecturaHuerfana()
    const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))

    const lectura = recuperado.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[0]!.intermedias[0]!

    // Ni se pierde la lectura ni se inventa un punto para ella: se conserva
    // con su clave vieja (que ya no resuelve a ningún punto) y su valor de
    // campo intacto.
    expect(lectura.valor).toBe(2.05)
    expect(lectura.destino).toEqual({ tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-I' } })
    expect(console.warn).toHaveBeenCalled()
  })

  // ---------- Reparo del controlador (2026-08-30): la forma intermedia ----------
  //
  // No es hipotética: es la forma que tuvo el modelo en esta misma rama entre
  // dos commits, y la app se llegó a abrir con ella. Una calle con
  // `puntos: PuntoCalle[]` pero sin `seccion` tiene que migrar igual que la
  // de plantilla, con la misma exigencia: ni una lectura huérfana, ni un
  // valor ni una progresiva cambiados.

  it('una calle del modelo intermedio (con puntos propios) estrena sección desde sus puntos', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoIntermedioConPuntos()))
    const puntos = recuperado.calles[0]!.seccion.puntos

    // bordeIzq → bordeCalzada (con el lado ya en el signo de la distancia), eje → eje.
    expect(puntos.map((p) => p.rol)).toEqual(['bordeCalzada', 'eje'])
    expect(puntos.map((p) => p.distancia)).toEqual([-4.2, 0])
    expect(puntos[0]!.palabras).toContain('BI')
    expect(puntos[1]!.palabras).toContain('EJE')
    expect(puntos.every((p) => !p.distanciaDeFabrica)).toBe(true)
  })

  it('las nivelaciones del modelo intermedio, ya en forma de toma, se conservan enteras', () => {
    const viejo = proyectoIntermedioConPuntos()
    const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))

    expect(recuperado.calles[0]!.nivelaciones).toHaveLength(1)
    expect(recuperado.calles[0]!.nivelaciones[0]!.tomas).toHaveLength(1)
    expect(recuperado.calles[0]!.nivelaciones[0]!.color).toBe('#2563eb')
    expect(recuperado.calles[0]!.nivelaciones[0]!.nombre).toBe('Toma del 2026-01-10')
  })

  it('en el modelo intermedio, ni un valor de lectura ni una progresiva cambian, y ninguna columna queda inventada', () => {
    const viejo = proyectoIntermedioConPuntos()
    const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))

    const seccion = recuperado.calles[0]!.seccion
    const lecturas = recuperado.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[0]!.intermedias
    const viejasLecturas = (
      viejo as unknown as {
        calles: { nivelaciones: { tomas: { estaciones: { intermedias: { valor: number; destino: { celda: { progresiva: number } } }[] }[] }[] }[] }[]
      }
    ).calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[0]!.intermedias

    // Los valores y las progresivas viajan sin tocar; solo cambia elementoClave.
    expect(lecturas.map((l) => l.valor)).toEqual(viejasLecturas.map((l) => l.valor))
    expect(lecturas.map((l) => (l.destino as { celda: { progresiva: number } }).celda.progresiva)).toEqual(
      viejasLecturas.map((l) => l.destino.celda.progresiva),
    )

    // Ni una sola lectura de celda puede quedar apuntando a una columna que no existe.
    const claves = lecturas
      .filter((l) => l.destino.tipo === 'celda')
      .map((l) => (l.destino as { celda: { elementoClave: string } }).celda.elementoClave)
    expect(claves.length).toBeGreaterThan(0)
    for (const clave of claves) {
      expect(seccion.puntos.some((p) => p.id === clave)).toBe(true)
    }
  })

  it('en el modelo intermedio, un código de catálogo cuyo concepto no tiene punto se anota y no rompe la migración', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoIntermedioConCodigoHuerfano()))

    // La calle solo tenía el eje: el código de sardinel izquierdo no tiene
    // dónde caer, y no se inventa un punto nuevo para colocarlo.
    expect(recuperado.calles[0]!.seccion.puntos).toHaveLength(1)
    expect(console.warn).toHaveBeenCalled()
  })

  // ---------- Reparo del controlador (2026-08-30): la cadena de huérfanas ----------
  //
  // El aviso de `console.warn` que emite la migración no es la única red: si
  // tras migrar quedara una lectura sin remapear, el aviso de lecturas
  // huérfanas de `calcularCampania` (packages/core) lo dice en pantalla, sin
  // enseñar la llave interna. Esta prueba comprueba esa cadena de verdad,
  // extremo a extremo, con el resultado de la propia migración.

  it('una lectura que la migración no pudo remapear dispara el aviso de huérfanas al calcular la campaña', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnteriorConLecturaHuerfana()))
    const calle = recuperado.calles[0]!
    const toma = calle.nivelaciones[0]!.tomas[0]!

    const resultado = calcularCampania({ campania: toma, calle, bms: recuperado.bms })

    const avisoDeHuerfanas = resultado.avisos.find((a) => /ya no caen en la grilla/i.test(a.mensaje))
    expect(avisoDeHuerfanas).toBeDefined()
    // El aviso nombra qué le pasa al punto, nunca su clave interna vieja.
    expect(avisoDeHuerfanas!.mensaje).not.toContain('BOR-I')
  })

  // ---------- Revisión (2026-08-30): la campaña huérfana ----------
  //
  // `proyecto.campanias` era un array de nivel de proyecto: el sitio clásico
  // donde se acumulan huérfanas si borrar una calle no hacía cascada. Antes,
  // la única consumidora era el filtro dentro del bucle de calles viejas: una
  // campaña cuya calle ya no existiera, o un proyecto sin ninguna calle
  // vieja, la perdían entera —estaciones y lecturas de un día de campo— sin
  // avisar.

  it('una campaña cuya calle ya no existe no desaparece en silencio: se anota', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnteriorConCampaniaHuerfana()))

    // No hay dónde ponerla: la calle que la tenía ya no está en el proyecto.
    expect(recuperado.calles).toHaveLength(1)
    expect(recuperado.calles[0]!.nivelaciones).toHaveLength(0)

    const mensajes = vi.mocked(console.warn).mock.calls.map((llamada) => String(llamada[0]))
    expect(mensajes.some((m) => /campañ/i.test(m) && /c-borrada/.test(m))).toBe(true)
  })

  it('una campaña sobrante cuando el proyecto ya no tiene ninguna calle vieja tampoco desaparece en silencio', () => {
    const nuevo = proyectoEjemplo()
    const conCampaniaFantasma = {
      ...nuevo,
      campanias: [
        {
          id: 'camp-fantasma',
          fecha: '2026-01-05',
          calleId: 'c-inexistente',
          capaId: nuevo.capas[0]!.id,
          bmInicialId: nuevo.bms[0]!.id,
          estado: 'cerrada',
          cierre: { tipo: 'abierto', longitudK: 0.1, longitudKAuto: false, clase: 'tercerOrden', coeficiente: 12 },
          estaciones: [
            {
              id: 'e-1',
              vistaAtras: { id: 'l-1', destino: { tipo: 'bm', bmId: nuevo.bms[0]!.id }, valor: 1.2 },
              intermedias: [],
            },
          ],
        },
      ],
    } as unknown as Proyecto

    // Ninguna calle vieja: antes se salía por identidad sin mirar campanias.
    const recuperado = desempaquetarProyecto(empaquetarProyecto(conCampaniaFantasma))
    expect(recuperado.calles).toEqual(nuevo.calles)

    const mensajes = vi.mocked(console.warn).mock.calls.map((llamada) => String(llamada[0]))
    expect(mensajes.some((m) => /campañ/i.test(m) && /c-inexistente/.test(m))).toBe(true)
  })

  // ---------- Revisión (2026-08-30): cinco de una línea ----------

  it('una lectura cuyo elementoClave venía de un código del catálogo (no de la plantilla) resuelve a su punto, sin importar la mayúscula', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnteriorConLecturaPorCodigoDeCatalogo()))
    const seccion = recuperado.calles[0]!.seccion
    const eje = seccion.puntos.find((p) => p.rol === 'eje')!
    const lectura = recuperado.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[0]!.intermedias[0]!

    expect((lectura.destino as { celda: { elementoClave: string } }).celda.elementoClave).toBe(eje.id)
    expect(lectura.valor).toBe(1.85)
  })

  it('una calle sin plantilla resuelve sus lecturas contra las palabras de fábrica: la plantilla borrada no las huerfaniza', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnteriorSinPlantillaConLecturas()))
    const seccion = recuperado.calles[0]!.seccion
    const bordeIzquierdo = seccion.puntos.find((p) => p.id === 'p-borde-i')!
    const lectura = recuperado.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[0]!.intermedias[0]!

    expect((lectura.destino as { celda: { elementoClave: string } }).celda.elementoClave).toBe(bordeIzquierdo.id)
    expect(lectura.valor).toBe(2.084)
  })

  // ---------- Reparo del controlador (2026-08-30): la palabra que declaran dos puntos a la vez ----------
  //
  // `seccionDeFabrica` declara 'BORDE', 'SARDINEL' y 'VEREDA' en los dos
  // puntos de cada par a la vez —uno por lado—. Si el mapa de respaldo de
  // una calle sin plantilla se armara punto por punto, el del lado derecho
  // pisaría siempre al del izquierdo, y una lectura con esa palabra genérica
  // se remaparía siempre al lado derecho, con su distancia, sin importar de
  // qué lado hubiera sido la medida en el campo. Solo la palabra que un
  // único punto declare resuelve sin ambigüedad; la que declaren dos queda
  // fuera del mapa, y la lectura que la use queda huérfana y anotada.

  it('una calle sin plantilla no resuelve una palabra que la fábrica declara en dos puntos a la vez: la lectura queda huérfana y anotada, no colocada a la derecha', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnteriorSinPlantillaConLecturaAmbigua()))
    const lectura = recuperado.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[0]!.intermedias[0]!

    // Ni se coloca en la vereda derecha (que es la que ganaría si el mapa se
    // armara por orden de iteración) ni en ninguna otra: se conserva con su
    // clave vieja, sin resolver, y su valor de campo intacto.
    expect(lectura.destino).toEqual({ tipo: 'celda', celda: { progresiva: 0, elementoClave: 'VEREDA' } })
    expect(lectura.valor).toBe(1.75)
    expect(console.warn).toHaveBeenCalled()
  })

  it('una plantilla sin elementos se trata igual que si no existiera: sección de fábrica y se anota', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnteriorConPlantillaVacia()))

    expect(recuperado.calles[0]!.seccion.puntos).toHaveLength(7)
    expect(recuperado.calles[0]!.seccion.puntos.every((p) => p.distanciaDeFabrica)).toBe(true)
    expect(console.warn).toHaveBeenCalled()
  })

  it('una calle con plantilla que ya trajera una nivelación puesta no la pierde al construirse de nuevo', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnteriorConNivelacionesSueltas()))

    expect(recuperado.calles[0]!.nivelaciones.map((n) => n.id)).toContain('niv-suelta')
  })
})

describe('abrir un .topo elegido en el navegador', () => {
  // `abrirTopo` es por donde entra cada proyecto guardado, y hasta ahora
  // ninguna prueba la cruzaba: leía los bytes con `archivo.arrayBuffer()`,
  // que jsdom no trae. Con `bytesDelArchivo` (FileReader) sí se puede armar
  // un archivo de verdad, abrirlo, y comprobar qué sale por el otro lado.
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('un .topo recién guardado se vuelve a abrir con el proyecto entero', async () => {
    const original = proyectoEjemplo()
    const archivo = new File([empaquetarProyecto(original)], 'Av. Sol.topo')

    const recuperado = await abrirTopo(archivo)

    expect(recuperado).toEqual(original)
  })

  it('las lecturas de campo llegan con su valor exacto, no aproximadas', async () => {
    // El viaje entero —comprimir, escribir el archivo, leerlo byte a byte y
    // descomprimir— no puede tocar ni un milímetro de lo que Max anotó.
    const archivo = new File([empaquetarProyecto(proyectoEjemplo())], 'Av. Sol.topo')

    const recuperado = await abrirTopo(archivo)

    expect(
      recuperado.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones[0]!.intermedias[0]!.valor,
    ).toBe(1.931)
  })

  it('un archivo que no es un .topo avisa en cristiano en vez de reventar', async () => {
    const archivo = new File([new Uint8Array([1, 2, 3])], 'foto.topo')

    await expect(abrirTopo(archivo)).rejects.toThrow(
      'No se pudo leer el archivo .topo: parece estar dañado o no ser un archivo de la app.',
    )
  })

  it('un .topo del modelo anterior entra ya migrado a la sección declarada, no crudo', async () => {
    // Abrir un archivo es uno de los dos caminos por los que un proyecto
    // viejo vuelve a la app: si `abrirTopo` se saltara la migración, la
    // calle entraría sin sección, y todo lo que cuelga de ella se rompería.
    const archivo = new File([empaquetarProyecto(proyectoAnterior())], 'Jr. Viejo.topo')

    const recuperado = await abrirTopo(archivo)

    expect(recuperado.calles[0]!.seccion.puntos.map((p) => p.rol)).toEqual(['bordeCalzada', 'eje'])
    expect(recuperado.calles[0]!.seccion.puntos[0]!.distancia).toBe(-4.2)
  })
})

describe('guardar un .topo en el disco', () => {
  // `descargarTopo` es la puerta de salida —lo que graba es lo único que le
  // queda al topógrafo de su día de campo— y no la cruzaba ninguna prueba.
  // Dos piezas del navegador hay que ponerlas a mano para poder mirar qué se
  // graba, y ninguna de las dos toca el código de producción:
  //
  // - `URL.createObjectURL` y `URL.revokeObjectURL`: jsdom no las trae.
  //   Puestas aquí, dejan quedarse con el Blob que se le entrega al
  //   navegador, que es exactamente lo que acabaría en el disco.
  // - el `click()` del enlace: jsdom lo convierte en una navegación de verdad
  //   y escupe «Not implemented: navigation» por la salida —encima tarde, por
  //   un temporizador, así que mancharía la prueba siguiente—. Se sustituye
  //   por un doble que anota el nombre del archivo, que es todo lo que ese
  //   click tiene de observable.
  const blobs: Blob[] = []
  const nombres: string[] = []
  const urlsCreadas: string[] = []
  const urlsSoltadas: string[] = []

  function conNombre(nombre: string): Proyecto {
    const proyecto = proyectoEjemplo()
    return { ...proyecto, meta: { ...proyecto.meta, nombre } }
  }

  beforeEach(() => {
    blobs.length = 0
    nombres.length = 0
    urlsCreadas.length = 0
    urlsSoltadas.length = 0

    const crearUrl: typeof URL.createObjectURL = (objeto) => {
      blobs.push(objeto as Blob)
      const url = `blob:prueba/${blobs.length}`
      urlsCreadas.push(url)
      return url
    }
    const soltarUrl: typeof URL.revokeObjectURL = (url) => {
      urlsSoltadas.push(url)
    }

    URL.createObjectURL = crearUrl
    URL.revokeObjectURL = soltarUrl
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      nombres.push(this.download)
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(URL, 'createObjectURL')
    Reflect.deleteProperty(URL, 'revokeObjectURL')
    vi.restoreAllMocks()
  })

  it('lo que se graba se vuelve a abrir entero', async () => {
    const original = proyectoEjemplo()

    descargarTopo(original)

    expect(blobs).toHaveLength(1)
    // Se abre por la misma puerta de entrada que usa la app, no por un
    // atajo: lo grabado tiene que servirle a `abrirTopo` tal cual.
    const recuperado = await abrirTopo(new File([blobs[0]!], 'Av. Sol.topo'))

    expect(recuperado).toEqual(original)
  })

  it('el archivo se llama como el proyecto, sin lo que no vale en un nombre', () => {
    descargarTopo(conNombre('Jr. Lima / 2'))

    expect(nombres).toEqual(['Jr Lima  2.topo'])
  })

  it('un nombre que se queda en nada no da un archivo llamado solo «.topo»', () => {
    // En la carpeta de descargas, un archivo llamado «.topo» no le dice nada
    // a nadie —y el siguiente lo pisaría—.
    descargarTopo(conNombre('///'))

    expect(nombres).toEqual(['proyecto.topo'])
  })

  it('suelta el objeto que creó: no deja el archivo colgado en memoria', () => {
    descargarTopo(proyectoEjemplo())

    expect(urlsCreadas).toHaveLength(1)
    expect(urlsSoltadas).toEqual(urlsCreadas)
  })
})
