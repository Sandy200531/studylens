const CACHE_KEY = 'studylens_cache'
const TOKEN_KEY = 'studylens_token'
const MOCK_KEY = 'studylens_mock'
const memoryCache: Record<string, string> = {}
let memoryTokens: string | null = null
let memoryRefresh: string | null = null
let memoryMock = false

/**
 * chrome.storage is unreachable after the extension is reloaded/updated while
 * the tab (or popup) stays open: every call throws "Extension context
 * invalidated." Check the runtime id and fall back to memory so a stale context
 * degrades gracefully instead of crashing.
 */
function hasChromeStorage(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.storage?.local && Boolean(chrome.runtime?.id)
  } catch {
    return false
  }
}

async function readStorage(key: string): Promise<Record<string, unknown> | null> {
  if (!hasChromeStorage()) return null
  try {
    return (await chrome.storage.local.get(key)) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Returns false when the value could not be persisted (caller keeps it in memory). */
async function writeStorage(items: Record<string, unknown>): Promise<boolean> {
  if (!hasChromeStorage()) return false
  try {
    await chrome.storage.local.set(items)
    return true
  } catch {
    return false
  }
}

async function removeStorage(keys: string[]): Promise<boolean> {
  if (!hasChromeStorage()) return false
  try {
    await chrome.storage.local.remove(keys)
    return true
  } catch {
    return false
  }
}

async function getCacheObj(): Promise<Record<string, string>> {
  const res = await readStorage(CACHE_KEY)
  if (res) return (res[CACHE_KEY] ?? {}) as Record<string, string>
  return { ...memoryCache }
}

async function setCacheObj(cache: Record<string, string>): Promise<void> {
  if (!(await writeStorage({ [CACHE_KEY]: cache }))) {
    Object.assign(memoryCache, cache)
  }
}

export async function getCachedExplanation(key: string): Promise<string | null> {
  const cache = await getCacheObj()
  return cache[key] ?? null
}

export async function setCachedExplanation(key: string, value: string): Promise<void> {
  const cache = await getCacheObj()
  cache[key] = value
  await setCacheObj(cache)
}

export async function getToken(): Promise<string | null> {
  const res = await readStorage(TOKEN_KEY)
  const token = res?.[TOKEN_KEY]
  return typeof token === 'string' ? token : memoryTokens
}

export async function setToken(token: string): Promise<void> {
  if (!(await writeStorage({ [TOKEN_KEY]: token }))) {
    memoryTokens = token
  }
}

const REFRESH_KEY = 'studylens_refresh'

export async function getRefreshToken(): Promise<string | null> {
  const res = await readStorage(REFRESH_KEY)
  const token = res?.[REFRESH_KEY]
  return typeof token === 'string' ? token : memoryRefresh
}

export async function setRefreshToken(token: string): Promise<void> {
  if (!(await writeStorage({ [REFRESH_KEY]: token }))) {
    memoryRefresh = token
  }
}

export async function clearAuth(): Promise<void> {
  await removeStorage([TOKEN_KEY, REFRESH_KEY])
  memoryTokens = null
  memoryRefresh = null
}

export async function clearToken(): Promise<void> {
  await removeStorage([TOKEN_KEY])
  memoryTokens = null
}

export async function getMockMode(): Promise<boolean> {
  const res = await readStorage(MOCK_KEY)
  return res ? res[MOCK_KEY] === true : memoryMock
}

export async function setMockMode(value: boolean): Promise<void> {
  if (!(await writeStorage({ [MOCK_KEY]: value }))) {
    memoryMock = value
  }
}

const WIDGET_PREFS_KEY = 'studylens_widget_prefs'

export interface WidgetPrefs {
  opacity: number
  color: string
  size: number
  enabled: Record<'explain' | 'summarize' | 'quiz' | 'code', boolean>
}

const DEFAULT_WIDGET_PREFS: WidgetPrefs = {
  opacity: 1,
  color: '#6366F1',
  size: 44,
  enabled: { explain: true, summarize: true, quiz: true, code: true },
}

let memoryWidgetPrefs: WidgetPrefs | null = null

export async function getWidgetPrefs(): Promise<WidgetPrefs> {
  const res = await readStorage(WIDGET_PREFS_KEY)
  if (res) {
    const raw = res[WIDGET_PREFS_KEY]
    if (raw && typeof raw === 'object') {
      return { ...DEFAULT_WIDGET_PREFS, ...(raw as Partial<WidgetPrefs>) }
    }
    return { ...DEFAULT_WIDGET_PREFS }
  }
  if (memoryWidgetPrefs) return memoryWidgetPrefs
  return { ...DEFAULT_WIDGET_PREFS }
}

export async function saveWidgetPrefs(prefs: WidgetPrefs): Promise<void> {
  if (!(await writeStorage({ [WIDGET_PREFS_KEY]: prefs }))) {
    memoryWidgetPrefs = prefs
  }
}
