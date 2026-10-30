import { useEffect, useRef, useState } from 'react'
import type { ActiveQuestion, ExplanationRequest, ExtractedContent, HealthStatus, McqItem } from '../shared/types'
import { getWidgetPrefs, saveWidgetPrefs, WidgetPrefs } from '../shared/storage'
import { themeCssVars } from '../shared/theme'

function formatOptionLines(question: ActiveQuestion): string {
  if (question.optionItems.length > 0) {
    return question.optionItems
      .map((item) => (item.label ? `${item.label}) ${item.text}` : `- ${item.text}`))
      .join('\n')
  }
  return question.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')
}

interface Props {
  onExtract: () => Promise<ExtractedContent>
  onExplain: (req: ExplanationRequest) => AsyncGenerator<string, void, unknown>
  onHealth: () => Promise<HealthStatus>
  onSubscribeQuestions: (onChange: (question: ActiveQuestion | null) => void) => () => void
  onCancel: () => void
}

export default function Overlay({ onExtract, onExplain, onHealth, onSubscribeQuestions, onCancel }: Props) {
  const [open, setOpen] = useState(false)
  const [output, setOutput] = useState('')
  const [health, setHealth] = useState<HealthStatus>({ backend: 'unknown', ollama: 'unknown', db: 'unknown' })
  const [loading, setLoading] = useState(false)
  const [paused, setPaused] = useState(false)
  const [mode, setMode] = useState<ExplanationRequest['mode']>('explain')
  const [questions, setQuestions] = useState<ExtractedContent['mcqs']>([])
  const [activeQuestion, setActiveQuestion] = useState<ActiveQuestion | null>(null)
  const [prefs, setPrefs] = useState<WidgetPrefs>({
    opacity: 1,
    color: '#6366F1',
    size: 44,
    enabled: { explain: true, summarize: true, quiz: true, code: true },
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)
  const panelDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)
  const autoRunRef = useRef(false)
  const runRef = useRef<() => void>(() => {})
  const modeRef = useRef<ExplanationRequest['mode']>('explain')
  // Pause/Resume: Stop keeps the backend request alive but suspends rendering;
  // Resume flushes buffered chunks and continues pulling from the stream.
  const pausedRef = useRef(false)
  const resumeWakeRef = useRef<(() => void) | null>(null)
  const pauseBufferRef = useRef<string[]>([])
  // Remembers the last content the model explained so follow-up chat questions
  // stay anchored to it even after the page DOM changed.
  const lastFocusRef = useRef('')
  const chatRef = useRef<HTMLInputElement>(null)
  // Generation counter — incremented on Clear so the next Go bypasses the v3: cache.
  const nonceRef = useRef(0)

  useEffect(() => {
    onHealth().then(setHealth).catch(() => {})
    const id = setInterval(() => onHealth().then(setHealth).catch(() => {}), 10000)
    return () => clearInterval(id)
  }, [onHealth])

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight })
  }, [output])

  useEffect(() => {
    let lastUrl = window.location.href
    const id = setInterval(async () => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href
        setQuestions([])
        if (autoRunRef.current) {
          // URL change (e.g., navigating back) — run() will hit cache for same question
          void runRef.current()
        } else {
          setOutput('')
          const page = await onExtract()
          setQuestions(page.mcqs)
          setActiveQuestion(page.activeQuestion)
        }
      }
    }, 600)
    return () => clearInterval(id)
  }, [onExtract])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    const dispose = onSubscribeQuestions((question) => {
      setActiveQuestion(question)
      if (!question) return
      // The watcher only calls onChange when the signature actually changes.
      // Any call here means the question is different → clear + auto-run.
      if (autoRunRef.current) {
        setOutput('')
        void runRef.current()
      }
    })
    return dispose
  }, [onSubscribeQuestions])

  async function run(): Promise<void> {
    setLoading(true)
    setOutput('')
    pausedRef.current = false
    setPaused(false)
    // Abort any still-in-flight request from a previous run before starting
    // (e.g. a paused stream that was abandoned).
    onCancel()
    const page = await onExtract()
    const active = page.activeQuestion
    setActiveQuestion(active)

    const codeFence = (blocks: string[]): string => blocks.map((c) => '```\n' + c + '\n```').join('\n\n')

    let mcqs: McqItem[] = page.mcqs
    if (active && active.options.length >= 2 && page.mcqs.length <= 1) {
      // Include any code snippet belonging to the question so the model can
      // reason about it (the quiz prompt only reads `mcqs`, not `text`).
      const codeBlock = active.code.length > 0 ? '\n\n' + codeFence(active.code) : ''
      mcqs = [{ question: active.question + codeBlock, options: active.options }]
    }
    setQuestions(mcqs)

    let focusedText: string
    if (mode === 'code' && page.problem && page.problem.statement.trim().length >= 20) {
      // Coding-assessment layout: use the full problem statement. The scanner
      // has already excluded the IDE/editor, so this is the actual question.
      const problem = page.problem
      focusedText = [problem.statement, problem.code.length > 0 ? codeFence(problem.code) : '']
        .filter(Boolean)
        .join('\n\n')
    } else if (mode === 'code') {
      const blocks = active && active.code.length > 0 ? active.code : page.codeBlocks
      if (blocks.length > 0) {
        focusedText = [active?.question, codeFence(blocks)].filter(Boolean).join('\n\n')
      } else {
        focusedText = active ? active.question : page.text
      }
    } else if (active) {
      focusedText = [active.question, formatOptionLines(active)].filter(Boolean).join('\n')
      if (active.code.length > 0) focusedText += '\n\n' + codeFence(active.code)
    } else {
      focusedText = page.text
    }
    const effectiveText = (focusedText || page.text).slice(0, 6000)
    lastFocusRef.current = effectiveText

    if (effectiveText.trim().length === 0) {
      setOutput('Could not extract readable content from this page. Make sure the question is visible, then try again.')
      setLoading(false)
      return
    }

    if (mode === 'quiz' && mcqs.length === 0 && effectiveText.trim().length < 20) {
      setOutput('No question detected yet. Wait for the page to load, or switch to "explain".')
      setLoading(false)
      return
    }

    const optionLabels =
      active && active.optionFormat === 'ordered'
        ? active.optionItems.map((item, i) => item.label ?? String.fromCharCode(65 + i))
        : undefined
    // Sanitize the payload before sending: drop options-only blocks that have no
    // question text, trim blanks, and respect backend limits (text 1–2000,
    // options 2–10). Valid MCQs are unaffected.
    const payloadMcqs: McqItem[] = mcqs
      .map((m) => ({
        question: m.question.trim().slice(0, 2000),
        options: m.options
          .map((o) => o.trim())
          .filter((o) => o.length > 0)
          .slice(0, 10),
      }))
      .filter((m) => m.question.length > 0 && m.options.length >= 2)
    const req: ExplanationRequest = {
      text: effectiveText,
      mode,
      context:
        mode === 'code' && page.problem?.language
          ? `${page.title} — language: ${page.problem.language}`
          : page.title,
      mcqs: payloadMcqs,
      optionFormat: active?.optionFormat,
      optionLabels,
      nonce: nonceRef.current,
    }
    try {
      const iterator = onExplain(req)[Symbol.asyncIterator]()
      let done = false
      while (!done) {
        // While paused we stop pulling from the stream so nothing renders;
        // Resuming the request continues exactly where it left off.
        if (pausedRef.current) {
          await new Promise<void>((resolve) => {
            resumeWakeRef.current = resolve
          })
          resumeWakeRef.current = null
          continue
        }
        const result = await iterator.next()
        if (result.done) {
          done = true
          break
        }
        // A chunk can land right as the user pauses; buffer it so nothing drops.
        if (pausedRef.current) {
          pauseBufferRef.current.push(result.value)
        } else {
          setOutput((prev) => prev + result.value)
        }
      }
      autoRunRef.current = true  // enable for ALL modes
    } catch (e) {
      setOutput('Error: ' + String(e))
    } finally {
      setPaused(false)
      setLoading(false)
    }
  }
  runRef.current = run

  function handlePause(): void {
    pausedRef.current = true
    setPaused(true)
  }

  function handleResume(): void {
    if (pauseBufferRef.current.length > 0) {
      const buffered = pauseBufferRef.current.join('')
      pauseBufferRef.current = []
      setOutput((prev) => prev + buffered)
    }
    pausedRef.current = false
    setPaused(false)
    resumeWakeRef.current?.()
    resumeWakeRef.current = null
  }

  function handleClear(): void {
    setOutput('')
    setLoading(false)
    setPaused(false)
    pausedRef.current = false
    pauseBufferRef.current = []
    nonceRef.current += 1  // new generation → new cache key
    onCancel()  // abort any in-flight request
  }

  async function sendChat(): Promise<void> {
    const raw = chatRef.current?.value.trim() ?? ''
    if (!raw) return
    if (chatRef.current) chatRef.current.value = ''
    const page = await onExtract()
    const text = (lastFocusRef.current || page.text).slice(0, 6000)
    if (text.trim().length === 0) {
      setOutput('Could not extract readable content from this page. Make sure the question is visible, then try again.')
      return
    }
    setLoading(true)
    setPaused(false)
    setOutput((prev) => (prev ? prev + '\n\nQ: ' + raw + '\n\n' : 'Q: ' + raw + '\n\n'))
    const req: ExplanationRequest = { text, mode: 'chat', context: raw, nonce: nonceRef.current }
    try {
      const iterator = onExplain(req)[Symbol.asyncIterator]()
      let done = false
      while (!done) {
        if (pausedRef.current) {
          await new Promise<void>((resolve) => {
            resumeWakeRef.current = resolve
          })
          resumeWakeRef.current = null
          continue
        }
        const result = await iterator.next()
        if (result.done) {
          done = true
          break
        }
        if (pausedRef.current) pauseBufferRef.current.push(result.value)
        else setOutput((prev) => prev + result.value)
      }
    } catch (e) {
      setOutput((prev) => prev + '\nError: ' + String(e))
    } finally {
      setPaused(false)
      setLoading(false)
    }
  }

  // Backend up but Ollama/DB broken is a degraded state: amber, not green.
  const degraded = health.backend === 'ok' && (health.ollama !== 'ok' || health.db !== 'ok')
  const dotColor = health.backend === 'down' ? 'bg-rose-400' : degraded ? 'bg-amber-400' : health.backend === 'ok' ? 'sl-accent-bg' : 'bg-amber-400'
  const healthTitle = health.detail
    ? `Backend: ${health.backend} — ${health.detail}`
    : `Backend: ${health.backend} · Ollama: ${health.ollama} · DB: ${health.db}`
  // The one accent color chosen in Settings; every brand-colored element uses it.
  const themeVars = themeCssVars(prefs.color)

  useEffect(() => {
    getWidgetPrefs().then(setPrefs)
  }, [])

  useEffect(() => {
    saveWidgetPrefs(prefs)
  }, [prefs])

  useEffect(() => {
    const tasks = (['explain', 'summarize', 'quiz', 'code'] as const).filter((t) => prefs.enabled[t])
    const first = tasks[0]
    // 'chat' is a follow-up input, not a task tab, so it is never auto-switched.
    if (first && mode !== 'chat' && !tasks.includes(mode)) {
      setMode(first)
    }
  }, [prefs.enabled, mode])

  function onWidgetPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return
    const el = widgetRef.current
    if (!el) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: el.offsetLeft, origY: el.offsetTop, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onWidgetPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current || !widgetRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (!dragRef.current.moved && Math.hypot(dx, dy) > 4) dragRef.current.moved = true
    if (dragRef.current.moved) {
      widgetRef.current.style.transition = 'none'
      widgetRef.current.style.left = `${dragRef.current.origX + dx}px`
      widgetRef.current.style.top = `${dragRef.current.origY + dy}px`
      widgetRef.current.style.right = 'auto'
      widgetRef.current.style.bottom = 'auto'
    }
  }

  function onWidgetPointerUp() {
    if (!dragRef.current || !widgetRef.current) return
    const moved = dragRef.current.moved
    dragRef.current = null
    if (!moved) {
      setOpen(true)
      return
    }
    const rect = widgetRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const pad = 16
    const edges = [
      { side: 'left', dist: rect.left },
      { side: 'right', dist: vw - rect.right },
      { side: 'top', dist: rect.top },
      { side: 'bottom', dist: vh - rect.bottom },
    ]
    const best = edges.reduce((a, b) => (b.dist < a.dist ? b : a), edges[0]!)
    let left = rect.left
    let top = rect.top
    if (best.side === 'left') left = pad
    else if (best.side === 'right') left = vw - rect.width - pad
    else if (best.side === 'top') top = pad
    else if (best.side === 'bottom') top = vh - rect.height - pad
    left = Math.min(Math.max(0, left), vw - rect.width)
    top = Math.min(Math.max(0, top), vh - rect.height)
    widgetRef.current.style.transition = ''
    widgetRef.current.style.left = `${left}px`
    widgetRef.current.style.top = `${top}px`
    widgetRef.current.style.right = 'auto'
    widgetRef.current.style.bottom = 'auto'
  }

  function onPanelPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    const el = panelRef.current
    if (!el) return
    panelDragRef.current = { startX: e.clientX, startY: e.clientY, origX: el.offsetLeft, origY: el.offsetTop, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPanelPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!panelDragRef.current || !panelRef.current) return
    const dx = e.clientX - panelDragRef.current.startX
    const dy = e.clientY - panelDragRef.current.startY
    if (!panelDragRef.current.moved && Math.hypot(dx, dy) > 4) panelDragRef.current.moved = true
    if (panelDragRef.current.moved) {
      panelRef.current.style.transition = 'none'
      panelRef.current.style.left = `${panelDragRef.current.origX + dx}px`
      panelRef.current.style.top = `${panelDragRef.current.origY + dy}px`
      panelRef.current.style.right = 'auto'
      panelRef.current.style.bottom = 'auto'
    }
  }

  function onPanelPointerUp() {
    if (!panelDragRef.current || !panelRef.current) return
    const moved = panelDragRef.current.moved
    panelDragRef.current = null
    if (!moved) return
    const rect = panelRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const pad = 16
    const edges = [
      { side: 'left', dist: rect.left },
      { side: 'right', dist: vw - rect.right },
      { side: 'top', dist: rect.top },
      { side: 'bottom', dist: vh - rect.bottom },
    ]
    const best = edges.reduce((a, b) => (b.dist < a.dist ? b : a), edges[0]!)
    let left = rect.left
    let top = rect.top
    if (best.side === 'left') left = pad
    else if (best.side === 'right') left = vw - rect.width - pad
    else if (best.side === 'top') top = pad
    else if (best.side === 'bottom') top = vh - rect.height - pad
    left = Math.min(Math.max(0, left), vw - rect.width)
    top = Math.min(Math.max(0, top), vh - rect.height)
    panelRef.current.style.transition = ''
    panelRef.current.style.left = `${left}px`
    panelRef.current.style.top = `${top}px`
    panelRef.current.style.right = 'auto'
    panelRef.current.style.bottom = 'auto'
  }

  function renderSettings() {
    return (
      <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 z-50 w-[240px] rounded-lg border border-slate-700 bg-slate-900/95 p-3 text-slate-100 shadow-xl backdrop-blur">
        <div className="mb-2 text-sm font-semibold">Settings</div>
        <label className="mb-2 block text-xs text-slate-300">
          Opacity: {Math.round(prefs.opacity * 100)}%
          <input
            type="range"
            min="0.2"
            max="1"
            step="0.05"
            value={prefs.opacity}
            onChange={(e) => setPrefs({ ...prefs, opacity: parseFloat(e.target.value) })}
            className="mt-1 w-full"
          />
        </label>
        <label className="mb-2 block text-xs text-slate-300">
          Size: {prefs.size}px
          <input
            type="range"
            min="28"
            max="64"
            step="2"
            value={prefs.size}
            onChange={(e) => setPrefs({ ...prefs, size: parseInt(e.target.value, 10) })}
            className="mt-1 w-full"
          />
        </label>
        <label className="mb-2 block text-xs text-slate-300">
          Theme color — applies to the whole extension
          <input
            type="color"
            value={prefs.color}
            onChange={(e) => setPrefs({ ...prefs, color: e.target.value })}
            className="mt-1 h-8 w-full cursor-pointer rounded border border-slate-700 bg-slate-800"
          />
        </label>
        <div className="text-xs text-slate-300">Tasks</div>
        {(['explain', 'summarize', 'quiz', 'code'] as const).map((t) => (
          <label key={t} className="mt-1 flex items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={prefs.enabled[t]}
              onChange={(e) => setPrefs({ ...prefs, enabled: { ...prefs.enabled, [t]: e.target.checked } })}
            />
            {t}
          </label>
        ))}
      </div>
    )
  }

  const tasks = (['explain', 'summarize', 'quiz', 'code'] as const).filter((t) => prefs.enabled[t])

  return (
    <>
      {!open ? (
        <div
          ref={widgetRef}
          className="fixed bottom-4 right-4 z-[2147483647] transition-[top,left] duration-200"
          style={{ width: prefs.size, height: prefs.size, opacity: prefs.opacity, ...themeVars }}
        >
          <button
            onPointerDown={onWidgetPointerDown}
            onPointerMove={onWidgetPointerMove}
            onPointerUp={onWidgetPointerUp}
            style={{ width: '100%', height: '100%' }}
            className="rounded-full text-white shadow-lg flex items-center justify-center font-bold sl-accent-bg"
            title="StudyLens"
          >
            SL
          </button>
          <button
            aria-label="Settings"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              setSettingsOpen((v) => !v)
            }}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-slate-900/80 text-white text-[10px] shadow flex items-center justify-center"
            title="Settings"
          >
            ⚙
          </button>
          {settingsOpen && renderSettings()}
        </div>
      ) : (
        <div ref={panelRef} className="fixed bottom-4 right-4 z-[2147483647]" style={{ opacity: prefs.opacity }}>
          <div className="w-[380px] max-h-[480px] flex flex-col rounded-xl bg-slate-900/95 text-slate-100 border shadow-2xl backdrop-blur" style={{ ...themeVars, borderColor: 'var(--sl-accent)' }}>
            <div
              className="flex items-center justify-between px-3 py-2 border-b border-slate-700 cursor-move"
              onPointerDown={onPanelPointerDown}
              onPointerMove={onPanelPointerMove}
              onPointerUp={onPanelPointerUp}
            >
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotColor}`} title={healthTitle} />
                <span className="font-semibold">StudyLens</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  aria-label="Settings"
                  onClick={() => setSettingsOpen((v) => !v)}
                  className="text-slate-400 hover:text-white"
                  title="Settings"
                >
                  ⚙
                </button>
                <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">×</button>
              </div>
            </div>

            {settingsOpen ? (
              <div className="flex-1 overflow-auto px-3 py-2 space-y-3 border-b border-slate-800">
                <div className="text-sm font-semibold">Settings</div>
                <label className="block text-xs text-slate-300">
                  Opacity: {Math.round(prefs.opacity * 100)}%
                  <input type="range" min="0.2" max="1" step="0.05" value={prefs.opacity} onChange={(e) => setPrefs({ ...prefs, opacity: parseFloat(e.target.value) })} className="mt-1 w-full" />
                </label>
                <label className="block text-xs text-slate-300">
                  Size: {prefs.size}px
                  <input type="range" min="28" max="64" step="2" value={prefs.size} onChange={(e) => setPrefs({ ...prefs, size: parseInt(e.target.value, 10) })} className="mt-1 w-full" />
                </label>
                <label className="block text-xs text-slate-300">
                  Theme color — applies to the whole extension
                  <input type="color" value={prefs.color} onChange={(e) => setPrefs({ ...prefs, color: e.target.value })} className="mt-1 h-8 w-full cursor-pointer rounded border border-slate-700 bg-slate-800" />
                </label>
                <div className="text-xs text-slate-300">Tasks</div>
                {(['explain', 'summarize', 'quiz', 'code'] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2 text-xs text-slate-200">
                    <input type="checkbox" checked={prefs.enabled[t]} onChange={(e) => setPrefs({ ...prefs, enabled: { ...prefs.enabled, [t]: e.target.checked } })} />
                    {t}
                  </label>
                ))}
              </div>
            ) : (
              <>
                <div className="flex gap-2 px-3 py-2 border-b border-slate-800">
                  {tasks.length === 0 ? (
                    <span className="text-xs text-slate-400">No tasks enabled in settings.</span>
                  ) : (
                    tasks.map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`px-2 py-1 rounded text-xs ${mode === m ? 'sl-accent-bg' : 'bg-slate-800 hover:bg-slate-700'}`}
                      >
                        {m}
                      </button>
                    ))
                  )}
                  <button
                    onClick={run}
                    disabled={loading}
                    className="ml-auto px-3 py-1 rounded text-xs text-white disabled:opacity-50 sl-accent-bg"
                  >
                    {loading ? (paused ? 'Paused' : '...') : 'Go'}
                  </button>
                  {loading && !paused && (
                    <button
                      onClick={handlePause}
                      className="px-3 py-1 rounded text-xs text-white sl-accent-bg"
                      title="Stop the current answer (can resume)"
                    >
                      Stop
                    </button>
                  )}
                  {loading && paused && (
                    <button
                      onClick={handleResume}
                      className="px-3 py-1 rounded text-xs text-white sl-accent-bg"
                      title="Resume the current answer"
                    >
                      Resume
                    </button>
                  )}
                  {output && !loading && (
                    <button
                      onClick={handleClear}
                      className="px-3 py-1 rounded text-xs text-white bg-slate-700 hover:bg-slate-600"
                      title="Clear the current answer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {mode === 'quiz' && questions.length > 0 && (
                  <div className="px-3 py-2 border-b border-slate-800 text-xs space-y-2 max-h-48 overflow-auto">
                    {questions.map((q, i) => (
                      <div key={i}>
                        <div className="font-semibold text-slate-200">
                          {i + 1}. {q.question.replace(/^\s*\d+[\.\)]\s*/, '')}
                        </div>
                        <ul className="ml-4 list-disc text-slate-400">
                          {q.options.map((o, j) => (
                            <li key={j}>
                              {activeQuestion?.optionFormat === 'unordered'
                                ? o
                                : `${activeQuestion?.optionItems[j]?.label ?? String.fromCharCode(65 + j)}) ${o}`}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {mode === 'quiz' && questions.length === 0 && activeQuestion && (
                  <div className="px-3 py-2 border-b border-slate-800 text-xs space-y-1 max-h-48 overflow-auto">
                    <div className="font-semibold text-slate-200">
                      {activeQuestion.number !== null ? `${activeQuestion.number}. ` : ''}
                      {activeQuestion.question}
                    </div>
                    {activeQuestion.code.length > 0 && (
                      <pre className="whitespace-pre-wrap rounded bg-slate-950/70 p-2 font-mono text-[10px] text-emerald-300">
                        {activeQuestion.code.join('\n\n')}
                      </pre>
                    )}
                    {activeQuestion.options.length === 0 && activeQuestion.code.length === 0 && (
                      <div className="text-[10px] text-slate-500">No options detected — answering from the page text.</div>
                    )}
                  </div>
                )}

                <div ref={outputRef} className="px-3 py-2 overflow-auto text-sm whitespace-pre-wrap flex-1 overlay-scroll" aria-live="polite">
                  {output || <span className="text-slate-500">Click Go to explain this page.</span>}
                </div>

                <div className="flex gap-2 px-3 py-2 border-t border-slate-800">
                  <input
                    ref={chatRef}
                    type="text"
                    placeholder="Ask a follow-up about this content…"
                    disabled={loading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !loading) void sendChat()
                    }}
                    className="flex-1 min-w-0 rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-slate-500"
                  />
                  <button
                    onClick={() => void sendChat()}
                    disabled={loading}
                    className="px-3 py-1 rounded text-xs text-white disabled:opacity-50 sl-accent-bg"
                  >
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
