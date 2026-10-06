import { describe, expect, it } from 'vitest'
import { baseDePrueba } from './datosDePrueba'
import { AVISO_SIN_COMPROBAR } from './maquetacion'
import { protocoloNivelacion } from './protocoloNivelacion'
import { celdasDesde, enUnaLinea, textoDelPdf } from './textoDelPdf'
import type { FilaProtocolo } from './tipos'

const filas: FilaProtocolo[] = [
  // 100.005 − 100.000 = +5 mm → |5| ≤ 10 CONFORME
  { progresiva: 0, punto: 'Eje', cotaProyecto: 100, cotaMedida: 100.005 },
  // 99.985 − 100.000 = −15 mm → 10 < 15 ≤ 20 AL LÍMITE
  { progresiva: 20, punto: 'Borde izq.', cotaProyecto: 100, cotaMedida: 99.985 },
  // 100.046 − 100.000 = +46 mm → 46 > 20 FUERA
  { progresiva: 40, punto: 'Borde der.', cotaProyecto: 100, cotaMedida: 100.046 },
  { progresiva: 60, punto: 'Eje', cotaProyecto: 100.2, cotaMedida: null },
]

describe('protocoloNivelacion', () => {
  it('lleva encabezado, cada fila con su diferencia y su estado en palabras', () => {
    const bytes = protocoloNivelacion({ ...baseDePrueba(true), filas })
    expect(bytes).toBeInstanceOf(Uint8Array)
    const { todo } = textoDelPdf(bytes)
    expect(todo).toContain('PROTOCOLO DE NIVELACIÓN')
    expect(todo).toContain('Obra: Pavimentación de la Av. Ñaña')
    for (const titulo of ['Progresiva', 'Punto', 'Cota proyecto', 'Cota medida', 'Dif. (mm)', 'Estado'])
      expect(todo).toContain(titulo)
    // Cada fila se comprueba entera, celda por celda, y no en el texto de todo el informe.
    expect(celdasDesde(todo, '0+000', 6)).toEqual(['0+000', 'Eje', '100.000', '100.005', '+5', 'CONFORME'])
    expect(celdasDesde(todo, '0+020', 6)).toEqual(['0+020', 'Borde izq.', '100.000', '99.985', '-15', 'AL LÍMITE'])
    expect(celdasDesde(todo, '0+040', 6)).toEqual(['0+040', 'Borde der.', '100.000', '100.046', '+46', 'FUERA'])
    expect(celdasDesde(todo, '0+060', 6)).toEqual(['0+060', 'Eje', '100.200', '-', '-', 'sin medir'])
    // Resumen: 1 conforme + 1 al límite + 1 fuera + 0 sin rasante + 1 sin medir = 4 puntos
    expect(enUnaLinea(todo)).toContain('4 puntos: 1 conforme, 1 al límite, 1 fuera, 0 sin rasante, 1 sin medir')
    expect(todo).not.toContain(AVISO_SIN_COMPROBAR)
  })

  it('un punto medido donde el proyecto no tiene cota sale «sin rasante» y se cuenta aparte', () => {
    const conVereda: FilaProtocolo[] = [...filas, { progresiva: 80, punto: 'Vereda', cotaProyecto: null, cotaMedida: 100.1 }]
    const { todo } = textoDelPdf(protocoloNivelacion({ ...baseDePrueba(true), filas: conVereda }))
    expect(celdasDesde(todo, '0+080', 6)).toEqual(['0+080', 'Vereda', '-', '100.100', '-', 'sin rasante'])
    // 1 + 1 + 1 + 1 sin rasante + 1 sin medir = 5
    expect(enUnaLinea(todo)).toContain('5 puntos: 1 conforme, 1 al límite, 1 fuera, 1 sin rasante, 1 sin medir')
  })

  it('NaN y undefined no salen como FUERA: NaN es dato inválido, undefined es sin medir', () => {
    const rotas = [
      { progresiva: 0, punto: 'Medida-rota', cotaProyecto: 100, cotaMedida: Number.NaN },
      { progresiva: 20, punto: 'Undef', cotaProyecto: 100, cotaMedida: undefined },
      { progresiva: Number.NaN, punto: 'Prog-rota', cotaProyecto: 100, cotaMedida: 100.001 },
      { progresiva: 40, punto: 'Proy-rota', cotaProyecto: Number.NaN, cotaMedida: 100 },
    ] as unknown as FilaProtocolo[]
    const { todo } = textoDelPdf(protocoloNivelacion({ ...baseDePrueba(true), filas: rotas }))
    expect(celdasDesde(todo, '0+000', 6)).toEqual(['0+000', 'Medida-rota', '100.000', 'dato inválido', '-', 'dato inválido'])
    expect(celdasDesde(todo, '0+020', 6)).toEqual(['0+020', 'Undef', '100.000', '-', '-', 'sin medir'])
    expect(celdasDesde(todo, 'Prog-rota', 5, 0)).toEqual(['Prog-rota', '100.000', '100.001', '-', 'dato inválido'])
    expect(celdasDesde(todo, '0+040', 6)).toEqual(['0+040', 'Proy-rota', 'dato inválido', '100.000', '-', 'dato inválido'])
    expect(todo).not.toContain('NaN')
    expect(todo.split('\n')).not.toContain('FUERA')
    // 0 + 0 + 0 + 0 + 1 sin medir + 3 dato inválido = 4
    expect(enUnaLinea(todo)).toContain(
      '4 puntos: 0 conforme, 0 al límite, 0 fuera, 0 sin rasante, 1 sin medir, 3 con dato inválido',
    )
  })

  it('sin comprobar lleva la franja', () => {
    const { todo } = textoDelPdf(protocoloNivelacion({ ...baseDePrueba(false), filas }))
    expect(enUnaLinea(todo)).toContain(AVISO_SIN_COMPROBAR)
  })

  it('120 filas: varias páginas, la cabecera en cada una y ninguna fila perdida', () => {
    const muchas: FilaProtocolo[] = Array.from({ length: 120 }, (_, i) => ({
      progresiva: i * 10,
      punto: `P-${i + 1}`,
      cotaProyecto: 100,
      cotaMedida: 100.003,
    }))
    const { paginas, todo } = textoDelPdf(protocoloNivelacion({ ...baseDePrueba(true), filas: muchas }))
    expect(paginas.length).toBeGreaterThan(1)
    paginas.forEach((pagina, i) => {
      expect(pagina).toContain('Cota proyecto')
      expect(pagina).toContain(`Página ${i + 1} de ${paginas.length}`)
    })
    const lineas = todo.split('\n')
    for (let i = 1; i <= 120; i++) expect(lineas).toContain(`P-${i}`)
  })
})
