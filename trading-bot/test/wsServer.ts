/**
 * A very small WebSocket server for tests (RFC 6455, text frames only).
 * Node ships a WebSocket CLIENT but no server, and the test suite must
 * stay dependency-free, so this is the ~80 lines needed to accept a
 * connection, push text frames, and answer pings and closes.
 */
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { Socket } from 'node:net'
import { createHash } from 'node:crypto'
import type { AddressInfo } from 'node:net'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export type WsTestServer = {
  url: string
  /** How many sockets have ever connected. */
  connections: number
  /** Query strings of each connection, in order. */
  paths: string[]
  send(obj: unknown): void
  /** Close every client, as if the exchange dropped the line. */
  dropAll(code?: number): void
  close(): Promise<void>
}

function frame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8')
  const len = payload.length
  let header: Buffer
  if (len < 126) header = Buffer.from([0x81, len])
  else if (len < 65_536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2) }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2) }
  return Buffer.concat([header, payload])
}

function closeFrame(code: number): Buffer {
  const b = Buffer.alloc(4); b[0] = 0x88; b[1] = 2; b.writeUInt16BE(code, 2); return b
}

/** `port` 0 (the default) picks a free one; a fixed port lets a stopped server come back at the same address. */
export async function startWsServer(port = 0): Promise<WsTestServer> {
  const clients = new Set<Socket>()
  const state: WsTestServer = {
    url: '', connections: 0, paths: [],
    send: (obj) => { const f = frame(typeof obj === 'string' ? obj : JSON.stringify(obj)); for (const s of clients) s.write(f) },
    dropAll: (code = 1006) => { for (const s of clients) { try { s.write(closeFrame(code)) } catch { /* ignore */ } s.destroy(); clients.delete(s) } },
    close: () => new Promise((r) => { state.dropAll(); server.close(() => r()) }),
  }
  const server: Server = createServer((_req, res) => { res.writeHead(426); res.end() })
  server.on('upgrade', (req, socket: Socket) => {
    const key = req.headers['sec-websocket-key']
    if (!key) { socket.destroy(); return }
    const accept = createHash('sha1').update(key + GUID).digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    clients.add(socket)
    state.connections++
    state.paths.push(req.url ?? '')
    socket.on('data', (buf: Buffer) => {
      // Client frames are masked. We only care about close (0x8) and ping (0x9).
      let i = 0
      while (i + 2 <= buf.length) {
        const opcode = buf[i] & 0x0f
        let len = buf[i + 1] & 0x7f
        let off = i + 2
        if (len === 126) { len = buf.readUInt16BE(off); off += 2 } else if (len === 127) { len = Number(buf.readBigUInt64BE(off)); off += 8 }
        const masked = (buf[i + 1] & 0x80) !== 0
        const mask = masked ? buf.subarray(off, off + 4) : null
        if (masked) off += 4
        const payload = Buffer.from(buf.subarray(off, off + len))
        if (mask) for (let k = 0; k < payload.length; k++) payload[k] ^= mask[k % 4]
        if (opcode === 0x8) { try { socket.write(closeFrame(1000)) } catch { /* ignore */ } socket.end(); clients.delete(socket) }
        else if (opcode === 0x9) { const pong = Buffer.concat([Buffer.from([0x8a, payload.length]), payload]); socket.write(pong) }
        i = off + len
      }
    })
    socket.on('close', () => clients.delete(socket))
    socket.on('error', () => clients.delete(socket))
  })
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', () => r()))
  state.url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`
  return state
}
