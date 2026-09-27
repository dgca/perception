import type { OverlayAPI } from '../shared/types'

declare global {
  interface Window {
    perception: OverlayAPI
  }
}

export {}
