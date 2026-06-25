const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, shell, Notification } = require('electron')
const path = require('path')
const { spawn, exec } = require('child_process')

// ── Single instance lock — prevents duplicate windows ─────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

const isDev = process.argv.includes('--dev')
const BACKEND_URL = 'http://localhost:8000'

// Allow self-signed SSL cert for localhost — needed for wss:// WebSocket
app.commandLine.appendSwitch('ignore-certificate-errors')
app.commandLine.appendSwitch('allow-running-insecure-content')
app.commandLine.appendSwitch('ignore-urlfetcher-cert-requests')

// In dev: load Vite dev server. In production: load bundled frontend files directly.
function getFrontendURL() {
  if (isDev) return 'http://localhost:5173'
  // electron-builder copies frontend/dist → resources/frontend/dist
  const bundled = path.join(process.resourcesPath, 'frontend', 'dist', 'index.html')
  if (require('fs').existsSync(bundled)) {
    // Use Electron's built-in url formatter — handles Windows backslashes correctly
    const { pathToFileURL } = require('url')
    return pathToFileURL(bundled).href
  }
  // Fallback: serve via backend
  return BACKEND_URL
}
const FRONTEND_URL = getFrontendURL()

let mainWindow = null
let tray = null
let backendProcess = null
let isQuitting = false

// ── Backend management ────────────────────────────────────────────

function findBackendDir() {
  const fs = require('fs')
  // Candidate locations, in priority order
  const candidates = [
    path.join(__dirname, '..', 'backend'),                    // dev: electron/../backend
    path.join(process.resourcesPath || __dirname, 'backend'), // bundled
    path.join(require('os').homedir(), 'JARVIS', 'backend'),  // home fallback
  ]
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, '.venv', 'Scripts', 'python.exe'))) return dir
    } catch {}
  }
  return null
}

async function isBackendAlreadyRunning() {
  const http = require('http')
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8000/api/health/', { timeout: 1500 }, (r) => {
      resolve(r.statusCode === 200)
      r.resume()
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

async function startBackend() {
  // Don't start a second copy if one is already serving
  if (await isBackendAlreadyRunning()) {
    console.log('Backend already running — reusing existing instance')
    return
  }

  const backendDir = findBackendDir()
  if (!backendDir) {
    console.error('Backend .venv not found in any known location — cannot start backend')
    return
  }
  const pythonExe = path.join(backendDir, '.venv', 'Scripts', 'python.exe')
  console.log('Starting JARVIS backend from', backendDir)

  backendProcess = spawn(pythonExe, ['-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', '8000'], {
    cwd: backendDir,
    windowsHide: true,
    detached: false,
    env: { ...process.env, PYTHONPATH: '', PYTHONHOME: '' },
  })

  backendProcess.stdout.on('data', d => console.log('[BACKEND]', d.toString()))
  backendProcess.stderr.on('data', d => console.error('[BACKEND]', d.toString()))

  backendProcess.on('exit', (code) => {
    backendProcess = null
    if (!isQuitting) {
      console.log(`Backend exited (${code}), restarting in 3s...`)
      setTimeout(startBackend, 3000)
    }
  })

  console.log('JARVIS Core started (PID:', backendProcess.pid, ')')
}

// ── Main window ───────────────────────────────────────────────────

function resolveIcon(name = 'icon') {
  const exts = ['ico', 'png', 'svg']
  for (const ext of exts) {
    const p = path.join(__dirname, 'assets', `${name}.${ext}`)
    if (require('fs').existsSync(p)) return p
  }
  return undefined
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#020b18',
    frame: false,
    transparent: false,
    show: false,
    icon: resolveIcon('icon'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Show the window immediately — the frontend shows "CONNECTING" and its
  // WebSocket auto-reconnects the moment the backend finishes booting.
  mainWindow.loadURL(FRONTEND_URL)
  mainWindow.maximize()
  mainWindow.show()
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })

  // Quietly confirm backend health in the background (for logging only)
  waitForBackend(BACKEND_URL + '/api/health/')
    .then(() => console.log('Backend confirmed online'))
    .catch(() => console.warn('Backend health check timed out — frontend will keep retrying'))

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
}

async function waitForBackend(url, retries = 40) {
  const http = require('http')
  for (let i = 0; i < retries; i++) {
    try {
      const ok = await new Promise((resolve) => {
        const req = http.get(url, { timeout: 1500 }, r => {
          resolve(r.statusCode === 200)
          r.resume()
        })
        req.on('error', () => resolve(false))
        req.on('timeout', () => { req.destroy(); resolve(false) })
      })
      if (ok) {
        console.log('Backend ready (HTTP)')
        return
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error('Backend did not start')
}

// ── System Tray ───────────────────────────────────────────────────

function createTray() {
  const iconPath = resolveIcon('tray-icon') || resolveIcon('icon')
  try {
    tray = iconPath ? new Tray(iconPath) : new Tray(nativeImage.createEmpty())
  } catch {
    tray = new Tray(nativeImage.createEmpty())
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'JARVIS',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      },
    },
    {
      label: 'Open Interface (Chat)',
      click: () => {
        mainWindow.show()
        if (isDev) {
          mainWindow.loadURL('http://localhost:5173/chat')
        } else {
          mainWindow.loadURL(FRONTEND_URL + '#/chat')
        }
        mainWindow.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'API Docs',
      click: () => shell.openExternal(BACKEND_URL + '/docs'),
    },
    { type: 'separator' },
    {
      label: 'Quit JARVIS',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setToolTip('JARVIS — Online')
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })
}

// ── Global shortcuts ──────────────────────────────────────────────

function registerShortcuts() {
  // Win+J — open JARVIS
  globalShortcut.register('Super+J', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // Win+Shift+J — open directly to chat
  globalShortcut.register('Super+Shift+J', () => {
    mainWindow.show()
    mainWindow.loadURL(FRONTEND_URL + '/chat')
    mainWindow.focus()
  })

  // Alt+J — quick JARVIS chat popup
  globalShortcut.register('Alt+J', () => {
    openQuickChat()
  })
}

let quickChatWindow = null

function openQuickChat() {
  if (quickChatWindow) {
    quickChatWindow.focus()
    return
  }

  const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize

  quickChatWindow = new BrowserWindow({
    width: 600,
    height: 120,
    x: Math.round(width / 2 - 300),
    y: Math.round(height * 0.15),
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#020b18',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  })

  quickChatWindow.loadURL(FRONTEND_URL + '/chat')
  quickChatWindow.on('blur', () => {
    quickChatWindow?.close()
  })
  quickChatWindow.on('closed', () => { quickChatWindow = null })
}

// ── Auto-start with Windows ───────────────────────────────────────

function setupAutoStart() {
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
    name: 'JARVIS',
    args: ['--hidden'],
  })
}

// ── IPC handlers ──────────────────────────────────────────────────

ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window-hide', () => mainWindow?.hide())
ipcMain.on('window-close', () => { mainWindow?.hide() })
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('is-maximized', () => mainWindow?.isMaximized() ?? false)

// ── Notification bridge ───────────────────────────────────────────

ipcMain.on('show-notification', (_, { title, body }) => {
  new Notification({ title, body, icon: path.join(__dirname, 'assets', 'icon.png') }).show()
})

// ── App lifecycle ─────────────────────────────────────────────────

// When second instance tries to open, focus existing window
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  startBackend() // safe — skips if python not found or already running

  createWindow()
  createTray()
  registerShortcuts()

  if (!isDev) setupAutoStart()

  // Show startup notification
  setTimeout(() => {
    new Notification({
      title: 'JARVIS Online',
      body: 'All systems nominal. Press Win+J to open.',
    }).show()
  }, 3000)
})

app.on('window-all-closed', (e) => {
  e.preventDefault()
})

app.on('before-quit', () => {
  isQuitting = true
  globalShortcut.unregisterAll()
  if (backendProcess) {
    backendProcess.kill()
  }
})

app.on('activate', () => {
  if (!mainWindow) createWindow()
  else mainWindow.show()
})
