/// <reference types="vite/client" />

interface Window {
  api: import('./shared/ipc').RendererApi
}
