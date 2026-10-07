import { formatearPendiente, formatearProgresiva, type PendienteTramo, type Pista } from '@topo/core'
import { forwardRef, useId, useRef, useState } from 'react'
import { useAlmacen } from '../../estado/almacen'
import { estadoDeNivelaciones, type DatosPista } from './datosPista'
import MenuMas from '../../componentes/MenuMas'
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAJA, CEJA, ENLACE_PELIGRO, ITEM_MENU, type AvisoPantalla } from './estilos'
import TomarRasante from './TomarRasante'

export { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAJA } from './estilos'

function TextoSentido({ tramo }: { tramo: PendienteTramo }) {
  return <>{tramo.sentido === 'sube' ? 'sube' : tramo.sentido === 'baja' ? 'baja' : 'a nivel'}</>
}

/** Lista de tramos con su pendiente; los empinados con △ y palabra, no solo color. */
export function ListaPendientes({ datos }: { datos: DatosPista }) {
  if (datos.tramos.length === 0) {
    return (
      <p className="text-sm text-tenue">
        Sin pendientes: el plano no trae cotas de esta pista y su calle no tiene rasante.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-tenue">
        {datos.fuente === 'plano' ? 'Según las cotas del plano' : 'Según la rasante de la calle'}
      </p>
      <ul aria-label="Pendientes por tramo" className="flex flex-col gap-1.5 text-sm">
        {datos.tramos.map(({ tramo, empinada }) => (
          <li key={tramo.desde} className="numerico flex flex-wrap items-center justify-between gap-x-3 rounded-lg bg-fondo px-2.5 py-2">
            <span>
              {formatearProgresiva(tramo.desde)} → {formatearProgresiva(tramo.hasta)}:
            </span>{' '}
            <span className={empinada ? 'font-bold text-marca' : 'font-semibold'}>
              {formatearPendiente(tramo.porcentaje)} <TextoSentido tramo={tramo} />
              {empinada && <span> · △ empinada</span>}
            </span>
          </li>
        ))}
      </ul>
      {datos.conflictos > 0 && (
        <p className="text-xs text-tenue">
          <span aria-hidden="true">△ </span>
          {datos.conflictos === 1 ? 'Una estaca del plano tiene' : `${datos.conflictos} estacas del plano tienen`} cotas
          distintas y no se usaron: revísalas en el plano.
        </p>
      )}
    </div>
  )
}

interface PropsFicha {
  pista: Pista
  /** Null si no hay datos: el plano no está calibrado, o el motor no pudo con la pista (`error`). */
  datos: DatosPista | null
  /** Lo que dijo el motor cuando no pudo medir la pista sobre un plano que sí tiene escala. */
  error: string | null
  alQuitar: () => void
  alAvisar: (aviso: AvisoPantalla) => void
}

/**
 * Lo que se sabe de la pista elegida: tramo, largo, pendientes, capas
 * medidas y controles, con los botones para ir a sus cálculos. El título
 * recibe el foco (y la pantalla lo trae a la vista) al elegir la pista.
 */
export const FichaPista = forwardRef<HTMLHeadingElement, PropsFicha>(function FichaPista({ pista, datos, error, alQuitar, alAvisar }, refTitulo) {
  const idTitulo = useId()
  const proyecto = useAlmacen((s) => s.proyecto)
  const activarCalle = useAlmacen((s) => s.activarCalle)
  const fijarModoCalle = useAlmacen((s) => s.fijarModoCalle)
  const abrirPantallaCalle = useAlmacen((s) => s.abrirPantallaCalle)
  const crearCalleDesdePista = useAlmacen((s) => s.crearCalleDesdePista)
  const fijarRasante = useAlmacen((s) => s.fijarRasante)
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)
  const opcionesMas = useRef<HTMLDivElement>(null)

  // El «⋯» abre su menú hacia abajo y la ficha suele quedar al pie de la
  // pantalla: al abrirlo (o al pedir la confirmación de quitar) se trae a la
  // vista, por encima de la barra Obra/Calle/Calcular/Informes.
  function traerMenuALaVista() {
    requestAnimationFrame(() => {
      const menu = opcionesMas.current
      if (!menu || menu.closest('[hidden]')) return
      menu.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    })
  }
  const [tomandoRasante, setTomandoRasante] = useState(false)

  const calle = pista.calleId ? proyecto.calles.find((c) => c.id === pista.calleId) : undefined
  const nivelaciones = calle ? estadoDeNivelaciones(calle, proyecto) : []
  const controles = calle?.planControles?.controles ?? []

  return (
    <section aria-labelledby={idTitulo} className={CAJA}>
      <div className="flex flex-col gap-0.5">
        <p aria-hidden="true" className={CEJA}>
          Pista elegida
        </p>
        <h3 id={idTitulo} ref={refTitulo} tabIndex={-1} className="scroll-mt-28 text-2xl font-bold leading-tight outline-none">
          {pista.nombre}
        </h3>
      </div>
      <p className="text-sm text-tenue">
        {pista.origen === 'croquis' ? 'Croquis dibujado sobre el plano' : 'Eje tomado del DXF'}
        {calle ? ` · calle «${calle.nombre}»` : ' · sin calle todavía'}
      </p>

      {datos ? (
        <dl className="numerico grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]">
          <dt className="text-tenue">Tramo</dt>
          <dd>
            {formatearProgresiva(datos.inicio)} → {formatearProgresiva(datos.fin)}
          </dd>
          <dt className="text-tenue">Largo</dt>
          <dd>{datos.largoM.toFixed(3)} m</dd>
        </dl>
      ) : error ? (
        <p className="rounded-[10px] bg-aviso-suave px-3 py-2 text-sm text-aviso">
          <span aria-hidden="true">△ </span>
          No se pudo medir esta pista: {error} Revisa la escala del plano o vuelve a dibujar la pista.
        </p>
      ) : (
        <p className="text-sm">
          <span aria-hidden="true">△ </span>
          Este plano no tiene escala: calíbralo para ver el largo, las progresivas y las pendientes.
        </p>
      )}

      {datos && <ListaPendientes datos={datos} />}

      <div className="flex flex-col gap-1">
        <h4 className="text-[15px] font-semibold">Capas medidas</h4>
        {nivelaciones.length === 0 ? (
          <p className="text-sm text-tenue">Sin nivelaciones todavía.</p>
        ) : (
          <ul aria-label="Capas medidas" className="flex flex-col gap-1 text-sm">
            {nivelaciones.map((n) => (
              <li key={n.id}>
                <span aria-hidden="true" className={n.simbolo === '✓' ? 'text-pasa' : n.simbolo === '✗' ? 'text-falla' : 'text-tenue'}>
                  {n.simbolo}{' '}
                </span>
                {n.texto} — {n.estado}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h4 className="text-[15px] font-semibold">Puntos de control</h4>
        {controles.length === 0 ? (
          <p className="text-sm text-tenue">Sin controles planificados.</p>
        ) : (
          <>
            <ul aria-label="Controles planificados" className="numerico flex flex-col gap-1 text-sm">
              {controles.map((c) => (
                <li key={c.progresiva}>
                  {/* Color de la marca, no el verde de «pasa»: son cotas previstas, nadie las comprobó. */}
                  <span aria-hidden="true" className="text-marca">
                    ◆{' '}
                  </span>
                  {formatearProgresiva(c.progresiva)} · cota prevista {c.cota.toFixed(3)} · {c.motivos.map((m) => m.texto).join('; ')}
                </li>
              ))}
            </ul>
            <p className="text-xs text-tenue">
              Cotas previstas del perfil, no comprobadas: la estaca tiene cota cuando una nivelación cerrada se la da.
            </p>
          </>
        )}
      </div>

      {tomandoRasante && datos && (
        <TomarRasante
          cotas={datos.cotasDelPlano}
          actual={calle?.rasante ?? null}
          nivelacionesConTomas={calle ? calle.nivelaciones.filter((n) => n.tomas.length > 0).length : 0}
          alCancelar={() => setTomandoRasante(false)}
          alConfirmar={(rasante, texto, tipo) => {
            const calleId = calle?.id ?? crearCalleDesdePista(pista.id)
            if (!calleId) return
            fijarRasante(calleId, rasante)
            setTomandoRasante(false)
            alAvisar({ tipo, texto })
          }}
        />
      )}

      <div className="flex flex-col gap-2">
        {calle ? (
          <button
            type="button"
            className={`${BOTON_PRINCIPAL} w-full`}
            onClick={() => {
              activarCalle(calle.id)
              fijarModoCalle('revisar')
            }}
          >
            Abrir sus cálculos
          </button>
        ) : (
          <button
            type="button"
            className={`${BOTON_PRINCIPAL} w-full`}
            onClick={() => {
              if (crearCalleDesdePista(pista.id)) alAvisar({ tipo: 'ok', texto: `✓ Calle «${pista.nombre}» creada con la pista. Sin rasante todavía.` })
            }}
          >
            Crear su calle
          </button>
        )}
        <div className="grid grid-cols-[1fr_44px] gap-2">
          {calle ? (
            <button
              type="button"
              className={BOTON_SECUNDARIO}
              onClick={() => {
                activarCalle(calle.id)
                abrirPantallaCalle('planificar')
              }}
            >
              Planificar cambios
            </button>
          ) : (
            <span />
          )}
          {/* Solo escucha los toques que suben del «⋯» y su menú, para traerlo a la vista. */}
          <div onClick={traerMenuALaVista}>
          <MenuMas etiqueta="Más de la pista" idMenu={`${idTitulo}-mas`} etiquetaGrupo={`Más de ${pista.nombre}`}>
            <div ref={opcionesMas} className="flex w-72 max-w-full scroll-mb-24 flex-col gap-1 lg:scroll-mb-4">
              {datos && datos.cotasDelPlano.length >= 2 && !tomandoRasante && (
                <button type="button" className={ITEM_MENU} onClick={() => setTomandoRasante(true)}>
                  Tomar la rasante de las cotas del plano
                </button>
              )}
              <div className="border-t border-borde px-3 pt-1 first:border-t-0 first:pt-0">
                {confirmarQuitar ? (
                  <div className="flex flex-col gap-2 py-1">
                    <p className="text-sm">¿Quitar la pista? La calle y sus mediciones se quedan.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" className={`${BOTON_SECUNDARIO} border-falla text-falla`} onClick={alQuitar}>
                        Sí, quitar la pista
                      </button>
                      <button type="button" className={BOTON_SECUNDARIO} onClick={() => setConfirmarQuitar(false)}>
                        No
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className={ENLACE_PELIGRO} onClick={() => setConfirmarQuitar(true)}>
                    Quitar la pista
                  </button>
                )}
              </div>
            </div>
          </MenuMas>
          </div>
        </div>
      </div>
    </section>
  )
})
