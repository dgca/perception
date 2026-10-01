import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stat } from 'node:fs/promises'
import { createConnection } from 'node:net'
import type { AgentMark } from '../src/shared/types'
import { DrawingBridge } from '../src/main/drawing-bridge'

function draw(socketPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath)
    let reply = ''
    socket.on('connect', () => socket.write(`${JSON.stringify({ name: 'add_label', arguments: { x: 0.2, y: 0.3, text: 'Here' } })}\n`))
    socket.on('data', (chunk: Buffer) => {
      reply += chunk.toString()
    })
    socket.on('end', () => resolve(reply))
    socket.on('error', reject)
  })
}

test('a drawing socket accepts valid marks only while its request is active', async () => {
  const marks: (AgentMark | 'clear')[] = []
  const bridge = new DrawingBridge((mark) => marks.push(mark))
  await bridge.start()
  try {
    assert.equal((await stat(bridge.socketPath)).mode & 0o777, 0o600)
    assert.deepEqual(JSON.parse(await draw(bridge.socketPath)), { ok: true })
    assert.equal(marks.length, 1)
  } finally {
    await bridge.stop()
  }
  await assert.rejects(draw(bridge.socketPath))
  assert.equal(marks.length, 1)
})
