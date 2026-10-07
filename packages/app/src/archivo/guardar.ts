import { Capacitor } from '@capacitor/core'

/**
 * La única puerta por la que sale un archivo de la app: Excel, CSV, PDF y `.topo`.
 *
 * En el navegador y en la app de escritorio (Electron) basta el enlace con
 * `download`. En la app de Android no: el WebView ignora ese enlace y el
 * archivo no llegaría a ninguna parte. Allí se escribe en la caché de la app
 * y se abre el menú de compartir del teléfono, desde donde el topógrafo lo
 * guarda en Descargas, lo manda por WhatsApp o lo sube a Drive.
 */
export function guardarArchivo(datos: Uint8Array | string, nombre: string, tipo: string): void {
  if (Capacitor.isNativePlatform()) {
    void guardarEnTelefono(datos, nombre).catch((e: unknown) => {
      console.error('No se pudo guardar el archivo en el teléfono', e)
      window.alert(`No se pudo guardar «${nombre}».`)
    })
    return
  }

  const url = URL.createObjectURL(new Blob([datos as BlobPart], { type: tipo }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(url)
}

async function guardarEnTelefono(datos: Uint8Array | string, nombre: string): Promise<void> {
  // Se cargan solo en el teléfono: en el navegador no hacen falta.
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  const bytes = typeof datos === 'string' ? new TextEncoder().encode(datos) : datos
  const { uri } = await Filesystem.writeFile({
    path: nombre,
    data: aBase64(bytes),
    directory: Directory.Cache,
  })
  try {
    await Share.share({ title: nombre, files: [uri], dialogTitle: `Guardar ${nombre}` })
  } catch (e) {
    // Cerrar el menú sin elegir no es un fallo: lo decidió el topógrafo.
    if (/cancel/i.test(String((e as { message?: string } | null)?.message ?? e))) return
    throw e
  }
}

function aBase64(bytes: Uint8Array): string {
  let binario = ''
  const trozo = 0x8000
  for (let i = 0; i < bytes.length; i += trozo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + trozo))
  }
  return btoa(binario)
}
