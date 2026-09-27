import type { AgentMark, OverlayState, Rectangle } from '../shared/types'
import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')!
const view = new URLSearchParams(location.search).get('view') ?? 'composer'
let state: OverlayState | null = null

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

function safe(value: number): number { return Math.max(0, Math.min(1, value)) }

function setupCanvas(): void {
  document.body.className = 'canvas-body'
  app.innerHTML = '<svg id="canvas" aria-label="Screen annotations"><defs><marker id="arrowhead" markerWidth="12" markerHeight="10" refX="10" refY="5" orient="auto"><path d="M 0 0 L 12 5 L 0 10 z" fill="#41d5c1" /></marker></defs><g id="marks"></g><rect id="preview" hidden /></svg>'
  const svg = document.querySelector<SVGSVGElement>('#canvas')!
  const preview = document.querySelector<SVGRectElement>('#preview')!
  let origin: { x: number; y: number } | null = null

  const position = (event: PointerEvent): { x: number; y: number } => ({ x: safe(event.clientX / innerWidth), y: safe(event.clientY / innerHeight) })
  svg.addEventListener('pointerdown', (event) => {
    if (state?.mode !== 'rectangle' || event.button !== 0) return
    origin = position(event)
    svg.setPointerCapture(event.pointerId)
    preview.removeAttribute('hidden')
    preview.setAttribute('x', String(event.clientX))
    preview.setAttribute('y', String(event.clientY))
    preview.setAttribute('width', '0')
    preview.setAttribute('height', '0')
  })
  svg.addEventListener('pointermove', (event) => {
    if (!origin) return
    const now = position(event)
    preview.setAttribute('x', String(Math.min(origin.x, now.x) * innerWidth))
    preview.setAttribute('y', String(Math.min(origin.y, now.y) * innerHeight))
    preview.setAttribute('width', String(Math.abs(origin.x - now.x) * innerWidth))
    preview.setAttribute('height', String(Math.abs(origin.y - now.y) * innerHeight))
  })
  const end = (event: PointerEvent): void => {
    if (!origin) return
    const now = position(event)
    const rectangle: Rectangle = {
      x: Math.min(origin.x, now.x), y: Math.min(origin.y, now.y),
      width: Math.abs(origin.x - now.x), height: Math.abs(origin.y - now.y)
    }
    origin = null
    preview.setAttribute('hidden', '')
    if (rectangle.width > 0.002 && rectangle.height > 0.002) {
      window.perception.setRectangle(rectangle)
      window.perception.setMode('pointer')
    }
  }
  svg.addEventListener('pointerup', end)
  svg.addEventListener('pointercancel', () => { origin = null; preview.setAttribute('hidden', '') })
}

function rectSvg(rectangle: Rectangle, className: string, label?: string): string {
  const x = rectangle.x * innerWidth
  const y = rectangle.y * innerHeight
  const width = rectangle.width * innerWidth
  const height = rectangle.height * innerHeight
  return `<rect class="${className}" x="${x}" y="${y}" width="${width}" height="${height}" rx="8" />${label ? labelSvg(x, y - 8, label) : ''}`
}

function labelSvg(x: number, y: number, text: string): string {
  const label = escapeHtml(text.slice(0, 120))
  const width = Math.min(400, Math.max(60, text.length * 7.6 + 22))
  const left = Math.min(Math.max(8, x), innerWidth - width - 8)
  const top = Math.min(Math.max(27, y), innerHeight - 8)
  return `<g class="agent-label" transform="translate(${left}, ${top})"><rect x="0" y="-24" width="${width}" height="28" rx="8"/><text x="10" y="-6">${label}</text></g>`
}

function markSvg(mark: AgentMark): string {
  if (mark.kind === 'rectangle') return rectSvg(mark, 'agent-rect', mark.label)
  if (mark.kind === 'arrow') {
    const x1 = mark.fromX * innerWidth
    const y1 = mark.fromY * innerHeight
    const x2 = mark.toX * innerWidth
    const y2 = mark.toY * innerHeight
    return `<line class="agent-arrow" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#arrowhead)" />${mark.label ? labelSvg(x1, y1 - 8, mark.label) : ''}`
  }
  return labelSvg(mark.x * innerWidth, mark.y * innerHeight, mark.text)
}

function updateCanvas(next: OverlayState): void {
  document.body.classList.toggle('drawing', next.mode === 'rectangle')
  const marks = document.querySelector<SVGGElement>('#marks')!
  marks.innerHTML = [
    ...next.agentMarks.map(markSvg),
    next.userRectangle ? rectSvg(next.userRectangle, 'user-rect') : ''
  ].join('')
}

function setupToolbar(): void {
  document.body.className = 'toolbar-body'
  app.innerHTML = `<div class="tool-panel" role="toolbar" aria-label="Annotation tools">
    <div class="grip" aria-hidden="true">⠿</div>
    <button id="pointer-tool" title="Pointer mode: use the app beneath" aria-label="Pointer mode"><svg viewBox="0 0 24 24"><path d="M5 3l2 16 4-5 4 7 3-2-4-7 7-1z"/></svg></button>
    <button id="rect-tool" title="Draw a rectangle" aria-label="Draw rectangle"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/></svg></button>
    <div class="tool-separator"></div>
    <button id="clear-tool" title="New conversation" aria-label="New conversation"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 10v7m4-7v7"/></svg></button>
    <button id="hide-tool" title="Dismiss overlay" aria-label="Dismiss overlay"><svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg></button>
  </div>`
  document.querySelector('#pointer-tool')!.addEventListener('click', () => window.perception.setMode('pointer'))
  document.querySelector('#rect-tool')!.addEventListener('click', () => window.perception.setMode('rectangle'))
  document.querySelector('#clear-tool')!.addEventListener('click', () => window.perception.clear())
  document.querySelector('#hide-tool')!.addEventListener('click', () => window.perception.hide())
}

function updateToolbar(next: OverlayState): void {
  document.querySelector('#pointer-tool')?.classList.toggle('active', next.mode === 'pointer')
  document.querySelector('#rect-tool')?.classList.toggle('active', next.mode === 'rectangle')
}

function setupComposer(): void {
  document.body.className = 'composer-body'
  app.innerHTML = `<section class="composer" aria-label="Perception conversation">
    <div class="conversation" id="conversation"><div class="empty-state">Ask about anything on this screen.<br><span>Draw a rectangle when you want to point at something.</span></div></div>
    <form id="prompt-form"><textarea id="prompt" rows="2" placeholder="What would you like to know?" aria-label="Message to agent"></textarea><button class="send-button" id="send" type="submit" aria-label="Send message"><svg viewBox="0 0 24 24"><path d="M12 19V5m0 0-6 6m6-6 6 6"/></svg></button></form>
    <div class="composer-footer"><span id="status">Starting…</span><button id="choose-codex" class="text-button" hidden>Choose Codex CLI</button><button id="screen-settings" class="text-button" hidden>Screen Recording settings</button><span class="footer-hint">⌘⇧Space to hide</span></div>
  </section>`
  const form = document.querySelector<HTMLFormElement>('#prompt-form')!
  const textarea = document.querySelector<HTMLTextAreaElement>('#prompt')!
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const text = textarea.value.trim()
    if (!text || state?.loading) return
    textarea.value = ''
    void window.perception.sendPrompt(text)
  })
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      form.requestSubmit()
    }
  })
  document.querySelector('#choose-codex')!.addEventListener('click', () => { void window.perception.chooseCodex() })
  document.querySelector('#screen-settings')!.addEventListener('click', () => window.perception.openScreenSettings())
}

function updateComposer(next: OverlayState): void {
  const conversation = document.querySelector<HTMLDivElement>('#conversation')!
  const latest = next.messages.map((message) => message.id).join(',') + `:${next.loading}`
  if (conversation.dataset.renderKey !== latest) {
    conversation.innerHTML = next.messages.length
      ? next.messages.map((message) => `<div class="message ${message.role}"><span class="role">${message.role === 'user' ? 'You' : 'Agent'}</span><p>${escapeHtml(message.text)}</p></div>`).join('') + (next.loading ? '<div class="thinking"><span></span><span></span><span></span></div>' : '')
      : '<div class="empty-state">Ask about anything on this screen.<br><span>Draw a rectangle when you want to point at something.</span></div>'
    conversation.dataset.renderKey = latest
    conversation.scrollTop = conversation.scrollHeight
  }
  document.querySelector('#status')!.textContent = next.status
  document.querySelector<HTMLButtonElement>('#send')!.disabled = next.loading || !next.codexPath
  document.querySelector<HTMLButtonElement>('#choose-codex')!.hidden = Boolean(next.codexPath)
  document.querySelector<HTMLButtonElement>('#screen-settings')!.hidden = !next.messages.at(-1)?.text.includes('Screen Recording permission is needed')
}

if (view === 'canvas') setupCanvas()
else if (view === 'toolbar') setupToolbar()
else setupComposer()

window.perception.onState((next) => {
  state = next
  if (view === 'canvas') updateCanvas(next)
  else if (view === 'toolbar') updateToolbar(next)
  else updateComposer(next)
})
void window.perception.getState().then((next) => {
  state = next
  if (view === 'canvas') updateCanvas(next)
  else if (view === 'toolbar') updateToolbar(next)
  else updateComposer(next)
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.perception.hide()
})
window.addEventListener('resize', () => { if (view === 'canvas' && state) updateCanvas(state) })
