import type { AgentMark, Rectangle, ScreenBounds } from '../shared/types'

export type CanvasGeometry = {
  display: ScreenBounds
  canvas: ScreenBounds
}

type MeasureText = (text: string) => number
const estimateWidth: MeasureText = (text) => text.length * 7.6

function safe(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

export function normalizedPointer(x: number, y: number, geometry: CanvasGeometry): { x: number; y: number } {
  const { display, canvas } = geometry
  return {
    x: safe((x + canvas.x - display.x) / display.width),
    y: safe((y + canvas.y - display.y) / display.height)
  }
}

export function rectanglePixels(rectangle: Rectangle, geometry: CanvasGeometry): Rectangle {
  const { display, canvas } = geometry
  return {
    x: display.x + rectangle.x * display.width - canvas.x,
    y: display.y + rectangle.y * display.height - canvas.y,
    width: rectangle.width * display.width,
    height: rectangle.height * display.height
  }
}

function wrapLabel(text: string, maxWidth: number, measureText: MeasureText): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.trim().split(/\s+/)) {
    if (!word) continue
    const candidate = line ? `${line} ${word}` : word
    if (measureText(candidate) <= maxWidth) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    line = ''
    for (const character of word) {
      if (line && measureText(line + character) > maxWidth) {
        lines.push(line)
        line = ''
      }
      line += character
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function labelSvg(x: number, y: number, text: string, geometry: CanvasGeometry, measureText: MeasureText): string {
  const maxWidth = Math.min(400, geometry.canvas.width - 16)
  const lines = wrapLabel(text.slice(0, 120), Math.max(1, maxWidth - 20), measureText)
  const width = Math.min(maxWidth, Math.max(60, ...lines.map((line) => measureText(line) + 20)))
  const height = 12 + 17 * lines.length
  const left = Math.max(8, Math.min(x, geometry.canvas.width - width - 8))
  const top = Math.max(8, Math.min(y + 4 - height, geometry.canvas.height - height - 8))
  const spans = lines.map((line, index) => `<tspan x="10" y="${18 + index * 17}">${escapeHtml(line)}</tspan>`).join('')
  return `<g class="agent-label" transform="translate(${left}, ${top})"><rect width="${width}" height="${height}" rx="8"/><text>${spans}</text></g>`
}

export function rectSvg(rectangle: Rectangle, className: string, geometry: CanvasGeometry, label?: string, measureText: MeasureText = estimateWidth): string {
  const { x, y, width, height } = rectanglePixels(rectangle, geometry)
  return `<rect class="${className}" x="${x}" y="${y}" width="${width}" height="${height}" rx="8" />${label ? labelSvg(x, y - 8, label, geometry, measureText) : ''}`
}

export function markSvg(mark: AgentMark, geometry: CanvasGeometry, measureText: MeasureText = estimateWidth): string {
  if (mark.kind === 'rectangle') return rectSvg(mark, 'agent-rect', geometry, mark.label, measureText)
  const { display, canvas } = geometry
  if (mark.kind === 'arrow') {
    const x1 = display.x + mark.fromX * display.width - canvas.x
    const y1 = display.y + mark.fromY * display.height - canvas.y
    const x2 = display.x + mark.toX * display.width - canvas.x
    const y2 = display.y + mark.toY * display.height - canvas.y
    return `<line class="agent-arrow" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#arrowhead)" />${mark.label ? labelSvg(x1, y1 - 8, mark.label, geometry, measureText) : ''}`
  }
  return labelSvg(display.x + mark.x * display.width - canvas.x, display.y + mark.y * display.height - canvas.y, mark.text, geometry, measureText)
}
