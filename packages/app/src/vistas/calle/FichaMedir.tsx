import {
  construirGrilla,
  cotaTeoricaDeCapa,
  esLecturaUsable,
  estadoCierreEnVivo,
  formatearProgresiva,
  palabraDePunto,
  parsearProgresiva,
  progresivasDeLaToma,
  progresivasMedidas,
  redondear3,
} from '@topo/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import AvisoLinea from '../../componentes/AvisoLinea'
import PanelEstacion, { useAccionesEstacion } from '../../componentes/PanelEstacion'
import Plegable from '../../componentes/Plegable'
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CLASES_ESTADO } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import { useContexto } from '../../estado/derivados'
import { formatearCota } from '../../formato'
import { resumenPendientes, siguienteCeldaPendiente } from '../../libreta/navegacion'
import AvisoAlAnotar from './AvisoAlAnotar'
import CierreEnVivo from './CierreEnVivo'
import {
  alturaInstrumentalDeEstacion,
  estacionComprobada,
  instrumentoDe,
  leerNumero,
  reglasMiraDe,
} from './comun'
import { useEvaluacionCalle, useResultadoCalle } from './resultadoCalle'

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

/** Una lectura de la libreta, como se lee en la mira: tres decimales, o «—» si falta. */
function lecturaCorta(valor: number | undefined): string {
  return valor !== undefined && Number.isFinite(valor) && valor > 0 ? formatearCota(valor) : '—'
}

const CHIP = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] px-2 text-sm font-semibold'

/**
 * Medir: la libreta de hoy, de arriba abajo en el orden en que se usa en
 * obra. La estación y su AI; si el circuito sigue abierto, que nada está
 * comprobado y dónde se cierra; los puntos de la progresiva; el campo de la
 * lectura con lo que se espera leer y el aviso al anotar; «Anotar y seguir»;
 * y debajo, plegado, lo que se mira de vez en cuando: la estación (vista
 * atrás y adelante), las progresivas de la jornada y el cierre en detalle.
 *
 * La celda en la que se anota es la selección del almacén: tocarla en el
 * mapa, en el corte o en las casillas la elige, y al anotar se salta a la
 * siguiente que falte (con lo que el corte se va a su progresiva).
 *
 * EspacioCalle la monta con `key` = toma activa: al cambiar de capa se vacía
 * el campo y se olvida la última lectura, que era de la otra toma.
 */
export default function FichaMedir() {
  const contexto = useContexto()
  const resultado = useResultadoCalle()
  const evaluacion = useEvaluacionCalle(resultado)
  const proyecto = useAlmacen((s) => s.proyecto)
  const estacionActiva = useAlmacen((s) => s.estacionActiva)
  const activarEstacion = useAlmacen((s) => s.activarEstacion)
  const agregarEstacion = useAlmacen((s) => s.agregarEstacion)
  const agregarIntermedia = useAlmacen((s) => s.agregarIntermedia)
  const eliminarLectura = useAlmacen((s) => s.eliminarLectura)
  const declararProgresiva = useAlmacen((s) => s.declararProgresiva)
  const quitarProgresivaDeclarada = useAlmacen((s) => s.quitarProgresivaDeclarada)
  const abrirPantallaCalle = useAlmacen((s) => s.abrirPantallaCalle)
  const claveSeleccionada = useAlmacen((s) => s.seleccion.clave)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const [texto, setTexto] = useState('')
  const [rechazo, setRechazo] = useState<string | null>(null)
  const [textoProgresiva, setTextoProgresiva] = useState('')
  const [avisoProgresiva, setAvisoProgresiva] = useState<string | null>(null)
  const [ultima, setUltima] = useState<UltimaAnotada | null>(null)
  // El plegable de la estación se abre solo cuando hay algo que escribir en
  // él (falta la vista atrás, o se acaba de pedir la vista adelante). Nunca
  // se cierra solo: se cerraría mientras se escribe. Cada vez que se pide
  // abrirlo, `vecesAbierta` lo vuelve a montar abierto aunque se hubiera
  // cerrado a mano.
  const [estacionAbierta, setEstacionAbierta] = useState(false)
  const [vecesAbierta, setVecesAbierta] = useState(0)
  const campo = useRef<HTMLInputElement>(null)

  const instrumento = instrumentoDe(proyecto)
  const mira = reglasMiraDe(instrumento)
  const indiceSeguro = contexto ? Math.min(estacionActiva, Math.max(0, contexto.campania.estaciones.length - 1)) : 0
  const acciones = useAccionesEstacion(indiceSeguro, activarEstacion)

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
  const cierreVivo = useMemo(
    () => (contexto ? estadoCierreEnVivo(contexto.campania, proyecto.bms, { largoMira: instrumento.largoMira }) : null),
    [contexto, proyecto.bms, instrumento.largoMira],
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

  // Sin vista atrás no hay cota: el plegable de la estación se abre para escribirla.
  const faltaVistaAtras = resultado !== null && !Number.isFinite(resultado.cotasInstrumento[indiceSeguro])
  useEffect(() => {
    if (faltaVistaAtras) setEstacionAbierta(true)
  }, [faltaVistaAtras])

  if (!contexto || !resultado || !cierreVivo) {
    return <p className="text-sm text-tenue">Elige o crea una capa para abrir la libreta.</p>
  }

  const { campania, calle, capa } = contexto
  // La AI compensada si el circuito cerró: la misma que respalda lo que Revisar juzga.
  const { altura: alturaInstrumental, correccionMm } = alturaInstrumentalDeEstacion(resultado, campania, indiceSeguro)
  const comprobado = estacionComprobada(resultado, indiceSeguro)
  const toleranciaMm = capa?.toleranciaMm ?? Number.NaN
  const estacion = campania.estaciones[indiceSeguro]

  function cotaProyectoDe(progresiva: number, elementoClave: string): number | null {
    const punto = calle.seccion.puntos.find((p) => p.id === elementoClave)
    if (!calle.rasante || !punto) return null
    return cotaTeoricaDeCapa(calle.rasante, proyecto.capas, campania.capaId, progresiva, punto.distancia)
  }

  const cotaProyectoActiva = celdaActiva ? cotaProyectoDe(celdaActiva.progresiva, celdaActiva.elementoClave) : null
  const nombreActiva = celdaActiva
    ? `${formatearProgresiva(celdaActiva.progresiva)} ${celdaActiva.elementoNombre}`
    : 'grilla completa'

  // Los puntos de la progresiva en la que se anota (o la última, con la grilla completa).
  const progresivaActiva = celdaActiva?.progresiva ?? progresivasDeLaTabla.at(-1) ?? null
  const casillas =
    progresivaActiva === null ? [] : celdas.filter((c) => redondear3(c.progresiva) === redondear3(progresivaActiva))
  const hechas = casillas.filter((c) => llenas.has(c.clave)).length

  /** El campo sigue con el foco: en el celular, así el teclado no se cierra entre lectura y lectura. */
  function volverAlCampo() {
    campo.current?.focus()
  }

  function abrirEstacion() {
    setEstacionAbierta(true)
    setVecesAbierta((n) => n + 1)
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
      nombre: nombreActiva,
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
      setAvisoProgresiva(`${formatearProgresiva(progresiva)} ya tiene lecturas anotadas: no se quita, para no perderlas.`)
      return
    }
    quitarProgresivaDeclarada(campania.id, progresiva)
    setAvisoProgresiva(null)
  }

  // El estado del circuito en una línea; el detalle va plegado al final.
  const cerroBien = cierreVivo.circuito === 'cerrado' && cierreVivo.cierre?.pasa === true
  const bmCierre = cierreVivo.previo?.bmCierre.nombre ?? acciones.nombreBmCierre
  const lineaCircuito = cerroBien ? (
    <AvisoLinea tono="pasa">{cierreVivo.texto.replace(/\s*[✓✗△]$/, '')}</AvisoLinea>
  ) : cierreVivo.circuito === 'abierto' ? (
    <AvisoLinea tono="aviso" accion={{ texto: `Cierra en ${bmCierre} ›`, alPulsar: () => abrirPantallaCalle('cierre') }}>
      <b>Sin cerrar</b> · {cierreVivo.lecturasSinComprobar}{' '}
      {cierreVivo.lecturasSinComprobar === 1 ? 'lectura' : 'lecturas'} sin comprobar
    </AvisoLinea>
  ) : (
    <AvisoLinea tono="falla" accion={{ texto: 'Ver el cierre ›', alPulsar: () => abrirPantallaCalle('cierre') }}>
      {cierreVivo.texto}
    </AvisoLinea>
  )

  const progresivasJornada = (
    <>
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-tenue">Añadir progresiva</span>
          <input
            aria-label="Añadir progresiva"
            value={textoProgresiva}
            onChange={(evento) => setTextoProgresiva(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter') anadirProgresiva()
            }}
            placeholder="0+006"
            className="numerico min-h-11 w-28 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-right text-sm"
          />
        </label>
        <button type="button" onClick={anadirProgresiva} className={BOTON_SECUNDARIO}>
          Añadir
        </button>
      </div>
      {avisoProgresiva && (
        <p role="status" className="rounded-[10px] bg-aviso-suave px-3 py-2 text-[13px] text-aviso">
          {avisoProgresiva}
        </p>
      )}
      {progresivasDeLaTabla.length > 0 && (
        <Plegable titulo={`Progresivas de la jornada (${progresivasDeLaTabla.length})`}>
          <ul aria-label="Progresivas de la jornada" className="flex flex-wrap gap-1">
            {progresivasDeLaTabla.map((progresiva) => (
              <li key={progresiva} className="flex items-center rounded-[10px] bg-sin-suave pl-3 text-sm">
                <span className="numerico">{formatearProgresiva(progresiva)}</span>
                <button
                  type="button"
                  aria-label={`Quitar ${formatearProgresiva(progresiva)}`}
                  onClick={() => quitarProgresiva(progresiva)}
                  className="min-h-11 min-w-11 text-tenue hover:text-falla"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </Plegable>
      )}
    </>
  )

  const cierreDetallado = (
    <Plegable titulo="Cierre del circuito" className="border-t border-borde pt-2">
      <CierreEnVivo toma={campania} bms={proyecto.bms} largoMira={instrumento.largoMira} />
    </Plegable>
  )

  if (campania.estaciones.length === 0 || !estacion) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-[10px] bg-aviso-suave p-3">
          <p className="text-sm">Esta libreta todavía no tiene estaciones. Planta el nivel y lee hacia atrás al banco de nivel.</p>
          <button
            type="button"
            onClick={() => agregarEstacion(campania.id, { destino: { tipo: 'bm', bmId: campania.bmInicialId }, valor: 0 })}
            className={`${BOTON_PRINCIPAL} self-start`}
          >
            Empezar la libreta
          </button>
        </div>
        {progresivasJornada}
        {cierreDetallado}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* (a) La estación y su altura de instrumento, en una línea. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" aria-label="Estaciones" className="flex flex-wrap gap-1">
          {campania.estaciones.map((_, indice) => (
            <button
              key={indice}
              type="button"
              aria-pressed={indice === indiceSeguro}
              aria-label={`Estación ${indice + 1}`}
              onClick={() => activarEstacion(indice)}
              className={`${CHIP} ${indice === indiceSeguro ? 'bg-tinta text-tarjeta' : 'bg-sin-suave text-tinta'}`}
            >
              {indice + 1}
            </button>
          ))}
        </div>
        <p className="flex items-baseline gap-2">
          <span className="text-[13px] text-tenue">AI</span>
          <span className="numerico text-[17px] font-semibold">
            {Number.isFinite(alturaInstrumental) ? formatearCota(alturaInstrumental) : '—'}
          </span>
          {comprobado && (
            <span className="text-[13px] font-semibold text-pasa">
              <span aria-hidden="true">✓ </span>compensada
            </span>
          )}
        </p>
      </div>

      {/* (b) Sin cerrar, nada de lo que sigue está comprobado. */}
      {lineaCircuito}

      {indiceSeguro < campania.estaciones.length - 1 && (
        <AvisoLinea tono="aviso">
          Estás anotando en la estación {indiceSeguro + 1} de {campania.estaciones.length}, que no es la última.
        </AvisoLinea>
      )}

      {/* (c) La progresiva y sus puntos: cuáles faltan, y tocar uno lo elige. */}
      {progresivaActiva !== null && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] text-tenue">
            Progresiva <b className="numerico text-tinta">{formatearProgresiva(progresivaActiva)}</b> · {hechas} de{' '}
            {casillas.length} puntos
          </p>
          <div role="group" aria-label="Puntos de la progresiva" className="grid grid-cols-[repeat(auto-fit,minmax(3.25rem,1fr))] gap-1">
            {casillas.map((celda) => {
              const punto = calle.seccion.puntos.find((p) => p.id === celda.elementoClave)
              const estado = evaluacion?.celdas.get(celda.clave)?.estado
              const llena = llenas.has(celda.clave)
              const fondo = estado ? CLASES_ESTADO[estado] : llena ? 'bg-borde text-tinta' : CLASES_ESTADO.sinMedir
              const activa = celda.clave === claveSeleccionada
              const lecturas = resultado.cotasPorCelda.get(celda.clave)?.lecturas
              return (
                <button
                  key={celda.clave}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => seleccionar(celda.clave)}
                  className={`flex min-h-11 flex-col items-center justify-center rounded-lg border-2 px-0.5 py-1 ${fondo} ${
                    activa ? 'border-tinta' : 'border-transparent'
                  }`}
                >
                  <span className="sr-only">{celda.elementoNombre}: </span>
                  <span aria-hidden="true" className="text-[10px] leading-tight">
                    {punto ? palabraDePunto(punto) : celda.elementoNombre}
                  </span>
                  <span className="numerico text-xs leading-tight font-semibold">
                    {llena ? lecturaCorta(lecturas?.at(-1)) : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* (d) y (e), con la grilla llena: no hay celda en la que anotar, así que en su
          lugar se dice que está completa y qué sigue, con la progresiva nueva a la mano. */}
      {!celdaActiva && (
        <div className="flex flex-col gap-2">
          <AvisoLinea tono="pasa" className="font-semibold">
            <b>Grilla completa</b> ·{' '}
            {cierreVivo.circuito === 'abierto'
              ? `añade una progresiva o cierra en ${bmCierre}`
              : 'añade una progresiva para seguir midiendo'}
          </AvisoLinea>
          {progresivasJornada}
        </div>
      )}

      {/* (d) El campo de la lectura, grande: se escribe con el pulgar, con guantes y al sol. */}
      {celdaActiva && (
        <div className="flex flex-col gap-2 rounded-[14px] border border-borde p-3">
          <p className="text-sm text-tenue">
            Lectura de mira en <b className="text-tinta">{nombreActiva}</b>
          </p>
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
            placeholder="lectura en m"
            className="numerico h-16 w-full rounded-[10px] border-2 border-tinta bg-tarjeta px-3 text-right text-[40px] font-semibold placeholder:text-xl placeholder:font-normal placeholder:text-tenue md:text-[28px]"
          />
          {rechazo && (
            <div role="alert">
              <AvisoLinea tono="falla" className="font-semibold">
                {rechazo}
              </AvisoLinea>
            </div>
          )}
          <AvisoAlAnotar
            texto={texto}
            alturaInstrumental={alturaInstrumental}
            cotaProyecto={cotaProyectoActiva}
            toleranciaMm={toleranciaMm}
            comprobado={comprobado}
            mira={mira}
          />
        </div>
      )}

      {/* (e) Lo que se hace aquí: uno solo, ancho y abajo, al alcance del pulgar. */}
      {celdaActiva && (
        <button
          type="button"
          onClick={registrarLectura}
          // Que tocarlo no le quite el foco al campo: en el celular eso cerraría
          // el teclado y habría que volver a tocar el campo.
          onPointerDown={(evento) => evento.preventDefault()}
          className={`${BOTON_PRINCIPAL} h-[60px] w-full text-lg font-bold`}
        >
          Anotar y seguir
        </button>
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

      {/* (f) Al acabar la estación: trasladar el nivel o cerrar en el BM. */}
      {acciones.disponible && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              acciones.trasladarInstrumento()
              abrirEstacion()
            }}
            className={BOTON_SECUNDARIO}
          >
            Cambio de estación
          </button>
          <button
            type="button"
            onClick={() => {
              acciones.cerrarCircuito()
              abrirEstacion()
            }}
            className={BOTON_SECUNDARIO}
          >
            Cerrar en {acciones.nombreBmCierre}
          </button>
        </div>
      )}

      {/* (g) La estación entera: vista atrás, intermedias y vista adelante. */}
      <Plegable
        key={vecesAbierta}
        abierto={estacionAbierta}
        titulo={`Estación ${indiceSeguro + 1}: vista atrás y adelante`}
        resumen={`atrás ${lecturaCorta(estacion.vistaAtras.valor)} · adelante ${lecturaCorta(estacion.vistaAdelante?.valor)}`}
        className="border-t border-borde pt-2"
      >
        <PanelEstacion estacionIndice={indiceSeguro} alCambiarEstacion={activarEstacion} conAcciones={false} sinMarco />
      </Plegable>

      {/* (h) El panel enseña la CI de la libreta; el aviso cuenta con la compensada. Se dice cuál, para que no parezcan dos cotas. */}
      {correccionMm !== 0 && Number.isFinite(alturaInstrumental) && (
        <p className="text-[13px] text-tenue">
          El circuito cerró: el aviso cuenta con la AI compensada{' '}
          <strong className="numerico text-tinta">{formatearCota(alturaInstrumental)}</strong> (
          <span className="numerico">
            {correccionMm > 0 ? '+' : '−'}
            {Math.abs(correccionMm).toFixed(1)} mm
          </span>{' '}
          sobre la CI de la libreta), la misma con la que se revisa.
        </p>
      )}

      {/* (i) */}
      <p className="text-[13px] text-tenue">
        llenadas {resultado.celdasLlenas} de {resultado.celdasTotales} · {resumenPendientes(celdas, llenas)}
      </p>

      {/* (j) Con la grilla llena ya va arriba, junto al aviso. */}
      {celdaActiva && progresivasJornada}

      {cierreDetallado}
    </div>
  )
}
