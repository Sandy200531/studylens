import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  // Stable extension ID = chrome-extension://cndlmnklkickkegohhimjbmjmhanolhp
  // This key makes the extension ID identical on every machine (derived from
  // this public key), so e.g. CORS origins and stored URLs don't differ per
  // PC. DO NOT change/regenerate it once anyone relies on the ID.
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAobM1QIx4xfBml0rnDdvkxpRF6qNhCaPtWJnaDhYna1hLjCR5yLvDo5pBV8RutYxO8STdZKVSLB+Z8vGNeABC3w07vuU3XMZnwQlD67QvxnF5nLzv1KC2FmgsYaNxJI/x+Q+3INR+zRxzz9X6Aurj3vmeaFNi2LYW0X4c1En8T4Lqhb7xkolSog5zY11yC3VIqbfcqXP2I6LyxMr/BKkYVIc8DD9s6WgmDZVEQbrRgU8hvcrYdQYukfIx+u1KjLlZAuLdU+Zopxj8SvNret8LkGBHWz7kRZXBAvg4oVYXfH2MwVcpgfZZW6cOOUhnhruB5X6fGKJXYQC7Qj6aZMILtQIDAQAB',
  name: 'StudyLens',
  version: '0.1.0',
  description: 'Local-first AI study companion for the browser.',
  permissions: ['storage', 'activeTab', 'scripting', 'contextMenus'],
  host_permissions: ['http://localhost:8000/*'],
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'StudyLens',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; connect-src 'self' http://localhost:8000",
  },
})
