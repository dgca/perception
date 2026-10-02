import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const renderer = execFileSync(
  resolve('node_modules/.bin/esbuild'),
  ['src/renderer/index.ts', '--bundle', '--format=iife', '--loader:.css=empty', '--log-level=error'],
  { encoding: 'utf8' }
)

class ElementFixture {
  value = ''
  textContent = ''
  innerHTML = ''
  listeners = new Map<string, () => void>()

  addEventListener(name: string, callback: () => void): void {
    this.listeners.set(name, callback)
  }

  dispatch(name: string): void {
    this.listeners.get(name)?.()
  }
}

function settings() {
  const elements = new Map<string, ElementFixture>()
  const element = (selector: string): ElementFixture => {
    const found = elements.get(selector) ?? new ElementFixture()
    elements.set(selector, found)
    return found
  }
  const pending: { value: string; resolve: (response: { ok: boolean; error?: string }) => void; reject: () => void }[] = []
  let onState: (state: object) => void = () => {}
  runInNewContext(renderer, {
    URLSearchParams,
    location: { search: '?view=settings' },
    document: { body: {}, querySelector: element },
    window: {
      addEventListener: () => {},
      perception: {
        getState: () => new Promise(() => {}),
        onState: (callback: typeof onState) => {
          onState = callback
        },
        setUserPreferences: (value: string) =>
          new Promise((resolve, reject) => {
            pending.push({ value, resolve, reject })
          })
      }
    }
  })
  const preferences = element('#user-preferences')
  const result = element('#preferences-result')
  return {
    preferences,
    result,
    pending,
    edit(value: string) {
      preferences.value = value
      preferences.dispatch('input')
    },
    save() {
      element('#save-preferences').dispatch('click')
    },
    clear() {
      element('#clear-preferences').dispatch('click')
    },
    broadcast(value: string) {
      onState({ shortcut: 'Command+Shift+Space', shortcutReady: true, userPreferences: value })
    }
  }
}

const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

test('overlapping saves cannot mark a later same-text draft clean', async () => {
  const ui = settings()
  ui.broadcast('Initial')
  ui.edit('A')
  ui.save()
  ui.edit('B')
  ui.save()
  ui.edit('A')
  assert.deepEqual(
    ui.pending.map(({ value }) => value),
    ['A', 'B']
  )
  ui.broadcast('A')
  ui.pending[0].resolve({ ok: true })
  await flush()
  ui.broadcast('B')
  ui.pending[1].resolve({ ok: true })
  await flush()
  assert.equal(ui.preferences.value, 'A')
  assert.equal(ui.result.textContent, '')
  ui.broadcast('B')
  assert.equal(ui.preferences.value, 'A')
  ui.save()
  ui.broadcast('A')
  ui.pending[2].resolve({ ok: true })
  await flush()
  assert.match(ui.result.textContent, /Preferences saved/)
  ui.broadcast('Another saved value')
  assert.equal(ui.preferences.value, 'Another saved value')
})

test('latest save controls confirmation and Clear protects later edits', async () => {
  const ui = settings()
  ui.edit('A')
  ui.save()
  ui.save()
  ui.pending[1].resolve({ ok: true })
  await flush()
  ui.pending[0].resolve({ ok: false, error: 'Older failure' })
  await flush()
  assert.match(ui.result.textContent, /Preferences saved/)
  ui.clear()
  assert.equal(ui.preferences.value, '')
  assert.equal(ui.pending[2].value, '')
  ui.edit('New draft')
  ui.pending[2].resolve({ ok: true })
  await flush()
  ui.broadcast('')
  assert.equal(ui.preferences.value, 'New draft')
  assert.equal(ui.result.textContent, '')
})

test('failed saves retain drafts and a retry restores state synchronization', async () => {
  const ui = settings()
  ui.edit('Draft')
  ui.save()
  ui.pending[0].reject()
  await flush()
  assert.equal(ui.result.textContent, 'Could not save preferences.')
  ui.broadcast('Saved value')
  assert.equal(ui.preferences.value, 'Draft')
  ui.save()
  ui.pending[1].resolve({ ok: true })
  await flush()
  ui.broadcast('Draft')
  assert.equal(ui.preferences.value, 'Draft')
  ui.clear()
  ui.pending[2].resolve({ ok: true })
  await flush()
  assert.equal(ui.result.textContent, 'Preferences cleared for new chats.')
  ui.broadcast('')
  assert.equal(ui.preferences.value, '')
})
