import { extractActiveQuestion } from './scanner'
import type { ActiveQuestion } from '../shared/types'

function signature(question: ActiveQuestion | null): string {
  if (!question) return ''
  // Exclude code so typing in the editor doesn't trigger re-extraction.
  // Only the question number, format, options, and question text matter.
  return `${question.number ?? '?'}|${question.optionFormat}|${question.optionItems
    .map((item) => item.label ?? '-')
    .join(',')}|${question.question}|${question.options.join('|')}`
}

/**
 * Watches single-question paginated assessment pages and reports the currently
 * visible question whenever it changes (Next/Previous/grid navigation, SPA
 * updates). Extraction is passive: it only reads the DOM and never mutates it.
 */
export function watchActiveQuestion(onChange: (question: ActiveQuestion | null) => void): () => void {
  let lastSignature = ''
  let stopped = false
  let timer: number | null = null

  const evaluate = (): void => {
    if (stopped) return
    const question = extractActiveQuestion()
    const nextSignature = signature(question)
    if (!nextSignature) return // transient empty state during a transition
    if (nextSignature === lastSignature) return
    lastSignature = nextSignature
    onChange(question)
  }

  const schedule = (delay = 150): void => {
    if (stopped) return
    if (timer !== null) window.clearTimeout(timer)
    timer = window.setTimeout(evaluate, delay)
  }

  const observer = new MutationObserver(() => schedule(120))
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'aria-current', 'aria-selected', 'hidden'],
  })

  const onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null
    if (!target) return
    const clickable = target.closest('button, a, [role="button"], li, [class*="next" i], [class*="prev" i], [class*="grid" i]')
    if (!clickable) return
    schedule(220)
    window.setTimeout(evaluate, 750)
  }
  document.addEventListener('click', onClick, true)

  // Fallback poll for platforms that only swap CSS classes/highlight state.
  const poll = window.setInterval(evaluate, 1500)

  schedule(0)

  return () => {
    stopped = true
    observer.disconnect()
    document.removeEventListener('click', onClick, true)
    window.clearInterval(poll)
    if (timer !== null) window.clearTimeout(timer)
  }
}
