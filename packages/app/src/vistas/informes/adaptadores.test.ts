import type { Lectura, Proyecto, Toma } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { AVISO_SIN_COMPROBAR } from '../../informes'
import { enUnaLinea, textoDelPdf } from '../../informes/textoDelPdf'
import {
  FICHAS,
  datosControl,
  datosEspesores,
  datosEstacas,
  datosLibreta,
  datosMetrado,
  datosProtocolo,
  estaComprobado,
  fechaImpresa,
  generarPdf,
  nombreDeToma,
  notasDeCalle,
  prepararInforme,
  replanteoPorDefecto,
  SIN_CALLES,
  tomaPorDefecto,
  tomasDeAbajo,
  tomasDeCalle,
  type Alcance,
  type OpcionesInforme,
  type Preparado,
} from './adaptadores'
import { proyectoDeInformes, tomaSubrasante } from './proyectoDePrueba'

const SUB: Alcance = { calleId: 'c-1', tomaId: 'toma-sub' }
const BASE: Alcance = { calleId: 'c-1', tomaId: 'toma-base' }
const OPC: OpcionesInforme = { notas: false, firmas: false, hoy: new Date(2026, 9, 5) }

function listo<T>(p: Preparado<T>): T {
  if (!p.listo) throw new Error(`se esperaba listo y dijo: ${p.motivo}`)
  return p.datos
}

describe('tomas y textos', () => {
  it('lista las jornadas de una calle por fecha y elige la activa o la última', () => {
    const p = proyectoDeInformes()
    expect(tomasDeCalle(p, 'c-1').map((t) => t.toma.id)).toEqual(['toma-sub', 'toma-base'])
    expect(tomaPorDefecto(p, 'c-1', 'toma-sub')).toBe('toma-sub')
    expect(tomaPorDefecto(p, 'c-1', 'otra')).toBe('toma-base')
    expect(tomaPorDefecto(p, 'c-2', 'toma-sub')).toBeNull()
    expect(nombreDeToma(tomasDeCalle(p, 'c-1')[0]!)).toBe('SUBRASANTE · 19/08/2026 · Subrasante')
  })

  it('la capa de abajo es la inmediatamente inferior del paquete', () => {
    const p = proyectoDeInformes()
    expect(tomasDeAbajo(p, 'c-1', 'toma-base').map((t) => t.toma.id)).toEqual(['toma-sub'])
    expect(tomasDeAbajo(p, 'c-1', 'toma-sub')).toEqual([])
  })

  it('escribe la fecha como en la hoja y las notas por progresiva dentro del tramo', () => {
    expect(fechaImpresa('2026-08-19')).toBe('19/08/2026')
    expect(fechaImpresa('ayer')).toBe('ayer')
    const calle = proyectoDeInformes().calles[0]!
    expect(notasDeCalle(calle, {})).toEqual(['0+020: Buzón tapado', '0+040: Tapa de buzón a nivelar'])
    expect(notasDeCalle(calle, { desde: 30 })).toEqual(['0+040: Tapa de buzón a nivelar'])
  })

  it('hay una ficha por cada uno de los seis informes', () => {
    expect(FICHAS.map((f) => f.tipo)).toEqual(['protocolo', 'libreta', 'control', 'espesores', 'metrado', 'estacas'])
  })
})

describe('protocolo y control', () => {
  it('arma el encabezado desde la obra, la calle, la capa, la fecha y el BM', () => {
    const d = listo(datosProtocolo(proyectoDeInformes(), SUB, { ...OPC, supervisor: ' Ing. Pérez ' }))
    expect(d.encabezado).toEqual({
      obra: 'Pavimentación Jr. Ñaña',
      calle: 'Jr. Lima',
      capa: 'SUBRASANTE',
      fecha: '19/08/2026',
      tramo: '0+000 a 0+040',
      bm: { nombre: 'BM-1', cota: 101 },
      toleranciaMm: 20,
      topografo: 'Max Mamani',
      supervisor: 'Ing. Pérez',
    })
  })

  it('usa las cotas compensadas del motor y la cota de proyecto de la capa', () => {
    const d = listo(datosProtocolo(proyectoDeInformes(), SUB, OPC))
    expect(d.comprobado).toBe(true)
    expect(d.filas).toHaveLength(9)
    expect(d.filas[0]).toMatchObject({ progresiva: 0, punto: 'Borde izquierdo', cotaProyecto: 99.73 })
    expect(d.filas[0]!.cotaMedida).toBeCloseTo(99.731, 9)
    // 0+020 BD: 102.500 − 2.830 = 99.670, más 1 mm de compensación de la estación 1.
    const bd20 = d.filas.find((f) => f.progresiva === 20 && f.punto === 'Borde derecho')!
    expect(bd20.cotaProyecto).toBe(99.73)
    expect(bd20.cotaMedida).toBeCloseTo(99.671, 9)
    // 0+040 solo tiene el eje medido: los bordes quedan sin medir.
    expect(d.filas.filter((f) => f.progresiva === 40 && f.cotaMedida === null)).toHaveLength(2)
  })

  it('recorta al tramo y avisa si no queda ningún punto', () => {
    const d = listo(datosControl(proyectoDeInformes(), { ...SUB, desde: 10, hasta: 30 }, OPC))
    expect(new Set(d.filas.map((f) => f.progresiva))).toEqual(new Set([20]))
    expect(d.encabezado.tramo).toBe('0+020')
    const vacio = datosControl(proyectoDeInformes(), { ...SUB, desde: 50 }, OPC)
    expect(vacio).toEqual({ listo: false, motivo: 'No hay puntos en el tramo elegido.' })
  })

  it('una nivelación sin cerrar sale no comprobada, y el motor lo dice en los avisos', () => {
    const p = proyectoDeInformes({ subrasante: tomaSubrasante('abierto') })
    const r = datosProtocolo(p, SUB, OPC)
    expect(r.listo && r.datos.comprobado).toBe(false)
    expect(r.listo && r.avisos.join(' ')).toMatch(/NO COMPROBADAS/)
  })

  it('sin rasante no hay protocolo, y lo dice', () => {
    const r = datosProtocolo(proyectoDeInformes({ conRasante: false }), SUB, OPC)
    expect(r.listo).toBe(false)
    expect(!r.listo && r.motivo).toMatch(/no tiene rasante/)
  })

  it('una calle sin jornadas no se inventa nada', () => {
    const r = datosProtocolo(proyectoDeInformes(), { calleId: 'c-2', tomaId: null }, OPC)
    expect(r).toEqual({ listo: false, motivo: 'La calle «Jr. Puno» no tiene una jornada medida que usar.' })
  })

  it('las notas de campo y las firmas van solo si se piden', () => {
    const con = listo(datosProtocolo(proyectoDeInformes(), SUB, { ...OPC, notas: true, firmas: true }))
    expect(con.notas).toEqual(['0+020: Buzón tapado', '0+040: Tapa de buzón a nivelar'])
    expect(con.firmas).toBe(true)
    const sin = listo(datosProtocolo(proyectoDeInformes(), SUB, OPC))
    expect(sin.notas).toBeUndefined()
    expect(sin.firmas).toBe(false)
  })
})

describe('libreta con cierre', () => {
  it('escribe la libreta como a mano: el punto de cambio en una sola fila', () => {
    const d = listo(datosLibreta(proyectoDeInformes(), SUB, OPC))
    expect(d.filas.map((f) => f.punto)).toEqual([
      'BM-1',
      '0+000 Borde izquierdo',
      '0+000 Eje',
      '0+000 Borde derecho',
      '0+020 Borde izquierdo',
      '0+020 Eje',
      '0+020 Borde derecho',
      'PC1',
      '0+040 Eje',
      'BM-1',
    ])
    expect(d.filas[0]).toMatchObject({ atras: 1.5, alturaInstrumental: 102.5, cota: 101, cotaCompensada: 101 })
    expect(d.filas[7]).toEqual({
      punto: 'PC1',
      atras: 1.1,
      intermedia: null,
      adelante: 1.2,
      alturaInstrumental: 102.4,
      cota: 101.3,
      correccionMm: 1,
      cotaCompensada: 101.301,
    })
    expect(d.filas[9]).toMatchObject({ adelante: 1.402, cota: 100.998, correccionMm: 2, cotaCompensada: 101 })
  })

  it('el cierre sale del motor y la jornada queda comprobada', () => {
    const d = listo(datosLibreta(proyectoDeInformes(), SUB, OPC))
    expect(d.comprobado).toBe(true)
    expect(d.cierre).toMatchObject({ puntoDeCierre: 'BM-1', cotaConocida: 101, distanciaKm: 0.08 })
    // Sin redondear: el informe juzga el cierre con el error crudo, como la pantalla.
    expect(d.cierre!.cotaCalculada).toBeCloseTo(100.998, 9)
    expect(d.cierre!.toleranciaMm).toBeCloseTo(12 * Math.sqrt(0.08), 6)
    expect(d.cierre!.compensacion).toMatch(/2 estaciones/)
  })

  it('un circuito abierto no tiene cierre ni compensación', () => {
    const d = listo(datosLibreta(proyectoDeInformes({ subrasante: tomaSubrasante('abierto') }), SUB, OPC))
    expect(d.comprobado).toBe(false)
    expect(d.cierre).toBeNull()
    expect(d.filas.every((f) => f.correccionMm === null || f.correccionMm === undefined)).toBe(true)
  })

  it('la libreta va entera aunque se pida un tramo', () => {
    const d = listo(datosLibreta(proyectoDeInformes(), { ...SUB, desde: 30 }, OPC))
    expect(d.filas).toHaveLength(10)
    expect(d.encabezado.tramo).toBe('0+000 a 0+040')
  })
})

describe('espesores', () => {
  it('compara la base contra la subrasante con el espesor que pide el paquete', () => {
    const d = listo(datosEspesores(proyectoDeInformes(), BASE, OPC))
    expect(d.comprobado).toBe(true)
    expect(d.capaAbajo).toBe('SUBRASANTE (19/08/2026)')
    expect(d.capaArriba).toBe('BASE (25/08/2026)')
    expect(d.encabezado.capa).toBe('BASE sobre SUBRASANTE')
    expect(d.encabezado.toleranciaMm).toBe(10)
    expect(d.filas.find((f) => f.progresiva === 0 && f.punto === 'Eje')).toEqual({
      progresiva: 0,
      punto: 'Eje',
      cotaAbajo: 99.801,
      cotaArriba: 100,
      espesorProyecto: 0.2,
    })
  })

  it('si la capa de abajo no cerró, el espesor no está comprobado y se dice por qué', () => {
    const r = datosEspesores(proyectoDeInformes({ subrasante: tomaSubrasante('abierto') }), BASE, { ...OPC })
    const d = listo(r)
    expect(d.comprobado).toBe(false)
    expect(d.notas?.join(' ')).toContain('No comprobado: la capa de abajo (SUBRASANTE, 19/08/2026) es un circuito abierto')
    expect(r.listo && r.veredicto.estado).toBe('sinCerrar')
  })

  it('cada aviso dice de qué capa es y no se repite', () => {
    // Las dos jornadas abiertas: el motor da el mismo aviso para cada una.
    const abierta = (t: Toma): Toma => ({ ...t, cierre: { ...t.cierre, tipo: 'abierto' } })
    const p = proyectoDeInformes({ subrasante: tomaSubrasante('abierto') })
    const niv = p.calles[0]!.nivelaciones[1]!
    niv.tomas = [abierta(niv.tomas[0]!)]
    const r = datosEspesores(p, BASE, OPC)
    if (!r.listo) throw new Error(r.motivo)
    expect(new Set(r.avisos).size).toBe(r.avisos.length)
    expect(r.avisos.some((a) => a.startsWith('SUBRASANTE: '))).toBe(true)
    expect(r.avisos.some((a) => a.startsWith('BASE: '))).toBe(true)
    expect(r.veredicto.texto).toMatch(/la capa de abajo .*; la capa de arriba/)
  })

  it('sin capa medida debajo no hay espesor', () => {
    const r = datosEspesores(proyectoDeInformes(), SUB, OPC)
    expect(!r.listo && r.motivo).toMatch(/No hay ninguna capa medida debajo de SUBRASANTE/)
  })
})

describe('metrado', () => {
  it('saca áreas y volúmenes del motor: lo medido arriba, el proyecto abajo', () => {
    const d = listo(datosMetrado(proyectoDeInformes(), SUB, OPC))
    expect(d.comprobado).toBe(true)
    expect(d.secciones.map((s) => s.progresiva)).toEqual([0, 20, 40])
    // 0+040 tiene un solo punto medido: no hay área y el motor la descarta.
    expect(Number.isNaN(d.secciones[2]!.corte)).toBe(true)
    expect(d.descartadas).toEqual([{ indice: 2, progresiva: 40, motivo: 'area sin numero' }])
    expect(d.tramos).toHaveLength(1)
    expect(d.tramos[0]).toMatchObject({ desde: 0, hasta: 20 })
    // En 0+020 los bordes quedaron bajos: sobre todo relleno.
    expect(d.secciones[1]!.relleno).toBeGreaterThan(d.secciones[1]!.corte)
    expect(d.notas).toContain('Corte y relleno de SUBRASANTE medida contra su cota de proyecto.')
  })

  it('volúmenes sobre una nivelación sin cerrar no están comprobados', () => {
    const d = listo(datosMetrado(proyectoDeInformes({ subrasante: tomaSubrasante('abierto') }), SUB, OPC))
    expect(d.comprobado).toBe(false)
  })
})

describe('hoja de estacas', () => {
  it('sin vista atrás da la cota de proyecto y deja la lectura para el campo', () => {
    const d = listo(datosEstacas(proyectoDeInformes(), { ...SUB, capaReplanteoId: 'cap-base' }, OPC))
    expect(d.alturaInstrumental).toBeNull()
    expect(d.comprobado).toBe(false)
    expect(d.encabezado.fecha).toBe('05/10/2026')
    expect(d.encabezado.capa).toBe('BASE')
    expect(d.filas[0]).toMatchObject({ progresiva: 0, punto: 'Borde izquierdo', cotaProyecto: 99.93, lecturaObjetivo: null })
    expect(d.avisos?.[0]).toMatch(/Sin vista atrás al BM/)
    expect(d.mira).toEqual({ largoMira: 5, lecturaMin: 0.3, margenSuperior: 0.3 })
  })

  it('con vista atrás a un BM oficial calcula la lectura objetivo y queda comprobada', () => {
    const d = listo(
      datosEstacas(proyectoDeInformes(), { ...SUB, capaReplanteoId: 'cap-base', vistaAtrasBm: 1.2, progresivaEstacion: 0 }, OPC),
    )
    // AI = 101.000 + 1.200 = 102.200; eje de la base a 100.000 → 2.200.
    expect(d.alturaInstrumental).toBe(102.2)
    expect(d.comprobado).toBe(true)
    expect(d.filas.find((f) => f.progresiva === 0 && f.punto === 'Eje')?.lecturaObjetivo).toBe(2.2)
  })

  it('usa el largo de mira del instrumento del proyecto', () => {
    const p = { ...proyectoDeInformes(), instrumento: { largoMira: 4 } }
    const d = listo(datosEstacas(p, { ...SUB, vistaAtrasBm: 4.5 }, OPC))
    expect(d.alturaInstrumental).toBeNull()
    expect(d.avisos?.[0]).toMatch(/no puede ser de una mira de 4 m/)
    expect(d.mira?.largoMira).toBe(4)
  })
})

describe('prepararInforme y generarPdf', () => {
  it('cada informe sale como PDF con su nombre de archivo', () => {
    const p = proyectoDeInformes()
    for (const { tipo } of FICHAS) {
      const alcance = tipo === 'espesores' ? BASE : SUB
      const r = prepararInforme(tipo, p, alcance, OPC)
      if (!r.listo) throw new Error(`${tipo}: ${r.motivo}`)
      const bytes = generarPdf(r.informe)
      expect(new TextDecoder('latin1').decode(bytes.subarray(0, 5))).toBe('%PDF-')
      expect(r.nombreArchivo).toContain('Jr. Lima')
      expect(r.nombreArchivo).not.toMatch(/\//)
    }
  })

  it('el PDF de una nivelación sin cerrar lleva la franja de aviso', () => {
    const p = proyectoDeInformes({ subrasante: tomaSubrasante('abierto') })
    const r = prepararInforme('protocolo', p, SUB, OPC)
    if (!r.listo) throw new Error(r.motivo)
    expect(estaComprobado(r.informe)).toBe(false)
    expect(enUnaLinea(textoDelPdf(generarPdf(r.informe)).todo)).toContain(AVISO_SIN_COMPROBAR)
  })

  it('el PDF comprobado no lleva la franja y trae el encabezado de la obra', () => {
    const r = prepararInforme('protocolo', proyectoDeInformes(), SUB, OPC)
    if (!r.listo) throw new Error(r.motivo)
    const texto = enUnaLinea(textoDelPdf(generarPdf(r.informe)).todo)
    expect(texto).not.toContain(AVISO_SIN_COMPROBAR)
    expect(texto).toContain('Pavimentación Jr. Ñaña')
    expect(r.nombreArchivo).toBe('Protocolo de nivelación — Jr. Lima — SUBRASANTE — 19-08-2026')
  })
})

// ---------------------------------------------------------------------------
// Lo comprobado y por qué (revisión)
// ---------------------------------------------------------------------------

let k = 0
const lec = (destino: Lectura['destino'], valor: number): Lectura => ({ id: `r-${++k}`, destino, valor })
const alBm = (valor: number) => lec({ tipo: 'bm', bmId: 'bm-1' }, valor)
const enCelda = (progresiva: number, elementoClave: string, valor: number) =>
  lec({ tipo: 'celda', celda: { progresiva, elementoClave } }, valor)

/**
 * La subrasante, pero la estación 2 vuelve a arrancar en BM-1: el cierre
 * (0 mm) solo respalda la estación 2. Lo leído en la 1 no está comprobado.
 */
function tomaQueRearranca(): Toma {
  return {
    ...tomaSubrasante(),
    estaciones: [
      {
        id: 'r-1',
        vistaAtras: alBm(1.5),
        intermedias: [enCelda(0, 'p-eje', 2.7), enCelda(0, 'p-borde-i', 2.77), enCelda(0, 'p-borde-d', 2.775)],
        vistaAdelante: lec({ tipo: 'cambio', nombre: 'PC1' }, 1.2),
      },
      {
        id: 'r-2',
        vistaAtras: alBm(1.5),
        intermedias: [enCelda(20, 'p-eje', 2.69)],
        vistaAdelante: alBm(1.5),
      },
    ],
  }
}

/** La subrasante, pero llega a BM-1 con −50 mm: fuera de tolerancia. */
function tomaFueraDeTolerancia(): Toma {
  const t = tomaSubrasante()
  const e2 = t.estaciones[1]!
  return { ...t, estaciones: [t.estaciones[0]!, { ...e2, vistaAdelante: alBm(1.45) }] }
}

describe('veredicto: comprobado solo si lo impreso sale del circuito que cierra', () => {
  it('una nivelación que cierra da ✓ con el error y la tolerancia', () => {
    const r = datosProtocolo(proyectoDeInformes(), SUB, OPC)
    if (!r.listo) throw new Error(r.motivo)
    expect(r.veredicto.estado).toBe('comprobado')
    expect(r.veredicto.texto).toBe(
      'Comprobado: la nivelación cerró dentro de tolerancia (error −2.0 mm, tolerancia ±3.4 mm).',
    )
    expect(r.datos.notas).toBeUndefined()
  })

  it('si la toma vuelve a arrancar en un BM, lo de antes NO está comprobado aunque el cierre pase', () => {
    const p = proyectoDeInformes({ subrasante: tomaQueRearranca() })
    const preparados = [
      datosProtocolo(p, SUB, OPC),
      datosControl(p, SUB, OPC),
      datosMetrado(p, SUB, OPC),
      datosLibreta(p, SUB, OPC),
    ]
    for (const r of preparados) {
      if (!r.listo) throw new Error(r.motivo)
      expect(r.datos.comprobado).toBe(false)
      expect(r.veredicto.estado).toBe('sinCerrar')
      expect(r.veredicto.texto).toMatch(/estación 2 .* la estación 1 queda fuera del circuito/)
      // Y se dice en el PDF, no solo en la pantalla.
      expect(r.datos.notas).toContain(r.veredicto.texto)
    }
    const informe = prepararInforme('protocolo', p, SUB, OPC)
    if (!informe.listo) throw new Error(informe.motivo)
    const texto = enUnaLinea(textoDelPdf(generarPdf(informe.informe)).todo)
    expect(texto).toContain(AVISO_SIN_COMPROBAR)
  })

  it('fuera de tolerancia es una falla (✗), no un «sin cerrar»', () => {
    const r = datosProtocolo(proyectoDeInformes({ subrasante: tomaFueraDeTolerancia() }), SUB, OPC)
    if (!r.listo) throw new Error(r.motivo)
    expect(r.veredicto.estado).toBe('falla')
    expect(r.veredicto.texto).toMatch(/^No comprobado: la nivelación cerró fuera de tolerancia \(error −50\.0 mm/)
    expect(r.veredicto.texto).toMatch(/volver a nivelarla/)
  })

  it('un circuito abierto o sin vista al BM de cierre dice qué falta', () => {
    const abierta = datosProtocolo(proyectoDeInformes({ subrasante: tomaSubrasante('abierto') }), SUB, OPC)
    expect(abierta.listo && abierta.veredicto).toEqual({
      estado: 'sinCerrar',
      texto: 'No comprobado: la nivelación es un circuito abierto: no se cerró en un BM, así que nada la comprueba.',
    })
    const sinLlegar = tomaSubrasante('abierto')
    sinLlegar.cierre = { ...tomaSubrasante().cierre }
    const r = datosProtocolo(proyectoDeInformes({ subrasante: sinLlegar }), SUB, OPC)
    expect(r.listo && r.veredicto.texto).toMatch(/todavía no cierra: falta la vista adelante a BM-1/)
  })

  it('espesores: comprobado solo si las dos capas lo están', () => {
    const r = datosEspesores(proyectoDeInformes(), BASE, OPC)
    expect(r.listo && r.veredicto).toEqual({
      estado: 'comprobado',
      texto: 'Comprobado: las dos nivelaciones cerraron dentro de tolerancia (SUBRASANTE y BASE).',
    })
    const falla = datosEspesores(proyectoDeInformes({ subrasante: tomaFueraDeTolerancia() }), BASE, OPC)
    expect(falla.listo && falla.veredicto.estado).toBe('falla')
  })

  it('hoja de estacas: el veredicto habla de la altura instrumental, no de un cierre', () => {
    const p = proyectoDeInformes()
    const sin = datosEstacas(p, { ...SUB, capaReplanteoId: 'cap-base' }, OPC)
    expect(sin.listo && sin.veredicto.texto).toMatch(/^No comprobado: sin vista atrás al BM/)
    const con = datosEstacas(p, { ...SUB, capaReplanteoId: 'cap-base', vistaAtrasBm: 1.2 }, OPC)
    expect(con.listo && con.veredicto).toEqual({
      estado: 'comprobado',
      texto: 'Comprobado: la altura instrumental (102.200) sale del BM oficial BM-1.',
    })
    const auxiliar: Proyecto = { ...p, bms: [{ ...p.bms[0]!, tipo: 'auxiliar' }] }
    const aux = datosEstacas(auxiliar, { ...SUB, capaReplanteoId: 'cap-base', vistaAtrasBm: 1.2 }, OPC)
    if (!aux.listo) throw new Error(aux.motivo)
    expect(aux.datos.comprobado).toBe(false)
    expect(aux.veredicto.texto).toMatch(/BM-1, un BM auxiliar; plántala desde un BM oficial/)
    expect(aux.datos.notas).toContain(aux.veredicto.texto)
  })
})

describe('libreta: claves y tramo', () => {
  it('el punto de cambio se reconoce como lo hace el motor, aunque el destino venga con otro orden', () => {
    const t = tomaSubrasante()
    const e2 = t.estaciones[1]!
    // Como podría venir de un .topo migrado: las mismas claves en otro orden.
    const reordenado = { nombre: 'PC1', tipo: 'cambio' } as Lectura['destino']
    t.estaciones[1] = { ...e2, vistaAtras: { ...e2.vistaAtras, destino: reordenado } }
    const d = listo(datosLibreta(proyectoDeInformes({ subrasante: t }), SUB, OPC))
    expect(d.filas.filter((f) => f.punto === 'PC1')).toHaveLength(1)
  })

  it('las notas de campo de la libreta no se recortan por un tramo que no se ve', () => {
    const d = listo(datosLibreta(proyectoDeInformes(), { ...SUB, desde: 30 }, { ...OPC, notas: true }))
    expect(d.notas).toEqual(['0+020: Buzón tapado', '0+040: Tapa de buzón a nivelar'])
  })
})

describe('hoja de estacas: qué propone por defecto', () => {
  it('propone la capa que sigue a la última medida, con el BM de esa jornada', () => {
    const p = proyectoDeInformes({ conBase: false })
    expect(replanteoPorDefecto(p, 'c-1')).toEqual({
      capaId: 'cap-base',
      bmId: 'bm-1',
      razon: 'Se propone la capa que sigue a SUBRASANTE, medida el 19/08/2026, y el BM de arranque de esa jornada.',
    })
    const d = listo(datosEstacas(p, { calleId: 'c-1', tomaId: 'toma-sub' }, OPC))
    expect(d.encabezado.capa).toBe('BASE')
  })

  it('si todas las capas ya tienen jornada, propone la última y lo dice', () => {
    const r = replanteoPorDefecto(proyectoDeInformes(), 'c-1')
    expect(r.capaId).toBe('cap-base')
    expect(r.razon).toMatch(/^Todas las capas ya tienen jornada/)
  })

  it('una calle sin jornadas propone la primera capa del paquete', () => {
    expect(replanteoPorDefecto(proyectoDeInformes(), 'c-2')).toMatchObject({ capaId: 'cap-terreno', bmId: 'bm-1' })
  })
})

describe('proyectos a medias', () => {
  it('sin calles dice dónde se crean', () => {
    const p: Proyecto = { ...proyectoDeInformes(), calles: [] }
    for (const { tipo } of FICHAS) {
      expect(prepararInforme(tipo, p, { calleId: null, tomaId: null }, OPC)).toEqual({ listo: false, motivo: SIN_CALLES })
    }
  })

  it('sin bancos de nivel no hay jornada ni hoja de estacas, y lo dice', () => {
    const p: Proyecto = { ...proyectoDeInformes(), bms: [] }
    const r = datosProtocolo(p, SUB, OPC)
    expect(!r.listo && r.motivo).toMatch(/banco de nivel de arranque/)
    const e = datosEstacas(p, SUB, OPC)
    expect(!e.listo && e.motivo).toBe('El proyecto no tiene ningún banco de nivel: créalo en Obra.')
  })

  it('una jornada que el motor no puede calcular dice por qué', () => {
    const t = tomaSubrasante()
    const e2 = t.estaciones[1]!
    t.estaciones[1] = { ...e2, vistaAtras: { ...e2.vistaAtras, destino: { tipo: 'cambio', nombre: 'PC9' } } }
    const r = datosProtocolo(proyectoDeInformes({ subrasante: t }), SUB, OPC)
    expect(!r.listo && r.motivo).toMatch(/^No se pudo calcular la jornada: La estación 2 arranca en PC9/)
  })
})
