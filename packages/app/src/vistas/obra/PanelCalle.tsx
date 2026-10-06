import { formatearProgresiva, hayDistanciasDeFabrica, type Calle, type Rasante } from '@topo/core'
import { useMemo, useState } from 'react'
import CampoTexto from '../../componentes/CampoTexto'
import EditorRasante from '../../componentes/EditorRasante'
import { useAlmacen } from '../../estado/almacen'
import { cuenta, formatearCota } from '../../formato'
import VistaSeccion from '../VistaSeccion'
import Apartado from './Apartado'
import { estadoDeCierre, jornadasDeCalle, tramoDeTomas } from './estadoObra'
import JornadasCalle from './JornadasCalle'
import SubirHojaEmbebida from './SubirHojaEmbebida'

export type ApartadoCalle = 'seccion' | 'rasante' | 'anchos' | 'jornadas' | 'subir'

/** Un número con su signo siempre escrito, con el menos tipográfico. */
function conSigno(valor: number, decimales: number): string {
  const texto = Math.abs(valor).toFixed(decimales)
  if (Number(texto) === 0) return texto
  return `${valor > 0 ? '+' : '−'}${texto}`
}

function resumenSeccion(calle: Calle): string {
  const distancias = calle.seccion.puntos.map((p) => p.distancia)
  if (distancias.length === 0) return 'Sin puntos todavía'
  const desde = Math.min(...distancias)
  const hasta = Math.max(...distancias)
  const fabrica = hayDistanciasDeFabrica(calle.seccion) ? ' · △ distancias de fábrica, sin medir' : ''
  return `${cuenta(distancias.length, 'punto', 'puntos')} · de ${conSigno(desde, 2)} a ${conSigno(hasta, 2)} m${fabrica}`
}

function resumenRasante(rasante: Rasante | null): string {
  if (!rasante) return 'Sin rasante: la calle se mide igual, pero sin cota de proyecto con qué comparar'
  const tramos = rasante.tramos.map((t) =>
    t.tipo === 'pendiente' ? `${t.nombre.toLowerCase()} ${conSigno(t.valor, 1)} %` : `${t.nombre.toLowerCase()} ${conSigno(t.valor, 2)} m`,
  )
  return [
    `${formatearCota(rasante.cotaArranque)} en ${formatearProgresiva(rasante.progresivaArranque)}`,
    `${conSigno(rasante.pendienteLongitudinal, 2)} %`,
    ...tramos,
  ].join(' · ')
}

interface Props {
  calle: Calle
  abiertos: Set<ApartadoCalle>
  alAlternar: (apartado: ApartadoCalle) => void
  /** Solo en el celular: vuelve a la lista de calles. */
  alVolver: () => void
}

/**
 * La calle en un solo panel (pantalla 10 del lienzo): sección, rasante,
 * anchos, jornadas y subir hoja, cada uno plegable y diciendo qué tiene sin
 * abrirlo.
 */
export default function PanelCalle({ calle, abiertos, alAlternar, alVolver }: Props) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const actualizarCalle = useAlmacen((s) => s.actualizarCalle)
  const eliminarCalle = useAlmacen((s) => s.eliminarCalle)
  const irAEspacio = useAlmacen((s) => s.irAEspacio)
  const calleActivaId = useAlmacen((s) => s.calleActivaId)
  const activarCalle = useAlmacen((s) => s.activarCalle)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)

  const jornadas = useMemo(() => jornadasDeCalle(proyecto, calle), [proyecto, calle])
  const tramo = tramoDeTomas(jornadas.map((j) => j.toma))
  const ultima = jornadas[0]
  const resumenJornadas = ultima
    ? `${cuenta(jornadas.length, 'jornada', 'jornadas')} · la última ${ultima.toma.fecha}, ${ultima.capa?.nombre ?? 'sin capa'}: ${(() => {
        const c = estadoDeCierre(ultima.toma, ultima.resultado)
        return `${c.simbolo} ${c.corto}`
      })()}`
    : 'Ninguna jornada todavía'
  const puntosOrdenados = [...calle.seccion.puntos].sort((a, b) => a.distancia - b.distancia)

  return (
    <section aria-label={`Panel de ${calle.nombre}`} className="flex min-w-0 flex-col gap-3">
      <button
        type="button"
        onClick={alVolver}
        className="flex min-h-11 items-center gap-1 self-start text-base font-medium text-marca lg:hidden"
      >
        <span aria-hidden="true">‹</span> Volver a la obra
      </button>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* Recibe el foco al abrir el panel en el celular, donde la lista desaparece. */}
        <h2 tabIndex={-1} className="text-2xl font-bold">
          {calle.nombre}
        </h2>
        <span className="numerico text-slate-600 dark:text-slate-400">{tramo ?? 'sin medir'}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            // Mirar la calle no la activó; abrirla sí. Si ya era la activa, se
            // queda la jornada en que se estaba, no la última de la calle.
            if (calleActivaId !== calle.id) activarCalle(calle.id)
            irAEspacio('calle')
          }}
          className="min-h-11 rounded-lg bg-marca px-4 text-base font-semibold text-white"
        >
          Abrir la calle ›
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 [&_input]:min-h-11 [&_input]:text-base">
          <CampoTexto
            etiqueta="Nombre de la calle"
            valor={calle.nombre}
            alCambiar={(v) => actualizarCalle(calle.id, { nombre: v })}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirmarBorrado) {
              eliminarCalle(calle.id)
              setConfirmarBorrado(false)
            } else {
              setConfirmarBorrado(true)
            }
          }}
          onBlur={() => setConfirmarBorrado(false)}
          className="min-h-11 rounded-lg border border-falla px-3 text-sm text-falla"
        >
          {confirmarBorrado
            ? `¿Seguro? Se borran ${cuenta(jornadas.length, 'jornada', 'jornadas')}`
            : 'Eliminar la calle'}
        </button>
      </div>

      <Apartado
        titulo="Sección"
        resumen={resumenSeccion(calle)}
        abierto={abiertos.has('seccion')}
        alAlternar={() => alAlternar('seccion')}
      >
        <VistaSeccion calleId={calle.id} />
      </Apartado>

      <Apartado
        titulo="Rasante"
        resumen={<span className="numerico">{resumenRasante(calle.rasante)}</span>}
        abierto={abiertos.has('rasante')}
        alAlternar={() => alAlternar('rasante')}
      >
        <div className="p-3 sm:p-4">
          <EditorRasante calleId={calle.id} puntos={calle.seccion.puntos} />
        </div>
      </Apartado>

      <Apartado
        titulo="Anchos"
        resumen="Un solo ancho para toda la calle: los anchos por progresiva todavía no están en el modelo"
        abierto={abiertos.has('anchos')}
        alAlternar={() => alAlternar('anchos')}
      >
        <div className="flex flex-col gap-2 p-3 sm:p-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <span aria-hidden="true">△ </span>
            Esta versión todavía no guarda anchos medidos en cada progresiva: la sección vale igual de
            punta a punta. Estas son sus distancias al eje; se cambian en «Sección».
          </p>
          <table className="w-full max-w-md text-sm">
            <caption className="sr-only">Distancias al eje de la sección</caption>
            <thead>
              <tr className="text-left text-slate-600 dark:text-slate-400">
                <th className="py-1 font-medium">Punto</th>
                <th className="py-1 text-right font-medium">m al eje</th>
              </tr>
            </thead>
            <tbody>
              {puntosOrdenados.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1.5">{p.nombre}</td>
                  <td className="numerico py-1.5 text-right">
                    {conSigno(p.distancia, 2)}
                    {p.distanciaDeFabrica ? <span className="text-aviso"> △ de fábrica</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Apartado>

      <Apartado
        titulo="Jornadas y hojas"
        resumen={resumenJornadas}
        abierto={abiertos.has('jornadas')}
        alAlternar={() => alAlternar('jornadas')}
      >
        <JornadasCalle calle={calle} />
      </Apartado>

      {/* La subida de datos todavía no sabe de qué calle es este panel: toma el
          nombre del archivo. Por eso el apartado no promete «a esta calle». */}
      <Apartado
        titulo="Subir una hoja de campo"
        resumen="Suelta aquí tu Excel o pega las celdas. Antes de aceptar, di a qué calle va: se suma a esa calle sin pisar nada"
        abierto={abiertos.has('subir')}
        alAlternar={() => alAlternar('subir')}
        conservarMontado
      >
        <SubirHojaEmbebida calleDelPanel={calle.nombre} />
      </Apartado>
    </section>
  )
}
