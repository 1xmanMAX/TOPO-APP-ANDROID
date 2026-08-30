import { anadirPalabra, seccionDeFabrica, type Seccion } from '@topo/core'
import { leerXlsx, type HojaLeida } from '../archivo/leerTabla'

/** Lo justo de Node que hace falta para abrir el archivo de muestra. */
interface ArchivosDeNode {
  existsSync(ruta: string): boolean
  readFileSync(ruta: string): Uint8Array
}

/**
 * Se declara aquí, y se pide con `getBuiltinModule` en vez de con un
 * `import`, por dos razones. Una: `@types/node` no está instalado y este
 * proyecto no añade dependencias. Y otra, la que de verdad importa: así el
 * acceso al disco queda encerrado en este archivo de pruebas, y nada del resto
 * de la app —que corre en un navegador y sin internet— puede terminar
 * importando `node:fs` sin que nadie se dé cuenta.
 */
declare const process: {
  cwd(): string
  getBuiltinModule(nombre: string): unknown
}

const RUTA_EN_EL_PAQUETE = 'src/pruebas/muestras/detras-del-colegio.xlsx'

/**
 * Dónde está la muestra en el disco.
 *
 * No se puede sacar de `import.meta.url`: las pruebas corren con el entorno
 * jsdom, donde los módulos se sirven por http y esa dirección no es una ruta
 * de disco. Se busca desde el directorio de trabajo, que es el del paquete
 * cuando se corre `npm test --workspace packages/app` y el de la raíz cuando
 * se corre la batería entera.
 */
function rutaDeLaMuestra(archivos: ArchivosDeNode): string {
  const desdeElPaquete = `${process.cwd()}/${RUTA_EN_EL_PAQUETE}`
  if (archivos.existsSync(desdeElPaquete)) return desdeElPaquete
  return `${process.cwd()}/packages/app/${RUTA_EN_EL_PAQUETE}`
}

/**
 * Los bytes crudos del archivo real que Max mandó el 2026-08-29, tal como
 * salió de Google Sheets. Son los que necesita quien quiera armar un `File`
 * de verdad y meterlo por el campo de subir archivo de la pantalla.
 *
 * Node se pide aquí dentro y no en el cuerpo del módulo: si una pantalla
 * importara este archivo por error, reventaría al llamar a esta función —donde
 * se ve qué se estaba haciendo— y no al cargarse, con un «process no existe»
 * que no dice nada.
 */
export function bytesDetrasDelColegio(): Uint8Array<ArrayBuffer> {
  const archivos = process.getBuiltinModule('node:fs') as ArchivosDeNode
  // La copia no es de adorno: fija que los bytes viven en un ArrayBuffer
  // normal, que es lo único que acepta el constructor de `File`.
  return new Uint8Array(archivos.readFileSync(rutaDeLaMuestra(archivos)))
}

/**
 * El archivo real que Max mandó el 2026-08-29, ya leído como tabla de celdas.
 * Es la prueba de que la app lee su hoja y no una hoja de laboratorio.
 */
export function hojaDetrasDelColegio(): HojaLeida {
  return leerXlsx(bytesDetrasDelColegio())[0]!
}

/** La sección que Max habría declarado para esa calle: sus palabras sobre la de fábrica. */
export function seccionDeMax(): Seccion {
  let s = seccionDeFabrica()
  s = anadirPalabra(s, 'p-borde-i', 'IZQ')
  s = anadirPalabra(s, 'p-borde-d', 'DER')
  return s
}
