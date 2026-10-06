import {
  anadirPalabra,
  hayDistanciasDeFabrica,
  mismaPalabra,
  seccionDeFabrica,
  type Calle,
  type Id,
  type Seccion,
} from '@topo/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { bytesDelArchivo } from '../archivo/bytes'
import { leerCsv, leerPegado, leerXlsx, type HojaLeida } from '../archivo/leerTabla'
import { letraDeColumna } from '../archivo/xlsx'
import VistaPreviaHoja from '../componentes/VistaPreviaHoja'
import { useAlmacen } from '../estado/almacen'
import { cuenta, formatearCota } from '../formato'
import { agruparNoImportado } from '../importar/agrupar'
import { interpretarHoja, type ColumnaSinAsignar } from '../importar/interpretar'

/**
 * Una columna colocada sobre un punto, todavía sin guardar. Se queda con la
 * columna entera y no solo con su palabra: en cuanto se coloca desaparece de
 * `sinAsignar` —el intérprete ya la reconoce— y sin esta copia no habría con
 * qué seguir enseñando su desplegable para corregirla.
 */
interface Asignacion {
  columna: ColumnaSinAsignar
  puntoId: Id
}

/** Lo que entró, para poder decirlo después de aceptar la hoja. */
interface Aceptada {
  calle: string
  progresivas: number
  lecturas: number
  referencias: number
  fuera: number
}

const AVISO_NO_CIERRA =
  'Esta toma no cierra: la hoja trae un solo punto de control y ninguna vuelta, así que las' +
  ' cotas salen, pero no comprobadas.'

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** «detras-del-colegio.xlsx» → «detras-del-colegio», que es lo que se propone como calle. */
function nombreSinExtension(nombre: string): string {
  return nombre.replace(/\.[^.]+$/, '')
}

interface PropsColumnas {
  seccion: Seccion
  /** Las que el intérprete no reconoce ahora mismo. */
  sinColocar: ColumnaSinAsignar[]
  /** Las que ya se colocaron a mano y por eso él sí reconoce. */
  asignaciones: Asignacion[]
  /** Los índices de las columnas que el intérprete acabó colocando de verdad. */
  indicesColocados: number[]
  alColocar: (columna: ColumnaSinAsignar, puntoId: Id) => void
}

/**
 * Las columnas que la sección no reconocía, con sus valores y un desplegable
 * de los puntos para colocarlas. Es la última red: una columna que no case con
 * ninguna palabra nunca se descarta en silencio.
 *
 * Las ya colocadas **siguen aquí**, con su punto elegido a la vista. Si no, un
 * clic en el punto equivocado no tendría vuelta atrás: la columna desaparece de
 * la lista en cuanto se coloca, y la palabra se guardaría mal al aceptar.
 */
function ColumnasSinColocar({
  seccion,
  sinColocar,
  asignaciones,
  indicesColocados,
  alColocar,
}: PropsColumnas) {
  const puntos = [...seccion.puntos].sort((a, b) => a.distancia - b.distancia)
  const yaElegidas = new Set(asignaciones.map((puesta) => puesta.columna.indice))

  // Una colocación puede no cuajar —el punto elegido está al otro lado del eje,
  // o ya cayó otra columna en él—, y entonces el intérprete devuelve la columna
  // a las que no reconoce mientras aquí sigue elegida. Sin este filtro saldría
  // dos veces, con dos desplegables llamados igual y dos llaves repetidas.
  const todas = [
    ...asignaciones.map((puesta) => puesta.columna),
    ...sinColocar.filter((columna) => !yaElegidas.has(columna.indice)),
  ].sort((a, b) => a.indice - b.indice)

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold">Columnas que no reconocí</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Dime a qué punto va cada una. Al aceptar la hoja, su palabra queda guardada en la sección de
        la calle y la próxima vez ya no habrá que decirlo. Mientras no aceptes, puedes cambiarlas.
      </p>

      <ul className="flex flex-col gap-2">
        {todas.map((columna) => {
          const puesta = asignaciones.find((a) => a.columna.indice === columna.indice)

          return (
            <li
              key={columna.indice}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-slate-300 p-3 dark:border-slate-700"
            >
              <span className="font-semibold">{columna.palabra}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                columna {letraDeColumna(columna.indice)}
              </span>
              <span className="numerico text-xs text-slate-500 dark:text-slate-400">
                {columna.muestra.join(' · ')}…
              </span>
              {!columna.traeNumeros && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Sin ningún número dentro: no impide aceptar la hoja.
                </span>
              )}
              {puesta && !indicesColocados.includes(columna.indice) && (
                // El motivo no se deduce aquí para no reescribir por segunda vez
                // la regla de los lados, que es del intérprete: se dice el hecho,
                // que es cierto, y las dos causas que lo explican.
                <span className="text-xs text-aviso">
                  Con ese punto la columna no llegó a colocarse. Suele ser porque el punto está al
                  otro lado del eje que la columna, o porque otra columna ya cayó en él.
                </span>
              )}

              <select
                aria-label={`Dónde va la columna ${columna.palabra}`}
                value={puesta?.puntoId ?? ''}
                onChange={(evento) => alColocar(columna, evento.target.value)}
                className="ml-auto rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Elige un punto…</option>
                {puntos.map((punto) => (
                  <option key={punto.id} value={punto.id}>
                    {punto.nombre}
                  </option>
                ))}
              </select>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * La pantalla por la que entra el trabajo de campo: se sube el archivo o se
 * pegan las celdas —los dos caminos acaban en el mismo sitio—, se dice a qué
 * calle va, y se ve todo lo que la app entendió **y lo que no** antes de
 * aceptar nada.
 *
 * La regla que manda aquí: nada entra en el proyecto hasta que se confirma, y
 * lo que no se entendió se enseña con su contenido. Un archivo con una columna
 * corrida entraría sin ruido y daría cotas equivocadas que nadie vería hasta la
 * obra. Las tres únicas escrituras al almacén están dentro de `aceptar()`.
 */
export default function VistaSubirDatos() {
  const proyecto = useAlmacen((s) => s.proyecto)
  const agregarCalle = useAlmacen((s) => s.agregarCalle)
  const anadirPalabraAPunto = useAlmacen((s) => s.anadirPalabraAPunto)
  const importarHoja = useAlmacen((s) => s.importarHoja)
  const irA = useAlmacen((s) => s.irA)

  // El campo de archivo se vacía antes de cada lectura y al aceptar: si
  // conservara el archivo, volver a elegir el mismo —para rehacer una
  // colocación, o para meterlo en otra calle— no dispararía ningún cambio y
  // parecería que la app no responde.
  const entradaArchivo = useRef<HTMLInputElement>(null)

  const [hoja, setHoja] = useState<HojaLeida | null>(null)
  const [hojasDelLibro, setHojasDelLibro] = useState<HojaLeida[]>([])
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pegado, setPegado] = useState('')
  const [nombreCalle, setNombreCalle] = useState('')
  /** El que salió del nombre del archivo, para saber si Max lo cambió después. */
  const [nombrePropuesto, setNombrePropuesto] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [capaElegida, setCapaElegida] = useState('')
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [aceptada, setAceptada] = useState<Aceptada | null>(null)

  const calleDestino: Calle | undefined = proyecto.calles.find(
    (calle) => nombreCalle.trim() !== '' && mismaPalabra(calle.nombre, nombreCalle),
  )
  const calleDestinoId = calleDestino?.id ?? null

  useEffect(() => {
    // Cambiar de calle cambia la sección con la que se lee la hoja, y los
    // puntos elegidos pueden no existir en la nueva: se empieza de cero en vez
    // de arrastrar una colocación que ya no significa lo mismo.
    setAsignaciones([])
  }, [calleDestinoId])

  // La sección de la calle destino, o la de fábrica si la calle es nueva: una
  // hoja siempre se puede leer aunque no se haya declarado nada todavía.
  const seccionGuardada = useMemo(() => calleDestino?.seccion ?? seccionDeFabrica(), [calleDestino])

  // Lo que se ve es el resultado de verdad, no una promesa: cada columna que se
  // coloca entra en la sección con la que se vuelve a leer la hoja entera, y de
  // ahí pueden salir conflictos que antes no estaban.
  const seccion = useMemo(
    () =>
      asignaciones.reduce(
        (parcial, puesta) => anadirPalabra(parcial, puesta.puntoId, puesta.columna.palabra),
        seccionGuardada,
      ),
    [seccionGuardada, asignaciones],
  )

  const leida = useMemo(() => (hoja ? interpretarHoja(hoja, seccion) : null), [hoja, seccion])

  const sinColocarMedidas = (leida?.sinAsignar ?? []).filter((columna) => columna.traeNumeros)

  const bm = proyecto.bms[0]
  const capaId = proyecto.capas.some((capa) => capa.id === capaElegida)
    ? capaElegida
    : (proyecto.capas[0]?.id ?? '')

  const impedimentos: string[] = []
  if (nombreCalle.trim() === '') {
    impedimentos.push(
      'Dime a qué calle va esta hoja: la sección con la que se lee es la de la calle.',
    )
  }
  if (!bm) {
    impedimentos.push(
      'Hace falta un banco de nivel en el proyecto: es lo que le da cota al punto de control.' +
        ' Créalo en la pantalla de Proyecto.',
    )
  }
  if (capaId === '') {
    impedimentos.push('Hace falta una capa en el proyecto para decir qué se midió.')
  }
  if (sinColocarMedidas.length > 0) {
    impedimentos.push(
      `Hay ${cuenta(sinColocarMedidas.length, 'columna', 'columnas')} sin colocar con lecturas` +
        ' dentro: colócalas antes de aceptar la hoja, porque dejar fuera una columna medida es' +
        ' perder trabajo de campo sin que se note.',
    )
  }
  if (leida && leida.lecturas.length === 0) {
    impedimentos.push(
      'No saqué ni una lectura de esta hoja. Comprueba que sea la hoja correcta, o escribe en la' +
        ' sección de la calle las palabras con las que anotaste cada punto.',
    )
  }

  const puedeAceptar = leida !== null && impedimentos.length === 0

  /** Estrena una hoja: la anterior y lo que se hubiera colocado sobre ella se van con ella. */
  function estrenar(nueva: HojaLeida) {
    setHoja(nueva)
    setAsignaciones([])
    setAceptada(null)
  }

  function olvidarLaHoja() {
    setHoja(null)
    setHojasDelLibro([])
    setAsignaciones([])
  }

  /** Deja el campo de archivo vacío para que elegir el mismo otra vez sí cuente. */
  function vaciarElCampoDeArchivo() {
    if (entradaArchivo.current) entradaArchivo.current.value = ''
  }

  async function cargarArchivo(archivo: File) {
    setLeyendo(true)
    setError(null)
    vaciarElCampoDeArchivo()

    try {
      const esCsv = /\.csv$/i.test(archivo.name)
      const esXlsx = /\.xlsx$/i.test(archivo.name)
      // Se mira el nombre antes de leer nada: no tiene sentido tragarse un
      // archivo entero para después decir que no se sabe leerlo.
      if (!esCsv && !esXlsx) {
        throw new Error(
          `No sé leer «${archivo.name}». Sube un archivo .xlsx o .csv, o pega las celdas aquí abajo.`,
        )
      }

      const datos = await bytesDelArchivo(archivo)
      const leidas = esCsv
        ? [leerCsv(new TextDecoder().decode(datos), nombreSinExtension(archivo.name))]
        : leerXlsx(datos)

      setHojasDelLibro(leidas)
      estrenar(leidas[0]!)
      setPegado('')
      setNombreCalle(nombreSinExtension(archivo.name))
      setNombrePropuesto(nombreSinExtension(archivo.name))
    } catch (fallo) {
      // Nada del proyecto se ha tocado: lo único que hay es un archivo que no
      // se pudo leer, y se dice cuál y por qué.
      olvidarLaHoja()
      setError((fallo as Error).message)
    } finally {
      setLeyendo(false)
    }
  }

  function cargarPegado(texto: string) {
    setPegado(texto)
    setError(null)
    // El archivo de antes ya no es la fuente de lo que se ve. Se suelta el
    // campo, y con él el nombre de calle que había salido de su nombre —pero
    // solo si Max no lo cambió: lo que él escribió no se le borra.
    vaciarElCampoDeArchivo()
    if (nombrePropuesto !== '' && nombreCalle === nombrePropuesto) {
      setNombreCalle('')
      setNombrePropuesto('')
    }

    if (texto.trim() === '') {
      olvidarLaHoja()
      return
    }

    try {
      const leidas = leerPegado(texto, 'Celdas pegadas')
      setHojasDelLibro([])
      estrenar(leidas)
    } catch (fallo) {
      olvidarLaHoja()
      setError((fallo as Error).message)
    }
  }

  function colocarColumna(columna: ColumnaSinAsignar, puntoId: Id) {
    setAsignaciones((antes) => {
      const resto = antes.filter((puesta) => puesta.columna.indice !== columna.indice)
      return puntoId === '' ? resto : [...resto, { columna, puntoId }]
    })
  }

  function aceptar() {
    if (!leida || !puedeAceptar) return

    const nombre = nombreCalle.trim()
    // Aquí es donde el proyecto cambia por primera vez: la calle si es nueva,
    // las palabras que se colocaron, y la toma. Fuera de estas tres líneas esta
    // pantalla no escribe nada.
    const calleId = calleDestinoId ?? agregarCalle({ nombre, rasante: null })
    for (const puesta of asignaciones) {
      anadirPalabraAPunto(calleId, puesta.puntoId, puesta.columna.palabra)
    }
    importarHoja(calleId, leida, fecha, capaId)

    setAceptada({
      calle: nombre,
      progresivas: new Set(leida.lecturas.map((lectura) => lectura.progresiva)).size,
      lecturas: leida.lecturas.length,
      referencias: leida.referencias.length,
      fuera: agruparNoImportado(leida.noImportado).length,
    })
    setHoja(null)
    setHojasDelLibro([])
    setAsignaciones([])
    setPegado('')
    vaciarElCampoDeArchivo()
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Subir datos</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sube tu hoja de campo o pega las celdas: las dos cosas se leen igual. Antes de aceptar nada
          verás qué entendí y qué no.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded border border-slate-300 p-4 dark:border-slate-700">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Subir el archivo de la hoja (.xlsx o .csv)</span>
          <input
            ref={entradaArchivo}
            type="file"
            accept=".xlsx,.csv"
            onChange={(evento) => {
              const archivo = evento.target.files?.[0]
              if (archivo) void cargarArchivo(archivo)
            }}
            className="text-sm"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            Pegar aquí las celdas copiadas de Excel o de Google Sheets
          </span>
          <textarea
            value={pegado}
            onChange={(evento) => cargarPegado(evento.target.value)}
            rows={3}
            placeholder="Copia las celdas y pégalas aquí"
            className="rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:border-marca focus:ring-1 focus:ring-marca dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        {leyendo && <p className="text-sm text-slate-500">Leyendo el archivo…</p>}
        {error && (
          <p className="rounded border border-falla bg-red-50 px-3 py-2 text-sm text-falla dark:bg-red-950">
            {error}
          </p>
        )}
      </section>

      {aceptada && (
        <section className="flex flex-col gap-2 rounded border border-pasa bg-pasa/10 px-3 py-2 text-sm">
          <p>
            <strong>Hoja aceptada</strong> en {aceptada.calle}:{' '}
            {cuenta(aceptada.progresivas, 'progresiva', 'progresivas')},{' '}
            {cuenta(aceptada.lecturas, 'lectura', 'lecturas')} y{' '}
            {cuenta(aceptada.referencias, 'referencia', 'referencias')}.
          </p>
          <p className="text-aviso">{AVISO_NO_CIERRA}</p>
          {aceptada.fuera > 0 && (
            <p className="text-slate-600 dark:text-slate-300">
              Quedaron fuera {cuenta(aceptada.fuera, 'cosa', 'cosas')}, que no entraron en el
              proyecto. Vuelve a subir la hoja si quieres repasarlas.
            </p>
          )}
          <div>
            <button
              type="button"
              onClick={() => irA('libreta')}
              className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
            >
              Ver la libreta
            </button>
          </div>
        </section>
      )}

      <section className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">¿A qué calle va esta hoja?</span>
          <input
            type="text"
            list="calles-de-la-obra"
            value={nombreCalle}
            onChange={(evento) => setNombreCalle(evento.target.value)}
            placeholder="Nombre de la calle"
            className="w-64 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-marca focus:ring-1 focus:ring-marca dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <datalist id="calles-de-la-obra">
          {proyecto.calles.map((calle) => (
            <option key={calle.id} value={calle.nombre} />
          ))}
        </datalist>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Fecha de la toma</span>
          <input
            type="date"
            value={fecha}
            onChange={(evento) => setFecha(evento.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Capa que se midió</span>
          <select
            value={capaId}
            onChange={(evento) => setCapaElegida(evento.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {proyecto.capas.map((capa) => (
              <option key={capa.id} value={capa.id}>
                {capa.nombre}
              </option>
            ))}
          </select>
        </label>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          {calleDestino
            ? 'La calle ya existe: esta hoja se añade a lo que ya tiene, sin pisar nada.'
            : 'La calle es nueva: nace con la sección de fábrica, que puedes ajustar después.'}
        </p>
      </section>

      {hojasDelLibro.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Qué hoja del libro</span>
          <select
            value={hoja?.nombre ?? ''}
            onChange={(evento) => {
              const elegida = hojasDelLibro.find((h) => h.nombre === evento.target.value)
              if (elegida) estrenar(elegida)
            }}
            className="w-64 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {hojasDelLibro.map((h) => (
              <option key={h.nombre} value={h.nombre}>
                {h.nombre}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            El libro trae {hojasDelLibro.length} hojas. Solo se lee la que elijas.
          </span>
        </label>
      )}

      {leida && (
        <div className="flex flex-col gap-6">
          <VistaPreviaHoja leida={leida} seccion={seccion} />

          {(leida.sinAsignar.length > 0 || asignaciones.length > 0) && (
            <ColumnasSinColocar
              seccion={seccion}
              sinColocar={leida.sinAsignar}
              asignaciones={asignaciones}
              indicesColocados={leida.columnas.map((columna) => columna.indice)}
              alColocar={colocarColumna}
            />
          )}

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">Antes de aceptar</h3>

            {hayDistanciasDeFabrica(seccion) && (
              <p className="rounded border border-aviso bg-aviso/10 px-3 py-2 text-sm text-aviso">
                <strong>Las distancias son las de fábrica.</strong> Las puso la app, no las mediste
                tú: las pendientes y el bombeo que salgan de esta hoja son orientativos hasta que las
                midas en la pantalla de la sección.
              </p>
            )}

            <p className="rounded border border-aviso bg-aviso/10 px-3 py-2 text-sm text-aviso">
              {AVISO_NO_CIERRA}
            </p>

            {bm && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Las cotas de esta hoja se cuelgan de {bm.nombre}, cota {formatearCota(bm.cota)}. Es el
                primer banco de nivel del proyecto: la app todavía no deja elegir otro.
              </p>
            )}

            {impedimentos.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm text-falla">
                {impedimentos.map((impedimento) => (
                  <li key={impedimento}>{impedimento}</li>
                ))}
              </ul>
            )}

            <div>
              <button
                type="button"
                onClick={aceptar}
                disabled={!puedeAceptar}
                className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                Importar la hoja
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
