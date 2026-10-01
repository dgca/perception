import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PNG } from 'pngjs'
import { annotateImage } from '../src/main/annotate-image.ts'

test('the selected region is drawn onto the capture sent to the agent', () => {
  const image = new PNG({ width: 100, height: 100 })
  image.data.fill(0)
  const result = PNG.sync.read(
    annotateImage(PNG.sync.write(image), {
      x: 0.2,
      y: 0.3,
      width: 0.4,
      height: 0.2
    })
  )

  function rgba(x: number, y: number): number[] {
    const offset = (result.width * y + x) * 4
    return [...result.data.subarray(offset, offset + 4)]
  }

  assert.deepEqual(rgba(20, 30), [255, 115, 75, 255])
  assert.deepEqual(rgba(60, 50), [255, 115, 75, 255])
  assert.deepEqual(rgba(40, 40), [0, 0, 0, 0])
  assert.deepEqual(rgba(61, 30), [0, 0, 0, 0])
})
