import assert from 'node:assert/strict'
import { test } from 'node:test'
import { markSvg, normalizedPointer } from '../src/renderer/annotations.ts'

test('long annotation text stays inside its label box', () => {
  const text = 'The patterned rug adds energy to the room, but its colors compete with the blue sofa and nearby furniture.'
  const bounds = { x: 0, y: 0, width: 2056, height: 1329 }
  const svg = markSvg({ id: 'rug', kind: 'rectangle', x: 0.23, y: 0.38, width: 0.1, height: 0.07, label: text }, { display: bounds, canvas: bounds })
  const boxWidth = Number(svg.match(/class="agent-label"[\s\S]*?<rect[^>]*width="([\d.]+)"/)?.[1])
  const lines = [...svg.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/g)].map((match) => match[1])

  assert.ok(boxWidth <= 400)
  assert.ok(lines.length > 1, 'long labels need more than one line')
  assert.equal(lines.join(' '), text)
})

test('agent marks stay aligned when macOS moves the canvas below the menu bar', () => {
  const geometry = {
    display: { x: 0, y: 0, width: 2056, height: 1329 },
    canvas: { x: 0, y: 39, width: 2056, height: 1290 }
  }
  const svg = markSvg({ id: 'rug', kind: 'rectangle', x: 0.23, y: 0.38, width: 0.1, height: 0.07 }, geometry)
  const y = Number(svg.match(/class="agent-rect"[^>]* y="([\d.]+)"/)?.[1])
  assert.equal(y, 0.38 * 1329 - 39)

  const pointer = normalizedPointer(472.88, 0.38 * 1329 - 39, geometry)
  assert.equal(pointer.x, 0.23)
  assert.equal(pointer.y, 0.38)
})
