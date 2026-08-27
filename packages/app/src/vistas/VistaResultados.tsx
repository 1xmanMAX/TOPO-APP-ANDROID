import { compararCapas, progresivasMedidas } from '@topo/core'
import { useMemo, useState } from 'react'
import {
  armarCabecera,
  armarCabeceraComparacion,
  armarCabeceraDiferencias,
  armarTabla,
  armarTablaDiferencias,
  armarTablaEspesores,
  copiarAlPortapapeles,
  descargarCsv,
  descargarXlsx,
} from '../archivo/exportar'
import AvisoEspesores from '../componentes/AvisoEspesores'
import BarraCierre from '../componentes/BarraCierre'
import ControlesVista3D from '../componentes/ControlesVista3D'
import CorteTransversal from '../componentes/CorteTransversal'
import DeslizadorProgresiva from '../componentes/DeslizadorProgresiva'
import ListaAvisos from '../componentes/ListaAvisos'
import MapaEstado from '../componentes/MapaEstado'
import PerfilLongitudinal from '../componentes/PerfilLongitudinal'
import SelectorCapas from '../componentes/SelectorCapas'
import TablaDiferencias from '../componentes/TablaDiferencias'
import TablaEspesores from '../componentes/TablaEspesores'
import TablaResultados from '../componentes/TablaResultados'
import Vista3D from '../componentes/Vista3D'
import { calcularEstadoComparacion, calcularEstadoRasante } from '../estadoComparacion'
import { useAlmacen } from '../estado/almacen'
import {
  useContexto,
  useContextoDe,
  useEvaluacionRasante,
  useProgresivas,
  useResultado,
  useResultadoDe,
} from '../estado/derivados'

export default function VistaResultados() {
  const contexto = useContexto()
  const resultado = useResultado()
  const seleccion = useAlmacen((s) => s.seleccion)
  const irAProgresiva = useAlmacen((s) => s.irAProgresiva)
  const proyecto = useAlmacen((s) => s.proyecto)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const capasVisibles = useAlmacen((s) => s.capasVisibles)
  const [elementoPedido, setElementoPedido] = useState('EJE')

  // Sin ninguna capa marcada en el selector, se dibuja la campaña activa: así
  // el corte no queda en blanco antes de que el topógrafo abra el panel de
  // capas. Esta pantalla sí manda `capasVisibles` — es la que tiene el
  // selector de capas —; la libreta no lo lee en absoluto.
  const idsVisiblesCorte = useMemo(
    () => (capasVisibles.length > 0 ? capasVisibles : campaniaActivaId ? [campaniaActivaId] : []),
    [capasVisibles, campaniaActivaId],
  )

  const progresivas = useProgresivas()

  const tabla = useMemo(
    () =>
      resultado && contexto
        ? armarTabla(resultado, contexto.calle, progresivasMedidas(contexto.campania.estaciones))
        : [],
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
    return armarTablaEspesores(
      comparacion,
      contextoInferior.calle,
      progresivasMedidas(contextoInferior.campania.estaciones),
    )
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

  // Misma idea que `estadoComparacion`, pero para una sola campaña: si su
  // circuito no cerró, la diferencia contra la rasante tampoco está
  // comprobada, aunque la resta en sí haya sido posible. `null` mientras no
  // haya rasante definida — ahí no hay nada que evaluar todavía.
  //
  // Se pide con `campaniaActivaId` explícito (igual que `MapaEstado`,
  // `CorteTransversal` y `PerfilLongitudinal` reciben más abajo) y no con la
  // llamada sin argumento que caía sola en el almacén: así esta única
  // evaluación es el origen tanto de la tabla como del Excel, en vez de que
  // cada uno calculara la suya por su cuenta y coincidieran solo porque hoy
  // apuntan, por separado, al mismo sitio.
  const evaluacionRasante = useEvaluacionRasante(campaniaActivaId ?? '')
  const estadoRasante = useMemo(
    () => (resultado && evaluacionRasante ? calcularEstadoRasante(resultado.cierre) : null),
    [resultado, evaluacionRasante],
  )

  const tablaDiferencias = useMemo(
    () =>
      evaluacionRasante && contexto
        ? armarTablaDiferencias(evaluacionRasante, contexto.calle, progresivasMedidas(contexto.campania.estaciones))
        : [],
    [evaluacionRasante, contexto],
  )

  // Igual que `tablaEspesoresCompleta`: sin rasante definida no hay nada que
  // evaluar, así que el archivo tampoco existe todavía (se comprueba con
  // `contexto.calle.rasante`, no solo con `evaluacionRasante`, para que
  // TypeScript sepa que no es null al armar la cabecera).
  const tablaDiferenciasCompleta = useMemo(() => {
    if (!evaluacionRasante || !contexto || !resultado || !contexto.calle.rasante) return []
    return [
      ...armarCabeceraDiferencias({
        calle: contexto.calle,
        capa: contexto.capa,
        campania: contexto.campania,
        rasante: contexto.calle.rasante,
        resultado,
      }),
      [],
      ...tablaDiferencias,
    ]
  }, [evaluacionRasante, contexto, resultado, tablaDiferencias])

  const [copiado, setCopiado] = useState(false)
  const [copiadoEspesores, setCopiadoEspesores] = useState(false)
  const nombreArchivo = `${contexto?.calle.nombre ?? 'cotas'} — ${contexto?.capa?.nombre ?? ''}`.trim()
  // Con un guion en vez de una cadena vacía cuando falta la capa: así nunca
  // quedan dos espacios seguidos ("Espesores  a SUBRASANTE") si a alguna de
  // las dos campañas no se le pudo resolver la capa.
  const nombreArchivoEspesores =
    `${contextoInferior?.calle.nombre ?? 'espesores'} — Espesores ${contextoInferior?.capa?.nombre ?? '—'} a ${contextoSuperior?.capa?.nombre ?? '—'}`.trim()
  const nombreArchivoDiferencias =
    `${contexto?.calle.nombre ?? 'diferencias'} — Diferencias ${contexto?.capa?.nombre ?? ''}`.trim()

  if (!contexto || !resultado) {
    return <p className="p-6 text-sm text-slate-500">No hay una campaña abierta.</p>
  }

  const progresivaActiva = seleccion.progresiva ?? progresivas[0] ?? 0

  // Si los puntos de la calle cambiaron y el elegido ya no está, se cae al
  // primero disponible en vez de dejar el desplegable apuntando a algo
  // inexistente.
  const clavesDisponibles = contexto.calle.puntos.map((punto) => punto.codigo)
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

      {/*
        Las cuatro vistas que controlan lo medido contra el proyecto —
        diferencias, mapa, corte y perfil— viven bajo un solo grupo con un
        único aviso arriba (`estadoRasante`, la misma fuente que ya usaba solo
        la tabla). Antes cada una llevaba su propio veredicto, y a la única
        que se le olvidó dárselo fue justo a las tres que no son la tabla —el
        defecto que esto corrige. Con un solo sitio para el aviso, no hay un
        quinto lugar donde una vista nueva pueda quedar sin él.
      */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Control contra el proyecto</h2>
        {estadoRasante && <AvisoEspesores estado={estadoRasante} />}

        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Modelo 3D</h3>
          <ControlesVista3D />
          <Vista3D idCampaniaReferencia={campaniaActivaId} />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Diferencias</h3>
          {evaluacionRasante && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => descargarXlsx(tablaDiferenciasCompleta, nombreArchivoDiferencias, 'Diferencias')}
                className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
              >
                Exportar diferencias a Excel
              </button>
              <button
                type="button"
                onClick={() => descargarCsv(tablaDiferenciasCompleta, nombreArchivoDiferencias)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
              >
                Exportar diferencias a CSV
              </button>
            </div>
          )}
          <TablaDiferencias idCampaniaReferencia={campaniaActivaId} />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Mapa de la calle</h3>
          <MapaEstado idCampaniaReferencia={campaniaActivaId} />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Corte transversal</h3>
          <CorteTransversal
            progresiva={progresivaActiva}
            idsVisibles={idsVisiblesCorte}
            idCampaniaReferencia={campaniaActivaId}
          />
          <DeslizadorProgresiva progresivas={progresivas} valor={progresivaActiva} alCambiar={irAProgresiva} />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold">Perfil longitudinal</h3>
            <select
              aria-label="Elemento del perfil"
              value={elementoPerfil}
              onChange={(evento) => setElementoPedido(evento.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {contexto.calle.puntos.map((punto) => (
                <option key={punto.codigo} value={punto.codigo}>
                  {punto.codigo}
                </option>
              ))}
            </select>
          </div>
          <PerfilLongitudinal elementoClave={elementoPerfil} idCampaniaReferencia={campaniaActivaId} />
        </section>
      </div>
    </div>
  )
}
