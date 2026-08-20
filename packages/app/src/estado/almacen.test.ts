import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from './almacen'
import { proyectoEjemplo } from './ejemplo'

describe('almacén', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('arranca con el proyecto de ejemplo cargado', () => {
    const { proyecto } = useAlmacen.getState()
    expect(proyecto.calles).toHaveLength(1)
    expect(proyecto.bms[0]?.nombre).toBe('BM-1')
  })

  it('agrega un banco de nivel con id propio', () => {
    useAlmacen.getState().agregarBM({
      nombre: 'BM-2',
      cota: 3246.402,
      tipo: 'auxiliar',
      descripcion: '',
    })
    const { proyecto } = useAlmacen.getState()
    expect(proyecto.bms).toHaveLength(2)
    expect(proyecto.bms[1]?.id).toMatch(/^bm-/)
  })

  it('corregir la cota de un BM recalcula las cotas de la campaña', () => {
    const antes = useAlmacen.getState().calcular()!
    const bmId = useAlmacen.getState().proyecto.bms[0]!.id
    useAlmacen.getState().actualizarBM(bmId, { cota: 3245.28 })
    const despues = useAlmacen.getState().calcular()!

    expect(antes.cotasPorCelda.get('0|EJE')!.cota).toBeCloseTo(3244.6275, 6)
    expect(despues.cotasPorCelda.get('0|EJE')!.cota).toBeCloseTo(3244.7275, 6)
  })

  it('agrega una lectura intermedia a la estación indicada', () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    useAlmacen.getState().agregarIntermedia(campaniaId, 1, {
      destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'EJE' } },
      valor: 2.5,
    })
    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.cotasPorCelda.has('40|EJE')).toBe(true)
  })

  it('cambiar una lectura recalcula sin tocar el resto', () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const lecturaId = useAlmacen.getState().proyecto.campanias[0]!.estaciones[0]!.intermedias[0]!.id
    useAlmacen.getState().actualizarLectura(campaniaId, lecturaId, 1.88)
    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.cotasPorCelda.get('0|EJE')!.cotaCruda).toBeCloseTo(3244.725, 6)
  })

  it('elimina una lectura', () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const lecturaId = useAlmacen.getState().proyecto.campanias[0]!.estaciones[0]!.intermedias[0]!.id
    useAlmacen.getState().eliminarLectura(campaniaId, lecturaId)
    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.cotasPorCelda.has('0|EJE')).toBe(false)
  })

  it('guarda la selección compartida entre vistas', () => {
    useAlmacen.getState().seleccionar('20|EJE')
    expect(useAlmacen.getState().seleccion.clave).toBe('20|EJE')
    expect(useAlmacen.getState().seleccion.progresiva).toBe(20)
  })

  it('un proyecto vacío no tiene campaña activa', () => {
    useAlmacen.getState().nuevoProyecto()
    expect(useAlmacen.getState().campaniaActivaId).toBeNull()
    expect(useAlmacen.getState().calcular()).toBeNull()
  })

  it('fija la vista adelante de una estación', () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    useAlmacen.getState().fijarVistaAdelante(campaniaId, 0, {
      destino: { tipo: 'cambio', nombre: 'PC-2' },
      valor: 1.2,
    })
    const estacion = useAlmacen.getState().proyecto.campanias[0]!.estaciones[0]!
    expect(estacion.vistaAdelante?.valor).toBe(1.2)
  })

  it('agregar una estación la encadena al último punto de cambio', () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    useAlmacen.getState().agregarEstacion(campaniaId, {
      destino: { tipo: 'cambio', nombre: 'PC-1' },
      valor: 1.5,
    })
    const campania = useAlmacen.getState().proyecto.campanias[0]!
    expect(campania.estaciones).toHaveLength(3)
    expect(campania.estaciones[2]!.vistaAtras.valor).toBe(1.5)
  })

  it('quita la vista adelante de una estación', () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    useAlmacen.getState().quitarVistaAdelante(campaniaId, 1)

    const estacion = useAlmacen.getState().proyecto.campanias[0]!.estaciones[1]!
    expect(estacion.vistaAdelante).toBeUndefined()
    expect(estacion.intermedias).toHaveLength(1)
  })
})
