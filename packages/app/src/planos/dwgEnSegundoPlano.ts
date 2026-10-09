/**
 * Lee un DWG en el trabajador (dwgTrabajador.ts) y devuelve el plano. Va
 * aparte porque `new Worker(new URL(…))` solo lo entiende Vite; las pruebas
 * de pantalla cambian este módulo.
 */
import type { PlanoVectorial } from './dxf'
import { ErrorDxf } from './dxf'

let trabajador: Worker | null = null
let siguiente = 1
const pendientes = new Map<number, { resolver: (p: PlanoVectorial) => void; rechazar: (e: Error) => void }>()

function elTrabajador(): Worker {
  if (trabajador) return trabajador
  trabajador = new Worker(new URL('./dwgTrabajador.ts', import.meta.url), { type: 'module' })
  trabajador.onmessage = (e: MessageEvent<{ id: number; plano?: PlanoVectorial; error?: string }>) => {
    const p = pendientes.get(e.data.id)
    if (!p) return
    pendientes.delete(e.data.id)
    if (e.data.plano) p.resolver(e.data.plano)
    else p.rechazar(new ErrorDxf(e.data.error ?? 'No se pudo leer el DWG.'))
  }
  trabajador.onerror = (e) => {
    // Si el trabajador mismo se cae (sin memoria, el .wasm no cargó), se
    // avisa a todos los que esperaban y se crea otro la próxima vez.
    for (const p of pendientes.values()) p.rechazar(new ErrorDxf(`El lector de DWG falló (${e.message || 'sin detalle'}). Prueba de nuevo.`))
    pendientes.clear()
    trabajador?.terminate()
    trabajador = null
  }
  return trabajador
}

export function leerDwgEnSegundoPlano(bytes: Uint8Array): Promise<PlanoVectorial> {
  return new Promise((resolver, rechazar) => {
    const id = siguiente++
    pendientes.set(id, { resolver, rechazar })
    // Se manda una copia: los bytes del proyecto se siguen usando aquí.
    elTrabajador().postMessage({ id, bytes: bytes.slice() })
  })
}
