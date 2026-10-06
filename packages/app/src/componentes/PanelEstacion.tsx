import {
  claveCelda, formatearProgresiva, palabraDePunto,
  type Calle, type DestinoLectura, type PuntoSeccion,
} from '@topo/core'
import { formatearCota } from '../formato'
import { useAlmacen } from '../estado/almacen'
import { useContexto, useResultado } from '../estado/derivados'
import CampoNumero from './CampoNumero'

/**
 * Cómo se nombra cada lectura en el panel de la estación. Nunca por
 * `elementoClave` —el id interno de la sección (`p-borde-i`), que no se le
 * enseña a nadie—; si la clave ya no corresponde a ningún punto (una lectura
 * huérfana), se enseña tal cual: es lo único que quedó guardado de ella.
 *
 * `textoDelPunto` decide con cuál de los dos textos del punto se escribe,
 * porque el de la fila y el que oye un lector de pantalla no son el mismo.
 */
function describirDestino(
  destino: DestinoLectura,
  calle: Calle,
  textoDelPunto: (punto: PuntoSeccion) => string,
): string {
  switch (destino.tipo) {
    case 'bm':
      return 'BM'
    case 'cambio':
      return destino.nombre
    case 'celda': {
      const punto = calle.seccion.puntos.find((p) => p.id === destino.celda.elementoClave)
      const texto = punto ? textoDelPunto(punto) : destino.celda.elementoClave
      return `${formatearProgresiva(destino.celda.progresiva)} ${texto}`
    }
    case 'suelto':
      return destino.punto.etiqueta
  }
}

/** En la fila manda el ancho: va la palabra corta de la hoja de Max («BI»). */
function textoDeDestino(destino: DestinoLectura, calle: Calle): string {
  return describirDestino(destino, calle, palabraDePunto)
}

/**
 * En el nombre accesible manda distinguir: va el nombre completo («Borde
 * izquierdo»). La sección permite la misma palabra a los dos lados del eje,
 * así que dos campos anunciados «0+000 VEREDA» no se distinguirían de oído.
 */
function nombreAccesibleDeDestino(destino: DestinoLectura, calle: Calle): string {
  return describirDestino(destino, calle, (punto) => punto.nombre)
}

function claveDe(destino: DestinoLectura): string | null {
  return destino.tipo === 'celda' ? claveCelda(destino.celda.progresiva, destino.celda.elementoClave) : null
}

interface Props {
  estacionIndice: number
  alCambiarEstacion: (indice: number) => void
}

export default function PanelEstacion({ estacionIndice, alCambiarEstacion }: Props) {
  const contexto = useContexto()
  const resultado = useResultado()
  const actualizarLectura = useAlmacen((s) => s.actualizarLectura)
  const eliminarLectura = useAlmacen((s) => s.eliminarLectura)
  const fijarVistaAdelante = useAlmacen((s) => s.fijarVistaAdelante)
  const quitarVistaAdelante = useAlmacen((s) => s.quitarVistaAdelante)
  const agregarEstacion = useAlmacen((s) => s.agregarEstacion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  if (!contexto || !resultado) return null

  const campania = contexto.campania
  const estacion = campania.estaciones[estacionIndice]
  if (!estacion) return null

  const esUltima = estacionIndice === campania.estaciones.length - 1

  function trasladarInstrumento() {
    const nombrePC = `PC-${campania.estaciones.length}`
    fijarVistaAdelante(campania.id, estacionIndice, {
      destino: { tipo: 'cambio', nombre: nombrePC },
      valor: 0,
    })
    agregarEstacion(campania.id, { destino: { tipo: 'cambio', nombre: nombrePC }, valor: 0 })
    alCambiarEstacion(estacionIndice + 1)
  }

  function cerrarCircuito() {
    const bmFinalId = campania.cierre.bmFinalId ?? campania.bmInicialId
    fijarVistaAdelante(campania.id, estacionIndice, {
      destino: { tipo: 'bm', bmId: bmFinalId },
      valor: 0,
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">Estación {estacionIndice + 1}</span>
        <span className="text-slate-500">
          CI{' '}
          <span className="numerico">
            {Number.isFinite(resultado.cotasInstrumento[estacionIndice])
              ? formatearCota(resultado.cotasInstrumento[estacionIndice]!)
              : '—'}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-[1fr_6rem] items-center gap-2 text-sm">
        <span className="text-slate-500">Vista atrás · {textoDeDestino(estacion.vistaAtras.destino, contexto.calle)}</span>
        <CampoNumero
          ariaLabel={`Vista atrás a ${nombreAccesibleDeDestino(estacion.vistaAtras.destino, contexto.calle)}`}
          valor={estacion.vistaAtras.valor}
          alCambiar={(v) => actualizarLectura(campania.id, estacion.vistaAtras.id, v)}
        />
      </div>

      {!Number.isFinite(resultado.cotasInstrumento[estacionIndice]) && (
        <p className="rounded border border-aviso px-3 py-2 text-xs text-aviso">
          Falta la lectura de vista atrás de esta estación: hasta que la escribas, sus puntos no
          tienen cota.
        </p>
      )}

      <ul className="flex flex-col gap-1">
        {estacion.intermedias.map((lectura) => {
          const clave = claveDe(lectura.destino)
          const cota = clave ? resultado.cotasPorCelda.get(clave)?.cota : undefined

          return (
            <li key={lectura.id} className="grid grid-cols-[1fr_6rem_5rem_auto] items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => clave && seleccionar(clave)}
                className="text-left text-slate-600 hover:text-marca max-md:min-h-11 dark:text-slate-300"
              >
                {textoDeDestino(lectura.destino, contexto.calle)}
              </button>
              <CampoNumero
                ariaLabel={`Lectura de ${nombreAccesibleDeDestino(lectura.destino, contexto.calle)}`}
                valor={lectura.valor}
                alCambiar={(v) => actualizarLectura(campania.id, lectura.id, v)}
              />
              <span className="numerico text-right text-slate-500">
                {cota === undefined ? '—' : formatearCota(cota)}
              </span>
              <button
                type="button"
                aria-label={`Borrar lectura de ${nombreAccesibleDeDestino(lectura.destino, contexto.calle)}`}
                onClick={() => eliminarLectura(campania.id, lectura.id)}
                className="px-1 text-slate-400 hover:text-falla max-md:min-h-11 max-md:min-w-11"
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>

      {estacion.vistaAdelante && (
        <div className="grid grid-cols-[1fr_6rem] items-center gap-2 text-sm">
          <span className="text-slate-500">
            Vista adelante · {textoDeDestino(estacion.vistaAdelante.destino, contexto.calle)}
          </span>
          <CampoNumero
            ariaLabel={`Vista adelante a ${nombreAccesibleDeDestino(estacion.vistaAdelante.destino, contexto.calle)}`}
            valor={estacion.vistaAdelante.valor}
            alCambiar={(v) => actualizarLectura(campania.id, estacion.vistaAdelante!.id, v)}
          />
        </div>
      )}

      {esUltima && !estacion.vistaAdelante && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={trasladarInstrumento}
            className="rounded border border-slate-300 px-2 py-1 text-sm max-md:min-h-11 dark:border-slate-700"
          >
            Trasladar el instrumento
          </button>
          <button
            type="button"
            onClick={cerrarCircuito}
            className="rounded border border-slate-300 px-2 py-1 text-sm max-md:min-h-11 dark:border-slate-700"
          >
            Cerrar el circuito
          </button>
        </div>
      )}

      {esUltima && estacion.vistaAdelante && (
        <button
          type="button"
          onClick={() => quitarVistaAdelante(campania.id, estacionIndice)}
          className="self-start rounded border border-slate-300 px-2 py-1 text-sm max-md:min-h-11 dark:border-slate-700"
        >
          Quitar la vista adelante
        </button>
      )}
    </div>
  )
}
