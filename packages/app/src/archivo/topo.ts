import {
  anadirPalabra,
  esPalabraDe,
  ETIQUETA_ROL,
  ladoDe,
  normalizarPalabra,
  seccionDeFabrica,
  type BM,
  type Calle,
  type Capa,
  type ConfiguracionCierre,
  type Estacion,
  type Id,
  type Lado,
  type Lectura,
  type MetaProyecto,
  type Nivelacion,
  type Proyecto,
  type PuntoSeccion,
  type Rasante,
  type Rol,
  type Seccion,
  type Toma,
} from '@topo/core'
import { unzipSync, zipSync } from 'fflate'
import { nuevoId } from '../estado/ejemplo'
import { agregarTomaComoNivelacion } from '../estado/proyectoTomas'

const NOMBRE_INTERNO = 'proyecto.json'
const VERSION_SOPORTADA = 1

export function empaquetarProyecto(proyecto: Proyecto) {
  const json = new TextEncoder().encode(JSON.stringify(proyecto, null, 2))
  return zipSync({ [NOMBRE_INTERNO]: json }, { level: 6 })
}

export function desempaquetarProyecto(datos: Uint8Array): Proyecto {
  let contenido: Record<string, Uint8Array>
  try {
    contenido = unzipSync(datos)
  } catch {
    throw new Error(
      'No se pudo leer el archivo .topo: parece estar dañado o no ser un archivo de la app.' +
        ' Comprueba que sea el archivo .topo que guardaste.',
    )
  }

  const json = contenido[NOMBRE_INTERNO]
  if (!json) {
    throw new Error(
      'No se pudo leer el archivo .topo: parece estar dañado o no ser un archivo de la app.' +
        ' Comprueba que sea el archivo .topo que guardaste.',
    )
  }

  let proyecto: Proyecto
  try {
    proyecto = JSON.parse(new TextDecoder().decode(json)) as Proyecto
  } catch {
    throw new Error('El archivo .topo está dañado: los datos del proyecto no se entienden.')
  }

  if (typeof proyecto?.version !== 'number') {
    throw new Error(
      'El archivo .topo está dañado: los datos del proyecto no se entienden. ' +
        'Prueba con otra copia del archivo.',
    )
  }

  if (proyecto.version > VERSION_SOPORTADA) {
    throw new Error(
      'Este archivo fue creado con una versión más nueva de la app.' +
        ' Actualiza la aplicación para poder abrirlo.',
    )
  }

  return migrarProyecto(proyecto)
}

/**
 * Todo lo que un proyecto de una versión anterior necesita para quedar
 * usable hoy. Hay dos caminos por los que un proyecto viejo puede volver a
 * la app —abrir un archivo `.topo` y recuperar el autoguardado del
 * navegador—, y los dos tienen que pasar por aquí: si cada uno migrara por
 * su cuenta, bastaría con que uno de los dos se quedara atrás para que un
 * proyecto recuperado entrara con campos a medias (por ejemplo `espesor`
 * indefinido) y las cuentas que dependen de ellos se rompieran en silencio.
 */
export function migrarProyecto(proyecto: Proyecto): Proyecto {
  return migrarASeccion(migrarCamposDe2B(migrarCapasSinOrden(proyecto)))
}

/**
 * El campo `orden` de las capas es nuevo en la Entrega 2A: un archivo `.topo`
 * guardado con la Entrega 1 trae capas sin él. Si se dejara así, `ordenarCapas`
 * restaría `a.orden - b.orden`, que da `NaN` para cada par — y aunque V8 hoy
 * conserva el orden original del array cuando el comparador da `NaN` (que es
 * el orden físico del paquete, porque así se guardaban antes de que existiera
 * el campo), la especificación del lenguaje no lo garantiza. Se renumera aquí
 * por la posición en el array, no con `renumerarCapas` de `@topo/core`
 * directamente: esa función empieza ordenando por el propio campo `orden`,
 * que es justo el que falta.
 */
function migrarCapasSinOrden(proyecto: Proyecto): Proyecto {
  const faltaOrden = proyecto.capas.some((capa) => typeof capa.orden !== 'number')
  if (!faltaOrden) return proyecto

  return {
    ...proyecto,
    capas: proyecto.capas.map((capa, indice) => ({ ...capa, orden: indice })),
  }
}

/** Tolerancia de partida para una capa que viene de un archivo anterior a la 2B. */
const TOLERANCIA_POR_DEFECTO_MM = 20

/**
 * `espesor` y `toleranciaMm` son nuevos en la Entrega 2B, y `rasante` en la
 * calle también. Un archivo anterior no los trae.
 *
 * El espesor arranca en cero **a propósito**: inventar uno sería peor que no
 * tenerlo, porque la cota teórica de todas las capas de debajo saldría movida
 * sin que nadie lo hubiera decidido. La pantalla de Proyecto avisa de las
 * capas que están así (`VistaProyecto`, aviso bajo la lista de capas).
 */
function migrarCamposDe2B(proyecto: Proyecto): Proyecto {
  return {
    ...proyecto,
    capas: proyecto.capas.map((capa) => ({
      ...capa,
      espesor: typeof capa.espesor === 'number' ? capa.espesor : 0,
      toleranciaMm:
        typeof capa.toleranciaMm === 'number' ? capa.toleranciaMm : TOLERANCIA_POR_DEFECTO_MM,
    })),
    calles: proyecto.calles.map((calle) => ({
      ...calle,
      rasante: calle.rasante ?? null,
    })),
  }
}

// ---------- Migración a la sección declarada ----------
//
// La rama vivió dos formas anteriores a la sección, no una:
//
// 1. La más vieja: la calle no tenía sus propios puntos, apuntaba por
//    `plantillaId` a una `Plantilla` compartida del proyecto, y cada salida a
//    campo era una `Campania` suelta de `proyecto.campanias`, no de su calle.
// 2. La intermedia, entre el catálogo de conceptos y la sección declarada: la
//    calle ya tenía sus propios `puntos: PuntoCalle[]` (concepto, código,
//    distancia) y sus `nivelaciones` ya en la forma de hoy —no es hipotética,
//    es la forma que tuvo el modelo en esta misma rama entre dos commits, y
//    la app se llegó a abrir con ella—.
//
// Las dos podían convivir con un `proyecto.catalogo` de códigos que el
// usuario hubiera enseñado a mano, aparte de sus puntos declarados. Ninguno
// de estos tipos existe ya en el modelo en marcha (`@topo/core`): se
// declaran aquí, sueltos, solo para poder leer con seguridad de tipos un
// `.topo` guardado con alguna de esas dos formas.

interface ElementoPlantillaAntiguo {
  clave: string
  etiqueta?: string
  /** Metros desde el eje. Negativo = izquierda. */
  offset: number
}

interface PlantillaAntigua {
  id: Id
  nombre: string
  elementos: ElementoPlantillaAntiguo[]
}

interface CampaniaAntigua {
  id: Id
  fecha: string
  calleId: Id
  capaId: Id
  bmInicialId: Id
  estaciones: Estacion[]
  cierre: ConfiguracionCierre
}

/** `codigos` va normalizado, código → concepto, igual que lo dejaba el catálogo viejo. */
interface CatalogoAntiguo {
  codigos: Record<string, string>
}

/** La forma más vieja: sin puntos propios, con una plantilla compartida por id. */
interface CalleConPlantilla {
  id: Id
  nombre: string
  plantillaId?: Id
  rasante: Rasante | null
}

/** Un punto de la calle en el modelo intermedio: concepto ya lleva el lado dentro (`bordeIzq`). */
interface PuntoCalleAntiguo {
  concepto: string
  codigo: string
  distancia: number
}

/** La forma intermedia: puntos y nivelaciones propios, sin `seccion` todavía. */
interface CalleConPuntos {
  id: Id
  nombre: string
  puntos: PuntoCalleAntiguo[]
  nivelaciones: Nivelacion[]
  rasante: Rasante | null
}

type CalleVieja = CalleConPlantilla | CalleConPuntos

interface ProyectoAntiguo {
  version: 1
  meta: MetaProyecto
  bms: BM[]
  plantillas?: PlantillaAntigua[]
  calles: (Calle | CalleVieja)[]
  capas: Capa[]
  campanias?: CampaniaAntigua[]
  catalogo?: CatalogoAntiguo
}

/** Una calle sin `seccion` es una calle de alguna de las dos formas anteriores: se detecta por forma, no por versión. */
function esCalleVieja(calle: Calle | CalleVieja): calle is CalleVieja {
  return !('seccion' in calle)
}

/** Entre las viejas, la que ya tenía sus propios puntos declarados (el modelo intermedio). */
function esCalleConPuntos(calle: CalleVieja): calle is CalleConPuntos {
  return Array.isArray((calle as Partial<CalleConPuntos>).puntos)
}

/**
 * A qué punto de la sección va cada concepto viejo —el de un `PuntoCalle` o
 * el que el catálogo hubiera aprendido para un código—: el lado salía del
 * propio concepto (`bordeIzq` es izquierda), a diferencia de hoy, que sale
 * del signo de la distancia. `progresiva` no tiene punto: su código va a las
 * palabras de la progresiva de la sección.
 */
const DESTINO_DE_CONCEPTO: Record<string, { rol: Rol; lado: Lado } | 'progresiva'> = {
  progresiva: 'progresiva',
  eje: { rol: 'eje', lado: 'eje' },
  bordeIzq: { rol: 'bordeCalzada', lado: 'izquierda' },
  bordeDer: { rol: 'bordeCalzada', lado: 'derecha' },
  sardinelIzq: { rol: 'sardinel', lado: 'izquierda' },
  sardinelDer: { rol: 'sardinel', lado: 'derecha' },
  veredaIzq: { rol: 'vereda', lado: 'izquierda' },
  veredaDer: { rol: 'vereda', lado: 'derecha' },
}

/** Los roles de nombre femenino: «Vereda izquierda», pero «Sardinel izquierdo». Igual criterio que `estado/almacen.ts`. */
const ROLES_FEMENINOS: readonly Rol[] = ['vereda', 'cuneta']

/** Cómo se llama un punto migrado sin nombre propio: su rol y el lado donde cayó, en español. */
function nombreDePuntoMigrado(rol: Rol, distancia: number): string {
  const lado = ladoDe(distancia)
  if (lado === 'eje') return ETIQUETA_ROL[rol]

  const femenino = ROLES_FEMENINOS.includes(rol)
  const izquierda = femenino ? 'izquierda' : 'izquierdo'
  const derecha = femenino ? 'derecha' : 'derecho'
  return `${ETIQUETA_ROL[rol]} ${lado === 'izquierda' ? izquierda : derecha}`
}

/**
 * Construye la sección de una calle con plantilla, y de paso el mapa que van
 * a necesitar sus lecturas guardadas: de la clave de cada elemento de la
 * plantilla al id del punto nuevo que le corresponde. Sin ese mapa, las
 * lecturas quedarían apuntando a una columna que ya no existe.
 */
function construirSeccionDesdePlantilla(
  calle: CalleConPlantilla,
  proyecto: ProyectoAntiguo,
): { seccion: Seccion; claveANuevoId: Map<string, string> } {
  const plantilla = proyecto.plantillas?.find((p) => p.id === calle.plantillaId)

  if (!plantilla || plantilla.elementos.length === 0) {
    // Antes se quedaba sin puntos: una distancia inventada movería todas las
    // cotas teóricas de la calle. Ahora arranca de fábrica porque el aviso de
    // «distancias de fábrica» ya impide que se lean como medidas. Trata igual
    // la plantilla ausente y la plantilla vacía: el resultado práctico —una
    // calle sin un solo punto declarado— es el mismo.
    console.warn(
      `La calle "${calle.nombre}" ${plantilla ? 'tenía una plantilla guardada sin ningún punto' : 'no tenía una plantilla guardada'}` +
        ': arranca con la sección de fábrica, con todas sus distancias orientativas hasta que se midan de nuevo.',
    )

    // La sección de fábrica ya declara las palabras típicas de cada punto
    // ('BOR-I' en el borde izquierdo, 'EJE' en el eje…): resolver la clave
    // vieja contra ellas no es adivinar, es leer una correspondencia que ya
    // está escrita. Sin esto, una plantilla borrada después de medir dejaría
    // huérfana cada lectura de la calle, aunque su código fuera uno de
    // fábrica de sobra reconocible.
    //
    // Pero la fábrica también declara palabras genéricas en dos puntos a la
    // vez: 'BORDE', 'SARDINEL' y 'VEREDA' están en los dos lados. Si el mapa
    // se armara punto por punto, el del lado derecho pisaría siempre al del
    // izquierdo (van de izquierda a derecha), y una lectura con
    // `elementoClave: 'VEREDA'` se remaparía siempre a la vereda derecha, con
    // su distancia, aunque la medida fuera de la izquierda —sin ningún
    // aviso, porque `remaparLectura` la daría por resuelta con éxito—. Eso no
    // es leer una correspondencia declarada, es adivinar un lado. Por eso se
    // cuenta primero cuántos puntos distintos declaran cada palabra, y solo
    // entra en el mapa la que sea de un único punto: la ambigua se deja
    // fuera, y la lectura que la use queda huérfana y anotada, como
    // cualquier otra que no se pueda traducir.
    const fabricaDeRespaldo = seccionDeFabrica()
    const puntosPorPalabra = new Map<string, Set<string>>()
    for (const punto of fabricaDeRespaldo.puntos) {
      for (const palabra of punto.palabras) {
        const clave = normalizarPalabra(palabra)
        const puntos = puntosPorPalabra.get(clave) ?? new Set<string>()
        puntos.add(punto.id)
        puntosPorPalabra.set(clave, puntos)
      }
    }
    const claveDeRespaldo = new Map<string, string>()
    for (const [clave, puntos] of puntosPorPalabra) {
      if (puntos.size === 1) claveDeRespaldo.set(clave, [...puntos][0]!)
    }
    return { seccion: fabricaDeRespaldo, claveANuevoId: claveDeRespaldo }
  }

  const claveANuevoId = new Map<string, string>()
  const fabrica = seccionDeFabrica()
  const puntos: PuntoSeccion[] = plantilla.elementos.map((elemento) => {
    const id = nuevoId('p')
    const puntoDeFabricaCoincidente = fabrica.puntos.find((p) => esPalabraDe(p.palabras, elemento.clave))

    if (!puntoDeFabricaCoincidente) {
      console.warn(
        `La calle "${calle.nombre}" tenía un punto de plantilla con la clave "${elemento.clave}"` +
          ' que no se reconoce como ningún punto conocido: entra como «Otro» en vez de adivinar cuál es.',
      )
    }

    claveANuevoId.set(normalizarPalabra(elemento.clave), id)

    return {
      id,
      rol: puntoDeFabricaCoincidente?.rol ?? 'otro',
      nombre: elemento.etiqueta || elemento.clave,
      distancia: elemento.offset,
      // Son medidas que Max puso en su plantilla: decir que las puso la app
      // sería mentir en pantalla.
      distanciaDeFabrica: false,
      palabras: [elemento.clave],
    }
  })

  const seccion: Seccion = {
    puntos,
    palabrasProgresiva: fabrica.palabrasProgresiva,
    palabrasPuntoControl: fabrica.palabrasPuntoControl,
    palabrasReferencia: fabrica.palabrasReferencia,
  }

  return { seccion, claveANuevoId }
}

/**
 * Construye la sección de una calle del modelo intermedio —la que ya tenía
 * sus propios `puntos: PuntoCalle[]`— y el mapa de cada código viejo al id
 * del punto nuevo que le corresponde. El rol sale del concepto quitándole el
 * lado (`bordeIzq` y `bordeDer` son los dos `bordeCalzada`); el lado ya lo
 * lleva el signo de `distancia`, que se conserva tal cual.
 */
function construirSeccionDesdePuntos(
  calle: CalleConPuntos,
): { seccion: Seccion; claveANuevoId: Map<string, string> } {
  const claveANuevoId = new Map<string, string>()

  const puntos: PuntoSeccion[] = calle.puntos.map((puntoViejo) => {
    const id = nuevoId('p')
    const destino = DESTINO_DE_CONCEPTO[puntoViejo.concepto]
    const rolReconocido = destino && destino !== 'progresiva' ? destino.rol : null

    if (!rolReconocido) {
      console.warn(
        `La calle "${calle.nombre}" tenía un punto con el concepto "${puntoViejo.concepto}", que no` +
          ' corresponde a ningún rol de la sección: entra como «Otro» en vez de adivinar cuál es.',
      )
    }

    const rol: Rol = rolReconocido ?? 'otro'
    claveANuevoId.set(normalizarPalabra(puntoViejo.codigo), id)

    return {
      id,
      rol,
      nombre: nombreDePuntoMigrado(rol, puntoViejo.distancia),
      distancia: puntoViejo.distancia,
      // Son medidas que Max puso: decir que las puso la app sería mentir en pantalla.
      distanciaDeFabrica: false,
      palabras: [puntoViejo.codigo],
    }
  })

  const fabrica = seccionDeFabrica()
  const seccion: Seccion = {
    puntos,
    palabrasProgresiva: fabrica.palabrasProgresiva,
    palabrasPuntoControl: fabrica.palabrasPuntoControl,
    palabrasReferencia: fabrica.palabrasReferencia,
  }

  return { seccion, claveANuevoId }
}

/**
 * Reparte los códigos que el catálogo viejo hubiera aprendido como palabras
 * de sus puntos (o de la progresiva, si el concepto es ese), y extiende
 * `claveANuevoId` con ellos. Vale para las dos formas antiguas: las dos
 * podían convivir con un `proyecto.catalogo`.
 */
function aplicarCatalogoAntiguo(
  seccion: Seccion,
  claveANuevoId: Map<string, string>,
  catalogo: CatalogoAntiguo | undefined,
  nombreCalle: string,
): Seccion {
  if (!catalogo) return seccion

  let resultado = seccion
  for (const [codigo, concepto] of Object.entries(catalogo.codigos)) {
    const destino = DESTINO_DE_CONCEPTO[concepto]

    if (destino === 'progresiva') {
      // No es la clave de ningún punto: no entra en claveANuevoId. Una
      // lectura no apunta jamás a la columna de progresivas.
      if (!esPalabraDe(resultado.palabrasProgresiva, codigo)) {
        resultado = { ...resultado, palabrasProgresiva: [...resultado.palabrasProgresiva, codigo] }
      }
      continue
    }

    const punto = destino
      ? resultado.puntos.find((p) => p.rol === destino.rol && ladoDe(p.distancia) === destino.lado)
      : undefined

    if (!punto) {
      // No se pierde en silencio: se anota y se sigue. Si alguna lectura
      // guardada usaba este código, se conserva igual y avisa aparte, al
      // remapear la lectura.
      console.warn(
        `La calle "${nombreCalle}" tenía en su catálogo el código "${codigo}" aprendido, pero el punto` +
          ' al que pertenece ya no está en la sección migrada: su palabra no se pudo colocar en ningún punto.',
      )
      continue
    }

    resultado = anadirPalabra(resultado, punto.id, codigo)
    // Normalizado, igual que los otros dos `set` de este mapa: el `get` de
    // `remaparLectura` siempre normaliza, así que si esta clave entrara cruda
    // una lectura con el código en otra mayúscula quedaría huérfana sin motivo.
    claveANuevoId.set(normalizarPalabra(codigo), punto.id)
  }
  return resultado
}

/** Traslada una lectura al modelo nuevo: solo cambia a qué columna apunta, nunca cuánto vale. */
function remaparLectura(lectura: Lectura, claveANuevoId: Map<string, string>, nombreCalle: string): Lectura {
  if (lectura.destino.tipo !== 'celda') return lectura

  const claveVieja = lectura.destino.celda.elementoClave
  const nuevoIdDePunto = claveANuevoId.get(normalizarPalabra(claveVieja))

  if (!nuevoIdDePunto) {
    // Ni se tira ni se inventa un punto: se deja con su clave vieja y se
    // anota. Perder una lectura de campo en silencio es lo peor que puede
    // pasar aquí.
    console.warn(
      `La calle "${nombreCalle}" tiene una lectura guardada que apuntaba a la columna "${claveVieja}",` +
        ' que ya no se reconoce como ningún punto de la sección migrada. Se conserva con su valor,' +
        ' pero hay que revisar a qué punto pertenece.',
    )
    return lectura
  }

  return {
    ...lectura,
    destino: { tipo: 'celda', celda: { ...lectura.destino.celda, elementoClave: nuevoIdDePunto } },
  }
}

/** Remapea las lecturas de un grupo de estaciones. Común a las tomas que nacen de una campaña y a las que ya eran tomas. */
function remaparEstaciones(estaciones: Estacion[], claveANuevoId: Map<string, string>, nombreCalle: string): Estacion[] {
  return estaciones.map((estacion) => ({
    ...estacion,
    vistaAtras: remaparLectura(estacion.vistaAtras, claveANuevoId, nombreCalle),
    intermedias: estacion.intermedias.map((lectura) => remaparLectura(lectura, claveANuevoId, nombreCalle)),
    ...(estacion.vistaAdelante
      ? { vistaAdelante: remaparLectura(estacion.vistaAdelante, claveANuevoId, nombreCalle) }
      : {}),
  }))
}

/** Una campaña vieja, con sus lecturas ya apuntando a los puntos nuevos, es una toma. */
function construirTomaMigrada(
  campania: CampaniaAntigua,
  claveANuevoId: Map<string, string>,
  nombreCalle: string,
): Toma {
  return {
    id: campania.id,
    fecha: campania.fecha,
    capaId: campania.capaId,
    bmInicialId: campania.bmInicialId,
    cierre: campania.cierre,
    estaciones: remaparEstaciones(campania.estaciones, claveANuevoId, nombreCalle),
  }
}

/** Una toma que ya era toma (modelo intermedio): se conserva entera, solo con sus lecturas remapeadas. */
function remaparToma(toma: Toma, claveANuevoId: Map<string, string>, nombreCalle: string): Toma {
  return { ...toma, estaciones: remaparEstaciones(toma.estaciones, claveANuevoId, nombreCalle) }
}

/**
 * Avisa de las campañas que ninguna calle reclamó: o su `calleId` no
 * corresponde a ninguna calle del proyecto —la calle se borró sin arrastrar
 * sus campañas, que era el sitio clásico donde se acumulaban huérfanas si
 * borrar una calle no hacía cascada—, o el proyecto no tenía ninguna calle
 * capaz de reclamarlas. Perder un día entero de campo, con todas sus
 * estaciones y lecturas, sin decir nada, es exactamente lo que esta
 * migración existe para impedir.
 */
function avisarDeCampaniasHuerfanas(campanias: CampaniaAntigua[], consumidas: Set<Id>): void {
  const huerfanas = campanias.filter((c) => !consumidas.has(c.id))
  if (huerfanas.length === 0) return

  const singular = huerfanas.length === 1
  const nombres = huerfanas.map((c) => `${c.fecha} (calle "${c.calleId}")`)

  console.warn(
    `Hay ${huerfanas.length} ${singular ? 'campaña guardada' : 'campañas guardadas'} que no ` +
      `${singular ? 'se pudo colocar' : 'se pudieron colocar'} en ninguna calle del proyecto, y no ` +
      `${singular ? 'se migró' : 'se migraron'}: ${nombres.slice(0, 5).join('; ')}${nombres.length > 5 ? '…' : ''}. ` +
      'Puede que la calle a la que pertenecían se haya borrado.',
  )
}

/**
 * Trae al modelo de la sección un proyecto guardado con alguna de las dos
 * formas anteriores. Con plantilla: la plantilla compartida de la calle se
 * convierte en su propia sección, y cada campaña —antes suelta en
 * `proyecto.campanias`— pasa a ser una nivelación de una sola toma de su
 * calle. Con puntos propios (el modelo intermedio): sus `PuntoCalle` se
 * convierten en `PuntoSeccion` y sus nivelaciones, que ya tenían la forma de
 * hoy, se conservan con las lecturas remapeadas. En los dos casos, el
 * catálogo de códigos aprendidos —si lo hay— se reparte como palabras de sus
 * puntos.
 *
 * Se detecta por forma, no por número de versión, igual que
 * `migrarCapasSinOrden` y `migrarCamposDe2B`: una calle sin `seccion` es una
 * calle vieja, y entre las viejas, la que trae `puntos` es la intermedia.
 *
 * La regla que manda en toda la función: si algo no se puede traducir, se
 * anota con `console.warn` —que es lo único disponible aquí para avisar sin
 * tirar el dato— y nunca se tira ni se inventa.
 */
function migrarASeccion(proyectoBruto: Proyecto): Proyecto {
  const proyecto = proyectoBruto as unknown as ProyectoAntiguo
  const campanias = proyecto.campanias ?? []

  if (!proyecto.calles.some(esCalleVieja)) {
    // Nada que migrar en las calles, pero si el proyecto trae campañas
    // sueltas de todos modos —campo fantasma que la app ya no lee—, no se
    // sale en silencio.
    avisarDeCampaniasHuerfanas(campanias, new Set())
    return proyectoBruto
  }

  const campaniasConsumidas = new Set<Id>()
  let resultado: Proyecto = {
    version: proyectoBruto.version,
    meta: proyectoBruto.meta,
    bms: proyectoBruto.bms,
    capas: proyectoBruto.capas,
    calles: [],
  }

  for (const calleBruta of proyecto.calles) {
    if (!esCalleVieja(calleBruta)) {
      resultado = { ...resultado, calles: [...resultado.calles, calleBruta] }
      continue
    }

    if (esCalleConPuntos(calleBruta)) {
      const construida = construirSeccionDesdePuntos(calleBruta)
      const seccion = aplicarCatalogoAntiguo(
        construida.seccion,
        construida.claveANuevoId,
        proyecto.catalogo,
        calleBruta.nombre,
      )

      const calleNueva: Calle = {
        id: calleBruta.id,
        nombre: calleBruta.nombre,
        seccion,
        nivelaciones: calleBruta.nivelaciones.map((nivelacion) => ({
          ...nivelacion,
          tomas: nivelacion.tomas.map((toma) => remaparToma(toma, construida.claveANuevoId, calleBruta.nombre)),
        })),
        rasante: calleBruta.rasante ?? null,
      }
      resultado = { ...resultado, calles: [...resultado.calles, calleNueva] }
      continue
    }

    const construida = construirSeccionDesdePlantilla(calleBruta, proyecto)
    const seccion = aplicarCatalogoAntiguo(
      construida.seccion,
      construida.claveANuevoId,
      proyecto.catalogo,
      calleBruta.nombre,
    )

    const calleNueva: Calle = {
      id: calleBruta.id,
      nombre: calleBruta.nombre,
      seccion,
      // `[]` a secas perdería en silencio unas nivelaciones que ya trajera
      // consigo una calle de esta forma —no es la forma habitual (esta trae
      // sus campañas aparte), pero si las trajera, no hay motivo para
      // tirarlas: las campañas de abajo se apilan encima con `agregarTomaComoNivelacion`.
      nivelaciones: (calleBruta as Partial<CalleConPuntos>).nivelaciones ?? [],
      rasante: calleBruta.rasante ?? null,
    }
    resultado = { ...resultado, calles: [...resultado.calles, calleNueva] }

    for (const campania of campanias.filter((c) => c.calleId === calleBruta.id)) {
      campaniasConsumidas.add(campania.id)
      const toma = construirTomaMigrada(campania, construida.claveANuevoId, calleBruta.nombre)
      resultado = agregarTomaComoNivelacion(resultado, calleBruta.id, toma, nuevoId('niv'))
    }
  }

  avisarDeCampaniasHuerfanas(campanias, campaniasConsumidas)
  return resultado
}

export function descargarTopo(proyecto: Proyecto): void {
  const datos = empaquetarProyecto(proyecto)
  const enlace = document.createElement('a')
  const url = URL.createObjectURL(new Blob([datos], { type: 'application/zip' }))

  enlace.href = url
  enlace.download = `${proyecto.meta.nombre.replace(/[^\w\s-]/g, '').trim() || 'proyecto'}.topo`
  enlace.click()
  URL.revokeObjectURL(url)
}

export async function abrirTopo(archivo: File): Promise<Proyecto> {
  const datos = new Uint8Array(await archivo.arrayBuffer())
  return desempaquetarProyecto(datos)
}
