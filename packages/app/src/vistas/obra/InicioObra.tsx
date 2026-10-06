import { instrumentoCompleto, type Id } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../../estado/almacen'
import { buscarToma } from '../../estado/proyectoTomas'
import { cuenta, formatearCota } from '../../formato'
import ListaCalles from './ListaCalles'
import { calcularToma, estadoDeCierre, fechaLocalISO, jornadaMasReciente, lecturasDeToma } from './estadoObra'

const ESTILO_CIERRE = {
  '✓': 'text-pasa',
  '△': 'text-aviso',
  '✗': 'text-falla',
  '·': 'text-slate-300',
} as const

/**
 * «Seguir donde lo dejaste»: la jornada activa, cuánto lleva y si su circuito
 * ya cerró. Si no hay jornada activa (se borró, o se creó una calle nueva), la
 * más reciente de la obra: lo que no puede hacer es decir que no hay ninguna
 * cuando sí las hay.
 */
function TarjetaSeguir() {
  const proyecto = useAlmacen((s) => s.proyecto)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const estacionActiva = useAlmacen((s) => s.estacionActiva)
  const activarCampania = useAlmacen((s) => s.activarCampania)
  const fijarModoCalle = useAlmacen((s) => s.fijarModoCalle)

  const datos = useMemo(() => {
    const hallada = buscarToma(proyecto, campaniaActivaId)
    const activa = hallada ? proyecto.calles.find((c) => c.id === hallada.calleId) : undefined
    const elegida = hallada && activa ? { calle: activa, toma: hallada.toma } : jornadaMasReciente(proyecto)
    if (!elegida) return null
    const { calle, toma } = elegida
    const resultado = calcularToma(proyecto, calle, toma)
    return {
      calle,
      toma,
      esLaActiva: toma.id === campaniaActivaId,
      capa: proyecto.capas.find((c) => c.id === toma.capaId),
      resultado,
      cierre: estadoDeCierre(toma, resultado),
      lecturas: lecturasDeToma(toma, instrumentoCompleto(proyecto.instrumento).largoMira),
    }
  }, [proyecto, campaniaActivaId])

  if (!datos) {
    return (
      <section
        aria-label="Seguir donde lo dejaste"
        className="flex flex-col gap-1 rounded-2xl bg-slate-900 p-4 text-white dark:bg-slate-800"
      >
        <p className="text-sm text-slate-300">Seguir donde lo dejaste</p>
        <p className="text-base">Todavía no hay ninguna jornada. Empieza una nueva o sube una hoja.</p>
      </section>
    )
  }

  const { calle, toma, capa, resultado, cierre, esLaActiva, lecturas } = datos
  const llenas = resultado.celdasLlenas
  const totales = resultado.celdasTotales
  const porcentaje = totales > 0 ? Math.round((llenas / totales) * 100) : 0
  const estacion = esLaActiva
    ? Math.min(estacionActiva, Math.max(toma.estaciones.length - 1, 0)) + 1
    : toma.estaciones.length

  function continuar() {
    if (!esLaActiva) activarCampania(toma.id)
    fijarModoCalle('medir')
  }

  return (
    <section
      aria-label="Seguir donde lo dejaste"
      className="flex flex-col gap-2.5 rounded-2xl bg-slate-900 p-4 text-white dark:bg-slate-800"
    >
      <p className="text-sm text-slate-300">
        Seguir donde lo dejaste{esLaActiva ? '' : ' · la última jornada de la obra'}
      </p>
      <p className="text-xl font-bold">
        {calle.nombre} · {capa?.nombre ?? 'capa sin elegir'}
      </p>
      <p className="flex flex-wrap justify-between gap-x-3 text-sm text-slate-200">
        <span>
          Estación {estacion} · <span className="numerico">{toma.fecha}</span>
        </span>
        <span className="numerico">
          {llenas} / {totales} puntos · {cuenta(lecturas, 'lectura', 'lecturas')}
        </span>
      </p>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded bg-slate-700">
        <div className="h-2 bg-marca" style={{ width: `${porcentaje}%` }} />
      </div>
      <p className={`text-sm ${ESTILO_CIERRE[cierre.simbolo]}`}>
        <span aria-hidden="true">{cierre.simbolo} </span>
        {cierre.largo}
      </p>
      <button
        type="button"
        onClick={continuar}
        className="min-h-12 rounded-lg bg-marca text-base font-semibold text-white"
      >
        Continuar midiendo
      </button>
    </section>
  )
}

interface Props {
  /** La calle que se está mirando en el panel: ahí va la jornada nueva. */
  calleVistaId: Id | null
  alElegirCalle: (calleId: Id) => void
  alSubirHoja: () => void
}

/**
 * El inicio de la obra, pensado para el celular: dónde lo dejaste, subir una
 * hoja o empezar una jornada, y la lista de calles con el estado de sus capas.
 */
export default function InicioObra({ calleVistaId, alElegirCalle, alSubirHoja }: Props) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const agregarCampania = useAlmacen((s) => s.agregarCampania)
  const fijarModoCalle = useAlmacen((s) => s.fijarModoCalle)

  const calle = proyecto.calles.find((c) => c.id === calleVistaId) ?? proyecto.calles[0]
  const bm = proyecto.bms[0]
  // La jornada nueva sigue con la capa de la última jornada de la calle: lo
  // normal es que mañana se continúe lo de hoy. La capa se cambia en la libreta.
  const ultimaToma = calle?.nivelaciones.flatMap((n) => n.tomas).at(-1)
  const capa =
    proyecto.capas.find((c) => c.id === ultimaToma?.capaId) ??
    [...proyecto.capas].sort((a, b) => a.orden - b.orden)[0]

  const faltan: string[] = []
  if (!calle) faltan.push('una calle')
  if (!bm) faltan.push('un banco de nivel')
  if (!capa) faltan.push('una capa')

  function nuevaJornada() {
    if (!calle || !bm || !capa) return
    agregarCampania({
      fecha: fechaLocalISO(),
      calleId: calle.id,
      capaId: capa.id,
      bmInicialId: bm.id,
      cierre: {
        tipo: 'cerrado',
        bmFinalId: bm.id,
        longitudK: 0,
        longitudKAuto: true,
        clase: 'tercerOrden',
        coeficiente: instrumentoCompleto(proyecto.instrumento).coeficienteK,
      },
    })
    fijarModoCalle('medir')
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Obra · {cuenta(proyecto.calles.length, 'calle', 'calles')} ·{' '}
          {cuenta(proyecto.bms.length, 'banco de nivel', 'bancos de nivel')}
        </p>
        <h1 className="text-2xl font-bold leading-tight">{proyecto.meta.nombre || 'Obra sin nombre'}</h1>
      </header>

      <TarjetaSeguir />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={alSubirHoja}
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-base dark:border-slate-700 dark:bg-slate-900"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
          </svg>
          Subir hoja
        </button>
        <button
          type="button"
          onClick={nuevaJornada}
          disabled={faltan.length > 0}
          aria-describedby="detalle-nueva-jornada"
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-base disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nueva jornada
        </button>
      </div>
      <p id="detalle-nueva-jornada" className="-mt-2 text-sm text-slate-600 dark:text-slate-400">
        {faltan.length > 0
          ? `Para empezar una jornada falta ${faltan.join(', ')}.`
          : `Nueva jornada en ${calle!.nombre} · ${capa!.nombre} · desde ${bm!.nombre}, circuito cerrado. Se cambia en la libreta.`}
      </p>

      <ListaCalles calleVistaId={calle?.id ?? null} alElegir={alElegirCalle} />

      {proyecto.bms.length > 0 && (
        <section aria-label="Bancos de nivel de la obra">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
            {proyecto.bms.map((b) => (
              <li key={b.id}>
                {b.nombre} <b className="numerico text-slate-900 dark:text-slate-100">{formatearCota(b.cota)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
