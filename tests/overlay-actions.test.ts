import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clearAnnotations } from '../src/main/overlay-actions'
import type { OverlayState } from '../src/shared/types'

test('clear removes user and agent annotations without erasing the conversation', () => {
  const messages = [{ id: 'question', role: 'user' as const, text: 'What is this?' }]
  const state: OverlayState = {
    visible: true, mode: 'rectangle',
    userRectangle: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
    agentMarks: [{ id: 'mark', kind: 'label', x: 0.3, y: 0.3, text: 'Here' }],
    messages, loading: false, status: 'Ready', codexPath: '/tmp/codex',
    shortcut: 'Command+Shift+Space', shortcutReady: true
  }

  clearAnnotations(state)

  assert.equal(state.userRectangle, null)
  assert.deepEqual(state.agentMarks, [])
  assert.equal(state.mode, 'pointer')
  assert.equal(state.messages, messages)
})
