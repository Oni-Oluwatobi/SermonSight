import path from 'path'
import fs from 'fs'

/**
 * Minimal libvosk binding via koffi.
 * The vosk npm package (ffi-napi/ref-napi) cannot load under Electron 33 —
 * these prebuilds fail to initialize — so we bind the official libvosk.dll
 * directly with koffi (N-API, Electron-compatible) instead.
 * API mirrors what sttWorker needs from the vosk npm package.
 */

interface KoffiLib {
  func(name: string, ret: string, params: unknown[]): (...args: unknown[]) => unknown
}

let koffiMod: { load(file: string): KoffiLib } | null = null

export interface VoskEngine {
  setLogLevel(level: number): void
  newModel(modelDir: string): { handle: unknown }
  newRecognizer(model: { handle: unknown }, sampleRate: number): { handle: unknown }
  acceptWaveform(rec: { handle: unknown }, data: Uint8Array): boolean
  finalResult(rec: { handle: unknown }): Record<string, unknown>
  partialResult(rec: { handle: unknown }): { partial?: string }
  reset(rec: { handle: unknown }): void
  freeRecognizer(rec: { handle: unknown }): void
  freeModel(model: { handle: unknown }): void
}

export function voskDllDir(isPackaged: boolean, resourcesPath: string, appPath: string): string {
  return isPackaged ? path.join(resourcesPath, 'vosk') : path.join(appPath, 'vendor', 'vosk')
}

export function createVoskEngine(dllDir: string): VoskEngine {
  if (!koffiMod) {
    const spec = 'koffi'
    koffiMod = require(/* @vite-ignore */ spec) as { load(file: string): KoffiLib }
  }
  const dll = path.join(dllDir, 'libvosk.dll')
  if (!fs.existsSync(dll)) throw new Error(`libvosk.dll not found at ${dll}`)
  const lib = (koffiMod as { load(file: string): KoffiLib }).load(dll)
  const setLogLevel = lib.func('vosk_set_log_level', 'void', ['int'])
  const modelNew = lib.func('vosk_model_new', 'void*', ['char*'])
  const modelFree = lib.func('vosk_model_free', 'void', ['void*'])
  const recNew = lib.func('vosk_recognizer_new', 'void*', ['void*', 'float'])
  const recFree = lib.func('vosk_recognizer_free', 'void', ['void*'])
  const accept = lib.func('vosk_recognizer_accept_waveform', 'bool', ['void*', 'void*', 'int'])
  const finalRes = lib.func('vosk_recognizer_final_result', 'char*', ['void*'])
  const partialRes = lib.func('vosk_recognizer_partial_result', 'char*', ['void*'])
  const reset = lib.func('vosk_recognizer_reset', 'void', ['void*'])

  return {
    setLogLevel: (level) => setLogLevel(level),
    newModel: (modelDir) => {
      const handle = modelNew(modelDir)
      if (!handle) throw new Error('vosk model failed to load (corrupt model directory?)')
      return { handle }
    },
    newRecognizer: (model, sampleRate) => {
      const handle = recNew(model.handle, sampleRate)
      if (!handle) throw new Error('vosk recognizer failed to create')
      return { handle }
    },
    acceptWaveform: (rec, data) => accept(rec.handle, data, data.length) as boolean,
    finalResult: (rec) => JSON.parse(String(finalRes(rec.handle) ?? '{}')) as Record<string, unknown>,
    partialResult: (rec) => JSON.parse(String(partialRes(rec.handle) ?? '{}')) as { partial?: string },
    reset: (rec) => reset(rec.handle),
    freeRecognizer: (rec) => recFree(rec.handle),
    freeModel: (model) => modelFree(model.handle)
  }
}
