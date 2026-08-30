import { ladoDe, type PuntoSeccion, type Seccion } from '@topo/core'
import { letraDeColumna } from '../archivo/xlsx'
import { cuenta } from '../formato'
import { agruparNoImportado } from '../importar/agrupar'
import type { HojaInterpretada } from '../importar/interpretar'
import DibujoSeccion from './DibujoSeccion'

interface Props {
  /** La hoja ya leída con la sección de abajo. Solo se enseña: no se toca nada. */
  leida: HojaInterpretada
  /** La sección con la que se leyó, incluidas las columnas colocadas a mano. */
  seccion: Seccion
}

/**
 * El lado dicho en palabras, que es como se lee una sección: el signo no se
 * lee en voz alta, el lado sí.
 */
function ladoEnPalabras(distancia: number): string {
  const lado = ladoDe(distancia)
  if (lado === 'eje') return 'en el eje'
  return `a ${Math.abs(distancia).toFixed(2)} m a la ${lado}`
}

/**
 * Los puntos tal como se dibujan: de izquierda a derecha, y los que recibieron
 * columna rotulados con la palabra que traía la hoja, no con la suya. Así se ve
 * de un vistazo qué cayó dónde, que es lo primero que pide el spec antes de
 * aceptar.
 */
function puntosDelDibujo(seccion: Seccion, leida: HojaInterpretada): PuntoSeccion[] {
  const palabraPorPunto = new Map(leida.columnas.map((col) => [col.puntoId, col.palabra]))

  return [...seccion.puntos]
    .sort((a, b) => a.distancia - b.distancia)
    .map((punto) => {
      const palabra = palabraPorPunto.get(punto.id)
      return palabra ? { ...punto, palabras: [palabra] } : punto
    })
}

/**
 * Todo lo que la app entendió de una hoja, y —sobre todo— lo que no, antes de
 * que nada entre en el proyecto.
 *
 * No escribe: solo depende de la hoja leída y de la sección con la que se leyó.
 * Por eso sirve igual para una sección guardada que para una que todavía se
 * está proponiendo, y por eso se puede mirar sin miedo a que mirar cambie algo.
 */
export default function VistaPreviaHoja({ leida, seccion }: Props) {
  const progresivas = new Set(leida.lecturas.map((lectura) => lectura.progresiva)).size
  const puntosMedidos = new Set(leida.lecturas.map((lectura) => lectura.puntoId)).size
  const noImportado = agruparNoImportado(leida.noImportado)
  const ordenados = [...seccion.puntos].sort((a, b) => a.distancia - b.distancia)

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Qué columna cayó en qué punto</h3>
        <DibujoSeccion puntos={puntosDelDibujo(seccion, leida)} />
        <ul className="flex flex-col gap-1 text-sm">
          {ordenados.map((punto) => {
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
            {leida.vistaAtras === null ? 'no la encontré en la hoja' : leida.vistaAtras.toFixed(3)}
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
                key={`${indice}-${referencia.elemento}`}
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
                <span className="text-slate-500 dark:text-slate-400">{cosa.motivos.join(' ')}</span>
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
            {leida.conflictos.map((conflicto, indice) => (
              // La llave lleva la posición porque dos filas de referencia
              // iguales dan dos conflictos con el mismo texto, y dos llaves
              // repetidas serían un aviso de React en la salida de las pruebas.
              <li
                key={`${indice}-${conflicto.que}`}
                className="rounded border border-aviso bg-aviso/10 px-3 py-2 text-aviso"
              >
                {conflicto.que}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
