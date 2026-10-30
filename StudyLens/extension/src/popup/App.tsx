import { useCallback, useEffect, useState } from 'react'
import AuthForm from './AuthForm'
import { getToken, clearAuth } from '../shared/storage'

const API_BASE = 'http://localhost:8000'

type Tab = 'history' | 'saved' | 'analytics'

interface HistoryItem {
  id: number
  mode: string
  input_text: string
  output_text: string
  created_at: string
}

interface SavedItem {
  id: number
  question: string
  answer: string | null
  source_url: string | null
}

interface Analytics {
  total_explanations: number
  total_saved_questions: number
  total_sessions: number
  explanations_by_mode: Record<string, number>
  distinct_sources: number
}

function downloadMarkdown(filename: string, body: string): void {
  const blob = new Blob([body], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>('history')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [saved, setSaved] = useState<SavedItem[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [q, setQ] = useState('')
  const [modeFilter, setModeFilter] = useState('')

  const fetchJson = useCallback(async (path: string) => {
    const token = await getToken()
    const res = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (res.status === 401) {
      await clearAuth()
      setAuthed(false)
      throw new Error('unauthorized')
    }
    return res.json() as Promise<unknown>
  }, [])

  useEffect(() => {
    getToken().then((t) => setAuthed(Boolean(t)))
  }, [])

  useEffect(() => {
    if (!authed) return
    if (tab === 'history') {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (modeFilter) params.set('mode', modeFilter)
      fetchJson(`/api/v1/history?${params}`).then((d) => setHistory((d as { items: HistoryItem[] }).items)).catch(() => {})
    } else if (tab === 'saved') {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      fetchJson(`/api/v1/questions?${params}`).then((d) => setSaved((d as { items: SavedItem[] }).items)).catch(() => {})
    } else {
      fetchJson('/api/v1/analytics/summary').then((d) => setAnalytics(d as Analytics)).catch(() => {})
    }
  }, [authed, tab, q, modeFilter, fetchJson])

  if (authed === null) return <div className="p-4 text-sm">Loading...</div>
  if (!authed) return <AuthForm onAuthed={() => setAuthed(true)} />

  const maxMode = analytics ? Math.max(1, ...Object.values(analytics.explanations_by_mode)) : 1

  return (
    <div className="p-4 space-y-3 w-[360px]">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Dashboard</h1>
        <button onClick={async () => { await clearAuth(); setAuthed(false) }} className="text-xs text-slate-400 hover:text-white">Logout</button>
      </div>

      <div className="flex gap-1 text-sm">
        {(['history', 'saved', 'analytics'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-2 py-1 rounded ${tab === t ? 'sl-accent-bg' : 'bg-slate-800'}`}>{t}</button>
        ))}
      </div>

      {(tab === 'history' || tab === 'saved') && (
        <div className="flex gap-2">
          <input className="flex-1 rounded bg-slate-800 px-2 py-1 text-sm" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} />
          {tab === 'history' && (
            <select className="rounded bg-slate-800 px-1 text-sm" value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}>
              <option value="">all</option>
              <option value="explain">explain</option>
              <option value="summarize">summarize</option>
              <option value="quiz">quiz</option>
              <option value="code">code</option>
              <option value="chat">chat</option>
            </select>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-2 max-h-[300px] overflow-auto">
          {history.map((h) => (
            <div key={h.id} className="rounded bg-slate-800/60 p-2 text-xs">
              <div className="flex justify-between text-slate-400"><span>{h.mode}</span><span>{h.created_at.slice(0, 10)}</span></div>
              <div className="mt-1">{h.input_text.slice(0, 120)}...</div>
              <button className="mt-1 sl-accent-text" onClick={() => downloadMarkdown(`studylens-${h.id}.md`, `# ${h.mode}\n\n${h.output_text}`)}>Export MD</button>
            </div>
          ))}
          {history.length === 0 && <p className="text-xs text-slate-500">No history yet.</p>}
        </div>
      )}

      {tab === 'saved' && (
        <div className="space-y-2 max-h-[300px] overflow-auto">
          {saved.map((s) => (
            <div key={s.id} className="rounded bg-slate-800/60 p-2 text-xs">
              <div className="font-semibold">{s.question}</div>
              {s.answer && <div className="mt-1 text-slate-400">{s.answer.slice(0, 140)}</div>}
              <button className="mt-1 sl-accent-text" onClick={() => downloadMarkdown(`question-${s.id}.md`, `# ${s.question}\n\n${s.answer ?? ''}`)}>Export MD</button>
            </div>
          ))}
          {saved.length === 0 && <p className="text-xs text-slate-500">No saved questions yet.</p>}
        </div>
      )}

      {tab === 'analytics' && analytics && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded bg-slate-800/60 p-2"><div className="text-xl font-bold">{analytics.total_explanations}</div><div className="text-xs text-slate-400">Explanations</div></div>
            <div className="rounded bg-slate-800/60 p-2"><div className="text-xl font-bold">{analytics.total_saved_questions}</div><div className="text-xs text-slate-400">Saved Qs</div></div>
            <div className="rounded bg-slate-800/60 p-2"><div className="text-xl font-bold">{analytics.total_sessions}</div><div className="text-xs text-slate-400">Sessions</div></div>
            <div className="rounded bg-slate-800/60 p-2"><div className="text-xl font-bold">{analytics.distinct_sources}</div><div className="text-xs text-slate-400">Sources</div></div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">By mode</div>
            {Object.entries(analytics.explanations_by_mode).map(([mode, count]) => (
              <div key={mode} className="flex items-center gap-2 text-xs mb-1">
                <span className="w-16">{mode}</span>
                <div className="flex-1 bg-slate-800 rounded h-2">
                  <div className="sl-accent-bg h-2 rounded" style={{ width: `${(count / maxMode) * 100}%` }} />
                </div>
                <span>{count}</span>
              </div>
            ))}
            {Object.keys(analytics.explanations_by_mode).length === 0 && <p className="text-xs text-slate-500">No data yet.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
