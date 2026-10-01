import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { removeStaleCaptures, writeCapture } from '../src/main/capture-files'

test('captures are private and stale captures are removed on startup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'perception-captures-test-'))
  const directory = join(root, 'captures')
  try {
    const capture = await writeCapture(directory, Buffer.from('capture'))
    assert.equal((await stat(directory)).mode & 0o777, 0o700)
    assert.equal((await stat(capture.path)).mode & 0o777, 0o600)
    assert.deepEqual(await readFile(capture.path), Buffer.from('capture'))
    await writeFile(join(directory, 'unrelated.txt'), 'keep')
    await removeStaleCaptures(directory)
    await assert.rejects(stat(capture.path), { code: 'ENOENT' })
    assert.equal(await readFile(join(directory, 'unrelated.txt'), 'utf8'), 'keep')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
