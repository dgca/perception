export type Mode = 'pointer' | 'rectangle'

export type Rectangle = {
  x: number
  y: number
  width: number
  height: number
}

export type ScreenBounds = { x: number; y: number; width: number; height: number }

export type AgentMark =
  | ({ id: string; kind: 'rectangle'; label?: string } & Rectangle)
  | { id: string; kind: 'arrow'; fromX: number; fromY: number; toX: number; toY: number; label?: string }
  | { id: string; kind: 'label'; x: number; y: number; text: string }

export type ChatMessage = { id: string; role: 'user' | 'agent'; text: string }

export type OverlayState = {
  visible: boolean
  mode: Mode
  userRectangle: Rectangle | null
  agentMarks: AgentMark[]
  messages: ChatMessage[]
  loading: boolean
  status: string
  codexPath: string | null
  shortcut: string
  shortcutReady: boolean
  developerInstructions: string
  displayBounds: ScreenBounds | null
  canvasBounds: ScreenBounds | null
}

export type OverlayAPI = {
  getState(): Promise<OverlayState>
  onState(listener: (state: OverlayState) => void): () => void
  setMode(mode: Mode): void
  setRectangle(rectangle: Rectangle | null): void
  sendPrompt(text: string): Promise<void>
  hide(): void
  clear(): Promise<void>
  newConversation(): Promise<void>
  chooseCodex(): Promise<void>
  openScreenSettings(): void
  setShortcut(shortcut: string): Promise<{ ok: boolean; error?: string }>
  setDeveloperInstructions(instructions: string): Promise<{ ok: boolean; error?: string }>
  movePanel(panel: 'toolbar' | 'composer', dx: number, dy: number): void
}
