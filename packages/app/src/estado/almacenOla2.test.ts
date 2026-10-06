import { INSTRUMENTO_DE_FABRICA, instrumentoCompleto, type Proyecto } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from './almacen'
import { proyectoEjemplo } from './ejemplo'

/**
 * El ejemplo con una segunda calle que tiene dos nivelaciones propias: sirve
 * para ver que activar una calle activa su ÚLTIMA toma, no la primera.
 */
function obraDeDosCalles(): Proyecto {
  const proyecto = proyectoEjemplo()
  const original = proyecto.calles[0]!
  const tomaBase = original.nivelaciones[0]!.tomas[0]!
  const segunda = {
    ...original,
    id: 'c-lima',
    nombre: 'Jr. Lima',
    nivelaciones: [
      { id: 'niv-a', nombre: 'Terreno', color: '#2563eb', tomas: [{ ...tomaBase, id: 'toma-a1' }] },
      {
        id: 'niv-b',
        nombre: 'Subrasante',
        color: '#dc2626',
        tomas: [
          { ...tomaBase, id: 'toma-b1' },
          { ...tomaBase, id: 'toma-b2' },
        ],
      },
    ],
  }
  const sinTomas = { ...original, id: 'c-vacia', nombre: 'Jr. Vacío', nivelaciones: [] }
  return { ...proyecto, calles: [original, segunda, sinTomas] }
}

const estado = () => useAlmacen.getState()

describe('almacén — ola 2', () => {
  beforeEach(() => {
    estado().cargarProyecto(obraDeDosCalles())
    useAlmacen.setState({
      espacio: 'obra',
      subObra: 'calles',
      modoCalle: 'medir',
      pantallaCalle: null,
      calculadoraAbierta: false,
    })
  })

  describe('navegación', () => {
    it('irAEspacio cambia de espacio', () => {
      estado().irAEspacio('informes')
      expect(estado().espacio).toBe('informes')
    })

    it('irASubObra lleva a Obra con esa pantalla', () => {
      estado().irAEspacio('calle')
      estado().irASubObra('plano')
      expect(estado().espacio).toBe('obra')
      expect(estado().subObra).toBe('plano')
    })

    it('fijarModoCalle lleva a Calle y cierra la pantalla que tapaba los modos', () => {
      estado().abrirPantallaCalle('cierre')
      estado().fijarModoCalle('replantear')
      expect(estado().espacio).toBe('calle')
      expect(estado().modoCalle).toBe('replantear')
      expect(estado().pantallaCalle).toBeNull()
    })

    it('abrirPantallaCalle lleva a Calle con esa pantalla, y null la cierra', () => {
      estado().abrirPantallaCalle('planificar')
      expect(estado().espacio).toBe('calle')
      expect(estado().pantallaCalle).toBe('planificar')
      estado().abrirPantallaCalle(null)
      expect(estado().pantallaCalle).toBeNull()
    })

    it('abrirCalculadora la abre y la cierra sin mover la pantalla', () => {
      estado().irAEspacio('calle')
      estado().abrirCalculadora(true)
      expect(estado().calculadoraAbierta).toBe(true)
      expect(estado().espacio).toBe('calle')
      estado().abrirCalculadora(false)
      expect(estado().calculadoraAbierta).toBe(false)
    })

    it('irA (de las vistas viejas) se traduce a la navegación nueva', () => {
      estado().irA('libreta')
      expect(estado()).toMatchObject({ espacio: 'calle', modoCalle: 'medir', pantallaCalle: null })
      estado().irA('resultados')
      expect(estado()).toMatchObject({ espacio: 'calle', modoCalle: 'revisar' })
      estado().irA('subir')
      expect(estado()).toMatchObject({ espacio: 'obra', subObra: 'calles' })
    })

    it('cargar otro proyecto cierra la pantalla de la calle, que era del anterior', () => {
      estado().abrirPantallaCalle('planificar')
      estado().cargarProyecto(proyectoEjemplo())
      expect(estado().pantallaCalle).toBeNull()
      expect(estado().espacio).toBe('calle')
    })

    it('un proyecto nuevo vuelve a Obra › Calles, sin calle activa', () => {
      estado().irAEspacio('calle')
      estado().nuevoProyecto()
      expect(estado()).toMatchObject({ espacio: 'obra', subObra: 'calles', calleActivaId: null })
    })
  })

  describe('calle activa sincronizada con la toma activa', () => {
    it('al cargar, la calle activa es la de la primera toma', () => {
      expect(estado().calleActivaId).toBe(obraDeDosCalles().calles[0]!.id)
    })

    it('activar una calle activa su última toma', () => {
      estado().activarCalle('c-lima')
      expect(estado().calleActivaId).toBe('c-lima')
      expect(estado().campaniaActivaId).toBe('toma-b2')
    })

    it('activar una calle sin tomas deja sin toma activa', () => {
      estado().activarCalle('c-vacia')
      expect(estado().calleActivaId).toBe('c-vacia')
      expect(estado().campaniaActivaId).toBeNull()
    })

    it('cambiar de calle limpia las capas dibujadas y la comparación, que eran de otra calle', () => {
      const primeraToma = estado().campaniaActivaId!
      estado().alternarCapaVisible(primeraToma)
      estado().activarCalle('c-lima')
      expect(estado().capasVisibles).toEqual([])
      expect(estado().comparacion).toEqual({ inferior: null, superior: null })
    })

    it('una calle que no existe no cambia nada', () => {
      const antes = estado().calleActivaId
      estado().activarCalle('no-existe')
      expect(estado().calleActivaId).toBe(antes)
    })

    it('activar una toma activa su calle', () => {
      estado().activarCampania('toma-a1')
      expect(estado().calleActivaId).toBe('c-lima')
    })

    it('desactivar la toma conserva la calle', () => {
      estado().activarCalle('c-lima')
      estado().activarCampania(null)
      expect(estado().calleActivaId).toBe('c-lima')
    })

    it('crear una campaña activa su calle', () => {
      const bm = estado().proyecto.bms[0]!
      estado().agregarCampania({
        calleId: 'c-vacia',
        fecha: '2026-10-05',
        capaId: estado().proyecto.capas[0]!.id,
        bmInicialId: bm.id,
        cierre: { tipo: 'abierto', longitudK: 0, longitudKAuto: true, clase: 'tercerOrden', coeficiente: 12 },
      })
      expect(estado().calleActivaId).toBe('c-vacia')
    })

    it('mover la toma activa a otra calle mueve la calle activa', () => {
      estado().activarCampania('toma-a1')
      estado().actualizarCampania('toma-a1', { calleId: 'c-vacia' })
      expect(estado().calleActivaId).toBe('c-vacia')
    })

    it('borrar la calle activa pasa a la primera que quede, con su última toma', () => {
      estado().activarCalle('c-lima')
      const primera = estado().proyecto.calles[0]!
      estado().eliminarCalle('c-lima')
      expect(estado().calleActivaId).toBe(primera.id)
      expect(estado().campaniaActivaId).toBe(primera.nivelaciones.at(-1)!.tomas.at(-1)!.id)
    })

    it('la primera calle de una obra vacía queda activa', () => {
      estado().nuevoProyecto()
      const id = estado().agregarCalle({ nombre: 'Av. Nueva', rasante: null })
      expect(estado().calleActivaId).toBe(id)
    })
  })

  describe('instrumento', () => {
    it('fijarInstrumento guarda solo lo cambiado; lo demás sale de fábrica', () => {
      expect(estado().proyecto.instrumento).toBeUndefined()
      estado().fijarInstrumento({ largoMira: 4 })
      estado().fijarInstrumento({ visualMax: 40 })
      expect(estado().proyecto.instrumento).toEqual({ largoMira: 4, visualMax: 40 })
      const completo = instrumentoCompleto(estado().proyecto.instrumento)
      expect(completo.largoMira).toBe(4)
      expect(completo.alturaInstrumento).toBe(INSTRUMENTO_DE_FABRICA.alturaInstrumento)
    })
  })

  describe('planos', () => {
    const bytes = new Uint8Array([1, 2, 3])

    it('agregarPlano guarda el plano en el proyecto y sus bytes aparte', () => {
      const id = estado().agregarPlano({ nombre: 'Expediente', formato: 'pdf', pagina: 1, calibracion: null }, bytes)
      expect(estado().proyecto.planos).toEqual([
        { id, nombre: 'Expediente', formato: 'pdf', pagina: 1, calibracion: null },
      ])
      expect(estado().archivosDePlano[id]).toBe(bytes)
    })

    it('actualizarPlano cambia la calibración sin tocar los bytes', () => {
      const id = estado().agregarPlano({ nombre: 'Planta', formato: 'dxf', calibracion: null }, bytes)
      const antes = estado().archivosDePlano
      estado().actualizarPlano(id, { calibracion: { metrosPorUnidad: 0.5 }, capasOcultas: ['COTAS'] })
      expect(estado().proyecto.planos![0]).toMatchObject({
        calibracion: { metrosPorUnidad: 0.5 },
        capasOcultas: ['COTAS'],
      })
      expect(estado().archivosDePlano).toBe(antes)
    })

    it('eliminarPlano se lleva sus bytes y sus pistas, y deja las calles', () => {
      const id = estado().agregarPlano({ nombre: 'Planta', formato: 'dxf', calibracion: null }, bytes)
      const otro = estado().agregarPlano({ nombre: 'Otro', formato: 'pdf', calibracion: null }, bytes)
      const pista = estado().agregarPista({ nombre: 'Jr. A', planoId: id, polilinea: [], origen: 'dxf' })
      const pistaOtra = estado().agregarPista({ nombre: 'Jr. B', planoId: otro, polilinea: [], origen: 'croquis' })
      const calleId = estado().crearCalleDesdePista(pista)!

      estado().eliminarPlano(id)

      expect(estado().proyecto.planos!.map((p) => p.id)).toEqual([otro])
      expect(estado().archivosDePlano[id]).toBeUndefined()
      expect(estado().archivosDePlano[otro]).toBe(bytes)
      expect(estado().proyecto.pistas!.map((p) => p.id)).toEqual([pistaOtra])
      expect(estado().proyecto.calles.some((c) => c.id === calleId)).toBe(true)
    })
  })

  describe('pistas', () => {
    let planoId: string
    beforeEach(() => {
      planoId = estado().agregarPlano({ nombre: 'Planta', formato: 'dxf', calibracion: null }, new Uint8Array([9]))
    })

    it('agregarPista, actualizarPista y eliminarPista', () => {
      const id = estado().agregarPista({
        nombre: 'Pista 1',
        planoId,
        polilinea: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        origen: 'croquis',
      })
      expect(estado().proyecto.pistas).toHaveLength(1)

      estado().actualizarPista(id, { nombre: 'Jr. Ayacucho', progresivaInicio: 20 })
      expect(estado().proyecto.pistas![0]).toMatchObject({ nombre: 'Jr. Ayacucho', progresivaInicio: 20 })

      estado().eliminarPista(id)
      expect(estado().proyecto.pistas).toEqual([])
    })

    it('crearCalleDesdePista crea la calle con la sección de fábrica y el nombre de la pista, y las enlaza', () => {
      const pistaId = estado().agregarPista({ nombre: 'Jr. Ayacucho', planoId, polilinea: [], origen: 'dxf' })
      const callesAntes = estado().proyecto.calles.length

      const calleId = estado().crearCalleDesdePista(pistaId)!

      const calle = estado().proyecto.calles.find((c) => c.id === calleId)!
      expect(estado().proyecto.calles).toHaveLength(callesAntes + 1)
      expect(calle.nombre).toBe('Jr. Ayacucho')
      expect(calle.seccion.puntos.length).toBeGreaterThan(0)
      expect(calle.nivelaciones).toEqual([])
      expect(calle.rasante).toBeNull()
      expect(estado().proyecto.pistas![0]!.calleId).toBe(calleId)
    })

    it('crearCalleDesdePista dos veces no crea dos calles', () => {
      const pistaId = estado().agregarPista({ nombre: 'Jr. Ayacucho', planoId, polilinea: [], origen: 'dxf' })
      const primera = estado().crearCalleDesdePista(pistaId)
      const callesTrasLaPrimera = estado().proyecto.calles.length
      expect(estado().crearCalleDesdePista(pistaId)).toBe(primera)
      expect(estado().proyecto.calles).toHaveLength(callesTrasLaPrimera)
    })

    it('crearCalleDesdePista con una pista que no existe da null', () => {
      expect(estado().crearCalleDesdePista('no-existe')).toBeNull()
    })

    it('borrar la calle suelta el enlace de su pista, y la pista se queda', () => {
      const pistaId = estado().agregarPista({ nombre: 'Jr. Ayacucho', planoId, polilinea: [], origen: 'dxf' })
      const calleId = estado().crearCalleDesdePista(pistaId)!
      estado().eliminarCalle(calleId)
      const pista = estado().proyecto.pistas!.find((p) => p.id === pistaId)!
      expect(pista).toBeDefined()
      expect('calleId' in pista).toBe(false)
    })
  })

  describe('notas y plan de controles', () => {
    it('agregarNota y eliminarNota', () => {
      const calleId = estado().proyecto.calles[0]!.id
      const id = estado().agregarNota(calleId, { progresiva: 40, texto: 'Buzón tapado', fecha: '2026-10-05' })
      expect(estado().proyecto.calles[0]!.notas).toEqual([
        { id, progresiva: 40, texto: 'Buzón tapado', fecha: '2026-10-05' },
      ])
      estado().eliminarNota(calleId, id)
      expect(estado().proyecto.calles[0]!.notas).toEqual([])
    })

    it('fijarPlanControles guarda lo decidido en la calle, y null lo quita', () => {
      const calleId = 'c-lima'
      const plan = {
        opciones: { maxCambiosPorTramo: 3 },
        controles: [{ progresiva: 0, cota: 3244.5, motivos: [{ tipo: 'inicio' as const, texto: 'Inicio de la pista' }] }],
      }
      estado().fijarPlanControles(calleId, plan)
      expect(estado().proyecto.calles.find((c) => c.id === calleId)!.planControles).toEqual(plan)
      estado().fijarPlanControles(calleId, null)
      expect(estado().proyecto.calles.find((c) => c.id === calleId)!.planControles).toBeNull()
    })
  })
})
