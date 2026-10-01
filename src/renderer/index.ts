import type { OverlayState, Rectangle } from '../shared/types'
import { DEFAULT_DEVELOPER_INSTRUCTIONS } from '../main/preferences'
import { markSvg, normalizedPointer, rectSvg, rectanglePixels, type CanvasGeometry } from './annotations'
import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')!
const view = new URLSearchParams(location.search).get('view') ?? 'composer'
let state: OverlayState | null = null
const labelContext = view === 'canvas' ? document.createElement('canvas').getContext('2d') : null
if (labelContext) labelContext.font = '650 13px -apple-system, BlinkMacSystemFont, sans-serif'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

function canvasGeometry(next: OverlayState | null = state): CanvasGeometry {
  const fallback = { x: window.screenX, y: window.screenY, width: innerWidth, height: innerHeight }
  return { display: next?.displayBounds ?? fallback, canvas: next?.canvasBounds ?? fallback }
}

function measureLabel(text: string): number {
  return labelContext?.measureText(text).width ?? text.length * 7.6
}

function shortcutLabel(shortcut: string): string {
  return shortcut.replace('Command', '⌘').replace('Control', '⌃').replace('Alt', '⌥').replace('Shift', '⇧').replaceAll('+', '')
}

function shortcutFromKey(event: KeyboardEvent): string | null {
  const key = /^Key[A-Z]$/.test(event.code)
    ? event.code.slice(3)
    : /^Digit[0-9]$/.test(event.code)
      ? event.code.slice(5)
      : event.code === 'Space'
        ? 'Space'
        : /^F(?:[1-9]|1[0-2])$/.test(event.code)
          ? event.code
          : null
  if (!key || !(event.metaKey || event.ctrlKey || event.altKey)) return null
  return [event.metaKey && 'Command', event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', key].filter(Boolean).join('+')
}

function makeDraggable(handle: HTMLElement, panel: 'toolbar' | 'composer'): void {
  let last: { x: number; y: number } | null = null
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return
    event.preventDefault()
    last = { x: event.screenX, y: event.screenY }
    handle.setPointerCapture(event.pointerId)
  })
  handle.addEventListener('pointermove', (event) => {
    if (!last) return
    const dx = event.screenX - last.x
    const dy = event.screenY - last.y
    last = { x: event.screenX, y: event.screenY }
    if (dx || dy) window.perception.movePanel(panel, dx, dy)
  })
  const stop = (): void => {
    last = null
  }
  handle.addEventListener('pointerup', stop)
  handle.addEventListener('pointercancel', stop)
  handle.addEventListener('lostpointercapture', stop)
}

function setupCanvas(): void {
  document.body.className = 'canvas-body'
  app.innerHTML =
    '<svg id="canvas" aria-label="Screen annotations"><defs><marker id="arrowhead" markerWidth="12" markerHeight="10" refX="10" refY="5" orient="auto"><path d="M 0 0 L 12 5 L 0 10 z" fill="#41d5c1" /></marker></defs><g id="marks"></g><rect id="preview" hidden /></svg>'
  const svg = document.querySelector<SVGSVGElement>('#canvas')!
  const preview = document.querySelector<SVGRectElement>('#preview')!
  let origin: { x: number; y: number } | null = null

  const position = (event: PointerEvent): { x: number; y: number } => normalizedPointer(event.clientX, event.clientY, canvasGeometry())
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
    const pixels = rectanglePixels(
      {
        x: Math.min(origin.x, now.x),
        y: Math.min(origin.y, now.y),
        width: Math.abs(origin.x - now.x),
        height: Math.abs(origin.y - now.y)
      },
      canvasGeometry()
    )
    preview.setAttribute('x', String(pixels.x))
    preview.setAttribute('y', String(pixels.y))
    preview.setAttribute('width', String(pixels.width))
    preview.setAttribute('height', String(pixels.height))
  })
  const end = (event: PointerEvent): void => {
    if (!origin) return
    const now = position(event)
    const rectangle: Rectangle = {
      x: Math.min(origin.x, now.x),
      y: Math.min(origin.y, now.y),
      width: Math.abs(origin.x - now.x),
      height: Math.abs(origin.y - now.y)
    }
    origin = null
    preview.setAttribute('hidden', '')
    if (rectangle.width > 0.002 && rectangle.height > 0.002) {
      window.perception.setRectangle(rectangle)
      window.perception.setMode('pointer')
    }
  }
  svg.addEventListener('pointerup', end)
  svg.addEventListener('pointercancel', () => {
    origin = null
    preview.setAttribute('hidden', '')
  })
}

function updateCanvas(next: OverlayState): void {
  document.body.classList.toggle('drawing', next.mode === 'rectangle')
  const marks = document.querySelector<SVGGElement>('#marks')!
  const geometry = canvasGeometry(next)
  marks.innerHTML = [
    ...next.agentMarks.map((mark) => markSvg(mark, geometry, measureLabel)),
    next.userRectangle ? rectSvg(next.userRectangle, 'user-rect', geometry) : ''
  ].join('')
}

function setupToolbar(): void {
  document.body.className = 'toolbar-body'
  app.innerHTML = `<div class="tool-panel" role="toolbar" aria-label="Annotation tools">
    <div class="grip" title="Drag toolbar" aria-label="Drag toolbar">⠿</div>
    <button id="pointer-tool" title="Pointer mode: use the app beneath" aria-label="Pointer mode"><svg viewBox="0 0 24 24"><path d="M5 3l2 16 4-5 4 7 3-2-4-7 7-1z"/></svg></button>
    <button id="rect-tool" title="Draw a rectangle" aria-label="Draw rectangle"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/></svg></button>
    <div class="tool-separator"></div>
    <button id="clear-tool" title="Clear annotations" aria-label="Clear annotations"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 10v7m4-7v7"/></svg></button>
    <button id="hide-tool" title="Dismiss overlay" aria-label="Dismiss overlay"><svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg></button>
  </div>`
  document.querySelector('#pointer-tool')!.addEventListener('click', () => window.perception.setMode('pointer'))
  document.querySelector('#rect-tool')!.addEventListener('click', () => window.perception.setMode('rectangle'))
  document.querySelector('#clear-tool')!.addEventListener('click', () => {
    void window.perception.clear()
  })
  document.querySelector('#hide-tool')!.addEventListener('click', () => window.perception.hide())
  makeDraggable(document.querySelector<HTMLElement>('.grip')!, 'toolbar')
}

function updateToolbar(next: OverlayState): void {
  document.querySelector('#pointer-tool')?.classList.toggle('active', next.mode === 'pointer')
  document.querySelector('#rect-tool')?.classList.toggle('active', next.mode === 'rectangle')
}

function setupComposer(): void {
  document.body.className = 'composer-body'
  app.innerHTML = `<section class="composer" aria-label="Perception conversation">
    <div class="composer-header"><div class="chat-grip" title="Drag chat box" aria-label="Drag chat box">⠿</div><span>Perception</span><button id="new-chat" class="header-button" title="Start a new conversation">New chat</button></div>
    <div class="conversation" id="conversation"><div class="empty-state">Ask about anything on this screen.<br><span>Draw a rectangle when you want to point at something.</span></div></div>
    <form id="prompt-form"><textarea id="prompt" rows="2" placeholder="What would you like to know?" aria-label="Message to agent"></textarea><button class="send-button" id="send" type="submit" aria-label="Send message"><svg viewBox="0 0 24 24"><path d="M12 19V5m0 0-6 6m6-6 6 6"/></svg></button></form>
    <div class="composer-footer"><span id="status">Starting…</span><button id="choose-codex" class="text-button" hidden>Choose Codex CLI</button><button id="screen-settings" class="text-button" hidden>Screen Recording settings</button><span class="footer-hint" id="shortcut-hint"></span></div>
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
  document.querySelector('#choose-codex')!.addEventListener('click', () => {
    void window.perception.chooseCodex()
  })
  document.querySelector('#screen-settings')!.addEventListener('click', () => window.perception.openScreenSettings())
  document.querySelector('#new-chat')!.addEventListener('click', () => {
    void window.perception.newConversation()
  })
  makeDraggable(document.querySelector<HTMLElement>('.composer-header')!, 'composer')
}

function updateComposer(next: OverlayState): void {
  const conversation = document.querySelector<HTMLDivElement>('#conversation')!
  const latest = next.messages.map((message) => message.id).join(',') + `:${next.loading}`
  if (conversation.dataset.renderKey !== latest) {
    conversation.innerHTML = next.messages.length
      ? next.messages
          .map(
            (message) =>
              `<div class="message ${message.role}"><span class="role">${message.role === 'user' ? 'You' : 'Agent'}</span><p>${escapeHtml(message.text)}</p></div>`
          )
          .join('') + (next.loading ? '<div class="thinking"><span></span><span></span><span></span></div>' : '')
      : '<div class="empty-state">Ask about anything on this screen.<br><span>Draw a rectangle when you want to point at something.</span></div>'
    conversation.dataset.renderKey = latest
    conversation.scrollTop = conversation.scrollHeight
  }
  document.querySelector('#status')!.textContent = next.status
  document.querySelector<HTMLButtonElement>('#send')!.disabled = next.loading || !next.codexPath
  document.querySelector<HTMLButtonElement>('#choose-codex')!.hidden = Boolean(next.codexPath)
  document.querySelector<HTMLButtonElement>('#screen-settings')!.hidden = !next.messages.at(-1)?.text.includes('Screen Recording permission is needed')
  document.querySelector('#shortcut-hint')!.textContent = `${shortcutLabel(next.shortcut)} to hide`
}

function setupSettings(): void {
  document.body.className = 'settings-body'
  app.innerHTML = `<section class="settings-panel" aria-label="Perception settings">
    <h1>Settings</h1>
    <div class="setting-row"><div><strong>Show or hide overlay</strong><p>Works while you are in another app.</p></div><button id="shortcut-input" class="shortcut-input" aria-label="Record shortcut">⌘⇧Space</button></div>
    <p class="settings-help">Click the shortcut, then press a new combination. Use ⌘, Control, or Option with a letter, number, Space, or F key.</p>
    <div class="settings-actions"><span id="shortcut-result" role="status"></span><button id="reset-shortcut" class="reset-button">Reset default</button></div>
    <div class="settings-divider"></div>
    <label class="instructions-label" for="developer-instructions">Developer instructions</label>
    <p class="instructions-help">Sent to Codex with each request. Edits apply to the next message.</p>
    <textarea id="developer-instructions" maxlength="10000" spellcheck="false" aria-label="Developer instructions"></textarea>
    <div class="settings-actions"><span id="instructions-result" role="status"></span><div class="settings-buttons"><button id="reset-instructions" class="reset-button">Reset default</button><button id="save-instructions" class="save-button">Save</button></div></div>
  </section>`
  const button = document.querySelector<HTMLButtonElement>('#shortcut-input')!
  const result = document.querySelector<HTMLSpanElement>('#shortcut-result')!
  let recording = false
  button.addEventListener('click', () => {
    recording = true
    button.textContent = 'Press shortcut…'
    result.textContent = ''
  })
  button.addEventListener('blur', () => {
    recording = false
    if (state) button.textContent = shortcutLabel(state.shortcut)
  })
  button.addEventListener('keydown', (event) => {
    if (!recording) return
    if (event.key === 'Tab') return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      recording = false
      if (state) button.textContent = shortcutLabel(state.shortcut)
      return
    }
    const shortcut = shortcutFromKey(event)
    if (!shortcut) {
      if (!['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) result.textContent = 'Use a supported key and modifier.'
      return
    }
    recording = false
    void window.perception.setShortcut(shortcut).then((response) => {
      result.textContent = response.ok ? 'Shortcut saved.' : (response.error ?? 'Could not save shortcut.')
      if (state) button.textContent = shortcutLabel(state.shortcut)
    })
  })
  document.querySelector('#reset-shortcut')!.addEventListener('click', () => {
    void window.perception.setShortcut('Command+Shift+Space').then((response) => {
      result.textContent = response.ok ? 'Default shortcut restored.' : (response.error ?? 'Could not restore shortcut.')
      if (state) button.textContent = shortcutLabel(state.shortcut)
    })
  })
  const instructions = document.querySelector<HTMLTextAreaElement>('#developer-instructions')!
  const instructionsResult = document.querySelector<HTMLSpanElement>('#instructions-result')!
  const saveInstructions = (value: string, success: string): void => {
    void window.perception
      .setDeveloperInstructions(value)
      .then((response) => {
        instructionsResult.textContent = response.ok ? success : (response.error ?? 'Could not save instructions.')
      })
      .catch(() => {
        instructionsResult.textContent = 'Could not save instructions.'
      })
  }
  instructions.addEventListener('input', () => {
    instructionsResult.textContent = ''
  })
  document.querySelector('#save-instructions')!.addEventListener('click', () => saveInstructions(instructions.value, 'Instructions saved.'))
  document.querySelector('#reset-instructions')!.addEventListener('click', () => {
    instructions.value = DEFAULT_DEVELOPER_INSTRUCTIONS
    saveInstructions(instructions.value, 'Default instructions restored.')
  })
}

function updateSettings(next: OverlayState): void {
  const button = document.querySelector<HTMLButtonElement>('#shortcut-input')!
  if (button.textContent !== 'Press shortcut…') button.textContent = shortcutLabel(next.shortcut)
  if (!next.shortcutReady) document.querySelector('#shortcut-result')!.textContent = 'Current shortcut is unavailable. Record another.'
  const instructions = document.querySelector<HTMLTextAreaElement>('#developer-instructions')!
  if (document.activeElement !== instructions && instructions.value !== next.developerInstructions) instructions.value = next.developerInstructions
}

if (view === 'canvas') setupCanvas()
else if (view === 'toolbar') setupToolbar()
else if (view === 'settings') setupSettings()
else setupComposer()

window.perception.onState((next) => {
  state = next
  if (view === 'canvas') updateCanvas(next)
  else if (view === 'toolbar') updateToolbar(next)
  else if (view === 'settings') updateSettings(next)
  else updateComposer(next)
})
void window.perception.getState().then((next) => {
  state = next
  if (view === 'canvas') updateCanvas(next)
  else if (view === 'toolbar') updateToolbar(next)
  else if (view === 'settings') updateSettings(next)
  else updateComposer(next)
})

window.addEventListener('keydown', (event) => {
  if (view !== 'settings' && event.key === 'Escape') window.perception.hide()
})
window.addEventListener('resize', () => {
  if (view === 'canvas' && state) updateCanvas(state)
})
