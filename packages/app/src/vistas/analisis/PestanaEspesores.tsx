import { compararCapas, formatearProgresiva, volumenesPorAreasMedias, type Calle } from '@topo/core'
import { useMemo } from 'react'
import AvisoEspesores from '../../componentes/AvisoEspesores'
import MapaGrilla, { type CeldaPintada } from '../../componentes/MapaGrilla'
import SelectorCapas from '../../componentes/SelectorCapas'
import { useAlmacen } from '../../estado/almacen'
import { useContextoDe, useResultadoDe } from '../../estado/derivados'
import { calcularEstadoComparacion } from '../../estadoComparacion'
import { armarEsqueletoTabla } from '../../esqueletoTabla'
import { formatearCota } from '../../formato'
import { Aviso, formatearM3 } from './comunes'
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
  conforme: 'bg-pasa/20 text-pasa',
  alLimite: 'bg-aviso/30 text-aviso',
  fuera: 'bg-falla/20 text-falla',
  sinDisenio: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  sinPareja: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
}

const SIMBOLO = { conforme: '✓', alLimite: '△', fuera: '✗' } as const
const PALABRA = { conforme: 'conforme', alLimite: 'al límite', fuera: 'fuera de tolerancia' } as const

const LEYENDA: { clase: keyof typeof CLASES; simbolo: string; texto: string }[] = [
  { clase: 'conforme', simbolo: '✓', texto: 'Espesor de diseño' },
  { clase: 'alLimite', simbolo: '△', texto: 'Al límite (hasta 2 × tolerancia)' },
  { clase: 'fuera', simbolo: '✗', texto: 'Fuera: delgada o gruesa' },
  { clase: 'sinPareja', simbolo: '·', texto: 'Medida en una sola capa' },
]

/** Espesores: el mapa celda por celda entre las dos capas que se eligen en el selector. */
export default function PestanaEspesores({ calle }: { calle: Calle }) {
  const comparacion = useAlmacen((s) => s.comparacion)
  const capas = useAlmacen((s) => s.proyecto.capas)
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)
  const contextoInferior = useContextoDe(comparacion.inferior)
  const contextoSuperior = useContextoDe(comparacion.superior)
  const resultadoInferior = useResultadoDe(comparacion.inferior)
  const resultadoSuperior = useResultadoDe(comparacion.superior)

  const tomasDeLaCalle = calle.nivelaciones.reduce((total, n) => total + n.tomas.length, 0)

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
    const delgadas = [...evaluados.values()].filter((e) => e.delgada)
    return { resultado, estado, disenio, sinDisenio, toleranciaMm, evaluados, volumen, esqueleto, delgadas }
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

  return (
    <div className="flex flex-col gap-3">
      <SelectorCapas />

      {!calculo ? (
        <Aviso tono="neutro" simbolo="△">
          Elige arriba la capa de abajo y la de arriba (dos nivelaciones de esta calle) para ver el espesor colocado.
        </Aviso>
      ) : (
        <>
          <AvisoEspesores estado={calculo.estado} />

          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Dato titulo="Mínimo" valor={calculo.resultado.espesorMinimo} />
            <Dato titulo="Medio" valor={calculo.resultado.espesorMedio} />
            <Dato titulo="Máximo" valor={calculo.resultado.espesorMaximo} />
            <div className="rounded border border-slate-200 p-2 dark:border-slate-800">
              <dt className="text-slate-500">De diseño</dt>
              <dd className="numerico text-base font-semibold">
                {calculo.disenio !== null ? `${formatearCota(calculo.disenio)} m ± ${calculo.toleranciaMm} mm` : '—'}
              </dd>
            </div>
          </dl>

          {calculo.sinDisenio === 'mismaCapa' && (
            <Aviso tono="aviso" simbolo="△">
              Las dos nivelaciones son de la misma capa: el mapa enseña cuánto cambió entre una y otra, pero no hay
              espesor de diseño con qué compararlo. Para el espesor colocado, elige arriba la capa siguiente.
            </Aviso>
          )}
          {calculo.sinDisenio === 'alReves' && (
            <Aviso tono="aviso" simbolo="△">
              Elegiste las capas al revés: la «capa de abajo» va por encima de la «de arriba» en el proyecto.
              Intercámbialas en el selector.
            </Aviso>
          )}
          {calculo.sinDisenio === 'sinEspesor' && (
            <Aviso tono="aviso" simbolo="△">
              Las capas no tienen espesor de diseño: el mapa enseña el espesor en mm pero no puede marcar las
              delgadas. Pon el espesor de cada capa en Obra › Calles.
            </Aviso>
          )}

          <MapaGrilla
            progresivas={calculo.esqueleto.progresivas}
            elementos={calculo.esqueleto.elementos}
            llenas={new Set()}
            claveActiva={seleccion.clave}
            alElegir={seleccionar}
            pintarCelda={pintarCelda}
            orientacion="porProgresiva"
          />
          <ul aria-label="Qué significa cada color del mapa de espesores" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            {LEYENDA.map(({ clase, simbolo, texto }) => (
              <li key={clase} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded ${CLASES[clase]}`}>
                  {simbolo}
                </span>
                {texto}
              </li>
            ))}
            <li>Números en mm</li>
          </ul>

          <section aria-label="Celdas delgadas" className="flex flex-col gap-1 text-sm">
            <h3 className="font-semibold">Celdas delgadas</h3>
            {calculo.disenio === null ? (
              <p className="text-slate-500">Sin espesor de diseño no se pueden marcar.</p>
            ) : calculo.delgadas.length === 0 ? (
              <p className="text-pasa">
                <span aria-hidden="true">✓ </span>Ninguna celda queda delgada.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {calculo.delgadas.map((d) => (
                  <li key={d.clave}>
                    <button
                      type="button"
                      onClick={() => seleccionar(d.clave)}
                      aria-label={`${formatearProgresiva(d.progresiva)} ${nombres.get(d.elementoClave) ?? ''}: ${formatearCota(d.espesor!)} m, faltan ${-(d.diferenciaMm ?? 0)} mm`}
                      className="min-h-11 w-full rounded border border-falla px-3 text-left text-falla"
                    >
                      <span aria-hidden="true">{d.estado === 'fuera' ? '✗' : '△'} </span>
                      {formatearProgresiva(d.progresiva)} {nombres.get(d.elementoClave) ?? ''}:{' '}
                      <span className="numerico">{formatearCota(d.espesor!)} m</span>, faltan{' '}
                      {-(d.diferenciaMm ?? 0)} mm
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Volumen colocado" className="flex flex-col gap-1 text-sm">
            <h3 className="font-semibold">Volumen colocado</h3>
            {calculo.volumen.sinDatos ? (
              <p className="text-aviso">
                <span aria-hidden="true">△ </span>No se puede calcular: hacen falta al menos dos progresivas
                medidas en las dos capas.
              </p>
            ) : (
              <>
                <p>
                  <span className="numerico text-base font-semibold">{formatearM3(calculo.volumen.totalCorte)}</span>{' '}
                  entre las dos capas (áreas medias)
                  {!calculo.volumen.comprobado && <span className="font-semibold text-falla"> · no comprobado</span>}
                </p>
                {calculo.volumen.totalRelleno > 0 && (
                  <p className="text-aviso">
                    <span aria-hidden="true">△ </span>
                    {formatearM3(calculo.volumen.totalRelleno)} donde la capa de arriba quedó por debajo de la de
                    abajo: revisa cuál es cuál.
                  </p>
                )}
                {calculo.volumen.huecos.length > 0 && (
                  <p className="text-aviso">
                    <span aria-hidden="true">△ </span>
                    {calculo.volumen.huecos.length === 1 ? '1 tramo' : `${calculo.volumen.huecos.length} tramos`} sin
                    sección intermedia: ese volumen es más dudoso.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: number | null }) {
  return (
    <div className="rounded border border-slate-200 p-2 dark:border-slate-800">
      <dt className="text-slate-500">{titulo}</dt>
      <dd className="numerico text-base font-semibold">{valor !== null ? `${formatearCota(valor)} m` : '—'}</dd>
    </div>
  )
}
