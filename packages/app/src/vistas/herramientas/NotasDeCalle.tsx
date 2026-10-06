import { formatearProgresiva, parsearProgresiva, type Id, type Nota } from '@topo/core'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useAlmacen } from '../../estado/almacen'
import { reducirFoto } from './fotos'

interface Props {
  calleId: Id
}

/** Lo que más se anota en obra: un toque en vez de escribirlo con el pulgar. */
const FRASES_RAPIDAS = ['Buzón', 'Sardinel vaciado', 'Material acopiado', 'Interferencia', 'Agua empozada']

const SIN_NOTAS: Nota[] = []

function fechaLegible(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  return fecha.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
}

/** Agrega una frase al texto, separada por coma, sin repetirla si ya está. */
function conFrase(texto: string, frase: string): string {
  const limpio = texto.trim()
  if (limpio === '') return frase
  if (limpio.split(/,\s*/).includes(frase)) return limpio
  return `${limpio}, ${frase}`
}

function FilaNota({ nota, alBorrar }: { nota: Nota; alBorrar: () => void }) {
  const [confirmando, setConfirmando] = useState(false)
  const progresiva = formatearProgresiva(nota.progresiva)
  const resumen = nota.texto.trim() || 'foto'

  return (
    <li className="flex flex-col gap-2 rounded border border-slate-200 p-3 dark:border-slate-700">
      {nota.texto.trim() !== '' && <p className="text-base break-words">{nota.texto}</p>}
      {nota.foto && (
        <img
          src={nota.foto}
          alt={`Foto de la nota en ${progresiva}`}
          className="max-h-64 w-full rounded object-contain sm:w-auto"
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">{fechaLegible(nota.fecha)}</span>
        {confirmando ? (
          <span className="flex gap-2">
            <button
              type="button"
              onClick={alBorrar}
              className="min-h-11 rounded border border-falla px-3 text-sm font-semibold text-falla hover:bg-falla/10"
            >
              Sí, borrar
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              No
            </button>
          </span>
        ) : (
          <button
            type="button"
            aria-label={`Borrar la nota «${resumen}» en ${progresiva}`}
            onClick={() => setConfirmando(true)}
            className="min-h-11 rounded px-3 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span aria-hidden="true">✗ </span>Borrar
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * Notas de campo de una calle: texto y foto por progresiva. La progresiva
 * llega llena con la fila que se está mirando; las frases rápidas y la foto
 * de la cámara hacen que anotar sea cuestión de dos o tres toques.
 */
export default function NotasDeCalle({ calleId }: Props) {
  const notas = useAlmacen((s) => s.proyecto.calles.find((c) => c.id === calleId)?.notas ?? SIN_NOTAS)
  const progresivaSeleccionada = useAlmacen((s) => (s.calleActivaId === calleId ? s.seleccion.progresiva : null))
  const agregarNota = useAlmacen((s) => s.agregarNota)
  const eliminarNota = useAlmacen((s) => s.eliminarNota)

  const [progresivaEscrita, setProgresivaEscrita] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [foto, setFoto] = useState<string | null>(null)
  const [cargandoFoto, setCargandoFoto] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const idTitulo = useId()
  // Cada foto elegida lleva su número: si se elige otra mientras se reduce
  // la primera, o se cambia de calle, la que llega tarde se descarta.
  const peticionFoto = useRef(0)

  // Un borrador es de una calle: si la calle cambia (Revisar la monta sin
  // key), lo escrito para la otra no se guarda aquí (patrón de estado previo).
  const [calleDelBorrador, setCalleDelBorrador] = useState(calleId)
  if (calleDelBorrador !== calleId) {
    setCalleDelBorrador(calleId)
    setTexto('')
    setFoto(null)
    setCargandoFoto(false)
    setProgresivaEscrita(null)
    setMensaje(null)
  }
  // Una foto de la calle anterior que todavía se esté reduciendo ya no vale.
  useEffect(() => {
    peticionFoto.current += 1
  }, [calleId])

  // Si se selecciona otra fila, la progresiva vuelve a seguirla aunque antes
  // se hubiera escrito una a mano.
  const [seleccionPrevia, setSeleccionPrevia] = useState(progresivaSeleccionada)
  if (seleccionPrevia !== progresivaSeleccionada) {
    setSeleccionPrevia(progresivaSeleccionada)
    setProgresivaEscrita(null)
  }

  // Mientras no se escriba otra, la progresiva sigue a la fila seleccionada.
  const progresivaTexto =
    progresivaEscrita ?? (progresivaSeleccionada !== null ? formatearProgresiva(progresivaSeleccionada) : '')
  const progresiva = parsearProgresiva(progresivaTexto)
  const puedeGuardar = progresiva !== null && (texto.trim() !== '' || foto !== null) && !cargandoFoto

  const grupos = useMemo(() => {
    const porProgresiva = new Map<number, Nota[]>()
    for (const nota of notas) {
      const lista = porProgresiva.get(nota.progresiva) ?? []
      lista.push(nota)
      porProgresiva.set(nota.progresiva, lista)
    }
    return [...porProgresiva.entries()]
      .sort(([a], [b]) => a - b)
      .map(([prog, lista]) => ({ progresiva: prog, notas: [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha)) }))
  }, [notas])

  async function alElegirFoto(archivo: File | undefined) {
    if (!archivo) return
    const esta = ++peticionFoto.current
    setCargandoFoto(true)
    setMensaje(null)
    try {
      const reducida = await reducirFoto(archivo)
      if (esta === peticionFoto.current) setFoto(reducida)
    } catch {
      if (esta === peticionFoto.current) setMensaje('No se pudo leer la foto. Pruebe tomarla otra vez.')
    } finally {
      if (esta === peticionFoto.current) setCargandoFoto(false)
    }
  }

  function guardar() {
    if (!puedeGuardar || progresiva === null) return
    agregarNota(calleId, {
      progresiva,
      texto: texto.trim(),
      fecha: new Date().toISOString(),
      ...(foto ? { foto } : {}),
    })
    setTexto('')
    setFoto(null)
    setProgresivaEscrita(null)
    setMensaje(`Nota guardada en ${formatearProgresiva(progresiva)}.`)
  }

  return (
    <section aria-labelledby={idTitulo} className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-4 sm:p-6">
      <h2 id={idTitulo} className="text-lg font-semibold">
        Notas de la calle
      </h2>

      <form
        aria-label="Nueva nota"
        onSubmit={(evento) => {
          evento.preventDefault()
          guardar()
        }}
        className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
      >
        <label className="flex w-40 flex-col gap-1">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Progresiva</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0+020"
            value={progresivaTexto}
            onChange={(evento) => setProgresivaEscrita(evento.target.value)}
            aria-invalid={progresivaTexto.trim() !== '' && progresiva === null}
            className="numerico min-h-11 rounded border border-slate-300 bg-white px-2 text-base outline-none focus:border-marca focus:ring-2 focus:ring-marca dark:border-slate-600 dark:bg-slate-900"
          />
        </label>

        <div role="group" aria-label="Frases rápidas" className="flex flex-wrap gap-2">
          {FRASES_RAPIDAS.map((frase) => (
            <button
              key={frase}
              type="button"
              onClick={() => setTexto((t) => conFrase(t, frase))}
              className="min-h-11 rounded-full border border-slate-300 px-3 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              {frase}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Texto de la nota</span>
          <textarea
            rows={2}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-2 text-base outline-none focus:border-marca focus:ring-2 focus:ring-marca dark:border-slate-600 dark:bg-slate-900"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded border border-slate-300 px-3 text-sm font-medium hover:bg-slate-100 focus-within:ring-2 focus-within:ring-marca dark:border-slate-600 dark:hover:bg-slate-800">
            <span>{foto ? 'Cambiar foto' : 'Tomar foto'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              // El nombre empieza por lo que se ve escrito: quien maneja por voz
              // dice «Tomar foto» y lo encuentra (WCAG 2.5.3).
              aria-label={`${foto ? 'Cambiar foto' : 'Tomar foto'} de la nota`}
              className="sr-only"
              onChange={(evento) => {
                void alElegirFoto(evento.target.files?.[0])
                // Así se puede volver a elegir la misma foto después de quitarla.
                evento.target.value = ''
              }}
            />
          </label>
          {cargandoFoto && <span className="text-sm text-slate-600 dark:text-slate-300">Reduciendo la foto…</span>}
          {foto && (
            <>
              <img src={foto} alt="Foto por guardar" className="h-16 w-16 rounded object-cover" />
              <button
                type="button"
                onClick={() => setFoto(null)}
                className="min-h-11 rounded px-3 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Quitar foto
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!puedeGuardar}
            className="min-h-11 rounded bg-marca px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            Guardar nota
          </button>
          {progresiva === null && (
            <span className="text-sm text-slate-600 dark:text-slate-300">Escriba la progresiva (por ejemplo 0+020).</span>
          )}
        </div>
        <p role="status" className="min-h-5 text-sm text-slate-700 dark:text-slate-200">
          {mensaje}
        </p>
      </form>

      {grupos.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">Todavía no hay notas en esta calle.</p>
      ) : (
        <ol aria-label="Notas por progresiva" className="flex flex-col gap-4">
          {grupos.map((grupo) => {
            const titulo = formatearProgresiva(grupo.progresiva)
            return (
              <li key={grupo.progresiva} className="flex flex-col gap-2">
                <h3 className="numerico text-sm font-semibold">{titulo}</h3>
                <ul aria-label={`Notas en ${titulo}`} className="flex flex-col gap-2">
                  {grupo.notas.map((nota) => (
                    <FilaNota key={nota.id} nota={nota} alBorrar={() => eliminarNota(calleId, nota.id)} />
                  ))}
                </ul>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
