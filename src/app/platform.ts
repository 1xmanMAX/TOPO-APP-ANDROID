/**
 * Capacidades de plataforma detrás de una interfaz común:
 * guardar/compartir archivos, abrir archivos, GPS del teléfono, vibración.
 * En Android (Capacitor) usa Filesystem + Share; en web descarga el archivo.
 */
import { Capacitor } from '@capacitor/core';
import { useStore } from './store';

export const isNative = () => Capacitor.isNativePlatform();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Guarda (y en Android, comparte) un archivo. */
export async function saveFile(filename: string, data: Blob | string, mime = 'application/octet-stream'): Promise<void> {
  const blob = typeof data === 'string' ? new Blob([data], { type: `${mime};charset=utf-8` }) : data;
  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64 = await blobToBase64(blob);
    const res = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    await Share.share({ title: filename, files: [res.uri], dialogTitle: 'Compartir archivo' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Abre el selector de archivos y devuelve los archivos elegidos. */
export function pickFiles(accept = '*/*', multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

/** Lee un archivo como texto, detectando UTF-8 y cayendo a Latin-1 si hay caracteres inválidos. */
export async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('latin1').decode(buf);
}

export interface PhoneFix {
  lat: number;
  lon: number;
  alt?: number;
  accuracy: number;
}

/** Posición del GPS interno del teléfono (precisión de metros, para croquis). */
export function getPhonePosition(timeoutMs = 20000): Promise<PhoneFix> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('GPS no disponible en este dispositivo'));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          alt: p.coords.altitude ?? undefined,
          accuracy: p.coords.accuracy,
        }),
      (e) => reject(new Error(e.message || 'No se pudo obtener la posición')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

export function vibrate(ms = 12): void {
  if (!useStore.getState().settings.haptics) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* sin soporte */
  }
}

