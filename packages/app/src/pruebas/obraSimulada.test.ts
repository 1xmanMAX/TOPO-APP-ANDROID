import {
  accionDeDiferencia,
  calcularCampania,
  calibrar,
  compararCapas,
  cotaTeoricaDeCapa,
  evaluarContraRasante,
  instrumentoCompleto,
  INSTRUMENTO_DE_FABRICA,
  largoPolilinea,
  lecturaObjetivo,
  opcionesDeInstrumento,
  analizarDrenaje,
  planificarConControles,
  type Calle,
  type PlanConControles,
  type Proyecto,
  type Toma,
} from '@topo/core'
import { describe, expect, it } from 'vitest'
import { desempaquetarTopo, empaquetarProyecto, migrarProyecto } from '../archivo/topo'
import { leerDxf } from '../planos/dxf'
import { espesorDeDisenio, evaluarEspesores, perfilDeProyecto, perfilMedido } from '../vistas/analisis/superficies'
import { cotasDelPlano, extremosSugeridos, perfilDeRasante, pistaCalibrada } from '../vistas/planificador/perfilDeLaCalle'
import { alturaInstrumentalDeEstacion } from '../vistas/calle/comun'
import { ESPERADO, IDS, PERFIL_LAS_LOMAS_CON_QUIEBRES, TOMAS_SIMULADAS, construirObraSimulada, esperadoEnJson } from './obraSimulada'

/** Lo justo de Node para leer los archivos guardados; ver pruebas/muestras.ts. */
declare const process: { cwd(): string; getBuiltinModule(nombre: string): unknown }
interface ArchivosDeNode {
  existsSync(ruta: string): boolean
  readFileSync(ruta: string): Uint8Array
}

function leerDelPaquete(ruta: string): Uint8Array {
  const fs = process.getBuiltinModule('node:fs') as ArchivosDeNode
  const desdeElPaquete = `${process.cwd()}/${ruta}`
  return new Uint8Array(fs.readFileSync(fs.existsSync(desdeElPaquete) ? desdeElPaquete : `${process.cwd()}/packages/app/${ruta}`))
}

const { proyecto, archivosDePlano } = construirObraSimulada()

function calle(id: string): Calle {
  return proyecto.calles.find((c) => c.id === id)!
}
function toma(c: Calle, id: string): Toma {
  return c.nivelaciones.flatMap((n) => n.tomas).find((t) => t.id === id)!
}
function calcular(c: Calle, t: Toma) {
  const resultado = calcularCampania({
    campania: t,
    calle: c,
    bms: proyecto.bms,
    largoMira: instrumentoCompleto(proyecto.instrumento).largoMira,
  })
  const evaluacion = evaluarContraRasante({ resultado, calle: c, toma: t, rasante: c.rasante!, capas: proyecto.capas, capaId: t.capaId })
  return { resultado, evaluacion }
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * Bytes como lista de números: el TextEncoder y el lector de archivos de
 * jsdom dan Uint8Array de otro «reino» que los de Node, y toEqual los
 * declara distintos aunque traigan los mismos bytes.
 */
const bytes = (datos: Uint8Array | undefined) => (datos ? Array.from(datos) : null)
const planosEnBytes = (planos: Record<string, Uint8Array>) =>
  Object.fromEntries(Object.entries(planos).map(([id, datos]) => [id, bytes(datos)]))

type EsperadoToma = {
  toma: string
  cierre: { errorMm: number | null; toleranciaMm: number | null; pasa: boolean | null; comprobado: boolean }
  alturasInstrumentales: readonly number[]
  conteo: { conformes: number; alLimite: number; fuera: number; sinMedir: number }
  diferenciasMm?: Record<string, number>
}

function comprobarToma(c: Calle, esperado: EsperadoToma) {
  const t = toma(c, esperado.toma)
  const { resultado, evaluacion } = calcular(c, t)
  const { cierre } = resultado
  expect(cierre.errorMm === null ? null : Math.round(cierre.errorMm)).toBe(esperado.cierre.errorMm)
  if (esperado.cierre.toleranciaMm === null) expect(cierre.toleranciaMm).toBeNull()
  else expect(cierre.toleranciaMm).toBeCloseTo(esperado.cierre.toleranciaMm, 2)
  expect(cierre.pasa).toBe(esperado.cierre.pasa)
  expect(cierre.pasa === true).toBe(esperado.cierre.comprobado)
  expect(resultado.cotasInstrumento.map(r3)).toEqual(esperado.alturasInstrumentales)
  expect({
    conformes: evaluacion.conformes,
    alLimite: evaluacion.alLimite,
    fuera: evaluacion.fuera,
    sinMedir: evaluacion.sinMedir,
  }).toEqual(esperado.conteo)
  const diferencias = Object.fromEntries(
    [...evaluacion.celdas.values()].map((celda) => [`${celda.progresiva}/${celda.elementoClave}`, celda.diferenciaMm]),
  )
  if (esperado.diferenciasMm) expect(diferencias).toEqual(esperado.diferenciasMm)
  return { resultado, evaluacion }
}

function comprobarCelda(
  evaluacion: ReturnType<typeof calcular>['evaluacion'],
  esperado: { celda: string; cotaMedida: number; cotaProyecto: number; diferenciaMm: number; accion: string },
  estado: string,
) {
  const [progresiva, punto] = esperado.celda.split('/')
  const celda = [...evaluacion.celdas.values()].find((c) => c.progresiva === Number(progresiva) && c.elementoClave === punto)!
  expect(r3(celda.cotaReal!)).toBe(esperado.cotaMedida)
  expect(celda.cotaTeorica).toBe(esperado.cotaProyecto)
  expect(celda.diferenciaMm).toBe(esperado.diferenciaMm)
  expect(celda.estado).toBe(estado)
  // Medida − proyecto: positivo sobra (corta), negativo falta (rellena).
  expect(Math.sign(celda.cotaReal! - celda.cotaTeorica!)).toBe(Math.sign(esperado.diferenciaMm))
  expect(accionDeDiferencia(celda.diferenciaMm!)?.tipo).toBe(esperado.accion)
}

function resumenPlan(plan: PlanConControles) {
  return {
    controles: plan.controles.map((c) => ({ progresiva: c.progresiva, cota: c.cotaPerfil, motivos: c.motivos.map((m) => m.tipo) })),
    tramos: plan.tramos.map((t) => ({ desde: t.desde, hasta: t.hasta, estaciones: t.estaciones, cambios: t.cambios, ok: t.ok })),
    ok: plan.ok,
  }
}
function sinTextos<T extends { controles: readonly object[] }>(plan: T) {
  return { ...plan, controles: plan.controles.map(({ texto: _t, ...resto }: { texto?: string }) => resto) }
}

describe('la obra simulada', () => {
  it('es una obra en Perú, con el instrumento de fábrica y sus tres calles, BMs y capas', () => {
    expect(proyecto.meta.nombre).toBe(ESPERADO.obra.nombre)
    expect(proyecto.meta.ubicacion).toBe(ESPERADO.obra.ubicacion)
    expect(proyecto.meta.ubicacion).toMatch(/Perú/)
    expect(instrumentoCompleto(proyecto.instrumento)).toEqual(INSTRUMENTO_DE_FABRICA)
    expect(proyecto.calles.map((c) => c.nombre)).toEqual(ESPERADO.nombresDeCalles)
    expect(proyecto.bms.map((b) => ({ nombre: b.nombre, cota: b.cota, tipo: b.tipo }))).toEqual(ESPERADO.bms)
    expect(proyecto.capas.map((c) => ({ nombre: c.nombre, toleranciaMm: c.toleranciaMm, espesor: c.espesor }))).toEqual(ESPERADO.capas)
    for (const c of proyecto.calles) {
      expect(c.rasante).not.toBeNull()
      expect(c.seccion.puntos.map((p) => p.nombre)).toEqual(['Borde izquierdo', 'Eje', 'Borde derecho'])
    }
  })

  it('siempre sale igual (sin azar ni fecha de hoy)', () => {
    expect(construirObraSimulada().proyecto).toEqual(proyecto)
  })

  it('las rasantes dan las cotas de arranque y de fin que dice ESPERADO', () => {
    for (const e of [ESPERADO.avSol, ESPERADO.jrLima, ESPERADO.lasLomas]) {
      const c = calle(e.id)
      expect(c.nombre).toBe(e.nombre)
      expect(c.rasante!.cotaArranque).toBe(e.rasante.cotaArranque)
      expect(c.rasante!.pendienteLongitudinal).toBe(e.rasante.pendiente)
      const fin = e.id === IDS.jrLima ? 200 : 120
      expect(cotaTeoricaDeCapa(c.rasante!, proyecto.capas, IDS.capaBase, fin, 0)).toBe(e.rasante.cotaFin)
    }
  })

  describe('las lecturas son de campo de verdad', () => {
    const tomas = proyecto.calles.flatMap((c) => c.nivelaciones.flatMap((n) => n.tomas))

    it('todas caben en la mira de 5 m (0.30 a 4.70) y van al milímetro', () => {
      const lecturas = tomas.flatMap((t) =>
        t.estaciones.flatMap((e) => [e.vistaAtras, ...e.intermedias, ...(e.vistaAdelante ? [e.vistaAdelante] : [])]),
      )
      expect(lecturas.length).toBe(29 + 29 + 21)
      for (const l of lecturas) {
        expect(l.valor).toBeGreaterThanOrEqual(0.3)
        expect(l.valor).toBeLessThanOrEqual(4.7)
        expect(r3(l.valor)).toBe(l.valor)
      }
      expect(new Set(lecturas.map((l) => l.id)).size).toBe(lecturas.length)
    })

    it('se guardan lecturas, nunca cotas: el JSON no trae ninguna cota medida', () => {
      const json = JSON.stringify(proyecto.calles.flatMap((c) => c.nivelaciones))
      expect(json).not.toMatch(/"cota"/)
    })

    it('las visuales están equilibradas (≤ 5 m) y ninguna pasa de 50 m', () => {
      for (const t of TOMAS_SIMULADAS) {
        for (const e of t.estaciones) {
          const atras = Math.abs(e.en - e.atras.en)
          expect(atras).toBeLessThanOrEqual(50)
          for (const [progresiva] of e.intermedias) expect(Math.abs(e.en - progresiva)).toBeLessThanOrEqual(50)
          if (e.adelante) {
            const adelante = Math.abs(e.en - e.adelante.en)
            expect(adelante).toBeLessThanOrEqual(50)
            expect(Math.abs(atras - adelante)).toBeLessThanOrEqual(5)
          }
        }
      }
    })
  })

  describe('Av. Sol: dos capas cerradas', () => {
    const c = calle(IDS.avSol)

    it('la subrasante cierra con −4 mm (±5.88): un punto fuera que se corta y uno al límite que se rellena', () => {
      const { evaluacion } = comprobarToma(c, ESPERADO.avSol.subrasante)
      comprobarCelda(evaluacion, ESPERADO.avSol.subrasante.fuera, 'fuera')
      comprobarCelda(evaluacion, ESPERADO.avSol.subrasante.alLimite, 'alLimite')
    })

    it('la base cierra con +4 mm y está toda conforme', () => {
      comprobarToma(c, ESPERADO.avSol.base)
      const { evaluacion } = calcular(c, toma(c, IDS.tomaSolBase))
      expect([...evaluacion.celdas.values()].every((celda) => celda.estado === 'conforme')).toBe(true)
    })

    it('la lectura objetivo del replanteo es AI − cota de proyecto', () => {
      const e = ESPERADO.avSol.base.lecturaObjetivo
      const { resultado } = calcular(c, toma(c, IDS.tomaSolBase))
      expect(r3(resultado.cotasInstrumento[e.estacion - 1]!)).toBe(e.alturaInstrumental)
      expect(cotaTeoricaDeCapa(c.rasante!, proyecto.capas, IDS.capaBase, e.progresiva, 0)).toBe(e.cotaProyecto)
      expect(lecturaObjetivo(e.alturaInstrumental, e.cotaProyecto)).toBe(e.lectura)
      // La que da la pantalla: con la AI compensada (la base cerró con +4 mm).
      const compensada = alturaInstrumentalDeEstacion(resultado, toma(c, IDS.tomaSolBase), e.estacion - 1)
      expect(r3(compensada.altura)).toBe(e.alturaInstrumentalCompensada)
      expect(lecturaObjetivo(e.alturaInstrumentalCompensada, e.cotaProyecto)).toBe(e.lecturaCompensada)
    })

    it('el espesor de la base sale delgado donde la subrasante quedó alta', () => {
      const inferior = calcular(c, toma(c, IDS.tomaSolSub)).resultado
      const superior = calcular(c, toma(c, IDS.tomaSolBase)).resultado
      const comparacion = compararCapas(inferior, superior)
      const disenio = espesorDeDisenio(proyecto.capas, IDS.capaSubrasante, IDS.capaBase)
      const e = ESPERADO.avSol.espesores
      expect(disenio).toBe(e.disenioM)
      expect(comparacion.comparables).toBe(e.comparables)
      expect(r3(comparacion.espesorMinimo!)).toBe(e.minimoM)
      expect(r3(comparacion.espesorMaximo!)).toBe(e.maximoM)
      const evaluados = [...evaluarEspesores(comparacion, disenio, 10).values()]
      const resumen = (estado: string) =>
        evaluados
          .filter((x) => x.estado === estado)
          .map((x) => ({ celda: `${x.progresiva}/${x.elementoClave}`, espesorM: r3(x.espesor!), diferenciaMm: x.diferenciaMm, delgada: x.delgada }))
      expect(resumen('fuera')).toEqual(e.fuera)
      expect(resumen('alLimite')).toEqual(e.alLimite)
    })

    it('trae sus tres notas por progresiva', () => {
      expect(c.notas!.map((n) => ({ progresiva: n.progresiva, texto: n.texto }))).toEqual(ESPERADO.avSol.notas)
    })
  })

  describe('Jr. Lima: nivelación sin cerrar y punto bajo', () => {
    const c = calle(IDS.jrLima)

    it('el K de su cierre (para la lectura de cierre en BM-2) es el de la toma', () => {
      expect(toma(c, IDS.tomaLimaSub).cierre.longitudK).toBe(ESPERADO.jrLima.subrasante.cierre.longitudK)
    })

    it('la subrasante no cierra (falta visar el BM-2): nada de lo calculado está comprobado', () => {
      const { evaluacion } = comprobarToma(c, ESPERADO.jrLima.subrasante)
      comprobarCelda(evaluacion, ESPERADO.jrLima.subrasante.fuera, 'fuera')
      const t = toma(c, IDS.tomaLimaSub)
      expect(t.estaciones.at(-1)!.vistaAdelante).toBeUndefined()
      expect(proyecto.bms.find((b) => b.id === t.cierre.bmFinalId)!.nombre).toBe(ESPERADO.jrLima.subrasante.cierre.bmQueFalta)
    })

    it('el eje se empoza en 0+140, y el drenaje se declara no comprobado', () => {
      const t = toma(c, IDS.tomaLimaSub)
      const { resultado } = calcular(c, t)
      const medido = perfilMedido(resultado, 'p-eje')
      const proy = perfilDeProyecto(c.rasante!, proyecto.capas, t.capaId, medido.map((p) => p.progresiva), 0)
      const drenaje = analizarDrenaje(medido, proy, { sumideros: [], comprobado: resultado.cierre.pasa === true })
      const e = ESPERADO.jrLima.drenaje
      expect(drenaje.comprobado).toBe(e.comprobado)
      expect(drenaje.empozamientos.map((p) => ({ progresiva: p.progresiva, cota: r3(p.cota), profundidadMm: p.profundidadMm }))).toEqual([
        e.empozamiento,
      ])
      const extremo = drenaje.puntosBajos.find((p) => p.extremo)!
      expect({ progresiva: extremo.progresiva, cota: r3(extremo.cota) }).toEqual(e.puntoBajoExtremo)
      expect(drenaje.tramos.filter((tr) => tr.contraPendiente).map((tr) => ({ desde: tr.desde, hasta: tr.hasta }))).toEqual([
        e.contrapendiente,
      ])
    })
  })

  describe('Psje. Las Lomas: la pista empinada para el planificador', () => {
    const c = calle(IDS.lasLomas)
    const pista = proyecto.pistas!.find((p) => p.calleId === c.id)!
    const plano = proyecto.planos!.find((p) => p.id === pista.planoId)
    const calibrada = pistaCalibrada(pista, plano)!
    const opciones = opcionesDeInstrumento(proyecto.instrumento)

    it('no tiene mediciones ni plan guardado, y está enlazada a la pista del DXF', () => {
      expect(c.nivelaciones).toEqual([])
      expect(c.planControles ?? null).toBeNull()
      expect(pista.id).toBe(ESPERADO.lasLomas.pista.id)
      expect(pista.origen).toBe('dxf')
      expect(calibrada).not.toBeNull()
      expect(extremosSugeridos(c, calibrada)).toEqual({ desde: ESPERADO.lasLomas.pista.desde, hasta: ESPERADO.lasLomas.pista.hasta })
    })

    it('el plan por la rasante (la fuente con que abre Planificar) es el de ESPERADO', () => {
      const { desde, hasta } = extremosSugeridos(c, calibrada)
      const plan = planificarConControles(perfilDeRasante(c.rasante!, desde, hasta), opciones)
      expect(resumenPlan(plan)).toEqual(ESPERADO.lasLomas.planRasante)
    })

    it('las cotas del DXF a lo largo de la pista y su plan', () => {
      const cotas = cotasDelPlano(plano, archivosDePlano[pista.planoId], calibrada)
      expect(cotas.motivo).toBeNull()
      expect(cotas.vertices).toEqual(ESPERADO.lasLomas.cotasDelPlano)
      expect(resumenPlan(planificarConControles(cotas.vertices, opciones))).toEqual(ESPERADO.lasLomas.planPlano)
    })

    it('el perfil con quiebres pone un control en cada quiebre, con su porqué', () => {
      const plan = planificarConControles(PERFIL_LAS_LOMAS_CON_QUIEBRES, opciones)
      const e = ESPERADO.lasLomas.planConQuiebres
      expect(resumenPlan(plan)).toEqual(sinTextos({ controles: e.controles, tramos: e.tramos, ok: e.ok }))
      for (const control of e.controles) {
        if (!('texto' in control)) continue
        expect(plan.controles.find((x) => x.progresiva === control.progresiva)!.motivos.map((m) => m.texto)).toContain(control.texto)
      }
      expect(JSON.parse(e.localStorage.valor).state.porCalle[IDS.lasLomas].digitados).toEqual(ESPERADO.lasLomas.perfilConQuiebres)
    })
  })

  describe('los planos y sus pistas', () => {
    it('trae los dos planos de muestra con sus bytes: el DXF calibrado y el PDF sin calibrar', () => {
      expect(proyecto.planos!.map((p) => ({ id: p.id, nombre: p.nombre, formato: p.formato, calibrado: p.calibracion !== null }))).toEqual(
        ESPERADO.planos.map((p) => ({ id: p.id, nombre: p.nombre, formato: p.formato, calibrado: p.calibrado })),
      )
      expect(bytes(archivosDePlano[IDS.planoDxf])).toEqual(bytes(leerDelPaquete('src/pruebas/muestras/expediente-pistas.dxf')))
      expect(bytes(archivosDePlano[IDS.planoPdf])).toEqual(bytes(leerDelPaquete('src/pruebas/muestras/plano-expediente.pdf')))
    })

    it('la barra de escala del PDF calibra a 1 punto = 0.352778 m', () => {
      const b = ESPERADO.planos[1]!.barraDeEscala!
      expect(calibrar(b.desde, b.hasta, b.metros).metrosPorUnidad).toBeCloseTo(b.metrosPorUnidad, 5)
    })

    it('una pista del DXF y una de croquis, cada una enlazada a su calle', () => {
      expect(
        proyecto.pistas!.map((p) => {
          const plano = proyecto.planos!.find((x) => x.id === p.planoId)!
          return {
            id: p.id,
            nombre: p.nombre,
            plano: plano.nombre,
            origen: p.origen,
            calle: proyecto.calles.find((c) => c.id === p.calleId)!.nombre,
            largoM: plano.calibracion ? largoPolilinea(p.polilinea) * plano.calibracion.metrosPorUnidad : null,
          }
        }),
      ).toEqual(ESPERADO.pistas)
    })

    it('la pista de Las Lomas es la polilínea del eje del DXF, y los otros dos ejes quedan libres', () => {
      const ejes = leerDxf(new TextDecoder().decode(archivosDePlano[IDS.planoDxf])).polilineas.filter((p) => p.capa === 'EJE_VIA')
      expect(ejes).toHaveLength(3)
      const pista = proyecto.pistas!.find((p) => p.id === IDS.pistaLasLomas)!
      expect(ejes.some((e) => JSON.stringify(e.puntos.map((v) => ({ x: v.x, y: v.y }))) === JSON.stringify(pista.polilinea))).toBe(true)
      expect(ESPERADO.ejesDxfSinPista).toHaveLength(2)
    })
  })

  describe('el .topo', () => {
    it('ida y vuelta: empaquetado y desempaquetado da el mismo proyecto y los mismos bytes de planos', () => {
      const vuelta = desempaquetarTopo(empaquetarProyecto(proyecto, archivosDePlano))
      expect(vuelta.proyecto).toEqual(proyecto)
      expect(planosEnBytes(vuelta.archivosDePlano)).toEqual(planosEnBytes(archivosDePlano))
      // Ya está en el formato de hoy: migrar no le cambia nada.
      expect(migrarProyecto(proyecto)).toEqual(proyecto)
    })

    it('el .topo guardado en verificacion/datos es esta obra (si falla: npx vite-node src/pruebas/generarObraSimulada.ts)', () => {
      const guardado = desempaquetarTopo(leerDelPaquete('verificacion/datos/obra-simulada.topo'))
      expect(guardado.proyecto).toEqual(proyecto as Proyecto)
      expect(planosEnBytes(guardado.archivosDePlano)).toEqual(planosEnBytes(archivosDePlano))
    })

    it('el JSON de ESPERADO guardado para los guiones está al día', () => {
      // Con core.autocrlf (Windows) git saca el JSON con CR LF: lo que importa es el contenido.
      const guardado = new TextDecoder().decode(leerDelPaquete('verificacion/datos/obra-simulada.esperado.json'))
      expect(guardado.replace(/\r\n/g, '\n')).toBe(esperadoEnJson())
    })
  })
})
