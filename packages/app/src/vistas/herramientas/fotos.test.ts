import { describe, expect, it } from 'vitest'
import { LADO_MAXIMO_FOTO, medidasReducidas } from './fotos'

describe('medidasReducidas', () => {
  it('lleva el lado mayor a 1280 px sin deformar', () => {
    expect(LADO_MAXIMO_FOTO).toBe(1280)
    expect(medidasReducidas(4000, 3000)).toEqual({ ancho: 1280, alto: 960 })
    expect(medidasReducidas(3000, 4000)).toEqual({ ancho: 960, alto: 1280 })
  })

  it('no agranda una foto pequeña', () => {
    expect(medidasReducidas(800, 600)).toEqual({ ancho: 800, alto: 600 })
  })

  it('una imagen sin medidas da cero', () => {
    expect(medidasReducidas(0, 600)).toEqual({ ancho: 0, alto: 0 })
    expect(medidasReducidas(Number.NaN, 600)).toEqual({ ancho: 0, alto: 0 })
  })
})
