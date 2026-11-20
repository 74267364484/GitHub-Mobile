export function formatBytes(bytes?: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function compact(n?: number | null): string {
  if (n == null) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Math.max(0, Date.now() - t)
  const sec = Math.floor(diff / 1000)
  if (sec < 45) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  const mon = Math.floor(day / 30)
  if (mon < 12) return `${mon} 个月前`
  const yr = Math.floor(mon / 12)
  return `${yr} 年前`
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export function formatDuration(startIso?: string | null, endIso?: string | null): string {
  if (!startIso) return '—'
  const start = new Date(startIso).getTime()
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const sec = Math.max(0, Math.round((end - start) / 1000))
  if (sec < 60) return `${sec} 秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return `${m} 分 ${s} 秒`
  const h = Math.floor(m / 60)
  return `${h} 小时 ${m % 60} 分`
}

export function plural(n: number, word: string, pluralWord?: string): string {
  return `${n} ${n === 1 ? word : pluralWord || word + 's'}`
}

export function firstLine(text?: string | null, max = 120): string {
  if (!text) return ''
  const line = text.split('\n').find((l) => l.trim()) || ''
  return line.length > max ? line.slice(0, max - 1) + '…' : line
}

const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Kotlin: '#A97BFF', Python: '#3572A5',
  HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c', Java: '#b07219', Shell: '#89e051',
  'C++': '#f34b7d', C: '#555555', 'C#': '#178600', Go: '#00ADD8', Rust: '#dea584',
  Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138', Dart: '#00B4AB', Vue: '#41b883',
  Svelte: '#ff3e00', MDX: '#fcb32c', Dockerfile: '#384d54', Makefile: '#427819',
  'Jupyter Notebook': '#DA5B0B', Lua: '#000080', Perl: '#0298c3', R: '#198CE7',
  'Objective-C': '#438eff', Haskell: '#5e5086', Elixir: '#6e4a7e', Erlang: '#B83998',
  Clojure: '#db5855', Scala: '#c22d40', Zig: '#ec915c', Nim: '#ffc200', Astro: '#ff5a03',
  PowerShell: '#012456', Batchfile: '#C1F12E', 'Vim Script': '#199f4b', Nix: '#7e7eff',
  Jupyter: '#DA5B0B', JSON: '#292929', YAML: '#cb171e', Markdown: '#083fa1',
}

export function languageColor(name?: string | null): string {
  if (!name) return '#8b949e'
  return LANGUAGE_COLORS[name] || '#8b949e'
}

export function languagePercent(languages: Record<string, number>): { name: string; bytes: number; pct: number; color: string }[] {
  const total = Object.values(languages || {}).reduce((a, b) => a + b, 0)
  if (!total) return []
  return Object.entries(languages)
    .map(([name, bytes]) => ({ name, bytes, pct: (bytes / total) * 100, color: languageColor(name) }))
    .sort((a, b) => b.bytes - a.bytes)
}

export function splitRepo(fullName: string): [string, string] {
  const i = fullName.indexOf('/')
  return i === -1 ? ['', fullName] : [fullName.slice(0, i), fullName.slice(i + 1)]
}

export function b64DecodeUnicode(content: string): string {
  try {
    const binary = atob(content.replace(/\s/g, ''))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return ''
  }
}

export function b64EncodeUnicode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
}

export function relativeLevel(level: string): number {
  switch (level) {
    case 'FIRST_QUARTILE': return 1
    case 'SECOND_QUARTILE': return 2
    case 'THIRD_QUARTILE': return 3
    case 'FOURTH_QUARTILE': return 4
    default: return 0
  }
}
