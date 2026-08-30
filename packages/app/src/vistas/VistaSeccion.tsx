import {
  ETIQUETA_ROL,
  hayDistanciasDeFabrica,
  ladoDe,
  palabraDePunto,
  ROLES,
  type Id,
  type PuntoSeccion,
  type Rol,
} from '@topo/core'
import { useState } from 'react'
import CampoNumero from '../componentes/CampoNumero'
import { useAlmacen } from '../estado/almacen'

interface Props {
  calleId: Id
}

/** Lienzo del dibujo, en unidades del `viewBox`. */
const ANCHO = 720
const ALTO = 190
/** Aire a los lados: el punto más lejano cae justo aquí, no pegado al borde. */
const MARGEN = 48
/** Altura de la línea de la calzada dentro del lienzo. */
const SUELO = 112

/** Pasos posibles de la barra de escala, en metros. */
const PASOS_BARRA = [0.5, 1, 2, 5, 10, 20, 50]
/** Lo que se le deja crecer a la barra de escala dentro del lienzo. */
const BARRA_MAXIMA = 140

/** De izquierda a derecha, que es como se ve la calle desde la progresiva. */
function ordenadosPorDistancia(puntos: PuntoSeccion[]): PuntoSeccion[] {
  return [...puntos].sort((a, b) => a.distancia - b.distancia)
}

/**
 * La distancia dicha en palabras: el signo no se lee en voz alta, el lado
 * sí. Negativo es izquierda, como en todo el modelo.
 */
function distanciaEnPalabras(distancia: number): string {
  const lado = ladoDe(distancia)
  if (lado === 'eje') return 'en el eje'
  return `${Math.abs(distancia).toFixed(2)} m a la ${lado}`
}

/** Dónde está el punto, para leerlo al lado de su elemento. */
function sitioDelPunto(distancia: number): string {
  const lado = ladoDe(distancia)
  if (lado === 'eje') return 'el centro de la calle'
  return `lado ${lado === 'izquierda' ? 'izquierdo' : 'derecho'}`
}

/** El paso más largo de la barra de escala que todavía cabe en el lienzo. */
function pasoDeBarra(escala: number): number {
  const caben = PASOS_BARRA.filter((paso) => paso * escala <= BARRA_MAXIMA)
  return caben[caben.length - 1] ?? PASOS_BARRA[0]!
}

/**
 * Todo lo que el dibujo enseña, dicho de corrido: es lo único que llega a
 * quien no lo ve, y por eso nombra los extremos de la sección. Lo demás —lo
 * que se puede tocar— está en la lista de abajo, que basta por sí sola.
 */
function etiquetaDelDibujo(puntos: PuntoSeccion[]): string {
  if (puntos.length === 0) return 'Sección de la calle: todavía sin puntos'

  const primero = puntos[0]!
  const ultimo = puntos[puntos.length - 1]!
  return (
    `Sección de la calle: ${puntos.length} ${puntos.length === 1 ? 'punto' : 'puntos'}, ` +
    `desde ${distanciaEnPalabras(primero.distancia)} hasta ${distanciaEnPalabras(ultimo.distancia)}`
  )
}

/**
 * La sección vista de frente: el eje al centro y cada punto colocado por su
 * distancia, a escala, con la palabra con la que se escribe en la hoja.
 *
 * El rótulo es la palabra y no el nombre largo porque a 0.15 m de separación
 * —un sardinel y su borde— dos nombres enteros se pisan; `palabraDePunto`
 * existe justo para estos rótulos, y cae al nombre largo si el punto todavía
 * no tiene ninguna palabra. Los rótulos van a dos alturas alternas por el
 * mismo motivo.
 *
 * Este dibujo **no** es el único portador del significado: no hay nada aquí
 * que no se pueda leer y cambiar en la lista de puntos.
 */
function DibujoSeccion({ puntos }: { puntos: PuntoSeccion[] }) {
  const alcance = Math.max(1, ...puntos.map((punto) => Math.abs(punto.distancia)))
  const escala = (ANCHO / 2 - MARGEN) / alcance
  const x = (distancia: number) => ANCHO / 2 + distancia * escala

  const paso = pasoDeBarra(escala)
  const primero = puntos[0]
  const ultimo = puntos[puntos.length - 1]

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      role="img"
      aria-label={etiquetaDelDibujo(puntos)}
      className="w-full rounded border border-slate-200 dark:border-slate-800"
    >
      <text x={MARGEN} y={20} className="fill-slate-400 text-[10px]">
        izquierda
      </text>
      <text x={ANCHO - MARGEN} y={20} textAnchor="end" className="fill-slate-400 text-[10px]">
        derecha
      </text>

      <line
        x1={x(0)}
        x2={x(0)}
        y1={30}
        y2={SUELO + 30}
        strokeDasharray="4 4"
        className="stroke-slate-400 dark:stroke-slate-500"
      />

      {primero && ultimo && (
        <line
          x1={x(primero.distancia)}
          x2={x(ultimo.distancia)}
          y1={SUELO}
          y2={SUELO}
          strokeWidth={2}
          className="stroke-marca"
        />
      )}

      {puntos.map((punto, indice) => {
        const arriba = indice % 2 === 0
        const yPalabra = arriba ? SUELO - 24 : SUELO - 44
        const yDistancia = arriba ? SUELO + 20 : SUELO + 36

        return (
          <g key={punto.id}>
            <line
              x1={x(punto.distancia)}
              x2={x(punto.distancia)}
              y1={yPalabra + 4}
              y2={SUELO - 6}
              className="stroke-slate-300 dark:stroke-slate-700"
            />
            <circle cx={x(punto.distancia)} cy={SUELO} r={4.5} className="fill-marca" />
            <text
              x={x(punto.distancia)}
              y={yPalabra}
              textAnchor="middle"
              className="fill-slate-600 text-[10px] dark:fill-slate-300"
            >
              {palabraDePunto(punto)}
            </text>
            <text
              x={x(punto.distancia)}
              y={yDistancia}
              textAnchor="middle"
              className="fill-slate-400 text-[10px]"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {punto.distancia.toFixed(2)}
            </text>
          </g>
        )
      })}

      <line
        x1={MARGEN}
        x2={MARGEN + paso * escala}
        y1={ALTO - 14}
        y2={ALTO - 14}
        className="stroke-slate-400"
      />
      <line x1={MARGEN} x2={MARGEN} y1={ALTO - 18} y2={ALTO - 10} className="stroke-slate-400" />
      <line
        x1={MARGEN + paso * escala}
        x2={MARGEN + paso * escala}
        y1={ALTO - 18}
        y2={ALTO - 10}
        className="stroke-slate-400"
      />
      <text x={MARGEN + (paso * escala) / 2} y={ALTO - 20} textAnchor="middle" className="fill-slate-400 text-[10px]">
        {paso} m
      </text>
    </svg>
  )
}

/**
 * Un punto de la sección con todo lo suyo a mano: cómo se llama, qué es,
 * a qué distancia del eje está y con qué palabras se escribe en la hoja.
 * Esta fila sola —sin mirar el dibujo— basta para declarar la calle entera.
 */
function FilaPunto({ calleId, punto }: { calleId: Id; punto: PuntoSeccion }) {
  const cambiarDistancia = useAlmacen((s) => s.cambiarDistancia)
  const anadirPalabraAPunto = useAlmacen((s) => s.anadirPalabraAPunto)
  const quitarPalabraDePunto = useAlmacen((s) => s.quitarPalabraDePunto)
  const quitarPunto = useAlmacen((s) => s.quitarPunto)
  const [palabraNueva, setPalabraNueva] = useState('')

  function anadir() {
    if (palabraNueva.trim() === '') return
    anadirPalabraAPunto(calleId, punto.id, palabraNueva.trim())
    setPalabraNueva('')
  }

  return (
    <li className="flex flex-col gap-2 rounded border border-slate-300 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">{punto.nombre}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {ETIQUETA_ROL[punto.rol]} · {sitioDelPunto(punto.distancia)}
        </span>
        {punto.rol === 'eje' ? (
          <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
            El eje no se quita: es el que dice qué cae a cada lado.
          </span>
        ) : (
          <button
            type="button"
            aria-label={`Quitar ${punto.nombre} de la sección`}
            onClick={() => quitarPunto(calleId, punto.id)}
            className="ml-auto rounded px-2 py-1 text-sm text-falla hover:bg-red-50 dark:hover:bg-red-950"
          >
            Quitar
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <CampoNumero
          etiqueta="Distancia al eje"
          ariaLabel={`Distancia de ${punto.nombre} al eje`}
          valor={punto.distancia}
          alCambiar={(valor) => cambiarDistancia(calleId, punto.id, valor)}
          decimales={2}
          sufijo="m"
          ancho="w-28"
        />
        <span className="pb-1.5 text-xs text-slate-500 dark:text-slate-400">
          Negativa a la izquierda, positiva a la derecha.
        </span>
        {punto.distanciaDeFabrica && (
          <span className="pb-1.5 text-xs text-aviso">Puesta por la app, todavía sin medir.</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">En la hoja:</span>
        {punto.palabras.map((palabra) => (
          <span
            key={palabra}
            className="flex items-center gap-1 rounded-full border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-700"
          >
            {palabra}
            <button
              type="button"
              aria-label={`Quitar la palabra ${palabra} de ${punto.nombre}`}
              onClick={() => quitarPalabraDePunto(calleId, punto.id, palabra)}
              className="text-slate-400 hover:text-falla"
            >
              ×
            </button>
          </span>
        ))}
        {punto.palabras.length === 0 && (
          <span className="text-xs text-aviso">Sin ninguna palabra no se le busca en la hoja.</span>
        )}
        <input
          type="text"
          aria-label={`Palabra nueva para ${punto.nombre}`}
          placeholder="otra palabra"
          value={palabraNueva}
          onChange={(evento) => setPalabraNueva(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') anadir()
          }}
          className="w-32 rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-marca focus:ring-1 focus:ring-marca dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="button"
          aria-label={`Añadir a ${punto.nombre}`}
          onClick={anadir}
          disabled={palabraNueva.trim() === ''}
          className="rounded bg-marca px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          Añadir
        </button>
      </div>
    </li>
  )
}

/**
 * Para lo que Max mide y no venía de fábrica: un pelo de agua, una cuneta,
 * lo que sea. El eje solo se ofrece si la sección se quedó sin ninguno —hay
 * uno y solo uno, y es el que reparte los lados—.
 */
function FormularioPunto({ calleId, hayEje }: { calleId: Id; hayEje: boolean }) {
  const anadirPunto = useAlmacen((s) => s.anadirPunto)
  const rolesOfrecidos = hayEje ? ROLES.filter((rol) => rol !== 'eje') : ROLES
  const [rol, setRol] = useState<Rol>(rolesOfrecidos[0]!)
  const [distancia, setDistancia] = useState('')
  const [error, setError] = useState<string | null>(null)

  function anadir() {
    const numero = Number(distancia.replace(',', '.'))
    if (distancia.trim() === '' || !Number.isFinite(numero)) {
      setError('Escribe a qué distancia del eje está: negativa a la izquierda, positiva a la derecha.')
      return
    }

    anadirPunto(calleId, rol, numero)
    setDistancia('')
    setError(null)
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold">Añadir un punto</h3>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Qué es</span>
          <select
            aria-label="Qué es el punto nuevo"
            value={rol}
            onChange={(evento) => setRol(evento.target.value as Rol)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {rolesOfrecidos.map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETA_ROL[valor]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">A qué distancia</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label="A qué distancia del eje está"
            placeholder="-2.80"
            value={distancia}
            onChange={(evento) => setDistancia(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter') anadir()
            }}
            className="numerico w-28 rounded border border-slate-300 bg-white px-2 py-1.5 text-right text-sm outline-none focus:border-marca focus:ring-1 focus:ring-marca dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <button
          type="button"
          onClick={anadir}
          className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
        >
          Añadir punto
        </button>
      </div>

      {error && <p className="text-sm text-falla">{error}</p>}
    </section>
  )
}

/**
 * La sección declarada de una calle: lo que Max mide a lo ancho, dibujado, y
 * con qué palabra escribe cada punto en su hoja. Se declara una vez y la
 * importación deja de preguntar, porque ya sabe qué busca.
 */
export default function VistaSeccion({ calleId }: Props) {
  const calle = useAlmacen((s) => s.proyecto.calles.find((c) => c.id === calleId))

  if (!calle) return <p className="p-6 text-sm text-slate-500">Esa calle ya no existe.</p>

  const puntos = ordenadosPorDistancia(calle.seccion.puntos)
  const sinMedir = calle.seccion.puntos.filter((punto) => punto.distanciaDeFabrica).length

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Sección de la calle</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {calle.nombre}: los puntos que mides a lo ancho, y la palabra con la que escribes cada uno en tu
          hoja.
        </p>
      </div>

      {hayDistanciasDeFabrica(calle.seccion) && (
        <p className="rounded border border-aviso bg-aviso/10 px-3 py-2 text-sm text-aviso">
          <strong>Las distancias son las de fábrica.</strong> Las pendientes y el bombeo que salgan de
          ellas son orientativos, no medidos: entre dos puntos, la pendiente solo es de fiar si los dos
          están medidos.{' '}
          <span>
            {sinMedir === 1
              ? 'Queda 1 punto con la distancia puesta por la app.'
              : `Quedan ${sinMedir} puntos con la distancia puesta por la app.`}
          </span>
        </p>
      )}

      <DibujoSeccion puntos={puntos} />

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Puntos</h3>
        {puntos.length === 0 ? (
          <p className="text-sm text-slate-500">Esta sección todavía no tiene ningún punto.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {puntos.map((punto) => (
              <FilaPunto key={punto.id} calleId={calleId} punto={punto} />
            ))}
          </ul>
        )}
      </section>

      <FormularioPunto calleId={calleId} hayEje={calle.seccion.puntos.some((punto) => punto.rol === 'eje')} />
    </div>
  )
}
