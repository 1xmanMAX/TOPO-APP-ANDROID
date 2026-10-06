import { progresivasDeLaToma } from '@topo/core'
import { useMemo } from 'react'
import { armarCabecera, armarTabla, descargarCsv, descargarXlsx } from '../../archivo/exportar'
import { descargarTopo } from '../../archivo/topo'
import { useAlmacen } from '../../estado/almacen'
import { useContexto, useResultado } from '../../estado/derivados'

const BOTON =
  'min-h-11 rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800'

/**
 * Informes. ESQUELETO del armazón: mientras el agente de Informes arma los
 * PDF (protocolo, libreta con cierre, control, espesores, metrado, hoja de
 * estacas), aquí están las salidas que ya existían: las cotas de la toma
 * activa a Excel o CSV —con la misma cabecera que se exporta desde
 * Revisar— y el proyecto entero en su archivo .topo.
 */
export default function EspacioInformes() {
  const proyecto = useAlmacen((s) => s.proyecto)
  const archivosDePlano = useAlmacen((s) => s.archivosDePlano)
  const contexto = useContexto()
  const resultado = useResultado()

  const tablaCotas = useMemo(() => {
    if (!contexto || !resultado) return []
    const bmInicial = proyecto.bms.find((bm) => bm.id === contexto.campania.bmInicialId)
    return [
      ...armarCabecera({ calle: contexto.calle, capa: contexto.capa, campania: contexto.campania, bmInicial, resultado }),
      [],
      ...armarTabla(resultado, contexto.calle, progresivasDeLaToma(contexto.campania)),
    ]
  }, [contexto, resultado, proyecto.bms])

  const nombreArchivo = `${contexto?.calle.nombre ?? 'cotas'} — ${contexto?.capa?.nombre ?? ''}`.trim()
  const pasa = resultado?.cierre.pasa ?? null

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Informes</h2>

      <section aria-labelledby="informes-cotas" className="flex flex-col gap-2">
        <h3 id="informes-cotas" className="font-semibold">
          Cotas de la toma activa
        </h3>
        {contexto && resultado ? (
          <>
            <p className="text-sm">
              {contexto.calle.nombre}
              {contexto.capa ? ` · ${contexto.capa.nombre}` : ''} · {contexto.campania.fecha}
            </p>
            {/* Lo calculado sobre una nivelación sin cerrar no está comprobado, y se dice. */}
            <p className={`text-sm ${pasa === true ? 'text-pasa' : pasa === false ? 'text-falla' : 'text-aviso'}`}>
              {pasa === true && '✓ La nivelación cerró: cotas compensadas.'}
              {pasa === false && '✗ La nivelación no cerró: las cotas no están comprobadas.'}
              {pasa === null && '△ Nivelación sin cerrar: las cotas no están comprobadas.'}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:flex">
              <button type="button" className={BOTON} onClick={() => descargarXlsx(tablaCotas, nombreArchivo, 'Cotas')}>
                Exportar cotas a Excel
              </button>
              <button type="button" className={BOTON} onClick={() => descargarCsv(tablaCotas, nombreArchivo)}>
                Exportar cotas a CSV
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">No hay una toma abierta: elige una calle con mediciones.</p>
        )}
        <p className="text-xs text-slate-500">
          Espesores y diferencias contra el proyecto se exportan, por ahora, desde Calle › Revisar.
        </p>
      </section>

      <section aria-labelledby="informes-proyecto" className="flex flex-col gap-2">
        <h3 id="informes-proyecto" className="font-semibold">
          Proyecto completo
        </h3>
        <button type="button" className={`${BOTON} self-start`} onClick={() => descargarTopo(proyecto, archivosDePlano)}>
          Guardar el proyecto (.topo)
        </button>
      </section>
    </div>
  )
}
