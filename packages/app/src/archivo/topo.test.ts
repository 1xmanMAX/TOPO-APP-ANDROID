import { calcularCampania, type Proyecto } from '@topo/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { proyectoEjemplo } from '../estado/ejemplo'
import { desempaquetarProyecto, empaquetarProyecto } from './topo'

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

    expect(recuperado.calles[0]!.seccion.puntos.every((p) => p.distanciaDeFabrica)).toBe(false)
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
    expect(puntos.every((p) => p.distanciaDeFabrica)).toBe(false)
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
})
