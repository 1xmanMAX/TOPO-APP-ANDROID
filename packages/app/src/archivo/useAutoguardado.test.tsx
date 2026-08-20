import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAutoguardado } from './useAutoguardado'
import * as autoguardado from './autoguardado'

function Prueba({ activo }: { activo: boolean }) {
  useAutoguardado(activo)
  return null
}

describe('useAutoguardado', () => {
  it('no guarda nada mientras está apagado', async () => {
    const espia = vi.spyOn(autoguardado, 'guardarBorrador').mockResolvedValue()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    render(<Prueba activo={false} />)
    vi.advanceTimersByTime(5000)

    expect(espia).not.toHaveBeenCalled()
    vi.useRealTimers()
    espia.mockRestore()
  })

  it('guarda cuando se enciende', async () => {
    const espia = vi.spyOn(autoguardado, 'guardarBorrador').mockResolvedValue()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    render(<Prueba activo={true} />)
    vi.advanceTimersByTime(1500)

    expect(espia).toHaveBeenCalled()
    vi.useRealTimers()
    espia.mockRestore()
  })
})
