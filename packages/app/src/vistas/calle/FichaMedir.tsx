import {
  construirGrilla,
  cotaTeoricaDeCapa,
  esLecturaUsable,
  formatearProgresiva,
  parsearProgresiva,
  progresivasDeLaToma,
  progresivasMedidas,
  redondear3,
} from '@topo/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import PanelEstacion from '../../componentes/PanelEstacion'
import { useAlmacen } from '../../estado/almacen'
import { useContexto } from '../../estado/derivados'
import { resumenPendientes, siguienteCeldaPendiente } from '../../libreta/navegacion'
import AvisoAlAnotar from './AvisoAlAnotar'
import CierreEnVivo from './CierreEnVivo'
import { formatearCota } from '../../formato'
import {
  alturaInstrumentalDeEstacion,
  BOTON_PRINCIPAL,
  BOTON_SECUNDARIO,
  estacionComprobada,
  instrumentoDe,
  leerNumero,
  reglasMiraDe,
} from './comun'
import { useResultadoCalle } from './resultadoCalle'

/** Lo último que se anotó, para que su aviso no desaparezca al pasar a la celda siguiente. */
interface UltimaAnotada {
  /** La toma donde quedó: borrarla tiene que ir a esa, aunque luego se cambie de capa. */
  campaniaId: string
  lecturaId: string
  clave: string
  nombre: string
  texto: string
  alturaInstrumental: number
  cotaProyecto: number | null
  comprobado: boolean
}

/** Puntero fino = laptop. En el celular el foco automático abriría el teclado y taparía el corte. */
function punteroFino(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches
  } catch {
    return false
  }
}

/**
 * Medir: la libreta de hoy. Arriba el cierre en vivo, siempre a la vista;
 * luego la estación (vista atrás, intermedias, trasladar o cerrar) y el campo
 * de lectura con el aviso al anotar.
 *
 * La celda en la que se anota es la selección del almacén: tocarla en el
 * mapa o en el corte la elige, y al anotar se salta a la siguiente que falte
 * (con lo que el corte se va a su progresiva).
 *
 * EspacioCalle la monta con `key` = toma activa: al cambiar de capa se vacía
 * el campo y se olvida la última lectura, que era de la otra toma.
 */
export default function FichaMedir() {
  const contexto = useContexto()
  const resultado = useResultadoCalle()
  const proyecto = useAlmacen((s) => s.proyecto)
  const estacionActiva = useAlmacen((s) => s.estacionActiva)
  const activarEstacion = useAlmacen((s) => s.activarEstacion)
  const agregarEstacion = useAlmacen((s) => s.agregarEstacion)
  const agregarIntermedia = useAlmacen((s) => s.agregarIntermedia)
  const eliminarLectura = useAlmacen((s) => s.eliminarLectura)
  const declararProgresiva = useAlmacen((s) => s.declararProgresiva)
  const quitarProgresivaDeclarada = useAlmacen((s) => s.quitarProgresivaDeclarada)
  const claveSeleccionada = useAlmacen((s) => s.seleccion.clave)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const [texto, setTexto] = useState('')
  const [rechazo, setRechazo] = useState<string | null>(null)
  const [textoProgresiva, setTextoProgresiva] = useState('')
  const [avisoProgresiva, setAvisoProgresiva] = useState<string | null>(null)
  const [ultima, setUltima] = useState<UltimaAnotada | null>(null)
  const campo = useRef<HTMLInputElement>(null)

  const instrumento = instrumentoDe(proyecto)
  const mira = reglasMiraDe(instrumento)

  const celdas = useMemo(
    () => (contexto ? construirGrilla(contexto.calle, progresivasDeLaToma(contexto.campania)) : []),
    [contexto],
  )
  const llenas = useMemo(() => new Set(resultado ? [...resultado.cotasPorCelda.keys()] : []), [resultado])
  const progresivasDeLaTabla = useMemo(() => (contexto ? progresivasDeLaToma(contexto.campania) : []), [contexto])
  const progresivasConLecturas = useMemo(
    () => new Set(contexto ? progresivasMedidas(contexto.campania.estaciones).map(redondear3) : []),
    [contexto],
  )
  const celdaActiva = celdas.find((c) => c.clave === claveSeleccionada) ?? null

  // Sin celda elegida (o con una que no es de esta grilla), la libreta se
  // pone sola en la primera que falte: se abre y se puede anotar.
  useEffect(() => {
    if (celdaActiva !== null || celdas.length === 0) return
    const siguiente = siguienteCeldaPendiente(celdas, llenas, null)
    if (siguiente && siguiente.clave !== claveSeleccionada) seleccionar(siguiente.clave)
  }, [celdaActiva, celdas, llenas, claveSeleccionada, seleccionar])

  // En la laptop se entra escribiendo; en el celular no, para no abrir el
  // teclado encima del corte y del mapa.
  useEffect(() => {
    if (punteroFino()) campo.current?.focus()
  }, [])

  if (!contexto || !resultado) {
    return <p className="text-sm text-slate-500">Elige o crea una capa para abrir la libreta.</p>
  }

  const { campania, calle, capa } = contexto
  const indiceSeguro = Math.min(estacionActiva, Math.max(0, campania.estaciones.length - 1))
  // La AI compensada si el circuito cerró: la misma que respalda lo que Revisar juzga.
  const { altura: alturaInstrumental, correccionMm } = alturaInstrumentalDeEstacion(resultado, campania, indiceSeguro)
  const comprobado = estacionComprobada(resultado, indiceSeguro)
  const toleranciaMm = capa?.toleranciaMm ?? Number.NaN

  function cotaProyectoDe(progresiva: number, elementoClave: string): number | null {
    const punto = calle.seccion.puntos.find((p) => p.id === elementoClave)
    if (!calle.rasante || !punto) return null
    return cotaTeoricaDeCapa(calle.rasante, proyecto.capas, campania.capaId, progresiva, punto.distancia)
  }

  const cotaProyectoActiva = celdaActiva ? cotaProyectoDe(celdaActiva.progresiva, celdaActiva.elementoClave) : null

  /** El campo sigue con el foco: en el celular, así el teclado no se cierra entre lectura y lectura. */
  function volverAlCampo() {
    campo.current?.focus()
  }

  function registrarLectura() {
    const valor = leerNumero(texto)
    if (!celdaActiva || !Number.isFinite(valor)) {
      volverAlCampo()
      return
    }

    // Una lectura que no cabe en la mira no se guarda: se queda en el campo
    // para corregirla. Guardarla dejaría en la celda una lectura basura que,
    // al corregir y volver a anotar, se quedaría para siempre como otra más.
    if (!esLecturaUsable(valor, instrumento.largoMira)) {
      setRechazo(
        `La lectura ${texto.trim()} no cabe en la mira de ${instrumento.largoMira} m: no se anotó. Corrígela y vuelve a anotar.`,
      )
      volverAlCampo()
      return
    }

    agregarIntermedia(campania.id, indiceSeguro, {
      destino: { tipo: 'celda', celda: { progresiva: celdaActiva.progresiva, elementoClave: celdaActiva.elementoClave } },
      valor,
    })
    // El id de la lectura recién puesta, para poder borrarla si el aviso dice que se leyó mal.
    const tomaNueva = useAlmacen
      .getState()
      .proyecto.calles.flatMap((c) => c.nivelaciones.flatMap((n) => n.tomas))
      .find((t) => t.id === campania.id)
    const lecturaId = tomaNueva?.estaciones[indiceSeguro]?.intermedias.at(-1)?.id ?? ''
    setUltima({
      campaniaId: campania.id,
      lecturaId,
      clave: celdaActiva.clave,
      nombre: `${formatearProgresiva(celdaActiva.progresiva)} ${celdaActiva.elementoNombre}`,
      texto,
      alturaInstrumental,
      cotaProyecto: cotaProyectoActiva,
      comprobado,
    })
    setRechazo(null)

    const siguientes = new Set(llenas)
    siguientes.add(celdaActiva.clave)
    // Con la grilla completa no queda celda a la que saltar: se suelta la
    // selección para no anotar sin querer una segunda lectura en la última.
    seleccionar(siguienteCeldaPendiente(celdas, siguientes, celdaActiva.clave)?.clave ?? null)
    setTexto('')
    volverAlCampo()
  }

  function volverALeer() {
    if (!ultima) return
    if (ultima.lecturaId) eliminarLectura(ultima.campaniaId, ultima.lecturaId)
    seleccionar(ultima.clave)
    setTexto('')
    setUltima(null)
    volverAlCampo()
  }

  function anadirProgresiva() {
    const progresiva = parsearProgresiva(textoProgresiva)
    if (progresiva === null) {
      setAvisoProgresiva(`No se entiende «${textoProgresiva.trim()}» como progresiva. Escríbela como 0+006 o como 6.`)
      return
    }
    if (progresivasDeLaTabla.includes(redondear3(progresiva))) {
      setAvisoProgresiva(`${formatearProgresiva(progresiva)} ya está en la tabla.`)
      return
    }
    declararProgresiva(campania.id, progresiva)
    setAvisoProgresiva(null)
    setTextoProgresiva('')
  }

  function quitarProgresiva(progresiva: number) {
    if (progresivasConLecturas.has(redondear3(progresiva))) {
      setAvisoProgresiva(
        `${formatearProgresiva(progresiva)} ya tiene lecturas anotadas: no se quita, para no perderlas.`,
      )
      return
    }
    quitarProgresivaDeclarada(campania.id, progresiva)
    setAvisoProgresiva(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <CierreEnVivo toma={campania} bms={proyecto.bms} largoMira={instrumento.largoMira} />

      {campania.estaciones.length === 0 ? (
        <div className="flex flex-col gap-3 rounded border border-aviso p-3">
          <p className="text-sm">
            Esta libreta todavía no tiene estaciones. Planta el nivel y lee hacia atrás al banco de nivel.
          </p>
          <button
            type="button"
            onClick={() =>
              agregarEstacion(campania.id, { destino: { tipo: 'bm', bmId: campania.bmInicialId }, valor: 0 })
            }
            className={`${BOTON_PRINCIPAL} self-start`}
          >
            Empezar la libreta
          </button>
        </div>
      ) : (
        <>
          <div role="group" aria-label="Estaciones" className="flex flex-wrap gap-1">
            {campania.estaciones.map((_, indice) => (
              <button
                key={indice}
                type="button"
                aria-pressed={indice === indiceSeguro}
                aria-label={`Estación ${indice + 1}`}
                onClick={() => activarEstacion(indice)}
                className={`min-h-11 min-w-11 rounded text-sm ${
                  indice === indiceSeguro ? 'bg-marca font-semibold text-white' : 'bg-slate-100 dark:bg-slate-800'
                }`}
              >
                {indice + 1}
              </button>
            ))}
          </div>

          {/* En el celular los botones del panel (trasladar, cerrar, borrar una lectura) se tocan con el dedo: 44 px. */}
          <div className="max-md:[&_button]:min-h-11 max-md:[&_button]:min-w-11">
            <PanelEstacion estacionIndice={indiceSeguro} alCambiarEstacion={activarEstacion} />
          </div>

          {/* El panel enseña la CI de la libreta; el aviso cuenta con la compensada. Se dice cuál, para que no parezcan dos cotas. */}
          {correccionMm !== 0 && Number.isFinite(alturaInstrumental) && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              El circuito cerró: el aviso cuenta con la AI compensada{' '}
              <strong className="numerico">{formatearCota(alturaInstrumental)}</strong> (
              <span className="numerico">
                {correccionMm > 0 ? '+' : '−'}
                {Math.abs(correccionMm).toFixed(1)} mm
              </span>{' '}
              sobre la CI de la libreta), la misma con la que se revisa.
            </p>
          )}

          {indiceSeguro < campania.estaciones.length - 1 && (
            <p className="rounded border border-aviso px-3 py-2 text-xs text-aviso">
              <span aria-hidden="true">△ </span>
              Estás anotando en la estación {indiceSeguro + 1} de {campania.estaciones.length}, que no es la última.
            </p>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600 dark:text-slate-300">
              Celda activa:{' '}
              <strong>
                {celdaActiva
                  ? `${formatearProgresiva(celdaActiva.progresiva)} ${celdaActiva.elementoNombre}`
                  : 'grilla completa'}
              </strong>
            </span>
            <input
              ref={campo}
              aria-label="Lectura de mira"
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              value={texto}
              onChange={(evento) => {
                setTexto(evento.target.value)
                setRechazo(null)
              }}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter') registrarLectura()
              }}
              placeholder="escribe y Enter"
              className="numerico min-h-11 rounded border-2 border-marca px-3 py-2 text-right text-xl dark:bg-slate-900"
            />
          </label>
          <button
            type="button"
            onClick={registrarLectura}
            // Que tocar «Anotar» no le quite el foco al campo: en el celular
            // eso cerraría el teclado y habría que volver a tocar el campo.
            onPointerDown={(evento) => evento.preventDefault()}
            disabled={!celdaActiva}
            className={BOTON_PRINCIPAL}
          >
            Anotar
          </button>

          {rechazo && (
            <p role="alert" className="rounded border border-falla bg-falla/10 px-3 py-2 text-sm font-semibold text-falla">
              <span aria-hidden="true">✗ </span>
              {rechazo}
            </p>
          )}

          {celdaActiva && (
            <AvisoAlAnotar
              texto={texto}
              alturaInstrumental={alturaInstrumental}
              cotaProyecto={cotaProyectoActiva}
              toleranciaMm={toleranciaMm}
              comprobado={comprobado}
              mira={mira}
            />
          )}

          {ultima && (
            <div className="flex flex-col gap-2">
              <AvisoAlAnotar
                titulo={`Última lectura anotada · ${ultima.nombre}`}
                texto={ultima.texto}
                alturaInstrumental={ultima.alturaInstrumental}
                cotaProyecto={ultima.cotaProyecto}
                toleranciaMm={toleranciaMm}
                comprobado={ultima.comprobado}
                mira={mira}
                anotada
              />
              <button type="button" onClick={volverALeer} className={`${BOTON_SECUNDARIO} self-start`}>
                Borrar y volver a leer
              </button>
            </div>
          )}

          <p className="text-sm text-slate-600 dark:text-slate-300">
            llenadas {resultado.celdasLlenas} de {resultado.celdasTotales} · {resumenPendientes(celdas, llenas)}
          </p>
        </>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Añadir progresiva</span>
          <input
            aria-label="Añadir progresiva"
            value={textoProgresiva}
            onChange={(evento) => setTextoProgresiva(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter') anadirProgresiva()
            }}
            placeholder="0+006"
            className="numerico min-h-11 w-28 rounded border border-slate-300 px-2 text-right text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <button type="button" onClick={anadirProgresiva} className={BOTON_SECUNDARIO}>
          Añadir
        </button>
      </div>
      {avisoProgresiva && (
        <p role="status" className="rounded border border-aviso px-3 py-2 text-xs text-aviso">
          {avisoProgresiva}
        </p>
      )}
      {progresivasDeLaTabla.length > 0 && (
        <ul aria-label="Progresivas de la jornada" className="flex flex-wrap gap-1">
          {progresivasDeLaTabla.map((progresiva) => (
            <li key={progresiva} className="flex items-center rounded bg-slate-100 pl-2 text-xs dark:bg-slate-800">
              <span className="numerico">{formatearProgresiva(progresiva)}</span>
              <button
                type="button"
                aria-label={`Quitar ${formatearProgresiva(progresiva)}`}
                onClick={() => quitarProgresiva(progresiva)}
                className="min-h-11 min-w-11 text-slate-500 hover:text-falla"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
