import type { Id } from '../modelo/ids'
import { mismaPalabra } from './palabras'
import { ETIQUETA_ROL, type Rol } from './roles'

export type Lado = 'izquierda' | 'eje' | 'derecha'

/**
 * Un punto que se mide a lo ancho de la calle.
 *
 * El lado no está en el rol ni en el nombre: sale del signo de `distancia`.
 * Así una misma palabra —«vereda»— puede declararse en los dos puntos, uno a
 * cada lado del eje, y `ladoDe` distingue cuál es cuál.
 */
export interface PuntoSeccion {
  id: Id
  rol: Rol
  /** Para mostrar, con el lado ya escrito dentro (p. ej. «Vereda izquierda»). */
  nombre: string
  /** Metros desde el eje. Negativo a la izquierda, positivo a la derecha. */
  distancia: number
  /** True mientras Max no la haya tocado: viene de la sección de fábrica. */
  distanciaDeFabrica: boolean
  /** Como se escribe este punto en la hoja de campo. Puede haber varias. */
  palabras: string[]
}

/**
 * La sección transversal de una calle: sus puntos, y las palabras que no son
 * puntos pero sí aparecen en la hoja. Viaja en el `.topo` de la calle, por lo
 * mismo que viajaba el catálogo: sin ella, reimportar la misma hoja daría
 * otro resultado.
 */
export interface Seccion {
  puntos: PuntoSeccion[]
  palabrasProgresiva: string[]
  palabrasPuntoControl: string[]
  palabrasReferencia: string[]
}

function puntoDeFabrica(
  id: Id, rol: Rol, nombre: string, distancia: number, palabras: string[],
): PuntoSeccion {
  return { id, rol, nombre, distancia, distanciaDeFabrica: true, palabras }
}

/**
 * La sección urbana típica con la que arranca una calle nueva: vereda,
 * sardinel, borde, eje, borde, sardinel, vereda. No es una imposición, es un
 * punto de partida que se edita entero.
 *
 * `IZQ` y `DER` no van de fábrica a propósito: son etiquetas de lado y nadie
 * sabe si en la hoja de alguien significan el borde o el sardinel. Se
 * asignan en la vista previa la primera vez que hacen falta.
 */
export function seccionDeFabrica(): Seccion {
  return {
    puntos: [
      puntoDeFabrica('p-vereda-i', 'vereda', 'Vereda izquierda', -5.15, ['VI', 'VER-I', 'VEREDA-IZQ', 'VEREDA']),
      puntoDeFabrica('p-sardinel-i', 'sardinel', 'Sardinel izquierdo', -3.65, ['SI', 'SAR-I', 'SARDINEL-IZQ', 'SARDINEL']),
      puntoDeFabrica('p-borde-i', 'bordeCalzada', 'Borde izquierdo', -3.5, ['BI', 'BOR-I', 'BORDE-IZQ', 'BORDE']),
      puntoDeFabrica('p-eje', 'eje', 'Eje', 0, ['EJE', 'CL', 'CENTRO']),
      puntoDeFabrica('p-borde-d', 'bordeCalzada', 'Borde derecho', 3.5, ['BD', 'BOR-D', 'BORDE-DER', 'BORDE']),
      puntoDeFabrica('p-sardinel-d', 'sardinel', 'Sardinel derecho', 3.65, ['SD', 'SAR-D', 'SARDINEL-DER', 'SARDINEL']),
      puntoDeFabrica('p-vereda-d', 'vereda', 'Vereda derecha', 5.15, ['VD', 'VER-D', 'VEREDA-DER', 'VEREDA']),
    ],
    palabrasProgresiva: ['PROG', 'PK', 'ABSCISA', 'EST', 'PROGRESIVA'],
    palabrasPuntoControl: ['PC', 'BM', 'PUNTO DE CONTROL'],
    palabrasReferencia: ['EXISTENTE', 'EXIST', 'REF'],
  }
}

/** El signo de la distancia da el lado; el cero es el eje. */
export function ladoDe(distancia: number): Lado {
  if (distancia < 0) return 'izquierda'
  if (distancia > 0) return 'derecha'
  return 'eje'
}

/** Los roles de nombre femenino: «Vereda izquierda», pero «Sardinel izquierdo». */
const ROLES_FEMENINOS: readonly Rol[] = ['vereda', 'cuneta']

/**
 * Con qué palabra empieza el nombre de un punto cuando su rol no se llama
 * igual de corto en los dos sitios donde se escribe.
 *
 * `ETIQUETA_ROL` nombra el **rol** cuando va solo —el selector de la pantalla
 * de la sección—, y ahí «Borde de calzada» dice exactamente lo que es. Pero al
 * **punto** se le llama «Borde izquierdo» en toda la app: es el nombre de los
 * siete de fábrica, el que viaja en cada celda de la grilla, y el que sale en
 * las tablas, en el corte y en lo que se exporta. Sin esta excepción, un punto
 * añadido a mano se llamaría «Borde de calzada izquierdo» y el mismo punto de
 * fábrica «Borde izquierdo»: dos nombres para lo mismo, que es justo lo que
 * esta función vino a impedir. Los demás roles no la necesitan —su etiqueta ya
 * es la palabra con la que se nombra el punto—, así que no se duplica la tabla
 * entera: solo se anota lo que de verdad se aparta.
 */
const PALABRA_DE_ROL: Partial<Record<Rol, string>> = {
  bordeCalzada: 'Borde',
}

/**
 * Cómo se llama un punto por su rol y el lado donde cayó, escrito en español
 * de verdad: el lado sale del signo de la distancia, igual que en el resto
 * del modelo, y un punto en el eje no lleva lado porque no lo tiene.
 *
 * Vive aquí por lo mismo que `palabraDePunto`: llegó a estar copiado
 * literalmente en dos sitios —el que bautiza un punto recién añadido en la
 * pantalla de la sección y el que bautiza un punto migrado de un `.topo`
 * guardado con el modelo viejo—, así que un cambio de criterio en el género o
 * en la palabra del lado habría hecho que la misma vereda se llamara de dos
 * maneras según por dónde hubiera entrado. Y tiene que dar el mismo nombre
 * que ya traen los puntos de `seccionDeFabrica`, o el punto de fábrica y el
 * añadido a mano se llamarían distinto en la misma tabla.
 */
export function nombreDePunto(rol: Rol, distancia: number): string {
  const palabra = PALABRA_DE_ROL[rol] ?? ETIQUETA_ROL[rol]
  const lado = ladoDe(distancia)
  if (lado === 'eje') return palabra

  const femenino = ROLES_FEMENINOS.includes(rol)
  const izquierda = femenino ? 'izquierda' : 'izquierdo'
  const derecha = femenino ? 'derecha' : 'derecho'

  return `${palabra} ${lado === 'izquierda' ? izquierda : derecha}`
}

/** Si alguna de las palabras de la lista nombra este texto, ya normalizado. */
export function esPalabraDe(palabras: string[], texto: string): boolean {
  return palabras.some((p) => mismaPalabra(p, texto))
}

/** Los puntos que usan esta palabra, en cualquier lado. Puede haber dos: uno por lado. */
export function puntosConPalabra(seccion: Seccion, palabra: string): PuntoSeccion[] {
  return seccion.puntos.filter((p) => esPalabraDe(p.palabras, palabra))
}

/** El punto que usa esta palabra en este lado, o null si ninguno la declara ahí. */
export function puntoPorPalabraYLado(seccion: Seccion, palabra: string, lado: Lado): PuntoSeccion | null {
  return puntosConPalabra(seccion, palabra).find((p) => ladoDe(p.distancia) === lado) ?? null
}

/**
 * Devuelve una sección nueva con la palabra añadida al punto indicado: la de
 * entrada no se toca. Si el punto ya la tenía —comparando ya normalizado—,
 * no la duplica.
 */
export function anadirPalabra(seccion: Seccion, puntoId: Id, palabra: string): Seccion {
  return {
    ...seccion,
    puntos: seccion.puntos.map((p) => {
      if (p.id !== puntoId) return p
      if (esPalabraDe(p.palabras, palabra)) return p
      return { ...p, palabras: [...p.palabras, palabra] }
    }),
  }
}

/**
 * True si QUEDA alguna distancia sin medir. Basta una para que el bombeo
 * entre dos puntos no sea de fiar: se necesitan los dos lados medidos.
 */
export function hayDistanciasDeFabrica(seccion: Seccion): boolean {
  return seccion.puntos.some((p) => p.distanciaDeFabrica)
}

/**
 * Con qué palabra se escribe este punto donde el espacio manda: la cabecera
 * de una tabla, el rótulo de 9 px del corte, la cabecera de lo que se
 * exporta. Es la primera de las suyas —texto del propio Max, que cabe donde
 * cabía el código viejo—, y si se quedó sin ninguna (las añade y las quita a
 * voluntad) cae al nombre largo, que es lo único que queda para enseñar.
 *
 * Vive aquí, junto al modelo, porque este respaldo llegó a estar copiado en
 * seis sitios: el día que uno cambiara de criterio, dos pantallas llamarían
 * distinto al mismo punto sin que nada lo avisara.
 */
export function palabraDePunto(punto: PuntoSeccion): string {
  return punto.palabras[0] ?? punto.nombre
}

/**
 * La palabra de cada punto de la sección, buscable por su id: para las
 * vistas que pintan muchas celdas y solo traen guardada la llave. Un id que
 * no esté aquí es una lectura de un punto que ya no está en la sección —el
 * mapa no lo inventa, y quien lo busque decide qué decir en su lugar.
 */
export function palabrasDeSeccion(seccion: Seccion): Map<Id, string> {
  return new Map(seccion.puntos.map((punto) => [punto.id, palabraDePunto(punto)]))
}
