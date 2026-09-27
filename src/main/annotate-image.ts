import { PNG } from 'pngjs'
import type { Rectangle } from '../shared/types'

/** Adds the user's selection to the image sent to the model. The live canvas remains separate. */
export function annotateImage(png: Buffer, rectangle: Rectangle | null): Buffer {
  if (!rectangle) return png
  const image = PNG.sync.read(png)
  const left = Math.max(0, Math.min(image.width - 1, Math.round(rectangle.x * image.width)))
  const top = Math.max(0, Math.min(image.height - 1, Math.round(rectangle.y * image.height)))
  const right = Math.max(left, Math.min(image.width - 1, Math.round((rectangle.x + rectangle.width) * image.width)))
  const bottom = Math.max(top, Math.min(image.height - 1, Math.round((rectangle.y + rectangle.height) * image.height)))
  const stroke = Math.max(4, Math.round(image.width / 600))

  function pixel(x: number, y: number): void {
    const offset = (image.width * y + x) * 4
    image.data[offset] = 255
    image.data[offset + 1] = 115
    image.data[offset + 2] = 75
    image.data[offset + 3] = 255
  }

  for (let s = 0; s < stroke; s += 1) {
    for (let x = left; x <= right; x += 1) {
      if (top + s < image.height) pixel(x, top + s)
      if (bottom - s >= 0) pixel(x, bottom - s)
    }
    for (let y = top; y <= bottom; y += 1) {
      if (left + s < image.width) pixel(left + s, y)
      if (right - s >= 0) pixel(right - s, y)
    }
  }
  return PNG.sync.write(image)
}
