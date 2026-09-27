import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

type CodexEvent = {
  type?: string
  thread_id?: string
  item?: { type?: string; text?: string; name?: string }
  message?: string
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

export class CodexAgent {
  private threadId: string | null = null
  private child: ChildProcess | null = null

  constructor(
    private readonly codexPath: () => string | null,
    private readonly socketPath: string,
    private readonly onStatus: (status: string) => void
  ) {}

  reset(): void {
    this.threadId = null
  }

  cancel(): void {
    this.child?.kill('SIGTERM')
  }

  async ask(prompt: string, imagePath: string): Promise<string> {
    const binary = this.codexPath()
    if (!binary) throw new Error('Choose a Codex CLI executable before sending a message.')
    const packagedScript = join(app.getAppPath(), 'out/mcp/server.cjs')
    const mcpScript = app.isPackaged ? packagedScript.replace('app.asar/', 'app.asar.unpacked/') : join(__dirname, '../mcp/server.cjs')
    if (!existsSync(mcpScript)) throw new Error(`Drawing tool is missing: ${mcpScript}`)

    const mcpConfig = `mcp_servers.perception={command=${tomlString(process.execPath)},args=[${tomlString(mcpScript)}],env={ELECTRON_RUN_AS_NODE="1",PERCEPTION_SOCKET_PATH=${tomlString(this.socketPath)}}}`
    const common = [
      '--json', '--skip-git-repo-check', '--ignore-user-config',
      '-m', 'gpt-6-sol', '-i', imagePath, '-c', mcpConfig
    ]
    const args = this.threadId
      ? ['exec', 'resume', ...common, '-c', 'sandbox_mode="read-only"', this.threadId, prompt]
      : ['exec', ...common, '-s', 'read-only', '-C', app.getPath('userData'), prompt]

    this.onStatus('Asking Codex…')
    return new Promise<string>((resolve, reject) => {
      const child = spawn(binary, args, {
        cwd: app.getPath('userData'),
        env: { ...process.env, PATH: `${process.env.PATH ?? ''}:/opt/homebrew/bin:/usr/local/bin:/usr/bin` },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.child = child
      let stdout = ''
      let stderr = ''
      let answer = ''
      let settled = false

      const parseLine = (line: string): void => {
        if (!line.trim()) return
        let event: CodexEvent
        try { event = JSON.parse(line) as CodexEvent } catch { return }
        if (event.type === 'thread.started' && event.thread_id) this.threadId = event.thread_id
        if (event.type === 'item.started' && event.item?.type === 'mcp_tool_call') this.onStatus('Drawing on the canvas…')
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
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString().slice(0, 3000) })
      child.on('error', (error) => {
        if (settled) return
        settled = true
        this.child = null
        reject(error)
      })
      child.on('close', (code) => {
        if (settled) return
        settled = true
        this.child = null
        parseLine(stdout)
        if (code !== 0) reject(new Error(stderr.trim() || `Codex exited with status ${code}`))
        else if (!answer.trim()) reject(new Error(stderr.trim() || 'Codex returned no text.'))
        else resolve(answer.trim())
      })
    })
  }
}
