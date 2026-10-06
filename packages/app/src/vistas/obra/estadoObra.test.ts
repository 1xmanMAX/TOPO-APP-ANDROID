import { calcularCampania, evaluarContraRasante, type Proyecto, type Toma } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { proyectoEjemplo } from '../../estado/ejemplo'
import {
  capasDeCalle,
  compararJornadas,
  estadoDeCierre,
  fechaLocalISO,
  fraseDeCalle,
  jornadasDeCalle,
  lecturasDeToma,
  milimetros,
  tramoDeTomas,
} from './estadoObra'

/** El ejemplo de la app: Av. Sol con una subrasante (19/08) y una base (20/08), las dos cerradas. */
function obra(): Proyecto {
  return structuredClone(proyectoEjemplo())
}

function tomas(p: Proyecto): Toma[] {
  return p.calles[0]!.nivelaciones.flatMap((n) => n.tomas)
}

function tomaDeCapa(p: Proyecto, capaId: string): Toma {
  return tomas(p).find((t) => t.capaId === capaId)!
}

function estadoDe(p: Proyecto, capaId: string) {
  return capasDeCalle(p, p.calles[0]!).find((c) => c.capa.id === capaId)!
}

describe('capasDeCalle', () => {
  it('da una casilla por capa, de abajo arriba, y las que no tienen jornada quedan sin medir', () => {
    const p = obra()
    const capas = capasDeCalle(p, p.calles[0]!)
    expect(capas.map((c) => c.capa.id)).toEqual(['cap-terreno', 'cap-subrasante', 'cap-base', 'cap-carpeta'])
    expect(capas[0]).toMatchObject({ estado: 'sinMedir', simbolo: '·', tomaId: null })
    expect(capas[3]).toMatchObject({ estado: 'sinMedir', simbolo: '·' })
  })

  it('una capa cerrada con puntos fuera de tolerancia lleva ✗ y dice dónde', () => {
    const p = obra()
    const subrasante = estadoDe(p, 'cap-subrasante')
    expect(subrasante.estado).toBe('conPuntosFuera')
    expect(subrasante.simbolo).toBe('✗')
    expect(subrasante.detalle).toMatch(/1 punto fuera de tolerancia en 0\+040/)
  })

  it('si solo hay puntos al límite (hasta 2×tol), la casilla es △ «al límite», no «fuera»', () => {
    const base = estadoDe(obra(), 'cap-base')
    expect(base.estado).toBe('alLimite')
    expect(base.simbolo).toBe('△')
    expect(base.detalle).toMatch(/al límite/)
    expect(base.detalle).not.toMatch(/fuera/)
  })

  it('cerrada y dentro de tolerancia: conforme ✓', () => {
    const p = obra()
    p.capas = p.capas.map((c) => ({ ...c, toleranciaMm: 1000 }))
    expect(estadoDe(p, 'cap-subrasante')).toMatchObject({ estado: 'conforme', simbolo: '✓' })
  })

  it('sin rasante no se puede comparar con el proyecto: no dice «conforme», dice «sin comparar»', () => {
    const p = obra()
    p.calles[0]!.rasante = null
    const subrasante = estadoDe(p, 'cap-subrasante')
    expect(subrasante.estado).toBe('sinComparar')
    expect(subrasante.simbolo).toBe('△')
    expect(subrasante.detalle).toMatch(/sin rasante/)
  })

  it('si ninguna celda medida cae donde el proyecto tiene rasante, tampoco es «conforme»', () => {
    const p = obra()
    // Sin tramos, la rasante solo define el eje; se quita el eje de lo medido.
    const calle = p.calles[0]!
    calle.rasante = { ...calle.rasante!, tramos: [], tramosIzquierda: null, simetrica: true }
    for (const toma of calle.nivelaciones.flatMap((n) => n.tomas)) {
      for (const e of toma.estaciones) {
        e.intermedias = e.intermedias.filter((l) => l.destino.tipo !== 'celda' || l.destino.celda.elementoClave !== 'eje')
      }
    }
    const subrasante = estadoDe(p, 'cap-subrasante')
    expect(subrasante.estado).toBe('sinComparar')
    expect(subrasante.detalle).toMatch(/ningún punto medido/)
  })

  it('un circuito que todavía no vuelve al BM está en curso △, aunque tenga puntos fuera', () => {
    const p = obra()
    const toma = tomaDeCapa(p, 'cap-subrasante')
    delete toma.estaciones[toma.estaciones.length - 1]!.vistaAdelante
    expect(estadoDe(p, 'cap-subrasante')).toMatchObject({ estado: 'enCurso', simbolo: '△' })
  })

  it('una hoja sin vuelta al BM queda sin comprobar △', () => {
    const p = obra()
    tomaDeCapa(p, 'cap-subrasante').cierre.tipo = 'abierto'
    const subrasante = estadoDe(p, 'cap-subrasante')
    expect(subrasante).toMatchObject({ estado: 'sinComprobar', simbolo: '△' })
    expect(subrasante.detalle).toMatch(/no comprobada/)
  })

  it('un cierre fuera de tolerancia deja la capa sin comprobar y dice que no cierra', () => {
    const p = obra()
    const toma = tomaDeCapa(p, 'cap-subrasante')
    toma.estaciones[toma.estaciones.length - 1]!.vistaAdelante!.valor += 0.1
    const subrasante = estadoDe(p, 'cap-subrasante')
    expect(subrasante.estado).toBe('sinComprobar')
    expect(subrasante.detalle).toMatch(/no cierra/)
  })

  it('los puntos fuera de un tramo no desaparecen porque otro día se midió bien otro tramo', () => {
    const p = obra()
    const lunes = tomaDeCapa(p, 'cap-subrasante')
    const martes = structuredClone(lunes)
    martes.id = 'toma-martes'
    martes.fecha = '2026-09-02'
    // El martes se mide solo hasta 0+020, que el lunes salió dentro de tolerancia.
    for (const estacion of martes.estaciones) {
      estacion.intermedias = estacion.intermedias.filter(
        (l) => l.destino.tipo !== 'celda' || l.destino.celda.progresiva <= 20,
      )
    }
    p.calles[0]!.nivelaciones.push({ id: 'niv-martes', nombre: 'martes', color: '#000', tomas: [martes] })
    const subrasante = estadoDe(p, 'cap-subrasante')
    expect(subrasante.estado).toBe('conPuntosFuera')
    expect(subrasante.simbolo).toBe('✗')
    expect(subrasante.detalle).toMatch(/0\+040/)
  })

  it('remedir conforme el mismo punto sí lo saca de «fuera»: manda la medición más reciente de cada celda', () => {
    const p = obra()
    const lunes = tomaDeCapa(p, 'cap-subrasante')
    const martes = structuredClone(lunes)
    martes.id = 'toma-martes'
    martes.fecha = '2026-09-02'
    // Dos tomas iguales no duplican los puntos fuera: se cuenta cada celda una vez.
    p.calles[0]!.nivelaciones.push({ id: 'niv-martes', nombre: 'martes', color: '#000', tomas: [martes] })
    expect(estadoDe(p, 'cap-subrasante').detalle).toMatch(/^SUBRASANTE: 1 punto fuera/)

    // El martes se corrige la celda que salió fuera y se vuelve a leer: su lectura
    // sube lo que sobraba, y la cota queda en la de proyecto.
    const calle = p.calles[0]!
    const resultado = calcularCampania({ campania: lunes, calle, bms: p.bms })
    const evaluacion = evaluarContraRasante({
      resultado,
      calle,
      toma: lunes,
      rasante: calle.rasante!,
      capas: p.capas,
      capaId: 'cap-subrasante',
    })
    const mala = [...evaluacion.celdas.values()].find((c) => c.estado === 'fuera')!
    for (const estacion of martes.estaciones) {
      for (const l of estacion.intermedias) {
        if (l.destino.tipo === 'celda' && l.destino.celda.progresiva === mala.progresiva && l.destino.celda.elementoClave === mala.elementoClave) {
          l.valor = Math.round((l.valor + mala.diferenciaMm! / 1000) * 1000) / 1000
        }
      }
    }
    expect(estadoDe(p, 'cap-subrasante').estado).not.toBe('conPuntosFuera')
  })

  it('una jornada vacía (sin lecturas) no tapa el estado de la capa', () => {
    const p = obra()
    const vieja = tomaDeCapa(p, 'cap-subrasante')
    const vacia: Toma = {
      ...structuredClone(vieja),
      id: 'toma-vacia',
      fecha: '2026-09-03',
      estaciones: [{ id: 'e-vacia', vistaAtras: { ...vieja.estaciones[0]!.vistaAtras, id: 'l-vacia', valor: 0 }, intermedias: [] }],
    }
    p.calles[0]!.nivelaciones.push({ id: 'niv-vacia', nombre: 'vacía', color: '#000', tomas: [vacia] })
    expect(estadoDe(p, 'cap-subrasante')).toMatchObject({ estado: 'conPuntosFuera', simbolo: '✗' })
    // Y una capa con solo una jornada vacía sigue «sin medir».
    vacia.capaId = 'cap-carpeta'
    expect(estadoDe(p, 'cap-carpeta')).toMatchObject({ estado: 'sinMedir', simbolo: '·' })
  })

  it('una jornada más reciente sin comprobar deja la capa sin comprobar', () => {
    const p = obra()
    p.capas = p.capas.map((c) => ({ ...c, toleranciaMm: 1000 }))
    const vieja = tomaDeCapa(p, 'cap-subrasante')
    const nueva: Toma = { ...structuredClone(vieja), id: 'toma-nueva', fecha: '2026-09-01', cierre: { ...vieja.cierre, tipo: 'abierto' } }
    p.calles[0]!.nivelaciones.push({ id: 'niv-nueva', nombre: 'otra', color: '#000', tomas: [nueva] })
    expect(estadoDe(p, 'cap-subrasante')).toMatchObject({ tomaId: 'toma-nueva', estado: 'sinComprobar' })
  })
})

describe('fraseDeCalle', () => {
  it('pone primero lo más urgente', () => {
    const p = obra()
    expect(fraseDeCalle(capasDeCalle(p, p.calles[0]!))).toMatch(/^SUBRASANTE: 1 punto fuera/)
  })

  it('una calle sin jornadas está sin medir', () => {
    const p = obra()
    p.calles[0]!.nivelaciones = []
    expect(fraseDeCalle(capasDeCalle(p, p.calles[0]!))).toBe('Todavía sin medir')
  })
})

describe('jornadas y cierre', () => {
  it('las jornadas van de la más reciente a la más antigua', () => {
    const p = obra()
    expect(jornadasDeCalle(p, p.calles[0]!).map((j) => j.toma.fecha)).toEqual(['2026-08-20', '2026-08-19'])
  })

  it('el cierre dice ✓ con su error, △ si no volvió, ✗ si no cierra', () => {
    const p = obra()
    const [base] = jornadasDeCalle(p, p.calles[0]!)
    expect(estadoDeCierre(base!.toma, base!.resultado)).toMatchObject({ simbolo: '✓', comprobado: true })

    const toma = tomaDeCapa(p, 'cap-base')
    toma.estaciones[toma.estaciones.length - 1]!.vistaAdelante!.valor += 0.1
    const [mala] = jornadasDeCalle(p, p.calles[0]!)
    expect(estadoDeCierre(mala!.toma, mala!.resultado)).toMatchObject({ simbolo: '✗', comprobado: false })

    toma.cierre.tipo = 'abierto'
    const [abierta] = jornadasDeCalle(p, p.calles[0]!)
    expect(estadoDeCierre(abierta!.toma, abierta!.resultado)).toMatchObject({ simbolo: '△', corto: 'sin vuelta al BM' })
  })

  it('cuenta lecturas y dice el tramo medido', () => {
    const p = obra()
    const toma = tomaDeCapa(p, 'cap-subrasante')
    expect(lecturasDeToma(toma)).toBeGreaterThan(20)
    expect(tramoDeTomas([toma])).toBe('0+000 – 0+080')
    expect(tramoDeTomas([])).toBeNull()
  })

  it('una lectura en cero (la de una jornada recién creada) no cuenta como lectura', () => {
    const p = obra()
    const toma = structuredClone(tomaDeCapa(p, 'cap-subrasante'))
    toma.estaciones = [{ id: 'e', vistaAtras: { ...toma.estaciones[0]!.vistaAtras, valor: 0 }, intermedias: [] }]
    expect(lecturasDeToma(toma)).toBe(0)
    // Ni una que no cabe en la mira del instrumento.
    toma.estaciones[0]!.vistaAtras.valor = 4.5
    expect(lecturasDeToma(toma, 5)).toBe(1)
    expect(lecturasDeToma(toma, 4)).toBe(0)
  })

  it('la fecha de hoy es la del reloj local, no la de Greenwich', () => {
    // 23:30 del 5 de octubre en hora local: en UTC−5 ya es 6 de octubre en Greenwich.
    expect(fechaLocalISO(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05')
    expect(fechaLocalISO(new Date(2026, 0, 9, 0, 5))).toBe('2026-01-09')
  })

  it('escribe los milímetros con su signo', () => {
    expect(milimetros(4.6)).toBe('+5 mm')
    expect(milimetros(-3.2)).toBe('−3 mm')
    expect(milimetros(0.2)).toBe('0 mm')
  })
})

describe('compararJornadas', () => {
  function pareja(p: Proyecto) {
    const [a, b] = jornadasDeCalle(p, p.calles[0]!)
    return compararJornadas(a!, b!)
  }

  it('dos capas seguidas dan el espesor colocado, contra el de proyecto', () => {
    const cmp = pareja(obra())
    expect(cmp.tipo).toBe('espesor')
    expect(cmp.que).toBe('SUBRASANTE → BASE')
    expect(cmp.inferior.toma.capaId).toBe('cap-subrasante')
    expect(cmp.minimoMm).toBe(158)
    expect(cmp.medioMm).toBe(190)
    expect(cmp.maximoMm).toBe(213)
    expect(cmp.lectura).toBe('Proyecto 200 mm ±10: 11 celdas delgadas y 1 celda gruesa.')
    expect(cmp.estado.comprobado).toBe(true)
  })

  it('del terreno a la capa de encima es profundidad de corte, en positivo lo que se bajó', () => {
    const p = obra()
    tomaDeCapa(p, 'cap-subrasante').capaId = 'cap-terreno'
    tomaDeCapa(p, 'cap-base').capaId = 'cap-subrasante'
    const cmp = pareja(p)
    expect(cmp.tipo).toBe('corte')
    expect(cmp.titulo).toBe('Profundidad de corte')
    // Aquí la «subrasante» quedó encima del «terreno»: es relleno, sale negativo.
    expect(cmp.minimoMm).toBe(-213)
    expect(cmp.maximoMm).toBe(-158)
  })

  it('la misma capa dos veces es repetibilidad, y va de la más antigua a la más nueva', () => {
    const p = obra()
    tomaDeCapa(p, 'cap-base').capaId = 'cap-subrasante'
    const cmp = pareja(p)
    expect(cmp.tipo).toBe('repetibilidad')
    expect(cmp.inferior.toma.fecha).toBe('2026-08-19')
    expect(cmp.que).toBe('SUBRASANTE 2026-08-19 → 2026-08-20')
  })

  it('capas salteadas dan la diferencia acumulada', () => {
    const p = obra()
    tomaDeCapa(p, 'cap-base').capaId = 'cap-carpeta'
    expect(pareja(p).tipo).toBe('acumulada')
  })

  it('si una de las dos no cerró, la comparación no está comprobada', () => {
    const p = obra()
    tomaDeCapa(p, 'cap-base').cierre.tipo = 'abierto'
    const cmp = pareja(p)
    expect(cmp.estado.comprobado).toBe(false)
    expect(cmp.estado.texto).toMatch(/NO COMPROBADOS/)
  })
})
