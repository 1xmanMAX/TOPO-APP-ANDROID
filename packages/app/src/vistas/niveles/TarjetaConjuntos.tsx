import { lineaDeCapa, type ConjuntoDeNivel } from '@topo/core'
import { useId, useMemo, useState } from 'react'
import AvisoLinea from '../../componentes/AvisoLinea'
import CampoNumero from '../../componentes/CampoNumero'
import Segmentado from '../../componentes/Segmentado'
import { BOTON_ICONO, BOTON_PRINCIPAL, BOTON_SECUNDARIO, CEJA, ENLACE_PELIGRO, TARJETA } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import {
  CATEGORIA_REPLANTEO,
  CATEGORIAS_DE_FABRICA,
  nuevoIdNivel,
  puestaDe,
  puntosDeConjunto,
  textoDeCotas,
  textoPorPendiente,
  type LineaDeLaHoja,
} from '../../niveles/hoja'
import { puestasDe } from '../../niveles/puestas'
import { SelectorPuesta } from './EditorPuestas'
import { capasMedidas, puntosDeIzquierdaADerecha, textoAjusteCm } from './lineas'
import type { PropsHoja } from './PantallaNiveles'

const CAMPO = 'min-h-11 w-full min-w-0 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-[15px] text-tinta'

/** El color de cada categoría, para reconocerla en la lista: siempre junto a su nombre. */
const COLORES = ['bg-aviso', 'bg-proyecto', 'bg-pasa', 'bg-marca', 'bg-falla', 'bg-sin', 'bg-tinta']
export function colorDeCategoria(categoria: string): string {
  const i = CATEGORIAS_DE_FABRICA.findIndex((c) => c.toLowerCase() === categoria.trim().toLowerCase())
  if (i >= 0) return COLORES[i % COLORES.length]!
  let h = 0
  for (const ch of categoria) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COLORES[h % COLORES.length]!
}

type Formulario = null | 'medido' | 'replanteo'

/**
 * Los conjuntos de la hoja: una línea por zona («Vereda izquierda», «Base
 * derecha», «Replanteo tramo 2»…), escrita «progresiva, valor» como en su
 * hoja de campo, con su categoría, su puesta y un ajuste en cm para subirla
 * o bajarla entera. Se puede traer una de lo ya medido en la app y armar un
 * replanteo copiando otra o con una pendiente.
 */
export default function TarjetaConjuntos({ hoja, cambiar, lineas }: PropsHoja & { lineas: Map<string, LineaDeLaHoja> }) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const agregarPuesta = useAlmacen((s) => s.agregarPuesta)
  const [activoId, setActivoId] = useState<string | null>(null)
  const [formulario, setFormulario] = useState<Formulario>(null)
  const activo = hoja.conjuntos.find((c) => c.id === activoId) ?? hoja.conjuntos[0] ?? null

  function agregar(conjunto: Omit<ConjuntoDeNivel, 'id'>) {
    const id = nuevoIdNivel('conjunto')
    let puestaId = conjunto.puestaId
    // Unas lecturas sin ninguna puesta en el proyecto: se crea la primera sobre el primer BM.
    if (conjunto.tipo === 'lectura' && puestasDe(proyecto).length === 0) {
      const bm = proyecto.bms[0]
      puestaId = agregarPuesta({ nombre: 'Puesta 1', cotaBM: bm?.cota ?? 100, lecturaAtras: 1.5, bmId: bm?.id ?? null })
    }
    cambiar((h) => ({ ...h, conjuntos: [...h.conjuntos, { ...conjunto, puestaId, id }] }))
    setActivoId(id)
    setFormulario(null)
  }

  function editar(cambios: Partial<ConjuntoDeNivel>) {
    if (!activo) return
    cambiar((h) => ({ ...h, conjuntos: h.conjuntos.map((c) => (c.id === activo.id ? { ...c, ...cambios } : c)) }))
  }

  function quitar() {
    if (!activo) return
    cambiar((h) => ({ ...h, conjuntos: h.conjuntos.filter((c) => c.id !== activo.id) }))
    setActivoId(null)
  }

  return (
    <section aria-label="Conjuntos de datos" className={`${TARJETA} flex min-w-0 flex-col gap-3`}>
      <h3 className={CEJA}>Conjuntos de datos</h3>
      {hoja.conjuntos.length > 0 && (
        <div role="group" aria-label="Conjuntos" className="flex flex-wrap gap-1">
          {hoja.conjuntos.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === activo?.id}
              onClick={() => setActivoId(c.id)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm ${
                c.id === activo?.id ? 'border-tinta bg-cabecera font-semibold text-white' : 'border-borde-fuerte bg-tarjeta text-tinta'
              }`}
            >
              <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorDeCategoria(c.categoria)}`} />
              {c.nombre || '(sin nombre)'} · {puntosDeConjunto(c, lineas)}
              {(c.tipo === 'medido' || c.tipo === 'derivado') && <span aria-label="enlazado"> ⛓</span>}
              {c.ajusteCm !== 0 && <span className="numerico">{c.ajusteCm > 0 ? ' ▲' : ' ▼'}{Math.abs(c.ajusteCm)} cm</span>}
            </button>
          ))}
        </div>
      )}

      {activo && (
        <EditorConjunto key={activo.id} conjunto={activo} hoja={hoja} lineas={lineas} linea={lineas.get(activo.id)} editar={editar} quitar={quitar} />
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            agregar({
              nombre: `Conjunto ${hoja.conjuntos.length + 1}`,
              categoria: '',
              tipo: 'lectura',
              texto: '',
              puestaId: puestasDe(proyecto)[0]?.id ?? null,
              ajusteCm: 0,
            })
          }
          className={BOTON_PRINCIPAL}
        >
          + Agregar conjunto
        </button>
        <button type="button" aria-expanded={formulario === 'medido'} onClick={() => setFormulario(formulario === 'medido' ? null : 'medido')} className={BOTON_SECUNDARIO}>
          Traer de lo medido
        </button>
        <button
          type="button"
          aria-expanded={formulario === 'replanteo'}
          onClick={() => setFormulario(formulario === 'replanteo' ? null : 'replanteo')}
          className={BOTON_SECUNDARIO}
        >
          + Nuevo replanteo
        </button>
      </div>
      {formulario === 'medido' && <TraerDeLoMedido agregar={agregar} />}
      {formulario === 'replanteo' && <NuevoReplanteo hoja={hoja} lineas={lineas} activo={activo} agregar={agregar} />}
      <p className="text-[13px] text-tenue">
        Una línea por punto: progresiva y valor, p. ej. «0+020, 1.250» o «20 1.250». Se guarda con la calle, en el
        archivo del proyecto.
      </p>
    </section>
  )
}

function EditorConjunto({
  conjunto,
  hoja,
  lineas,
  linea,
  editar,
  quitar,
}: {
  conjunto: ConjuntoDeNivel
  hoja: PropsHoja['hoja']
  lineas: Map<string, LineaDeLaHoja>
  linea: LineaDeLaHoja | undefined
  editar: (cambios: Partial<ConjuntoDeNivel>) => void
  quitar: () => void
}) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const capas = proyecto.capas
  const calle = useAlmacen((s) => s.proyecto.calles.find((c) => c.id === s.calleActivaId) ?? null)
  const idCategorias = useId()
  const [paso, setPaso] = useState(1)
  const [seguro, setSeguro] = useState(false)
  const puesta = puestaDe(proyecto, conjunto)
  const enlazado = conjunto.tipo === 'medido' || conjunto.tipo === 'derivado'
  const medidas = calle ? capasMedidas(calle, capas) : []
  const puntosSeccion = calle ? puntosDeIzquierdaADerecha(calle) : []
  const categorias = [...new Set([...CATEGORIAS_DE_FABRICA, ...capas.map((c) => c.nombre)])]
  // Los avisos que importan al escribir: renglones que no se entienden o lecturas que no caben.
  const avisos = (linea?.avisos ?? []).filter((a) => !/sin cierre|no comprobad/i.test(a))

  return (
    <fieldset className="flex flex-col gap-2 rounded-[10px] border border-borde bg-fondo p-3">
      <legend className="sr-only">Editar {conjunto.nombre}</legend>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-tenue">Nombre</span>
          <input value={conjunto.nombre} onChange={(e) => editar({ nombre: e.target.value })} autoComplete="off" className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-tenue">Categoría</span>
          <input
            list={idCategorias}
            value={conjunto.categoria}
            placeholder="Base, Vereda…"
            onChange={(e) => editar({ categoria: e.target.value })}
            autoComplete="off"
            className={CAMPO}
          />
          <datalist id={idCategorias}>
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>
      {enlazado ? (
        <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-proyecto/50 p-2">
          {conjunto.tipo === 'medido' ? (
            <>
              <p className="text-[13px] text-tenue">⛓ Enlazado a la libreta: si se corrige lo medido o se compensa el cierre, esta línea cambia sola.</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[13px] font-medium text-tenue">Capa medida</span>
                  <select aria-label="Capa enlazada" value={conjunto.capaId ?? ''} onChange={(e) => editar({ capaId: e.target.value })} className={CAMPO}>
                    {medidas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[13px] font-medium text-tenue">Punto</span>
                  <select aria-label="Punto enlazado" value={conjunto.puntoId ?? ''} onChange={(e) => editar({ puntoId: e.target.value })} className={CAMPO}>
                    {puntosSeccion.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          ) : (
            <>
              <p className="text-[13px] text-tenue">⛓ Sigue a otra línea más su ajuste: si esa línea cambia, esta también.</p>
              <label className="flex flex-col gap-1">
                <span className="text-[13px] font-medium text-tenue">Sigue a</span>
                <select aria-label="Línea que sigue" value={conjunto.origenId ?? ''} onChange={(e) => editar({ origenId: e.target.value })} className={CAMPO}>
                  {hoja.conjuntos
                    .filter((c) => c.id !== conjunto.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          <button
            type="button"
            onClick={() => editar({ tipo: 'cota', texto: textoDeCotas((linea?.linea.puntos ?? []).map((p) => ({ progresiva: p.progresiva, cota: p.cota - conjunto.ajusteCm / 100 }))) })}
            className={`${BOTON_SECUNDARIO} self-start`}
          >
            Soltar el enlace y editar las cotas a mano
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Segmentado
            etiqueta="Tipo de dato"
            opciones={[
              { valor: 'lectura', texto: 'Lecturas de mira' },
              { valor: 'cota', texto: 'Cotas' },
            ]}
            valor={conjunto.tipo === 'cota' ? 'cota' : 'lectura'}
            alCambiar={(tipo) => editar({ tipo })}
          />
          {conjunto.tipo === 'lectura' && (
            <SelectorPuesta etiqueta="Medido desde" valor={puesta?.id ?? null} alCambiar={(puestaId) => editar({ puestaId })} />
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[13px] font-medium text-tenue">Subir / bajar{textoAjusteCm(conjunto.ajusteCm)}</span>
        <button type="button" aria-label={`Bajar ${paso} cm`} onClick={() => editar({ ajusteCm: Math.round((conjunto.ajusteCm - paso) * 100) / 100 })} className={BOTON_ICONO}>
          ▼
        </button>
        <CampoNumero ariaLabel="Ajuste en cm" decimales={1} valor={conjunto.ajusteCm} alCambiar={(ajusteCm) => editar({ ajusteCm })} ancho="w-24" />
        <button type="button" aria-label={`Subir ${paso} cm`} onClick={() => editar({ ajusteCm: Math.round((conjunto.ajusteCm + paso) * 100) / 100 })} className={BOTON_ICONO}>
          ▲
        </button>
        <span className="text-[13px] text-tenue">de a</span>
        <CampoNumero ariaLabel="Paso en cm" decimales={1} valor={paso} alCambiar={(v) => setPaso(Math.max(0, v))} ancho="w-20" />
        <span className="text-[13px] text-tenue">cm</span>
        {conjunto.ajusteCm !== 0 && (
          <button type="button" onClick={() => editar({ ajusteCm: 0 })} className="min-h-11 px-2 text-sm text-proyecto">
            Quitar ajuste
          </button>
        )}
      </div>
      {enlazado ? (
        <p className="numerico rounded-[10px] bg-tarjeta px-3 py-2 text-[13px] text-tenue">
          {(linea?.linea.puntos ?? []).slice(0, 12).map((p) => `${p.progresiva.toFixed(0)}: ${p.cota.toFixed(3)}`).join(' · ')}
          {(linea?.linea.puntos.length ?? 0) > 12 && ' …'}
          {(linea?.linea.puntos.length ?? 0) === 0 && 'Sin puntos.'}
        </p>
      ) : (
      <textarea
        aria-label={`Datos de ${conjunto.nombre}: progresiva, valor`}
        spellCheck={false}
        value={conjunto.texto}
        placeholder={conjunto.tipo === 'lectura' ? '0+000, 1.250\n0+010, 1.260' : '0+000, 3244.120\n0+010, 3244.090'}
        onChange={(e) => editar({ texto: e.target.value })}
        className="numerico min-h-40 w-full rounded-[10px] border border-borde-fuerte bg-tarjeta px-3 py-2 text-[14px] leading-6 text-tinta"
      />
      )}
      {avisos.map((a) => (
        <AvisoLinea key={a} tono="aviso">
          {a}
        </AvisoLinea>
      ))}
      <button
        type="button"
        onClick={() => {
          if (seguro) quitar()
          else {
            setSeguro(true)
            setTimeout(() => setSeguro(false), 3000)
          }
        }}
        className={`${ENLACE_PELIGRO} self-start`}
      >
        {seguro ? '¿Seguro? Toca otra vez para quitarlo' : 'Quitar este conjunto'}
      </button>
    </fieldset>
  )
}

/** Trae una capa medida en la app, en un punto de la sección, como conjunto de cotas. */
function TraerDeLoMedido({ agregar }: { agregar: (c: Omit<ConjuntoDeNivel, 'id'>) => void }) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const calle = useAlmacen((s) => s.proyecto.calles.find((c) => c.id === s.calleActivaId) ?? null)
  const medidas = useMemo(() => (calle ? capasMedidas(calle, proyecto.capas) : []), [calle, proyecto.capas])
  const puntos = useMemo(() => (calle ? puntosDeIzquierdaADerecha(calle) : []), [calle])
  const [capaId, setCapaId] = useState('')
  const [puntoId, setPuntoId] = useState('')
  const capa = medidas.find((c) => c.id === capaId) ?? medidas[medidas.length - 1]
  const punto = puntos.find((p) => p.id === puntoId) ?? puntos[0]

  if (!calle || medidas.length === 0 || !capa || !punto) {
    return <p className="text-[13px] text-tenue">Esta calle todavía no tiene capas medidas en la app.</p>
  }
  const leida = lineaDeCapa(proyecto, calle.id, capa.id, punto.id)
  const n = leida?.linea.puntos.length ?? 0

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-borde-fuerte p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-tenue">Capa medida</span>
          <select value={capa.id} onChange={(e) => setCapaId(e.target.value)} className={CAMPO}>
            {medidas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-tenue">Punto de la sección</span>
          <select value={punto.id} onChange={(e) => setPuntoId(e.target.value)} className={CAMPO}>
            {puntos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        disabled={n === 0}
        onClick={() =>
          agregar({
            nombre: `${capa.nombre} · ${punto.nombre}`,
            categoria: capa.nombre,
            tipo: 'medido',
            capaId: capa.id,
            puntoId: punto.id,
            texto: '',
            puestaId: null,
            ajusteCm: 0,
          })
        }
        className={`${BOTON_SECUNDARIO} self-start`}
      >
        {n === 0 ? 'Sin puntos medidos ahí' : `Enlazar ${n} ${n === 1 ? 'punto' : 'puntos'} de la libreta`}
      </button>
    </div>
  )
}

/**
 * Un replanteo: la línea que debe quedar. Copiando otra (con lo que se la
 * quiera subir o bajar) o con una cota de arranque y una pendiente.
 */
function NuevoReplanteo({
  hoja,
  lineas,
  activo,
  agregar,
}: {
  hoja: PropsHoja['hoja']
  lineas: Map<string, LineaDeLaHoja>
  activo: ConjuntoDeNivel | null
  agregar: (c: Omit<ConjuntoDeNivel, 'id'>) => void
}) {
  const [como, setComo] = useState<'copia' | 'pendiente'>(hoja.conjuntos.length > 0 ? 'copia' : 'pendiente')
  const [origenId, setOrigenId] = useState(activo?.id ?? hoja.conjuntos[0]?.id ?? '')
  const [subirCm, setSubirCm] = useState(0)
  const puntosActivo = activo ? (lineas.get(activo.id)?.linea.puntos ?? []) : []
  const [desde, setDesde] = useState(puntosActivo[0]?.progresiva ?? 0)
  const [hasta, setHasta] = useState(puntosActivo[puntosActivo.length - 1]?.progresiva ?? 100)
  const [cada, setCada] = useState(10)
  const [cotaInicial, setCotaInicial] = useState(puntosActivo[0]?.cota ?? 100)
  const [pendiente, setPendiente] = useState(0)
  const n = hoja.conjuntos.filter((c) => c.categoria === CATEGORIA_REPLANTEO).length + 1

  const origen = lineas.get(origenId)
  const textoCopia = origen ? textoDeCotas(origen.linea.puntos.map((p) => ({ progresiva: p.progresiva, cota: p.cota + subirCm / 100 }))) : ''
  const textoPend = textoPorPendiente({ desde, hasta, cada, cotaInicial, pendientePct: pendiente })

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-borde-fuerte p-3">
      <Segmentado
        etiqueta="Cómo armar el replanteo"
        opciones={[
          { valor: 'copia', texto: 'Copiar un conjunto' },
          { valor: 'pendiente', texto: 'Por pendiente' },
        ]}
        valor={como}
        alCambiar={setComo}
      />
      {como === 'copia' ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-tenue">Copiar de</span>
            <select value={origenId} onChange={(e) => setOrigenId(e.target.value)} className={CAMPO}>
              {hoja.conjuntos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <CampoNumero etiqueta="Subir (+) o bajar (−), cm" decimales={1} valor={subirCm} alCambiar={setSubirCm} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <CampoNumero etiqueta="Desde (m)" decimales={2} valor={desde} alCambiar={setDesde} />
          <CampoNumero etiqueta="Hasta (m)" decimales={2} valor={hasta} alCambiar={setHasta} />
          <CampoNumero etiqueta="Un punto cada (m)" decimales={2} valor={cada} alCambiar={setCada} />
          <CampoNumero etiqueta="Cota al inicio (m)" valor={cotaInicial} alCambiar={setCotaInicial} />
          <CampoNumero etiqueta="Pendiente (%)" decimales={2} valor={pendiente} alCambiar={setPendiente} ayuda="+ sube al avanzar" />
        </div>
      )}
      <button
        type="button"
        disabled={(como === 'copia' ? textoCopia : textoPend) === ''}
        onClick={() =>
          agregar(
            como === 'copia' && origen
              ? {
                  nombre: `Replanteo de ${origen.conjunto.nombre}`,
                  categoria: CATEGORIA_REPLANTEO,
                  tipo: 'derivado',
                  origenId: origen.conjunto.id,
                  texto: '',
                  puestaId: null,
                  ajusteCm: subirCm,
                }
              : {
                  nombre: `Replanteo ${n}`,
                  categoria: CATEGORIA_REPLANTEO,
                  tipo: 'cota',
                  texto: textoPend,
                  puestaId: null,
                  ajusteCm: 0,
                },
          )
        }
        className={`${BOTON_SECUNDARIO} self-start`}
      >
        Crear el replanteo
      </button>
      <p className="text-[13px] text-tenue">
        Copiado, sigue a su línea (si ella cambia, el replanteo también) y lo subes o bajas con su ajuste; si quieres
        corregirlo punto por punto, suelta el enlace. Compáralo en una gráfica en «Corte y relleno».
      </p>
    </div>
  )
}
