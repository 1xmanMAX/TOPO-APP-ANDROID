import {
  claveCelda,
  formatearProgresiva,
  partirClaveCelda,
  nivelARegistrar,
  parsearProgresiva,
  puestaDeLibreta,
  redondear3,
  type FilaNivel,
  type Puesta,
  type SentidoMira,
  type UnidadLectura,
} from '@topo/core'
import { useMemo, useState } from 'react'
import AvisoLinea from '../../componentes/AvisoLinea'
import Plegable from '../../componentes/Plegable'
import Segmentado from '../../componentes/Segmentado'
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CLASES_ESTADO, TARJETA_OSCURA } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import { useContexto } from '../../estado/derivados'
import { formatearCota } from '../../formato'
import { datosDeEstacasDesdeNiveles, hojaDeEstacas } from '../../informes'
import { leerListaDeProgresivas } from '../analisis/superficies'
import { descargarBytes } from '../informes/salida'
import GraficoNiveles, { LeyendaNiveles } from '../niveles/GraficoNiveles'
import {
  capaEncima,
  capasMedidas,
  contraProyecto,
  desplazamientoSugerido,
  lineaElegida,
  lineasDeLaCalle,
  progresivasDeLaCalle,
  puestaDesdeBM,
  puntosDeIzquierdaADerecha,
  type ContraProyecto,
} from '../niveles/lineas'
import { instrumentoDe, leerNumero } from './comun'

type OrigenAltura = 'libreta' | 'bm'

const ORIGENES: { valor: OrigenAltura; texto: string }[] = [
  { valor: 'libreta', texto: 'De la libreta' },
  { valor: 'bm', texto: 'Desde un BM' },
]

const UNIDADES: { valor: UnidadLectura; texto: string }[] = [
  { valor: 'm', texto: 'm' },
  { valor: 'cm', texto: 'cm' },
  { valor: 'mm', texto: 'mm' },
]

const MIRAS: { valor: SentidoMira; texto: string }[] = [
  { valor: 'normal', texto: 'Hacia abajo' },
  { valor: 'invertida', texto: 'Invertida' },
]

const SELECTOR = 'min-h-11 w-full min-w-0 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-[15px] text-tinta'

type Tono = 'pasa' | 'aviso' | 'falla'

const SIMBOLO: Record<Tono, string> = { pasa: '✓', aviso: '△', falla: '✗' }
const CLASES_TONO: Record<Tono, string> = {
  pasa: `${CLASES_ESTADO.conforme} [.sol_&]:border [.sol_&]:border-current`,
  aviso: `${CLASES_ESTADO.alLimite} [.sol_&]:border [.sol_&]:border-current`,
  falla: `${CLASES_ESTADO.fuera} [.sol_&]:border [.sol_&]:border-current`,
}

/** Metros con signo, como se escribe un desplazamiento: «+ 0.200 m». */
function textoDesplazamiento(d: number): string {
  return `${d < 0 ? '−' : '+'} ${formatearCota(Math.abs(d))} m`
}

/** «queda 54 mm alta» / «baja» frente al proyecto. */
function textoProyecto(c: ContraProyecto): string {
  if (c.diferenciaMm === 0) return 'en cota de proyecto'
  return `${Math.abs(c.diferenciaMm)} mm ${c.diferenciaMm > 0 ? 'alta' : 'baja'} frente al proyecto`
}

function textoPendiente(p: number | null): string {
  if (p === null) return '—'
  const signo = p > 0 ? '+' : p < 0 ? '−' : ''
  return `${signo}${Math.abs(p).toFixed(2)} %`
}

/** La lectura en la unidad elegida, con los decimales que se leen en esa unidad. */
function textoLectura(f: FilaNivel, unidad: UnidadLectura): string {
  if (f.lectura === null) return '—'
  return f.lectura.toFixed(unidad === 'm' ? 3 : unidad === 'cm' ? 1 : 0)
}

/** El veredicto de una fila, del peor problema al mejor caso, con el porqué en palabras. */
function veredictoDeFila(
  f: FilaNivel,
  proyecto: ContraProyecto | null,
  base: string,
): { tono: Tono; titulo: string; detalle: string } {
  if (f.cota === null) return { tono: 'falla', titulo: 'Sin cota', detalle: f.motivoSinCota ?? 'sin línea para proyectar' }
  if (f.rango === 'imposible') {
    return { tono: 'falla', titulo: 'Cambie de estación', detalle: f.avisos.find((a) => /lectura/i.test(a)) ?? '' }
  }
  if (proyecto && proyecto.estado === 'fuera') {
    return {
      tono: 'falla',
      titulo: `Ojo: queda ${textoProyecto(proyecto)}`,
      detalle: `Si se sigue ${base}, la capa queda ${textoProyecto(proyecto)} (proyecto ${formatearCota(proyecto.cotaProyecto)}). Corrige la capa medida o replantea desde el proyecto.`,
    }
  }
  const como =
    f.como === 'proyectado' ? `Proyectado desde ${f.desde}` : f.como === 'extrapolado' ? 'Extrapolado' : 'Interpolado'
  // El primer aviso que explica cómo se obtuvo (el motor lo pone primero); «no comprobada» va aparte.
  const explicacion = f.avisos.find((a) => a !== 'no comprobada') ?? ''
  if (f.rango === 'pocoPrecisa' || !f.comprobado || f.como !== 'interpolado' || proyecto?.estado === 'alLimite') {
    const partes = [explicacion]
    if (proyecto?.estado === 'alLimite') partes.push(`Queda ${textoProyecto(proyecto)}, al límite.`)
    if (!f.comprobado) partes.push('No comprobada.')
    return { tono: 'aviso', titulo: como, detalle: partes.filter(Boolean).join(' ') }
  }
  return {
    tono: 'pasa',
    titulo: como,
    detalle: `Sobre ${base}, comprobada${proyecto ? `; ${textoProyecto(proyecto)}` : ''}.`,
  }
}

/** «05/10/2026», como se imprime la fecha en los informes. */
function fechaDeHoy(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/**
 * Replantear › Desde una capa medida: la herramienta «Pistas y veredas» de
 * Max, dentro de la app. La capa siguiente se da como «capa medida +
 * desplazamiento» (la base = la subrasante medida + 0.20 m) siguiendo las
 * pendientes de lo que ya se midió, no las del proyecto: así se reparte el
 * espesor aunque la capa de abajo haya quedado distinta del plano.
 *
 * La línea sale de las tomas de esa capa en el punto elegido de la sección
 * (`lineaDeCapa`), la AI de la libreta o de un BM, y las cuentas son todas
 * del motor (`nivelARegistrar`): interpolar, proyectar paralelo a la línea
 * más cercana o extrapolar el tramo extremo, la lectura con las reglas de la
 * mira, y «no comprobado» cuando toca. Además se compara con el proyecto: una
 * capa medida que quedó alta arrastra el error a la siguiente.
 */
export default function FichaNiveles() {
  const proyecto = useAlmacen((s) => s.proyecto)
  const calle = useAlmacen((s) => s.proyecto.calles.find((c) => c.id === s.calleActivaId) ?? null)
  const estacionActiva = useAlmacen((s) => s.estacionActiva)
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)
  const abrirAnalisis = useAlmacen((s) => s.abrirAnalisis)
  const contexto = useContexto()
  const instrumento = instrumentoDe(proyecto)

  const medidas = useMemo(() => (calle ? capasMedidas(calle, proyecto.capas) : []), [calle, proyecto.capas])
  const puntos = useMemo(() => (calle ? puntosDeIzquierdaADerecha(calle) : []), [calle])

  // De entrada, la capa de la toma activa (la que se acaba de medir) y el punto elegido en la calle.
  const capaActiva = contexto && contexto.calle.id === calle?.id ? contexto.campania.capaId : null
  const [baseId, setBaseId] = useState<string | null>(null)
  const base = medidas.find((c) => c.id === baseId) ?? medidas.find((c) => c.id === capaActiva) ?? medidas[medidas.length - 1] ?? null
  const puntoElegido = seleccion.clave ? (partirClaveCelda(seleccion.clave)?.elementoClave ?? null) : null
  const [puntoId, setPuntoId] = useState<string | null>(null)
  const punto =
    puntos.find((p) => p.id === puntoId) ??
    puntos.find((p) => p.id === puntoElegido) ??
    puntos.find((p) => p.rol === 'eje') ??
    puntos[0] ??
    null

  const [textoDesp, setTextoDesp] = useState<string | null>(null)
  const desplazamientoTexto = textoDesp ?? (base ? formatearCota(desplazamientoSugerido(proyecto.capas, base.id)) : '0.000')
  const desplazamiento = leerNumero(desplazamientoTexto)
  const destino = base ? capaEncima(proyecto.capas, base.id) : null

  const [origen, setOrigen] = useState<OrigenAltura>('libreta')
  const [bmId, setBmId] = useState<string>(proyecto.bms[0]?.id ?? '')
  const [textoVistaAtras, setTextoVistaAtras] = useState('')
  const [unidad, setUnidad] = useState<UnidadLectura>('m')
  const [mira, setMira] = useState<SentidoMira>('normal')
  const [textoExtra, setTextoExtra] = useState('')

  const bm = proyecto.bms.find((b) => b.id === bmId) ?? proyecto.bms[0] ?? null
  const indiceEstacion =
    contexto && contexto.calle.id === calle?.id
      ? Math.min(estacionActiva, Math.max(0, contexto.campania.estaciones.length - 1))
      : null
  const tomaId = contexto?.campania.id ?? null
  const puesta = useMemo((): Puesta | null => {
    if (origen === 'libreta') {
      return tomaId !== null && indiceEstacion !== null ? puestaDeLibreta(proyecto, tomaId, indiceEstacion) : null
    }
    return bm ? puestaDesdeBM(bm, leerNumero(textoVistaAtras), instrumento.largoMira) : null
  }, [origen, proyecto, tomaId, indiceEstacion, bm, textoVistaAtras, instrumento.largoMira])

  const extra = leerListaDeProgresivas(textoExtra, parsearProgresiva)
  const progresivas = useMemo(() => {
    const todas = new Set((calle ? progresivasDeLaCalle(calle) : []).map(redondear3))
    for (const p of extra.progresivas) todas.add(redondear3(p))
    return [...todas].sort((a, b) => a - b)
    // `extra` se rehace en cada dibujado: se mira el texto, que es lo que cambia.
  }, [calle, textoExtra])

  const otras = useMemo(() => (calle ? lineasDeLaCalle(proyecto, calle) : []), [proyecto, calle])
  const lineaBase = useMemo(
    () => (calle && base && punto ? lineaElegida(proyecto, calle, { capaId: base.id, puntoId: punto.id, ajusteCm: 0 }) : null),
    [proyecto, calle, base, punto],
  )

  const resultado = useMemo(() => {
    if (!lineaBase || !Number.isFinite(desplazamiento)) return null
    return nivelARegistrar({
      linea: lineaBase.linea,
      otras,
      progresivas,
      // Sin AI se dan las cotas igual: el motor lo dice y deja las lecturas en blanco.
      ai: puesta ?? { tipo: 'libreta', alturaInstrumental: Number.NaN, comprobado: false },
      desplazamientoM: desplazamiento,
      instrumento: proyecto.instrumento,
      forma: { unidad, mira },
    })
  }, [lineaBase, otras, progresivas, puesta, desplazamiento, proyecto.instrumento, unidad, mira])

  if (!calle) return <p className="text-sm text-tenue">Elige una calle.</p>
  if (medidas.length === 0 || !base || !punto) {
    return (
      <p className="text-sm text-tenue">
        Esta calle todavía no tiene ninguna capa medida: mide una en Medir para dar la siguiente desde ella.
      </p>
    )
  }

  const nombreDestino = destino?.nombre ?? 'Capa siguiente'
  const nombreBase = `${base.nombre} medida`
  const filas = resultado?.filas ?? []
  const indiceActual = Math.max(
    0,
    filas.findIndex((f) => seleccion.progresiva !== null && redondear3(f.progresiva) === redondear3(seleccion.progresiva)),
  )
  const fila = filas[indiceActual]
  const proyectoDe = (f: FilaNivel) =>
    destino && f.cota !== null ? contraProyecto(calle, proyecto.capas, destino.id, f.progresiva, punto.distancia, f.cota) : null
  const proyectoFila = fila ? proyectoDe(fila) : null
  const veredicto = fila ? veredictoDeFila(fila, proyectoFila, `la ${nombreBase.toLowerCase()}`) : null
  const conProyecto = filas.some((f) => proyectoDe(f) !== null)
  const sinLineaPropia = (lineaBase?.linea.puntos.length ?? 0) === 0

  function irAFila(i: number) {
    const f = filas[i]
    if (f) seleccionar(claveCelda(f.progresiva, punto!.id))
  }

  function descargarHoja() {
    if (!resultado || !calle || !base || !punto) return
    const conCota = resultado.filas.filter((f) => f.cota !== null)
    const bmDeLaHoja =
      origen === 'bm' && bm
        ? bm
        : (proyecto.bms.find((b) => b.id === contexto?.campania.bmInicialId) ?? proyecto.bms[0] ?? null)
    const datos = {
      ...datosDeEstacasDesdeNiveles({ ...resultado, linea: `${nombreDestino} · ${punto.nombre}` }),
      encabezado: {
        obra: proyecto.meta.obra.trim() || proyecto.meta.nombre,
        calle: calle.nombre,
        capa: `${nombreDestino} = ${base.nombre} ${textoDesplazamiento(resultado.desplazamientoM)}`,
        fecha: fechaDeHoy(),
        tramo:
          conCota.length > 0
            ? `${formatearProgresiva(conCota[0]!.progresiva)} a ${formatearProgresiva(conCota[conCota.length - 1]!.progresiva)}`
            : '',
        bm: { nombre: bmDeLaHoja?.nombre ?? '—', cota: bmDeLaHoja?.cota ?? Number.NaN },
        toleranciaMm: destino?.toleranciaMm ?? 0,
        ...(proyecto.meta.responsable.trim() ? { topografo: proyecto.meta.responsable.trim() } : {}),
      },
    }
    const nombre = `Estacas ${nombreDestino} ${punto.nombre} - ${calle.nombre}.pdf`.replace(/[\\/:*?"<>|]+/g, '-')
    descargarBytes(hojaDeEstacas(datos), nombre)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* (a) Qué se da: la capa siguiente = la capa medida + el desplazamiento. */}
      <div className={`${TARJETA_OSCURA} flex flex-col gap-0.5`}>
        <p className="text-[13px] text-cabecera-tenue">Desde una capa medida · {punto.nombre}</p>
        <p className="text-[19px] leading-tight font-bold">
          {nombreDestino} = {base.nombre} {Number.isFinite(desplazamiento) ? textoDesplazamiento(desplazamiento) : '+ ?'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[13px] text-tenue">
          <span>Capa medida</span>
          <select
            value={base.id}
            onChange={(e) => {
              setBaseId(e.target.value)
              // Otra capa de partida, otro espesor de la de encima.
              setTextoDesp(null)
            }}
            className={SELECTOR}
          >
            {medidas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-tenue">
          <span>Sumar (m)</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            value={desplazamientoTexto}
            onChange={(e) => setTextoDesp(e.target.value)}
            className={`${SELECTOR} numerico text-right`}
          />
        </label>
      </div>
      {destino && destino.espesor <= 0 && textoDesp === null && (
        <p className="text-[13px] text-tenue">
          {destino.nombre} no tiene espesor de diseño: escribe cuánto sumar, o ponle espesor en Obra › Calles.
        </p>
      )}

      {/* (b) El punto de la sección: la línea que se sigue. */}
      <div role="group" aria-label="Punto de la sección" className="flex flex-wrap gap-1">
        {puntos.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={p.id === punto.id}
            onClick={() => setPuntoId(p.id)}
            className={`min-h-11 rounded-[10px] border px-3 text-sm font-semibold ${
              p.id === punto.id ? 'border-tinta bg-cabecera text-white' : 'border-borde-fuerte bg-tarjeta text-tinta'
            }`}
          >
            {p.nombre}
          </button>
        ))}
      </div>

      {/* (c) De dónde sale la AI, como en Replantear desde el proyecto. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Altura del instrumento</legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-tenue">
            AI{' '}
            <b className="numerico text-[17px] font-semibold text-tinta">
              {resultado?.alturaInstrumental != null ? formatearCota(resultado.alturaInstrumental) : '—'}
            </b>
            {puesta?.nombre && <> · {puesta.nombre}</>}
          </p>
          <Segmentado etiqueta="Origen de la altura" opciones={ORIGENES} valor={origen} alCambiar={setOrigen} />
        </div>
        {origen === 'libreta' && !puesta && (
          <p className="text-[13px] text-tenue">
            La estación de la libreta no tiene vista atrás: escríbela en Medir o parte de un BM.
          </p>
        )}
        {origen === 'bm' && proyecto.bms.length === 0 && (
          <AvisoLinea tono="aviso">No hay BMs en este proyecto: créalos en Obra para partir de uno.</AvisoLinea>
        )}
        {origen === 'bm' && proyecto.bms.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[13px] text-tenue">
              <span>BM de partida</span>
              <select value={bm?.id ?? ''} onChange={(e) => setBmId(e.target.value)} className={SELECTOR}>
                {proyecto.bms.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre} · {formatearCota(b.cota)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-tenue">
              <span>Vista atrás al BM</span>
              <input
                inputMode="decimal"
                autoComplete="off"
                value={textoVistaAtras}
                onChange={(e) => setTextoVistaAtras(e.target.value)}
                className="numerico min-h-11 w-28 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-right text-base text-tinta"
              />
            </label>
          </div>
        )}
      </fieldset>

      {sinLineaPropia && (
        <AvisoLinea tono="aviso">
          {base.nombre} no tiene puntos medidos en {punto.nombre}: las cotas salen de las pendientes de las otras líneas,
          sin comprobar.
        </AvisoLinea>
      )}

      {/* (d) El dibujo: la capa medida y la que se va a dar, con el escáner. */}
      {lineaBase && resultado && filas.length > 0 && (
        <div className="flex flex-col gap-1">
          <GraficoNiveles
            etiqueta={`Perfil de ${nombreBase} y ${nombreDestino} a dar en ${punto.nombre}`}
            alto={200}
            lineas={[
              {
                linea: {
                  nombre: `${nombreDestino} a dar`,
                  puntos: filas
                    .filter((f) => f.cota !== null)
                    .map((f) => ({ progresiva: f.progresiva, cota: f.cota!, comprobado: f.comprobado })),
                },
                tono: 'superior',
                discontinua: true,
              },
              { linea: lineaBase.linea, tono: 'inferior', pendientes: true },
            ]}
            cursor={
              fila && fila.cota !== null
                ? {
                    progresiva: fila.progresiva,
                    desde: fila.cota,
                    hasta: fila.cota - resultado.desplazamientoM,
                    tono: veredicto?.tono === 'falla' ? 'falla' : 'tinta',
                  }
                : null
            }
          />
          <LeyendaNiveles
            lineas={[
              { nombre: `${nombreDestino} a dar`, tono: 'superior', discontinua: true },
              { nombre: nombreBase, tono: 'inferior' },
            ]}
          />
          <input
            type="range"
            min={0}
            max={Math.max(0, filas.length - 1)}
            step={1}
            value={indiceActual}
            onChange={(e) => irAFila(Number(e.target.value))}
            aria-label="Progresiva"
            aria-valuetext={fila ? formatearProgresiva(fila.progresiva) : undefined}
            className="h-8 w-full accent-[var(--color-tinta)]"
          />
        </div>
      )}

      {/* (e) La fila elegida: la cota y, en grande, lo que la mira tiene que marcar. */}
      {fila && veredicto && (
        <section aria-label="Nivel a registrar" className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[10px] border border-borde bg-tarjeta px-3 py-2">
              <p className="text-[13px] text-tenue">
                En <span className="numerico">{formatearProgresiva(fila.progresiva)}</span>, cota
              </p>
              <p className="numerico text-[20px] font-semibold">{fila.cota !== null ? formatearCota(fila.cota) : '—'}</p>
            </div>
            <div className="rounded-[10px] bg-cabecera px-3 py-2 text-white">
              <p className="text-[13px] text-cabecera-tenue">La mira debe marcar</p>
              <p className="numerico text-[26px] leading-tight font-bold text-[#FDBA74]">
                {textoLectura(fila, unidad)}
                {fila.lectura !== null && unidad !== 'm' && <span className="text-sm font-normal"> {unidad}</span>}
              </p>
            </div>
          </div>
          <div role="status" className={`rounded-[10px] px-3 py-2 text-sm leading-5 ${CLASES_TONO[veredicto.tono]}`}>
            <b>
              <span aria-hidden="true">{SIMBOLO[veredicto.tono]} </span>
              {veredicto.titulo}
            </b>
            {veredicto.detalle && <> · {veredicto.detalle}</>}
          </div>
        </section>
      )}

      {/* (f) La tabla de todas las progresivas. */}
      {filas.length > 0 && (
        <section aria-label="Niveles a registrar" className="overflow-hidden rounded-xl border border-borde">
          <div
            aria-hidden="true"
            className={`grid ${conProyecto ? 'grid-cols-[4.2rem_1fr_1fr_3.6rem_3.4rem]' : 'grid-cols-[4.2rem_1fr_1fr_4rem]'} gap-1 border-b border-borde px-3 py-2 text-xs text-tenue`}
          >
            <span>Prog.</span>
            <span>Cota</span>
            <span>Mira</span>
            <span>Pend.</span>
            {conProyecto && <span>Proy.</span>}
          </div>
          <ul>
            {filas.map((f, i) => {
              const p = proyectoDe(f)
              const activa = i === indiceActual
              const marca = f.cota === null || f.rango === 'imposible' ? ' ✗' : !f.comprobado || f.rango === 'pocoPrecisa' ? ' △' : ''
              return (
                <li key={f.progresiva}>
                  <button
                    type="button"
                    aria-current={activa ? 'true' : undefined}
                    aria-label={`${formatearProgresiva(f.progresiva)}: cota ${f.cota !== null ? formatearCota(f.cota) : 'sin cota'}, mira ${textoLectura(f, unidad)}${marca}`}
                    onClick={() => irAFila(i)}
                    className={`numerico grid min-h-11 w-full ${conProyecto ? 'grid-cols-[4.2rem_1fr_1fr_3.6rem_3.4rem]' : 'grid-cols-[4.2rem_1fr_1fr_4rem]'} items-center gap-1 border-b border-borde px-3 text-left text-sm last:border-b-0 ${
                      activa ? 'bg-fondo font-semibold' : 'hover:bg-fondo'
                    }`}
                  >
                    <span>{formatearProgresiva(f.progresiva)}</span>
                    <span>{f.cota !== null ? formatearCota(f.cota) : '—'}</span>
                    <b>
                      {textoLectura(f, unidad)}
                      {marca}
                    </b>
                    <span className="text-xs">{textoPendiente(f.pendientePct)}</span>
                    {conProyecto && (
                      <span className={`text-xs ${p?.estado === 'fuera' ? 'text-falla' : p?.estado === 'alLimite' ? 'text-aviso' : 'text-tenue'}`}>
                        {p ? `${p.diferenciaMm > 0 ? '+' : p.diferenciaMm < 0 ? '−' : ''}${Math.abs(p.diferenciaMm)}` : '—'}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {conProyecto && (
        <p className="text-[13px] text-tenue">
          Proy.: mm de la cota a dar sobre la de proyecto de {nombreDestino} (+ queda alta). △ no comprobada o poco
          precisa · ✗ no se puede leer.
        </p>
      )}

      <label className="flex flex-col gap-1 text-[13px] text-tenue">
        <span>Más progresivas (p. ej. 0+130, 140)</span>
        <input
          autoComplete="off"
          value={textoExtra}
          onChange={(e) => setTextoExtra(e.target.value)}
          className={`${SELECTOR} numerico`}
        />
      </label>
      {extra.noEntendidas.length > 0 && (
        <AvisoLinea tono="aviso">No se entiende como progresiva: {extra.noEntendidas.join(', ')}.</AvisoLinea>
      )}

      <Plegable titulo="Cómo se lee la mira" resumen={`${unidad} · ${mira === 'normal' ? 'hacia abajo' : 'invertida'}`}>
        <div className="flex flex-col gap-2 pb-2">
          <Segmentado etiqueta="Unidad de lectura" opciones={UNIDADES} valor={unidad} alCambiar={setUnidad} />
          <Segmentado etiqueta="Mira" opciones={MIRAS} valor={mira} alCambiar={setMira} />
          <p className="text-[13px] text-tenue">
            {mira === 'normal'
              ? 'Mira apoyada en el punto: cota = AI − lectura.'
              : 'Mira colgada de un techo: cota = AI + lectura.'}
          </p>
        </div>
      </Plegable>

      {resultado && resultado.avisos.length > 0 && (
        <Plegable titulo="Avisos" resumen={String(resultado.avisos.length)}>
          <ul className="flex flex-col gap-1 pb-2">
            {[...resultado.avisos, ...(lineaBase?.avisos ?? [])].map((a) => (
              <li key={a}>
                <AvisoLinea tono="aviso">{a}</AvisoLinea>
              </li>
            ))}
          </ul>
        </Plegable>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => abrirAnalisis('separacion')} className={BOTON_SECUNDARIO}>
          Comprobar separación
        </button>
        <button type="button" onClick={descargarHoja} disabled={!resultado} className={BOTON_PRINCIPAL}>
          Hoja de estacas
        </button>
      </div>
    </div>
  )
}
