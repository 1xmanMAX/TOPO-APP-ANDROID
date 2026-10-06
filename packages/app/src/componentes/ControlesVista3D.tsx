import { CAMARA_ALZADO, CAMARA_ISOMETRICA, CAMARA_PLANTA, type Camara } from '@topo/core'
import { useAlmacen, type ModoVista3D } from '../estado/almacen'

/** Grados que gira cada pulsación de los botones de girar: un paso cómodo para el ojo, ni brusco ni lento. */
const PASO_GIRO = 15

interface VistaGuardada {
  etiqueta: string
  camara: Camara
}

const VISTAS_GUARDADAS: VistaGuardada[] = [
  { etiqueta: 'Planta', camara: CAMARA_PLANTA },
  { etiqueta: 'Alzado', camara: CAMARA_ALZADO },
  { etiqueta: 'Isométrico', camara: CAMARA_ISOMETRICA },
]

const MODOS_VISTA3D: { modo: ModoVista3D; etiqueta: string }[] = [
  { modo: 'estado', etiqueta: 'Estado' },
  { modo: 'capas', etiqueta: 'Capas' },
]

/**
 * Mandos del visor 3D: qué manda el color (estado contra la rasante o el
 * paquete de capas apiladas), tres vistas guardadas, girar a izquierda y
 * derecha, e inclinación y exageración continuas. Todo pasa por las acciones
 * del almacén (`girarCamara`, `fijarCamara`, `fijarExageracion`,
 * `fijarModoVista3D`), que ya recortan los rangos de la cámara — este
 * componente no vuelve a recortar nada, el estado es el que manda.
 */
export default function ControlesVista3D() {
  const camara = useAlmacen((s) => s.camara)
  const girarCamara = useAlmacen((s) => s.girarCamara)
  const fijarCamara = useAlmacen((s) => s.fijarCamara)
  const fijarExageracion = useAlmacen((s) => s.fijarExageracion)
  const modoVista3D = useAlmacen((s) => s.modoVista3D)
  const fijarModoVista3D = useAlmacen((s) => s.fijarModoVista3D)

  /**
   * Aplica una vista guardada conservando la exageración que hubiera puesta:
   * la vista guardada mueve la cámara, no el ajuste vertical. Si se perdiera
   * al pulsar una vista, habría que volver a buscarlo cada vez.
   */
  function irAVista(base: Camara) {
    fijarCamara({ ...base, exageracion: camara.exageracion })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Qué manda el color del modelo">
        {MODOS_VISTA3D.map(({ modo, etiqueta }) => (
          <button
            key={modo}
            type="button"
            aria-pressed={modoVista3D === modo}
            onClick={() => fijarModoVista3D(modo)}
            className={`rounded border px-3 py-1.5 text-sm ${
              modoVista3D === modo
                ? 'border-marca bg-marca text-white'
                : 'border-slate-300 dark:border-slate-700'
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Vistas guardadas">
        {VISTAS_GUARDADAS.map(({ etiqueta, camara: vista }) => (
          <button
            key={etiqueta}
            type="button"
            onClick={() => irAVista(vista)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2" role="group" aria-label="Girar el modelo">
        <button
          type="button"
          onClick={() => girarCamara(-PASO_GIRO)}
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700"
        >
          <span aria-hidden="true">↺</span> Girar a la izquierda
        </button>
        <button
          type="button"
          onClick={() => girarCamara(PASO_GIRO)}
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700"
        >
          <span aria-hidden="true">↻</span> Girar a la derecha
        </button>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>Inclinación</span>
          <span>{camara.inclinacion.toFixed(0)}°</span>
        </span>
        <input
          type="range"
          aria-label="Inclinación"
          min={0}
          max={90}
          step={1}
          value={camara.inclinacion}
          onChange={(evento) => fijarCamara({ ...camara, inclinacion: Number(evento.target.value) })}
          className="accent-marca max-md:h-11"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>Exageración</span>
          <span>{camara.exageracion.toFixed(0)}×</span>
        </span>
        <input
          type="range"
          aria-label="Exageración"
          min={1}
          max={50}
          step={1}
          value={camara.exageracion}
          onChange={(evento) => fijarExageracion(Number(evento.target.value))}
          className="accent-marca max-md:h-11"
        />
      </label>
    </div>
  )
}
