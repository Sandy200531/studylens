import { useState } from 'react'
import { setToken, setRefreshToken } from '../shared/storage'

const API_BASE = 'http://localhost:8000'

type Mode = 'login' | 'register'

export default function AuthForm({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')

  async function submit(): Promise<void> {
    setStatus('')
    const path = mode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register'
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (mode === 'register') {
      setStatus(res.ok ? 'Registered! Now log in.' : 'Registration failed')
      if (res.ok) setMode('login')
      return
    }
    if (!res.ok) {
      setStatus('Invalid credentials')
      return
    }
    const tokens = (await res.json()) as { access_token: string; refresh_token: string }
    await setToken(tokens.access_token)
    await setRefreshToken(tokens.refresh_token)
    onAuthed()
  }

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-lg font-bold">StudyLens</h1>
      <div className="flex gap-2 text-sm">
        <button onClick={() => setMode('login')} className={`px-2 py-1 rounded ${mode === 'login' ? 'sl-accent-bg' : 'bg-slate-800'}`}>Login</button>
        <button onClick={() => setMode('register')} className={`px-2 py-1 rounded ${mode === 'register' ? 'sl-accent-bg' : 'bg-slate-800'}`}>Register</button>
      </div>
      <input className="w-full rounded bg-slate-800 px-2 py-1.5 text-sm" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="w-full rounded bg-slate-800 px-2 py-1.5 text-sm" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button onClick={submit} className="sl-accent-bg rounded px-3 py-1.5 text-sm">{mode === 'login' ? 'Login' : 'Register'}</button>
      {status && <p className="text-xs text-slate-400">{status}</p>}
    </div>
  )
}
