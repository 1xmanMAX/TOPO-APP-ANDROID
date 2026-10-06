import { describe, expect, it } from 'vitest'
import { accionDeDiferencia, clasificarLectura, evaluarLectura, rangoEsperado, reglasDeMira } from './avisoLectura'

/** El caso de Max, con la AI sobre un circuito ya cerrado. */
const BASE = { alturaInstrumental: 3246.632, cotaProyecto: 3243.98, toleranciaMm: 20, alturaComprobada: true }

describe('evaluarLectura', () => {
  it('el caso de Max: sobra 12 mm, corta, conforme con tolerancia 20', () => {
    // cota = 3246.632 − 2.640 = 3243.992
    // diferencia = 3243.992 − 3243.980 = +0.012 m = +12 mm → sobra → corta 12
    // esperada = 3246.632 − 3243.980 = 2.652
    const aviso = evaluarLectura({ ...BASE, lectura: 2.64 })
    expect(aviso.cota).toBe(3243.992)
    expect(aviso.diferenciaMm).toBe(12)
    expect(aviso.estado).toBe('conforme')
    expect(aviso.accion).toEqual({ tipo: 'corta', mm: 12 })
    expect(aviso.sospechosa).toBe(false)
    expect(aviso.lecturaEsperada).toBe(2.652)
    expect(aviso.rangoLectura).toBe('legible')
    expect(aviso.rangoLecturaEsperada).toBe('legible')
    expect(aviso.comprobado).toBe(true)
    expect(aviso.avisos).toEqual([])
  })

  it('la mira marca más que lo esperado: falta material, rellena', () => {
    // cota = 3246.632 − 2.677 = 3243.955
    // diferencia = 3243.955 − 3243.980 = −0.025 m = −25 mm → rellena 25
    // |25| > 20 pero ≤ 40 → al límite
    const aviso = evaluarLectura({ ...BASE, lectura: 2.677 })
    expect(aviso.diferenciaMm).toBe(-25)
    expect(aviso.estado).toBe('alLimite')
    expect(aviso.accion).toEqual({ tipo: 'rellena', mm: 25 })
    expect(aviso.sospechosa).toBe(false)
  })

  it('justo en cota: ni corta ni rellena', () => {
    // cota = 3246.632 − 2.652 = 3243.980 = proyecto → 0 mm
    const aviso = evaluarLectura({ ...BASE, lectura: 2.652 })
    expect(aviso.diferenciaMm).toBe(0)
    expect(aviso.accion).toEqual({ tipo: 'enCota', mm: 0 })
    expect(aviso.estado).toBe('conforme')
  })

  it('más del doble de la tolerancia: sospechosa (¿mal leída?) y fuera', () => {
    // cota = 3246.632 − 2.552 = 3244.080
    // diferencia = 3244.080 − 3243.980 = +0.100 m = +100 mm > 2×20 = 40
    const aviso = evaluarLectura({ ...BASE, lectura: 2.552 })
    expect(aviso.diferenciaMm).toBe(100)
    expect(aviso.estado).toBe('fuera')
    expect(aviso.sospechosa).toBe(true)
    expect(aviso.accion).toEqual({ tipo: 'corta', mm: 100 })
  })

  it('exactamente el doble de la tolerancia no es sospechosa todavía', () => {
    // cota = 3246.632 − 2.612 = 3244.020 → +40 mm = 2×20: al límite, no sospechosa
    const aviso = evaluarLectura({ ...BASE, lectura: 2.612 })
    expect(aviso.diferenciaMm).toBe(40)
    expect(aviso.estado).toBe('alLimite')
    expect(aviso.sospechosa).toBe(false)
  })

  it('redondea al milímetro sin arrastrar el error de coma flotante', () => {
    // 100.3 − 1.2 = 99.1 (en flotante 99.09999999999999); proyecto 99.402
    // diferencia = 99.100 − 99.402 = −0.302 m = −302 mm exactos
    const aviso = evaluarLectura({
      alturaInstrumental: 100.3,
      lectura: 1.2,
      cotaProyecto: 99.402,
      toleranciaMm: 10,
      alturaComprobada: true,
    })
    expect(aviso.cota).toBe(99.1)
    expect(aviso.diferenciaMm).toBe(-302)
    expect(aviso.accion).toEqual({ tipo: 'rellena', mm: 302 })
  })

  it('sin cota de proyecto da la cota pero no juzga', () => {
    // cota = 3246.632 − 2.640 = 3243.992; sin proyecto no hay diferencia
    const aviso = evaluarLectura({ ...BASE, lectura: 2.64, cotaProyecto: null })
    expect(aviso.cota).toBe(3243.992)
    expect(aviso.diferenciaMm).toBeNull()
    expect(aviso.estado).toBe('sinRasante')
    expect(aviso.accion).toBeNull()
    expect(aviso.sospechosa).toBe(false)
    expect(aviso.lecturaEsperada).toBeNull()
    expect(aviso.rangoLecturaEsperada).toBeNull()
  })

  describe('nivelación sin cerrar', () => {
    it('el resultado sale igual, pero marcado como no comprobado y dicho', () => {
      // Mismas cuentas que el caso de Max: corta 12, conforme.
      const aviso = evaluarLectura({ ...BASE, lectura: 2.64, alturaComprobada: false })
      expect(aviso.accion).toEqual({ tipo: 'corta', mm: 12 })
      expect(aviso.estado).toBe('conforme')
      expect(aviso.comprobado).toBe(false)
      expect(aviso.avisos).toEqual(['Cota sobre una nivelación sin cerrar: no comprobada.'])
    })
  })

  describe('datos que no son números', () => {
    it('lectura NaN (casillero vacío o con coma): no hay cota ni «en cota 0 mm»', () => {
      const aviso = evaluarLectura({ ...BASE, lectura: Number.NaN })
      expect(aviso.cota).toBeNull()
      expect(aviso.diferenciaMm).toBeNull()
      expect(aviso.accion).toBeNull()
      expect(aviso.estado).toBe('datoInvalido')
      expect(aviso.sospechosa).toBe(true)
      expect(aviso.rangoLectura).toBe('noEsNumero')
      // La esperada sí se puede dar: no depende de la lectura (2.652).
      expect(aviso.lecturaEsperada).toBe(2.652)
      expect(aviso.avisos).toEqual(['La lectura no es un número: vuelva a anotarla.'])
    })

    it('altura instrumental NaN: no se inventa cota ni esperada', () => {
      const aviso = evaluarLectura({ ...BASE, alturaInstrumental: Number.NaN, lectura: 2.64 })
      expect(aviso.cota).toBeNull()
      expect(aviso.lecturaEsperada).toBeNull()
      expect(aviso.accion).toBeNull()
      expect(aviso.estado).toBe('datoInvalido')
      expect(aviso.avisos).toEqual(['La altura instrumental no es un número.'])
    })

    it('cota de proyecto NaN no es «sin rasante»: es un dato roto y se dice', () => {
      // La cota medida sí sale: 3246.632 − 2.640 = 3243.992
      const aviso = evaluarLectura({ ...BASE, lectura: 2.64, cotaProyecto: Number.NaN })
      expect(aviso.cota).toBe(3243.992)
      expect(aviso.diferenciaMm).toBeNull()
      expect(aviso.accion).toBeNull()
      expect(aviso.estado).toBe('datoInvalido')
      expect(aviso.avisos).toEqual(['La cota de proyecto no es un número.'])
    })

    it('tolerancia NaN o negativa: la diferencia sale, el semáforo no', () => {
      // +12 mm como en el caso de Max, pero sin tolerancia no hay ✓ ni ✗
      for (const toleranciaMm of [Number.NaN, -5]) {
        const aviso = evaluarLectura({ ...BASE, lectura: 2.64, toleranciaMm })
        expect(aviso.diferenciaMm).toBe(12)
        expect(aviso.accion).toEqual({ tipo: 'corta', mm: 12 })
        expect(aviso.estado).toBe('datoInvalido')
        expect(aviso.sospechosa).toBe(false)
        expect(aviso.avisos).toEqual(['La tolerancia no es un número válido (≥ 0 mm).'])
      }
    })
  })

  describe('lecturas que la mira no puede dar o que no conviene leer', () => {
    it('lectura negativa: imposible, sospechosa y sin «corta 3152 mm»', () => {
      // AI 100, lectura −0.5, proyecto 100.5: antes salía conforme/enCota
      const aviso = evaluarLectura({
        alturaInstrumental: 100,
        lectura: -0.5,
        cotaProyecto: 100.5,
        toleranciaMm: 20,
        alturaComprobada: true,
      })
      expect(aviso.rangoLectura).toBe('imposible')
      expect(aviso.cota).toBeNull()
      expect(aviso.accion).toBeNull()
      expect(aviso.estado).toBe('datoInvalido')
      expect(aviso.sospechosa).toBe(true)
      expect(aviso.avisos).toEqual(['La lectura -0.500 no cabe en una mira de 4 m: revise la anotación.'])
    })

    it('lectura mayor que la mira: imposible también sin cota de proyecto', () => {
      // 5.200 > 4 m de mira
      const aviso = evaluarLectura({
        alturaInstrumental: 100,
        lectura: 5.2,
        cotaProyecto: null,
        toleranciaMm: 20,
        alturaComprobada: true,
      })
      expect(aviso.rangoLectura).toBe('imposible')
      expect(aviso.sospechosa).toBe(true)
      expect(aviso.estado).toBe('datoInvalido')
    })

    it('la mira puede ser más larga si se configura', () => {
      // 5.200 en una mira de 7 m: cabe y queda bajo 7 − 0.30 = 6.70 → legible
      // cota = 100 − 5.2 = 94.800
      const aviso = evaluarLectura({
        alturaInstrumental: 100,
        lectura: 5.2,
        cotaProyecto: null,
        toleranciaMm: 20,
        alturaComprobada: true,
        mira: { largoMira: 7 },
      })
      expect(aviso.rangoLectura).toBe('legible')
      expect(aviso.cota).toBe(94.8)
    })

    it('lectura bajo 0.30 m: se juzga, pero se avisa que es poco precisa', () => {
      // cota = 100 − 0.12 = 99.880; proyecto 99.880 → 0 mm, en cota
      // esperada = 100 − 99.880 = 0.120, también bajo 0.30
      const aviso = evaluarLectura({
        alturaInstrumental: 100,
        lectura: 0.12,
        cotaProyecto: 99.88,
        toleranciaMm: 20,
        alturaComprobada: true,
      })
      expect(aviso.accion).toEqual({ tipo: 'enCota', mm: 0 })
      expect(aviso.estado).toBe('conforme')
      expect(aviso.rangoLectura).toBe('pocoPrecisa')
      expect(aviso.rangoLecturaEsperada).toBe('pocoPrecisa')
      expect(aviso.avisos).toEqual([
        'La lectura 0.120 está fuera de 0.300 … 3.700 m: poco precisa, mejor cambiar de estación.',
      ])
    })

    it('una esperada que no cabe en la mira se avisa aunque la lectura sea buena', () => {
      // esperada = 100 − 95.5 = 4.500 > 4 m: desde aquí no se ve el punto en cota
      const aviso = evaluarLectura({
        alturaInstrumental: 100,
        lectura: 3,
        cotaProyecto: 95.5,
        toleranciaMm: 20,
        alturaComprobada: true,
      })
      expect(aviso.rangoLectura).toBe('legible')
      expect(aviso.lecturaEsperada).toBe(4.5)
      expect(aviso.rangoLecturaEsperada).toBe('imposible')
      expect(aviso.avisos).toEqual([
        'La lectura esperada 4.500 no cabe en la mira de 4 m: desde esta estación no se puede dejar el punto en cota.',
      ])
    })

    it('reglas de mira absurdas no se aplican en silencio', () => {
      const aviso = evaluarLectura({ ...BASE, lectura: 2.64, mira: { largoMira: 0 } })
      expect(aviso.estado).toBe('datoInvalido')
      expect(aviso.rangoLectura).toBeNull()
      expect(aviso.avisos).toEqual(['Las reglas de la mira no son válidas (largo, lectura mínima, margen).'])
    })
  })
})

describe('clasificarLectura', () => {
  const reglas = reglasDeMira()!

  it('los bordes del rango de precisión: 0.300 y 3.700 son legibles', () => {
    // De fábrica: mínima 0.30, máxima 4 − 0.30 = 3.70
    expect(clasificarLectura(0.299, reglas)).toBe('pocoPrecisa')
    expect(clasificarLectura(0.3, reglas)).toBe('legible')
    expect(clasificarLectura(3.7, reglas)).toBe('legible')
    expect(clasificarLectura(3.701, reglas)).toBe('pocoPrecisa')
  })

  it('los bordes físicos: 0.001 y 4 caben en la mira; 0, −0.001 y 4.001 no', () => {
    // El 0 es imposible, como en la libreta: el hilo no cae en el cero de la mira.
    expect(clasificarLectura(0.001, reglas)).toBe('pocoPrecisa')
    expect(clasificarLectura(0, reglas)).toBe('imposible')
    expect(clasificarLectura(4, reglas)).toBe('pocoPrecisa')
    expect(clasificarLectura(-0.001, reglas)).toBe('imposible')
    expect(clasificarLectura(4.001, reglas)).toBe('imposible')
  })

  it('lo que no es número se dice', () => {
    expect(clasificarLectura(Number.NaN, reglas)).toBe('noEsNumero')
  })
})

describe('reglasDeMira', () => {
  it('de fábrica son las del planificador: 4 m, 0.30 abajo, 0.30 arriba', () => {
    expect(reglasDeMira()).toEqual({ largoMira: 4, lecturaMin: 0.3, margenSuperior: 0.3 })
  })

  it('rechaza un largo nulo, márgenes negativos o un rango vacío', () => {
    expect(reglasDeMira({ largoMira: 0 })).toBeNull()
    expect(reglasDeMira({ largoMira: Number.NaN })).toBeNull()
    expect(reglasDeMira({ lecturaMin: -0.1 })).toBeNull()
    // 0.5 > 0.8 − 0.5 = 0.3: no queda ninguna lectura legible
    expect(reglasDeMira({ largoMira: 0.8, lecturaMin: 0.5, margenSuperior: 0.5 })).toBeNull()
  })
})

describe('accionDeDiferencia', () => {
  it('NaN no es «en cota»', () => {
    expect(accionDeDiferencia(Number.NaN)).toBeNull()
  })
})

describe('rangoEsperado', () => {
  it('lectura esperada ± la tolerancia, en metros de mira', () => {
    // esperada = 3246.632 − 3243.980 = 2.652; ±20 mm → 2.632 … 2.672
    expect(rangoEsperado(3246.632, 3243.98, 20)).toEqual({ desde: 2.632, hasta: 2.672 })
  })

  it('con tolerancia cero el rango es un solo valor', () => {
    // esperada = 101.500 − 100.000 = 1.500
    expect(rangoEsperado(101.5, 100, 0)).toEqual({ desde: 1.5, hasta: 1.5 })
  })

  it('con un dato que no es número no hay rango', () => {
    expect(rangoEsperado(Number.NaN, 100, 20)).toBeNull()
    expect(rangoEsperado(101.5, 100, Number.NaN)).toBeNull()
    expect(rangoEsperado(101.5, 100, -1)).toBeNull()
  })

  it('una lectura en el borde del rango sale conforme en evaluarLectura', () => {
    // hasta = 2.672 → cota = 3246.632 − 2.672 = 3243.960 → −20 mm = −tol → conforme
    const { desde, hasta } = rangoEsperado(3246.632, 3243.98, 20)!
    for (const lectura of [desde, hasta]) {
      const aviso = evaluarLectura({ ...BASE, lectura })
      expect(aviso.estado).toBe('conforme')
    }
  })
})
