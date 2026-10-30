export const EXTENSION_PORT = 'studylens-extension'

export type ContractMessage =
  | { type: 'HEALTH_CHECK' }
  | { type: 'EXPLAIN'; payload: { text: string; mode: 'explain' | 'summarize' | 'quiz' | 'code' | 'chat'; context?: string; mcqs?: { question: string; options: string[] }[]; optionFormat?: 'ordered' | 'unordered'; optionLabels?: string[] } }

export type WorkerStreamEvent =
  | { type: 'chunk'; payload: string }
  | { type: 'done' }
  | { type: 'health'; payload: { backend: 'ok' | 'down' | 'unknown'; ollama: 'ok' | 'down' | 'unknown'; db: 'ok' | 'down' | 'unknown'; detail?: string | null } }
  | { type: 'error'; payload: string }

export type MessageType =
  | 'EXTRACT_PAGE'
  | 'EXPLAIN'
  | 'HEALTH_CHECK'
  | 'GET_CACHE'
  | 'SET_MOCK_MODE'
  | 'EXPLAIN_SELECTION'

export interface ExtensionMessage<T = unknown> {
  type: MessageType
  payload?: T
}

export interface ExtractPayload {
  title: string
  text: string
  codeBlocks: string[]
  mcqs: { question: string; options: string[] }[]
  url: string
}

export function isMessage(x: unknown): x is ExtensionMessage {
  return typeof x === 'object' && x !== null && 'type' in x
}
