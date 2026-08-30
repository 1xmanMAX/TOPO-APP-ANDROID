import { describe, expect, it } from 'vitest'
import { bytesDelArchivo } from './bytes'

describe('los bytes de un archivo', () => {
  it('devuelve lo que el archivo tenía dentro, byte por byte', async () => {
    const dentro = new Uint8Array([80, 75, 3, 4, 250])

    const leidos = await bytesDelArchivo(new File([dentro], 'algo.xlsx'))

    expect([...leidos]).toEqual([...dentro])
  })

  it('un archivo vacío se lee como cero bytes, no como un fallo', () => {
    // Es un archivo que existe y no tiene nada: quien lo lea dirá que no
    // parece una hoja, que es distinto de que no se pudiera abrir.
    return expect(bytesDelArchivo(new File([], 'vacio.csv'))).resolves.toHaveLength(0)
  })
})
