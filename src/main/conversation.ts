import { randomUUID } from 'node:crypto'
import type { OverlayState, Rectangle } from '../shared/types'
import { appContextPrompt, type AppContext } from './app-context'
import type { HarnessSession } from './harness'
import { clearAnnotations } from './overlay-actions'

export type Capture = { path: string; appContext?: AppContext | null; dispose(): Promise<void> }

export type ConversationHost = {
  createSession(): HarnessSession
  capture(rectangle: Rectangle | null, signal: AbortSignal): Promise<Capture>
  setPointerMode(): void
  publish(): void
}

type ActiveRequest = { signal: AbortController; marksEnabled: boolean }

export class Conversation {
  private session: HarnessSession
  private active: ActiveRequest | null = null

  constructor(
    private readonly state: OverlayState,
    private readonly host: ConversationHost
  ) {
    this.session = host.createSession()
  }

  async send(text: string): Promise<void> {
    const question = text.trim()
    if (!question || this.active) return

    const request: ActiveRequest = { signal: new AbortController(), marksEnabled: true }
    this.active = request
    const rectangle = this.state.userRectangle
    let capture: Capture | null = null
    this.state.messages.push({ id: randomUUID(), role: 'user', text: question })
    this.state.loading = true
    this.state.status = 'Capturing the display…'
    this.host.publish()

    try {
      capture = await this.host.capture(rectangle, request.signal.signal)
      if (!this.isCurrent(request)) return

      const selected = rectangle
        ? `The user drew an orange rectangle at normalized coordinates x=${rectangle.x.toFixed(4)}, y=${rectangle.y.toFixed(4)}, width=${rectangle.width.toFixed(4)}, height=${rectangle.height.toFixed(4)}. The same rectangle is visible on the image.`
        : 'The user did not select a region. Consider the full display.'
      const prompt = [
        'The attached image is a full-display capture taken when they sent this message. It may become stale as the user works.',
        capture.appContext ? appContextPrompt(capture.appContext) : null,
        selected,
        `User request: ${question}`
      ]
        .filter((part) => part !== null)
        .join('\n\n')

      const answer = await this.session.ask({
        prompt,
        imagePath: capture.path,
        signal: request.signal.signal,
        onStatus: (status) => {
          if (!this.isCurrent(request)) return
          this.state.status = status
          this.host.publish()
        },
        onMark: (mark) => {
          if (!this.isCurrent(request) || !request.marksEnabled) return
          if (mark === 'clear') this.state.agentMarks = []
          else this.state.agentMarks.push(mark)
          this.host.publish()
        }
      })
      if (!this.isCurrent(request)) return
      this.state.messages.push({ id: randomUUID(), role: 'agent', text: answer })
      this.state.userRectangle = null
      this.host.setPointerMode()
      this.state.status = 'Ready'
    } catch (error) {
      if (!this.isCurrent(request)) return
      this.state.messages.push({
        id: randomUUID(),
        role: 'agent',
        text: `Could not complete that request: ${error instanceof Error ? error.message : String(error)}`
      })
      this.state.status = 'Needs attention'
    } finally {
      if (capture) await capture.dispose().catch((error: unknown) => console.error('Could not remove capture:', error))
      if (this.isCurrent(request)) {
        this.active = null
        this.state.loading = false
        this.host.publish()
      }
    }
  }

  clearMarks(): void {
    clearAnnotations(this.state)
    if (this.active) this.active.marksEnabled = false
    this.host.setPointerMode()
    this.state.status = 'Annotations cleared'
    this.host.publish()
  }

  reset(): void {
    this.cancel()
    this.state.userRectangle = null
    this.state.agentMarks = []
    this.state.messages = []
    this.host.setPointerMode()
    this.state.status = 'Ready'
    this.host.publish()
  }

  cancelForDisplayChange(): void {
    if (!this.active) return
    this.cancel()
    this.state.status = 'Display changed. Send your message again.'
    this.host.publish()
  }

  cancel(): void {
    this.active?.signal.abort()
    this.active = null
    this.session = this.host.createSession()
    this.state.loading = false
    this.host.publish()
  }

  close(): void {
    this.active?.signal.abort()
    this.active = null
  }

  private isCurrent(request: ActiveRequest): boolean {
    return this.active === request && !request.signal.signal.aborted
  }
}
