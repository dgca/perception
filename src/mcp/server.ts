import { createConnection } from 'node:net'
import { createInterface } from 'node:readline'

type RpcRequest = { jsonrpc?: string; id?: string | number; method?: string; params?: Record<string, unknown> }

const point = { type: 'number', minimum: 0, maximum: 1 }
const tools = [
  {
    name: 'draw_rectangle',
    description:
      'Draw a rectangle around a visible region of the current display. Coordinates are fractions of the full screenshot, with (0,0) at its top left. Use this to point back to a control or area.',
    annotations: { destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: { x: point, y: point, width: point, height: point, label: { type: 'string' } },
      required: ['x', 'y', 'width', 'height'],
      additionalProperties: false
    }
  },
  {
    name: 'draw_arrow',
    description: 'Draw an arrow on the current display. Coordinates are fractions of the full screenshot.',
    annotations: { destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: { fromX: point, fromY: point, toX: point, toY: point, label: { type: 'string' } },
      required: ['fromX', 'fromY', 'toX', 'toY'],
      additionalProperties: false
    }
  },
  {
    name: 'add_label',
    description: 'Place a short explanatory label over the current display. Coordinates are fractions of the full screenshot.',
    annotations: { destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: { x: point, y: point, text: { type: 'string' } },
      required: ['x', 'y', 'text'],
      additionalProperties: false
    }
  },
  {
    name: 'clear_marks',
    description: 'Clear only your previous marks from the canvas.',
    annotations: { destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
] as const

function respond(id: string | number, result?: unknown, error?: { code: number; message: string }): void {
  process.stdout.write(JSON.stringify(error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result }) + '\n')
}

function sendToApp(payload: unknown): Promise<void> {
  const socketPath = process.env.PERCEPTION_SOCKET_PATH
  if (!socketPath) return Promise.reject(new Error('Perception is not running'))

  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath)
    let settled = false
    let response = ''
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      socket.destroy()
      if (error) reject(error)
      else resolve()
    }
    socket.setTimeout(3000, () => finish(new Error('Perception did not acknowledge the drawing')))
    socket.on('connect', () => socket.write(JSON.stringify(payload) + '\n'))
    socket.on('data', (chunk: Buffer) => {
      response += chunk.toString()
      if (!response.includes('\n')) return
      try {
        const result = JSON.parse(response.split('\n')[0]) as { ok: boolean; error?: string }
        finish(result.ok ? undefined : new Error(result.error ?? 'Drawing failed'))
      } catch {
        finish(new Error('Invalid response from Perception'))
      }
    })
    socket.on('error', finish)
    socket.on('end', () => finish(new Error('Perception disconnected')))
  })
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
input.on('line', (line) => {
  void (async () => {
    let request: RpcRequest
    try {
      request = JSON.parse(line) as RpcRequest
    } catch {
      return
    }
    if (request.id === undefined) return
    const id = request.id
    switch (request.method) {
      case 'initialize':
        respond(id, {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'perception-canvas', version: '0.1.0' }
        })
        return
      case 'ping':
        respond(id, {})
        return
      case 'tools/list':
        respond(id, { tools })
        return
      case 'tools/call': {
        const name = request.params?.name
        const args = request.params?.arguments
        if (typeof name !== 'string' || !tools.some((tool) => tool.name === name) || typeof args !== 'object' || args === null) {
          respond(id, { content: [{ type: 'text', text: 'Unknown drawing tool or invalid arguments' }], isError: true })
          return
        }
        try {
          await sendToApp({ name, arguments: args })
          respond(id, { content: [{ type: 'text', text: `${name} applied to the visible canvas` }] })
        } catch (error) {
          respond(id, { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Drawing failed' }], isError: true })
        }
        return
      }
      default:
        respond(id, undefined, { code: -32601, message: 'Method not found' })
    }
  })()
})
