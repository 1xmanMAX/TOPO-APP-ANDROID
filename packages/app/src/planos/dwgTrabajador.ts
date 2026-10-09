/// <reference lib="webworker" />
/**
 * Trabajador que lee los DWG fuera del hilo de la pantalla: LibreDWG en
 * WebAssembly tarda de décimas a varios segundos en un plano grande, y así
 * la app sigue respondiendo mientras tanto. Recibe los bytes y devuelve el
 * plano ya convertido (o el mensaje de error, en español).
 *
 * El .wasm (9 MB) lo copia Vite junto a la app: funciona sin internet, en
 * el navegador, en Android y en Windows. Se carga una sola vez por
 * trabajador.
 */
import { createModule, Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web'
import urlWasm from 'libredwg-wasm/libredwg-web.wasm?url'
import { leerDwg, type BaseDwg, type BibliotecaDwg } from './dwg'

let biblioteca: Promise<BibliotecaDwg> | null = null

function cargar(): Promise<BibliotecaDwg> {
  biblioteca ??= (async () => {
    // El .wasm se pide por la URL que le dio Vite (con su huella en el nombre).
    const instancia = await (createModule as unknown as (o: object) => Promise<unknown>)({ locateFile: () => urlWasm })
    const lib = LibreDwg.createByWasmInstance(instancia as Parameters<typeof LibreDwg.createByWasmInstance>[0])
    return {
      leer(bytes: Uint8Array): BaseDwg {
        const dwg = lib.dwg_read_data(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, Dwg_File_Type.DWG)
        if (!dwg) throw new Error('LibreDWG no pudo abrirlo')
        try {
          return lib.convert(dwg) as unknown as BaseDwg
        } finally {
          lib.dwg_free(dwg)
        }
      },
    }
  })()
  return biblioteca
}

self.onmessage = async (evento: MessageEvent<{ id: number; bytes: Uint8Array }>) => {
  const { id, bytes } = evento.data
  try {
    const plano = leerDwg(bytes, await cargar())
    self.postMessage({ id, plano })
  } catch (e) {
    self.postMessage({ id, error: e instanceof Error ? e.message : String(e) })
  }
}
