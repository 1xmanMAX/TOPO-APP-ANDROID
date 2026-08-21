import { describe, expect, it } from 'vitest'
import { claveCelda } from '../grilla/grilla'
import type { Calle, Capa, Plantilla, Rasante } from '../modelo/tipos'
import type { CotaCelda, ResultadoCampania } from '../nivelacion/calcularCampania'
import { estadoDeDiferencia, evaluarContraRasante, type EstadoTolerancia } from './evaluar'

describe('estadoDeDiferencia', () => {
  it('dentro de la tolerancia está conforme', () => {
    expect(estadoDeDiferencia(0, 10)).toBe('conforme')
    expect(estadoDeDiferencia(7, 10)).toBe('conforme')
    expect(estadoDeDiferencia(-7, 10)).toBe('conforme')
  })

  it('justo en la tolerancia todavía está conforme', () => {
    expect(estadoDeDiferencia(10, 10)).toBe('conforme')
    expect(estadoDeDiferencia(-10, 10)).toBe('conforme')
  })

  it('entre la tolerancia y su doble está al límite', () => {
    expect(estadoDeDiferencia(11, 10)).toBe('alLimite')
    expect(estadoDeDiferencia(-18, 10)).toBe('alLimite')
  })

  it('justo en el doble todavía está al límite', () => {
    expect(estadoDeDiferencia(20, 10)).toBe('alLimite')
    expect(estadoDeDiferencia(-20, 10)).toBe('alLimite')
  })

  it('pasado el doble está fuera', () => {
    expect(estadoDeDiferencia(21, 10)).toBe('fuera')
    expect(estadoDeDiferencia(-45, 10)).toBe('fuera')
  })

  it('con tolerancia cero, cualquier diferencia está fuera y el cero exacto es conforme', () => {
    expect(estadoDeDiferencia(0, 0)).toBe('conforme')
    expect(estadoDeDiferencia(1, 0)).toBe('fuera')
  })
})

// ---------- Fixtures de evaluarContraRasante ----------

/** Una sola capa, sin nada encima: la cota teórica coincide con la rasante. */
function capaUnica(toleranciaMm = 10): Capa[] {
  return [{ id: 'unica', nombre: 'Capa única', orden: 0, espesor: 0, toleranciaMm }]
}

/** El mismo paquete de R2/espesores.test.ts, para probar con espesor de por medio. */
function capasEnPaquete(): Capa[] {
  return [
    { id: 'terreno', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 },
    { id: 'subrasante', nombre: 'SUBRASANTE', orden: 1, espesor: 0.25, toleranciaMm: 20 },
    { id: 'base', nombre: 'BASE', orden: 2, espesor: 0.2, toleranciaMm: 10 },
    { id: 'carpeta', nombre: 'CARPETA', orden: 3, espesor: 0.05, toleranciaMm: 5 },
  ]
}

/** El eje arranca en 3245.18 y baja; el tramo de calzada llega hasta offset 4.2. */
function rasanteBase(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 3245.18,
    pendienteLongitudinal: -1.25,
    tramos: [{ nombre: 'Calzada', hastaOffset: 4.2, tipo: 'pendiente', valor: 2 }],
    simetrica: true,
    tramosIzquierda: null,
  }
}

function plantillaDe(elementos: { clave: string; offset: number }[]): Plantilla {
  return {
    id: 'plantilla-prueba',
    nombre: 'Plantilla de prueba',
    elementos: elementos.map((e) => ({
      clave: e.clave,
      etiqueta: e.clave,
      offset: e.offset,
      tipo: 'otro',
    })),
  }
}

function calleDe(cambios: Partial<Calle> = {}): Calle {
  return {
    id: 'calle-prueba',
    nombre: 'Calle de prueba',
    plantillaId: 'plantilla-prueba',
    progresivaInicio: 0,
    progresivaFin: 0,
    intervalo: 1,
    progresivasExtra: [],
    rasante: null,
    ...cambios,
  }
}

function celdaMedida(progresiva: number, elementoClave: string, cota: number): CotaCelda {
  return {
    clave: claveCelda(progresiva, elementoClave),
    progresiva,
    elementoClave,
    offset: 0,
    cota,
    cotaCruda: cota,
    correccion: 0,
    lecturas: [cota],
  }
}

function resultadoCon(celdas: CotaCelda[]): ResultadoCampania {
  return {
    cotasPorCelda: new Map(celdas.map((c) => [c.clave, c])),
    cotasInstrumento: [],
    cierre: {
      tipo: 'cerrado',
      cotaLlegadaCalculada: null,
      cotaLlegadaConocida: null,
      errorMm: null,
      longitudKKm: 0,
      toleranciaMm: null,
      pasa: true,
    },
    avisos: [],
    celdasTotales: celdas.length,
    celdasLlenas: celdas.length,
    error: null,
  }
}

describe('evaluarContraRasante', () => {
  it('los cinco contadores suman el total de celdas de la grilla, sin que ninguna se pierda', () => {
    // Cuatro celdas: progresivas 0 y 20, elementos «eje» (offset 0, dentro de
    // la sección) y «borde» (offset 9, más allá del tramo de calzada).
    const plantilla = plantillaDe([
      { clave: 'eje', offset: 0 },
      { clave: 'borde', offset: 9 },
    ])
    const calle = calleDe({ progresivaFin: 20, intervalo: 20 })
    const rasante = rasanteBase()
    const capas = capaUnica()

    const resultado = resultadoCon([
      // a) offset 0, medida y clavada en la cota → conforme
      celdaMedida(0, 'eje', 3245.18),
      // b) offset 9, fuera de sección, medida → fueraDeSeccion
      celdaMedida(0, 'borde', 3245.0),
      // c) offset 9, fuera de sección, SIN medir → sinMedir (antes no se contaba en nada)
      // d) offset 0, dentro de sección, sin medir → sinMedir
    ])

    const evaluacion = evaluarContraRasante({
      resultado,
      calle,
      plantilla,
      rasante,
      capas,
      capaId: 'unica',
    })

    expect(evaluacion.celdas.size).toBe(4)
    expect(
      evaluacion.conformes +
        evaluacion.alLimite +
        evaluacion.fuera +
        evaluacion.fueraDeSeccion +
        evaluacion.sinMedir,
    ).toBe(evaluacion.celdas.size)

    expect(evaluacion.conformes).toBe(1)
    expect(evaluacion.alLimite).toBe(0)
    expect(evaluacion.fuera).toBe(0)
    expect(evaluacion.fueraDeSeccion).toBe(1)
    expect(evaluacion.sinMedir).toBe(2)
    expect(evaluacion.error).toBeNull()
  })

  it('una celda medida y clavada en la cota da diferencia cero y cuenta como conforme, no como sin dato', () => {
    const plantilla = plantillaDe([{ clave: 'eje', offset: 0 }])
    const calle = calleDe()
    const resultado = resultadoCon([celdaMedida(0, 'eje', 3245.18)])

    const evaluacion = evaluarContraRasante({
      resultado,
      calle,
      plantilla,
      rasante: rasanteBase(),
      capas: capaUnica(),
      capaId: 'unica',
    })

    const celda = evaluacion.celdas.get(claveCelda(0, 'eje'))
    expect(celda?.diferenciaMm).toBe(0)
    expect(celda?.estado).toBe('conforme')
    expect(evaluacion.conformes).toBe(1)
    expect(evaluacion.sinMedir).toBe(0)
  })

  it('una celda sin medir tiene diferencia null, no cero', () => {
    const plantilla = plantillaDe([{ clave: 'eje', offset: 0 }])
    const calle = calleDe()
    const resultado = resultadoCon([])

    const evaluacion = evaluarContraRasante({
      resultado,
      calle,
      plantilla,
      rasante: rasanteBase(),
      capas: capaUnica(),
      capaId: 'unica',
    })

    const celda = evaluacion.celdas.get(claveCelda(0, 'eje'))
    expect(celda?.cotaReal).toBeNull()
    expect(celda?.diferenciaMm).toBeNull()
    // Hay rasante en este punto (cotaTeorica no es null), pero el estado no
    // dice 'sinRasante' — sería falso. Lo que falta es medir.
    expect(celda?.cotaTeorica).not.toBeNull()
    expect(celda?.estado).toBe('sinMedir')
    expect(evaluacion.sinMedir).toBe(1)
    expect(evaluacion.conformes).toBe(0)
  })

  it('una celda sin rasante y sin medir también sale sinMedir, por el mismo criterio', () => {
    const plantilla = plantillaDe([{ clave: 'borde', offset: 9 }]) // fuera del tramo (hastaOffset 4.2)
    const calle = calleDe()
    const resultado = resultadoCon([])

    const evaluacion = evaluarContraRasante({
      resultado,
      calle,
      plantilla,
      rasante: rasanteBase(),
      capas: capaUnica(),
      capaId: 'unica',
    })

    const celda = evaluacion.celdas.get(claveCelda(0, 'borde'))
    expect(celda?.cotaTeorica).toBeNull()
    expect(celda?.estado).toBe('sinMedir')
    expect(evaluacion.sinMedir).toBe(1)
    expect(evaluacion.fueraDeSeccion).toBe(0)
  })

  it('una celda sin rasante pero medida sigue saliendo con sinRasante', () => {
    const plantilla = plantillaDe([{ clave: 'borde', offset: 9 }])
    const calle = calleDe()
    const resultado = resultadoCon([celdaMedida(0, 'borde', 3245.0)])

    const evaluacion = evaluarContraRasante({
      resultado,
      calle,
      plantilla,
      rasante: rasanteBase(),
      capas: capaUnica(),
      capaId: 'unica',
    })

    const celda = evaluacion.celdas.get(claveCelda(0, 'borde'))
    expect(celda?.cotaTeorica).toBeNull()
    expect(celda?.cotaReal).not.toBeNull()
    expect(celda?.estado).toBe('sinRasante')
    expect(evaluacion.fueraDeSeccion).toBe(1)
    expect(evaluacion.sinMedir).toBe(0)
  })

  it('el estado de cada celda y los contadores del resumen cuentan lo mismo, en un escenario con las cinco categorías', () => {
    // Ocho celdas: progresivas 0/20/40/60 × elementos «a» (offset 0, dentro
    // de sección) y «b» (offset 9, fuera del tramo de calzada).
    const plantilla = plantillaDe([
      { clave: 'a', offset: 0 },
      { clave: 'b', offset: 9 },
    ])
    const calle = calleDe({ progresivaFin: 60, intervalo: 20 })
    const rasante = rasanteBase()
    const capas = capaUnica() // toleranciaMm 10

    const resultado = resultadoCon([
      celdaMedida(0, 'a', 3245.18), // cotaTeorica 3245.18 → diferencia 0 → conforme
      celdaMedida(20, 'a', 3244.945), // cotaTeorica 3244.93 → +15 mm → alLimite
      celdaMedida(40, 'a', 3244.71), // cotaTeorica 3244.68 → +30 mm → fuera
      // 60|a: dentro de sección, sin medir → sinMedir
      celdaMedida(0, 'b', 3245.0), // fuera de sección, medida → fueraDeSeccion
      // 20|b, 40|b, 60|b: fuera de sección, sin medir → sinMedir
    ])

    const evaluacion = evaluarContraRasante({
      resultado,
      calle,
      plantilla,
      rasante,
      capas,
      capaId: 'unica',
    })

    expect(evaluacion.celdas.size).toBe(8)
    expect(evaluacion.conformes).toBe(1)
    expect(evaluacion.alLimite).toBe(1)
    expect(evaluacion.fuera).toBe(1)
    expect(evaluacion.fueraDeSeccion).toBe(1)
    expect(evaluacion.sinMedir).toBe(4)

    const celdas = [...evaluacion.celdas.values()]
    const contarPorEstado = (estado: EstadoTolerancia) =>
      celdas.filter((c) => c.estado === estado).length

    // La prueba que impide que el campo por celda y los contadores del
    // resumen vuelvan a divergir: cada grupo por estado tiene exactamente
    // el tamaño que dice su contador.
    expect(contarPorEstado('conforme')).toBe(evaluacion.conformes)
    expect(contarPorEstado('alLimite')).toBe(evaluacion.alLimite)
    expect(contarPorEstado('fuera')).toBe(evaluacion.fuera)
    expect(contarPorEstado('sinRasante')).toBe(evaluacion.fueraDeSeccion)
    expect(contarPorEstado('sinMedir')).toBe(evaluacion.sinMedir)
  })

  it('la diferencia sale en milímetros enteros, sin el arrastre de coma flotante', () => {
    const plantilla = plantillaDe([{ clave: 'eje', offset: 0 }])
    const calle = calleDe()
    // Cota teórica en progresiva 0, offset 0, con capaUnica: 3245.18 (coincide
    // con la rasante). 3244.878 queda 0.302 m por debajo, igual que el caso
    // de aMilimetros(-0.302) del comentario de evaluar.ts.
    const resultado = resultadoCon([celdaMedida(0, 'eje', 3244.878)])

    const evaluacion = evaluarContraRasante({
      resultado,
      calle,
      plantilla,
      rasante: rasanteBase(),
      capas: capaUnica(),
      capaId: 'unica',
    })

    const celda = evaluacion.celdas.get(claveCelda(0, 'eje'))
    expect(celda?.diferenciaMm).toBe(-302)
  })

  it('cotaReal y cotaTeorica se resuelven bien en una celda con bombeo, no solo en el eje', () => {
    const plantilla = plantillaDe([{ clave: 'borde', offset: 4.2 }])
    const calle = calleDe()
    // Mismo caso que espesores.test.ts: la base en el eje da 3245.13; a
    // offset 4.2 el bombeo del 2% le resta 84 mm → 3245.046.
    const resultado = resultadoCon([celdaMedida(0, 'borde', 3245.046)])

    const evaluacion = evaluarContraRasante({
      resultado,
      calle,
      plantilla,
      rasante: rasanteBase(),
      capas: capasEnPaquete(),
      capaId: 'base',
    })

    const celda = evaluacion.celdas.get(claveCelda(0, 'borde'))
    expect(celda?.cotaTeorica).toBe(3245.046)
    expect(celda?.cotaReal).toBe(3245.046)
    expect(celda?.diferenciaMm).toBe(0)
    expect(celda?.estado).toBe('conforme')
  })

  it('con la calle mal configurada, dice qué está mal en vez de mostrar un resumen vacío y engañoso', () => {
    const plantilla = plantillaDe([{ clave: 'eje', offset: 0 }])
    // Progresiva final antes que la inicial: construirGrilla no puede armar la grilla.
    const calle = calleDe({ progresivaInicio: 10, progresivaFin: 0, intervalo: 1 })
    const resultado = resultadoCon([])

    const evaluacion = evaluarContraRasante({
      resultado,
      calle,
      plantilla,
      rasante: rasanteBase(),
      capas: capaUnica(),
      capaId: 'unica',
    })

    expect(evaluacion.error).not.toBeNull()
    expect(evaluacion.error).not.toMatch(/error|exception/i)
    expect(evaluacion.celdas.size).toBe(0)
    expect(
      evaluacion.conformes +
        evaluacion.alLimite +
        evaluacion.fuera +
        evaluacion.fueraDeSeccion +
        evaluacion.sinMedir,
    ).toBe(0)
  })
})
