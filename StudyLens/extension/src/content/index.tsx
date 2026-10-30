import { createRoot } from 'react-dom/client'
import Overlay from './Overlay'
import { scanPage } from './scanner'
import { watchActiveQuestion } from './questionWatcher'
import type { ExplanationRequest, HealthStatus } from '../shared/types'
import { EXTENSION_PORT } from '../shared/messages'
import type { WorkerStreamEvent } from '../shared/messages'
import { getCachedExplanation, setCachedExplanation } from '../shared/storage'

import cssText from '../styles/global.css?inline'

const HOST_ID = 'studylens-overlay-host'
const CONTEXT_INVALIDATED = 'StudyLens was updated or reloaded. Refresh this page to reconnect.'

let activePort: chrome.runtime.Port | null = null
let stopRequested = false

/**
 * After an extension reload/update, content scripts already running in a tab
 * keep their JS alive but lose every chrome.* API. Calling one throws
 * "Extension context invalidated." — detect it so we can show a useful message
 * instead of an uncaught error.
 */
function extensionContextAlive(): boolean {
  try {
    return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id)
  } catch {
    return false
  }
}

function connectToWorker(): chrome.runtime.Port {
  if (!extensionContextAlive()) throw new Error(CONTEXT_INVALIDATED)
  try {
    return chrome.runtime.connect({ name: EXTENSION_PORT })
  } catch {
    throw new Error(CONTEXT_INVALIDATED)
  }
}

/** Read lastError so Chrome stops logging "Unchecked runtime.lastError". */
function ackLastError(): void {
  try {
    void chrome.runtime?.lastError
  } catch {
    // Runtime is gone; there is no lastError left to acknowledge.
  }
}

function cancelExplain(): void {
  stopRequested = true
  try {
    activePort?.disconnect()
  } catch {
    // Extension context may already be invalidated.
  }
  activePort = null
}

async function* explainViaWorker(req: ExplanationRequest): AsyncGenerator<string, void, unknown> {
  stopRequested = false
  const port = connectToWorker()
  activePort = port
  const queue: WorkerStreamEvent[] = []
  let wake: (() => void) | null = null
  let receivedDone = false

  port.onMessage.addListener((event: WorkerStreamEvent) => {
    if (event.type === 'done') receivedDone = true
    if (stopRequested) return
    queue.push(event)
    wake?.()
    wake = null
  })

  // The channel can close when the page enters the back/forward cache, the
  // service worker is stopped, or the extension is reloaded. Acknowledge the
  // error (so Chrome stops logging "Unchecked runtime.lastError") and unblock
  // the await below. Without pushing an event the generator would wait forever.
  port.onDisconnect.addListener(() => {
    ackLastError()
    if (!stopRequested && !receivedDone) {
      queue.push({
        type: 'error',
        payload: extensionContextAlive() ? 'Lost connection to StudyLens. Try again.' : CONTEXT_INVALIDATED,
      })
    }
    wake?.()
    wake = null
  })

  try {
    try {
      port.postMessage({ type: 'EXPLAIN', payload: req })
    } catch {
      throw new Error(extensionContextAlive() ? 'Could not reach the StudyLens background worker.' : CONTEXT_INVALIDATED)
    }

    while (true) {
      if (stopRequested) return
      const event = queue.shift()
      if (event) {
        if (event.type === 'chunk') {
          yield event.payload
        } else if (event.type === 'error') {
          throw new Error(event.payload)
        } else if (event.type === 'done') {
          return
        }
        continue
      }
      await new Promise<void>((resolve) => {
        wake = resolve
      })
    }
  } finally {
    try {
      port.disconnect()
    } catch {
      // Extension context may already be invalidated.
    }
    if (activePort === port) activePort = null
  }
}

async function checkHealthViaWorker(): Promise<HealthStatus> {
  let port: chrome.runtime.Port
  try {
    port = connectToWorker()
  } catch (error) {
    return {
      backend: 'down',
      ollama: 'unknown',
      db: 'unknown',
      detail: error instanceof Error ? error.message : CONTEXT_INVALIDATED,
    }
  }

  return new Promise((resolve) => {
    let settled = false
    let timer: number | null = null

    const finish = (status: HealthStatus): void => {
      if (settled) return
      settled = true
      if (timer !== null) window.clearTimeout(timer)
      try {
        port.disconnect()
      } catch {
        // The extension context may already be gone.
      }
      resolve(status)
    }

    // Never leave the overlay polling forever if the worker never answers.
    timer = window.setTimeout(
      () => finish({ backend: 'down', ollama: 'unknown', db: 'unknown', detail: 'StudyLens background worker did not respond' }),
      8000,
    )

    port.onMessage.addListener((event: WorkerStreamEvent) => {
      if (event.type === 'health') {
        finish(event.payload)
      } else if (event.type === 'error') {
        finish({ backend: 'down', ollama: 'unknown', db: 'unknown', detail: event.payload })
      }
    })

    port.onDisconnect.addListener(() => {
      ackLastError()
      finish({
        backend: 'down',
        ollama: 'unknown',
        db: 'unknown',
        detail: extensionContextAlive() ? 'StudyLens background worker disconnected' : CONTEXT_INVALIDATED,
      })
    })

    try {
      port.postMessage({ type: 'HEALTH_CHECK' })
    } catch {
      finish({
        backend: 'down',
        ollama: 'unknown',
        db: 'unknown',
        detail: extensionContextAlive() ? 'Could not reach the StudyLens background worker' : CONTEXT_INVALIDATED,
      })
    }
  })
}

function hashInput(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}

function mountOverlay(): void {
  if (document.getElementById(HOST_ID)) return
  const host = document.createElement('div')
  host.id = HOST_ID
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = cssText
  shadow.appendChild(style)
  const container = document.createElement('div')
  shadow.appendChild(container)

  createRoot(container).render(
    <Overlay
      onExtract={async () => scanPage()}
      onExplain={async function* (req: ExplanationRequest) {
        // Hash the FULL request so different questions can never collide on a
        // shared prefix (an 80-char slice caused later questions to return the
        // first question's cached answer on exam pages).
        const cacheKey = `v3:${hashInput(
          JSON.stringify({
            mode: req.mode,
            url: window.location.href,
            context: req.context ?? '',
            text: req.text,
            mcqs: req.mcqs ?? [],
            optionFormat: req.optionFormat ?? '',
            nonce: req.nonce ?? 0,
          }),
        )}`
        const cached = await getCachedExplanation(cacheKey)
        if (cached) {
          yield cached
          return
        }
        let full = ''
        try {
          for await (const chunk of explainViaWorker(req)) {
            full += chunk
            yield chunk
          }
          await setCachedExplanation(cacheKey, full)
        } catch (error) {
          yield `Backend error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      }}
      onHealth={async () => checkHealthViaWorker()}
      onSubscribeQuestions={(onChange) => watchActiveQuestion(onChange)}
      onCancel={cancelExplain}
    />,
  )
}

mountOverlay()

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'EXTRACT_PAGE') {
    sendResponse(scanPage())
    return true
  }
  if (msg?.type === 'EXPLAIN_SELECTION') {
    const text = window.getSelection()?.toString().trim()
    if (text) sendResponse({ text })
    return true
  }
  return false
})
