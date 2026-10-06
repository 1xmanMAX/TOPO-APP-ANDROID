import { describe, expect, it } from 'vitest'
import { baseDePrueba } from './datosDePrueba'
import { libretaConCierre } from './libretaConCierre'
import { AVISO_SIN_COMPROBAR } from './maquetacion'
import { celdasDesde, enUnaLinea, textoDelPdf } from './textoDelPdf'
import type { DatosLibreta } from './tipos'

/*
 * Circuito a mano: BM-1 cota 100.000
 *   BM-1  atrás 1.500 → AI 101.500
 *   Eje   intermedia 1.300 → cota 101.500 − 1.300 = 100.200 (no es punto de cambio)
 *   PC-1  adelante 1.200 → cota 100.300; atrás 1.400 → AI 101.700
 *   BM-1  adelante 1.694 → cota 100.006
 * Error de cierre = 100.006 − 100.000 = +6 mm. Tolerancia 12·√0.25 = 6 mm → dentro (6 ≤ 6).
 * Σ atrás = 1.500 + 1.400 = 2.900; Σ adelante = 1.200 + 1.694 = 2.894 (la intermedia no entra;
 * con ella daría 4.194); Σ atrás − Σ adelante = +0.006 = 100.006 − 100.000 (comprobación aritmética).
 */
const datos = (comprobado: boolean): DatosLibreta => ({
  ...baseDePrueba(comprobado),
  filas: [
    { punto: 'BM-1', atras: 1.5, intermedia: null, adelante: null, alturaInstrumental: 101.5, cota: 100, correccionMm: 0, cotaCompensada: 100 },
    { punto: 'Eje', atras: null, intermedia: 1.3, adelante: null, alturaInstrumental: null, cota: 100.2, correccionMm: -3, cotaCompensada: 100.197 },
    { punto: 'PC-1', atras: 1.4, intermedia: null, adelante: 1.2, alturaInstrumental: 101.7, cota: 100.3, correccionMm: -3, cotaCompensada: 100.297 },
    { punto: 'BM-1', atras: null, intermedia: null, adelante: 1.694, alturaInstrumental: null, cota: 100.006, correccionMm: -6, cotaCompensada: 100 },
  ],
  cierre: {
    puntoDeCierre: 'BM-1',
    cotaCalculada: 100.006,
    cotaConocida: 100,
    toleranciaMm: 6,
    distanciaKm: 0.25,
    compensacion: 'Proporcional al número de estaciones',
  },
})

describe('libretaConCierre', () => {
  it('lleva las estaciones, la intermedia fuera de las sumas y el cierre', () => {
    const { todo } = textoDelPdf(libretaConCierre(datos(true)))
    const linea = enUnaLinea(todo)
    expect(todo).toContain('LIBRETA DE NIVELACIÓN CON CIERRE')
    for (const t of ['Punto', 'Atrás', 'Intermedia', 'Adelante', 'Alt. instr.', 'Cota', 'Corr. (mm)', 'Cota compensada'])
      expect(todo).toContain(t)
    expect(todo).toContain('PC-1')
    expect(todo).toContain('1.300')
    expect(todo).toContain('100.200')
    expect(todo).toContain('1.694')
    expect(todo).toContain('101.700')
    expect(todo).toContain('100.297')
    expect(celdasDesde(todo, 'Sumas', 3)).toEqual(['Sumas', '2.900', '2.894'])
    expect(todo).not.toContain('4.194')
    expect(linea).toContain('Suma atrás - suma adelante = +0.006 m')
    // 100.006 − 100.000 = +0.006 = Σ atrás − Σ adelante
    expect(linea).toContain('Comprobación correcta: última cota - primera = +0.006 m')
    expect(linea).toContain('Error de cierre en BM-1: 100.006 - 100.000 = +6 mm')
    expect(linea).toContain('Tolerancia: ±6 mm (0.25 km)')
    expect(linea).toContain('Dentro de tolerancia')
    expect(linea).toContain('Compensación: Proporcional al número de estaciones')
    expect(todo).not.toContain(AVISO_SIN_COMPROBAR)
  })

  it('si las cotas no salen de las lecturas, la comprobación aritmética lo dice', () => {
    const d = datos(true)
    // Cota final mal transcrita: 100.016. Última − primera = +0.016; Σ = +0.006 → no cuadra por 10 mm
    d.filas[3] = { ...d.filas[3]!, cota: 100.016 }
    const linea = enUnaLinea(textoDelPdf(libretaConCierre(d)).todo)
    expect(linea).toContain('No cuadra por 10 mm: última cota - primera = +0.016 m')
    expect(linea).not.toContain('Comprobación correcta')
  })

  it('error mayor que la tolerancia: lo dice', () => {
    const d = datos(false)
    // 100.020 − 100.000 = +20 mm > 6 mm
    d.cierre = { ...d.cierre!, cotaCalculada: 100.02 }
    const linea = enUnaLinea(textoDelPdf(libretaConCierre(d)).todo)
    expect(linea).toContain('+20 mm')
    expect(linea).toContain('Fuera de tolerancia')
    expect(linea).toContain(AVISO_SIN_COMPROBAR)
  })

  it('sin cierre: explica que no volvió a un punto de cota conocida', () => {
    const linea = enUnaLinea(textoDelPdf(libretaConCierre({ ...datos(false), cierre: null })).todo)
    expect(linea).toContain('Sin cierre: la nivelación no volvió a un punto de cota conocida')
    expect(linea).toContain(AVISO_SIN_COMPROBAR)
  })

  it('sin cierre la franja sale aunque quien llama diga comprobado', () => {
    const { todo } = textoDelPdf(libretaConCierre({ ...datos(true), cierre: null }))
    expect(enUnaLinea(todo)).toContain(AVISO_SIN_COMPROBAR)
    // Las cotas compensadas no valen sin cierre: no se imprimen como si valieran.
    expect(todo).not.toContain('100.297')
    expect(todo).not.toContain('Compensación:')
  })

  it('cierre fuera de tolerancia: franja aunque digan comprobado, y la compensación no se presenta como aplicada', () => {
    const d = datos(true)
    // K = 0.5 km → tol = 12·√0.5 = 8.485 mm → «±8.5 mm». Error 100.019 − 100.000 = +19 mm > 8.485 → fuera
    d.cierre = { ...d.cierre!, cotaCalculada: 100.019, toleranciaMm: 12 * Math.sqrt(0.5), distanciaKm: 0.5 }
    const { todo } = textoDelPdf(libretaConCierre(d))
    const linea = enUnaLinea(todo)
    expect(linea).toContain(AVISO_SIN_COMPROBAR)
    expect(linea).toContain('Tolerancia: ±8.5 mm (0.50 km)')
    expect(todo).not.toContain('8.48528')
    expect(linea).toContain('Fuera de tolerancia')
    expect(todo).not.toContain('100.297')
    expect(todo.split('\n')).toContain('no válida')
    expect(linea).toContain('Compensación: no se aplica, el cierre está fuera de tolerancia.')
  })

  it('juzga el cierre con el mismo criterio que la pantalla (error sin redondear)', () => {
    const d = datos(true)
    // 100.0064 − 100.000 = 6.4 mm; tolerancia 6.2 → 6.4 > 6.2 + 0.001: fuera (redondeado a 6 mm diría «dentro»)
    d.cierre = { ...d.cierre!, cotaCalculada: 100.0064, toleranciaMm: 6.2 }
    const linea = enUnaLinea(textoDelPdf(libretaConCierre(d)).todo)
    expect(linea).toContain('= +6.4 mm')
    expect(linea).toContain('Tolerancia: ±6.2 mm')
    expect(linea).toContain('Fuera de tolerancia')
    expect(linea).not.toContain('Dentro de tolerancia')
    expect(linea).toContain(AVISO_SIN_COMPROBAR)
  })

  it('un cierre con datos que no son número no se juzga: dato inválido y franja', () => {
    const d = datos(true)
    d.cierre = { ...d.cierre!, cotaCalculada: Number.NaN }
    const { todo } = textoDelPdf(libretaConCierre(d))
    const linea = enUnaLinea(todo)
    expect(todo).not.toContain('NaN')
    expect(linea).toContain('Cierre con datos inválidos: no se puede juzgar.')
    expect(linea).not.toContain('Dentro de tolerancia')
    expect(linea).toContain(AVISO_SIN_COMPROBAR)
  })
})
