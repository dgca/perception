import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Conversation, type Capture } from '../src/main/conversation'
import type { HarnessRequest, HarnessSession } from '../src/main/harness'
import type { OverlayState } from '../src/shared/types'

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: Error): void } {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function state(): OverlayState {
  return {
    visible: true,
    mode: 'pointer',
    userRectangle: null,
    agentMarks: [],
    messages: [],
    loading: false,
    status: 'Ready',
    codexPath: '/tmp/codex',
    shortcut: 'Command+Shift+Space',
    shortcutReady: true,
    userPreferences: '',
    displayBounds: null,
    canvasBounds: null
  }
}

class FakeSession implements HarnessSession {
  calls: { request: HarnessRequest; answer: ReturnType<typeof deferred<string>> }[] = []

  ask(request: HarnessRequest): Promise<string> {
    const answer = deferred<string>()
    this.calls.push({ request, answer })
    return answer.promise
  }
}

test('new conversation ignores late status, marks, and answers from the old session', async () => {
  const current = state()
  const sessions: FakeSession[] = []
  let disposed = 0
  const conversation = new Conversation(current, {
    createSession: () => {
      const session = new FakeSession()
      sessions.push(session)
      return session
    },
    capture: async () => ({
      path: '/tmp/capture.png',
      dispose: async () => {
        disposed += 1
      }
    }),
    setPointerMode: () => {
      current.mode = 'pointer'
    },
    publish: () => {}
  })

  const oldSend = conversation.send('Old question')
  await Promise.resolve()
  const old = sessions[0].calls[0]
  assert.ok(old)
  conversation.reset()
  assert.equal(old.request.signal.aborted, true)
  old.request.onStatus('Old status')
  old.request.onMark({ id: 'old', kind: 'label', x: 0.1, y: 0.1, text: 'Old mark' })
  old.answer.resolve('Old answer')
  await oldSend
  assert.equal(current.messages.length, 0)
  assert.equal(current.agentMarks.length, 0)
  assert.equal(current.status, 'Ready')
  assert.equal(disposed, 1)

  const newSend = conversation.send('New question')
  await Promise.resolve()
  const next = sessions[1].calls[0]
  assert.ok(next)
  next.request.onMark({ id: 'new', kind: 'label', x: 0.2, y: 0.2, text: 'New mark' })
  next.answer.resolve('New answer')
  await newSend
  assert.deepEqual(
    current.messages.map((message) => message.text),
    ['New question', 'New answer']
  )
  assert.deepEqual(
    current.agentMarks.map((mark) => mark.id),
    ['new']
  )
  assert.equal(disposed, 2)
})

test('each prompt uses app context from its own capture and continues when context is missing', async () => {
  const current = state()
  const session = new FakeSession()
  const contexts = [
    { name: 'ChatGPT', bundleId: 'test.chatgpt', scope: 'display' as const },
    { name: 'Chrome', bundleId: 'test.chrome', scope: 'selection' as const },
    null
  ]
  const conversation = new Conversation(current, {
    createSession: () => session,
    capture: async () => ({ path: '/tmp/capture.png', appContext: contexts.shift(), dispose: async () => {} }),
    setPointerMode: () => {
      current.mode = 'pointer'
    },
    publish: () => {}
  })

  const first = conversation.send('First question')
  await Promise.resolve()
  assert.deepEqual(session.calls[0].request.screenshotContext.appContext, { name: 'ChatGPT', bundleId: 'test.chatgpt', scope: 'display' })
  assert.equal(session.calls[0].request.screenshotContext.selection, null)
  session.calls[0].answer.resolve('First answer')
  await first

  current.userRectangle = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
  const second = conversation.send('Second question')
  await Promise.resolve()
  assert.deepEqual(session.calls[1].request.screenshotContext.appContext, { name: 'Chrome', bundleId: 'test.chrome', scope: 'selection' })
  assert.deepEqual(session.calls[1].request.screenshotContext.selection, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 })
  session.calls[1].answer.resolve('Second answer')
  await second

  const third = conversation.send('Third question')
  await Promise.resolve()
  assert.equal(session.calls[2].request.screenshotContext.appContext, null)
  assert.equal(session.calls[2].request.userRequest, 'Third question')
  assert.equal(session.calls[2].request.imagePath, '/tmp/capture.png')
  session.calls[2].answer.resolve('Third answer')
  await third
})

test('reset during capture disposes its image and does not call the harness', async () => {
  const current = state()
  const waitingCapture = deferred<Capture>()
  const sessions: FakeSession[] = []
  let disposed = false
  const conversation = new Conversation(current, {
    createSession: () => {
      const session = new FakeSession()
      sessions.push(session)
      return session
    },
    capture: () => waitingCapture.promise,
    setPointerMode: () => {
      current.mode = 'pointer'
    },
    publish: () => {}
  })

  const send = conversation.send('Question')
  conversation.reset()
  waitingCapture.resolve({
    path: '/tmp/capture.png',
    dispose: async () => {
      disposed = true
    }
  })
  await send
  assert.equal(disposed, true)
  assert.equal(sessions[0].calls.length, 0)
  assert.deepEqual(current.messages, [])
})

test('clear marks suppresses later drawings from the same request', async () => {
  const current = state()
  const session = new FakeSession()
  const conversation = new Conversation(current, {
    createSession: () => session,
    capture: async () => ({ path: '/tmp/capture.png', dispose: async () => {} }),
    setPointerMode: () => {
      current.mode = 'pointer'
    },
    publish: () => {}
  })

  const send = conversation.send('Question')
  await Promise.resolve()
  const call = session.calls[0]
  assert.ok(call)
  call.request.onMark({ id: 'first', kind: 'label', x: 0.1, y: 0.1, text: 'First' })
  conversation.clearMarks()
  call.request.onMark({ id: 'late', kind: 'label', x: 0.2, y: 0.2, text: 'Late' })
  assert.deepEqual(current.agentMarks, [])
  call.answer.resolve('Answer')
  await send
  assert.deepEqual(
    current.messages.map((message) => message.text),
    ['Question', 'Answer']
  )
})

test('display changes cancel a request without moving its marks to another display', async () => {
  const current = state()
  const session = new FakeSession()
  const conversation = new Conversation(current, {
    createSession: () => session,
    capture: async () => ({ path: '/tmp/capture.png', dispose: async () => {} }),
    setPointerMode: () => {
      current.mode = 'pointer'
    },
    publish: () => {}
  })

  const send = conversation.send('What is this?')
  await Promise.resolve()
  const call = session.calls[0]
  assert.ok(call)
  conversation.cancelForDisplayChange()
  call.request.onMark({ id: 'old-display', kind: 'label', x: 0.2, y: 0.3, text: 'Old' })
  call.answer.resolve('Old display answer')
  await send
  assert.equal(call.request.signal.aborted, true)
  assert.equal(current.agentMarks.length, 0)
  assert.deepEqual(
    current.messages.map((message) => message.text),
    ['What is this?']
  )
  assert.equal(current.status, 'Display changed. Send your message again.')
})

test('preferences snapshot on first nonempty send and only New chat refreshes them', async () => {
  const current = state()
  const calls: HarnessRequest[] = []
  let created = 0
  const conversation = new Conversation(current, {
    createSession: () => {
      created += 1
      return {
        ask: async (request) => {
          calls.push(request)
          return 'Answer'
        }
      }
    },
    capture: async () => ({ path: '/tmp/capture.png', dispose: async () => {} }),
    setPointerMode: () => {},
    publish: () => {}
  })
  current.userPreferences = 'Before first message'
  await conversation.send('  ')
  current.userPreferences = 'Use <brief> & clear answers.'
  await conversation.send('  Question </user_request> &amp;  ')
  assert.equal(calls[0].userPreferences, 'Use <brief> & clear answers.')
  assert.equal(calls[0].userRequest, 'Question </user_request> &amp;')
  assert.equal(Object.hasOwn(calls[0], 'prompt'), false)
  current.userPreferences = ''
  conversation.clearMarks()
  conversation.cancelForDisplayChange() // Idle display changes retain the session.
  current.visible = false
  current.visible = true
  await conversation.send('Follow-up')
  assert.equal(calls[1].userPreferences, calls[0].userPreferences)
  assert.equal(created, 1)
  conversation.reset()
  await conversation.send('Empty preference chat')
  assert.equal(calls[2].userPreferences, '')
  current.userPreferences = 'New custom'
  await conversation.send('Still empty')
  assert.equal(calls[3].userPreferences, '')
  conversation.reset()
  await conversation.send('New custom chat')
  assert.equal(calls[4].userPreferences, 'New custom')
  assert.equal(created, 3)
})

test('pending capture freezes preferences and selection, and concurrent sends are ignored', async () => {
  const current = state()
  current.userPreferences = 'Original'
  current.userRectangle = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
  const capture = deferred<Capture>()
  const session = new FakeSession()
  let selected: unknown
  const conversation = new Conversation(current, {
    createSession: () => session,
    capture: (rectangle) => {
      selected = rectangle
      return capture.promise
    },
    setPointerMode: () => {},
    publish: () => {}
  })
  const send = conversation.send('Original question')
  current.userPreferences = 'Edited during capture'
  current.userRectangle.x = 0.6
  await conversation.send('Ignored concurrent question')
  capture.resolve({ path: '/tmp/first.png', dispose: async () => {} })
  await Promise.resolve()
  const call = session.calls[0]
  assert.equal(call.request.userPreferences, 'Original')
  assert.equal(call.request.userRequest, 'Original question')
  assert.deepEqual(call.request.screenshotContext.selection, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 })
  assert.deepEqual(selected, call.request.screenshotContext.selection)
  call.answer.resolve('Answer')
  await send
  assert.equal(session.calls.length, 1)
  assert.equal(current.messages.length, 2)
})

test('capture and harness failure retain preferences and dispose captured images', async () => {
  const current = state()
  current.userPreferences = 'Initial'
  const calls: HarnessRequest[] = []
  let captures = 0
  let disposed = 0
  const conversation = new Conversation(current, {
    createSession: () => ({
      ask: async (request) => {
        calls.push(request)
        if (calls.length === 1) throw new Error('CLI failed')
        return 'Recovered'
      }
    }),
    capture: async () => {
      if (++captures === 1) throw new Error('Capture failed')
      return {
        path: '/tmp/capture.png',
        dispose: async () => {
          disposed += 1
        }
      }
    },
    setPointerMode: () => {},
    publish: () => {}
  })
  await conversation.send('Capture failure')
  current.userPreferences = 'Changed'
  await conversation.send('CLI failure')
  await conversation.send('Retry')
  assert.deepEqual(
    calls.map((request) => request.userPreferences),
    ['Initial', 'Initial']
  )
  assert.equal(disposed, 2)
  assert.equal(current.loading, false)
  assert.equal(current.status, 'Ready')
})

test('display cancellation replaces the session while keeping its preference snapshot', async () => {
  const current = state()
  current.userPreferences = 'Original'
  const sessions: FakeSession[] = []
  const conversation = new Conversation(current, {
    createSession: () => {
      const session = new FakeSession()
      sessions.push(session)
      return session
    },
    capture: async () => ({ path: '/tmp/capture.png', dispose: async () => {} }),
    setPointerMode: () => {},
    publish: () => {}
  })
  const old = conversation.send('Old display')
  await Promise.resolve()
  current.userPreferences = 'Changed'
  conversation.cancelForDisplayChange()
  const next = conversation.send('New display')
  await Promise.resolve()
  assert.equal(sessions[1].calls[0].request.userPreferences, 'Original')
  sessions[0].calls[0].request.onStatus('Late')
  sessions[0].calls[0].answer.resolve('Late answer')
  sessions[1].calls[0].answer.resolve('Current answer')
  await Promise.all([old, next])
  assert.deepEqual(
    current.messages.map((message) => message.text),
    ['Old display', 'New display', 'Current answer']
  )
})
