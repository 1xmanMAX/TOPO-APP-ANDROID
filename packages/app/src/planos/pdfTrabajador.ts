/// <reference types="vite/client" />
/**
 * Configura el trabajador (worker) de pdfjs para la app servida por Vite.
 *
 * Va aparte de pdf.ts a propósito: el `?url` solo lo entiende Vite, y así las
 * pruebas, que abren los PDF en node con el build «legacy», no lo cargan.
 * La interfaz lo importa una vez, antes de abrir el primer plano:
 *   import './planos/pdfTrabajador'
 * Sin internet: Vite copia el archivo del trabajador junto a la app.
 */
import { GlobalWorkerOptions } from 'pdfjs-dist'
import urlTrabajador from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = urlTrabajador
