import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { DrawingBridge } from './drawing-bridge'
import type { HarnessRequest, HarnessSession } from './harness'

type CodexEvent = {
  type?: string
  thread_id?: string
  item?: { type?: string; text?: string; name?: string }
  message?: string
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function cancelled(): Error {
  return Object.assign(new Error('Request cancelled'), { name: 'AbortError' })
}

// The Codex adapter owns the CLI process, session ID, and MCP transport.
// Other harnesses can implement HarnessSession without using any of them.
export class CodexAgent implements HarnessSession {
  private threadId: string | null = null

  constructor(
    private readonly codexPath: () => string | null,
    private readonly getDeveloperInstructions: () => string
  ) {}

  async ask(request: HarnessRequest): Promise<string> {
    if (request.signal.aborted) throw cancelled()
    const binary = this.codexPath()
    if (!binary) throw new Error('Choose a Codex CLI executable before sending a message.')
    const packagedScript = join(app.getAppPath(), 'out/mcp/server.cjs')
    const mcpScript = app.isPackaged ? packagedScript.replace('app.asar/', 'app.asar.unpacked/') : join(__dirname, '../mcp/server.cjs')
    if (!existsSync(mcpScript)) throw new Error(`Drawing tool is missing: ${mcpScript}`)

    const bridge = new DrawingBridge((mark) => {
      if (!request.signal.aborted) request.onMark(mark)
    })
    await bridge.start()
    try {
      if (request.signal.aborted) throw cancelled()
      const mcpConfig = `mcp_servers.perception={command=${tomlString(process.execPath)},args=[${tomlString(mcpScript)}],env={ELECTRON_RUN_AS_NODE="1",PERCEPTION_SOCKET_PATH=${tomlString(bridge.socketPath)}}}`
      const common = [
        '--json',
        '--skip-git-repo-check',
        '--ignore-user-config',
        '-m',
        'gpt-6-sol',
        '-i',
        request.imagePath,
        '-c',
        mcpConfig,
        '-c',
        `developer_instructions=${tomlString(this.getDeveloperInstructions())}`,
        '-c',
        'web_search="live"'
      ]
      const args = this.threadId
        ? ['exec', 'resume', ...common, '-c', 'sandbox_mode="read-only"', this.threadId, request.prompt]
        : ['exec', ...common, '-s', 'read-only', '-C', app.getPath('userData'), request.prompt]

      request.onStatus('Asking Codex…')
      return await new Promise<string>((resolve, reject) => {
        const child = spawn(binary, args, {
          cwd: app.getPath('userData'),
          env: { ...process.env, PATH: `${process.env.PATH ?? ''}:/opt/homebrew/bin:/usr/local/bin:/usr/bin` },
          stdio: ['ignore', 'pipe', 'pipe']
        })
        let stdout = ''
        let stderr = ''
        let answer = ''
        let settled = false
        let killTimer: NodeJS.Timeout | null = null

        const finish = (error?: Error): void => {
          if (settled) return
          settled = true
          request.signal.removeEventListener('abort', abort)
          if (error) reject(error)
          else if (!answer.trim()) reject(new Error(stderr.trim() || 'Codex returned no text.'))
          else resolve(answer.trim())
        }
        const abort = (): void => {
          child.kill('SIGTERM')
          killTimer = setTimeout(() => child.kill('SIGKILL'), 3000)
          killTimer.unref()
          finish(cancelled())
        }
        request.signal.addEventListener('abort', abort, { once: true })
        if (request.signal.aborted) abort()

        const parseLine = (line: string): void => {
          if (settled || !line.trim()) return
          let event: CodexEvent
          try {
            event = JSON.parse(line) as CodexEvent
          } catch {
            return
          }
          if (event.type === 'thread.started' && event.thread_id) this.threadId = event.thread_id
          if (event.type === 'item.started' && event.item?.type === 'mcp_tool_call') request.onStatus('Drawing on the canvas…')
          if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) answer = event.item.text
          if (event.type === 'error' && event.message) stderr += `\n${event.message}`
        }

        child.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString()
          let end = stdout.indexOf('\n')
          while (end >= 0) {
            parseLine(stdout.slice(0, end))
            stdout = stdout.slice(end + 1)
            end = stdout.indexOf('\n')
          }
        })
        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString().slice(0, 3000)
        })
        child.on('error', (error) => finish(error))
        child.on('close', (code) => {
          if (killTimer) clearTimeout(killTimer)
          parseLine(stdout)
          if (code !== 0) finish(new Error(stderr.trim() || `Codex exited with status ${code}`))
          else finish()
        })
      })
    } finally {
      await bridge.stop()
    }
  }
}
