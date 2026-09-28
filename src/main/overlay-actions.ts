import type { OverlayState } from '../shared/types'

export function clearAnnotations(state: OverlayState): void {
  state.userRectangle = null
  state.agentMarks = []
  state.mode = 'pointer'
}
