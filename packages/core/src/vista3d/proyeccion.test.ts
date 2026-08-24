import { describe, expect, it } from 'vitest'
import { CAMARA_ALZADO, CAMARA_ISOMETRICA, CAMARA_PLANTA, proyectarPunto, type Camara } from './proyeccion'

const ISO: Camara = { giro: 45, inclinacion: 35.264, exageracion: 1 }

describe('proyectarPunto', () => {
  it('coloca los ejes del isométrico clásico a 30 grados de la horizontal', () => {
    const ejeX = proyectarPunto(1, 0, 0, ISO)
    const ejeY = proyectarPunto(0, 1, 0, ISO)

    expect(ejeX.x).toBeCloseTo(0.707, 3)
    expect(ejeX.y).toBeCloseTo(0.408, 3)
    expect(ejeY.x).toBeCloseTo(-0.707, 3)
    expect(ejeY.y).toBeCloseTo(0.408, 3)

    // 0.408 / 0.707 = tan(30°)
    const grados = (Math.atan2(ejeX.y, ejeX.x) * 180) / Math.PI
    expect(grados).toBeCloseTo(30, 1)
  })

  it('deja el eje de las cotas vertical, y hacia arriba', () => {
    const ejeZ = proyectarPunto(0, 0, 1, ISO)

    expect(ejeZ.x).toBeCloseTo(0, 6)
    // Negativo porque en pantalla el eje vertical crece hacia abajo:
    // más cota, más arriba.
    expect(ejeZ.y).toBeCloseTo(-0.817, 3)
  })

  it('el origen se proyecta en el origen', () => {
    const origen = proyectarPunto(0, 0, 0, ISO)

    expect(origen.x).toBe(0)
    expect(origen.y).toBe(0)
  })

  it('con la cámara en planta, la cota no mueve el punto en pantalla', () => {
    const abajo = proyectarPunto(3, 7, 0, { giro: 45, inclinacion: 90, exageracion: 1 })
    const arriba = proyectarPunto(3, 7, 5, { giro: 45, inclinacion: 90, exageracion: 1 })

    expect(arriba.x).toBeCloseTo(abajo.x, 6)
    expect(arriba.y).toBeCloseTo(abajo.y, 6)
    // Pero sí cambia la profundidad: sigue estando más cerca de la cámara.
    expect(arriba.profundidad).toBeGreaterThan(abajo.profundidad)
  })

  it('con la cámara en alzado, avanzar de progresiva no sube ni baja el punto', () => {
    const punto = proyectarPunto(0, 7, 0, { giro: 45, inclinacion: 0, exageracion: 1 })

    expect(punto.y).toBeCloseTo(0, 6)
  })

  it('la exageración vertical solo estira las cotas, no las distancias', () => {
    const sinExagerar = proyectarPunto(4.2, 20, 2, { ...ISO, exageracion: 1 })
    const exagerado = proyectarPunto(4.2, 20, 2, { ...ISO, exageracion: 25 })

    expect(exagerado.x).toBeCloseTo(sinExagerar.x, 6)
    // La cota aporta -z·e·cos(inclinacion); con e=25 aporta 25 veces más.
    const aporteSimple = sinExagerar.y - (4.2 * Math.sin((45 * Math.PI) / 180) + 20 * Math.cos((45 * Math.PI) / 180)) * Math.sin((35.264 * Math.PI) / 180)
    const aporteExagerado = exagerado.y - (4.2 * Math.sin((45 * Math.PI) / 180) + 20 * Math.cos((45 * Math.PI) / 180)) * Math.sin((35.264 * Math.PI) / 180)
    expect(aporteExagerado).toBeCloseTo(aporteSimple * 25, 6)
  })

  it('una exageración de 1 deja un metro de desnivel casi invisible frente a la calle', () => {
    // Con la cámara isométrica, el giro de 45° acorta la calle en pantalla:
    // 180 m ocupan 73.5 unidades, y 1 m de desnivel ocupa 0.8.
    const inicio = proyectarPunto(0, 0, 0, ISO)
    const fin = proyectarPunto(0, 180, 0, ISO)
    const largo = Math.abs(fin.y - inicio.y)
    const desnivel = Math.abs(proyectarPunto(0, 0, 1, ISO).y)

    expect(largo).toBeCloseTo(73.5, 1)
    expect(desnivel / largo).toBeLessThan(0.02)
  })

  it('con la exageración de partida, ese mismo metro sí se ve', () => {
    const camara = { ...ISO, exageracion: 25 }
    const largo = Math.abs(proyectarPunto(0, 180, 0, camara).y)
    const desnivel = Math.abs(proyectarPunto(0, 0, 1, camara).y)

    // Pasa del 1.1 % al 27.8 % del largo de la calle.
    expect(desnivel / largo).toBeCloseTo(0.278, 2)
  })

  it('las cámaras guardadas son las que dicen ser', () => {
    expect(CAMARA_ISOMETRICA.giro).toBe(45)
    expect(CAMARA_ISOMETRICA.inclinacion).toBeCloseTo(35.264, 3)
    expect(CAMARA_PLANTA.inclinacion).toBe(90)
    expect(CAMARA_ALZADO.inclinacion).toBe(0)
    expect(CAMARA_ISOMETRICA.exageracion).toBe(25)
  })
})
