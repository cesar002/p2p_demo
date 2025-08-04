import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api);

    contextBridge.exposeInMainWorld('p2p', {
      startPeer: (targetId: string, initiator: boolean) => ipcRenderer.send('start-peer', targetId, initiator),
      sendMessage: (msg: string) => ipcRenderer.send('send-peer-message', msg),
      onId: (callback: (id: string) => void) => ipcRenderer.on('peer-id', (_, id) => callback(id)),
      onConnect: (callback: () => void) => ipcRenderer.on('peer-connected', callback),
      onData: (callback: (data: string) => void) => ipcRenderer.on('peer-data', (_, data) => callback(data)),
    });
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
