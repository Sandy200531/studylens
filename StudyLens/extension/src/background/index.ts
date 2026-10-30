import { getToken, setMockMode } from '../shared/storage'
import { isMessage } from '../shared/messages'
import { EXTENSION_PORT } from '../shared/messages'
import type { ContractMessage, WorkerStreamEvent } from '../shared/messages'
import { checkHealth, streamExplanation } from '../shared/api'
import type { ExplanationRequest } from '../shared/types'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'studylens-explain', title: 'Explain with StudyLens', contexts: ['selection'] })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'studylens-explain' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'EXPLAIN_SELECTION', payload: { selectionText: info.selectionText } })
  }
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== EXTENSION_PORT) return

  const controller = new AbortController()
  let connected = true
  port.onDisconnect.addListener(() => {
    connected = false
    controller.abort()
  })

  port.onMessage.addListener(async (msg: ContractMessage) => {
    if (msg.type === 'HEALTH_CHECK') {
      const health = await checkHealth()
      const event: WorkerStreamEvent = { type: 'health', payload: health }
      if (connected) port.postMessage(event)
      return
    }

    if (msg.type === 'EXPLAIN') {
      try {
        const req: ExplanationRequest = msg.payload
        for await (const chunk of streamExplanation(req, controller.signal)) {
          if (!connected) return
          const event: WorkerStreamEvent = { type: 'chunk', payload: chunk }
          port.postMessage(event)
        }
        if (!connected) return
        const doneEvent: WorkerStreamEvent = { type: 'done' }
        port.postMessage(doneEvent)
      } catch (error) {
        if (controller.signal.aborted) return
        if (!connected) return
        const errorEvent: WorkerStreamEvent = {
          type: 'error',
          payload: error instanceof Error ? error.message : 'Unknown backend error',
        }
        port.postMessage(errorEvent)
      }
    }
  })
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!isMessage(msg)) return false
  if (msg.type === 'HEALTH_CHECK') {
    sendResponse({ ok: true })
    return true
  }
  if (msg.type === 'GET_CACHE') {
    getToken().then((t) => sendResponse({ token: t }))
    return true
  }
  if (msg.type === 'SET_MOCK_MODE') {
    setMockMode(Boolean((msg.payload as { value?: boolean })?.value)).then(() => sendResponse({ ok: true }))
    return true
  }
  return false
})

export {}
