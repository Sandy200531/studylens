export interface HealthStatus {
  backend: 'ok' | 'down' | 'unknown'
  ollama: 'ok' | 'down' | 'unknown'
  db: 'ok' | 'down' | 'unknown'
  /** Human-readable reason from GET /health when something is not ok
   *  (e.g. "Ollama is running but the configured model 'x' is not pulled"). */
  detail?: string | null
}

export type OptionFormat = 'ordered' | 'unordered'

export interface OptionItem {
  label: string | null
  text: string
}

export interface ActiveQuestion {
  number: number | null
  question: string
  options: string[]
  optionFormat: OptionFormat
  optionItems: OptionItem[]
  code: string[]
}

export interface ProblemSection {
  title: string | null
  /** Full statement text with line breaks preserved. */
  statement: string
  /** Code snippets that belong to the problem (never the IDE editor). */
  code: string[]
  /** Language selected on the page, when one can be detected. */
  language: string | null
}

export interface ExtractedContent {
  title: string
  text: string
  codeBlocks: string[]
  mcqs: McqItem[]
  activeQuestion: ActiveQuestion | null
  problem: ProblemSection | null
  url: string
}

export interface McqItem {
  question: string
  options: string[]
}

export interface ExplanationRequest {
  text: string
  mode: 'explain' | 'summarize' | 'quiz' | 'code' | 'chat'
  context?: string
  mcqs?: McqItem[]
  optionFormat?: OptionFormat
  optionLabels?: string[]
  /** Generation counter. Incremented when user clicks Clear so that
   *  a fresh request gets a different cache key, bypassing the v3: cache. */
  nonce?: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
