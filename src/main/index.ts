import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, systemPreferences, Tray } from 'electron'
import { constants } from 'node:fs'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import type { Display } from 'electron'
import type { Mode, OverlayState, Rectangle } from '../shared/types'
import { annotateImage } from './annotate-image'
import { removeStaleCaptures, writeCapture } from './capture-files'
import { CodexAgent } from './codex-agent'
import { Conversation, type Capture } from './conversation'
import {
  boundsToPosition,
  DEFAULT_DEVELOPER_INSTRUCTIONS,
  positionToBounds,
  readPreferences,
  validDeveloperInstructions,
  validShortcut,
  type Preferences
} from './preferences'
import { trayIconPng } from './tray-icon'

const windows: { canvas: BrowserWindow | null; toolbar: BrowserWindow | null; composer: BrowserWindow | null } = {
  canvas: null,
  toolbar: null,
  composer: null
}
const state: OverlayState = {
  visible: false,
  mode: 'pointer',
  userRectangle: null,
  agentMarks: [],
  messages: [],
  loading: false,
  status: 'Starting…',
  codexPath: null,
  shortcut: 'Command+Shift+Space',
  shortcutReady: false,
  developerInstructions: DEFAULT_DEVELOPER_INSTRUCTIONS,
  displayBounds: null,
  canvasBounds: null
}

let activeDisplay: Display
let tray: Tray
let settingsWindow: BrowserWindow | null = null
let conversation: Conversation
let preferences: Preferences = readPreferences(null)
let saveQueue: Promise<void> = Promise.resolve()
let captureQueue: Promise<void> = Promise.resolve()
let positionSaveTimer: NodeJS.Timeout | null = null

function broadcast(): void {
  for (const win of [...Object.values(windows), settingsWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('overlay:state', state)
  }
}

function updateStatus(status: string): void {
  state.status = status
  broadcast()
}

function loadView(win: BrowserWindow, view: string): void {
  const url = process.env.ELECTRON_RENDERER_URL
  if (url) void win.loadURL(`${url}?view=${view}`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { query: { view } })
  win.webContents.on('did-finish-load', () => win.webContents.send('overlay:state', state))
}

function makeWindow(bounds: Electron.Rectangle, view: string, focusable: boolean): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: view !== 'canvas',
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable,
    type: 'panel',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setMenuBarVisibility(false)
  loadView(win, view)
  return win
}

function layout(display: Display): void {
  const { x, y, width, height } = display.bounds
  state.displayBounds = display.bounds
  windows.canvas?.setBounds({ x, y, width, height })
  state.canvasBounds = windows.canvas?.getBounds() ?? null
  const toolbarBounds = positionToBounds(display.bounds, { width: 62, height: 230 }, preferences.positions.toolbar, {
    x: x + width - 78,
    y: y + Math.max(70, Math.round(height * 0.25))
  })
  windows.toolbar?.setBounds(toolbarBounds)
  const composerWidth = Math.min(620, width - 40)
  const composerBounds = positionToBounds(display.bounds, { width: composerWidth, height: 245 }, preferences.positions.composer, {
    x: x + Math.round((width - composerWidth) / 2),
    y: y + height - 265
  })
  windows.composer?.setBounds(composerBounds)
}

function savePreferences(): Promise<void> {
  const contents = JSON.stringify(preferences, null, 2)
  saveQueue = saveQueue.catch(() => {}).then(() => writeFile(join(app.getPath('userData'), 'preferences.json'), contents))
  return saveQueue
}

function queuePositionSave(): void {
  if (positionSaveTimer) clearTimeout(positionSaveTimer)
  positionSaveTimer = setTimeout(() => {
    positionSaveTimer = null
    void savePreferences()
  }, 180)
}

function ensureWindows(display: Display): void {
  if (!windows.canvas) {
    windows.canvas = makeWindow(display.bounds, 'canvas', true)
    const updateCanvasBounds = (): void => {
      state.canvasBounds = windows.canvas?.getBounds() ?? null
      broadcast()
    }
    windows.canvas.on('move', updateCanvasBounds)
    windows.canvas.on('resize', updateCanvasBounds)
    windows.canvas.setIgnoreMouseEvents(true, { forward: true })
    windows.toolbar = makeWindow({ x: 0, y: 0, width: 62, height: 230 }, 'toolbar', true)
    windows.composer = makeWindow({ x: 0, y: 0, width: 620, height: 245 }, 'composer', true)
    for (const win of Object.values(windows))
      win?.on('close', (event) => {
        event.preventDefault()
        win.hide()
      })
  }
  layout(display)
}

function setMode(mode: Mode): void {
  state.mode = mode
  windows.canvas?.setIgnoreMouseEvents(mode === 'pointer', { forward: true })
  if (state.visible) {
    if (windows.toolbar?.isVisible()) windows.toolbar.moveTop()
    if (windows.composer?.isVisible()) windows.composer.moveTop()
  }
  broadcast()
}

function refreshTrayMenu(): void {
  if (!tray) return
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: state.visible ? 'Hide Perception' : 'Show Perception', click: () => (state.visible ? hideOverlay() : showOverlay()) },
      { label: 'Settings…', click: openSettings },
      { type: 'separator' },
      { label: 'Quit Perception', click: () => app.quit() }
    ])
  )
}

function openSettings(): void {
  if (state.visible) hideOverlay()
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    settingsWindow = new BrowserWindow({
      width: 500,
      height: 560,
      show: false,
      resizable: false,
      minimizable: false,
      title: 'Perception Settings',
      backgroundColor: '#f8faf8',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    loadView(settingsWindow, 'settings')
    settingsWindow.on('closed', () => {
      settingsWindow = null
    })
  }
  settingsWindow.show()
  settingsWindow.focus()
}

function showOverlay(): void {
  settingsWindow?.hide()
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  if (activeDisplay && activeDisplay.id !== display.id) {
    conversation?.cancelForDisplayChange()
    state.userRectangle = null
    state.agentMarks = []
  }
  activeDisplay = display
  ensureWindows(display)
  state.visible = true
  setMode('pointer')
  windows.canvas?.showInactive()
  windows.toolbar?.showInactive()
  windows.composer?.show()
  windows.composer?.focus()
  windows.toolbar?.moveTop()
  windows.composer?.moveTop()
  refreshTrayMenu()
  broadcast()
}

function hideOverlay(): void {
  for (const win of Object.values(windows)) win?.hide()
  state.visible = false
  setMode('pointer')
  refreshTrayMenu()
  broadcast()
}

function validRectangle(value: unknown): Rectangle | null {
  if (value === null) return null
  if (typeof value !== 'object' || !value) return null
  const r = value as Record<string, unknown>
  if (![r.x, r.y, r.width, r.height].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) return null
  const rect = r as Rectangle
  if (rect.width < 0.002 || rect.height < 0.002 || rect.x + rect.width > 1 || rect.y + rect.height > 1) return null
  return rect
}

async function findCodex(): Promise<string | null> {
  const saved = app.getPath('userData') + '/codex-path.txt'
  const candidates = [
    process.env.PERCEPTION_CODEX_BIN,
    await import('node:fs/promises').then((fs) => fs.readFile(saved, 'utf8').catch(() => null)),
    ...String(process.env.PATH ?? '')
      .split(':')
      .map((dir) => join(dir, 'codex')),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    join(homedir(), '.local/bin/codex'),
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      await access(candidate.trim(), constants.X_OK)
      return candidate.trim()
    } catch {
      /* next */
    }
  }
  return null
}

async function captureDisplay(rectangle: Rectangle | null, signal: AbortSignal): Promise<Capture> {
  const previous = captureQueue
  let release!: () => void
  captureQueue = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    if (signal.aborted) throw new Error('Request cancelled')
    const display = activeDisplay
    for (const win of Object.values(windows)) win?.hide()
    await new Promise((resolve) => setTimeout(resolve, 160))
    try {
      if (signal.aborted) throw new Error('Request cancelled')
      const sources = await desktopCapturer
        .getSources({
          types: ['screen'],
          thumbnailSize: {
            width: Math.round(display.size.width * display.scaleFactor),
            height: Math.round(display.size.height * display.scaleFactor)
          }
        })
        .catch((error: unknown) => {
          if (systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
            throw new Error('Screen Recording permission is needed. Open Screen Recording settings, enable Perception, then send your message again.')
          }
          throw new Error(`Could not capture this display: ${error instanceof Error ? error.message : String(error)}`)
        })
      if (signal.aborted) throw new Error('Request cancelled')
      const source = sources.find((item) => item.display_id === String(display.id)) ?? (sources.length === 1 ? sources[0] : null)
      if (!source || source.thumbnail.isEmpty()) {
        const permission = systemPreferences.getMediaAccessStatus('screen')
        throw new Error(
          permission === 'granted'
            ? 'Could not capture this display.'
            : 'Screen Recording permission is needed. Enable it for Perception in System Settings, then try again.'
        )
      }
      const png = annotateImage(source.thumbnail.toPNG(), rectangle)
      if (signal.aborted) throw new Error('Request cancelled')
      return await writeCapture(join(app.getPath('userData'), 'captures'), png)
    } finally {
      if (state.visible) {
        windows.canvas?.showInactive()
        windows.toolbar?.showInactive()
        windows.composer?.show()
        windows.composer?.focus()
        windows.toolbar?.moveTop()
        windows.composer?.moveTop()
      }
    }
  } finally {
    release()
  }
}

async function sendPrompt(text: string): Promise<void> {
  if (!state.codexPath) throw new Error('Codex CLI was not found. Choose its executable in the prompt window.')
  await conversation.send(text)
}

function setupIpc(): void {
  ipcMain.handle('overlay:get-state', () => state)
  ipcMain.on('overlay:set-mode', (_event, mode: Mode) => {
    if (mode === 'pointer' || mode === 'rectangle') setMode(mode)
  })
  ipcMain.on('overlay:set-rectangle', (_event, value: unknown) => {
    state.userRectangle = validRectangle(value)
    broadcast()
  })
  ipcMain.handle('overlay:send-prompt', async (_event, text: unknown) => {
    if (typeof text === 'string') await sendPrompt(text)
  })
  ipcMain.on('overlay:hide', hideOverlay)
  ipcMain.handle('overlay:clear', () => {
    conversation.clearMarks()
  })
  ipcMain.handle('overlay:new-conversation', () => {
    conversation.reset()
  })
  ipcMain.handle('overlay:set-shortcut', async (_event, shortcut: unknown): Promise<{ ok: boolean; error?: string }> => {
    if (!validShortcut(shortcut)) return { ok: false, error: 'Use ⌘, Control, or Option with a letter, number, Space, or F key.' }
    if (shortcut === preferences.shortcut && state.shortcutReady) return { ok: true }
    let registered = false
    try {
      registered = globalShortcut.register(shortcut, toggleOverlay)
    } catch {
      /* invalid or unavailable */
    }
    if (!registered) return { ok: false, error: 'That shortcut is unavailable. Try another combination.' }
    if (state.shortcutReady) globalShortcut.unregister(preferences.shortcut)
    preferences.shortcut = shortcut
    state.shortcut = shortcut
    state.shortcutReady = true
    await savePreferences()
    broadcast()
    return { ok: true }
  })
  ipcMain.handle('overlay:set-developer-instructions', async (_event, instructions: unknown): Promise<{ ok: boolean; error?: string }> => {
    if (!validDeveloperInstructions(instructions)) return { ok: false, error: 'Instructions must be 10,000 characters or fewer.' }
    preferences.developerInstructions = instructions
    state.developerInstructions = instructions
    await savePreferences()
    broadcast()
    return { ok: true }
  })
  ipcMain.on('overlay:move-panel', (event, panel: unknown, dx: unknown, dy: unknown) => {
    if (panel !== 'toolbar' && panel !== 'composer') return
    const win = windows[panel]
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return
    if (typeof dx !== 'number' || typeof dy !== 'number' || !Number.isFinite(dx) || !Number.isFinite(dy)) return
    if (Math.abs(dx) > 1000 || Math.abs(dy) > 1000) return
    const current = win.getBounds()
    const display = activeDisplay.bounds
    const x = Math.max(display.x + 12, Math.min(display.x + display.width - current.width - 12, Math.round(current.x + dx)))
    const y = Math.max(display.y + 12, Math.min(display.y + display.height - current.height - 12, Math.round(current.y + dy)))
    win.setPosition(x, y)
    preferences.positions[panel] = boundsToPosition(display, win.getBounds())
    queuePositionSave()
  })
  ipcMain.handle('overlay:choose-codex', async () => {
    const result = await dialog.showOpenDialog({ title: 'Choose Codex CLI', properties: ['openFile'] })
    if (result.canceled || !result.filePaths[0]) return
    const candidate = result.filePaths[0]
    await access(candidate, constants.X_OK)
    state.codexPath = candidate
    await writeFile(join(app.getPath('userData'), 'codex-path.txt'), candidate)
    updateStatus(`Connected to ${basename(candidate)}`)
  })
  ipcMain.on('overlay:open-screen-settings', () => {
    void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
  })
}

function toggleOverlay(): void {
  if (state.visible) hideOverlay()
  else showOverlay()
}

function trayIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromBuffer(trayIconPng(), { scaleFactor: 2 })
  icon.setTemplateImage(true)
  return icon
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (app.isReady() && conversation) showOverlay()
  })
  app
    .whenReady()
    .then(async () => {
      app.dock?.hide()
      activeDisplay = screen.getPrimaryDisplay()
      await mkdir(app.getPath('userData'), { recursive: true })
      await removeStaleCaptures(join(app.getPath('userData'), 'captures'))
      preferences = readPreferences(
        await readFile(join(app.getPath('userData'), 'preferences.json'), 'utf8')
          .then(JSON.parse)
          .catch(() => null)
      )
      state.shortcut = preferences.shortcut
      state.developerInstructions = preferences.developerInstructions
      conversation = new Conversation(state, {
        createSession: () =>
          new CodexAgent(
            () => state.codexPath,
            () => preferences.developerInstructions
          ),
        capture: captureDisplay,
        setPointerMode: () => setMode('pointer'),
        publish: broadcast
      })
      state.codexPath = await findCodex()
      state.status = state.codexPath ? 'Ready' : 'Choose Codex CLI to connect'
      setupIpc()

      tray = new Tray(trayIcon())
      tray.setToolTip('Perception')
      refreshTrayMenu()
      tray.on('double-click', showOverlay)
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: 'Perception',
            submenu: [
              { label: 'Show or Hide Overlay', click: toggleOverlay },
              { label: 'Settings…', click: openSettings },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ])
      )
      try {
        state.shortcutReady = globalShortcut.register(preferences.shortcut, toggleOverlay)
      } catch {
        state.shortcutReady = false
      }
      if (!state.shortcutReady) updateStatus('Shortcut unavailable. Open from the menu bar.')
      else broadcast()
      screen.on('display-metrics-changed', () => {
        conversation.cancelForDisplayChange()
        state.userRectangle = null
        state.agentMarks = []
        if (!state.visible) return
        activeDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
        layout(activeDisplay)
        broadcast()
      })
      app.on('activate', showOverlay)
      showOverlay()
    })
    .catch((error) => {
      void dialog
        .showMessageBox({ type: 'error', title: 'Perception could not start', message: error instanceof Error ? error.message : String(error) })
        .finally(() => app.quit())
    })
}

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  if (positionSaveTimer) {
    clearTimeout(positionSaveTimer)
    void savePreferences()
  }
  conversation?.close()
  for (const win of Object.values(windows)) win?.removeAllListeners('close')
})

app.on('window-all-closed', () => {})
