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

  it('no inventa una progresiva cuando la clave viene malformada', () => {
    useAlmacen.getState().seleccionar('|EJE')

    expect(useAlmacen.getState().seleccion.clave).toBe('|EJE')
    expect(useAlmacen.getState().seleccion.progresiva).toBeNull()
  })

  it('un proyecto vacío no tiene campaña activa', () => {
    useAlmacen.getState().nuevoProyecto()
    expect(useAlmacen.getState().campaniaActivaId).toBeNull()
    expect(useAlmacen.getState().calcular()).toBeNull()
  })

  it('una campaña nueva nace con una estación, con vista atrás al banco de nivel de arranque', () => {
    const campaniaId = useAlmacen.getState().agregarCampania({
      fecha: '2026-08-20',
      calleId: 'c-1',
      capaId: 'cap-subrasante',
      bmInicialId: 'bm-1',
      estado: 'abierta',
      cierre: {
        tipo: 'abierto',
        longitudK: 0,
        longitudKAuto: true,
        clase: 'tercerOrden',
        coeficiente: 12,
      },
    })

    const campania = useAlmacen.getState().proyecto.campanias.find((c) => c.id === campaniaId)!
    expect(campania.estaciones).toHaveLength(1)
    expect(campania.estaciones[0]!.vistaAtras.destino).toEqual({ tipo: 'bm', bmId: 'bm-1' })
  })

  it('una lectura intermedia escrita en una campaña recién creada sí queda guardada', () => {
    const campaniaId = useAlmacen.getState().agregarCampania({
      fecha: '2026-08-20',
      calleId: 'c-1',
      capaId: 'cap-subrasante',
      bmInicialId: 'bm-1',
      estado: 'abierta',
      cierre: {
        tipo: 'abierto',
        longitudK: 0,
        longitudKAuto: true,
        clase: 'tercerOrden',
        coeficiente: 12,
      },
    })

    useAlmacen.getState().agregarIntermedia(campaniaId, 0, {
      destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } },
      valor: 1.5,
    })

    const campania = useAlmacen.getState().proyecto.campanias.find((c) => c.id === campaniaId)!
    expect(campania.estaciones[0]!.intermedias).toHaveLength(1)
    expect(campania.estaciones[0]!.intermedias[0]!.valor).toBe(1.5)
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

  it('activarEstacion cambia la estación activa y sobrevive a activarCampania de otra campaña', () => {
    const campaniaId2 = useAlmacen.getState().agregarCampania({
      fecha: '2026-08-20',
      calleId: 'c-1',
      capaId: 'cap-subrasante',
      bmInicialId: 'bm-1',
      estado: 'abierta',
      cierre: {
        tipo: 'abierto',
        longitudK: 0,
        longitudKAuto: true,
        clase: 'tercerOrden',
        coeficiente: 12,
      },
    })
    useAlmacen.getState().agregarEstacion(campaniaId2, {
      destino: { tipo: 'bm', bmId: 'bm-1' },
      valor: 1,
    })
    useAlmacen.getState().agregarEstacion(campaniaId2, {
      destino: { tipo: 'bm', bmId: 'bm-1' },
      valor: 1,
    })
    useAlmacen.getState().agregarEstacion(campaniaId2, {
      destino: { tipo: 'bm', bmId: 'bm-1' },
      valor: 1,
    })

    useAlmacen.getState().activarCampania('camp-1')
    useAlmacen.getState().activarEstacion(0)
    expect(useAlmacen.getState().estacionActiva).toBe(0)

    useAlmacen.getState().activarCampania(campaniaId2)
    const campania = useAlmacen.getState().proyecto.campanias[1]!
    expect(useAlmacen.getState().estacionActiva).toBe(campania.estaciones.length - 1)
  })

  it('quita la vista adelante de una estación', () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    useAlmacen.getState().quitarVistaAdelante(campaniaId, 1)

    const estacion = useAlmacen.getState().proyecto.campanias[0]!.estaciones[1]!
    expect(estacion.vistaAdelante).toBeUndefined()
    expect(estacion.intermedias).toHaveLength(1)
  })

  describe('selector de capas', () => {
    const CIERRE_ABIERTO = {
      tipo: 'abierto' as const,
      longitudK: 0,
      longitudKAuto: true,
      clase: 'tercerOrden' as const,
      coeficiente: 12,
    }

    it('alternarCapaVisible agrega y luego quita una campaña de las capas visibles', () => {
      useAlmacen.getState().alternarCapaVisible('camp-1')
      expect(useAlmacen.getState().capasVisibles).toEqual(['camp-1'])

      useAlmacen.getState().alternarCapaVisible('camp-1')
      expect(useAlmacen.getState().capasVisibles).toEqual([])
    })

    it('fijarComparacion guarda cuál campaña va abajo y cuál arriba', () => {
      const otraId = useAlmacen.getState().agregarCampania({
        fecha: '2026-08-20',
        calleId: 'c-1',
        capaId: 'cap-terreno',
        bmInicialId: 'bm-1',
        estado: 'abierta',
        cierre: CIERRE_ABIERTO,
      })

      useAlmacen.getState().fijarComparacion('camp-1', otraId)

      expect(useAlmacen.getState().comparacion).toEqual({ inferior: 'camp-1', superior: otraId })
    })

    it('fijarComparacion no deja que la misma campaña quede como inferior y superior', () => {
      useAlmacen.getState().fijarComparacion('camp-1', 'camp-1')

      expect(useAlmacen.getState().comparacion).toEqual({ inferior: 'camp-1', superior: null })
    })

    it('cambiar de campaña sin cambiar de calle no borra lo elegido', () => {
      const otraId = useAlmacen.getState().agregarCampania({
        fecha: '2026-08-20',
        calleId: 'c-1',
        capaId: 'cap-terreno',
        bmInicialId: 'bm-1',
        estado: 'abierta',
        cierre: CIERRE_ABIERTO,
      })
      useAlmacen.getState().activarCampania('camp-1')
      useAlmacen.getState().alternarCapaVisible('camp-1')
      useAlmacen.getState().fijarComparacion('camp-1', otraId)

      useAlmacen.getState().activarCampania(otraId)

      expect(useAlmacen.getState().capasVisibles).toEqual(['camp-1'])
      expect(useAlmacen.getState().comparacion).toEqual({ inferior: 'camp-1', superior: otraId })
    })

    it('cambiar la calle activa limpia lo que ya no aplica', () => {
      useAlmacen.getState().agregarCalle({
        nombre: 'Jr. Otra',
        plantillaId: 'pl-1',
        progresivaInicio: 0,
        progresivaFin: 40,
        intervalo: 20,
        progresivasExtra: [],
      })
      const otraCalleId = useAlmacen.getState().proyecto.calles[1]!.id
      const campaniaOtraCalleId = useAlmacen.getState().agregarCampania({
        fecha: '2026-08-20',
        calleId: otraCalleId,
        capaId: 'cap-terreno',
        bmInicialId: 'bm-1',
        estado: 'abierta',
        cierre: CIERRE_ABIERTO,
      })

      useAlmacen.getState().activarCampania('camp-1')
      useAlmacen.getState().alternarCapaVisible('camp-1')
      useAlmacen.getState().fijarComparacion('camp-1', null)

      useAlmacen.getState().activarCampania(campaniaOtraCalleId)

      expect(useAlmacen.getState().capasVisibles).toEqual([])
      expect(useAlmacen.getState().comparacion).toEqual({ inferior: null, superior: null })
    })

    it('cargarProyecto y nuevoProyecto también limpian la selección de capas', () => {
      useAlmacen.getState().alternarCapaVisible('camp-1')
      useAlmacen.getState().fijarComparacion('camp-1', null)

      useAlmacen.getState().nuevoProyecto()

      expect(useAlmacen.getState().capasVisibles).toEqual([])
      expect(useAlmacen.getState().comparacion).toEqual({ inferior: null, superior: null })
    })

    // La calle se puede cambiar desde el selector de cualquier campaña de la
    // lista (VistaCampanias), no solo de la activa. Si una comparación quedaba
    // apuntando a una campaña que cambió de calle sin ser la activa, las
    // claves de celda (`progresiva|elemento`) coinciden entre calles y la
    // resta daba un número sin ningún sentido físico.
    it('cambiar la calle de una campaña que no es la activa limpia la comparación si esa campaña estaba en ella', () => {
      const otraId = useAlmacen.getState().agregarCampania({
        fecha: '2026-08-20',
        calleId: 'c-1',
        capaId: 'cap-terreno',
        bmInicialId: 'bm-1',
        estado: 'abierta',
        cierre: CIERRE_ABIERTO,
      })
      useAlmacen.getState().agregarCalle({
        nombre: 'Jr. Otra',
        plantillaId: 'pl-1',
        progresivaInicio: 0,
        progresivaFin: 40,
        intervalo: 20,
        progresivasExtra: [],
      })
      const otraCalleId = useAlmacen.getState().proyecto.calles[1]!.id
      // agregarCampania deja la nueva campaña como activa: se vuelve a
      // camp-1 para que otraId sea justo la que no es la activa.
      useAlmacen.getState().activarCampania('camp-1')

      // camp-1 sigue siendo la activa; se compara contra otraId, ambas de c-1.
      useAlmacen.getState().fijarComparacion('camp-1', otraId)
      expect(useAlmacen.getState().comparacion).toEqual({ inferior: 'camp-1', superior: otraId })

      // Se cambia la calle de otraId (que no es la activa) desde el selector
      // de la lista de campañas.
      useAlmacen.getState().actualizarCampania(otraId, { calleId: otraCalleId })

      expect(useAlmacen.getState().comparacion).toEqual({ inferior: null, superior: null })
    })

    it('cambiar la calle de una campaña que no es la activa la saca de capasVisibles', () => {
      const otraId = useAlmacen.getState().agregarCampania({
        fecha: '2026-08-20',
        calleId: 'c-1',
        capaId: 'cap-terreno',
        bmInicialId: 'bm-1',
        estado: 'abierta',
        cierre: CIERRE_ABIERTO,
      })
      useAlmacen.getState().agregarCalle({
        nombre: 'Jr. Otra',
        plantillaId: 'pl-1',
        progresivaInicio: 0,
        progresivaFin: 40,
        intervalo: 20,
        progresivasExtra: [],
      })
      const otraCalleId = useAlmacen.getState().proyecto.calles[1]!.id
      useAlmacen.getState().activarCampania('camp-1')

      useAlmacen.getState().alternarCapaVisible('camp-1')
      useAlmacen.getState().alternarCapaVisible(otraId)
      expect(useAlmacen.getState().capasVisibles).toEqual(['camp-1', otraId])

      useAlmacen.getState().actualizarCampania(otraId, { calleId: otraCalleId })

      expect(useAlmacen.getState().capasVisibles).toEqual(['camp-1'])
    })

    it('cambiar otro campo de una campaña que no cambia su calle no toca comparación ni capasVisibles', () => {
      const otraId = useAlmacen.getState().agregarCampania({
        fecha: '2026-08-20',
        calleId: 'c-1',
        capaId: 'cap-terreno',
        bmInicialId: 'bm-1',
        estado: 'abierta',
        cierre: CIERRE_ABIERTO,
      })
      useAlmacen.getState().fijarComparacion('camp-1', otraId)

      useAlmacen.getState().actualizarCampania(otraId, { fecha: '2026-08-21' })

      expect(useAlmacen.getState().comparacion).toEqual({ inferior: 'camp-1', superior: otraId })
    })

    it('fijarComparacion no deja en pie una pareja de campañas de calles distintas', () => {
      useAlmacen.getState().agregarCalle({
        nombre: 'Jr. Otra',
        plantillaId: 'pl-1',
        progresivaInicio: 0,
        progresivaFin: 40,
        intervalo: 20,
        progresivasExtra: [],
      })
      const otraCalleId = useAlmacen.getState().proyecto.calles[1]!.id
      const campaniaOtraCalleId = useAlmacen.getState().agregarCampania({
        fecha: '2026-08-20',
        calleId: otraCalleId,
        capaId: 'cap-terreno',
        bmInicialId: 'bm-1',
        estado: 'abierta',
        cierre: CIERRE_ABIERTO,
      })

      useAlmacen.getState().fijarComparacion('camp-1', campaniaOtraCalleId)

      expect(useAlmacen.getState().comparacion).toEqual({ inferior: 'camp-1', superior: null })
    })
  })
})
