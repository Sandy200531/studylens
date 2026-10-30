import { getToken } from './storage'
import type { ExplanationRequest, HealthStatus } from './types'

const API_BASE = 'http://localhost:8000'

export async function checkHealth(): Promise<HealthStatus> {
  try {
    const res = await fetch(`${API_BASE}/health`, { method: 'GET' })
    if (!res.ok) throw new Error('bad status')
    const data = (await res.json()) as Partial<HealthStatus>
    return {
      backend: data.backend ?? 'ok',
      ollama: data.ollama ?? 'unknown',
      db: data.db ?? 'unknown',
      detail: data.detail ?? null,
    }
  } catch {
    return { backend: 'down', ollama: 'unknown', db: 'unknown', detail: 'Backend unreachable on http://localhost:8000' }
  }
}

export async function* streamExplanation(req: ExplanationRequest, signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
  const token = await getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/v1/explain`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) return
    throw new Error('Backend request failed. Is FastAPI running on http://localhost:8000?')
  }

  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 240)
    } catch {
      // The body may already be consumed or unreadable; keep the generic error.
    }
    throw new Error(`Backend returned ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`)
  }
  if (!res.body) {
    throw new Error(`Backend returned ${res.status} with no stream body`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>
    try {
      chunk = await reader.read()
    } catch (error) {
      if (signal?.aborted) return
      throw error
    }
    const { done, value } = chunk
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    for (const line of parts) {
      if (line.startsWith('data:')) {
        const raw = line.slice(5).trim()
        if (raw === '[DONE]') return
        try {
          yield JSON.parse(raw) as string
        } catch {
          yield raw
        }
      }
    }
  }
}
