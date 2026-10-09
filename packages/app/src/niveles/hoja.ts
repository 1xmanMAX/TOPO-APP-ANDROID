import {
  formatearProgresiva,
  lineaDeCapa,
  lineaDeConjunto,
  redondear3,
  separacionEn,
  type ConjuntoDeNivel,
  type HojaNiveles,
  type LineaNivel,
  type PanelDeNiveles,
  type Proyecto,
  type PuestaDeNivel,
  type PuntoLinea,
} from '@topo/core'
import { puestaParaMotor, puestaPorId, puestaUsable } from './puestas'

/*
 * La hoja de niveles de una calle: la herramienta «Pistas y veredas» de Max
 * tal cual la usa en campo —puestas, conjuntos escritos a mano por zona y
 * categoría, un replanteo para ver dónde cortar y dónde rellenar, y qué leer
 * en la mira—, guardada en el proyecto. Aquí va lo que no es pantalla, para
 * poder probarlo: las cuentas son del motor (`campo/niveles`).
 */

/** Las categorías que se proponen; se puede escribir cualquier otra. */
export const CATEGORIAS_DE_FABRICA = ['Terreno', 'Subrasante', 'Subbase', 'Base', 'Vereda', 'Sardinel', 'Carpeta', 'Replanteo']

export const CATEGORIA_REPLANTEO = 'Replanteo'

let contador = 0
/** Un id corto y único dentro de la hoja. */
export function nuevoIdNivel(prefijo: string): string {
  contador += 1
  return `${prefijo}-${Date.now().toString(36)}-${contador.toString(36)}`
}

/** Una hoja nueva, sin conjuntos (las puestas son del proyecto). */
export function hojaVacia(): HojaNiveles {
  return {
    conjuntos: [],
    unidad: 'm',
    mira: 'normal',
    minimoCm: 5,
  }
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function numero(valor: unknown, porDefecto: number): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : porDefecto
}

function texto(valor: unknown, porDefecto = ''): string {
  return typeof valor === 'string' ? valor : porDefecto
}

/**
 * La hoja tal como venga del archivo, lista para usarse: lo que no es una
 * hoja da null (y se quita), y dentro se descartan las puestas y conjuntos
 * sin id y se completan los campos que falten. Idempotente.
 */
export function hojaUsable(valor: unknown): HojaNiveles | null {
  if (!esObjeto(valor)) return null
  // Las puestas que traían las hojas viejas: `unirPuestas` las pasa después al proyecto.
  const puestas = Array.isArray(valor.puestas)
    ? valor.puestas.map(puestaUsable).filter((p): p is PuestaDeNivel => p !== null)
    : null
  const conjuntos = (Array.isArray(valor.conjuntos) ? valor.conjuntos : []).flatMap((c): ConjuntoDeNivel[] =>
    esObjeto(c) && typeof c.id === 'string'
      ? [
          {
            id: c.id,
            nombre: texto(c.nombre, 'Conjunto'),
            categoria: texto(c.categoria),
            tipo: c.tipo === 'cota' || c.tipo === 'medido' || c.tipo === 'derivado' ? c.tipo : 'lectura',
            texto: texto(c.texto),
            puestaId: typeof c.puestaId === 'string' ? c.puestaId : null,
            ajusteCm: numero(c.ajusteCm, 0),
            ...(typeof c.capaId === 'string' ? { capaId: c.capaId } : {}),
            ...(typeof c.puntoId === 'string' ? { puntoId: c.puntoId } : {}),
            ...(typeof c.origenId === 'string' ? { origenId: c.origenId } : {}),
          },
        ]
      : [],
  )
  const hoja: HojaNiveles = {
    ...(puestas ? { puestas } : {}),
    conjuntos,
    unidad: valor.unidad === 'cm' || valor.unidad === 'mm' ? valor.unidad : 'm',
    mira: valor.mira === 'invertida' ? 'invertida' : 'normal',
    minimoCm: numero(valor.minimoCm, 5),
  }
  if (Array.isArray(valor.paneles)) {
    hoja.paneles = valor.paneles.filter(esObjeto).map(
      (p): PanelDeNiveles => ({
        superiorId: typeof p.superiorId === 'string' ? p.superiorId : null,
        inferiorId: typeof p.inferiorId === 'string' ? p.inferiorId : null,
        modo: p.modo === 'corteRelleno' ? 'corteRelleno' : 'separacion',
      }),
    )
  }
  if (typeof valor.dosPaneles === 'boolean') hoja.dosPaneles = valor.dosPaneles
  if (esObjeto(valor.registrar)) {
    const r = valor.registrar
    hoja.registrar = {
      conjuntoId: typeof r.conjuntoId === 'string' ? r.conjuntoId : null,
      progresivas: texto(r.progresivas),
      puestaId: typeof r.puestaId === 'string' ? r.puestaId : null,
    }
  }
  return hoja
}

/** La puesta de un conjunto: la suya, o la primera del proyecto si la suya ya no existe. */
export function puestaDe(proyecto: Proyecto, c: ConjuntoDeNivel): PuestaDeNivel | null {
  return puestaPorId(proyecto, c.puestaId)
}

export interface LineaDeLaHoja {
  conjunto: ConjuntoDeNivel
  linea: LineaNivel
  avisos: string[]
}

/** Sube una línea entera unos cm, con su nombre: « (+2 cm)». */
function conAjuste(linea: LineaNivel, nombre: string, ajusteCm: number): LineaNivel {
  const signo = ajusteCm > 0 ? '+' : '−'
  return {
    nombre: ajusteCm ? `${nombre} (${signo}${Math.abs(ajusteCm)} cm)` : nombre,
    puntos: linea.puntos.map((p) => ({ ...p, cota: p.cota + ajusteCm / 100 })),
  }
}

/**
 * Las líneas de todos los conjuntos de la hoja de una calle:
 * - los escritos, con la lectura de la hoja (unidad y mira) y su puesta del proyecto;
 * - los `medido`, desde la libreta de esa calle en vivo (`lineaDeCapa`: compensada si cerró);
 * - los `derivado`, desde la línea de su origen más su ajuste (un origen que
 *   no existe, o una cadena que vuelve sobre sí misma, da una línea vacía con su aviso).
 */
export function lineasDeLaHoja(hoja: HojaNiveles, proyecto: Proyecto, calleId: string): Map<string, LineaDeLaHoja> {
  const instrumento = proyecto.instrumento
  const porId = new Map(hoja.conjuntos.map((c) => [c.id, c]))
  const salida = new Map<string, LineaDeLaHoja>()

  const resolver = (c: ConjuntoDeNivel, camino: Set<string>): LineaDeLaHoja => {
    const hecha = salida.get(c.id)
    if (hecha) return hecha
    let resultado: LineaDeLaHoja
    if (c.tipo === 'medido') {
      const leida = c.capaId && c.puntoId ? lineaDeCapa(proyecto, calleId, c.capaId, c.puntoId) : null
      resultado = leida
        ? { conjunto: c, linea: conAjuste(leida.linea, c.nombre, c.ajusteCm), avisos: leida.avisos }
        : { conjunto: c, linea: { nombre: c.nombre, puntos: [] }, avisos: [`${c.nombre}: la capa o el punto ya no existen en esta calle.`] }
    } else if (c.tipo === 'derivado') {
      const origen = c.origenId ? porId.get(c.origenId) : undefined
      if (!origen || camino.has(origen.id)) {
        resultado = {
          conjunto: c,
          linea: { nombre: c.nombre, puntos: [] },
          avisos: [origen ? `${c.nombre}: sigue a una línea que lo sigue a él.` : `${c.nombre}: la línea que seguía ya no existe.`],
        }
      } else {
        const base = resolver(origen, new Set([...camino, c.id]))
        resultado = { conjunto: c, linea: conAjuste(base.linea, c.nombre, c.ajusteCm), avisos: [] }
      }
    } else {
      const puesta = puestaDe(proyecto, c)
      const leida = lineaDeConjunto(
        {
          nombre: c.nombre,
          tipo: c.tipo,
          texto: c.texto,
          ajusteCm: c.ajusteCm,
          ...(c.tipo === 'lectura' && puesta ? { puesta: puestaParaMotor(puesta, proyecto) } : {}),
        },
        { unidad: hoja.unidad, mira: hoja.mira },
        instrumento,
      )
      resultado = { conjunto: c, ...leida }
    }
    salida.set(c.id, resultado)
    return resultado
  }

  for (const c of hoja.conjuntos) resolver(c, new Set([c.id]))
  // En el orden de la hoja.
  return new Map(hoja.conjuntos.map((c) => [c.id, salida.get(c.id)!]))
}

/** Cuántos renglones del conjunto se leen como punto (para el chip). */
export function contarPuntos(textoConjunto: string): number {
  return textoConjunto.split(/\r?\n/).filter((l) => l.trim() !== '').length
}

/** Cuántos puntos tiene la línea de un conjunto (los escritos, los enlazados y los derivados). */
export function puntosDeConjunto(c: ConjuntoDeNivel, lineas: Map<string, LineaDeLaHoja>): number {
  return c.tipo === 'medido' || c.tipo === 'derivado' ? (lineas.get(c.id)?.linea.puntos.length ?? 0) : contarPuntos(c.texto)
}

/** Una línea vuelta a escribir como cotas, «0+020, 3244.123» por renglón. */
export function textoDeCotas(puntos: Pick<PuntoLinea, 'progresiva' | 'cota'>[]): string {
  return puntos.map((p) => `${formatearProgresiva(p.progresiva)}, ${redondear3(p.cota).toFixed(3)}`).join('\n')
}

export interface LineaPorPendiente {
  desde: number
  hasta: number
  /** Cada cuántos metros va un punto. */
  cada: number
  /** Cota en `desde`. */
  cotaInicial: number
  /** %, positiva sube al avanzar. */
  pendientePct: number
}

/**
 * Un replanteo trazado a mano: arranca en una cota y sigue una pendiente,
 * con un punto cada tantos metros (y siempre el último). Vacío si los datos
 * no alcanzan (más de 2000 puntos tampoco: casi seguro un «cada» mal escrito).
 */
export function textoPorPendiente(l: LineaPorPendiente): string {
  const { desde, hasta, cada, cotaInicial, pendientePct } = l
  if (![desde, hasta, cada, cotaInicial, pendientePct].every(Number.isFinite) || cada <= 0 || hasta < desde) return ''
  if ((hasta - desde) / cada > 2000) return ''
  const xs: number[] = []
  for (let x = desde; x < hasta - 1e-9; x = redondear3(x + cada)) xs.push(x)
  xs.push(hasta)
  return textoDeCotas(xs.map((x) => ({ progresiva: x, cota: cotaInicial + ((x - desde) * pendientePct) / 100 })))
}

export interface PuntoCorteRelleno {
  progresiva: number
  /** Lo que hay (la línea medida). */
  cotaActual: number
  /** Lo que debe quedar (el replanteo). */
  cotaReplanteo: number
  /** Actual − replanteo, en metros: positivo hay que cortar, negativo rellenar. */
  diferencia: number
  comprobado: boolean
}

export interface CorteYRelleno {
  desde: number
  hasta: number
  puntos: PuntoCorteRelleno[]
  /** El punto donde más hay que cortar (null si en ninguno). */
  mayorCorte: PuntoCorteRelleno | null
  /** El punto donde más hay que rellenar (null si en ninguno). */
  mayorRelleno: PuntoCorteRelleno | null
}

/**
 * Cuánto cortar o rellenar para pasar de lo que hay al replanteo, en cada
 * punto de cualquiera de las dos líneas dentro del tramo que comparten. La
 * cota de cada línea en una progresiva sin punto propio sale interpolada por
 * el motor (`separacionEn`), igual que en la separación. Null si no se
 * superponen o alguna tiene menos de dos puntos.
 */
export function corteYRelleno(actual: LineaNivel, replanteo: LineaNivel): CorteYRelleno | null {
  const a = actual.puntos.filter((p) => Number.isFinite(p.progresiva) && Number.isFinite(p.cota))
  const r = replanteo.puntos.filter((p) => Number.isFinite(p.progresiva) && Number.isFinite(p.cota))
  if (a.length < 2 || r.length < 2) return null
  const extremos = (l: PuntoLinea[]) => [Math.min(...l.map((p) => p.progresiva)), Math.max(...l.map((p) => p.progresiva))]
  const [a0, a1] = extremos(a)
  const [r0, r1] = extremos(r)
  const desde = Math.max(a0!, r0!)
  const hasta = Math.min(a1!, r1!)
  if (desde > hasta) return null
  const xs = [...new Set([...a, ...r].map((p) => p.progresiva).filter((x) => x >= desde - 1e-9 && x <= hasta + 1e-9))].sort(
    (x, y) => x - y,
  )
  const puntos: PuntoCorteRelleno[] = []
  for (const x of xs) {
    const s = separacionEn(actual, replanteo, x, 0)
    if (!s) continue
    puntos.push({
      progresiva: x,
      cotaActual: s.cotaSuperior,
      cotaReplanteo: s.cotaInferior,
      diferencia: s.separacion,
      comprobado: s.comprobado,
    })
  }
  if (puntos.length === 0) return null
  const cortes = puntos.filter((p) => redondear3(p.diferencia) > 0)
  const rellenos = puntos.filter((p) => redondear3(p.diferencia) < 0)
  return {
    desde,
    hasta,
    puntos,
    mayorCorte: cortes.length ? cortes.reduce((m, p) => (p.diferencia > m.diferencia ? p : m)) : null,
    mayorRelleno: rellenos.length ? rellenos.reduce((m, p) => (p.diferencia < m.diferencia ? p : m)) : null,
  }
}

/** «corta 4.5 cm» / «rellena 2.0 cm» / «en cota». */
export function textoCorteRelleno(diferencia: number): string {
  const cm = Math.abs(redondear3(diferencia)) * 100
  if (cm < 0.05) return 'en cota'
  return `${diferencia > 0 ? 'corta' : 'rellena'} ${cm.toFixed(1)} cm`
}

/**
 * Las dos gráficas que se proponen si no hay nada elegido: la primera línea
 * contra la segunda y, si hay más, la tercera contra la cuarta (su ejemplo
 * era vereda / base izquierda y vereda / base derecha).
 */
export function panelesPorDefecto(hoja: HojaNiveles): PanelDeNiveles[] {
  const ids = hoja.conjuntos.map((c) => c.id)
  const de = (i: number) => ids[i] ?? null
  return [
    { superiorId: de(0), inferiorId: de(1), modo: 'separacion' },
    { superiorId: de(2) ?? de(0), inferiorId: de(3) ?? de(1), modo: 'separacion' },
  ]
}
