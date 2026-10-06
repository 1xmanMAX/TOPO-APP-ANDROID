import {
  calcularCampania,
  formatearPendiente,
  formatearProgresiva,
  instrumentoCompleto,
  type Calle,
  type PendienteTramo,
  type Pista,
  type Proyecto,
} from '@topo/core'
import { forwardRef, useId, useState } from 'react'
import { useAlmacen } from '../../estado/almacen'
import type { DatosPista } from './datosPista'
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAJA, type AvisoPantalla } from './estilos'
import TomarRasante from './TomarRasante'

export { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAJA } from './estilos'

function TextoSentido({ tramo }: { tramo: PendienteTramo }) {
  return <>{tramo.sentido === 'sube' ? 'sube' : tramo.sentido === 'baja' ? 'baja' : 'a nivel'}</>
}

/** Lista de tramos con su pendiente; los empinados con △ y palabra, no solo color. */
export function ListaPendientes({ datos }: { datos: DatosPista }) {
  if (datos.tramos.length === 0) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Sin pendientes: el plano no trae cotas de esta pista y su calle no tiene rasante.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {datos.fuente === 'plano' ? 'Según las cotas del plano' : 'Según la rasante de la calle'}
      </p>
      <ul aria-label="Pendientes por tramo" className="flex flex-col gap-1 text-sm">
        {datos.tramos.map(({ tramo, empinada }) => (
          <li
            key={tramo.desde}
            className={`numerico rounded px-2 py-1 ${empinada ? 'bg-aviso/20 font-medium' : 'bg-slate-50 dark:bg-slate-900'}`}
          >
            {formatearProgresiva(tramo.desde)} → {formatearProgresiva(tramo.hasta)}: {formatearPendiente(tramo.porcentaje)}{' '}
            <TextoSentido tramo={tramo} />
            {empinada && <span> · △ empinada</span>}
          </li>
        ))}
      </ul>
      {datos.conflictos > 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          <span aria-hidden="true">△ </span>
          {datos.conflictos === 1 ? 'Una estaca del plano tiene' : `${datos.conflictos} estacas del plano tienen`} cotas
          distintas y no se usaron: revísalas en el plano.
        </p>
      )}
    </div>
  )
}

interface EstadoNivelacion {
  id: string
  texto: string
  simbolo: '✓' | '✗' | '△'
  estado: string
}

/** La última toma de cada nivelación de la calle, con si cerró: lo calcula el motor. */
function estadoDeNivelaciones(calle: Calle, proyecto: Proyecto): EstadoNivelacion[] {
  const largoMira = instrumentoCompleto(proyecto.instrumento).largoMira
  const salida: EstadoNivelacion[] = []
  for (const nivelacion of calle.nivelaciones) {
    const toma = nivelacion.tomas[nivelacion.tomas.length - 1]
    if (!toma) continue
    const capa = proyecto.capas.find((c) => c.id === toma.capaId)?.nombre ?? 'capa sin nombre'
    let pasa: boolean | null = null
    try {
      pasa = calcularCampania({ campania: toma, calle, bms: proyecto.bms, largoMira }).cierre.pasa
    } catch {
      pasa = null
    }
    salida.push({
      id: nivelacion.id,
      texto: `${capa} · ${toma.fecha}`,
      simbolo: pasa === true ? '✓' : pasa === false ? '✗' : '△',
      estado: pasa === true ? 'cerró' : pasa === false ? 'no cerró' : 'sin comprobar',
    })
  }
  return salida
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
  const [tomandoRasante, setTomandoRasante] = useState(false)

  const calle = pista.calleId ? proyecto.calles.find((c) => c.id === pista.calleId) : undefined
  const nivelaciones = calle ? estadoDeNivelaciones(calle, proyecto) : []
  const controles = calle?.planControles?.controles ?? []

  return (
    <section aria-labelledby={idTitulo} className={CAJA}>
      <h3 id={idTitulo} ref={refTitulo} tabIndex={-1} className="text-base font-semibold outline-none">
        {pista.nombre}
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {pista.origen === 'croquis' ? 'Croquis dibujado sobre el plano' : 'Eje tomado del DXF'}
        {calle ? ` · calle «${calle.nombre}»` : ' · sin calle todavía'}
      </p>

      {datos ? (
        <dl className="numerico grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">Tramo</dt>
          <dd>
            {formatearProgresiva(datos.inicio)} → {formatearProgresiva(datos.fin)}
          </dd>
          <dt className="text-slate-500 dark:text-slate-400">Largo</dt>
          <dd>{datos.largoM.toFixed(3)} m</dd>
        </dl>
      ) : error ? (
        <p className="rounded border border-aviso/60 bg-aviso/10 p-2 text-sm">
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
        <h4 className="text-sm font-medium">Capas medidas</h4>
        {nivelaciones.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Sin nivelaciones todavía.</p>
        ) : (
          <ul aria-label="Capas medidas" className="flex flex-col gap-1 text-sm">
            {nivelaciones.map((n) => (
              <li key={n.id}>
                <span aria-hidden="true" className={n.simbolo === '✓' ? 'text-pasa' : n.simbolo === '✗' ? 'text-falla' : 'text-aviso'}>
                  {n.simbolo}{' '}
                </span>
                {n.texto} — {n.estado}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-medium">Puntos de control</h4>
        {controles.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Sin controles planificados.</p>
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
            <p className="text-xs text-slate-500 dark:text-slate-400">
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {calle ? (
          <>
            <button
              type="button"
              className={BOTON_PRINCIPAL}
              onClick={() => {
                activarCalle(calle.id)
                fijarModoCalle('revisar')
              }}
            >
              Abrir sus cálculos
            </button>
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
          </>
        ) : (
          <button
            type="button"
            className={BOTON_PRINCIPAL}
            onClick={() => {
              if (crearCalleDesdePista(pista.id)) alAvisar({ tipo: 'ok', texto: `✓ Calle «${pista.nombre}» creada con la pista. Sin rasante todavía.` })
            }}
          >
            Crear su calle
          </button>
        )}
        {datos && datos.cotasDelPlano.length >= 2 && !tomandoRasante && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setTomandoRasante(true)}>
            Tomar la rasante de las cotas del plano
          </button>
        )}
        {confirmarQuitar ? (
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <span className="text-sm">¿Quitar la pista? La calle y sus mediciones se quedan.</span>
            <button type="button" className={BOTON_SECUNDARIO} onClick={alQuitar}>
              Sí, quitar la pista
            </button>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setConfirmarQuitar(false)}>
              No
            </button>
          </div>
        ) : (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setConfirmarQuitar(true)}>
            Quitar la pista
          </button>
        )}
      </div>
    </section>
  )
})
