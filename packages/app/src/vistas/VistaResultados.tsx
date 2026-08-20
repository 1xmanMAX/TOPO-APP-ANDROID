import { compararCapas } from '@topo/core'
import { useMemo, useState } from 'react'
import {
  armarCabecera,
  armarCabeceraComparacion,
  armarTabla,
  armarTablaEspesores,
  copiarAlPortapapeles,
  descargarCsv,
  descargarXlsx,
} from '../archivo/exportar'
import AvisoEspesores from '../componentes/AvisoEspesores'
import BarraCierre from '../componentes/BarraCierre'
import CorteTransversal from '../componentes/CorteTransversal'
import DeslizadorProgresiva from '../componentes/DeslizadorProgresiva'
import ListaAvisos from '../componentes/ListaAvisos'
import PerfilLongitudinal from '../componentes/PerfilLongitudinal'
import SelectorCapas from '../componentes/SelectorCapas'
import TablaEspesores from '../componentes/TablaEspesores'
import TablaResultados from '../componentes/TablaResultados'
import { calcularEstadoComparacion } from '../estadoComparacion'
import { useAlmacen } from '../estado/almacen'
import { useContexto, useContextoDe, useProgresivas, useResultado, useResultadoDe } from '../estado/derivados'

export default function VistaResultados() {
  const contexto = useContexto()
  const resultado = useResultado()
  const seleccion = useAlmacen((s) => s.seleccion)
  const irAProgresiva = useAlmacen((s) => s.irAProgresiva)
  const proyecto = useAlmacen((s) => s.proyecto)
  const [elementoPedido, setElementoPedido] = useState('EJE')

  const progresivas = useProgresivas()

  const tabla = useMemo(
    () => (resultado && contexto ? armarTabla(resultado, contexto.calle, contexto.plantilla) : []),
    [resultado, contexto],
  )

  const tablaCompleta = useMemo(() => {
    if (!resultado || !contexto) return []
    const bmInicial = proyecto.bms.find((bm) => bm.id === contexto.campania.bmInicialId)
    return [
      ...armarCabecera({
        calle: contexto.calle,
        capa: contexto.capa,
        campania: contexto.campania,
        bmInicial,
        resultado,
      }),
      [],
      ...tabla,
    ]
  }, [resultado, contexto, tabla, proyecto.bms])

  const comparacionSeleccion = useAlmacen((s) => s.comparacion)
  const contextoInferior = useContextoDe(comparacionSeleccion.inferior)
  const contextoSuperior = useContextoDe(comparacionSeleccion.superior)
  const resultadoInferior = useResultadoDe(comparacionSeleccion.inferior)
  const resultadoSuperior = useResultadoDe(comparacionSeleccion.superior)

  const comparacion = useMemo(() => {
    if (!resultadoInferior || !resultadoSuperior) return null
    return compararCapas(resultadoInferior, resultadoSuperior)
  }, [resultadoInferior, resultadoSuperior])

  const tablaEspesores = useMemo(() => {
    if (!comparacion || !contextoInferior) return []
    return armarTablaEspesores(comparacion, contextoInferior.calle, contextoInferior.plantilla)
  }, [comparacion, contextoInferior])

  // Misma fuente que la cabecera del archivo exportado: si una de las dos
  // campañas no cerró, el espesor no está comprobado aunque la resta haya
  // sido posible. `null` mientras falte elegir alguna de las dos capas.
  const estadoComparacion = useMemo(() => {
    if (!contextoInferior || !contextoSuperior || !resultadoInferior || !resultadoSuperior) return null
    return calcularEstadoComparacion({
      capaInferior: contextoInferior.capa,
      capaSuperior: contextoSuperior.capa,
      campaniaInferior: contextoInferior.campania,
      campaniaSuperior: contextoSuperior.campania,
      resultadoInferior,
      resultadoSuperior,
    })
  }, [contextoInferior, contextoSuperior, resultadoInferior, resultadoSuperior])

  const tablaEspesoresCompleta = useMemo(() => {
    if (!comparacion || !contextoInferior || !contextoSuperior || !resultadoInferior || !resultadoSuperior) return []
    return [
      ...armarCabeceraComparacion({
        calle: contextoInferior.calle,
        capaInferior: contextoInferior.capa,
        capaSuperior: contextoSuperior.capa,
        campaniaInferior: contextoInferior.campania,
        campaniaSuperior: contextoSuperior.campania,
        resultadoInferior,
        resultadoSuperior,
        comparacion,
      }),
      [],
      ...tablaEspesores,
    ]
  }, [comparacion, contextoInferior, contextoSuperior, resultadoInferior, resultadoSuperior, tablaEspesores])

  const [copiado, setCopiado] = useState(false)
  const [copiadoEspesores, setCopiadoEspesores] = useState(false)
  const nombreArchivo = `${contexto?.calle.nombre ?? 'cotas'} — ${contexto?.capa?.nombre ?? ''}`.trim()
  // Con un guion en vez de una cadena vacía cuando falta la capa: así nunca
  // quedan dos espacios seguidos ("Espesores  a SUBRASANTE") si a alguna de
  // las dos campañas no se le pudo resolver la capa.
  const nombreArchivoEspesores =
    `${contextoInferior?.calle.nombre ?? 'espesores'} — Espesores ${contextoInferior?.capa?.nombre ?? '—'} a ${contextoSuperior?.capa?.nombre ?? '—'}`.trim()

  if (!contexto || !resultado) {
    return <p className="p-6 text-sm text-slate-500">No hay una campaña abierta.</p>
  }

  const progresivaActiva = seleccion.progresiva ?? progresivas[0] ?? 0

  // Si la plantilla cambió y el elemento elegido ya no está, se cae al primero
  // disponible en vez de dejar el desplegable apuntando a algo inexistente.
  const clavesDisponibles = contexto.plantilla.elementos.map((elemento) => elemento.clave)
  const elementoPerfil = clavesDisponibles.includes(elementoPedido)
    ? elementoPedido
    : (clavesDisponibles[0] ?? '')

  return (
    <div className="flex flex-col gap-6 p-4">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">
          {resultado.cierre.pasa === true ? 'Cotas compensadas' : 'Cotas sin compensar'}
        </h2>
        <BarraCierre />
        <ListaAvisos />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => descargarXlsx(tablaCompleta, nombreArchivo, 'Cotas')}
            className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
          >
            Exportar cotas a Excel
          </button>
          <button
            type="button"
            onClick={() => descargarCsv(tablaCompleta, nombreArchivo)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            Exportar cotas a CSV
          </button>
          <button
            type="button"
            onClick={() => {
              void copiarAlPortapapeles(tablaCompleta).then(() => {
                setCopiado(true)
                window.setTimeout(() => setCopiado(false), 2000)
              })
            }}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            {copiado ? 'Copiado ✓' : 'Copiar cotas'}
          </button>
        </div>
        <TablaResultados />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">
          {estadoComparacion === null
            ? 'Espesor entre capas'
            : estadoComparacion.comprobado
              ? 'Espesores comprobados'
              : 'Espesores no comprobados'}
        </h2>
        <SelectorCapas />
        {comparacion && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => descargarXlsx(tablaEspesoresCompleta, nombreArchivoEspesores, 'Espesores')}
              className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
            >
              Exportar espesores a Excel
            </button>
            <button
              type="button"
              onClick={() => descargarCsv(tablaEspesoresCompleta, nombreArchivoEspesores)}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
            >
              Exportar espesores a CSV
            </button>
            <button
              type="button"
              onClick={() => {
                void copiarAlPortapapeles(tablaEspesoresCompleta).then(() => {
                  setCopiadoEspesores(true)
                  window.setTimeout(() => setCopiadoEspesores(false), 2000)
                })
              }}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
            >
              {copiadoEspesores ? 'Copiado ✓' : 'Copiar espesores'}
            </button>
          </div>
        )}
        {estadoComparacion && <AvisoEspesores estado={estadoComparacion} />}
        <TablaEspesores />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Corte transversal</h2>
        <CorteTransversal progresiva={progresivaActiva} />
        <DeslizadorProgresiva progresivas={progresivas} valor={progresivaActiva} alCambiar={irAProgresiva} />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Perfil longitudinal</h2>
          <select
            aria-label="Elemento del perfil"
            value={elementoPerfil}
            onChange={(evento) => setElementoPedido(evento.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {contexto.plantilla.elementos.map((elemento) => (
              <option key={elemento.clave} value={elemento.clave}>
                {elemento.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <PerfilLongitudinal elementoClave={elementoPerfil} />
      </section>
    </div>
  )
}
