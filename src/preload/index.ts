import { contextBridge, ipcRenderer } from 'electron'
import type { OverlayAPI, OverlayState } from '../shared/types'

const api: OverlayAPI = {
  getState: () => ipcRenderer.invoke('overlay:get-state'),
  onState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: OverlayState): void => listener(state)
    ipcRenderer.on('overlay:state', handler)
    return () => ipcRenderer.removeListener('overlay:state', handler)
  },
  setMode: (mode) => ipcRenderer.send('overlay:set-mode', mode),
  setRectangle: (rectangle) => ipcRenderer.send('overlay:set-rectangle', rectangle),
  sendPrompt: (text) => ipcRenderer.invoke('overlay:send-prompt', text),
  hide: () => ipcRenderer.send('overlay:hide'),
  clear: () => ipcRenderer.invoke('overlay:clear'),
  newConversation: () => ipcRenderer.invoke('overlay:new-conversation'),
  chooseCodex: () => ipcRenderer.invoke('overlay:choose-codex'),
  openScreenSettings: () => ipcRenderer.send('overlay:open-screen-settings'),
  setShortcut: (shortcut) => ipcRenderer.invoke('overlay:set-shortcut', shortcut),
  movePanel: (panel, dx, dy) => ipcRenderer.send('overlay:move-panel', panel, dx, dy)
}

contextBridge.exposeInMainWorld('perception', api)
