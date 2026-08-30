import {
  anadirPalabra,
  hayDistanciasDeFabrica,
  ladoDe,
  mismaPalabra,
  seccionDeFabrica,
  type Calle,
  type Id,
  type PuntoSeccion,
  type Seccion,
} from '@topo/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { leerCsv, leerPegado, leerXlsx, type HojaLeida } from '../archivo/leerTabla'
import { letraDeColumna } from '../archivo/xlsx'
import DibujoSeccion from '../componentes/DibujoSeccion'
import { useAlmacen } from '../estado/almacen'
import {
  interpretarHoja,
  type ColumnaSinAsignar,
  type HojaInterpretada,
  type NoImportado,
} from '../importar/interpretar'

/** Una columna que se ha decidido colocar sobre un punto, sin guardarla todavía. */
interface Asignacion {
  puntoId: Id
  palabra: string
}

/** Lo que quedó fuera, contado una sola vez y con todos sus motivos juntos. */
interface CosaNoImportada {
  valor: string
  veces: number
  motivos: string[]
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
  ' cotas salen pero quedan sin comprobar.'

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Los bytes de un archivo elegido en el navegador.
 *
 * Se leen con `FileReader` y no con `archivo.arrayBuffer()` porque el segundo
 * no existe en el entorno donde corren las pruebas, y un camino de entrada que
 * no se puede probar es un camino sin red. `FileReader` está en todos los
 * navegadores desde hace años y hace exactamente lo mismo.
 */
function bytesDelArchivo(archivo: File): Promise<Uint8Array> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => resolver(new Uint8Array(lector.result as ArrayBuffer))
    lector.onerror = () =>
      rechazar(
        new Error('No se pudo leer el archivo: el navegador no lo dejó abrir. Inténtalo otra vez.'),
      )
    lector.readAsArrayBuffer(archivo)
  })
}

/** «detras-del-colegio.xlsx» → «detras-del-colegio», que es lo que se propone como calle. */
function nombreSinExtension(nombre: string): string {
  return nombre.replace(/\.[^.]+$/, '')
}

/** El lado dicho en palabras, que es como se lee una sección: el signo no se lee. */
function ladoEnPalabras(distancia: number): string {
  const lado = ladoDe(distancia)
  if (lado === 'eje') return 'en el eje'
  return `a ${Math.abs(distancia).toFixed(2)} m a la ${lado}`
}

/** Si en una celda hay escrito un número suelto, con coma o con punto. */
function esNumero(texto: string): boolean {
  return /^-?\d+([.,]\d+)?$/.test(texto.trim())
}

/**
 * Una columna sin colocar trae lecturas si alguno de sus valores es un
 * número. Es la que no se puede dejar fuera: perderla sería perder trabajo de
 * campo. Una columna de puro texto —una nota, una observación— se enseña
 * igual y se puede colocar, pero no bloquea.
 */
function traeLecturas(columna: ColumnaSinAsignar): boolean {
  return columna.muestra.some(esNumero)
}

/**
 * Junta lo no importado por su contenido, no por el camino que lo dejó fuera.
 *
 * El intérprete puede nombrar el mismo valor dos veces —una porque su columna
 * entera se quedó fuera, y otra porque su fila tampoco entró—, y los ceros
 * arrastrados del archivo de Max salen justo por esos dos caminos. No se
 * pierde nada, se dice de más; pero repetido en pantalla parece desorden y
 * tapa lo demás. Aquí cada valor sale una vez, con todos sus motivos.
 *
 * Las veces son las del camino que más lo vio, no la suma de los dos: son las
 * mismas celdas contadas dos veces, y sumarlas diría que hay el doble.
 */
function agruparNoImportado(entradas: NoImportado[]): CosaNoImportada[] {
  const porValor = new Map<string, CosaNoImportada>()

  for (const entrada of entradas) {
    const vecesEnEstaEntrada = new Map<string, number>()
    for (const valor of entrada.contenido) {
      vecesEnEstaEntrada.set(valor, (vecesEnEstaEntrada.get(valor) ?? 0) + 1)
    }

    for (const [valor, veces] of vecesEnEstaEntrada) {
      const cosa = porValor.get(valor)
      if (!cosa) {
        porValor.set(valor, { valor, veces, motivos: [entrada.que] })
        continue
      }

      cosa.veces = Math.max(cosa.veces, veces)
      if (!cosa.motivos.includes(entrada.que)) cosa.motivos.push(entrada.que)
    }
  }

  return [...porValor.values()]
}

/**
 * Los puntos tal como se dibujan en la vista previa: de izquierda a derecha, y
 * los que recibieron columna rotulados con la palabra que traía la hoja, no
 * con la suya. Así se ve de un vistazo qué cayó dónde, que es lo primero que
 * pide el spec antes de aceptar.
 */
function puntosDelDibujo(seccion: Seccion, leida: HojaInterpretada | null): PuntoSeccion[] {
  const palabraPorPunto = new Map((leida?.columnas ?? []).map((col) => [col.puntoId, col.palabra]))

  return [...seccion.puntos]
    .sort((a, b) => a.distancia - b.distancia)
    .map((punto) => {
      const palabra = palabraPorPunto.get(punto.id)
      return palabra ? { ...punto, palabras: [palabra] } : punto
    })
}

/** «7 progresivas», «1 progresiva»: sin plural falso, que se lee como un descuido. */
function cuenta(cuantas: number, singular: string, plural: string): string {
  return `${cuantas} ${cuantas === 1 ? singular : plural}`
}

interface PropsColumnas {
  seccion: Seccion
  columnas: ColumnaSinAsignar[]
  asignaciones: Asignacion[]
  alAsignar: (columna: ColumnaSinAsignar, puntoId: Id) => void
}

/**
 * Las columnas que la sección no reconoce, con sus valores y un desplegable
 * de los puntos para colocarlas ahí mismo. Es la última red: una columna que
 * no case con ninguna palabra nunca se descarta en silencio.
 */
function ColumnasSinColocar({ seccion, columnas, asignaciones, alAsignar }: PropsColumnas) {
  const ordenados = [...seccion.puntos].sort((a, b) => a.distancia - b.distancia)

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold">Columnas que no reconocí</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Dime a qué punto va cada una. Al aceptar la hoja, su palabra queda guardada en la sección de la
        calle y la próxima vez ya no habrá que decirlo.
      </p>

      <ul className="flex flex-col gap-2">
        {columnas.map((columna) => {
          const puesta = asignaciones.find((a) => a.palabra === columna.palabra)

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
              {!traeLecturas(columna) && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Sin números dentro: no impide aceptar la hoja.
                </span>
              )}

              <select
                aria-label={`Dónde va la columna ${columna.palabra}`}
                value={puesta?.puntoId ?? ''}
                onChange={(evento) => alAsignar(columna, evento.target.value)}
                className="ml-auto rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Elige un punto…</option>
                {ordenados.map((punto) => (
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
 * corrida entraría sin ruido y daría cotas equivocadas que nadie vería hasta
 * la obra.
 */
export default function VistaSubirDatos() {
  const proyecto = useAlmacen((s) => s.proyecto)
  const agregarCalle = useAlmacen((s) => s.agregarCalle)
  const anadirPalabraAPunto = useAlmacen((s) => s.anadirPalabraAPunto)
  const importarHoja = useAlmacen((s) => s.importarHoja)
  const irA = useAlmacen((s) => s.irA)

  // El campo de archivo se vacía al aceptar: si conservara el archivo, volver
  // a elegir el mismo —la misma hoja en otra calle, que es corriente— no
  // dispararía ningún cambio y parecería que la app no responde.
  const entradaArchivo = useRef<HTMLInputElement>(null)

  const [hoja, setHoja] = useState<HojaLeida | null>(null)
  const [hojasDelLibro, setHojasDelLibro] = useState<HojaLeida[]>([])
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pegado, setPegado] = useState('')
  const [nombreCalle, setNombreCalle] = useState('')
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
  const seccionGuardada = useMemo(
    () => calleDestino?.seccion ?? seccionDeFabrica(),
    [calleDestino],
  )

  // Lo que se ve es el resultado de verdad, no una promesa: cada columna que
  // se coloca entra en la sección con la que se vuelve a leer la hoja entera,
  // y de ahí pueden salir conflictos que antes no estaban.
  const seccion = useMemo(
    () =>
      asignaciones.reduce(
        (parcial, asignacion) => anadirPalabra(parcial, asignacion.puntoId, asignacion.palabra),
        seccionGuardada,
      ),
    [seccionGuardada, asignaciones],
  )

  const leida = useMemo(() => (hoja ? interpretarHoja(hoja, seccion) : null), [hoja, seccion])

  const progresivas = leida ? new Set(leida.lecturas.map((l) => l.progresiva)).size : 0
  const puntosMedidos = leida ? new Set(leida.lecturas.map((l) => l.puntoId)).size : 0
  const noImportado = useMemo(() => agruparNoImportado(leida?.noImportado ?? []), [leida])
  const sinColocarConLecturas = (leida?.sinAsignar ?? []).filter(traeLecturas)

  const bm = proyecto.bms[0]
  const capaId = proyecto.capas.some((capa) => capa.id === capaElegida)
    ? capaElegida
    : (proyecto.capas[0]?.id ?? '')

  const impedimentos: string[] = []
  if (nombreCalle.trim() === '') {
    impedimentos.push('Dime a qué calle va esta hoja: la sección con la que se lee es la de la calle.')
  }
  if (!bm) {
    impedimentos.push(
      'Hace falta un banco de nivel en el proyecto: es lo que le da cota a la vista atrás.' +
        ' Créalo en la pantalla de Proyecto.',
    )
  }
  if (capaId === '') {
    impedimentos.push('Hace falta una capa en el proyecto para decir qué se midió.')
  }
  if (sinColocarConLecturas.length > 0) {
    impedimentos.push(
      `Hay ${cuenta(sinColocarConLecturas.length, 'columna', 'columnas')} sin colocar con lecturas` +
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

  async function cargarArchivo(archivo: File) {
    setLeyendo(true)
    setError(null)

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
      const resto = antes.filter((a) => a.palabra !== columna.palabra)
      return puntoId === '' ? resto : [...resto, { puntoId, palabra: columna.palabra }]
    })
  }

  function aceptar() {
    if (!leida || !puedeAceptar) return

    const nombre = nombreCalle.trim()
    // Aquí es donde el proyecto cambia por primera vez, y de una sola vez: la
    // calle si es nueva, las palabras que se colocaron, y la toma.
    const calleId = calleDestinoId ?? agregarCalle({ nombre, rasante: null })
    for (const asignacion of asignaciones) {
      anadirPalabraAPunto(calleId, asignacion.puntoId, asignacion.palabra)
    }
    importarHoja(calleId, leida, fecha, capaId)

    setAceptada({
      calle: nombre,
      progresivas,
      lecturas: leida.lecturas.length,
      referencias: leida.referencias.length,
      fuera: noImportado.length,
    })
    setHoja(null)
    setHojasDelLibro([])
    setAsignaciones([])
    setPegado('')
    if (entradaArchivo.current) entradaArchivo.current.value = ''
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
              Quedaron fuera {cuenta(aceptada.fuera, 'cosa', 'cosas')}, que no entraron en el proyecto.
              Vuelve a subir la hoja si quieres repasarlas.
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
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">Qué columna cayó en qué punto</h3>
            <DibujoSeccion puntos={puntosDelDibujo(seccion, leida)} />
            <ul className="flex flex-col gap-1 text-sm">
              {[...seccion.puntos]
                .sort((a, b) => a.distancia - b.distancia)
                .map((punto) => {
                  const columna = leida.columnas.find((col) => col.puntoId === punto.id)
                  return (
                    <li key={punto.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{punto.nombre}</span>
                      {columna ? (
                        <span className="text-slate-500 dark:text-slate-400">
                          escrito «{columna.palabra}» en la columna {letraDeColumna(columna.indice)},{' '}
                          {ladoEnPalabras(punto.distancia)}
                        </span>
                      ) : (
                        <span className="text-slate-400">sin columna en esta hoja</span>
                      )}
                    </li>
                  )
                })}
            </ul>
          </section>

          <section className="flex flex-col gap-1">
            <h3 className="font-semibold">Las cuentas</h3>
            <p className="flex flex-wrap gap-x-3 text-sm">
              <span>{cuenta(progresivas, 'progresiva', 'progresivas')}</span>
              <span>·</span>
              <span>{cuenta(leida.lecturas.length, 'lectura', 'lecturas')}</span>
              <span>·</span>
              <span>{cuenta(puntosMedidos, 'punto de la sección', 'puntos de la sección')}</span>
            </p>
            <p className="text-sm">
              <span>
                Vista atrás al punto de control:{' '}
                {leida.vistaAtras === null
                  ? 'no la encontré en la hoja'
                  : leida.vistaAtras.toFixed(3)}
              </span>
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {leida.columnaProgresiva === null
                ? 'No encontré la columna de las progresivas.'
                : `Las progresivas salen de la columna ${letraDeColumna(leida.columnaProgresiva)}.`}
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">Referencias</h3>
            {leida.referencias.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Ninguna: no había filas de cosas existentes que pudiera leer.
              </p>
            ) : (
              <ul aria-label="Referencias encontradas" className="flex flex-col gap-1 text-sm">
                {leida.referencias.map((referencia, indice) => (
                  <li
                    key={`${referencia.elemento}-${referencia.distancia}-${indice}`}
                    className="flex flex-wrap items-baseline gap-x-2"
                  >
                    <span className="font-medium">{referencia.elemento}</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {ladoEnPalabras(referencia.distancia)}
                    </span>
                    <span className="numerico">lectura {referencia.valor.toFixed(3)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">Lo que no importé</h3>
            {noImportado.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nada: de esta hoja entró todo lo que había escrito.
              </p>
            ) : (
              <ul aria-label="Lo que no importé" className="flex flex-col gap-1 text-sm">
                {noImportado.map((cosa) => (
                  <li key={cosa.valor} className="flex flex-wrap items-baseline gap-x-2">
                    <span data-valor={cosa.valor} className="numerico font-medium">
                      {cosa.valor}
                    </span>
                    {cosa.veces > 1 && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {cosa.veces} veces
                      </span>
                    )}
                    <span className="text-slate-500 dark:text-slate-400">
                      {cosa.motivos.join(' ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">Sin resolver</h3>
            {leida.conflictos.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nada quedó a medias en esta hoja.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {leida.conflictos.map((conflicto) => (
                  <li
                    key={conflicto.que}
                    className="rounded border border-aviso bg-aviso/10 px-3 py-2 text-aviso"
                  >
                    {conflicto.que}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {leida.sinAsignar.length > 0 && (
            <ColumnasSinColocar
              seccion={seccion}
              columnas={leida.sinAsignar}
              asignaciones={asignaciones}
              alAsignar={colocarColumna}
            />
          )}

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">Antes de aceptar</h3>

            {hayDistanciasDeFabrica(seccion) && (
              <p className="rounded border border-aviso bg-aviso/10 px-3 py-2 text-sm text-aviso">
                <strong>Las distancias son las de fábrica.</strong> Las puso la app, no las mediste tú:
                las pendientes y el bombeo que salgan de esta hoja son orientativos hasta que las midas
                en la pantalla de la sección.
              </p>
            )}

            <p className="rounded border border-aviso bg-aviso/10 px-3 py-2 text-sm text-aviso">
              {AVISO_NO_CIERRA}
            </p>

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
