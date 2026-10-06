import { describe, expect, it } from 'vitest'
import { baseDePrueba } from './datosDePrueba'
import type { HojaDeReplanteo } from '@topo/core'
import { datosDeEstacasDesdeHoja, hojaDeEstacas } from './hojaDeEstacas'
import { AVISO_SIN_COMPROBAR } from './maquetacion'
import { celdasDesde, enUnaLinea, textoDelPdf } from './textoDelPdf'
import type { DatosEstacas } from './tipos'

const datos = (comprobado: boolean): DatosEstacas => ({
  ...baseDePrueba(comprobado),
  alturaInstrumental: 101.5,
  filas: [
    // lectura objetivo = AI − cota = 101.500 − 100.250 = 1.250
    { progresiva: 0, punto: 'Eje', cotaProyecto: 100.25 },
    // viene dada: se respeta (1.400)
    { progresiva: 20, punto: 'Borde', cotaProyecto: 100.1, lecturaObjetivo: 1.4 },
    // 101.500 − 101.800 = −0.300: la cota queda sobre el instrumento
    { progresiva: 40, punto: 'Alto', cotaProyecto: 101.8 },
  ],
})

describe('hojaDeEstacas', () => {
  it('lectura objetivo calculada y una columna en blanco para anotar', () => {
    const { todo } = textoDelPdf(hojaDeEstacas(datos(true)))
    const linea = enUnaLinea(todo)
    expect(todo).toContain('HOJA DE ESTACAS')
    for (const t of ['Progresiva', 'Punto', 'Cota proyecto', 'Lectura objetivo', 'Lectura en campo'])
      expect(todo).toContain(t)
    expect(linea).toContain('Altura instrumental: 101.500')
    expect(todo).toContain('1.250')
    expect(todo).toContain('1.400')
    expect(todo).toContain('100.250')
    expect(linea).toContain('sobre el instrumento')
    expect(linea).toContain(
      'Si la mira marca más que el objetivo, falta material (rellena); si marca menos, sobra (corta).',
    )
    expect(todo).not.toContain(AVISO_SIN_COMPROBAR)
  })

  it('sin altura instrumental y sin lectura dada: lo dice en la fila', () => {
    const d = { ...datos(true), alturaInstrumental: null }
    const linea = enUnaLinea(textoDelPdf(hojaDeEstacas(d)).todo)
    expect(linea).toContain('falta altura instr.')
    expect(linea).toContain('Altura instrumental: sin plantar el equipo')
    // la que vino dada sigue saliendo
    expect(linea).toContain('1.400')
  })

  it('sin comprobar lleva la franja', () => {
    expect(enUnaLinea(textoDelPdf(hojaDeEstacas(datos(false))).todo)).toContain(AVISO_SIN_COMPROBAR)
  })
})

describe('hojaDeEstacas: reglas de la mira (diseño §2) y la forma del núcleo', () => {
  /*
   * AI = 3826.950, mira de 4 m: legible entre 0.30 y 4 − 0.30 = 3.70.
   *   3826.950 − 3822.700 = 4.250 > 4    → no cabe en la mira
   *   3826.950 − 3826.950 = 0.000        → imposible (el hilo no cae en el cero)
   *   3826.950 − 3826.850 = 0.100 < 0.30 → poco precisa
   *   3826.950 − 3825.450 = 1.500        → legible, sin comentario
   */
  const base = (): DatosEstacas => ({
    ...baseDePrueba(true),
    mira: { largoMira: 4 },
    alturaInstrumental: 3826.95,
    filas: [
      { progresiva: 0, punto: 'Lejos', cotaProyecto: 3822.7 },
      { progresiva: 20, punto: 'Cero', cotaProyecto: 3826.95 },
      { progresiva: 40, punto: 'Suelo', cotaProyecto: 3826.85 },
      { progresiva: 60, punto: 'Bien', cotaProyecto: 3825.45 },
      { progresiva: 80, punto: 'Vereda', cotaProyecto: null, motivoSinCota: 'fuera de sección' },
      { progresiva: 100, punto: 'Roto', cotaProyecto: Number.NaN },
    ],
    avisos: ['1 lectura objetivo no cabe en la mira de 4 m: cambie de estación.'],
  })

  it('marca lo que no cabe en la mira, lo imposible y lo poco preciso', () => {
    const { todo } = textoDelPdf(hojaDeEstacas(base()))
    const linea = enUnaLinea(todo)
    expect(linea).toContain('4.250 (no cabe en la mira de 4 m: cambiar de estación)')
    expect(linea).toContain('0.000 (lectura imposible: cambiar de estación)')
    expect(linea).toContain('0.100 (poco precisa)')
    expect(celdasDesde(todo, '0+060', 4)).toEqual(['0+060', 'Bien', '3825.450', '1.500'])
    expect(linea).toContain('Mira de 4 m: lectura legible entre 0.300 y 3.700 m.')
  })

  it('las filas sin cota de proyecto salen con su motivo, y los avisos del núcleo se imprimen', () => {
    const { todo } = textoDelPdf(hojaDeEstacas(base()))
    const linea = enUnaLinea(todo)
    expect(celdasDesde(todo, '0+080', 3)).toEqual(['0+080', 'Vereda', '-'])
    expect(linea).toContain('sin cota de proyecto (fuera de sección)')
    expect(celdasDesde(todo, '0+100', 4)).toEqual(['0+100', 'Roto', 'dato inválido', 'dato inválido'])
    expect(todo).not.toContain('NaN')
    expect(linea).toContain('1 lectura objetivo no cabe en la mira de 4 m: cambie de estación.')
  })

  it('una lectura objetivo negativa sigue avisando que la cota queda sobre el instrumento', () => {
    const d = { ...base(), filas: [{ progresiva: 0, punto: 'Alto', cotaProyecto: 3827.25 }] }
    // 3826.950 − 3827.250 = −0.300
    expect(enUnaLinea(textoDelPdf(hojaDeEstacas(d)).todo)).toContain(
      '-0.300 (cota sobre el instrumento: cambiar de estación)',
    )
  })

  it('adapta la hoja de replanteo del núcleo sin perder filas ni avisos', () => {
    const hoja: HojaDeReplanteo = {
      alturaInstrumental: 101.5,
      capaId: 'c1',
      toleranciaMm: 10,
      comprobado: false,
      filas: [
        // 101.500 − 100.250 = 1.250
        { progresiva: 0, puntoId: 'p1', nombre: 'Eje', offset: 0, cotaProyecto: 100.25, lecturaObjetivo: 1.25, motivoSinObjetivo: null, rangoObjetivo: 'legible', aceptable: { desde: 1.24, hasta: 1.26 }, distanciaEstacion: 70, fueraDeAlcance: true },
        { progresiva: 0, puntoId: 'p2', nombre: 'Vereda', offset: 6, cotaProyecto: null, lecturaObjetivo: null, motivoSinObjetivo: 'fueraDeSeccion', rangoObjetivo: null, aceptable: null, distanciaEstacion: 70, fueraDeAlcance: true },
      ],
      avisos: ['Cotas sobre una nivelación sin cerrar: no comprobadas.'],
    }
    const datos = { ...baseDePrueba(true), ...datosDeEstacasDesdeHoja(hoja) }
    expect(datos.comprobado).toBe(false)
    expect(datos.filas).toHaveLength(2)
    const { todo } = textoDelPdf(hojaDeEstacas(datos))
    const linea = enUnaLinea(todo)
    expect(linea).toContain('1.250 (visual demasiado larga)')
    expect(linea).toContain('sin cota de proyecto (fuera de sección)')
    expect(linea).toContain('Cotas sobre una nivelación sin cerrar: no comprobadas.')
    expect(linea).toContain(AVISO_SIN_COMPROBAR)
  })
})
