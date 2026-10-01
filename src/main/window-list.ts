import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Rectangle, ScreenBounds } from '../shared/types'
import { parseWindowList, selectAppContext, type AppContext } from './app-context'

const execFileAsync = promisify(execFile)

export async function readAppContext(
  helperPath: string,
  display: ScreenBounds,
  rectangle: Rectangle | null,
  ownPid: number,
  signal: AbortSignal
): Promise<AppContext | null> {
  try {
    const { stdout } = await execFileAsync(helperPath, [], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 1500,
      signal
    })
    const windows = parseWindowList(JSON.parse(stdout))
    return windows ? selectAppContext(windows, display, rectangle, ownPid) : null
  } catch {
    return null
  }
}
