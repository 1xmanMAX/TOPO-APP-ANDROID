import {
  esponjamiento,
  formatearProgresiva,
  viajesDeVolquete,
  volumenesPorAreasMedias,
  type Calle,
  type Id,
  type Toma,
} from '@topo/core'
import { useMemo } from 'react'
import CampoNumero from '../../componentes/CampoNumero'
import { useAlmacen } from '../../estado/almacen'
import { useResultadosDe, type ContextoCampania } from '../../estado/derivados'
import { Aviso, AvisoNoComprobado, formatearM3, motivoSinCierre, SELECTOR } from './comunes'
import {
  progresivasDeTomas,
  seccionesEntreSuperficies,
  superficieDeProyecto,
  superficieMedida,
  type CotaEnCelda,
} from './superficies'

/** Una superficie elegible: lo medido en una toma, o lo que el proyecto pide para una capa. */
type Opcion = { valor: string; texto: string } & ({ tipo: 'toma'; toma: Toma } | { tipo: 'proyecto'; capaId: Id })

/** Lo que se elige en Volúmenes; lo guarda PantallaAnalisis para que no se pierda al cambiar de pestaña. */
export interface EleccionVolumenes {
  /** Valor del selector; null = lo de fábrica. */
  arriba: string | null
  abajo: string | null
  /** Tal como se escribió: si es ≤ 0 se avisa en vez de calcular con él. */
  factor: number
  capacidad: number
}
export const VOLUMENES_DE_FABRICA: EleccionVolumenes = { arriba: null, abajo: null, factor: 1.25, capacidad: 15 }

/**
 * Cómo se leen los dos totales del motor (corte = la de encima por sobre la
 * de debajo). Solo se habla de «sobra» y «falta» cuando una superficie es lo
 * medido y la otra el proyecto; si el proyecto se puso arriba, la cuenta se
 * da vuelta para que «sobra» siga siendo material medido de más. Entre dos
 * medidas no hay sobra ni falta: solo cuánto queda una encima de la otra.
 */
type Lectura = 'medidoContraProyecto' | 'entreMedidas'
const ROTULOS: Record<Lectura, { encima: string; debajo: string; barraEncima: string; barraDebajo: string }> = {
  medidoContraProyecto: {
    encima: 'Corte (sobra)',
    debajo: 'Relleno (falta)',
    barraEncima: 'Corte',
    barraDebajo: 'Relleno',
  },
  entreMedidas: {
    encima: 'Arriba queda encima',
    debajo: 'Arriba queda debajo',
    barraEncima: 'Encima',
    barraDebajo: 'Debajo',
  },
}

/**
 * Volúmenes de corte y relleno entre dos superficies por áreas medias, con
 * los offsets de la sección de la calle. De fábrica: lo medido en la toma
 * activa contra lo que el proyecto pide para su capa, que es lo que se
 * pregunta en obra («¿cuánto falta cortar?»).
 */
export default function PestanaVolumenes({
  calle,
  contexto,
  eleccion,
  alCambiar,
}: {
  calle: Calle
  contexto: ContextoCampania | null
  eleccion: EleccionVolumenes
  alCambiar: (cambio: Partial<EleccionVolumenes>) => void
}) {
  const capas = useAlmacen((s) => s.proyecto.capas)
  const rasante = calle.rasante

  const opciones = useMemo<Opcion[]>(() => {
    const nombreCapa = (id: Id) => capas.find((c) => c.id === id)?.nombre ?? '—'
    const tomas: Opcion[] = calle.nivelaciones.flatMap((n) =>
      n.tomas.map((toma) => ({
        valor: `toma:${toma.id}`,
        texto: `Medido · ${nombreCapa(toma.capaId)} · ${toma.fecha}`,
        tipo: 'toma' as const,
        toma,
      })),
    )
    const proyecto: Opcion[] = rasante
      ? [...capas]
          .sort((a, b) => a.orden - b.orden)
          .map((capa) => ({
            valor: `proyecto:${capa.id}`,
            texto: `Proyecto · ${capa.nombre}`,
            tipo: 'proyecto' as const,
            capaId: capa.id,
          }))
      : []
    return [...tomas, ...proyecto]
  }, [calle, capas, rasante])

  const arribaDeFabrica = contexto ? `toma:${contexto.campania.id}` : ''
  const abajoDeFabrica = contexto && rasante ? `proyecto:${contexto.campania.capaId}` : ''
  const { arriba: arribaPedida, abajo: abajoPedida, factor, capacidad } = eleccion

  // Si lo elegido ya no existe (rasante borrada, toma eliminada), se vuelve a lo de fábrica.
  const valores = new Set(opciones.map((o) => o.valor))
  const arribaValor = arribaPedida !== null && valores.has(arribaPedida) ? arribaPedida : arribaDeFabrica
  const abajoValor = abajoPedida !== null && valores.has(abajoPedida) ? abajoPedida : abajoDeFabrica
  const arriba = opciones.find((o) => o.valor === arribaValor) ?? null
  const abajo = opciones.find((o) => o.valor === abajoValor) ?? null

  const idsTomas = [arriba, abajo].flatMap((o) => (o?.tipo === 'toma' ? [o.toma.id] : []))
  const resultados = useResultadosDe(idsTomas)

  const calculo = useMemo(() => {
    if (!arriba || !abajo || arriba.valor === abajo.valor) return null
    const superficie = (o: Opcion): CotaEnCelda | null => {
      if (o.tipo === 'proyecto') return rasante ? superficieDeProyecto(rasante, capas, o.capaId) : null
      const r = resultados.get(o.toma.id)
      return r ? superficieMedida(r) : null
    }
    const sArriba = superficie(arriba)
    const sAbajo = superficie(abajo)
    if (!sArriba || !sAbajo) return null

    // El proyecto no tiene progresivas propias: las ponen las tomas elegidas.
    const tomas = [arriba, abajo].flatMap((o) => (o.tipo === 'toma' ? [o.toma] : []))
    const progresivas = progresivasDeTomas(tomas)
    // Lo medido sin cierre no está comprobado; el proyecto no se mide, no hace falta que cierre.
    const sinCierre = tomas.filter((t) => resultados.get(t.id)?.cierre.pasa !== true)
    // Cada toma sin cierre con su porqué: fuera de tolerancia no es lo mismo que sin cerrar contra un BM.
    const motivos = [...new Set(sinCierre.map((t) => motivoSinCierre(resultados.get(t.id)?.cierre.pasa ?? null)))]
    const conProyecto = arriba.tipo === 'proyecto' || abajo.tipo === 'proyecto'
    const lectura: Lectura = conProyecto ? 'medidoContraProyecto' : 'entreMedidas'
    // Con el proyecto arriba se calcula al revés: así «corte» es siempre lo medido que sobra.
    const [encima, debajo] = arriba.tipo === 'proyecto' ? [sAbajo, sArriba] : [sArriba, sAbajo]
    const volumenes = volumenesPorAreasMedias(seccionesEntreSuperficies(calle, progresivas, encima, debajo), {
      comprobado: sinCierre.length === 0,
    })
    return { volumenes, motivos, lectura, sinTomas: tomas.length === 0 }
  }, [arriba, abajo, rasante, capas, resultados, calle])

  const sinNada = opciones.length === 0
  const mismas = arriba !== null && abajo !== null && arriba.valor === abajo.valor
  const faltaUna = !arriba || !abajo
  const cuantasTomas = opciones.filter((o) => o.tipo === 'toma').length

  // Lo que falta, dicho según lo que de verdad falta.
  function queFalta(): string {
    if (opciones.length >= 2) {
      return rasante
        ? 'Elige las dos superficies.'
        : 'Esta calle no tiene rasante de proyecto: elige dos nivelaciones, o carga la rasante en Obra › Calles.'
    }
    if (!rasante) {
      return (
        'Falta la otra superficie: esta calle no tiene rasante de proyecto y tiene una sola nivelación. ' +
        'Carga la rasante en Obra › Calles, o mide otra capa (por ejemplo el terreno antes de cortar) en Calle › Medir.'
      )
    }
    if (cuantasTomas === 0) {
      return 'Falta lo medido: esta calle todavía no tiene nivelaciones. Mide la calle en Calle › Medir para compararla con el proyecto.'
    }
    return 'Falta la otra superficie: el proyecto tiene una sola capa. Declara las capas en Obra › Calles, o mide otra capa en Calle › Medir.'
  }

  return (
    <div className="flex flex-col gap-3">
      {sinNada ? (
        <Aviso tono="neutro" simbolo="△">
          Para sacar volúmenes hacen falta dos superficies, y esta calle no tiene ninguna. Mide el terreno en Calle ›
          Medir y carga la rasante del proyecto en Obra › Calles.
        </Aviso>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <ElegirSuperficie
            etiqueta="Superficie de arriba"
            valor={arribaValor}
            opciones={opciones}
            alCambiar={(v) => alCambiar({ arriba: v })}
          />
          <ElegirSuperficie
            etiqueta="Superficie de abajo"
            valor={abajoValor}
            opciones={opciones}
            alCambiar={(v) => alCambiar({ abajo: v })}
          />
        </div>
      )}

      {!sinNada && faltaUna && (
        <Aviso tono="aviso" simbolo="△">
          {queFalta()}
        </Aviso>
      )}
      {mismas && (
        <Aviso tono="aviso" simbolo="△">
          Arriba y abajo son la misma superficie: elige otra para una de las dos.
        </Aviso>
      )}

      {calculo && calculo.sinTomas && (
        <Aviso tono="aviso" simbolo="△">
          Dos superficies de proyecto no tienen progresivas propias: elige al menos una nivelación medida.
        </Aviso>
      )}

      {calculo && !calculo.sinTomas && (
        <>
          {!calculo.volumenes.comprobado && <AvisoNoComprobado que="VOLÚMENES" motivo={calculo.motivos.join('; ')} />}
          {calculo.lectura === 'entreMedidas' && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Las dos son medidas: no hay sobra ni falta contra el proyecto, solo cuánto queda la de arriba encima o
              debajo de la de abajo (por ejemplo, el material colocado entre dos capas).
            </p>
          )}
          {calculo.volumenes.sinDatos ? (
            <Aviso tono="aviso" simbolo="△">
              No se puede calcular: hacen falta al menos dos progresivas donde se conozcan las dos superficies.
              Mide más progresivas o revisa que la sección del proyecto cubra los puntos medidos.
            </Aviso>
          ) : (
            <Resultado volumenes={calculo.volumenes} lectura={calculo.lectura} factor={factor} capacidad={capacidad} />
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1 rounded border border-slate-200 p-2 text-sm dark:border-slate-800">
              <CampoNumero
                etiqueta="Esponjamiento"
                ariaLabel="Factor de esponjamiento"
                valor={factor}
                decimales={2}
                ancho="w-full"
                alCambiar={(v) => alCambiar({ factor: v })}
              />
              {!(factor > 0) && (
                <span className="text-falla">
                  <span aria-hidden="true">✗ </span>El esponjamiento tiene que ser mayor que cero (suele ir de 1.10 a
                  1.40).
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1 rounded border border-slate-200 p-2 text-sm dark:border-slate-800">
              <CampoNumero
                etiqueta="Volquete (m³)"
                ariaLabel="Capacidad del volquete"
                valor={capacidad}
                decimales={1}
                ancho="w-full"
                alCambiar={(v) => alCambiar({ capacidad: v })}
              />
              {!(capacidad > 0) && (
                <span className="text-falla">
                  <span aria-hidden="true">✗ </span>La capacidad del volquete tiene que ser mayor que cero.
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ElegirSuperficie({
  etiqueta,
  valor,
  opciones,
  alCambiar,
}: {
  etiqueta: string
  valor: string
  opciones: Opcion[]
  alCambiar: (valor: string) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{etiqueta}</span>
      <select aria-label={etiqueta} value={valor} onChange={(e) => alCambiar(e.target.value)} className={SELECTOR}>
        <option value="">— elige —</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  )
}

function Resultado({
  volumenes,
  lectura,
  factor,
  capacidad,
}: {
  volumenes: ReturnType<typeof volumenesPorAreasMedias>
  lectura: Lectura
  factor: number
  capacidad: number
}) {
  const rotulos = ROTULOS[lectura]
  // Con un factor o un volquete imposibles no se inventan viajes: se dice en el campo y aquí queda en blanco.
  const valido = factor > 0 && capacidad > 0
  const mayor = Math.max(1e-9, ...volumenes.tramos.map((t) => Math.max(t.volCorte, t.volRelleno)))

  function suelto(total: number): string {
    if (!valido) return 'suelto y viajes: revisa el factor y el volquete'
    const valor = esponjamiento(total, factor)
    return `suelto ${formatearM3(valor)} · ${viajesDeVolquete(valor, capacidad)} viajes`
  }

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded border border-aviso p-2">
          <dt className="text-slate-600 dark:text-slate-300">
            <span aria-hidden="true">▲ </span>
            {rotulos.encima}
          </dt>
          <dd className="numerico text-lg font-semibold">{formatearM3(volumenes.totalCorte)}</dd>
          <dd className="text-xs text-slate-600 dark:text-slate-300">{suelto(volumenes.totalCorte)}</dd>
        </div>
        <div className="rounded border border-marca p-2">
          <dt className="text-slate-600 dark:text-slate-300">
            <span aria-hidden="true">▼ </span>
            {rotulos.debajo}
          </dt>
          <dd className="numerico text-lg font-semibold">{formatearM3(volumenes.totalRelleno)}</dd>
          <dd className="text-xs text-slate-600 dark:text-slate-300">{suelto(volumenes.totalRelleno)}</dd>
        </div>
      </dl>

      <ul aria-label="Volumen por tramo" className="flex flex-col gap-2 text-sm">
        {volumenes.tramos.map((t) => (
          <li key={`${t.desde}-${t.hasta}`} className="flex flex-col gap-1 rounded border border-slate-200 p-2 dark:border-slate-800">
            <span className="numerico font-medium">
              {formatearProgresiva(t.desde)} → {formatearProgresiva(t.hasta)}
              {t.hueco && (
                <span className="ml-2 text-aviso">
                  <span aria-hidden="true">△ </span>sin sección intermedia
                </span>
              )}
            </span>
            <Barra texto={`${rotulos.barraEncima} ${formatearM3(t.volCorte)}`} fraccion={t.volCorte / mayor} clase="bg-aviso" />
            <Barra texto={`${rotulos.barraDebajo} ${formatearM3(t.volRelleno)}`} fraccion={t.volRelleno / mayor} clase="bg-marca" />
          </li>
        ))}
      </ul>

      {volumenes.seccionesIncompletas.length > 0 && (
        <p className="text-sm text-aviso">
          <span aria-hidden="true">△ </span>Secciones con puntos sin dato (sus áreas salen más chicas):{' '}
          {volumenes.seccionesIncompletas.map(formatearProgresiva).join(', ')}. Mide los puntos que faltan.
        </p>
      )}
      {volumenes.descartadas.length > 0 && (
        <p className="text-sm text-aviso">
          <span aria-hidden="true">△ </span>Progresivas sin área (menos de dos puntos con las dos superficies):{' '}
          {volumenes.descartadas.map((d) => (d.progresiva === null ? '—' : formatearProgresiva(d.progresiva))).join(', ')}.
        </p>
      )}
    </div>
  )
}

function Barra({ texto, fraccion, clase }: { texto: string; fraccion: number; clase: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="numerico w-32 shrink-0 text-xs">{texto}</span>
      <div className="h-3 flex-1 rounded bg-slate-100 dark:bg-slate-800" aria-hidden="true">
        <div className={`h-3 rounded ${clase}`} style={{ width: `${Math.max(0, Math.min(1, fraccion)) * 100}%` }} />
      </div>
    </div>
  )
}
