import { describe, expect, it } from 'vitest'
import { reducirLogo } from './logo'

describe('reducirLogo', () => {
  it('sin un navegador que sepa redibujar, devuelve el original como dataURL', async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
    expect(await reducirLogo(png)).toMatch(/^data:image\/png;base64,/)
  })
})
