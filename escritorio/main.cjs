// TOPO para Windows: la misma app web, servida desde dentro del ejecutable.
//
// Se sirve por un protocolo propio (topo://app/) y no con file://: así el
// trabajador de pdfjs, que es un módulo, carga igual que en el navegador, y
// IndexedDB (el autoguardado) tiene un origen fijo que no cambia entre
// versiones instaladas en otra carpeta.
const { app, BrowserWindow, protocol, net, shell } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const WEB = path.join(__dirname, 'web')

protocol.registerSchemesAsPrivileged([
  { scheme: 'topo', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])

function crearVentana() {
  const ventana = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'TOPO',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: { contextIsolation: true, sandbox: true },
  })

  // Los enlaces de fuera (normativa, ayuda) se abren en el navegador.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  ventana.loadURL('topo://app/index.html')
}

// Una sola ventana: abrir el acceso directo otra vez la trae al frente.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [ventana] = BrowserWindow.getAllWindows()
    if (ventana) {
      if (ventana.isMinimized()) ventana.restore()
      ventana.focus()
    }
  })

  app.whenReady().then(() => {
    protocol.handle('topo', (peticion) => {
      const ruta = decodeURIComponent(new URL(peticion.url).pathname)
      const archivo = path.normalize(path.join(WEB, ruta))
      if (!archivo.startsWith(WEB)) return new Response('', { status: 403 })
      return net.fetch(pathToFileURL(archivo).toString())
    })
    crearVentana()
  })

  app.on('window-all-closed', () => app.quit())
}
