import type { ActiveQuestion, OptionFormat, OptionItem, ProblemSection } from '../shared/types'

function isElementVisible(el: Element): boolean {
  const he = el as HTMLElement
  const style = window.getComputedStyle(he)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  const rect = he.getBoundingClientRect()
  return rect.width >= 20 && rect.height >= 10
}

function isInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  const vh = window.innerHeight || document.documentElement.clientHeight
  const vw = window.innerWidth || document.documentElement.clientWidth
  return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw
}

function findMainRegion(): Element {
  const preferred = ['main', '[role="main"]', 'article', '#root']
  for (const selector of preferred) {
    const el = document.querySelector(selector)
    if (el && isElementVisible(el) && (el.textContent ?? '').trim().length > 200) return el
  }
  return document.body
}

export function extractPageText(): string {
  const root = findMainRegion()
  return (root.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 5000)
}

function looksLikeCode(text: string): boolean {
  const t = text.trim()
  if (t.length < 2 || t.length > 6000) return false
  const signals = [
    /\n/,
    /[{};]/,
    /=>|->|::|:=|<-/,
    /\b(def|class|import|from|return|function|const|let|var|print|console\.log|printf|cout|cin|public|private|static|void|int|float|string|bool|for|while|if|else|elif|try|catch|except|lambda|echo|SELECT|FROM|WHERE)\b/,
    /[A-Za-z_]\w*\s*\([^)]*\)/,
    /[+\-*/%]=|==|!=|<=|>=/,
  ]
  let score = 0
  for (const re of signals) if (re.test(t)) score++
  return score >= 2
}

const CODE_STRICT_SELECTOR = [
  'pre',
  'textarea',
  '[class*="language-" i]',
  '[class*="highlight" i]',
  '.CodeMirror',
  '.monaco-editor',
  '.cm-editor',
  '[class*="snippet" i]',
  '[data-code]',
].join(',')

const CODE_BROAD_SELECTOR = [
  '[class*="snippet" i]',
  '[class*="editor" i]',
  '[class*="code" i]',
  '[style*="monospace" i]',
  '[style*="Consolas" i]',
  '[style*="Courier" i]',
].join(',')

export function extractCodeBlocks(root: Element = findMainRegion()): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (raw: string, strict: boolean): void => {
    const text = raw
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (text.length < 2 || text.length > 6000) return
    if (!strict && !looksLikeCode(text)) return
    if (!strict && text.split('\n').length < 2 && text.length < 12) return
    const key = text.slice(0, 240)
    if (seen.has(key)) return
    seen.add(key)
    out.push(text)
  }

  for (const el of Array.from(root.querySelectorAll(CODE_STRICT_SELECTOR))) {
    if (!isElementVisible(el)) continue
    push((el as HTMLElement).innerText ?? el.textContent ?? '', true)
  }
  for (const el of Array.from(root.querySelectorAll('code'))) {
    if (el.closest('pre')) continue
    if (!isElementVisible(el)) continue
    push((el as HTMLElement).innerText ?? el.textContent ?? '', true)
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(CODE_BROAD_SELECTOR))) {
    if (!isElementVisible(el)) continue
    if (el.children.length > 40) continue
    if (el.closest('pre, code, textarea')) continue
    // Broad matches must actually render in a monospace font.
    const font = window.getComputedStyle(el).fontFamily.toLowerCase()
    if (!/mono|consolas|courier|menlo|monaco/.test(font)) continue
    push(el.innerText ?? '', false)
  }
  return out.slice(0, 12)
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function getElementText(el: Element): string {
  return normalizeText(el.textContent ?? '')
}

function findOptionLabel(input: HTMLInputElement): string {
  // 1. Wrapping <label>
  const wrapping = input.closest('label')
  if (wrapping) return normalizeText(wrapping.textContent ?? '')
  // 2. <label for="id">
  if (input.id) {
    const forLabel = document.querySelector(`label[for="${input.id}"]`)
    if (forLabel) return normalizeText(forLabel.textContent ?? '')
  }
  // 3. Sibling <label>
  let sib = input.nextElementSibling
  while (sib) {
    if (sib.tagName === 'LABEL') return normalizeText(sib.textContent ?? '')
    sib = sib.nextElementSibling
  }
  // 4. Fallback: parent element text minus nested inputs
  return normalizeText(input.parentElement?.textContent ?? '')
}

function extractMcqsFromInputs(): { question: string; options: string[] }[] {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter(isElementVisible)
  const nameCounts = new Map<string, number>()
  for (const input of inputs) {
    if (input.name) nameCounts.set(input.name, (nameCounts.get(input.name) ?? 0) + 1)
  }

  const groups = new Map<Element | string, { inputs: HTMLInputElement[]; options: string[] }>()
  let fallbackId = 0

  for (const input of inputs) {
    // Group by a shared radio name when one exists; otherwise group by the
    // nearest options container (some UIs give every radio a distinct name).
    const container = input.closest(
      '[role="radiogroup"], [class*="options" i], [class*="choices" i], fieldset, form, ul, ol, div',
    )
    const key: Element | string =
      input.name && (nameCounts.get(input.name) ?? 0) >= 2 ? `name:${input.name}` : (container ?? `fallback-${fallbackId++}`)
    const optionText = findOptionLabel(input)
    if (!optionText) continue
    const group = groups.get(key) ?? { inputs: [], options: [] }
    group.inputs.push(input)
    if (group.options.length < 6 && !group.options.includes(optionText)) group.options.push(optionText)
    groups.set(key, group)
  }

  const mcqs: { question: string; options: string[] }[] = []
  for (const group of groups.values()) {
    if (group.inputs.length < 2 || group.options.length < 2) continue

    // Find the smallest container that wraps ALL inputs of this group.
    let container: Element | null = group.inputs[0]!.closest('section, fieldset, form, li, div')
    while (container && !group.inputs.every((i) => container!.contains(i))) {
      container = container.parentElement
    }
    if (!container) continue

    // Prefer the parent wrapper so the question heading (often a sibling of the
    // options column) is in scope.
    const scope: Element = container.parentElement ?? container
    const candidates = Array.from(scope.querySelectorAll('legend, h1, h2, h3, h4, h5, h6, p, strong, b, span, li, div, label'))
    let question: string | null = null
    for (const el of candidates) {
      if (el.contains(group.inputs[0]!)) continue
      if (group.options.includes(getElementText(el))) continue
      const t = getElementText(el)
      if (!t || t.length < 6 || t.length > 300) continue
      // The question must appear BEFORE the first radio input of this group.
      const position = el.compareDocumentPosition(group.inputs[0]!)
      if (!(position & Node.DOCUMENT_POSITION_FOLLOWING)) continue
      if (t.includes('?') || /^\d+[\.\)]\s/.test(t) || /^(question|q\d+)/i.test(t) || t.endsWith(':')) {
        question = t
        break
      }
    }
    if (!question) {
      // Fallback: walk up from the options container; at each level inspect the
      // previous sibling's subtree for the question heading.
      let node: Element | null = container
      while (node && !question) {
        let sib = node.previousElementSibling
        while (sib && !question) {
          const texts = Array.from(sib.querySelectorAll('legend, h1, h2, h3, h4, h5, h6, p, strong, b, span, li, div, label')).map((el) => getElementText(el))
          const hit = texts.find((t) => t.length >= 6 && t.length <= 300 && (t.includes('?') || /^\d+[\.\)]\s/.test(t) || /^(question|q\d+)/i.test(t) || t.endsWith(':')))
          if (hit) {
            question = hit
            break
          }
          sib = sib.previousElementSibling
        }
        node = node.parentElement
      }
    }

    if (!question) continue
    mcqs.push({ question, options: group.options.slice(0, 6) })
  }
  return mcqs
}

function extractMcqsFromText(): { question: string; options: string[] }[] {
  const text = document.body.innerText
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const mcqs: { question: string; options: string[] }[] = []
  let currentQ: string | null = null
  let currentOpts: string[] = []

  for (const line of lines) {
    const match = line.match(/^([A-Z])[\.\)]\s+(.+)/)
    if (match) {
      if (currentOpts.length < 6) currentOpts.push(match[2] ?? '')
      continue
    }
    if (currentOpts.length >= 2 && currentQ) {
      mcqs.push({ question: currentQ, options: currentOpts })
      currentQ = null
      currentOpts = []
    }
    if (line.endsWith('?') || /^(question|q\d+)/i.test(line) || /^\d+[\.\)]\s+/.test(line)) {
      currentQ = line
      currentOpts = []
    }
  }
  if (currentOpts.length >= 2 && currentQ) mcqs.push({ question: currentQ, options: currentOpts })
  return mcqs
}

export function extractMcqs(): { question: string; options: string[] }[] {
  const fromInputs = extractMcqsFromInputs()
  const fromText = extractMcqsFromText()
  const seen = new Set<string>()
  const out: { question: string; options: string[] }[] = []
  for (const item of [...fromInputs, ...fromText]) {
    const key = normalizeText(item.question).toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= 10) break
  }
  return out
}

const QUESTION_LABEL_RE = /^(?:q(?:uestion)?\.?\s*)?(\d+)\s*[\).:]\s*(.+)$/i
const QUESTION_PROMPT_RE = /^(?:q(?:uestion)?\.?\s*)(\d+)?\s*[\).:]?\s*(.+)$/i
const OPTION_LINE_RE = /^\s*\(?([A-Za-z]|\d{1,2})[\).\]:]\s+(.+)$/

function isLikelyQuestionText(text: string): boolean {
  const t = normalizeText(text)
  if (t.length < 4 || t.length > 600) return false
  return QUESTION_LABEL_RE.test(t) || QUESTION_PROMPT_RE.test(t) || t.endsWith('?') || t.endsWith(':')
}

function splitQuestionText(text: string): { number: number | null; question: string } {
  const t = normalizeText(text)
  const label = t.match(QUESTION_LABEL_RE)
  if (label && label[1] && label[2]) {
    return { number: parseInt(label[1], 10), question: normalizeText(label[2]) }
  }
  const prompt = t.match(QUESTION_PROMPT_RE)
  if (prompt && prompt[2]) {
    return { number: prompt[1] ? parseInt(prompt[1], 10) : null, question: normalizeText(prompt[2]) }
  }
  return { number: null, question: t }
}

interface CollectedOptions {
  format: OptionFormat
  items: OptionItem[]
}

function parseOptionFromText(raw: string): OptionItem | null {
  const text = normalizeText(raw)
  if (!text) return null
  const match = text.match(OPTION_LINE_RE)
  if (match && match[1] && match[2]) {
    const value = normalizeText(match[2])
    if (value.length < 1 || value.length > 400) return null
    return { label: match[1].toUpperCase(), text: value }
  }
  if (text.length > 400) return null
  return { label: null, text }
}

function parseOptionNode(el: Element): OptionItem | null {
  if (el.children.length > 8) return null
  return parseOptionFromText(el.textContent ?? '')
}

function finalizeOptions(items: OptionItem[]): CollectedOptions {
  const labeled = items.filter((i) => i.label !== null)
  const ordered = labeled.length >= 2 && labeled.length >= Math.ceil(items.length / 2)
  const result: OptionItem[] = items.map((item, index) =>
    ordered
      ? { label: item.label ?? String.fromCharCode(65 + index), text: item.text }
      : { label: null, text: item.text },
  )
  return { format: ordered ? 'ordered' : 'unordered', items: result.slice(0, 6) }
}

function collectQuestionOptions(root: Element): CollectedOptions {
  // 1. Real radio inputs (wrapping/explicit labels resolved).
  const radios = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
  if (radios.length >= 2) {
    const items = radios
      .map((input) => parseOptionFromText(findOptionLabel(input)))
      .filter((x): x is OptionItem => x !== null)
    if (items.length >= 2) return finalizeOptions(items)
  }

  // 2. Elements explicitly marked as options/choices.
  const strict = Array.from(
    root.querySelectorAll(
      '[class*="option" i], [class*="choice" i], [role="radio"], [role="option"], [data-option], [class*="answer" i]',
    ),
  )
  if (strict.length >= 2) {
    const items = strict.map(parseOptionNode).filter((x): x is OptionItem => x !== null)
    if (items.length >= 2) return finalizeOptions(items)
  }

  // 3. List items (<ul>/<ol>), ordered or unordered.
  const listItems = Array.from(root.querySelectorAll('ul > li, ol > li'))
    .map(parseOptionNode)
    .filter((x): x is OptionItem => x !== null)
    .filter((x) => x.text.length <= 200)
  if (listItems.length >= 2 && listItems.length <= 8) return finalizeOptions(listItems)

  // 4. Raw visible text lines with explicit markers (ordered).
  const inner = (root as HTMLElement).innerText ?? ''
  const fromLines: OptionItem[] = []
  for (const raw of inner.split('\n')) {
    const match = raw.trim().match(OPTION_LINE_RE)
    if (!match || !match[2]) continue
    fromLines.push({ label: match[1]!.toUpperCase(), text: normalizeText(match[2]) })
    if (fromLines.length >= 6) break
  }
  if (fromLines.length >= 2) return finalizeOptions(fromLines)

  // 5. Fallback: a parent whose direct children are short text blocks (unordered).
  const parents = Array.from(root.querySelectorAll('ul, ol, div, fieldset, section'))
  for (const parent of parents) {
    const children = Array.from(parent.children)
    if (children.length < 2 || children.length > 6) continue
    const items: OptionItem[] = []
    let ok = true
    for (const child of children) {
      const text = normalizeText(child.textContent ?? '')
      if (text.length < 1 || text.length > 300) {
        ok = false
        break
      }
      const parsed = parseOptionFromText(text)
      if (!parsed) {
        ok = false
        break
      }
      items.push(parsed)
    }
    if (ok && items.length >= 2) {
      const result = finalizeOptions(items)
      if (result.format === 'unordered') return result
    }
  }

  return { format: 'unordered', items: [] }
}

function textWithoutCode(el: Element): string {
  let out = ''
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const tag = (node as Element).tagName
    if (tag === 'PRE' || tag === 'CODE' || tag === 'TEXTAREA' || tag === 'SCRIPT' || tag === 'STYLE') return
    ;(node as Element).childNodes.forEach(walk)
  }
  el.childNodes.forEach(walk)
  return normalizeText(out)
}

function findQuestionTextIn(root: Element, options: string[]): string | null {
  const lowerOptions = options.filter((o) => o.length > 3).map((o) => o.toLowerCase())
  const candidates = Array.from(
    root.querySelectorAll('legend, h1, h2, h3, h4, h5, h6, p, strong, b, span, li, div, label'),
  )
  let best: string | null = null
  let bestScore = -1
  for (const el of candidates) {
    if (el.querySelector('input[type="radio"], button')) continue
    if (!isElementVisible(el)) continue
    const text = textWithoutCode(el)
    if (!text || !isLikelyQuestionText(text)) continue
    const lower = text.toLowerCase()
    // Skip any element that also contains the answer options.
    if (lowerOptions.some((o) => lower.includes(o))) continue
    let score = 0
    if (QUESTION_LABEL_RE.test(text)) score += 6
    else if (QUESTION_PROMPT_RE.test(text)) score += 4
    else score += 2
    if (text.includes('?')) score += 2
    if (text.length <= 300) score += 1
    if (score > bestScore) {
      bestScore = score
      best = text
    }
  }
  return best
}

function detectNumberFromGrid(): number | null {
  const selectors = ['[aria-current="true"]', '[aria-selected="true"]', '[class*="active" i]', '[class*="selected" i]']
  for (const selector of selectors) {
    for (const el of Array.from(document.querySelectorAll(selector))) {
      if (!isElementVisible(el)) continue
      const text = normalizeText(el.textContent ?? '')
      if (/^\d{1,3}$/.test(text)) return parseInt(text, 10)
    }
  }
  return null
}

function extractQuestionFromPageText(): ActiveQuestion | null {
  const inner = (findMainRegion() as HTMLElement).innerText ?? ''
  const lines = inner.split('\n').map((l) => l.trim()).filter(Boolean)
  let question: string | null = null
  let number: number | null = null
  let qIndex = -1
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(QUESTION_LABEL_RE)
    if (match && match[2] && match[2].length >= 6) {
      number = parseInt(match[1]!, 10)
      question = match[2]
      qIndex = i
      break
    }
  }
  if (!question) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      if (line.length >= 8 && (line.endsWith('?') || /^question\b/i.test(line))) {
        question = line
        qIndex = i
        break
      }
    }
  }
  if (!question) return null
  const optionItems: OptionItem[] = []
  for (let i = qIndex + 1; i < Math.min(lines.length, qIndex + 14); i++) {
    const match = lines[i]!.match(OPTION_LINE_RE)
    if (match && match[2]) optionItems.push({ label: match[1]!.toUpperCase(), text: normalizeText(match[2]) })
    if (optionItems.length >= 6) break
  }
  const format: OptionFormat = optionItems.length >= 2 ? 'ordered' : 'unordered'
  return {
    number,
    question,
    options: optionItems.map((item) => item.text),
    optionFormat: format,
    optionItems,
    code: extractCodeBlocks(findMainRegion()),
  }
}

export function extractActiveQuestion(): ActiveQuestion | null {
  const regions = Array.from(
    document.querySelectorAll(
      '[class*="question" i], [id*="question" i], [class*="problem" i], [id*="problem" i], fieldset, section, article, main, [role="main"]',
    ),
  ).filter(isElementVisible)
  // On paginated exams inactive questions may still be in the DOM; only look
  // at blocks that are actually on screen when any are.
  const onScreen = regions.filter(isInViewport)
  const pool = onScreen.length > 0 ? onScreen : regions

  let best: { question: ActiveQuestion; weight: number } | null = null
  for (const region of pool) {
    const collected = collectQuestionOptions(region)
    const optionTexts = collected.items.map((item) => item.text)
    const questionText = findQuestionTextIn(region, optionTexts)
    // A block with options but no discoverable question text (e.g. a bulleted
    // constraint list on a coding page) would yield an empty question, which
    // the backend rejects and which is useless for answering anyway.
    if (!questionText) continue
    const parsed = splitQuestionText(questionText)
    if (!parsed.question) continue
    const code = extractCodeBlocks(region)
    const tightness = region.querySelectorAll('*').length
    const weight =
      (collected.items.length >= 2 ? 1000 : 0) +
      (parsed.number !== null ? 100 : 0) +
      (code.length > 0 ? 500 : 0) -
      tightness
    if (!best || weight > best.weight) {
      best = {
        question: {
          number: parsed.number,
          question: parsed.question,
          options: optionTexts,
          optionFormat: collected.format,
          optionItems: collected.items,
          code,
        },
        weight,
      }
    }
  }

  let active = best?.question ?? extractQuestionFromPageText()
  if (!active) return null

  // Some sites (e.g. CodeChef) render the question body and the MCQ options in
  // separate containers, and the tightest question block may not contain the
  // options. If so, find the option list elsewhere on screen and merge it in.
  if (active.options.length < 2) {
    const findOptions = (selector: string): CollectedOptions | null => {
      let found: CollectedOptions | null = null
      for (const el of Array.from(document.querySelectorAll(selector))) {
        if (!isElementVisible(el) || !isInViewport(el)) continue
        const collected = collectQuestionOptions(el)
        if (collected.items.length < 2 || collected.items.length > 8) continue
        if (!found || collected.items.length > found.items.length) found = collected
      }
      return found
    }
    const found =
      findOptions('[role="radiogroup"], [class*="mcq" i], [class*="options" i], [class*="choices" i]') ??
      findOptions('fieldset, form') ??
      findOptions('ul, ol')
    if (found) {
      active = {
        ...active,
        options: found.items.map((item) => item.text),
        optionFormat: found.format,
        optionItems: found.items,
      }
    }
  }

  if (active.number === null) active.number = detectNumberFromGrid()
  return active
}

// --- Coding assessment problem extraction (Phase 11) ---------------------------
// Split-screen coding assessments keep the statement in a left panel and the
// IDE in a right panel. These helpers read only the statement and deliberately
// ignore editor nodes. They are additive: no quiz-mode function is modified.

const EDITOR_SELECTOR = [
  '[class*="monaco" i]',
  '.CodeMirror',
  '.cm-editor',
  '[class*="code-editor" i]',
  '[class*="codeeditor" i]',
  '[class*="ace_editor" i]',
  '[contenteditable="true"]',
  'textarea',
].join(',')

const PROBLEM_CHROME_SELECTOR = [
  'script',
  'style',
  'svg',
  'nav',
  'button',
  'input',
  'select',
  '[class*="toolbar" i]',
  '[class*="timer" i]',
  '[class*="navigation" i]',
  '[class*="sidebar" i]',
  '[class*="breadcrumb" i]',
].join(',')

const PROBLEM_SELECTOR = [
  '[class*="problem" i]',
  '[class*="question" i]',
  '[class*="statement" i]',
  '[class*="description" i]',
  '[class*="prompt" i]',
  '[class*="task" i]',
  '[class*="content" i]',
  '[class*="view" i]',
  '[class*="body" i]',
  '[role="tabpanel"]',
  'article',
  'section',
  'main',
  '[role="main"]',
].join(',')

const PROBLEM_KEYWORD_RE =
  /\b(problem statement|constraints?|requirements?|input|output|difficulty|tags?|write\s+(?:a|an|the)\b|given\b|implement|create\s+(?:a|an|the)\b|build\s+(?:a|an|the)\b|design\s+(?:a|an|the)\b|make\s+(?:a|an|the)\b|function|class|return|query|endpoint|api)\b/i

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE',
  'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'TABLE', 'TD', 'TH', 'TR', 'UL',
])

function isSkippedProblemNode(el: Element): boolean {
  return el.matches(EDITOR_SELECTOR) || el.matches(PROBLEM_CHROME_SELECTOR)
}

function extractTextWithBreaks(root: Element): string {
  let out = ''
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    if (el.tagName === 'BR') {
      out += '\n'
      return
    }
    if (isSkippedProblemNode(el)) return
    const block = BLOCK_TAGS.has(el.tagName)
    if (block && out && !out.endsWith('\n')) out += '\n'
    el.childNodes.forEach(walk)
    if (block && out && !out.endsWith('\n')) out += '\n'
  }
  walk(root)
  return out
}

function normalizeStatement(raw: string, cap: number): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .slice(0, cap)
    .trim()
}

function normalizeStatementCode(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const PROBLEM_CODE_SELECTOR = 'pre, [class*="language-" i], [class*="snippet" i], [class*="highlight" i]'

function extractProblemCode(root: Element): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const el of Array.from(root.querySelectorAll(PROBLEM_CODE_SELECTOR))) {
    if (el.closest(EDITOR_SELECTOR)) continue
    if (!isElementVisible(el)) continue
    const text = normalizeStatementCode((el as HTMLElement).innerText ?? el.textContent ?? '')
    if (text.length < 2 || text.length > 4000) continue
    const key = text.slice(0, 200)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length >= 6) break
  }
  return out
}

function detectProblemLanguage(): string | null {
  const candidates: string[] = []
  const nodes = Array.from(
    document.querySelectorAll('select, [class*="language" i], [aria-label*="language" i], [data-language]'),
  )
  for (const el of nodes) {
    if (!isElementVisible(el)) continue
    if (el instanceof HTMLSelectElement) {
      const option = el.selectedOptions[0]
      if (option) candidates.push(normalizeText(option.textContent ?? ''))
      continue
    }
    const data = el.getAttribute('data-language')
    if (data) candidates.push(normalizeText(data))
    const own = normalizeText(el.childElementCount === 0 ? (el.textContent ?? '') : '')
    if (own) candidates.push(own)
  }
  for (const candidate of candidates) {
    if (candidate.length >= 1 && candidate.length <= 24 && /^[A-Za-z+#. ]+$/.test(candidate)) return candidate
  }
  return null
}

function findProblemTitle(statement: string): string | null {
  const lines = statement.split('\n').filter((l) => l.trim().length > 0)
  for (const line of lines) {
    const label = line.match(QUESTION_LABEL_RE)
    if (label && label[2] && label[2].length >= 4) return normalizeText(label[2])
  }
  // "QUESTION 6" on its own, followed by the real title on the next line.
  if (/^question\s+\d+$/i.test(lines[0] ?? '') && (lines[1] ?? '').length > 0 && (lines[1] ?? '').length <= 120) {
    return normalizeText(lines[1] ?? '')
  }
  const first = statement.split('\n')[0]
  return first && first.length <= 120 ? first : null
}

function problemScore(text: string, el: Element, vw: number, vh: number): number {
  const lower = text.toLowerCase()
  let score = 0
  const keywords = [
    'problem statement', 'example', 'constraints', 'constraint', 'requirements', 'input', 'output', 'difficulty',
    'tags', 'write a', 'write an', 'given ', 'implement', 'return',
  ]
  for (const kw of keywords) if (lower.includes(kw)) score += 25
  // Strong bonus for containers that carry the actual statement/heading lines
  // (not just the header/title block).
  if (/(^|\n)\s*(problem statement|constraints\s*(&|and)?\s*requirements?|requirements?|example)s?\b/i.test(text)) score += 150
  if (/(^|\n)\s*u?ser?\s*question\b/i.test(text)) score += 40
  score += Math.min(text.length, 4000) / 40
  const rect = el.getBoundingClientRect()
  if (rect.left < vw * 0.6 && rect.right <= vw + 4) score += 20
  if (rect.width < vw * 0.75) score += 10
  // Prefer the question that is actually on screen. Exam pages may keep other
  // questions in the DOM (stacked or transformed offscreen); without this, the
  // first panel in document order wins on every question.
  if (isInViewport(el)) score += 40
  else score -= 120
  if (el.querySelector(EDITOR_SELECTOR)) score -= 60
  score -= Math.min(el.querySelectorAll('*').length / 40, 40)
  if (rect.height > vh * 1.5) score -= 20
  return score
}

// If the winning block is a compact header/title element, climb to a parent that
// still contains the statement and does not balloon with unrelated content.
function expandProblemRoot(root: Element): Element {
  let current = root
  for (let i = 0; i < 8; i++) {
    const parent = current.parentElement
    if (!parent || parent === document.body || parent === document.documentElement) break
    const childLen = normalizeStatement(extractTextWithBreaks(current), 12000).length
    const parentText = normalizeStatement(extractTextWithBreaks(parent), 8000)
    if (parentText.length <= childLen + 30) break
    // Never merge MULTIPLE question panels into one: exam pages keep other
    // questions in the DOM, so a parent holding two or more question headings
    // would balloon the statement with the wrong questions.
    const headingCount = (parentText.match(/(^|\n)\s*(?:question\s*\d+|problem statement)\b/gi) ?? []).length
    if (headingCount >= 2) break
    if (!PROBLEM_KEYWORD_RE.test(parentText)) break
    if (parent.querySelector(EDITOR_SELECTOR) && childLen < 200) break
    current = parent
  }
  return current
}

export function extractProblem(): ProblemSection | null {
  const candidates = Array.from(document.querySelectorAll(PROBLEM_SELECTOR)).filter(isElementVisible)
  const vw = window.innerWidth || document.documentElement.clientWidth
  const vh = window.innerHeight || document.documentElement.clientHeight

  let best: { statement: string; score: number; root: Element } | null = null
  for (const el of candidates) {
    if ((el.textContent ?? '').trim().length < 60) continue
    const statement = normalizeStatement(extractTextWithBreaks(el), 8000)
    if (statement.length < 40) continue
    if (!PROBLEM_KEYWORD_RE.test(statement)) continue
    const score = problemScore(statement, el, vw, vh)
    if (!best || score > best.score) best = { statement, score, root: el }
  }
  if (!best) return null

  const root = expandProblemRoot(best.root)
  const statement = normalizeStatement(extractTextWithBreaks(root), 8000)
  return {
    title: findProblemTitle(statement),
    statement,
    code: extractProblemCode(root),
    language: detectProblemLanguage(),
  }
}

export function scanPage() {
  return {
    title: document.title,
    text: extractPageText(),
    codeBlocks: extractCodeBlocks(),
    mcqs: extractMcqs(),
    activeQuestion: extractActiveQuestion(),
    problem: extractProblem(),
    url: location.href,
  }
}
