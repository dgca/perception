import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  boundsToPosition,
  DEFAULT_DEVELOPER_INSTRUCTIONS,
  DEFAULT_SHORTCUT,
  positionToBounds,
  readPreferences,
  validDeveloperInstructions,
  validShortcut
} from '../src/main/preferences'

test('shortcuts require a non-shift modifier and a supported key', () => {
  assert.equal(validShortcut('Command+Shift+Space'), true)
  assert.equal(validShortcut('Control+Alt+K'), true)
  assert.equal(validShortcut('Command+F12'), true)
  assert.equal(validShortcut('Shift+K'), false)
  assert.equal(validShortcut('Command+Command+K'), false)
  assert.equal(validShortcut('Command+Escape'), false)
})

test('invalid saved preferences fall back without losing valid positions', () => {
  assert.deepEqual(readPreferences({ shortcut: 'Shift+K', positions: { toolbar: { x: 0.8, y: 0.2 }, composer: { x: 20, y: 0 } } }), {
    shortcut: DEFAULT_SHORTCUT,
    developerInstructions: DEFAULT_DEVELOPER_INSTRUCTIONS,
    positions: { toolbar: { x: 0.8, y: 0.2 }, composer: null }
  })
})

test('developer instructions preserve edits and reject oversized saved values', () => {
  assert.equal(readPreferences({ developerInstructions: 'Use brief answers.' }).developerInstructions, 'Use brief answers.')
  assert.equal(readPreferences({ developerInstructions: '' }).developerInstructions, '')
  assert.equal(readPreferences({ developerInstructions: 'x'.repeat(10001) }).developerInstructions, DEFAULT_DEVELOPER_INSTRUCTIONS)
  assert.equal(validDeveloperInstructions('x'.repeat(10000)), true)
  assert.equal(validDeveloperInstructions('x'.repeat(10001)), false)
})

test('panel positions remain on the current display', () => {
  const display = { x: 100, y: 50, width: 1440, height: 900 }
  const size = { width: 620, height: 245 }
  const moved = { x: 800, y: 500, ...size }
  const saved = boundsToPosition(display, moved)
  assert.deepEqual(positionToBounds(display, size, saved, { x: 0, y: 0 }), moved)
  const smaller = positionToBounds({ x: 0, y: 0, width: 1024, height: 768 }, size, saved, { x: 0, y: 0 })
  assert.ok(smaller.x >= 12 && smaller.x + size.width <= 1012)
  assert.ok(smaller.y >= 12 && smaller.y + size.height <= 756)
})
