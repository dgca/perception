import { PNG } from 'pngjs'

type Point = [number, number]
type Segment = [Point, Point]

function distanceToSegment(x: number, y: number, [start, end]: Segment): number {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const t = Math.max(0, Math.min(1, ((x - start[0]) * dx + (y - start[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - start[0] - t * dx, y - start[1] - t * dy)
}

function curve(start: Point, control1: Point, control2: Point, end: Point): Segment[] {
  const segments: Segment[] = []
  let previous = start
  for (let step = 1; step <= 24; step += 1) {
    const t = step / 24
    const u = 1 - t
    const point: Point = [
      u * u * u * start[0] + 3 * u * u * t * control1[0] + 3 * u * t * t * control2[0] + t * t * t * end[0],
      u * u * u * start[1] + 3 * u * u * t * control1[1] + 3 * u * t * t * control2[1] + t * t * t * end[1]
    ]
    segments.push([previous, point])
    previous = point
  }
  return segments
}

export function trayIconPng(): Buffer {
  const size = 32
  const samples = 4
  const path: Segment[] = [
    [
      [26, 83],
      [26, 17]
    ],
    [
      [26, 17],
      [50, 17]
    ],
    ...curve([50, 17], [69, 17], [79, 26], [79, 42]),
    ...curve([79, 42], [79, 58], [69, 66], [50, 66]),
    [
      [50, 66],
      [26, 66]
    ]
  ]
  const png = new PNG({ width: size, height: size })

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let covered = 0
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = ((x + (sx + 0.5) / samples) * 100) / size
          const py = ((y + (sy + 0.5) / samples) * 100) / size
          const outline = path.some((segment) => distanceToSegment(px, py, segment) <= 4)
          const pupil = Math.hypot(px - 52, py - 42) <= 6
          if (outline || pupil) covered += 1
        }
      }
      png.data[(y * size + x) * 4 + 3] = Math.round((covered * 255) / (samples * samples))
    }
  }

  return PNG.sync.write(png)
}
