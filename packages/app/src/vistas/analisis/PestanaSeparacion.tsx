import {
  formatearProgresiva,
  separacionEn,
  separacionEntreLineas,
  type Calle,
  type Capa,
  type PuntoSeccion,
  type PuntoSeparacion,
} from '@topo/core'
import { useEffect, useId, useMemo, useState } from 'react'
import AvisoLinea from '../../componentes/AvisoLinea'
import Plegable from '../../componentes/Plegable'
import { BOTON_ICONO, BOTON_SECUNDARIO, CEJA, CLASES_ESTADO, TARJETA } from '../../componentes/ui'
import { descargarXlsx } from '../../archivo/exportar'
import { useAlmacen } from '../../estado/almacen'
import { formatearCota } from '../../formato'
import GraficoNiveles, { LeyendaNiveles } from '../niveles/GraficoNiveles'
import { capasMedidas, lineaElegida, puntosDeIzquierdaADerecha, textoAjusteCm, type EleccionLinea } from '../niveles/lineas'
import { Aviso, ETIQUETA, SELECTOR } from './comunes'

/** Las dos líneas que se comparan a un lado de la calle. */
export interface ParDeLineas {
  superior: EleccionLinea
  inferior: EleccionLinea
}

/** Lo que se elige en Separación; lo guarda PantallaAnalisis para que no se pierda al cambiar de pestaña. */
export interface EleccionSeparacion {
  /** Texto tal cual se escribe: «5», «4,5». */
  minimoCm: string
  /** Milímetros por debajo del mínimo que todavía se aceptan (△ hasta el doble). Vacío = sin tolerancia. */
  toleranciaMm: string
  /** De a cuánto suben y bajan los botones ▲ ▼, en cm. */
  pasoCm: string
  dosLados: boolean
  izquierda: ParDeLineas | null
  derecha: ParDeLineas | null
}

export const SEPARACION_DE_FABRICA: EleccionSeparacion = {
  minimoCm: '5',
  toleranciaMm: '',
  pasoCm: '1',
  dosLados: true,
  izquierda: null,
  derecha: null,
}

/**
 * La pareja que se propone al entrar, como su herramienta: arriba la capa
 * medida más alta, abajo la de debajo (o la misma, si solo hay una), en el
 * punto de más afuera de ese lado (la vereda o el borde).
 */
export function parPorDefecto(medidas: Capa[], puntos: PuntoSeccion[], lado: 'izquierda' | 'derecha'): ParDeLineas | null {
  if (medidas.length === 0 || puntos.length === 0) return null
  const punto = lado === 'izquierda' ? puntos[0]! : puntos[puntos.length - 1]!
  const arriba = medidas[medidas.length - 1]!
  const abajo = medidas[medidas.length - 2] ?? arriba
  return {
    superior: { capaId: arriba.id, puntoId: punto.id, ajusteCm: 0 },
    inferior: { capaId: abajo.id, puntoId: punto.id, ajusteCm: 0 },
  }
}

function leerDecimal(texto: string): number {
  if (texto.trim() === '') return Number.NaN
  return Number(texto.replace(',', '.'))
}

function cm(m: number): string {
  const v = m * 100
  return `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} cm`
}

const CLASES_RESULTADO = {
  conforme: CLASES_ESTADO.conforme,
  alLimite: CLASES_ESTADO.alLimite,
  fuera: CLASES_ESTADO.fuera,
}

const PALABRA = { conforme: 'CUMPLE', alLimite: 'AL LÍMITE', fuera: 'NO CUMPLE' } as const

/**
 * Análisis › Separación: la herramienta «Pistas y veredas: separación entre
 * niveles» de Max, con las líneas de la app. A cada lado de la calle se
 * eligen dos líneas (una capa medida en un punto de la sección: la vereda
 * del terreno, la base en el borde…), y se ve la menor separación, dónde
 * ocurre, qué puntos no llegan al mínimo, la pendiente de cada tramo y un
 * escáner para recorrer la calle. Cada línea se puede subir o bajar unos cm
 * para probar «¿y si doy 2 cm más?» sin tocar lo medido.
 *
 * Todas las cuentas son del motor (`separacionEntreLineas`, `separacionEn`):
 * aquí solo se eligen las líneas y se dibuja. Lo que sale de una nivelación
 * sin cerrar se dice no comprobado, como en el resto de la app.
 */
export default function PestanaSeparacion({
  calle,
  eleccion,
  alCambiar,
}: {
  calle: Calle
  eleccion: EleccionSeparacion
  alCambiar: (cambio: Partial<EleccionSeparacion>) => void
}) {
  const capas = useAlmacen((s) => s.proyecto.capas)
  const medidas = useMemo(() => capasMedidas(calle, capas), [calle, capas])
  const puntos = useMemo(() => puntosDeIzquierdaADerecha(calle), [calle])

  // Lo elegido tiene que seguir existiendo: si se borró la capa o el punto, se vuelve a proponer.
  const valido = (par: ParDeLineas | null) =>
    par !== null &&
    [par.superior, par.inferior].every(
      (l) => medidas.some((c) => c.id === l.capaId) && puntos.some((p) => p.id === l.puntoId),
    )
  const izquierda = valido(eleccion.izquierda) ? eleccion.izquierda : parPorDefecto(medidas, puntos, 'izquierda')
  const derecha = valido(eleccion.derecha) ? eleccion.derecha : parPorDefecto(medidas, puntos, 'derecha')

  if (medidas.length === 0 || !izquierda || !derecha) {
    return (
      <Aviso tono="neutro" simbolo="△">
        Para comparar niveles hace falta al menos una capa medida en esta calle. Mide una en Calle › Medir.
      </Aviso>
    )
  }

  const minimoCm = leerDecimal(eleccion.minimoCm)
  const toleranciaMm = eleccion.toleranciaMm.trim() === '' ? 0 : leerDecimal(eleccion.toleranciaMm)
  const pasoCm = Math.max(0, leerDecimal(eleccion.pasoCm) || 0)

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Criterio de separación" className={`${TARJETA} flex flex-wrap items-end gap-3`}>
        <label className="flex w-36 flex-col gap-1">
          <span className={ETIQUETA}>Separación mínima (cm)</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            value={eleccion.minimoCm}
            onChange={(e) => alCambiar({ minimoCm: e.target.value })}
            className={`${SELECTOR} numerico text-right`}
          />
        </label>
        <label className="flex w-36 flex-col gap-1">
          <span className={ETIQUETA}>Tolerancia (mm)</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            placeholder="sin tolerancia"
            value={eleccion.toleranciaMm}
            onChange={(e) => alCambiar({ toleranciaMm: e.target.value })}
            className={`${SELECTOR} numerico text-right`}
          />
        </label>
        <label className="flex w-28 flex-col gap-1">
          <span className={ETIQUETA}>Subir / bajar de a (cm)</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            value={eleccion.pasoCm}
            onChange={(e) => alCambiar({ pasoCm: e.target.value })}
            className={`${SELECTOR} numerico text-right`}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input
            type="checkbox"
            checked={eleccion.dosLados}
            onChange={(e) => alCambiar({ dosLados: e.target.checked })}
            className="h-5 w-5"
          />
          Los dos lados
        </label>
        <p className="w-full text-[13px] text-tenue">
          Se mide de la línea de arriba a la de abajo en cada punto medido de cualquiera de las dos. Con tolerancia,
          lo que falta hasta ella es ✓, hasta el doble △ y más allá ✗; sin ella, ✓ o ✗.
        </p>
      </section>

      <div className={`grid gap-4 ${eleccion.dosLados ? 'xl:grid-cols-2' : ''}`}>
        <PanelLado
          titulo="Lado izquierdo"
          calle={calle}
          medidas={medidas}
          puntos={puntos}
          par={izquierda}
          minimoCm={minimoCm}
          toleranciaMm={toleranciaMm}
          pasoCm={pasoCm}
          alCambiar={(par) => alCambiar({ izquierda: par })}
        />
        {eleccion.dosLados && (
          <PanelLado
            titulo="Lado derecho"
            calle={calle}
            medidas={medidas}
            puntos={puntos}
            par={derecha}
            minimoCm={minimoCm}
            toleranciaMm={toleranciaMm}
            pasoCm={pasoCm}
            alCambiar={(par) => alCambiar({ derecha: par })}
          />
        )}
      </div>
    </div>
  )
}

interface PropsPanel {
  titulo: string
  calle: Calle
  medidas: Capa[]
  puntos: PuntoSeccion[]
  par: ParDeLineas
  minimoCm: number
  toleranciaMm: number
  pasoCm: number
  alCambiar: (par: ParDeLineas) => void
}

function PanelLado({ titulo, calle, medidas, puntos, par, minimoCm, toleranciaMm, pasoCm, alCambiar }: PropsPanel) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const idTitulo = useId()
  const superior = useMemo(() => lineaElegida(proyecto, calle, par.superior), [proyecto, calle, par.superior])
  const inferior = useMemo(() => lineaElegida(proyecto, calle, par.inferior), [proyecto, calle, par.inferior])
  const minimoM = minimoCm / 100
  const opciones = { toleranciaMm }

  const resultado = useMemo(
    () => (superior && inferior ? separacionEntreLineas(superior.linea, inferior.linea, minimoM, opciones) : null),
    // `opciones` se arma en cada dibujado: se mira su número.
    [superior, inferior, minimoM, toleranciaMm],
  )

  // El escáner: arranca en el punto crítico y se queda donde se lo deja mientras siga dentro del tramo.
  const [escaner, setEscaner] = useState<number | null>(null)
  const enTramo = resultado?.ok === true && escaner !== null && escaner >= resultado.desde && escaner <= resultado.hasta
  useEffect(() => {
    if (resultado?.ok && !enTramo) setEscaner(resultado.critico.progresiva)
  }, [resultado, enTramo])
  const x = resultado?.ok ? (enTramo ? escaner! : resultado.critico.progresiva) : null
  const enEscaner: PuntoSeparacion | null =
    x !== null && superior && inferior ? separacionEn(superior.linea, inferior.linea, x, minimoM, opciones) : null

  const mismaLinea =
    par.superior.capaId === par.inferior.capaId &&
    par.superior.puntoId === par.inferior.puntoId &&
    par.superior.ajusteCm === par.inferior.ajusteCm

  function descargar() {
    if (!resultado?.ok || !superior || !inferior) return
    const tabla = [
      ['Progresiva', `Cota ${superior.linea.nombre}`, `Cota ${inferior.linea.nombre}`, 'Separación (m)', 'Estado', 'Comprobado'],
      ...resultado.puntos.map((p) => [
        formatearProgresiva(p.progresiva),
        formatearCota(p.cotaSuperior),
        formatearCota(p.cotaInferior),
        formatearCota(p.separacion),
        `${p.simbolo} ${PALABRA[p.estado].toLowerCase()}`,
        p.comprobado ? 'sí' : 'no',
      ]),
    ]
    descargarXlsx(tabla, `Separación ${titulo.toLowerCase()} - ${calle.nombre}`, 'Separación')
  }

  return (
    <section aria-labelledby={idTitulo} className={`${TARJETA} flex min-w-0 flex-col gap-3`}>
      <h3 id={idTitulo} className={CEJA}>
        {titulo}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <ElegirLinea
          titulo="Línea de arriba"
          tono="superior"
          medidas={medidas}
          puntos={puntos}
          valor={par.superior}
          pasoCm={pasoCm}
          alCambiar={(superior) => alCambiar({ ...par, superior })}
        />
        <ElegirLinea
          titulo="Línea de abajo"
          tono="inferior"
          medidas={medidas}
          puntos={puntos}
          valor={par.inferior}
          pasoCm={pasoCm}
          alCambiar={(inferior) => alCambiar({ ...par, inferior })}
        />
      </div>

      {mismaLinea ? (
        <Aviso tono="aviso" simbolo="△">
          Arriba y abajo es la misma línea: elige dos distintas.
        </Aviso>
      ) : !resultado ? null : !resultado.ok ? (
        <Aviso tono="aviso" simbolo="△">
          Sin resultado: {resultado.error}
        </Aviso>
      ) : (
        <>
          <div
            role="status"
            className={`rounded-[10px] px-3 py-2 text-[15px] [.sol_&]:border [.sol_&]:border-current ${CLASES_RESULTADO[resultado.estado]}`}
          >
            <p>
              <b className="text-[17px]">
                <span aria-hidden="true">{resultado.simbolo} </span>
                {PALABRA[resultado.estado]}
              </b>{' '}
              — separación mínima <b className="numerico">{cm(resultado.critico.separacion)}</b> (requerido ≥{' '}
              {cm(resultado.minimoM)})
              {!resultado.comprobado && <b> · no comprobado</b>}
            </p>
            <p className="text-sm">
              En <span className="numerico">{formatearProgresiva(resultado.critico.progresiva)}</span>
              {resultado.critico.seCruzan && ' · las líneas se cruzan'}. Tramo evaluado:{' '}
              <span className="numerico">
                {formatearProgresiva(resultado.desde)} a {formatearProgresiva(resultado.hasta)}
              </span>
              .
            </p>
          </div>

          <GraficoNiveles
            etiqueta={`Separación entre ${superior!.linea.nombre} y ${inferior!.linea.nombre}`}
            lineas={[
              { linea: superior!.linea, tono: 'superior', pendientes: true },
              { linea: inferior!.linea, tono: 'inferior', pendientes: true },
            ]}
            fallas={resultado.noCumplen.map((p) => ({ progresiva: p.progresiva, desde: p.cotaSuperior, hasta: p.cotaInferior }))}
            critico={{
              progresiva: resultado.critico.progresiva,
              desde: resultado.critico.cotaSuperior,
              hasta: resultado.critico.cotaInferior,
            }}
            cursor={
              enEscaner
                ? {
                    progresiva: enEscaner.progresiva,
                    desde: enEscaner.cotaSuperior,
                    hasta: enEscaner.cotaInferior,
                    tono: enEscaner.cumple ? 'pasa' : 'falla',
                    texto: cm(enEscaner.separacion),
                  }
                : null
            }
          />
          <LeyendaNiveles
            lineas={[
              { nombre: superior!.linea.nombre, tono: 'superior' },
              { nombre: inferior!.linea.nombre, tono: 'inferior' },
            ]}
          />

          {/* El escáner vertical de su herramienta. */}
          <div className="flex flex-col gap-1 border-t border-dashed border-borde pt-2">
            <input
              type="range"
              min={resultado.desde}
              max={resultado.hasta}
              step={Math.max((resultado.hasta - resultado.desde) / 1000, 0.001)}
              value={x ?? resultado.desde}
              onChange={(e) => setEscaner(Number(e.target.value))}
              aria-label={`Escáner de progresiva, ${titulo.toLowerCase()}`}
              aria-valuetext={x !== null ? formatearProgresiva(x) : undefined}
              className="h-8 w-full accent-[var(--color-tinta)]"
            />
            {enEscaner ? (
              <p className="text-[15px]" aria-live="polite">
                <span className="numerico">{formatearProgresiva(enEscaner.progresiva)}</span> · separación{' '}
                <b className={`numerico ${enEscaner.cumple ? 'text-pasa' : 'text-falla'}`}>
                  {enEscaner.simbolo} {cm(enEscaner.separacion)}
                </b>
                <span className="block text-[13px] text-tenue">
                  Arriba <span className="numerico">{formatearCota(enEscaner.cotaSuperior)}</span> · abajo{' '}
                  <span className="numerico">{formatearCota(enEscaner.cotaInferior)}</span>
                  {!enEscaner.comprobado && ' · no comprobado'}
                  {enEscaner.seCruzan && ' · las líneas se cruzan aquí'}
                </span>
              </p>
            ) : (
              <p className="text-[13px] text-tenue">Sin dato en esta progresiva.</p>
            )}
            <button type="button" onClick={() => setEscaner(resultado.critico.progresiva)} className={`${BOTON_SECUNDARIO} self-start`}>
              Ir al punto crítico
            </button>
          </div>

          {resultado.noCumplen.length > 0 && (
            <section aria-label={`Puntos que no cumplen, ${titulo.toLowerCase()}`} className="flex flex-col gap-1">
              <h4 className="text-sm text-tenue">
                {resultado.noCumplen.length === 1 ? '1 punto no cumple' : `${resultado.noCumplen.length} puntos no cumplen`}
              </h4>
              <ul className="flex flex-wrap gap-1">
                {resultado.noCumplen.map((p) => (
                  <li key={p.progresiva}>
                    <button
                      type="button"
                      onClick={() => setEscaner(p.progresiva)}
                      className={`numerico min-h-11 rounded-[10px] border px-3 text-sm ${p.estado === 'fuera' ? 'border-falla text-falla' : 'border-aviso text-aviso'}`}
                    >
                      <span aria-hidden="true">{p.simbolo} </span>
                      {formatearProgresiva(p.progresiva)} · {cm(p.separacion)}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {resultado.avisos.length > 0 && (
            <Plegable titulo="Avisos" resumen={String(resultado.avisos.length)}>
              <ul className="flex flex-col gap-1 pb-1">
                {resultado.avisos.map((a) => (
                  <li key={a}>
                    <AvisoLinea tono="aviso">{a}</AvisoLinea>
                  </li>
                ))}
              </ul>
            </Plegable>
          )}

          <button type="button" onClick={descargar} className={`${BOTON_SECUNDARIO} self-start`}>
            Descargar en Excel
          </button>
        </>
      )}
      {superior && inferior && (superior.linea.puntos.length === 0 || inferior.linea.puntos.length === 0) && (
        <p className="text-[13px] text-tenue">
          {[superior, inferior]
            .filter((l) => l.linea.puntos.length === 0)
            .map((l) => `${l.linea.nombre} no tiene puntos medidos.`)
            .join(' ')}
        </p>
      )}
    </section>
  )
}

interface PropsElegir {
  titulo: string
  tono: 'superior' | 'inferior'
  medidas: Capa[]
  puntos: PuntoSeccion[]
  valor: EleccionLinea
  pasoCm: number
  alCambiar: (valor: EleccionLinea) => void
}

/** Una línea: capa medida, punto de la sección y cuánto subirla o bajarla. */
function ElegirLinea({ titulo, tono, medidas, puntos, valor, pasoCm, alCambiar }: PropsElegir) {
  const [textoAjuste, setTextoAjuste] = useState<string | null>(null)
  const color = tono === 'superior' ? 'text-proyecto' : 'text-aviso'
  const ajustar = (cm: number) => {
    setTextoAjuste(null)
    alCambiar({ ...valor, ajusteCm: Math.round(cm * 1000) / 1000 })
  }
  return (
    <fieldset className="flex min-w-0 flex-col gap-2 rounded-[10px] border border-borde p-3">
      <legend className={`px-1 text-sm font-semibold ${color}`}>
        {titulo}
        {textoAjusteCm(valor.ajusteCm)}
      </legend>
      <label className="flex flex-col gap-1">
        <span className={ETIQUETA}>Capa</span>
        <select
          aria-label={`${titulo}: capa`}
          value={valor.capaId}
          onChange={(e) => alCambiar({ ...valor, capaId: e.target.value })}
          className={SELECTOR}
        >
          {medidas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={ETIQUETA}>Punto</span>
        <select
          aria-label={`${titulo}: punto`}
          value={valor.puntoId}
          onChange={(e) => alCambiar({ ...valor, puntoId: e.target.value })}
          className={SELECTOR}
        >
          {puntos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Bajar ${titulo.toLowerCase()} ${pasoCm} cm`}
          onClick={() => ajustar(valor.ajusteCm - pasoCm)}
          className={BOTON_ICONO}
        >
          ▼
        </button>
        <input
          aria-label={`${titulo}: ajuste en cm`}
          inputMode="decimal"
          autoComplete="off"
          value={textoAjuste ?? String(valor.ajusteCm)}
          onChange={(e) => {
            setTextoAjuste(e.target.value)
            const v = leerDecimal(e.target.value)
            alCambiar({ ...valor, ajusteCm: Number.isFinite(v) ? v : 0 })
          }}
          className="numerico min-h-11 w-full min-w-0 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-right text-[15px] text-tinta"
        />
        <button
          type="button"
          aria-label={`Subir ${titulo.toLowerCase()} ${pasoCm} cm`}
          onClick={() => ajustar(valor.ajusteCm + pasoCm)}
          className={BOTON_ICONO}
        >
          ▲
        </button>
        <span className="text-[13px] text-tenue">cm</span>
      </div>
    </fieldset>
  )
}
