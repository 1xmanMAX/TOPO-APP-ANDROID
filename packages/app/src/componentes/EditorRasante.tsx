import {
  cotaEjeRasante,
  desnivelTransversal,
  formatearProgresiva,
  type Id,
  type PuntoCalle,
  type Rasante,
  type TramoTransversal,
} from '@topo/core'
import { useState } from 'react'
import { useAlmacen } from '../estado/almacen'
import { formatearCota } from '../formato'
import CampoNumero from './CampoNumero'
import CampoTexto from './CampoTexto'
import CorteTipo from './CorteTipo'

/** Cuánto más allá de la progresiva de arranque se enseña la cota en vivo, para comprobar el signo de la pendiente. */
const DISTANCIA_VISTA_PREVIA = 100

interface Props {
  calleId: Id
  /** Los de la calle: sin ellos el editor no puede saber qué deja fuera su sección ni fijar una escala estable. */
  puntos: PuntoCalle[]
}

type Lado = 'derecha' | 'izquierda'

const MENSAJE_RETROCESO =
  'Los tramos van del eje hacia afuera: este tiene que llegar más lejos que el anterior.'

const TIPOS_TRAMO: { valor: TramoTransversal['tipo']; texto: string }[] = [
  { valor: 'pendiente', texto: 'Pendiente' },
  { valor: 'salto', texto: 'Salto' },
]

/** Tramo de arranque razonable: una calzada con el bombeo típico de +2.0 %. */
function rasanteInicial(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 0,
    pendienteLongitudinal: 0,
    simetrica: true,
    tramos: [{ nombre: 'Calzada', hastaOffset: 4.2, tipo: 'pendiente', valor: 2 }],
    tramosIzquierda: null,
  }
}

/** Misma regla que `tramosDelLado` en `packages/core/src/rasante/geometria.ts`, no exportada de ahí. */
function tramosDelLado(rasante: Rasante, lado: Lado): TramoTransversal[] {
  if (lado === 'derecha') return rasante.tramos
  return rasante.simetrica ? rasante.tramos : (rasante.tramosIzquierda ?? rasante.tramos)
}

/** El extremo de la vereda, por debajo del borde de calzada: probable sardinel al revés. No bloquea. */
function veredaBajoCalzadaEnLado(rasante: Rasante, lado: Lado): boolean {
  const tramos = tramosDelLado(rasante, lado)
  const indiceSalto = tramos.map((t) => t.tipo).lastIndexOf('salto')
  if (indiceSalto === -1 || indiceSalto === tramos.length - 1) return false

  const signo = lado === 'derecha' ? 1 : -1
  const offsetBorde = indiceSalto > 0 ? tramos[indiceSalto - 1]!.hastaOffset : 0
  const cotaBorde = desnivelTransversal(rasante, signo * offsetBorde)
  const ultimo = tramos[tramos.length - 1]!
  const cotaVereda = desnivelTransversal(rasante, signo * ultimo.hastaOffset)
  if (cotaBorde === null || cotaVereda === null) return false

  return cotaVereda < cotaBorde
}

function veredaBajoCalzada(rasante: Rasante): boolean {
  return veredaBajoCalzadaEnLado(rasante, 'derecha') || veredaBajoCalzadaEnLado(rasante, 'izquierda')
}

/** Hasta dónde llega la sección definida en ese lado. 0 si el lado no tiene tramos. */
function alcanceLado(rasante: Rasante, lado: Lado): number {
  return Math.max(0, ...tramosDelLado(rasante, lado).map((t) => t.hastaOffset))
}

/**
 * La distancia más lejana entre los puntos de la calle, a cualquier lado.
 * Sirve de ancho fijo para el corte tipo: así la escala del dibujo no salta
 * con cada tramo que se edita, y de paso se ve de un vistazo cuánto de la
 * calle cubre la sección.
 */
function alcanceMaximoPuntos(puntos: PuntoCalle[]): number {
  return Math.max(0, ...puntos.map((punto) => Math.abs(punto.distancia)))
}

/** Los puntos de la calle que la sección deja sin cota, del más cercano al eje al más lejano. */
function puntosSinCota(rasante: Rasante, puntos: PuntoCalle[]): PuntoCalle[] {
  return puntos
    .filter((punto) => desnivelTransversal(rasante, punto.distancia) === null)
    .sort((a, b) => Math.abs(a.distancia) - Math.abs(b.distancia))
}

/** Con cuánto alcance describir el aviso: una sola cifra si los dos lados llegan igual de lejos. */
function mensajeAlcance(rasante: Rasante): string {
  const derecha = alcanceLado(rasante, 'derecha')
  const izquierda = alcanceLado(rasante, 'izquierda')

  if (derecha === izquierda) return `La sección definida llega hasta ${derecha.toFixed(2)} m del eje.`

  return (
    `La sección definida llega hasta ${derecha.toFixed(2)} m del eje a la derecha ` +
    `y hasta ${izquierda.toFixed(2)} m a la izquierda.`
  )
}

interface PropsTabla {
  lado: Lado
  titulo: string
  sufijo: string
  tramos: TramoTransversal[]
  etiquetaBoton: string
  onAgregar: () => void
  onQuitar: (indice: number) => void
  onMover: (indice: number, direccion: -1 | 1) => void
  onCambiar: (indice: number, cambios: Partial<TramoTransversal>) => void
}

function TablaTramos({
  titulo,
  sufijo,
  tramos,
  etiquetaBoton,
  onAgregar,
  onQuitar,
  onMover,
  onCambiar,
}: PropsTabla) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{titulo}</h4>
        <button
          type="button"
          onClick={onAgregar}
          className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
        >
          {etiquetaBoton}
        </button>
      </div>

      {/* El contenido ancho hace scroll dentro de su caja: la fila no cede por debajo de su
          contenido (columnas de ancho fijo + Nombre), así que sin esto se desborda sobre el
          dibujo en vez de apretarse o mostrar su propio scroll. */}
      <div className="flex min-w-0 flex-col gap-2 overflow-x-auto">
        {tramos.map((tramo, indice) => {
          const numero = indice + 1
          return (
            <div
              key={indice}
              className="grid w-max min-w-full grid-cols-[minmax(10rem,1fr)_7rem_8rem_7rem_auto_auto] items-end gap-2 rounded border border-slate-300 p-2 dark:border-slate-700"
            >
              <CampoTexto
                etiqueta={`Nombre del tramo ${numero}${sufijo}`}
                valor={tramo.nombre}
                alCambiar={(v) => onCambiar(indice, { nombre: v })}
              />
              <CampoNumero
                etiqueta="Hasta el metro"
                ariaLabel={`Hasta el metro ${numero}${sufijo}`}
                valor={tramo.hastaOffset}
                alCambiar={(v) => onCambiar(indice, { hastaOffset: v })}
                decimales={2}
                sufijo="m"
              />
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tipo</span>
                <select
                  aria-label={`Tipo del tramo ${numero}${sufijo}`}
                  value={tramo.tipo}
                  onChange={(evento) =>
                    onCambiar(indice, { tipo: evento.target.value as TramoTransversal['tipo'] })
                  }
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  {TIPOS_TRAMO.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.texto}
                    </option>
                  ))}
                </select>
              </label>
              <CampoNumero
                etiqueta="Valor"
                ariaLabel={`Valor del tramo ${numero}${sufijo}`}
                valor={tramo.valor}
                alCambiar={(v) => onCambiar(indice, { valor: v })}
                decimales={2}
                sufijo={tramo.tipo === 'salto' ? 'm' : '%'}
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Subir el tramo ${numero}${sufijo}`}
                  onClick={() => onMover(indice, -1)}
                  disabled={indice === 0}
                  className="px-1 text-slate-400 hover:text-marca disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Bajar el tramo ${numero}${sufijo}`}
                  onClick={() => onMover(indice, 1)}
                  disabled={indice === tramos.length - 1}
                  className="px-1 text-slate-400 hover:text-marca disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
              <button
                type="button"
                aria-label={`Quitar el tramo ${numero}${sufijo}`}
                onClick={() => onQuitar(indice)}
                className="rounded px-2 py-1.5 text-sm text-falla hover:bg-red-50 dark:hover:bg-red-950"
              >
                Quitar
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Editor de la rasante de proyecto de una calle: cota de arranque, pendiente
 * longitudinal y la sección transversal, con el corte tipo dibujándose en
 * vivo al lado para comprobar el signo de cada tramo.
 */
export default function EditorRasante({ calleId, puntos }: Props) {
  const calle = useAlmacen((s) => s.proyecto.calles.find((c) => c.id === calleId))
  const fijarRasante = useAlmacen((s) => s.fijarRasante)
  const [errorTramo, setErrorTramo] = useState<string | null>(null)

  if (!calle) return <p className="p-6 text-sm text-slate-500">Esa calle ya no existe.</p>

  const rasante = calle.rasante

  if (!rasante) {
    return (
      <button
        type="button"
        onClick={() => fijarRasante(calleId, rasanteInicial())}
        className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
      >
        Definir la rasante de esta calle
      </button>
    )
  }

  function guardar(cambios: Partial<Rasante>) {
    fijarRasante(calleId, { ...rasante!, ...cambios })
  }

  function guardarTramos(lado: Lado, tramos: TramoTransversal[]) {
    if (lado === 'derecha') guardar({ tramos })
    else guardar({ tramosIzquierda: tramos })
  }

  function agregarTramo(lado: Lado) {
    const actuales = tramosDelLado(rasante!, lado)
    const maximo = Math.max(0, ...actuales.map((t) => t.hastaOffset))
    guardarTramos(lado, [
      ...actuales,
      { nombre: `Tramo ${actuales.length + 1}`, hastaOffset: maximo + 1, tipo: 'pendiente', valor: 2 },
    ])
    setErrorTramo(null)
  }

  function quitarTramo(lado: Lado, indice: number) {
    guardarTramos(
      lado,
      tramosDelLado(rasante!, lado).filter((_, i) => i !== indice),
    )
    setErrorTramo(null)
  }

  function moverTramo(lado: Lado, indice: number, direccion: -1 | 1) {
    const actuales = tramosDelLado(rasante!, lado)
    const destino = indice + direccion
    if (destino < 0 || destino >= actuales.length) return
    const copia = [...actuales]
    const temp = copia[indice]!
    copia[indice] = copia[destino]!
    copia[destino] = temp
    guardarTramos(lado, copia)
  }

  function cambiarTramo(lado: Lado, indice: number, cambios: Partial<TramoTransversal>) {
    const actuales = tramosDelLado(rasante!, lado)

    if (cambios.hastaOffset !== undefined) {
      const anterior = indice > 0 ? actuales[indice - 1]!.hastaOffset : 0
      if (cambios.hastaOffset <= anterior) {
        setErrorTramo(MENSAJE_RETROCESO)
        return
      }
    }

    setErrorTramo(null)
    guardarTramos(
      lado,
      actuales.map((t, i) => (i === indice ? { ...t, ...cambios } : t)),
    )
  }

  function alternarSimetria() {
    if (rasante!.simetrica) {
      guardar({ simetrica: false, tramosIzquierda: rasante!.tramosIzquierda ?? rasante!.tramos })
    } else {
      guardar({ simetrica: true })
    }
  }

  const progresivaVistaPrevia = rasante.progresivaArranque + DISTANCIA_VISTA_PREVIA
  const cotaVistaPrevia = cotaEjeRasante(rasante, progresivaVistaPrevia)
  const aviso = veredaBajoCalzada(rasante)
  const faltantes = puntosSinCota(rasante, puntos)
  // Cero no es una cota plausible en ninguna obra: mientras la cota de arranque
  // siga en ese valor de arranque, se trata como «todavía no escrita» y no se
  // muestra, para no confundirla con una cota real de tres decimales.
  const hayCotaEscrita = rasante.cotaArranque !== 0

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <CampoNumero
          etiqueta="Progresiva de arranque"
          ariaLabel="Progresiva de arranque"
          valor={rasante.progresivaArranque}
          alCambiar={(v) => guardar({ progresivaArranque: v })}
          decimales={2}
          sufijo="m"
        />
        <CampoNumero
          etiqueta="Cota de arranque"
          ariaLabel="Cota de arranque"
          valor={rasante.cotaArranque}
          alCambiar={(v) => guardar({ cotaArranque: v })}
          sufijo="m"
        />
        <CampoNumero
          etiqueta="Pendiente longitudinal"
          ariaLabel="Pendiente longitudinal"
          valor={rasante.pendienteLongitudinal}
          alCambiar={(v) => guardar({ pendienteLongitudinal: v })}
          decimales={2}
          sufijo="%"
        />
      </div>

      {hayCotaEscrita && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          A {formatearProgresiva(progresivaVistaPrevia)}: {formatearCota(cotaVistaPrevia)}
        </p>
      )}

      {faltantes.length > 0 && (
        <p className="text-sm text-aviso">
          {mensajeAlcance(rasante)} Estos puntos de la calle quedan sin cota de proyecto:{' '}
          {faltantes.map((punto) => punto.codigo).join(', ')}.
        </p>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={rasante.simetrica} onChange={alternarSimetria} />
        Los dos lados son iguales
      </label>

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <TablaTramos
            lado="derecha"
            titulo={rasante.simetrica ? 'Tramos' : 'Tramos — lado derecho'}
            sufijo={rasante.simetrica ? '' : ' (derecha)'}
            tramos={tramosDelLado(rasante, 'derecha')}
            etiquetaBoton={rasante.simetrica ? 'Añadir tramo' : 'Añadir tramo (derecha)'}
            onAgregar={() => agregarTramo('derecha')}
            onQuitar={(i) => quitarTramo('derecha', i)}
            onMover={(i, d) => moverTramo('derecha', i, d)}
            onCambiar={(i, c) => cambiarTramo('derecha', i, c)}
          />

          {!rasante.simetrica && (
            <TablaTramos
              lado="izquierda"
              titulo="Tramos — lado izquierdo"
              sufijo=" (izquierda)"
              tramos={tramosDelLado(rasante, 'izquierda')}
              etiquetaBoton="Añadir tramo (izquierda)"
              onAgregar={() => agregarTramo('izquierda')}
              onQuitar={(i) => quitarTramo('izquierda', i)}
              onMover={(i, d) => moverTramo('izquierda', i, d)}
              onCambiar={(i, c) => cambiarTramo('izquierda', i, c)}
            />
          )}

          {errorTramo && <p className="text-sm text-falla">{errorTramo}</p>}

          {aviso && (
            <p className="text-sm text-aviso">
              Con estos valores la vereda queda por debajo del borde de la calzada. Comprueba el signo del
              sardinel: un valor negativo sube.
            </p>
          )}
        </div>

        <CorteTipo rasante={rasante} anchoMaximo={alcanceMaximoPuntos(puntos) || undefined} />
      </div>
    </div>
  )
}
