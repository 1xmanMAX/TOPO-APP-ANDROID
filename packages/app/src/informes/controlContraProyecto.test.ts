import { describe, expect, it } from 'vitest'
import { controlContraProyecto } from './controlContraProyecto'
import { baseDePrueba } from './datosDePrueba'
import { AVISO_SIN_COMPROBAR } from './maquetacion'
import { celdasDesde, enUnaLinea, textoDelPdf } from './textoDelPdf'
import type { FilaProtocolo } from './tipos'

const filas: FilaProtocolo[] = [
  // +4 mm: conforme, no se lista
  { progresiva: 0, punto: 'Conforme-A', cotaProyecto: 100, cotaMedida: 100.004 },
  // 100.046 − 100.000 = +46 mm: sobra → «corta 46 mm», FUERA (46 > 2×10)
  { progresiva: 20, punto: 'Alto', cotaProyecto: 100, cotaMedida: 100.046 },
  // 99.977 − 100.000 = −23 mm: falta → «rellena 23 mm», FUERA (23 > 20)
  { progresiva: 40, punto: 'Bajo', cotaProyecto: 100, cotaMedida: 99.977 },
  // 100.512 − 100.500 = +12 mm: AL LÍMITE (10 < 12 ≤ 20), «corta 12 mm»
  { progresiva: 60, punto: 'Justo', cotaProyecto: 100.5, cotaMedida: 100.512 },
  { progresiva: 80, punto: 'Pendiente', cotaProyecto: 100, cotaMedida: null },
]

describe('controlContraProyecto', () => {
  it('lista solo lo que está al límite o fuera, con la corrección en palabras', () => {
    const { todo } = textoDelPdf(controlContraProyecto({ ...baseDePrueba(true), filas }))
    expect(todo).toContain('CONTROL CONTRA PROYECTO')
    expect(celdasDesde(todo, '0+020', 6)).toEqual(['0+020', 'Alto', '100.000', '100.046', 'corta 46 mm', 'FUERA'])
    expect(celdasDesde(todo, '0+040', 6)).toEqual(['0+040', 'Bajo', '100.000', '99.977', 'rellena 23 mm', 'FUERA'])
    expect(celdasDesde(todo, '0+060', 6)).toEqual(['0+060', 'Justo', '100.500', '100.512', 'corta 12 mm', 'AL LÍMITE'])
    // tol 10 → al límite hasta 2 × 10 = ±20
    expect(enUnaLinea(todo)).toContain('Puntos al límite (hasta ±20 mm)')
    const lineas = todo.split('\n')
    expect(lineas).not.toContain('Conforme-A')
    expect(lineas).not.toContain('Pendiente')
    // Lo que no se lista se cuenta: 1 conforme, 0 sin rasante y 1 sin medir
    expect(enUnaLinea(todo)).toContain('No se listan 1 punto conforme, 0 puntos sin rasante y 1 punto sin medir')
    expect(todo).not.toContain(AVISO_SIN_COMPROBAR)
  })

  it('todo conforme: lo dice en vez de entregar una tabla vacía', () => {
    const { todo } = textoDelPdf(controlContraProyecto({ ...baseDePrueba(true), filas: filas.slice(0, 1) }))
    expect(enUnaLinea(todo)).toContain('Ningún punto al límite ni fuera de tolerancia (±10 mm)')
  })

  it('si no se midió nada, no lo presenta como «todo conforme»', () => {
    const sinMedir: FilaProtocolo[] = [
      { progresiva: 0, punto: 'A', cotaProyecto: 100, cotaMedida: null },
      { progresiva: 20, punto: 'B', cotaProyecto: 100, cotaMedida: null },
    ]
    const linea = enUnaLinea(textoDelPdf(controlContraProyecto({ ...baseDePrueba(true), filas: sinMedir })).todo)
    expect(linea).toContain('Ningún punto medido todavía: no hay nada que controlar.')
    expect(linea).not.toContain('Ningún punto al límite')
  })

  it('un dato que no es número no se vuelve una orden de cortar ni «en cota»: se lista aparte', () => {
    const rotas = [
      ...filas,
      { progresiva: 100, punto: 'Roto', cotaProyecto: 100, cotaMedida: Number.NaN },
      { progresiva: 120, punto: 'Vereda', cotaProyecto: null, cotaMedida: 100.3 },
    ] as FilaProtocolo[]
    const { todo } = textoDelPdf(controlContraProyecto({ ...baseDePrueba(true), filas: rotas }))
    const linea = enUnaLinea(todo)
    expect(todo).not.toContain('NaN')
    expect(todo).not.toContain('en cota')
    expect(todo.split('\n')).not.toContain('Roto')
    expect(linea).toContain('1 punto con dato inválido, revise la anotación: Roto (0+100).')
    expect(linea).toContain('No se listan 1 punto conforme, 1 punto sin rasante y 1 punto sin medir')
  })

  it('tolerancia con decimales: el límite sale redondeado, no el número crudo', () => {
    const base = baseDePrueba(true)
    // 12·√0.5 = 8.4853 → 2 × 8.4853 = 16.97 → a un decimal 17.0 → «17»
    const tol = 12 * Math.sqrt(0.5)
    const { todo } = textoDelPdf(
      controlContraProyecto({ ...base, encabezado: { ...base.encabezado, toleranciaMm: tol }, filas }),
    )
    expect(enUnaLinea(todo)).toContain('Puntos al límite (hasta ±17 mm)')
    expect(todo).not.toContain('16.97')
  })

  it('sin comprobar lleva la franja', () => {
    const { todo } = textoDelPdf(controlContraProyecto({ ...baseDePrueba(false), filas }))
    expect(enUnaLinea(todo)).toContain(AVISO_SIN_COMPROBAR)
  })
})
