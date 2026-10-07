import { instrumentoCompleto, type Id } from '@topo/core'
import { useMemo } from 'react'
import { BOTON_SECUNDARIO, TARJETA, TARJETA_OSCURA } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import { buscarToma } from '../../estado/proyectoTomas'
import { cuenta, formatearCota } from '../../formato'
import ListaCalles from './ListaCalles'
import { calcularToma, estadoDeCierre, fechaCorta, fechaLocalISO, jornadaMasReciente, lecturasDeToma } from './estadoObra'

/**
 * El cierre sobre la tarjeta oscura, con los tonos claros del lienzo: verde
 * agua si cerró, naranja claro si falta cerrar, rojo claro si no cierra.
 */
const ESTILO_CIERRE = {
  '✓': 'text-[#7CE0C8]',
  '△': 'text-[#FDBA74]',
  '✗': 'text-[#FCA5A5]',
  '·': 'text-cabecera-tenue',
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
      <section aria-label="Seguir donde lo dejaste" className={`flex flex-col gap-1 ${TARJETA_OSCURA}`}>
        <p className="text-[13px] text-cabecera-tenue">Seguir donde lo dejaste</p>
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
    <section aria-label="Seguir donde lo dejaste" className={`flex flex-col gap-2.5 ${TARJETA_OSCURA}`}>
      <p className="text-[13px] text-cabecera-tenue">
        Seguir donde lo dejaste{esLaActiva ? '' : ' · la última jornada de la obra'}
      </p>
      <p className="text-xl leading-tight font-bold">
        {calle.nombre} · {capa?.nombre ?? 'capa sin elegir'}
      </p>
      {/* En un renglón a 390 px: la fecha corta y en letra normal; los puntos en Mono. */}
      <p className="flex flex-wrap justify-between gap-x-2 text-[13px] text-cabecera-texto sm:text-sm">
        <span>
          Estación {estacion} · <span title={toma.fecha}>{fechaCorta(toma.fecha)}</span> ·{' '}
          {cuenta(lecturas, 'lectura', 'lecturas')}
        </span>
        <span className="numerico">
          {llenas} / {totales} puntos
        </span>
      </p>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded bg-[#2C3640]">
        <div className="h-2 bg-marca-viva" style={{ width: `${porcentaje}%` }} />
      </div>
      <p className={`text-[13px] ${ESTILO_CIERRE[cierre.simbolo]}`}>
        <span aria-hidden="true">{cierre.simbolo} </span>
        {cierre.largo}
      </p>
      <button
        type="button"
        onClick={continuar}
        className="flex h-12 items-center justify-center rounded-[10px] bg-marca text-base font-semibold text-white hover:bg-marca-oscura"
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
 * El inicio de la obra, pensado para el celular (lienzo «Inicio»): dónde lo
 * dejaste, subir una hoja o empezar una jornada, y la lista de calles con el
 * estado de sus capas.
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

  // Los dos botones del lienzo: alto de 48 px, letra de 15 px.
  const botonInicio = `${BOTON_SECUNDARIO} min-h-12 text-[15px] font-normal`

  return (
    <div className="flex flex-col gap-3.5">
      <header>
        <p className="text-[13px] text-tenue">
          Obra · {cuenta(proyecto.calles.length, 'calle', 'calles')} ·{' '}
          {cuenta(proyecto.bms.length, 'banco de nivel', 'bancos de nivel')}
        </p>
        <h1 className="text-[26px] leading-[1.15] font-bold">{proyecto.meta.nombre || 'Obra sin nombre'}</h1>
      </header>

      <TarjetaSeguir />

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={alSubirHoja} className={botonInicio}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
          </svg>
          Subir hoja
        </button>
        {/* El nombre es solo «Nueva jornada»; a dónde va, en la descripción y,
            a la vista, en un segundo renglón chico. */}
        <button
          type="button"
          onClick={nuevaJornada}
          disabled={faltan.length > 0}
          aria-label="Nueva jornada"
          aria-describedby="detalle-nueva-jornada"
          className={`${botonInicio} py-1`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span>Nueva jornada</span>
            {faltan.length === 0 && <span className="truncate text-xs text-tenue">desde {bm!.nombre}</span>}
          </span>
        </button>
      </div>
      <p id="detalle-nueva-jornada" className={faltan.length > 0 ? '-mt-1.5 text-sm text-tenue' : 'sr-only'}>
        {faltan.length > 0
          ? `Para empezar una jornada falta ${faltan.join(', ')}.`
          : `Nueva jornada en ${calle!.nombre} · ${capa!.nombre} · desde ${bm!.nombre}, circuito cerrado. Se cambia en la libreta.`}
      </p>

      <ListaCalles calleVistaId={calle?.id ?? null} alElegir={alElegirCalle} />

      {proyecto.bms.length > 0 && (
        <section aria-label="Bancos de nivel de la obra" className={`${TARJETA} py-3`}>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-tenue">
            {proyecto.bms.map((b) => (
              <li key={b.id}>
                {b.nombre} <b className="numerico text-tinta">{formatearCota(b.cota)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
