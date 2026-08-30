import {
  esPalabraDe,
  ETIQUETA_ROL,
  hayDistanciasDeFabrica,
  ladoDe,
  ROLES,
  type Id,
  type PuntoSeccion,
  type Rol,
} from '@topo/core'
import { useState } from 'react'
import CampoNumero from '../componentes/CampoNumero'
import DibujoSeccion from '../componentes/DibujoSeccion'
import { useAlmacen, type ListaDePalabras } from '../estado/almacen'

interface Props {
  calleId: Id
}

/**
 * Las tres palabras de la hoja que no son puntos de la sección. El nombre en
 * minúscula es el que entra en los textos accesibles —«Palabra nueva para la
 * progresiva»—, así que está escrito para que suene bien detrás de «para»,
 * «a» y «de».
 */
const LISTAS_SUELTAS: {
  lista: ListaDePalabras
  titulo: string
  nombre: string
  ayuda: string
  avisoSinPalabras: string
}[] = [
  {
    lista: 'progresiva',
    titulo: 'La progresiva',
    nombre: 'la progresiva',
    ayuda: 'La columna donde escribes 0+000, 10, 20…',
    avisoSinPalabras: 'Sin ninguna palabra habrá que adivinar cuál es esa columna.',
  },
  {
    lista: 'puntoControl',
    titulo: 'Los puntos de control',
    nombre: 'los puntos de control',
    ayuda: 'Lo que escribes junto a la lectura de la vista atrás: PC, BM…',
    avisoSinPalabras: 'Sin ninguna palabra no se sabrá cuál es la vista atrás.',
  },
  {
    lista: 'referencia',
    titulo: 'Las filas de referencia',
    nombre: 'las filas de referencia',
    ayuda: 'Lo que abre una fila que no es una progresiva sino algo existente: una cuneta, una calzada.',
    avisoSinPalabras: 'Sin ninguna palabra no se reconocerá ninguna fila de referencia.',
  },
]

/** De izquierda a derecha, que es como se ve la calle desde la progresiva. */
function ordenadosPorDistancia(puntos: PuntoSeccion[]): PuntoSeccion[] {
  return [...puntos].sort((a, b) => a.distancia - b.distancia)
}

/** Dónde está el punto, para leerlo al lado de su elemento. */
function sitioDelPunto(distancia: number): string {
  const lado = ladoDe(distancia)
  if (lado === 'eje') return 'el centro de la calle'
  return `lado ${lado === 'izquierda' ? 'izquierdo' : 'derecho'}`
}

interface PropsFichas {
  /**
   * Cómo se nombra este grupo dentro de los textos accesibles: «Vereda
   * izquierda», «la progresiva». Va detrás de «para», de «a» y de «de», así
   * que se escribe pensando en las tres.
   */
  nombre: string
  palabras: string[]
  /** Qué se pierde si este grupo se queda sin ninguna palabra. */
  avisoSinPalabras: string
  alAnadir: (palabra: string) => void
  alQuitar: (palabra: string) => void
}

/**
 * Con qué palabras se escribe algo en la hoja: las que ya están, cada una
 * con su equis, y un campo para añadir otra. Lo usan igual los puntos de la
 * sección y las tres palabras que no son puntos.
 */
function FichasDePalabras({ nombre, palabras, avisoSinPalabras, alAnadir, alQuitar }: PropsFichas) {
  const [nueva, setNueva] = useState('')
  const [yaEstaba, setYaEstaba] = useState(false)

  function anadir() {
    const limpia = nueva.trim()
    if (limpia === '') return

    if (esPalabraDe(palabras, limpia)) {
      // Nada se descarta en silencio. Y lo escrito se queda en el campo: si
      // desapareciera, no habría manera de saber qué fue lo que no entró.
      setYaEstaba(true)
      return
    }

    alAnadir(limpia)
    setNueva('')
    setYaEstaba(false)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {palabras.map((palabra) => (
          <span
            key={palabra}
            className="flex items-center gap-1 rounded-full border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-700"
          >
            {palabra}
            <button
              type="button"
              aria-label={`Quitar la palabra ${palabra} de ${nombre}`}
              onClick={() => alQuitar(palabra)}
              className="text-slate-400 hover:text-falla"
            >
              ×
            </button>
          </span>
        ))}
        {palabras.length === 0 && <span className="text-xs text-aviso">{avisoSinPalabras}</span>}
        <input
          type="text"
          aria-label={`Palabra nueva para ${nombre}`}
          placeholder="palabra nueva"
          value={nueva}
          onChange={(evento) => {
            setNueva(evento.target.value)
            setYaEstaba(false)
          }}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') anadir()
          }}
          className="w-32 rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-marca focus:ring-1 focus:ring-marca dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="button"
          aria-label={`Añadir a ${nombre}`}
          onClick={anadir}
          disabled={nueva.trim() === ''}
          className="rounded bg-marca px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          Añadir
        </button>
      </div>

      {yaEstaba && <p className="text-xs text-aviso">Esa palabra ya está en {nombre}.</p>}
    </div>
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
  const esEje = punto.rol === 'eje'

  return (
    <li className="flex flex-col gap-2 rounded border border-slate-300 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">{punto.nombre}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {ETIQUETA_ROL[punto.rol]} · {sitioDelPunto(punto.distancia)}
        </span>
        {esEje ? (
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
          ariaLabel={`Distancia al eje de ${punto.nombre}`}
          valor={punto.distancia}
          alCambiar={(valor) => cambiarDistancia(calleId, punto.id, valor)}
          decimales={2}
          sufijo="m"
          ancho="w-28"
          // El eje es el origen: su distancia no se escribe, se confirma.
          soloLectura={esEje}
          // Medir es un acto: el cambio se cierra al salir del campo o con
          // Enter, nunca por rozarlo. Marcar una distancia como medida no se
          // deshace, y una tecla suelta no puede tener esa consecuencia.
          confirmarAlSalir
        />
        <span className="pb-1.5 text-xs text-slate-500 dark:text-slate-400">
          {esEje
            ? 'El eje es el origen de las distancias: siempre 0.'
            : 'Negativa a la izquierda, positiva a la derecha.'}
        </span>
        {punto.distanciaDeFabrica && (
          <>
            <span className="pb-1.5 text-xs text-aviso">Puesta por la app, todavía sin medir.</span>
            <button
              type="button"
              aria-label={`Confirmar la distancia de ${punto.nombre}`}
              onClick={() => cambiarDistancia(calleId, punto.id, punto.distancia)}
              className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:border-marca dark:border-slate-700"
            >
              Confirmar
            </button>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <span className="pt-1 text-xs font-medium text-slate-500 dark:text-slate-400">En la hoja:</span>
        <FichasDePalabras
          nombre={punto.nombre}
          palabras={punto.palabras}
          avisoSinPalabras="Sin ninguna palabra no se le busca en la hoja."
          alAnadir={(palabra) => anadirPalabraAPunto(calleId, punto.id, palabra)}
          alQuitar={(palabra) => quitarPalabraDePunto(calleId, punto.id, palabra)}
        />
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

/** Las tres palabras de la hoja que no se dibujan pero también hay que reconocer. */
function PalabrasSueltas({ calleId }: { calleId: Id }) {
  const seccion = useAlmacen((s) => s.proyecto.calles.find((c) => c.id === calleId)?.seccion)
  const anadirPalabraSuelta = useAlmacen((s) => s.anadirPalabraSuelta)
  const quitarPalabraSuelta = useAlmacen((s) => s.quitarPalabraSuelta)

  if (!seccion) return null

  const palabrasDe: Record<ListaDePalabras, string[]> = {
    progresiva: seccion.palabrasProgresiva,
    puntoControl: seccion.palabrasPuntoControl,
    referencia: seccion.palabrasReferencia,
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">Palabras que no son puntos</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Estas tres no se dibujan en la sección, pero también están en la hoja y hay que reconocerlas.
        </p>
      </div>

      {LISTAS_SUELTAS.map((grupo) => (
        <div
          key={grupo.lista}
          className="flex flex-col gap-2 rounded border border-slate-300 p-3 dark:border-slate-700"
        >
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-semibold">{grupo.titulo}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{grupo.ayuda}</span>
          </div>
          <FichasDePalabras
            nombre={grupo.nombre}
            palabras={palabrasDe[grupo.lista]}
            avisoSinPalabras={grupo.avisoSinPalabras}
            alAnadir={(palabra) => anadirPalabraSuelta(calleId, grupo.lista, palabra)}
            alQuitar={(palabra) => quitarPalabraSuelta(calleId, grupo.lista, palabra)}
          />
        </div>
      ))}
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

      <PalabrasSueltas calleId={calleId} />
    </div>
  )
}
