import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { WebSocketServer, WebSocket } from 'ws'
import type { WebSocket as WsSocket } from 'ws'
import QRCode from 'qrcode'
import { app } from 'electron'
import { PairingManager } from './PairingManager'
import type { RemoteStatus } from '../../shared/ipc'
import { logger } from '../logger'

export type RemoteCommand = 'confirm' | 'reject' | 'next' | 'prev' | 'black'

export interface LocalServerOptions {
  port: number
  onCommand: (cmd: RemoteCommand) => void
  /** JSON-RPC style ops from the phone page (search / display / translation). */
  rpcHandler?: (op: string, payload: Record<string, unknown>) => Promise<unknown> | unknown
  /** Fires whenever a phone connects or disconnects — drives the real device count. */
  onClientsChange?: (clients: number) => void
}

function isPrivateIpv4(addr: string): boolean {
  return /^10\./.test(addr) || /^192\.168\./.test(addr) || /^172\.(1[6-9]|2\d|3[01])\./.test(addr)
}

function detectLanIp(): string | null {
  const ifs = os.networkInterfaces()
  for (const list of Object.values(ifs)) {
    for (const i of list ?? []) {
      const family = String(i.family)
      if ((family === 'IPv4' || family === '4') && !i.internal && isPrivateIpv4(i.address)) {
        return i.address
      }
    }
  }
  return null
}

function remotePagePath(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'resources', 'remote', 'index.html')
  return path.join(app.getAppPath(), 'resources', 'remote', 'index.html')
}

/**
 * Local-only HTTP + WebSocket server for the phone remote.
 * Binds strictly to the LAN address (never the public internet) and requires
 * a short-lived pairing PIN before any control command is accepted.
 */
export class LocalServer {
  private server: http.Server | null = null
  private wss: WebSocketServer | null = null
  private readonly pairing = new PairingManager()
  private readonly clients = new Set<WsSocket>()
  private snapshot: string | null = null
  private opts: LocalServerOptions | null = null
  private current: RemoteStatus = {
    state: 'disabled',
    url: null,
    lanIp: null,
    port: null,
    pin: null,
    pinExpiresAt: null,
    clients: 0,
    error: null
  }
  private qr: string | null = null
  /** Session token embedded in the QR so scanning needs no PIN. */
  private qrToken: string | null = null

  getStatus(): RemoteStatus {
    return { ...this.current }
  }

  getQr(): string | null {
    return this.qr
  }

  newPin(): { pin: string; expiresAt: number } | null {
    const info = this.pairing.newPin()
    this.current.pin = info.pin
    this.current.pinExpiresAt = info.expiresAt
    // Refresh QR together with the PIN (no server restart required)
    if (this.current.url) this.qrToken = this.pairing.issueSession().token
    void this.refreshQr()
    logger.info('remote pairing pin generated', { expiresAt: info.expiresAt })
    return info
  }

  async start(opts: LocalServerOptions): Promise<RemoteStatus> {
    this.stop()
    this.opts = opts
    const lanIp = detectLanIp()
    if (!lanIp) {
      this.current = {
        state: 'error',
        url: null,
        lanIp: null,
        port: opts.port,
        pin: null,
        pinExpiresAt: null,
        clients: 0,
        error: 'No local network found. Connect this PC to Wi-Fi or a router.'
      }
      logger.warn('remote start failed: no LAN address')
      return this.getStatus()
    }

    try {
      const server = http.createServer((req, res) => {
        void this.handleHttp(req, res)
      })
      const wss = new WebSocketServer({ noServer: true })

      server.on('upgrade', (req, socket, head) => {
        try {
          const url = new URL(req.url ?? '/', `http://${lanIp}`)
          if (url.pathname !== '/ws') {
            socket.destroy()
            return
          }
          const token = url.searchParams.get('token')
          if (!this.pairing.verify(token)) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
            socket.destroy()
            return
          }
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req)
          })
        } catch {
          socket.destroy()
        }
      })

      wss.on('connection', (ws) => {
        this.clients.add(ws)
        this.current.clients = this.clients.size
        this.pushStatus()
        this.opts?.onClientsChange?.(this.clients.size)
        if (this.snapshot) ws.send(this.snapshot)
        logger.info('remote client connected', { clients: this.clients.size })
        ws.on('message', (data) => this.handleWsMessage(data.toString()))
        ws.on('close', () => {
          this.clients.delete(ws)
          this.current.clients = this.clients.size
          this.pushStatus()
          this.opts?.onClientsChange?.(this.clients.size)
          logger.info('remote client disconnected', { clients: this.clients.size })
        })
        ws.on('error', () => {
          this.clients.delete(ws)
          this.current.clients = this.clients.size
          this.opts?.onClientsChange?.(this.clients.size)
        })
      })

      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(opts.port, lanIp, () => {
          server.removeListener('error', reject)
          resolve()
        })
      })

      this.server = server
      this.wss = wss
      const pin = this.pairing.newPin()
      this.qrToken = this.pairing.issueSession().token
      this.current = {
        state: 'running',
        url: `http://${lanIp}:${opts.port}`,
        lanIp,
        port: opts.port,
        pin: pin.pin,
        pinExpiresAt: pin.expiresAt,
        clients: this.clients.size,
        error: null
      }
      await this.refreshQr()
      logger.info('remote server started', { url: this.current.url })
      return this.getStatus()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.current = {
        state: 'error',
        url: null,
        lanIp,
        port: opts.port,
        pin: null,
        pinExpiresAt: null,
        clients: 0,
        error: `Remote server failed: ${message}`
      }
      logger.error('remote server failed', message)
      return this.getStatus()
    }
  }

  stop(): void {
    for (const ws of this.clients) {
      try {
        ws.close(1001, 'server stopping')
      } catch {
        /* ignore */
      }
    }
    this.clients.clear()
    try {
      this.wss?.close()
    } catch {
      /* ignore */
    }
    try {
      this.server?.close()
    } catch {
      /* ignore */
    }
    this.wss = null
    this.server = null
    this.snapshot = null
    this.qrToken = null
    this.current = {
      state: 'disabled',
      url: null,
      lanIp: null,
      port: null,
      pin: null,
      pinExpiresAt: null,
      clients: 0,
      error: null
    }
    this.qr = null
    this.opts?.onClientsChange?.(0)
  }

  broadcastState(stateJson: string): void {
    this.snapshot = stateJson
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(stateJson)
        } catch {
          /* ignore */
        }
      }
    }
  }

  private pushStatus(): void {
    const msg = JSON.stringify({ type: 'remote-status', status: this.current })
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(msg)
        } catch {
          /* ignore */
        }
      }
    }
  }

  private handleWsMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as { type?: string; cmd?: RemoteCommand }
      if (msg.type === 'command' && msg.cmd) {
        logger.info('remote command', { cmd: msg.cmd })
        this.opts?.onCommand(msg.cmd)
      } else if (msg.type === 'sync' && this.snapshot) {
        // handled by caller broadcast; ignore
      }
    } catch {
      /* ignore malformed messages */
    }
  }

  private async handleHttp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://local')
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const html = fs.readFileSync(remotePagePath())
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        })
        res.end(html)
        return
      }
      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, app: 'sermonsight' }))
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/rpc') {
        const body = await readBody(req)
        const msg = JSON.parse(body || '{}') as {
          token?: string
          op?: string
          [k: string]: unknown
        }
        if (!this.pairing.verify(msg.token)) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'not paired' }))
          return
        }
        if (!msg.op || typeof msg.op !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'missing op' }))
          return
        }
        if (!this.opts?.rpcHandler) {
          res.writeHead(501, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'rpc unavailable' }))
          return
        }
        try {
          const result = await this.opts.rpcHandler(msg.op, msg)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, result: result ?? null }))
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }))
        }
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/pair') {
        const body = await readBody(req)
        const { pin } = JSON.parse(body || '{}') as { pin?: string }
        const session = typeof pin === 'string' ? this.pairing.redeem(pin) : null
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid pin' }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(session))
        return
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('not found')
    } catch (err) {
      logger.error('remote http error', String(err))
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('error')
    }
  }

  private async refreshQr(): Promise<void> {
    if (!this.current.url) {
      this.qr = null
      return
    }
    // QR carries the session token: a scanned phone opens straight to the
    // controller; a manually typed URL falls back to the PIN screen.
    const url = this.qrToken
      ? `${this.current.url}/?token=${this.qrToken}`
      : this.current.url
    try {
      this.qr = await QRCode.toDataURL(url, { margin: 1, width: 260 })
    } catch {
      this.qr = null
    }
  }
}

function readBody(req: http.IncomingMessage, limit = 4096): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export const localServer = new LocalServer()
