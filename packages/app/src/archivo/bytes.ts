/**
 * Los bytes de un archivo elegido en el navegador.
 *
 * Se leen con `FileReader` y no con `archivo.arrayBuffer()` porque el segundo
 * no existe en el entorno donde corren las pruebas, y un camino de entrada que
 * no se puede probar es un camino sin red. `FileReader` está en todos los
 * navegadores desde hace años y hace exactamente lo mismo.
 */
export function bytesDelArchivo(archivo: File): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => resolver(new Uint8Array(lector.result as ArrayBuffer))
    lector.onerror = () =>
      rechazar(
        new Error('No se pudo leer el archivo: el navegador no lo dejó abrir. Inténtalo otra vez.'),
      )
    lector.readAsArrayBuffer(archivo)
  })
}
