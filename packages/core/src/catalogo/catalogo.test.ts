import { describe, expect, it } from 'vitest'
import {
  aprenderCodigo, catalogoDeFabrica, conceptoAnteriorDe, conceptoDe, normalizarCodigo,
} from './catalogo'

describe('normalizarCodigo', () => {
  it('no distingue mayúsculas, tildes ni espacios de sobra', () => {
    expect(normalizarCodigo(' Zkj ')).toBe('zkj')
    expect(normalizarCodigo('ZKJ')).toBe('zkj')
    expect(normalizarCodigo('Bórde-Í')).toBe('borde-i')
  })

  it('deja el código vacío como vacío, sin inventar nada', () => {
    expect(normalizarCodigo('   ')).toBe('')
  })
})

describe('conceptoDe', () => {
  it('reconoce los códigos de fábrica', () => {
    const c = catalogoDeFabrica()

    expect(conceptoDe(c, 'EJE')).toBe('eje')
    expect(conceptoDe(c, 'prog')).toBe('progresiva')
    expect(conceptoDe(c, 'BOR-I')).toBe('bordeIzq')
    expect(conceptoDe(c, 'VER-D')).toBe('veredaDer')
  })

  it('un código que no conoce devuelve null, para que se pueda preguntar', () => {
    expect(conceptoDe(catalogoDeFabrica(), 'ZKJ')).toBeNull()
  })
})

describe('aprenderCodigo', () => {
  it('un código aprendido se reconoce a partir de entonces', () => {
    const c = aprenderCodigo(catalogoDeFabrica(), 'ZKJ', 'eje')

    expect(conceptoDe(c, 'ZKJ')).toBe('eje')
    expect(conceptoDe(c, ' zkj ')).toBe('eje')
  })

  it('no toca el catálogo de partida: devuelve uno nuevo', () => {
    const antes = catalogoDeFabrica()
    aprenderCodigo(antes, 'ZKJ', 'eje')

    expect(conceptoDe(antes, 'ZKJ')).toBeNull()
  })

  it('aprender un código que ya estaba lo mueve al concepto nuevo', () => {
    const c = aprenderCodigo(catalogoDeFabrica(), 'EJE', 'bordeIzq')

    expect(conceptoDe(c, 'EJE')).toBe('bordeIzq')
  })
})

describe('conceptoAnteriorDe', () => {
  it('dice a qué concepto estaba asignado un código, para poder avisar antes de moverlo', () => {
    // Cambiar un código en silencio dejaría mal interpretadas todas las
    // importaciones que ya se hicieron con él.
    const c = catalogoDeFabrica()

    expect(conceptoAnteriorDe(c, 'EJE')).toBe('eje')
    expect(conceptoAnteriorDe(c, 'ZKJ')).toBeNull()
  })
})
