import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Conversation, type Capture } from '../src/main/conversation'
import type { HarnessRequest, HarnessSession } from '../src/main/harness'
import type { OverlayState } from '../src/shared/types'

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
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
    developerInstructions: '',
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
  assert.match(session.calls[0].request.prompt, /Topmost app window on the captured display/)
  assert.match(session.calls[0].request.prompt, /"name":"ChatGPT","bundleId":"test.chatgpt"/)
  session.calls[0].answer.resolve('First answer')
  await first

  current.userRectangle = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
  const second = conversation.send('Second question')
  await Promise.resolve()
  assert.match(session.calls[1].request.prompt, /App window at the selection's center/)
  assert.match(session.calls[1].request.prompt, /"name":"Chrome","bundleId":"test.chrome"/)
  assert.doesNotMatch(session.calls[1].request.prompt, /test.chatgpt/)
  session.calls[1].answer.resolve('Second answer')
  await second

  const third = conversation.send('Third question')
  await Promise.resolve()
  assert.doesNotMatch(session.calls[2].request.prompt, /OS metadata/)
  assert.match(session.calls[2].request.prompt, /User request: Third question/)
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
