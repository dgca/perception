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
  clear: () => ipcRenderer.send('overlay:clear'),
  chooseCodex: () => ipcRenderer.invoke('overlay:choose-codex'),
  openScreenSettings: () => ipcRenderer.send('overlay:open-screen-settings')
}

contextBridge.exposeInMainWorld('perception', api)
