import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Capture } from './conversation'

const CAPTURE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i

async function ensureCaptureDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
}

export async function removeStaleCaptures(directory: string): Promise<void> {
  await ensureCaptureDirectory(directory)
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && CAPTURE_NAME.test(entry.name)) await unlink(join(directory, entry.name))
  }
}

export async function writeCapture(directory: string, png: Buffer): Promise<Capture> {
  await ensureCaptureDirectory(directory)
  const path = join(directory, `${randomUUID()}.png`)
  await writeFile(path, png, { flag: 'wx', mode: 0o600 })
  return { path, dispose: () => unlink(path) }
}
