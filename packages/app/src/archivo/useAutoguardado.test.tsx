import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAlmacen } from '../estado/almacen'
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

  it('guarda los planos cuando cambian, y no cada vez que cambia el proyecto', async () => {
    const espiaProyecto = vi.spyOn(autoguardado, 'guardarBorrador').mockResolvedValue()
    const espiaPlanos = vi.spyOn(autoguardado, 'guardarArchivosDePlano').mockResolvedValue()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    render(<Prueba activo={true} />)
    vi.advanceTimersByTime(1500)
    expect(espiaPlanos).toHaveBeenCalledTimes(1)

    // Anotar no toca los planos: no se vuelven a escribir.
    act(() => useAlmacen.getState().actualizarMeta({ responsable: 'Max' }))
    vi.advanceTimersByTime(1500)
    expect(espiaProyecto).toHaveBeenCalledTimes(2)
    expect(espiaPlanos).toHaveBeenCalledTimes(1)

    // Agregar un plano sí.
    const bytes = new Uint8Array([1, 2, 3])
    let id = ''
    act(() => {
      id = useAlmacen.getState().agregarPlano({ nombre: 'Plano', formato: 'pdf', calibracion: null }, bytes)
    })
    vi.advanceTimersByTime(1500)
    expect(espiaPlanos).toHaveBeenCalledTimes(2)
    expect(espiaPlanos).toHaveBeenLastCalledWith(expect.objectContaining({ [id]: bytes }))

    vi.useRealTimers()
    espiaProyecto.mockRestore()
    espiaPlanos.mockRestore()
  })
})
