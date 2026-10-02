import type { AgentMark, Rectangle } from '../shared/types'
import type { AppContext } from './app-context'

export type ScreenshotContext = {
  captureDescription: string
  appContext: AppContext | null
  selection: Rectangle | null
}

export type HarnessRequest = {
  userRequest: string
  userPreferences: string
  screenshotContext: ScreenshotContext
  imagePath: string
  signal: AbortSignal
  onStatus(status: string): void
  onMark(mark: AgentMark | 'clear'): void
}

// Inputs are raw text and data. The adapter assembles and escapes its request.
// Preferences are a chat snapshot, supplied again if cancellation replaces a session.
// A session owns its harness's history and stops work when the signal aborts.
// Perception owns captures and ignores callbacks from old requests.
export interface HarnessSession {
  ask(request: HarnessRequest): Promise<string>
}
