import { compararCapas, formatearProgresiva, volumenesPorAreasMedias, type Calle, type Capa, type Id, type Toma } from '@topo/core'
import { useEffect, useMemo } from 'react'
import AvisoEspesores from '../../componentes/AvisoEspesores'
import MapaGrilla, { type CeldaPintada } from '../../componentes/MapaGrilla'
import Plegable from '../../componentes/Plegable'
import SelectorCapas from '../../componentes/SelectorCapas'
import { CEJA, CLASES_ESTADO, TARJETA } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import { useContextoDe, useResultadoDe } from '../../estado/derivados'
import { calcularEstadoComparacion } from '../../estadoComparacion'
import { armarEsqueletoTabla } from '../../esqueletoTabla'
import { formatearCota } from '../../formato'
import { Aviso, fechaCorta, formatearM3 } from './comunes'
import {
  espesorDeDisenio,
  porQueSinEspesorDeDisenio,
  evaluarEspesores,
  progresivasDeTomas,
  seccionesEntreSuperficies,
  superficieMedida,
  type EspesorEvaluado,
} from './superficies'

const CLASES: Record<NonNullable<EspesorEvaluado['estado']> | 'sinDisenio' | 'sinPareja', string> = {
  conforme: CLASES_ESTADO.conforme,
  alLimite: CLASES_ESTADO.alLimite,
  fuera: CLASES_ESTADO.fuera,
  sinDisenio: 'bg-sin-suave text-tinta',
  sinPareja: CLASES_ESTADO.sinMedir,
}

const SIMBOLO = { conforme: '✓', alLimite: '△', fuera: '✗' } as const
const PALABRA = { conforme: 'conforme', alLimite: 'al límite', fuera: 'fuera de tolerancia' } as const

/**
 * Las tomas de la calle en el orden de las capas del proyecto (de abajo
 * arriba) y, dentro de una capa, por fecha: el mismo orden del selector.
 */
function tomasEnOrden(calle: Calle, capas: Capa[]): Toma[] {
  const orden = new Map(capas.map((c) => [c.id, c.orden]))
  return calle.nivelaciones
    .flatMap((n) => n.tomas)
    .sort((a, b) => (orden.get(a.capaId) ?? 0) - (orden.get(b.capaId) ?? 0) || a.fecha.localeCompare(b.fecha))
}

/**
 * La comparación que se pide al entrar: arriba la capa activa (o la última
 * medida), abajo la que va justo debajo en el orden de capas. Si la activa es
 * la más baja, se compara con la que va encima. Null si hay menos de dos.
 */
function parejaLogica(tomas: Toma[], activaId: Id | null): { inferior: Id; superior: Id } | null {
  if (tomas.length < 2) return null
  let i = tomas.findIndex((t) => t.id === activaId)
  if (i < 0) i = tomas.length - 1
  if (i === 0) i = 1
  return { inferior: tomas[i - 1]!.id, superior: tomas[i]!.id }
}

/** Espesores: el mapa celda por celda entre dos capas; de entrada, las dos lógicas. */
export default function PestanaEspesores({ calle }: { calle: Calle }) {
  const comparacion = useAlmacen((s) => s.comparacion)
  const capas = useAlmacen((s) => s.proyecto.capas)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const fijarComparacion = useAlmacen((s) => s.fijarComparacion)
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)
  const contextoInferior = useContextoDe(comparacion.inferior)
  const contextoSuperior = useContextoDe(comparacion.superior)
  const resultadoInferior = useResultadoDe(comparacion.inferior)
  const resultadoSuperior = useResultadoDe(comparacion.superior)

  const tomas = useMemo(() => tomasEnOrden(calle, capas), [calle, capas])
  const tomasDeLaCalle = tomas.length

  // Sin pareja elegida (al entrar, o al cambiar de calle) se elige la lógica:
  // así el mapa sale pintado de entrada. Si ya hay una elegida, se respeta.
  const sinPareja = comparacion.inferior === null && comparacion.superior === null
  useEffect(() => {
    if (!sinPareja) return
    const pareja = parejaLogica(tomas, campaniaActivaId)
    if (pareja) fijarComparacion(pareja.inferior, pareja.superior)
  }, [sinPareja, tomas, campaniaActivaId, fijarComparacion])

  // Las dos tomas tienen que ser de esta calle: las claves de celda coinciden entre calles.
  const listos =
    contextoInferior &&
    contextoSuperior &&
    resultadoInferior &&
    resultadoSuperior &&
    contextoInferior.calle.id === calle.id &&
    contextoSuperior.calle.id === calle.id
      ? { contextoInferior, contextoSuperior, resultadoInferior, resultadoSuperior }
      : null

  const calculo = useMemo(() => {
    if (!listos) return null
    const { contextoInferior: ci, contextoSuperior: cs, resultadoInferior: ri, resultadoSuperior: rs } = listos
    const resultado = compararCapas(ri, rs)
    const estado = calcularEstadoComparacion({
      capaInferior: ci.capa,
      capaSuperior: cs.capa,
      campaniaInferior: ci.campania,
      campaniaSuperior: cs.campania,
      resultadoInferior: ri,
      resultadoSuperior: rs,
    })
    const disenio = espesorDeDisenio(capas, ci.campania.capaId, cs.campania.capaId)
    const sinDisenio = disenio === null ? porQueSinEspesorDeDisenio(capas, ci.campania.capaId, cs.campania.capaId) : null
    const toleranciaMm = cs.capa?.toleranciaMm ?? 0
    const evaluados = evaluarEspesores(resultado, disenio, toleranciaMm)
    const progresivas = progresivasDeTomas([ci.campania, cs.campania])
    const volumen = volumenesPorAreasMedias(
      seccionesEntreSuperficies(calle, progresivas, superficieMedida(rs), superficieMedida(ri)),
      { comprobado: estado.comprobado },
    )
    const esqueleto = armarEsqueletoTabla(calle, progresivas)
    const lista = [...evaluados.values()]
    const delgadas = lista.filter((e) => e.delgada)
    const conteo = {
      conforme: lista.filter((e) => e.espesor !== null && e.estado === 'conforme').length,
      alLimite: lista.filter((e) => e.espesor !== null && e.estado === 'alLimite').length,
      fuera: lista.filter((e) => e.espesor !== null && e.estado === 'fuera').length,
      sinDisenio: lista.filter((e) => e.espesor !== null && e.estado === null).length,
    }
    const nombre = (c: typeof ci) => `${c.capa?.nombre ?? '—'} ${fechaCorta(c.campania.fecha)}`
    return {
      resultado,
      estado,
      disenio,
      sinDisenio,
      toleranciaMm,
      evaluados,
      volumen,
      esqueleto,
      delgadas,
      conteo,
      titulo: `${nombre(cs)} − ${nombre(ci)}`,
    }
    // `listos` se arma en cada dibujado: se miran sus piezas, que sí son estables.
  }, [contextoInferior, contextoSuperior, resultadoInferior, resultadoSuperior, capas, calle])

  if (tomasDeLaCalle < 2) {
    return (
      <Aviso tono="neutro" simbolo="△">
        Para el espesor hacen falta dos nivelaciones de esta calle: la capa de abajo y la de arriba. Esta calle
        tiene {tomasDeLaCalle === 0 ? 'ninguna' : 'una'}. Mide la capa siguiente en Calle › Medir.
      </Aviso>
    )
  }

  const nombres = new Map(calculo?.esqueleto.elementos.map((e) => [e.clave, e.nombre]) ?? [])

  function pintarCelda(clave: string): CeldaPintada {
    const evaluado = calculo!.evaluados.get(clave)
    const separador = clave.indexOf('|')
    const lugar = `${formatearProgresiva(Number(clave.slice(0, separador)))} ${nombres.get(clave.slice(separador + 1)) ?? ''}`.trim()
    if (!evaluado || evaluado.espesor === null) {
      return { simbolo: '·', etiqueta: `Espesor en ${lugar}, sin comparar`, clases: CLASES.sinPareja }
    }
    const mm = Math.round(evaluado.espesor * 1000)
    if (evaluado.estado === null) {
      return { simbolo: String(mm), etiqueta: `Espesor en ${lugar}: ${formatearCota(evaluado.espesor)} m`, clases: CLASES.sinDisenio }
    }
    const estado = evaluado.estado
    return {
      simbolo: `${SIMBOLO[estado]}${mm}`,
      etiqueta:
        `Espesor en ${lugar}: ${formatearCota(evaluado.espesor)} m, ${PALABRA[estado]}` +
        (evaluado.delgada ? ', delgada' : ''),
      clases: CLASES[estado],
    }
  }

  // El mínimo admitido: lo de diseño menos la tolerancia. Por debajo, delgada.
  const minimoMm = calculo && calculo.disenio !== null ? Math.round(calculo.disenio * 1000) - calculo.toleranciaMm : null
  const fuera = calculo?.delgadas.filter((d) => d.estado === 'fuera').length ?? 0

  return (
    <div className="flex flex-col gap-4">
      <Plegable
        titulo="Comparando"
        resumen={calculo ? `${calculo.titulo} · cambiar` : 'elige las dos capas'}
        abierto={!calculo}
        className={`${TARJETA} py-1`}
      >
        <div className="pb-3">
          <SelectorCapas />
        </div>
      </Plegable>

      {!calculo ? (
        <Aviso tono="neutro" simbolo="△">
          Elige arriba la capa de abajo y la de arriba (dos nivelaciones de esta calle) para ver el espesor colocado.
        </Aviso>
      ) : (
        <>
          <AvisoEspesores estado={calculo.estado} />

          {calculo.sinDisenio === 'mismaCapa' && (
            <Aviso tono="aviso" simbolo="△">
              Las dos nivelaciones son de la misma capa: el mapa enseña cuánto cambió entre una y otra, pero no hay
              espesor de diseño con qué compararlo. Para el espesor colocado, elige arriba la capa siguiente.
            </Aviso>
          )}
          {calculo.sinDisenio === 'alReves' && (
            <Aviso tono="aviso" simbolo="△">
              Elegiste las capas al revés: la «capa de abajo» va por encima de la «de arriba» en el proyecto.
              Intercámbialas en «Comparando».
            </Aviso>
          )}
          {calculo.sinDisenio === 'sinEspesor' && (
            <Aviso tono="aviso" simbolo="△">
              Las capas no tienen espesor de diseño: el mapa enseña el espesor en mm pero no puede marcar las
              delgadas. Pon el espesor de cada capa en Obra › Calles.
            </Aviso>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
            {/* En el celular el resumen va primero; en la laptop, a la derecha del mapa. */}
            <aside aria-label="Resumen de espesores" className={`${TARJETA} flex flex-col gap-4 lg:order-2`}>
              <span className={CEJA}>Resumen</span>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <Dato titulo="Mínimo" valor={calculo.resultado.espesorMinimo} />
                <Dato titulo="Medio" valor={calculo.resultado.espesorMedio} />
                <Dato titulo="Máximo" valor={calculo.resultado.espesorMaximo} />
                <div className="col-span-3 flex items-baseline justify-between gap-2 text-left">
                  <dt className="text-sm text-tenue">De diseño</dt>
                  <dd className="numerico text-[15px] font-semibold">
                    {calculo.disenio !== null ? `${formatearCota(calculo.disenio)} m ± ${calculo.toleranciaMm} mm` : '—'}
                  </dd>
                </div>
              </dl>

              <section aria-label="Volumen colocado" className="flex flex-col gap-1 text-[15px]">
                <h3 className="text-sm text-tenue">Volumen colocado</h3>
                {calculo.volumen.sinDatos ? (
                  <p className="text-aviso">
                    <span aria-hidden="true">△ </span>No se puede calcular: hacen falta al menos dos progresivas
                    medidas en las dos capas.
                  </p>
                ) : (
                  <>
                    <p>
                      <span className="numerico text-[22px] font-semibold">{formatearM3(calculo.volumen.totalCorte)}</span>{' '}
                      entre las dos capas (áreas medias)
                      {!calculo.volumen.comprobado && <span className="font-semibold text-aviso"> · no comprobado</span>}
                    </p>
                    {calculo.volumen.totalRelleno > 0 && (
                      <p className="text-sm text-aviso">
                        <span aria-hidden="true">△ </span>
                        {formatearM3(calculo.volumen.totalRelleno)} donde la capa de arriba quedó por debajo de la de
                        abajo: revisa cuál es cuál.
                      </p>
                    )}
                    {calculo.volumen.huecos.length > 0 && (
                      <p className="text-sm text-aviso">
                        <span aria-hidden="true">△ </span>
                        {calculo.volumen.huecos.length === 1 ? '1 tramo' : `${calculo.volumen.huecos.length} tramos`}{' '}
                        sin sección intermedia: ese volumen es más dudoso.
                      </p>
                    )}
                  </>
                )}
              </section>

              <section aria-label="Celdas delgadas" className="flex flex-col gap-2 text-[15px]">
                <h3 className="sr-only">Celdas delgadas</h3>
                {calculo.disenio === null ? (
                  <p className="text-sm text-tenue">Sin espesor de diseño no se pueden marcar las celdas delgadas.</p>
                ) : calculo.delgadas.length === 0 ? (
                  <p className="rounded-[10px] bg-pasa-suave px-3 py-2 font-semibold text-pasa [.sol_&]:border [.sol_&]:border-current">
                    <span aria-hidden="true">✓ </span>Ninguna celda queda delgada.
                  </p>
                ) : (
                  <>
                    <p
                      className={`rounded-[10px] px-3 py-2 font-semibold [.sol_&]:border [.sol_&]:border-current ${fuera > 0 ? 'bg-falla-suave text-falla' : 'bg-aviso-suave text-aviso'}`}
                    >
                      <span aria-hidden="true">{fuera > 0 ? '✗ ' : '△ '}</span>
                      {calculo.delgadas.length === 1 ? '1 punto' : `${calculo.delgadas.length} puntos`} con menos de{' '}
                      {minimoMm} mm
                    </p>
                    <ul className="flex flex-col gap-1">
                      {calculo.delgadas.map((d) => (
                        <li key={d.clave}>
                          <button
                            type="button"
                            onClick={() => seleccionar(d.clave)}
                            aria-label={`${formatearProgresiva(d.progresiva)} ${nombres.get(d.elementoClave) ?? ''}: ${formatearCota(d.espesor!)} m, faltan ${-(d.diferenciaMm ?? 0)} mm`}
                            // △ al límite va en el color de aviso, como en el mapa; solo ✗ va en rojo.
                            className={`min-h-11 w-full rounded-[10px] border px-3 text-left text-sm ${d.estado === 'fuera' ? 'border-falla text-falla' : 'border-aviso text-aviso'}`}
                          >
                            <span aria-hidden="true">{d.estado === 'fuera' ? '✗' : '△'} </span>
                            {formatearProgresiva(d.progresiva)} {nombres.get(d.elementoClave) ?? ''}:{' '}
                            <span className="numerico">{formatearCota(d.espesor!)} m</span>, faltan{' '}
                            {-(d.diferenciaMm ?? 0)} mm
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            </aside>

            <div className={`${TARJETA} flex min-w-0 flex-col gap-3 lg:order-1`}>
              <h3 className="text-[17px] font-bold">Espesor colocado, en mm</h3>
              <MapaGrilla
                progresivas={calculo.esqueleto.progresivas}
                elementos={calculo.esqueleto.elementos}
                llenas={new Set()}
                claveActiva={seleccion.clave}
                alElegir={seleccionar}
                pintarCelda={pintarCelda}
                orientacion="porProgresiva"
              />
              <ul
                aria-label="Qué significa cada color del mapa de espesores"
                className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-tenue"
              >
                <li className="text-pasa">
                  <span aria-hidden="true">✓ </span>
                  {calculo.conteo.conforme} conformes
                </li>
                <li className="text-aviso">
                  <span aria-hidden="true">△ </span>
                  {calculo.conteo.alLimite} al límite
                </li>
                <li className="text-falla">
                  <span aria-hidden="true">✗ </span>
                  {calculo.conteo.fuera} fuera
                </li>
                {calculo.conteo.sinDisenio > 0 && <li>{calculo.conteo.sinDisenio} sin espesor de diseño</li>}
                <li>
                  <span aria-hidden="true">· </span>sin comparar
                </li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: number | null }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-fondo px-1 py-2 [.sol_&]:border [.sol_&]:border-borde">
      <dt className="text-xs text-tenue">{titulo}</dt>
      <dd className="numerico text-[19px] leading-tight font-semibold whitespace-nowrap min-[380px]:text-[22px]">
        {valor !== null ? (
          <>
            {formatearCota(valor)}
            <span className="text-xs font-normal"> m</span>
          </>
        ) : (
          '—'
        )}
      </dd>
    </div>
  )
}
