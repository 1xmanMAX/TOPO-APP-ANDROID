import { describe, expect, it } from 'vitest'
import {
  anguloSexagesimal,
  azimutEntre,
  distanciaEntre,
  replanteoConEstacion,
  replanteoConGnss,
  veredictoDeCota,
  AVISO_COTA_GNSS,
} from './replanteoCoord'

const E = { x: 1000, y: 5000 }

/** Un punto a `d` metros de E con azimut `g` grados. */
function en(g: number, d: number) {
  const r = (g * Math.PI) / 180
  return { x: 1000 + d * Math.sin(r), y: 5000 + d * Math.cos(r) }
}

describe('azimutEntre: desde el norte, en sentido horario', () => {
  it('los cuatro cuadrantes', () => {
    expect(azimutEntre(E, { x: 1010, y: 5010 })).toBeCloseTo(45, 10) // NE
    expect(azimutEntre(E, { x: 1010, y: 4990 })).toBeCloseTo(135, 10) // SE
    expect(azimutEntre(E, { x: 990, y: 4990 })).toBeCloseTo(225, 10) // SO
    expect(azimutEntre(E, { x: 990, y: 5010 })).toBeCloseTo(315, 10) // NO
  })

  it('los ejes: norte 0, este 90, sur 180, oeste 270 (nunca 360 ni negativo)', () => {
    expect(azimutEntre(E, { x: 1000, y: 5010 })).toBe(0)
    expect(azimutEntre(E, { x: 1010, y: 5000 })).toBeCloseTo(90, 10)
    expect(azimutEntre(E, { x: 1000, y: 4990 })).toBeCloseTo(180, 10)
    expect(azimutEntre(E, { x: 990, y: 5000 })).toBeCloseTo(270, 10)
  })

  it('un punto apenas al oeste del norte da casi 360, no un negativo', () => {
    const az = azimutEntre(E, { x: 999.999, y: 5100 })!
    expect(az).toBeGreaterThan(359.99)
    expect(az).toBeLessThan(360)
  })

  it('null si los puntos coinciden o algo no es número', () => {
    expect(azimutEntre(E, { x: 1000, y: 5000 })).toBeNull()
    expect(azimutEntre(E, { x: Number.NaN, y: 5000 })).toBeNull()
  })
})

describe('distanciaEntre', () => {
  it('3-4-5 y redondeo al mm', () => {
    expect(distanciaEntre(E, { x: 1003, y: 5004 })).toBe(5)
    expect(distanciaEntre(E, { x: 1000.0004, y: 5000 })).toBe(0)
  })
  it('null si algo no es número', () => {
    expect(distanciaEntre(E, { x: Infinity, y: 0 })).toBeNull()
  })
})

describe('anguloSexagesimal: texto 47°12′30″', () => {
  it('grados, minutos y segundos con dos cifras', () => {
    const a = anguloSexagesimal(47 + 12 / 60 + 30 / 3600)!
    expect(a).toMatchObject({ grados: 47, minutos: 12, segundos: 30 })
    expect(a.texto).toBe('47°12′30″')
    expect(anguloSexagesimal(5 + 3 / 60 + 7 / 3600)!.texto).toBe('5°03′07″')
  })

  it('el redondeo de segundos arrastra a minutos y grados', () => {
    expect(anguloSexagesimal(10 + 59 / 60 + 59.7 / 3600)!.texto).toBe('11°00′00″')
  })

  it('casi 360 se escribe 0°00′00″, no 360°00′00″', () => {
    expect(anguloSexagesimal(359.99999)!.texto).toBe('0°00′00″')
    expect(anguloSexagesimal(360)!.texto).toBe('0°00′00″')
  })

  it('se normaliza a 0…360', () => {
    expect(anguloSexagesimal(-90)!.texto).toBe('270°00′00″')
    expect(anguloSexagesimal(450)!.texto).toBe('90°00′00″')
  })

  it('con decimales de segundo', () => {
    expect(anguloSexagesimal(47 + 12 / 60 + 30.46 / 3600, 1)!.texto).toBe('47°12′30.5″')
  })

  it('null si no es número', () => {
    expect(anguloSexagesimal(Number.NaN)).toBeNull()
  })
})

describe('replanteoConEstacion: ángulo horizontal horario desde el atrás', () => {
  const estacion = { x: 1000, y: 5000 }

  it('atrás al norte: el ángulo es el azimut del punto, en los cuatro cuadrantes', () => {
    const atras = { x: 1000, y: 5100 }
    const casos: [number, number, number][] = [
      [1010, 5010, 45],
      [1010, 4990, 135],
      [990, 4990, 225],
      [990, 5010, 315],
    ]
    for (const [x, y, angulo] of casos) {
      const r = replanteoConEstacion({ estacion, atras, objetivo: { x, y } })
      expect(r.anguloHorizontal).toBeCloseTo(angulo, 9)
      expect(r.distanciaHorizontal).toBe(14.142)
    }
  })

  it('atrás en otro cuadrante (SO): el ángulo sigue en 0…360 para los cuatro cuadrantes', () => {
    const atras = en(225, 60)
    const casos: [number, number][] = [
      [45, 180],
      [135, 270],
      [200, 335],
      [315, 90],
    ]
    for (const [az, angulo] of casos) {
      const r = replanteoConEstacion({ estacion, atras, objetivo: en(az, 12) })
      expect(r.anguloHorizontal).toBeCloseTo(angulo, 9)
    }
  })

  it('atrás al este: se resta el azimut del atrás', () => {
    const r = replanteoConEstacion({ estacion, atras: { x: 1100, y: 5000 }, objetivo: { x: 1000, y: 4980 } })
    expect(r.azimutAtras).toBeCloseTo(90, 9)
    expect(r.azimutObjetivo).toBeCloseTo(180, 9)
    expect(r.anguloHorizontal).toBeCloseTo(90, 9)
    expect(r.anguloTexto).toBe('90°00′00″')
    expect(r.azimutTexto).toBe('180°00′00″')
    expect(r.distanciaHorizontal).toBe(20)
  })

  it('paso por 0°: atrás a 350°, punto a 10° → 20°', () => {
    const r = replanteoConEstacion({ estacion, atras: en(350, 80), objetivo: en(10, 25) })
    expect(r.anguloHorizontal).toBeCloseTo(20, 9)
    expect(r.anguloTexto).toBe('20°00′00″')
  })

  it('paso por 360°: atrás a 10°, punto a 350° → 340°, no −20°', () => {
    const r = replanteoConEstacion({ estacion, atras: en(10, 80), objetivo: en(350, 25) })
    expect(r.anguloHorizontal).toBeCloseTo(340, 9)
    expect(r.anguloTexto).toBe('340°00′00″')
  })

  it('punto en la misma dirección que el atrás → 0°00′00″', () => {
    const r = replanteoConEstacion({ estacion, atras: { x: 1050, y: 5050 }, objetivo: { x: 1010, y: 5010 } })
    expect(r.anguloHorizontal).toBeCloseTo(0, 9)
    expect(r.anguloTexto).toBe('0°00′00″')
  })

  it('un ángulo con minutos y segundos', () => {
    const r = replanteoConEstacion({ estacion, atras: { x: 1000, y: 5200 }, objetivo: en(47 + 12 / 60 + 30 / 3600, 30) })
    expect(r.anguloTexto).toBe('47°12′30″')
    expect(r.distanciaHorizontal).toBe(30)
  })

  it('control del atrás: compara la distancia medida con la calculada', () => {
    const atras = { x: 1000, y: 5100 }
    const bien = replanteoConEstacion({ estacion, atras, objetivo: { x: 1010, y: 5010 }, distanciaAtrasMedida: 100.008 })
    expect(bien.diferenciaAtrasM).toBe(0.008)
    expect(bien.avisos).toEqual([])
    const mal = replanteoConEstacion({ estacion, atras, objetivo: { x: 1010, y: 5010 }, distanciaAtrasMedida: 100.25 })
    expect(mal.diferenciaAtrasM).toBe(0.25)
    expect(mal.avisos.join(' ')).toMatch(/atrás/)
    expect(mal.avisos.join(' ')).toMatch(/0\.250/)
  })

  it('sin distancia medida al atrás no hay control', () => {
    const r = replanteoConEstacion({ estacion, atras: { x: 1000, y: 5100 }, objetivo: { x: 1010, y: 5010 } })
    expect(r.diferenciaAtrasM).toBeNull()
    expect(r.distanciaAtras).toBe(100)
  })

  it('atrás sobre la estación: no hay orientación', () => {
    const r = replanteoConEstacion({ estacion, atras: { x: 1000, y: 5000 }, objetivo: { x: 1010, y: 5010 } })
    expect(r.anguloHorizontal).toBeNull()
    expect(r.anguloTexto).toBeNull()
    expect(r.azimutObjetivo).toBeCloseTo(45, 9)
    expect(r.distanciaHorizontal).toBe(14.142)
    expect(r.avisos.join(' ')).toMatch(/atrás.*estación/)
  })

  it('punto sobre la estación: no hay ángulo ni distancia que replantear', () => {
    const r = replanteoConEstacion({ estacion, atras: { x: 1000, y: 5100 }, objetivo: { x: 1000, y: 5000 } })
    expect(r.anguloHorizontal).toBeNull()
    expect(r.distanciaHorizontal).toBe(0)
    expect(r.avisos.join(' ')).toMatch(/estación/)
  })

  it('un dato que no es número se dice', () => {
    const r = replanteoConEstacion({ estacion, atras: { x: 1000, y: 5100 }, objetivo: { x: Number.NaN, y: 5000 } })
    expect(r.anguloHorizontal).toBeNull()
    expect(r.distanciaHorizontal).toBeNull()
    expect(r.avisos.join(' ')).toMatch(/no es un número/)
  })
})

describe('replanteoConGnss: cuánto avanzar', () => {
  it('al norte y al oeste, con distancia y azimut', () => {
    const r = replanteoConGnss({ x: 477000.5, y: 8665500 }, { x: 476999.5, y: 8665501.5 })
    expect(r.avanzarNorteM).toBe(1.5)
    expect(r.avanzarEsteM).toBe(-1)
    expect(r.distanciaM).toBe(1.803)
    expect(r.azimut!).toBeCloseTo(326.31, 2)
    expect(r.llego).toBe(false)
    expect(r.indicacion).toBe('Avance 1.500 m al norte y 1.000 m al oeste')
  })

  it('al sur y al este', () => {
    const r = replanteoConGnss({ x: 0, y: 0 }, { x: 0.3, y: -2 })
    expect(r.indicacion).toBe('Avance 2.000 m al sur y 0.300 m al este')
  })

  it('solo en una dirección no menciona la otra', () => {
    const r = replanteoConGnss({ x: 0, y: 0 }, { x: 0, y: 3 })
    expect(r.indicacion).toBe('Avance 3.000 m al norte')
  })

  it('dentro de la tolerancia de llegada (2 cm por defecto): llegó', () => {
    const r = replanteoConGnss({ x: 0, y: 0 }, { x: 0.01, y: 0.01 })
    expect(r.llego).toBe(true)
    expect(r.indicacion).toBe('En el punto')
    const estricto = replanteoConGnss({ x: 0, y: 0 }, { x: 0.01, y: 0.01 }, { toleranciaLlegadaM: 0.005 })
    expect(estricto.llego).toBe(false)
  })

  it('al llegar con cotas, da el veredicto de cota (GNSS: no comprobado por defecto)', () => {
    const r = replanteoConGnss({ x: 0, y: 0, z: 3250.12 }, { x: 0, y: 0.005, z: 3250.1 }, { toleranciaMm: 10 })
    expect(r.cota).not.toBeNull()
    expect(r.cota!.diferenciaMm).toBe(20)
    expect(r.cota!.tipo).toBe('corta')
    expect(r.cota!.estado).toBe('alLimite')
    expect(r.cota!.comprobado).toBe(false)
    const comprobada = replanteoConGnss({ x: 0, y: 0, z: 3250.1 }, { x: 0, y: 0, z: 3250.1 }, { toleranciaMm: 10, cotaComprobada: true })
    expect(comprobada.cota!.comprobado).toBe(true)
  })

  it('sin llegar no se juzga la cota', () => {
    const r = replanteoConGnss({ x: 0, y: 0, z: 3250.12 }, { x: 0, y: 2, z: 3250.1 }, { toleranciaMm: 10 })
    expect(r.cota).toBeNull()
  })

  it('un dato que no es número se dice', () => {
    const r = replanteoConGnss({ x: Number.NaN, y: 0 }, { x: 0, y: 2 })
    expect(r.distanciaM).toBeNull()
    expect(r.llego).toBe(false)
    expect(r.avisos.join(' ')).toMatch(/no es un número/)
  })
})

describe('veredictoDeCota: el semáforo del motor sobre una cota medida', () => {
  it('positivo corta, negativo rellena, cero en cota', () => {
    expect(veredictoDeCota({ cotaMedida: 100.012, cotaProyecto: 100, toleranciaMm: 10, comprobado: true })).toMatchObject({
      diferenciaMm: 12,
      tipo: 'corta',
      mm: 12,
      estado: 'alLimite',
      sospechosa: false,
    })
    expect(veredictoDeCota({ cotaMedida: 99.993, cotaProyecto: 100, toleranciaMm: 10, comprobado: true })).toMatchObject({
      diferenciaMm: -7,
      tipo: 'rellena',
      mm: 7,
      estado: 'conforme',
    })
    expect(veredictoDeCota({ cotaMedida: 100, cotaProyecto: 100, toleranciaMm: 10, comprobado: true }).tipo).toBe('enCota')
  })

  it('bordes: igual a la tolerancia es conforme; pasado el doble es fuera y sospechosa', () => {
    expect(veredictoDeCota({ cotaMedida: 100.01, cotaProyecto: 100, toleranciaMm: 10, comprobado: true }).estado).toBe('conforme')
    expect(veredictoDeCota({ cotaMedida: 100.02, cotaProyecto: 100, toleranciaMm: 10, comprobado: true }).estado).toBe('alLimite')
    const fuera = veredictoDeCota({ cotaMedida: 99.97, cotaProyecto: 100, toleranciaMm: 10, comprobado: true })
    expect(fuera.estado).toBe('fuera')
    expect(fuera.sospechosa).toBe(true)
  })

  it('no comprobado se dice', () => {
    const v = veredictoDeCota({ cotaMedida: 100, cotaProyecto: 100, toleranciaMm: 10, comprobado: false })
    expect(v.comprobado).toBe(false)
    expect(v.avisos.join(' ')).toMatch(/no comprobada/)
  })

  it('datos rotos: datoInvalido, sin acción', () => {
    const v = veredictoDeCota({ cotaMedida: Number.NaN, cotaProyecto: 100, toleranciaMm: 10, comprobado: true })
    expect(v.estado).toBe('datoInvalido')
    expect(v.tipo).toBeNull()
    expect(v.diferenciaMm).toBeNull()
    const t = veredictoDeCota({ cotaMedida: 100, cotaProyecto: 100, toleranciaMm: -1, comprobado: true })
    expect(t.estado).toBe('datoInvalido')
    expect(t.avisos.join(' ')).toMatch(/tolerancia/)
  })
})

describe('replanteoConEstacion: factor de escala y orientación', () => {
  const estacionUtm = { x: 476000, y: 8665000 }
  const atrasUtm = { x: 476000, y: 8665400 }
  const objetivoUtm = { x: 476300, y: 8665000 }

  it('UTM sin factor: avisa que la distancia es de cuadrícula', () => {
    const r = replanteoConEstacion({ estacion: estacionUtm, atras: atrasUtm, objetivo: objetivoUtm })
    expect(r.distanciaHorizontal).toBe(300)
    expect(r.factorEscala).toBeNull()
    expect(r.avisos.join(' ')).toMatch(/UTM sin factor de escala/)
  })

  it('con el factor de Huancayo (0.99909), 300 m de cuadrícula son 300.273 m en el terreno', () => {
    const r = replanteoConEstacion({ estacion: estacionUtm, atras: atrasUtm, objetivo: objetivoUtm, factorEscala: 0.99909 })
    expect(r.distanciaCuadricula).toBe(300)
    expect(r.distanciaHorizontal).toBe(300.273)
    expect(r.distanciaAtras).toBe(400.364)
    expect(r.factorEscala).toBe(0.99909)
    expect(r.avisos).toEqual([])
  })

  it('el control del atrás compara contra la distancia del terreno', () => {
    const r = replanteoConEstacion({
      estacion: estacionUtm,
      atras: atrasUtm,
      objetivo: objetivoUtm,
      factorEscala: 0.99909,
      distanciaAtrasMedida: 400.365,
    })
    expect(r.diferenciaAtrasM).toBe(0.001)
    expect(r.avisos).toEqual([])
  })

  it('sin factor y con UTM, el aviso del atrás también menciona el factor', () => {
    const r = replanteoConEstacion({ estacion: estacionUtm, atras: atrasUtm, objetivo: objetivoUtm, distanciaAtrasMedida: 400.364 })
    expect(r.avisos.join(' ')).toMatch(/declare el factor de escala/)
  })

  it('sistema local declarado: no se pide factor', () => {
    const r = replanteoConEstacion({ estacion: estacionUtm, atras: atrasUtm, objetivo: objetivoUtm, sistema: 'local' })
    expect(r.avisos).toEqual([])
  })

  it('factor absurdo: se dice y no se aplica', () => {
    const r = replanteoConEstacion({ estacion: estacionUtm, atras: atrasUtm, objetivo: objetivoUtm, factorEscala: 0.5 })
    expect(r.distanciaHorizontal).toBe(300)
    expect(r.factorEscala).toBeNull()
    expect(r.avisos.join(' ')).toMatch(/factor de escala «0.5» no es válido/)
  })

  it('atrás a 3 m y punto a 300 m: orientación débil, con el corrimiento lateral', () => {
    const r = replanteoConEstacion({ estacion: { x: 1000, y: 5000 }, atras: { x: 1000, y: 5003 }, objetivo: { x: 1300, y: 5000 } })
    const texto = r.avisos.join(' ')
    expect(texto).toMatch(/Orientación débil/)
    expect(texto).toMatch(/0\.500 m de lado/)
  })

  it('atrás cercano (15 m) con el punto más lejos (25 m): también se avisa', () => {
    const r = replanteoConEstacion({ estacion: { x: 1000, y: 5000 }, atras: { x: 1000, y: 5015 }, objetivo: { x: 1025, y: 5000 } })
    expect(r.avisos.join(' ')).toMatch(/Orientación débil/)
  })

  it('atrás lejos y punto cerca: sin aviso de orientación', () => {
    const r = replanteoConEstacion({ estacion: { x: 1000, y: 5000 }, atras: { x: 1000, y: 5150 }, objetivo: { x: 1300, y: 5000 } })
    expect(r.avisos.join(' ')).not.toMatch(/Orientación débil/)
  })
})

describe('replanteoConGnss: solución, precisión y sistema de alturas', () => {
  it('solución FLOTANTE sobre el punto: no dice «llegó» ni juzga la cota', () => {
    const r = replanteoConGnss({ x: 0, y: 0, z: 100.01 }, { x: 0.005, y: 0, z: 100 }, { toleranciaMm: 10, solucion: 'FLOTANTE' })
    expect(r.llego).toBe(false)
    expect(r.cota).toBeNull()
    expect(r.indicacion).toMatch(/no marque todavía/)
    expect(r.avisos.join(' ')).toMatch(/FLOTANTE: no es fija/)
  })

  it('solución FIJA: llega y juzga', () => {
    const r = replanteoConGnss({ x: 0, y: 0, z: 100.005 }, { x: 0.005, y: 0, z: 100 }, { toleranciaMm: 10, solucion: 'Fija' })
    expect(r.llego).toBe(true)
    expect(r.cota!.diferenciaMm).toBe(5)
  })

  it('precisión horizontal (HRMS 0.2 m) peor que la tolerancia: no llega', () => {
    const r = replanteoConGnss({ x: 0, y: 0 }, { x: 0.005, y: 0 }, { solucion: 'FIJA', precisionHorizontalM: 0.2 })
    expect(r.llego).toBe(false)
    expect(r.avisos.join(' ')).toMatch(/Precisión horizontal 0\.200 m/)
  })

  it('precisión vertical peor que la tolerancia de cota: llega pero no juzga la cota', () => {
    const r = replanteoConGnss({ x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 100 }, {
      toleranciaMm: 10,
      solucion: 'FIJA',
      precisionVerticalM: 0.03,
    })
    expect(r.llego).toBe(true)
    expect(r.cota).toBeNull()
    expect(r.avisos.join(' ')).toMatch(/Precisión vertical/)
  })

  it('sin decir la solución: llega, pero pide confirmarla', () => {
    const r = replanteoConGnss({ x: 0, y: 0 }, { x: 0.005, y: 0 })
    expect(r.llego).toBe(true)
    expect(r.avisos.join(' ')).toMatch(/No se sabe si la solución es fija/)
  })

  it('la cota de GNSS lleva su aviso propio, no el de nivelación sin cerrar', () => {
    const r = replanteoConGnss({ x: 0, y: 0, z: 100.005 }, { x: 0, y: 0, z: 100 }, { toleranciaMm: 10, solucion: 'FIJA' })
    expect(r.cota!.avisos).toContain(AVISO_COTA_GNSS)
    expect(r.cota!.avisos.join(' ')).not.toMatch(/nivelación sin cerrar/)
  })

  it('25 m de diferencia (altura elipsoidal contra cota): dice que parece el sistema de alturas', () => {
    const r = replanteoConGnss({ x: 0, y: 0, z: 3253.981 }, { x: 0, y: 0, z: 3229 }, { toleranciaMm: 10, solucion: 'FIJA' })
    expect(r.cota!.diferenciaMm).toBe(24981)
    expect(r.cota!.avisos[0]).toMatch(/sistema de alturas/)
    expect(r.avisos.join(' ')).toMatch(/24\.981 m.*geoide/)
  })
})
