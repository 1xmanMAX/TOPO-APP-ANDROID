import { describe, expect, it } from 'vitest'
import type { BM, Estacion, Toma } from '../modelo/tipos'
import { estadoCierreEnVivo, simularCierre } from './cierreEnVivo'

const BM_A: BM = { id: 'bm-a', nombre: 'BM-A', cota: 3245.18, tipo: 'oficial', descripcion: '' }

/**
 * Circuito de dos estaciones que sale y vuelve a BM-A (3245.180):
 *   E1: atrás BM-A 1.500 → AI1 = 3245.180 + 1.500 = 3246.680
 *       intermedia 0+010 eje 1.200; adelante PC-1 1.043 → PC-1 = 3246.680 − 1.043 = 3245.637
 *   E2: atrás PC-1 0.500 → AI2 = 3245.637 + 0.500 = 3246.137
 *       intermedia 0+020 eje 0.800; adelante BM-A 0.961 → 3246.137 − 0.961 = 3245.176
 *   Error = 3245.176 − 3245.180 = −0.004 m = −4 mm.
 * Lecturas: 3 + 3 = 6.
 */
function tomaCircuito(): Toma {
  const estaciones: Estacion[] = [
    {
      id: 'e1',
      vistaAtras: { id: 'l1', destino: { tipo: 'bm', bmId: 'bm-a' }, valor: 1.5 },
      intermedias: [
        { id: 'l2', destino: { tipo: 'celda', celda: { progresiva: 10, elementoClave: 'eje' } }, valor: 1.2 },
      ],
      vistaAdelante: { id: 'l3', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 1.043 },
    },
    {
      id: 'e2',
      vistaAtras: { id: 'l4', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 0.5 },
      intermedias: [
        { id: 'l5', destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'eje' } }, valor: 0.8 },
      ],
      vistaAdelante: { id: 'l6', destino: { tipo: 'bm', bmId: 'bm-a' }, valor: 0.961 },
    },
  ]
  return {
    id: 't1',
    fecha: '2026-10-05',
    capaId: 'capa-0',
    bmInicialId: 'bm-a',
    estaciones,
    cierre: {
      tipo: 'cerrado',
      bmFinalId: 'bm-a',
      longitudK: 0.3,
      longitudKAuto: false,
      clase: 'tercerOrden',
      coeficiente: 12,
    },
  }
}

/** El mismo circuito antes de visar el BM: la última estación aún sin vista adelante. */
function tomaAbierta(): Toma {
  const toma = tomaCircuito()
  delete toma.estaciones[1]!.vistaAdelante
  return toma
}

describe('estadoCierreEnVivo', () => {
  it('mientras no se vise el BM, el circuito está abierto y todo queda sin comprobar', () => {
    const estado = estadoCierreEnVivo(tomaAbierta(), [BM_A])

    // 3 lecturas en E1 + 2 en E2 (falta la vista adelante) = 5.
    expect(estado.circuito).toBe('abierto')
    expect(estado.lecturas).toBe(5)
    expect(estado.lecturasSinComprobar).toBe(5)
    expect(estado.lecturasPendientes).toBe(0)
    expect(estado.estaciones).toBe(2)
    expect(estado.cierre).toBeNull()
    expect(estado.motivo).toBe('Falta visar el BM de cierre (BM-A) desde la última estación.')
    expect(estado.texto).toBe('Circuito abierto · 5 lecturas sin comprobar')
  })

  it('al visar el BM, cierra con −4 mm dentro de 12·√0.30 = 6.6 mm', () => {
    const estado = estadoCierreEnVivo(tomaCircuito(), [BM_A])

    expect(estado.circuito).toBe('cerrado')
    expect(estado.lecturas).toBe(6)
    expect(estado.lecturasSinComprobar).toBe(0)
    expect(estado.cierre).not.toBeNull()
    const cierre = estado.cierre!
    // 3245.176 − 3245.180 = −0.004 m
    expect(cierre.cotaCalculada).toBeCloseTo(3245.176, 6)
    expect(cierre.cotaConocida).toBe(3245.18)
    expect(cierre.errorMm).toBeCloseTo(-4, 6)
    // 12 · √0.30 = 12 · 0.547723 = 6.5727 mm
    expect(cierre.toleranciaMm).toBeCloseTo(6.5727, 3)
    expect(cierre.longitudKKm).toBe(0.3)
    expect(cierre.coeficiente).toBe(12)
    expect(cierre.pasa).toBe(true)
    // Corrección total = +4 mm, repartida en 2 estaciones: E1 +2, E2 +2+2 = +4.
    expect(cierre.correccionesMm).toHaveLength(2)
    expect(cierre.correccionesMm[0]).toBeCloseTo(2, 6)
    expect(cierre.correccionesMm[1]).toBeCloseTo(4, 6)
    expect(estado.texto).toBe('Circuito cerrado · −4.0 mm de ±6.6 mm ✓')
  })

  it('con k = 4 la tolerancia baja a 4·√0.30 = 2.2 mm y el mismo cierre no pasa', () => {
    const estado = estadoCierreEnVivo(tomaCircuito(), [BM_A], { coeficiente: 4 })
    const cierre = estado.cierre!

    // 4 · 0.547723 = 2.1909 mm; |−4| > 2.19 → no pasa.
    expect(cierre.toleranciaMm).toBeCloseTo(2.1909, 3)
    expect(cierre.pasa).toBe(false)
    // calcularCampania no compensa un cierre que no pasa: la vista previa tampoco.
    expect(cierre.correccionesMm).toEqual([])
    expect(estado.lecturasSinComprobar).toBe(6)
    expect(estado.texto).toBe(
      'Circuito cerrado fuera de tolerancia · −4.0 mm, máximo ±2.2 mm ✗ · 6 lecturas sin comprobar',
    )
  })

  it('la longitud de las opciones manda sobre la de la toma', () => {
    // 12 · √1.2 = 12 · 1.095445 = 13.1453 mm
    const estado = estadoCierreEnVivo(tomaCircuito(), [BM_A], { longitudKKm: 1.2 })
    expect(estado.cierre!.toleranciaMm).toBeCloseTo(13.1453, 3)
  })

  it('con longitud automática la saca del recorrido medido: 0+010 a 0+020, ida y vuelta', () => {
    const toma = tomaCircuito()
    toma.cierre.longitudKAuto = true
    // (20 − 10) m · 2 recorridos = 20 m = 0.02 km; 12 · √0.02 = 12 · 0.141421 = 1.6971 mm → −4 no pasa.
    const estado = estadoCierreEnVivo(toma, [BM_A])
    expect(estado.cierre!.longitudKKm).toBeCloseTo(0.02, 9)
    expect(estado.cierre!.toleranciaMm).toBeCloseTo(1.6971, 3)
    expect(estado.cierre!.pasa).toBe(false)
  })

  it('cuenta aparte las lecturas que aún no sirven (0 o más que la mira)', () => {
    const toma = tomaAbierta()
    toma.estaciones[1]!.intermedias[0]!.valor = 0
    const estado = estadoCierreEnVivo(toma, [BM_A])
    // 5 lecturas, 1 pendiente → 4 sin comprobar.
    expect(estado.lecturas).toBe(5)
    expect(estado.lecturasPendientes).toBe(1)
    expect(estado.lecturasSinComprobar).toBe(4)
    expect(estado.texto).toBe('Circuito abierto · 4 lecturas sin comprobar · 1 pendiente')
  })

  it('si la vista adelante al BM aún no sirve, el circuito sigue abierto', () => {
    const toma = tomaCircuito()
    toma.estaciones[1]!.vistaAdelante!.valor = 0
    const estado = estadoCierreEnVivo(toma, [BM_A])
    expect(estado.circuito).toBe('abierto')
    expect(estado.cierre).toBeNull()
    expect(estado.lecturasPendientes).toBe(1)
  })

  it('una toma configurada como abierta no cierra aunque termine en un BM', () => {
    const toma = tomaCircuito()
    toma.cierre.tipo = 'abierto'
    const estado = estadoCierreEnVivo(toma, [BM_A])
    expect(estado.circuito).toBe('abierto')
    expect(estado.motivo).toBe('La toma está configurada como circuito abierto: no se verifica.')
    expect(estado.lecturasSinComprobar).toBe(6)
  })

  it('dice por qué no cierra si llega a otro BM', () => {
    const BM_B: BM = { ...BM_A, id: 'bm-b', nombre: 'BM-B', cota: 3245.0 }
    const toma = tomaCircuito()
    toma.estaciones[1]!.vistaAdelante!.destino = { tipo: 'bm', bmId: 'bm-b' }
    const estado = estadoCierreEnVivo(toma, [BM_A, BM_B])
    expect(estado.circuito).toBe('abierto')
    expect(estado.motivo).toBe('La última estación llega a BM-B, pero el BM de cierre es BM-A.')
  })

  it('avisa si falta elegir el BM de cierre o si ya no existe', () => {
    const sinBm = tomaCircuito()
    delete sinBm.cierre.bmFinalId
    expect(estadoCierreEnVivo(sinBm, [BM_A]).motivo).toBe('Falta elegir el BM de cierre.')

    const borrado = tomaCircuito()
    borrado.cierre.bmFinalId = 'bm-x'
    expect(estadoCierreEnVivo(borrado, [BM_A]).motivo).toBe('El BM de cierre ya no existe en la obra.')
  })

  it('sin estaciones lo dice, sin inventar un cierre', () => {
    const toma = { ...tomaCircuito(), estaciones: [] }
    const estado = estadoCierreEnVivo(toma, [BM_A])
    expect(estado.circuito).toBe('abierto')
    expect(estado.lecturas).toBe(0)
    expect(estado.estaciones).toBe(0)
    expect(estado.texto).toBe('Circuito abierto · sin lecturas todavía')
  })

  it('una libreta rota no revienta: devuelve el error en palabras', () => {
    const toma = tomaCircuito()
    toma.estaciones[1]!.vistaAtras.destino = { tipo: 'cambio', nombre: 'PC-9' }
    const estado = estadoCierreEnVivo(toma, [BM_A])
    expect(estado.circuito).toBe('error')
    expect(estado.error).toBe('La estación 2 arranca en PC-9, que no fue medido antes')
    expect(estado.lecturasSinComprobar).toBe(6)
    expect(estado.texto).toBe('No se puede calcular · La estación 2 arranca en PC-9, que no fue medido antes')
  })

  it('una lectura en singular se dice en singular', () => {
    const toma = tomaAbierta()
    toma.estaciones = [{ ...toma.estaciones[0]!, intermedias: [] }]
    delete toma.estaciones[0]!.vistaAdelante
    expect(estadoCierreEnVivo(toma, [BM_A]).texto).toBe('Circuito abierto · 1 lectura sin comprobar')
  })
})

describe('estadoCierreEnVivo: qué comprueba de verdad el cierre', () => {
  const A: BM = { id: 'bm-a', nombre: 'BM-A', cota: 100, tipo: 'oficial', descripcion: '' }
  const B: BM = { id: 'bm-b', nombre: 'BM-B', cota: 101, tipo: 'oficial', descripcion: '' }

  /**
   * E1: atrás A 1.500 → AI1 = 101.500; 0+010 1.000 → 100.500; adelante B 0.450 → 101.050
   *     (B vale 101.000: control con +50 mm).
   * E2 VUELVE a arrancar en B con su cota conocida: atrás B 1.000 → AI2 = 102.000;
   *     0+020 1.200 → 100.800; adelante A 2.003 → 99.997 → error −3 mm.
   * El cierre solo respalda E2; E1 nunca se comparó con nada que lo cierre.
   */
  function tomaConReArranque(): Toma {
    return {
      id: 't2',
      fecha: '2026-10-05',
      capaId: 'capa-0',
      bmInicialId: 'bm-a',
      estaciones: [
        {
          id: 'e1',
          vistaAtras: { id: 'l1', destino: { tipo: 'bm', bmId: 'bm-a' }, valor: 1.5 },
          intermedias: [
            { id: 'l2', destino: { tipo: 'celda', celda: { progresiva: 10, elementoClave: 'eje' } }, valor: 1 },
          ],
          vistaAdelante: { id: 'l3', destino: { tipo: 'bm', bmId: 'bm-b' }, valor: 0.45 },
        },
        {
          id: 'e2',
          vistaAtras: { id: 'l4', destino: { tipo: 'bm', bmId: 'bm-b' }, valor: 1 },
          intermedias: [
            { id: 'l5', destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'eje' } }, valor: 1.2 },
          ],
          vistaAdelante: { id: 'l6', destino: { tipo: 'bm', bmId: 'bm-a' }, valor: 2.003 },
        },
      ],
      cierre: {
        tipo: 'cerrado',
        bmFinalId: 'bm-a',
        longitudK: 0.3,
        longitudKAuto: false,
        clase: 'tercerOrden',
        coeficiente: 12,
      },
    }
  }

  it('si una estación vuelve a arrancar de un BM, el tramo de antes queda sin comprobar', () => {
    const estado = estadoCierreEnVivo(tomaConReArranque(), [A, B])
    const cierre = estado.cierre!

    // 99.997 − 100.000 = −0.003 m; 12·√0.30 = 6.57 → pasa.
    expect(estado.circuito).toBe('cerrado')
    expect(cierre.errorMm).toBeCloseTo(-3, 6)
    expect(cierre.pasa).toBe(true)
    // Solo E2 (índice 1) está en el tramo que cerró.
    expect(cierre.tramoComprobado).toEqual({ primeraEstacion: 1, ultimaEstacion: 1 })
    // Las 3 lecturas de E1 no las respalda nadie.
    expect(estado.lecturasSinComprobar).toBe(3)
    // +3 mm repartidos solo en E2: correccionesAcumuladas(−3, 1) = [+3]; E1 no recibe nada.
    expect(cierre.correccionesMm).toHaveLength(2)
    expect(cierre.correccionesMm[0]).toBe(0)
    expect(cierre.correccionesMm[1]).toBeCloseTo(3, 6)
    expect(estado.motivo).toBe(
      'Tramo BM-A → BM-B (estación 1) sin cierre propio: el cierre solo comprueba desde BM-B.',
    )
    expect(estado.texto).toBe('Circuito cerrado · −3.0 mm de ±6.6 mm ✓ · 3 lecturas sin comprobar')
  })

  it('la visada a un BM a mitad de camino se compara con su cota: control de +50 mm', () => {
    const estado = estadoCierreEnVivo(tomaConReArranque(), [A, B])
    // 101.050 − 101.000 = +0.050 m = +50 mm
    expect(estado.controles).toHaveLength(1)
    const control = estado.controles[0]!
    expect(control.bmId).toBe('bm-b')
    expect(control.nombre).toBe('BM-B')
    expect(control.estacionIndice).toBe(0)
    expect(control.cotaCalculada).toBeCloseTo(101.05, 6)
    expect(control.cotaConocida).toBe(101)
    expect(control.errorMm).toBeCloseTo(50, 6)
  })

  it('el BM de cierre no se repite como control', () => {
    expect(estadoCierreEnVivo(tomaCircuito(), [BM_A]).controles).toEqual([])
  })

  it('las lecturas de una estación sin cota instrumento no se dan por comprobadas', () => {
    // E1 con vista atrás pendiente; E2 arranca otra vez en BM-A:
    // AI2 = 3245.180 + 0.957 = 3246.137; adelante 0.961 → 3245.176 → −4 mm, pasa.
    const toma = tomaCircuito()
    toma.estaciones[0]!.vistaAtras.valor = 0
    toma.estaciones[1]!.vistaAtras = { id: 'l4', destino: { tipo: 'bm', bmId: 'bm-a' }, valor: 0.957 }
    const estado = estadoCierreEnVivo(toma, [BM_A])

    expect(estado.circuito).toBe('cerrado')
    expect(estado.cierre!.errorMm).toBeCloseTo(-4, 6)
    expect(estado.cierre!.pasa).toBe(true)
    expect(estado.lecturasPendientes).toBe(1)
    // 6 lecturas − 1 pendiente − 3 de E2 comprobadas = 2 (intermedia y adelante de E1).
    expect(estado.lecturasSinComprobar).toBe(2)
    expect(estado.texto).toBe(
      'Circuito cerrado · −4.0 mm de ±6.6 mm ✓ · 2 lecturas sin comprobar · 1 pendiente',
    )
  })
})

describe('estadoCierreEnVivo: lo que la pantalla de cierre necesita antes de visar el BM', () => {
  it('da la altura instrumental, el BM, la tolerancia y la lectura que cierra exacto', () => {
    const previo = estadoCierreEnVivo(tomaAbierta(), [BM_A]).previo!
    // AI2 = 3246.137 (ver tomaCircuito)
    expect(previo.alturaInstrumentalUltima).toBeCloseTo(3246.137, 6)
    expect(previo.bmCierre).toEqual({ id: 'bm-a', nombre: 'BM-A', cota: 3245.18 })
    expect(previo.coeficiente).toBe(12)
    expect(previo.longitudKKm).toBe(0.3)
    // 12 · √0.30 = 6.5727 mm
    expect(previo.toleranciaMm).toBeCloseTo(6.5727, 3)
    // 3246.137 − 3245.180 = 0.957
    expect(previo.lecturaParaCerrarExacto).toBeCloseTo(0.957, 6)
    // 0.957 ∓ 0.0065727 → [0.9504273, 0.9635727]
    expect(previo.rangoLecturaQuePasa[0]).toBeCloseTo(0.9504273, 6)
    expect(previo.rangoLecturaQuePasa[1]).toBeCloseTo(0.9635727, 6)
  })

  it('sin BM de cierre, con la última estación sin cota instrumento o en toma abierta, no hay previo', () => {
    const sinBm = tomaAbierta()
    delete sinBm.cierre.bmFinalId
    expect(estadoCierreEnVivo(sinBm, [BM_A]).previo).toBeNull()

    const sinAi = tomaAbierta()
    sinAi.estaciones[1]!.vistaAtras.valor = 0
    expect(estadoCierreEnVivo(sinAi, [BM_A]).previo).toBeNull()

    const abierta = tomaAbierta()
    abierta.cierre.tipo = 'abierto'
    expect(estadoCierreEnVivo(abierta, [BM_A]).previo).toBeNull()
  })
})

describe('estadoCierreEnVivo: configuración del cierre inválida', () => {
  it('un k que no es número no da un ✗ falso: es un error de configuración', () => {
    const estado = estadoCierreEnVivo(tomaCircuito(), [BM_A], { coeficiente: Number.NaN })
    expect(estado.circuito).toBe('error')
    expect(estado.cierre).toBeNull()
    expect(estado.error).toBe('El coeficiente k tiene que ser un número positivo.')
    expect(estado.lecturasSinComprobar).toBe(6)
  })

  it('una K en blanco en la toma dice que falta', () => {
    const toma = tomaCircuito()
    toma.cierre.longitudK = Number.NaN
    const estado = estadoCierreEnVivo(toma, [BM_A])
    expect(estado.circuito).toBe('error')
    expect(estado.texto).toBe('No se puede calcular · Falta la longitud del circuito.')
  })

  it('una K negativa no tumba la pantalla', () => {
    const estado = estadoCierreEnVivo(tomaCircuito(), [BM_A], { longitudKKm: -1 })
    expect(estado.circuito).toBe('error')
    expect(estado.error).toBe('La longitud del circuito no puede ser negativa')
  })

  it('una toma abierta no necesita K', () => {
    const toma = tomaCircuito()
    toma.cierre.tipo = 'abierto'
    toma.cierre.longitudK = Number.NaN
    expect(estadoCierreEnVivo(toma, [BM_A]).circuito).toBe('abierto')
  })
})

describe('estadoCierreEnVivo: redondeo del texto', () => {
  it('si error y tolerancia se verían iguales a 1 decimal, da 2 para que no parezca contradictorio', () => {
    // Cierra contra BM-C de 3245.1826: 3245.176 − 3245.1826 = −0.0066 m = −6.6 mm > 6.5727 → no pasa.
    const C: BM = { id: 'bm-c', nombre: 'BM-C', cota: 3245.1826, tipo: 'auxiliar', descripcion: '' }
    const toma = tomaCircuito()
    toma.estaciones[1]!.vistaAdelante!.destino = { tipo: 'bm', bmId: 'bm-c' }
    toma.cierre.bmFinalId = 'bm-c'
    const estado = estadoCierreEnVivo(toma, [BM_A, C])
    expect(estado.cierre!.pasa).toBe(false)
    expect(estado.cierre!.errorMmRedondeado).toBe(-6.6)
    expect(estado.texto).toBe(
      'Circuito cerrado fuera de tolerancia · −6.60 mm, máximo ±6.57 mm ✗ · 6 lecturas sin comprobar',
    )
  })

  it('devuelve el error ya redondeado a 0.1 mm', () => {
    // −3.999999999… → −4.0
    expect(estadoCierreEnVivo(tomaCircuito(), [BM_A]).cierre!.errorMmRedondeado).toBe(-4)
  })
})

describe('cierre en vivo con el largo de mira del instrumento', () => {
  it('una lectura de 4.500 cuenta como pendiente con una mira de 4 m, y no con la de fábrica', () => {
    const toma = tomaCircuito()
    toma.estaciones[0]!.intermedias[0]!.valor = 4.5
    expect(estadoCierreEnVivo(toma, [BM_A]).lecturasPendientes).toBe(0)
    expect(estadoCierreEnVivo(toma, [BM_A], { largoMira: 4 }).lecturasPendientes).toBe(1)
  })

  it('simularCierre rechaza con el largo de la mira en el mensaje', () => {
    expect(() => simularCierre(3246.137, 4.5, 3245.18, 12, 0.3, 0, 4)).toThrow(
      'La lectura 4.500 no puede ser de una mira (tiene que estar entre 0 y 4 m).',
    )
  })
})

describe('simularCierre', () => {
  it('AI 3246.137 y lectura 0.961 en BM 3245.180, k = 12, 0.30 km: −4 mm, tolerancia 6.6, pasa', () => {
    const r = simularCierre(3246.137, 0.961, 3245.18, 12, 0.3)
    // 3246.137 − 0.961 = 3245.176; 3245.176 − 3245.180 = −0.004 m = −4 mm
    expect(r.cotaCalculada).toBeCloseTo(3245.176, 6)
    expect(r.errorMm).toBeCloseTo(-4, 6)
    // 12 · √0.30 = 6.5727 mm
    expect(r.toleranciaMm).toBeCloseTo(6.5727, 3)
    expect(r.pasa).toBe(true)
    expect(r.correccionesMm).toEqual([])
  })

  it('con k = 4: tolerancia 2.2 mm y no pasa', () => {
    const r = simularCierre(3246.137, 0.961, 3245.18, 4, 0.3)
    // 4 · √0.30 = 2.1909 mm < 4 mm
    expect(r.toleranciaMm).toBeCloseTo(2.1909, 3)
    expect(r.pasa).toBe(false)
  })

  it('con 2 estaciones da la corrección acumulada de cada una: +2 y +4 mm', () => {
    const r = simularCierre(3246.137, 0.961, 3245.18, 12, 0.3, 2)
    // Corrección total = −(−4) = +4 mm; E1 = 4·1/2 = 2, E2 = 4·2/2 = 4.
    expect(r.correccionesMm).toHaveLength(2)
    expect(r.correccionesMm[0]).toBeCloseTo(2, 6)
    expect(r.correccionesMm[1]).toBeCloseTo(4, 6)
  })

  it('un error exactamente igual a la tolerancia pasa', () => {
    // 12 · √1 = 12 mm; AI 100.000 − 1.000 = 99.000; BM 98.988 → error +12 mm.
    const r = simularCierre(100, 1, 98.988, 12, 1)
    expect(r.errorMm).toBeCloseTo(12, 6)
    expect(r.pasa).toBe(true)
  })

  it('rechaza una lectura que no puede ser de una mira', () => {
    expect(() => simularCierre(3246.137, 0, 3245.18, 12, 0.3)).toThrow(
      'La lectura 0.000 no puede ser de una mira (tiene que estar entre 0 y 5 m).',
    )
  })

  it('dice qué falta si la altura instrumental o la cota del BM están en blanco', () => {
    expect(() => simularCierre(Number.NaN, 0.961, 3245.18, 12, 0.3)).toThrow('Falta la altura instrumental.')
    expect(() => simularCierre(3246.137, 0.961, Number.NaN, 12, 0.3)).toThrow('Falta la cota del BM.')
  })

  it('rechaza una longitud negativa, como la tolerancia de siempre', () => {
    expect(() => simularCierre(3246.137, 0.961, 3245.18, 12, -1)).toThrow(
      'La longitud del circuito no puede ser negativa',
    )
  })

  it('da la lectura que cerraría exacto y el error redondeado', () => {
    const r = simularCierre(3246.137, 0.961, 3245.18, 12, 0.3)
    // 3246.137 − 3245.180 = 0.957
    expect(r.lecturaParaCerrarExacto).toBeCloseTo(0.957, 6)
    // −3.999999999… → −4.0
    expect(r.errorMmRedondeado).toBe(-4)
  })

  it('rechaza un k que no es número o no es positivo', () => {
    const mensaje = 'El coeficiente k tiene que ser un número positivo.'
    expect(() => simularCierre(3246.137, 0.961, 3245.18, Number.NaN, 0.3)).toThrow(mensaje)
    expect(() => simularCierre(3246.137, 0.961, 3245.18, -12, 0.3)).toThrow(mensaje)
    expect(() => simularCierre(3246.137, 0.961, 3245.18, 0, 0.3)).toThrow(mensaje)
  })

  it('dice que falta la longitud si está en blanco', () => {
    expect(() => simularCierre(3246.137, 0.961, 3245.18, 12, Number.NaN)).toThrow(
      'Falta la longitud del circuito.',
    )
  })

  it('dice que falta la lectura si está en blanco', () => {
    expect(() => simularCierre(3246.137, Number.NaN, 3245.18, 12, 0.3)).toThrow('Falta la lectura en el BM.')
  })

  it('el número de estaciones tiene que ser entero y no negativo', () => {
    // Con 2.5 correccionesAcumuladas daría 3 correcciones y la última no anularía el error.
    const mensaje = 'El número de estaciones tiene que ser un entero, 0 o más.'
    expect(() => simularCierre(3246.137, 0.961, 3245.18, 12, 0.3, 2.5)).toThrow(mensaje)
    expect(() => simularCierre(3246.137, 0.961, 3245.18, 12, 0.3, -1)).toThrow(mensaje)
  })
})
