import { describe, expect, it } from 'vitest'
import {
  alturaInstrumental,
  cotaDesdeLectura,
  gradosAPorcentaje,
  gradosARelacion,
  interpolarCota,
  lecturaObjetivo,
  pendiente,
  porcentajeAGrados,
  porcentajeARelacion,
  relacionAGrados,
  relacionAPorcentaje,
  volumenAreasMedias,
} from './calculadora'

describe('alturaInstrumental', () => {
  it('suma la vista atrás a la cota del punto', () => {
    // 3244.730 + 1.902 = 3246.632
    expect(alturaInstrumental(3244.73, 1.902)).toBe(3246.632)
  })
  it('devuelve null si un dato no es finito', () => {
    expect(alturaInstrumental(Number.NaN, 1.5)).toBeNull()
    expect(alturaInstrumental(3244.73, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('cotaDesdeLectura', () => {
  it('resta la lectura a la altura instrumental (caso de referencia)', () => {
    // 3246.632 − 2.640 = 3243.992
    expect(cotaDesdeLectura(3246.632, 2.64)).toBe(3243.992)
  })
  it('devuelve null si un dato no es finito', () => {
    expect(cotaDesdeLectura(3246.632, Number.NaN)).toBeNull()
  })
})

describe('lecturaObjetivo', () => {
  it('es la altura instrumental menos la cota de proyecto (caso de referencia)', () => {
    // 3246.632 − 3243.980 = 2.652
    expect(lecturaObjetivo(3246.632, 3243.98)).toBe(2.652)
  })
  it('puede salir negativa: el proyecto queda por encima del instrumento', () => {
    // 3246.632 − 3247.000 = −0.368 (no se oculta; lo juzga quien la muestra)
    expect(lecturaObjetivo(3246.632, 3247)).toBe(-0.368)
  })
  it('devuelve null si un dato no es finito', () => {
    expect(lecturaObjetivo(Number.NEGATIVE_INFINITY, 3243.98)).toBeNull()
  })
})

describe('pendiente', () => {
  it('bajada de 3244.730 a 3243.980 en 60 m (caso de referencia)', () => {
    // desnivel = 3243.980 − 3244.730 = −0.750
    // porcentaje = −0.750 / 60 × 100 = −1.25 % ; pormil = −12.5 ‰
    const p = pendiente(3244.73, 3243.98, 60)
    expect(p).not.toBeNull()
    expect(p!.desnivel).toBe(-0.75)
    expect(p!.porcentaje).toBeCloseTo(-1.25, 10)
    expect(p!.pormil).toBeCloseTo(-12.5, 10)
    expect(p!.sentido).toBe('baja')
  })
  it('subida', () => {
    // desnivel = 3245.000 − 3244.000 = 1.000 ; 1 / 40 × 100 = 2.5 % ; 25 ‰
    const p = pendiente(3244, 3245, 40)!
    expect(p.desnivel).toBe(1)
    expect(p.porcentaje).toBeCloseTo(2.5, 10)
    expect(p.pormil).toBeCloseTo(25, 10)
    expect(p.sentido).toBe('sube')
  })
  it('plano cuando el desnivel no llega al milímetro', () => {
    // 3244.0004 − 3244.000 = 0.0004 → a mm: 0.000 → plano, 0 %
    const p = pendiente(3244, 3244.0004, 20)!
    expect(p.desnivel).toBe(0)
    expect(p.porcentaje).toBe(0)
    expect(p.sentido).toBe('plano')
  })
  it('devuelve null con distancia 0, negativa o datos no finitos', () => {
    expect(pendiente(3244, 3245, 0)).toBeNull()
    expect(pendiente(3244, 3245, -10)).toBeNull()
    expect(pendiente(Number.NaN, 3245, 10)).toBeNull()
  })
})

describe('interpolarCota', () => {
  it('interpola entre dos progresivas', () => {
    // 0+020 → 3244.730 ; 0+080 → 3243.980 ; buscada 0+050
    // 3244.730 + (50 − 20) / (80 − 20) × (3243.980 − 3244.730) = 3244.730 − 0.375 = 3244.355
    expect(interpolarCota(20, 3244.73, 80, 3243.98, 50)).toEqual({ cota: 3244.355, extrapolada: false })
  })
  it('en los extremos no es extrapolación', () => {
    expect(interpolarCota(20, 3244.73, 80, 3243.98, 20)).toEqual({ cota: 3244.73, extrapolada: false })
    expect(interpolarCota(20, 3244.73, 80, 3243.98, 80)).toEqual({ cota: 3243.98, extrapolada: false })
  })
  it('acepta los puntos en orden inverso', () => {
    // mismo caso que arriba con A y B intercambiados → 3244.355
    expect(interpolarCota(80, 3243.98, 20, 3244.73, 50)).toEqual({ cota: 3244.355, extrapolada: false })
  })
  it('extrapola pero lo marca', () => {
    // buscada 0+100: 3244.730 + (100 − 20) / 60 × (−0.750) = 3244.730 − 1.000 = 3243.730
    expect(interpolarCota(20, 3244.73, 80, 3243.98, 100)).toEqual({ cota: 3243.73, extrapolada: true })
    // buscada 0+000: 3244.730 + (0 − 20) / 60 × (−0.750) = 3244.730 + 0.250 = 3244.980
    expect(interpolarCota(20, 3244.73, 80, 3243.98, 0)).toEqual({ cota: 3244.98, extrapolada: true })
  })
  it('devuelve null si las dos progresivas coinciden o hay datos no finitos', () => {
    expect(interpolarCota(20, 3244.73, 20, 3243.98, 20)).toBeNull()
    expect(interpolarCota(20, 3244.73, 80, Number.NaN, 50)).toBeNull()
  })
})

describe('volumenAreasMedias', () => {
  it('áreas 1.85 y 2.10 en 20 m (caso de referencia)', () => {
    // (1.85 + 2.10) / 2 × 20 = 1.975 × 20 = 39.50 m³
    expect(volumenAreasMedias(1.85, 2.1, 20)).toBe(39.5)
  })
  it('con un área nula (sección que se acaba)', () => {
    // (0 + 3) / 2 × 10 = 15 m³
    expect(volumenAreasMedias(0, 3, 10)).toBe(15)
  })
  it('devuelve null con distancia 0, área negativa o datos no finitos', () => {
    expect(volumenAreasMedias(1.85, 2.1, 0)).toBeNull()
    expect(volumenAreasMedias(-1, 2.1, 20)).toBeNull()
    expect(volumenAreasMedias(1.85, Number.NaN, 20)).toBeNull()
  })
})

describe('conversiones de pendiente', () => {
  it('porcentaje a grados', () => {
    // atan(100 / 100) = 45°
    expect(porcentajeAGrados(100)).toBeCloseTo(45, 10)
    // atan(−0.0125) × 180 / π = −0.716159...°
    expect(porcentajeAGrados(-1.25)).toBeCloseTo(-0.71616, 4)
  })
  it('grados a porcentaje', () => {
    // tan(45°) × 100 = 100 %
    expect(gradosAPorcentaje(45)).toBeCloseTo(100, 10)
    // tan(10°) × 100 = 0.176327 × 100 = 17.6327 %
    expect(gradosAPorcentaje(10)).toBeCloseTo(17.6327, 3)
  })
  it('grados de 90 o más no tienen porcentaje', () => {
    expect(gradosAPorcentaje(90)).toBeNull()
    expect(gradosAPorcentaje(-95)).toBeNull()
  })
  it('porcentaje a relación 1:n (1 vertical : n horizontal)', () => {
    // 100 / 1.25 = 80 → "1:80"
    expect(porcentajeARelacion(-1.25)).toEqual({ n: 80, texto: '1:80', sentido: 'baja' })
    // 100 / 66.667 = 1.5 → "1:1.5"
    expect(porcentajeARelacion(200 / 3)).toEqual({ n: 1.5, texto: '1:1.5', sentido: 'sube' })
  })
  it('porcentaje 0 no tiene relación (n sería infinito)', () => {
    expect(porcentajeARelacion(0)).toBeNull()
  })
  it('relación a porcentaje, desde texto o número', () => {
    // 1:80 → 1 / 80 × 100 = 1.25 %
    expect(relacionAPorcentaje('1:80')).toBeCloseTo(1.25, 10)
    // 1:1.5 → 1 / 1.5 × 100 = 66.667 %
    expect(relacionAPorcentaje(' 1 : 1.5 ')).toBeCloseTo(66.6667, 3)
    expect(relacionAPorcentaje(80)).toBeCloseTo(1.25, 10)
    // "2:3" → 2 / 3 × 100 = 66.667 %
    expect(relacionAPorcentaje('2:3')).toBeCloseTo(66.6667, 3)
    // coma decimal peruana: "1:1,5" = 1:1.5
    expect(relacionAPorcentaje('1:1,5')).toBeCloseTo(66.6667, 3)
  })
  it('relación ilegible o con cero devuelve null', () => {
    expect(relacionAPorcentaje('1:0')).toBeNull()
    expect(relacionAPorcentaje('abc')).toBeNull()
    expect(relacionAPorcentaje('1:-5')).toBeNull()
    expect(relacionAPorcentaje(0)).toBeNull()
  })
  it('grados <-> relación', () => {
    // 45° → tan 45° = 1 → 100 % → 1:1
    // (n ya no se redondea: tan 45° × 100 = 99.99999999999999 → n = 1.0000000000000002)
    const r = gradosARelacion(45)!
    expect(r.n).toBeCloseTo(1, 12)
    expect(r.texto).toBe('1:1')
    expect(r.sentido).toBe('sube')
    // 1:1 → atan(1) = 45°
    expect(relacionAGrados('1:1')).toBeCloseTo(45, 10)
    expect(relacionAGrados('nada')).toBeNull()
  })
  it('datos no finitos devuelven null', () => {
    expect(porcentajeAGrados(Number.NaN)).toBeNull()
    expect(gradosAPorcentaje(Number.POSITIVE_INFINITY)).toBeNull()
    expect(porcentajeARelacion(Number.NaN)).toBeNull()
  })
})

describe('revisión: lecturas fuera de la mira', () => {
  // Misma regla que la libreta (esLecturaUsable): 0 < lectura ≤ 5 m.
  it('alturaInstrumental rechaza vista atrás 0, negativa o mayor que la mira', () => {
    expect(alturaInstrumental(3244.73, 0)).toBeNull()
    expect(alturaInstrumental(3244.73, -1.902)).toBeNull()
    // 19.02 en vez de 1.902: más larga que una mira de 5 m
    expect(alturaInstrumental(3244.73, 19.02)).toBeNull()
  })
  it('cotaDesdeLectura rechaza lectura 0, negativa o mayor que la mira', () => {
    expect(cotaDesdeLectura(3246.632, 0)).toBeNull()
    expect(cotaDesdeLectura(3246.632, -2.64)).toBeNull()
    // 26.40 en vez de 2.640: sin el filtro saldría 3220.232, 24 m de error
    expect(cotaDesdeLectura(3246.632, 26.4)).toBeNull()
  })
  it('la lectura justo en el tope de la mira (5.000) sí vale', () => {
    // 3246.632 − 5.000 = 3241.632
    expect(cotaDesdeLectura(3246.632, 5)).toBe(3241.632)
  })
  it('el largo de la mira es el del instrumento: con una de 4 m, 4.500 ya no vale', () => {
    // De fábrica (5 m): 3246.632 − 4.500 = 3242.132
    expect(cotaDesdeLectura(3246.632, 4.5)).toBe(3242.132)
    expect(cotaDesdeLectura(3246.632, 4.5, 4)).toBeNull()
    expect(alturaInstrumental(3244.73, 4.5, 4)).toBeNull()
    // Con una de 7 m, 6.200 sí: 3244.730 + 6.200 = 3250.930
    expect(alturaInstrumental(3244.73, 6.2, 7)).toBe(3250.93)
  })
})

describe('revisión: ida y vuelta de la relación', () => {
  it('porcentaje negativo → relación → porcentaje conserva el signo', () => {
    // −1.25 % → 1:80 baja → −(1 / 80 × 100) = −1.25 %
    const r = porcentajeARelacion(-1.25)!
    expect(relacionAPorcentaje(r)).toBeCloseTo(-1.25, 10)
    // atan(−0.0125) = −0.71616°
    expect(relacionAGrados(r)).toBeCloseTo(-0.71616, 4)
  })
  it('3 % → relación → 3 % sin perder precisión (n no se redondea)', () => {
    // n = 100 / 3 = 33.333… ; el texto sí va a 3 decimales: "1:33.333"
    const r = porcentajeARelacion(3)!
    expect(r.texto).toBe('1:33.333')
    expect(r.n).toBeCloseTo(100 / 3, 12)
    // 1 / (100/3) × 100 = 3 exacto (con redondeo a 33.333 daba 3.00003)
    expect(relacionAPorcentaje(r)).toBeCloseTo(3, 10)
  })
  it('una relación que sube da porcentaje positivo', () => {
    // 1:2 sube → 50 %
    expect(relacionAPorcentaje({ n: 2, texto: '1:2', sentido: 'sube' })).toBeCloseTo(50, 10)
  })
  it('un RelacionPendiente con n inválido devuelve null', () => {
    expect(relacionAPorcentaje({ n: 0, texto: '1:0', sentido: 'baja' })).toBeNull()
    expect(relacionAPorcentaje({ n: Number.NaN, texto: '', sentido: 'baja' })).toBeNull()
  })
})

describe('revisión: texto de pantalla', () => {
  it('un texto sin ":" se lee como n de 1:n', () => {
    // "80" = 1:80 → 1.25 %
    expect(relacionAPorcentaje('80')).toBeCloseTo(1.25, 10)
    // "1,5" = 1:1.5 → 66.667 %
    expect(relacionAPorcentaje('1,5')).toBeCloseTo(66.6667, 3)
  })
  it('acepta números que empiezan con punto', () => {
    // ".5:1" → 0.5 / 1 × 100 = 50 %
    expect(relacionAPorcentaje('.5:1')).toBeCloseTo(50, 10)
  })
  it('un campo vacío devuelve null sin lanzar', () => {
    expect(relacionAPorcentaje('')).toBeNull()
    expect(relacionAPorcentaje('   ')).toBeNull()
    expect(relacionAPorcentaje(null as unknown as string)).toBeNull()
    expect(relacionAPorcentaje(undefined as unknown as string)).toBeNull()
    expect(relacionAGrados(undefined as unknown as string)).toBeNull()
  })
})

describe('revisión: pendientes muy empinadas no se confunden con datos inválidos', () => {
  it('porcentaje 1 000 000 da n = 0.0001', () => {
    // 100 / 1e6 = 0.0001 ; a 3 decimales sería 0, así que el texto usa los que hagan falta
    const r = porcentajeARelacion(1e6)!
    expect(r).not.toBeNull()
    expect(r.n).toBeCloseTo(1e-4, 15)
    expect(r.texto).toBe('1:0.0001')
  })
  it('89.99° da una relación, no null', () => {
    // tan(89.99°) = 5729.578 → 572957.8 % → n = 100 / 572957.8 = 0.00017453
    const r = gradosARelacion(89.99)!
    expect(r).not.toBeNull()
    expect(r.n).toBeCloseTo(1.7453e-4, 8)
    expect(r.texto).toBe('1:0.0001745')
  })
})
