import { describe, expect, it } from 'vitest'
import { nivelARegistrar, type LineaNivel, type Puesta } from '@topo/core'
import { baseDePrueba } from './datosDePrueba'
import { hojaDeEstacas } from './hojaDeEstacas'
import { AVISO_SIN_COMPROBAR } from './maquetacion'
import { datosDeEstacasDesdeNiveles } from './nivelesAEstacas'
import { enUnaLinea, textoDelPdf } from './textoDelPdf'

/* Los datos de ejemplo de la herramienta de Max: puesta BM 100 + atrás 1.5 → HI 101.500. */
const RAPIDA: Puesta = { tipo: 'rapida', cotaBM: 100, lecturaAtras: 1.5 }
const CERRADA: Puesta = { tipo: 'libreta', alturaInstrumental: 101.5, comprobado: true }
const punto = (progresiva: number, cota: number) => ({ progresiva, cota, comprobado: true })
const SUBBASE: LineaNivel = {
  nombre: 'Subbase izquierda',
  puntos: [punto(0, 99.85), punto(10, 99.845), punto(20, 99.83), punto(30, 99.82), punto(40, 99.81)],
}
const VEREDA: LineaNivel = {
  nombre: 'Vereda derecha',
  puntos: [punto(0, 100.26), punto(10, 100.25), punto(20, 100.235), punto(30, 100.22), punto(40, 100.21)],
}

describe('datosDeEstacasDesdeNiveles', () => {
  it('cada progresiva es una fila: cota a registrar y su lectura, en metros', () => {
    const r = nivelARegistrar({ linea: SUBBASE, progresivas: [10, 25], ai: CERRADA, desplazamientoM: 0.2 })
    const d = datosDeEstacasDesdeNiveles(r)
    expect(d.alturaInstrumental).toBe(101.5)
    expect(d.comprobado).toBe(true)
    expect(d.filas).toEqual([
      { progresiva: 10, punto: 'Subbase izquierda + 0.200 m', cotaProyecto: 100.045, lecturaObjetivo: 1.455 },
      { progresiva: 25, punto: 'Subbase izquierda + 0.200 m', cotaProyecto: 100.025, lecturaObjetivo: 1.475 },
    ])
    expect(d.mira).toEqual({ largoMira: 5, lecturaMin: 0.3, margenSuperior: 0.3 })
  })

  it('dice cómo salió la cota: proyectado o extrapolado', () => {
    const corta: LineaNivel = { nombre: 'Vereda izquierda', puntos: [punto(0, 100.25), punto(10, 100.24)] }
    const r = nivelARegistrar({ linea: corta, otras: [VEREDA], progresivas: [30], ai: CERRADA })
    expect(datosDeEstacasDesdeNiveles(r).filas[0]!.punto).toBe('Vereda izquierda (proyectado desde Vereda derecha)')
    const sola = nivelARegistrar({ linea: corta, progresivas: [25], ai: CERRADA })
    const d = datosDeEstacasDesdeNiveles(sola)
    expect(d.filas[0]!.punto).toBe('Vereda izquierda (extrapolado)')
    // Una cota extrapolada es una suposición: la hoja sale con la franja.
    expect(d.comprobado).toBe(false)
  })

  it('una progresiva demasiado lejos de la línea: fila sin cota, con el motivo del motor', () => {
    const corta: LineaNivel = { nombre: 'Vereda izquierda', puntos: [punto(0, 100.25), punto(10, 100.24)] }
    const d = datosDeEstacasDesdeNiveles(nivelARegistrar({ linea: corta, progresivas: [400], ai: CERRADA }))
    expect(d.filas[0]!.cotaProyecto).toBeNull()
    expect(d.filas[0]!.motivoSinCota).toContain('390 m')
  })

  it('sin línea para proyectar: fila sin cota y con el motivo', () => {
    const uno: LineaNivel = { nombre: 'Uno', puntos: [punto(50, 100.2)] }
    const d = datosDeEstacasDesdeNiveles(nivelARegistrar({ linea: uno, progresivas: [60], ai: CERRADA }))
    expect(d.filas[0]).toMatchObject({ cotaProyecto: null, motivoSinCota: 'sin línea para proyectar' })
  })

  it('la puesta rápida viaja como no comprobada, con su aviso', () => {
    const d = datosDeEstacasDesdeNiveles(nivelARegistrar({ linea: VEREDA, progresivas: [10], ai: RAPIDA }))
    expect(d.comprobado).toBe(false)
    expect(d.avisos!.join(' ')).toContain('Puesta rápida')
  })

  it('lecturas en cm: la hoja va en metros y lo dice', () => {
    const r = nivelARegistrar({ linea: VEREDA, progresivas: [20], ai: CERRADA, forma: { unidad: 'cm', mira: 'normal' } })
    const d = datosDeEstacasDesdeNiveles(r)
    expect(d.filas[0]!.lecturaObjetivo).toBe(1.265)
    expect(d.avisos!.join(' ')).toContain('en metros')
  })

  it('mira invertida: la lectura es la del motor y el sentido viaja a la hoja', () => {
    const techo: LineaNivel = { nombre: 'Techo', puntos: [punto(0, 102.5), punto(10, 102.6)] }
    const r = nivelARegistrar({ linea: techo, progresivas: [0], ai: CERRADA, forma: { unidad: 'm', mira: 'invertida' } })
    const d = datosDeEstacasDesdeNiveles(r)
    expect(d.filas[0]!.lecturaObjetivo).toBe(1)
    expect(d.sentidoMira).toBe('invertida')
  })

  it('mira invertida: la hoja imprime la regla de corta y rellena al revés', () => {
    const techo: LineaNivel = { nombre: 'Techo', puntos: [punto(0, 102.5), punto(10, 102.6)] }
    const r = nivelARegistrar({ linea: techo, progresivas: [0], ai: CERRADA, forma: { unidad: 'm', mira: 'invertida' } })
    const pdf = hojaDeEstacas({ ...baseDePrueba(false), ...datosDeEstacasDesdeNiveles(r) })
    const texto = enUnaLinea(textoDelPdf(pdf).todo)
    // Z = HI + L: si la mira marca más que el objetivo, la cota está alta → sobra, se corta.
    expect(texto).toContain('lectura objetivo = cota de proyecto - altura instrumental')
    expect(texto).toContain('Si la mira marca más que el objetivo, sobra material (corta)')
    expect(texto).not.toContain('falta material (rellena); si marca menos, sobra')
  })

  it('mira normal: la regla de siempre', () => {
    const r = nivelARegistrar({ linea: VEREDA, progresivas: [10], ai: CERRADA })
    const pdf = hojaDeEstacas({ ...baseDePrueba(false), ...datosDeEstacasDesdeNiveles(r) })
    expect(enUnaLinea(textoDelPdf(pdf).todo)).toContain('Si la mira marca más que el objetivo, falta material (rellena)')
  })

  it('sin altura instrumental: la hoja dice que falta, no inventa la lectura', () => {
    const r = nivelARegistrar({ linea: VEREDA, progresivas: [10], ai: { tipo: 'rapida', cotaBM: Number.NaN, lecturaAtras: 1 } })
    const d = datosDeEstacasDesdeNiveles(r)
    expect(d.alturaInstrumental).toBeNull()
    expect(d.filas[0]!.lecturaObjetivo).toBeNull()
  })

  it('se imprime con hojaDeEstacas tal cual', () => {
    const r = nivelARegistrar({ linea: VEREDA, progresivas: [10, 20, 30], ai: RAPIDA })
    const pdf = hojaDeEstacas({ ...baseDePrueba(false), ...datosDeEstacasDesdeNiveles(r) })
    const linea = enUnaLinea(textoDelPdf(pdf).todo)
    expect(linea).toContain('Altura instrumental: 101.500')
    for (const t of ['100.250', '1.250', '100.235', '1.265', '100.220', '1.280']) expect(linea).toContain(t)
    expect(linea).toContain(AVISO_SIN_COMPROBAR)
  })
})
