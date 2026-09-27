import { createServer, type Server } from 'node:net'
import { chmod, unlink } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import type { AgentMark } from '../shared/types'

type DrawingCommand = { name?: unknown; arguments?: unknown }

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('Coordinates must be numbers between 0 and 1')
  }
  return value
}

function shortText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('A text label is required')
  return value.trim().slice(0, 120)
}

function optionalLabel(value: unknown): string | undefined {
  return value === undefined ? undefined : shortText(value)
}

function parseCommand(raw: DrawingCommand): AgentMark | 'clear' {
  const args = raw.arguments
  if (typeof args !== 'object' || args === null) throw new Error('Missing tool arguments')
  const a = args as Record<string, unknown>
  switch (raw.name) {
    case 'draw_rectangle': {
      const x = number(a.x)
      const y = number(a.y)
      const width = number(a.width)
      const height = number(a.height)
      if (width <= 0 || height <= 0 || x + width > 1 || y + height > 1) throw new Error('Rectangle is outside the display')
      return { id: randomUUID(), kind: 'rectangle', x, y, width, height, label: optionalLabel(a.label) }
    }
    case 'draw_arrow':
      return {
        id: randomUUID(), kind: 'arrow',
        fromX: number(a.fromX), fromY: number(a.fromY), toX: number(a.toX), toY: number(a.toY),
        label: optionalLabel(a.label)
      }
    case 'add_label':
      return { id: randomUUID(), kind: 'label', x: number(a.x), y: number(a.y), text: shortText(a.text) }
    case 'clear_marks':
      return 'clear'
    default:
      throw new Error('Unknown drawing command')
  }
}

export class DrawingBridge {
  readonly socketPath = `/tmp/perception-${process.pid}-${randomBytes(5).toString('hex')}.sock`
  private server: Server | null = null

  constructor(private readonly onMark: (mark: AgentMark | 'clear') => void) {}

  async start(): Promise<void> {
    this.server = createServer((socket) => {
      let buffer = ''
      socket.setTimeout(3000, () => socket.destroy())
      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        if (buffer.length > 8192) {
          socket.end(JSON.stringify({ ok: false, error: 'Drawing command too large' }) + '\n')
          return
        }
        if (!buffer.includes('\n')) return
        try {
          const command = JSON.parse(buffer.split('\n')[0]) as DrawingCommand
          const mark = parseCommand(command)
          this.onMark(mark)
          socket.end(JSON.stringify({ ok: true }) + '\n')
        } catch (error) {
          socket.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Invalid command' }) + '\n')
        }
      })
    })
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(this.socketPath, () => {
        this.server!.removeListener('error', reject)
        resolve()
      })
    })
    await chmod(this.socketPath, 0o600)
  }

  async stop(): Promise<void> {
    this.server?.close()
    await unlink(this.socketPath).catch(() => {})
  }
}
