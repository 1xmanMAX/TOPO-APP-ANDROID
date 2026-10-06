import { useAlmacen, type ModoCalle, type PantallaCalle, type SubObra } from '../estado/almacen'

const BOTON = 'min-h-11 rounded px-3 py-1 text-sm'
const INACTIVO =
  'border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
const ACTIVO = 'border border-marca bg-marca font-medium text-white'

const SUB_OBRA: { sub: SubObra; texto: string }[] = [
  { sub: 'calles', texto: 'Calles' },
  { sub: 'plano', texto: 'Plano' },
]

/** Dentro de Obra: la lista de calles o el plano de obra. */
export function NavegacionObra() {
  const subObra = useAlmacen((s) => s.subObra)
  const irASubObra = useAlmacen((s) => s.irASubObra)

  return (
    <nav
      aria-label="Pantallas de la obra"
      className="grid grid-cols-2 gap-2 border-b border-slate-200 px-2 py-2 sm:flex sm:px-4 dark:border-slate-800"
    >
      {SUB_OBRA.map(({ sub, texto }) => (
        <button
          key={sub}
          type="button"
          aria-pressed={subObra === sub}
          onClick={() => irASubObra(sub)}
          className={`${BOTON} ${subObra === sub ? ACTIVO : INACTIVO}`}
        >
          {texto}
        </button>
      ))}
    </nav>
  )
}

const MODOS: { modo: ModoCalle; texto: string }[] = [
  { modo: 'medir', texto: 'Medir' },
  { modo: 'revisar', texto: 'Revisar' },
  { modo: 'replantear', texto: 'Replantear' },
]

const PANTALLAS: { pantalla: Exclude<PantallaCalle, 'guia'>; texto: string }[] = [
  { pantalla: 'analisis', texto: 'Análisis' },
  { pantalla: 'cierre', texto: 'Cierre' },
  { pantalla: 'planificar', texto: 'Planificar' },
]

/**
 * Dentro de Calle: qué calle, los tres modos sobre la misma vista y las tres
 * pantallas de la calle. En el celular van en dos filas —la calle y sus
 * pantallas arriba, los tres modos a lo ancho abajo— para dejarle la
 * pantalla a la libreta; en la laptop, todo en una.
 */
export function NavegacionCalle() {
  const calles = useAlmacen((s) => s.proyecto.calles)
  const calleActivaId = useAlmacen((s) => s.calleActivaId)
  const activarCalle = useAlmacen((s) => s.activarCalle)
  const modoCalle = useAlmacen((s) => s.modoCalle)
  const pantallaCalle = useAlmacen((s) => s.pantallaCalle)
  const fijarModoCalle = useAlmacen((s) => s.fijarModoCalle)
  const abrirPantallaCalle = useAlmacen((s) => s.abrirPantallaCalle)

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-2 py-2 sm:px-4 dark:border-slate-800">
      {calles.length === 0 ? (
        <p className="order-1 min-w-0 flex-1 text-sm text-slate-600 sm:flex-none dark:text-slate-300">Todavía no hay calles: créalas en Obra.</p>
      ) : (
        <label className="order-1 flex min-w-0 flex-1 items-center gap-2 text-sm sm:flex-none">
          {/* En el celular el nombre de la calle ya dice qué es; la etiqueta queda para el lector de pantalla. */}
          <span className="sr-only font-medium sm:not-sr-only">Calle activa</span>
          <select
            value={calleActivaId ?? ''}
            onChange={(evento) => activarCalle(evento.target.value || null)}
            className="min-h-11 min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 text-sm sm:w-56 sm:flex-none dark:border-slate-700 dark:bg-slate-900"
          >
            {calleActivaId === null && <option value="">Elige una calle</option>}
            {calles.map((calle) => (
              <option key={calle.id} value={calle.id}>
                {calle.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <nav aria-label="Modos de la calle" className="order-3 grid w-full grid-cols-3 gap-2 sm:order-2 sm:flex sm:w-auto">
        {MODOS.map(({ modo, texto }) => {
          const activo = pantallaCalle === null && modoCalle === modo
          return (
            <button
              key={modo}
              type="button"
              aria-pressed={activo}
              onClick={() => fijarModoCalle(modo)}
              className={`${BOTON} ${activo ? ACTIVO : INACTIVO}`}
            >
              {texto}
            </button>
          )
        })}
      </nav>

      <nav aria-label="Pantallas de la calle" className="order-2 flex gap-1 sm:order-3 sm:ml-auto sm:gap-2">
        {PANTALLAS.map(({ pantalla, texto }) => {
          // La guía de campo es parte del planificador: con ella abierta, Planificar sigue marcado.
          const activo = pantallaCalle === pantalla || (pantalla === 'planificar' && pantallaCalle === 'guia')
          return (
            <button
              key={pantalla}
              type="button"
              aria-pressed={activo}
              onClick={() => abrirPantallaCalle(pantalla)}
              className={`min-h-11 rounded px-2 py-1 text-xs sm:px-3 sm:text-sm ${activo ? ACTIVO : INACTIVO}`}
            >
              {texto}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
