import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type RendererApi } from '../shared/ipc'

const INVOKE_SET = new Set<string>(Object.values(IPC))
const SEND_SET = new Set<string>([IPC.AUDIO_STREAM, IPC.LOG, IPC.PRESENTATION_PAGE])
const LISTEN_SET = new Set<string>([IPC.STATE_UPDATE, IPC.PRESENTATION_STATE, IPC.WINDOW_MAXIMIZED])

const api: RendererApi = {
  invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    if (!INVOKE_SET.has(channel)) {
      return Promise.reject(new Error(`blocked ipc channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args) as Promise<T>
  },
  send(channel: string, ...args: unknown[]): void {
    if (!SEND_SET.has(channel)) return
    ipcRenderer.send(channel, ...args)
  },
  on(channel: string, listener: (...args: unknown[]) => void): () => void {
    if (!LISTEN_SET.has(channel)) return () => undefined
    const handler = (_e: IpcRendererEvent, ...args: unknown[]): void => listener(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
