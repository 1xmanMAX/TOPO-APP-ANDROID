/**
 * Fotos de campo. La foto viaja dentro del JSON del proyecto como dataURL, así
 * que se reduce antes de guardarla: una foto de celular de 12 MP pesaría
 * varios MB y haría lento el autoguardado. A 1280 px de lado se sigue leyendo
 * un buzón o una grieta.
 */

export const LADO_MAXIMO_FOTO = 1280
const CALIDAD_JPEG = 0.8

/** Medidas que caben en `ladoMaximo` sin deformar. Una foto pequeña no se agranda. */
export function medidasReducidas(
  ancho: number,
  alto: number,
  ladoMaximo: number = LADO_MAXIMO_FOTO,
): { ancho: number; alto: number } {
  if (!(ancho > 0) || !(alto > 0)) return { ancho: 0, alto: 0 }
  const escala = Math.min(1, ladoMaximo / Math.max(ancho, alto))
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) }
}

function leerComoDataUrl(archivo: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => resolver(String(lector.result))
    lector.onerror = () => rechazar(lector.error ?? new Error('No se pudo leer la foto.'))
    lector.readAsDataURL(archivo)
  })
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image()
    imagen.onload = () => resolver(imagen)
    imagen.onerror = () => rechazar(new Error('El archivo no es una imagen que se pueda abrir.'))
    imagen.src = url
  })
}

/**
 * La foto reducida a `ladoMaximo` px de lado, como JPEG en dataURL. Si el
 * navegador no puede dibujarla (sin canvas), se guarda tal cual: es mejor una
 * foto pesada que perder la foto.
 */
export async function reducirFoto(archivo: Blob, ladoMaximo: number = LADO_MAXIMO_FOTO): Promise<string> {
  const original = await leerComoDataUrl(archivo)
  const imagen = await cargarImagen(original)
  const { ancho, alto } = medidasReducidas(imagen.naturalWidth, imagen.naturalHeight, ladoMaximo)
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const pincel = lienzo.getContext('2d')
  if (!pincel || ancho === 0) return original
  pincel.drawImage(imagen, 0, 0, ancho, alto)
  return lienzo.toDataURL('image/jpeg', CALIDAD_JPEG)
}
