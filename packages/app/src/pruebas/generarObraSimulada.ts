import { empaquetarProyecto } from '../archivo/topo'
import { construirObraSimulada, esperadoEnJson } from './obraSimulada'

/**
 * Escribe la obra simulada para los guiones de navegador:
 *
 *   packages/app/verificacion/datos/obra-simulada.topo
 *   packages/app/verificacion/datos/obra-simulada.esperado.json
 *
 * Se corre desde packages/app con:
 *
 *   npx vite-node src/pruebas/generarObraSimulada.ts
 *
 * (vite-node ya viene con vitest: no hace falta instalar nada). Los dos
 * archivos se guardan en el repositorio; `obraSimulada.test.ts` falla si
 * dejan de coincidir con `construirObraSimulada()` y `ESPERADO`, así que
 * después de tocar la obra hay que volver a correr esto. Es un programa:
 * ninguna prueba lo importa.
 */

/** Lo justo de Node, pedido así por lo mismo que en pruebas/muestras.ts: sin @types/node. */
declare const process: { cwd(): string; getBuiltinModule(nombre: string): unknown }
interface ArchivosDeNode {
  existsSync(ruta: string): boolean
  mkdirSync(ruta: string, opciones: { recursive: boolean }): void
  writeFileSync(ruta: string, datos: Uint8Array | string): void
}

/** La carpeta de datos, se corra desde el paquete o desde la raíz del repositorio. */
function carpetaDeDatos(fs: ArchivosDeNode): string {
  const desdeElPaquete = `${process.cwd()}/verificacion`
  if (fs.existsSync(desdeElPaquete)) return `${desdeElPaquete}/datos`
  return `${process.cwd()}/packages/app/verificacion/datos`
}

const fs = process.getBuiltinModule('node:fs') as ArchivosDeNode
const carpeta = carpetaDeDatos(fs)
fs.mkdirSync(carpeta, { recursive: true })
const { proyecto, archivosDePlano } = construirObraSimulada()
const topo = empaquetarProyecto(proyecto, archivosDePlano)
fs.writeFileSync(`${carpeta}/obra-simulada.topo`, topo)
fs.writeFileSync(`${carpeta}/obra-simulada.esperado.json`, esperadoEnJson())
console.log(`Escrito ${carpeta}/obra-simulada.topo (${topo.length} bytes) y obra-simulada.esperado.json`)
