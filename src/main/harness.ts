import type { AgentMark } from '../shared/types'

export type HarnessRequest = {
  prompt: string
  imagePath: string
  signal: AbortSignal
  onStatus(status: string): void
  onMark(mark: AgentMark | 'clear'): void
}

// A session owns its harness's conversation history and stops work when the
// signal aborts. Perception owns captures and ignores callbacks from old requests.
export interface HarnessSession {
  ask(request: HarnessRequest): Promise<string>
}
