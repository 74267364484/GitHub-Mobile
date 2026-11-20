import type {
  ContributionCalendar, GHConfig, GitHubUser, HostState, HostTestResult,
  SnapshotData, RateLimit,
} from '../types'
import { b64EncodeUnicode, splitRepo } from './format'
import { HOSTNAMES, defaultHostState, mappingById } from './hosts'
import {
  initNativeBridge, isNative, nativeClearToken, nativeConfig, nativeFetchImage,
  nativeGraphql, nativeOpenExternal, nativeRequest, nativeSetHost, nativeSetToken, nativeTestHosts,
} from './native'

export class ApiError extends Error {
  status: number
  data: any
  constructor(message: string, status = 0, data?: any) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

class SnapshotMiss extends Error {}

const TOKEN_KEY = 'octodeck.token'
let clientToken = ''
try {
  clientToken = localStorage.getItem(TOKEN_KEY) || ''
} catch {}

let config: GHConfig | null = null
let demoMode = false
let demo: SnapshotData | null = null
let demoPromise: Promise<SnapshotData> | null = null
const cache = new Map<string, { at: number; data: any }>()
const CACHE_MS = 45000
let lastSource: 'live' | 'demo' = 'live'
let pendingRequests = 0
const imageCache = new Map<string, string>()

function tokenHeaders(): Record<string, string> {
  return clientToken ? { 'x-gh-token': clientToken } : {}
}

function emitSource(source: 'live' | 'demo'): void {
  if (lastSource === source) return
  lastSource = source
  window.dispatchEvent(new CustomEvent('octo-source', { detail: source }))
}

function emitLoading(): void {
  window.dispatchEvent(new CustomEvent('octo-loading', { detail: pendingRequests }))
}

function beginRequest(): void {
  pendingRequests++
  emitLoading()
}

function endRequest(): void {
  pendingRequests = Math.max(0, pendingRequests - 1)
  emitLoading()
}

export function getClientToken(): string {
  return clientToken
}

export function getConfig(): GHConfig | null {
  return config
}

export function isDemoMode(): boolean {
  return demoMode
}

export function setDemoMode(value: boolean): void {
  demoMode = value
  cache.clear()
  if (!value) demo = null
}

export function isSnapshotOnly(): boolean {
  return demoMode
}

export async function loadConfig(): Promise<GHConfig> {
  initNativeBridge()
  let cfg: GHConfig
  if (isNative()) {
    cfg = nativeConfig() || {
      hasToken: false, login: '', defaultRepo: '', host: defaultHostState(),
      native: true, version: '1.0.0', tokenSource: 'none',
    }
  } else {
    const res = await fetch('/api/config', { headers: tokenHeaders(), cache: 'no-store' })
    if (!res.ok) throw new ApiError('无法连接 OctoDeck 本地服务', res.status)
    cfg = (await res.json()) as GHConfig
    cfg.native = false
  }
  cfg.host = normalizeHost(cfg.host)
  config = cfg
  return cfg
}

function normalizeHost(host?: Partial<HostState> | null): HostState {
  const base = defaultHostState()
  const custom = { ...base.custom, ...(host?.custom || {}) }
  for (const h of HOSTNAMES) if (!(h in custom)) custom[h] = ''
  return {
    enabled: host?.enabled ?? true,
    mappingId: host?.mappingId || base.mappingId,
    custom,
    updatedAt: host?.updatedAt ?? null,
  }
}

export function invalidateCache(): void {
  cache.clear()
}

export async function setClientToken(token: string): Promise<void> {
  clientToken = token.trim()
  if (isNative()) {
    if (clientToken) nativeSetToken(clientToken)
    else nativeClearToken()
  } else {
    try {
      if (clientToken) localStorage.setItem(TOKEN_KEY, clientToken)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {}
  }
  invalidateCache()
}

export async function validateToken(token: string): Promise<GitHubUser> {
  if (isNative()) {
    nativeSetToken(token.trim())
    const data = await nativeRequest<GitHubUser>('GET', '/user')
    return data
  }
  const res = await fetch('/api/gh?path=' + encodeURIComponent('/user'), {
    headers: { 'x-gh-token': token.trim() },
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.message || `GitHub 返回 ${res.status}`, res.status, data)
  return data as GitHubUser
}

export async function gh<T>(path: string, init: { method?: string; body?: any } = {}): Promise<T> {
  const method = init.method || 'GET'
  const cacheKey = `${method} ${path}`
  if (method === 'GET') {
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.data as T
  }

  if (demoMode && method === 'GET') {
    const data = await demoRequest<T>(path)
    emitSource('demo')
    return data
  }

  beginRequest()
  try {
    let data: T
    if (isNative()) {
      const payload = await nativeRequest<{ status: number; headers?: any; data: any; message?: string }>(
        method, path, init.body,
      )
      if (payload && payload.status >= 400) {
        throw new ApiError(payload.data?.message || payload.message || `GitHub 返回 ${payload.status}`, payload.status, payload.data)
      }
      data = payload?.data as T
    } else {
      const res = await fetch('/api/gh?path=' + encodeURIComponent(path), {
        method,
        headers: { ...tokenHeaders(), ...(init.body ? { 'content-type': 'application/json' } : {}) },
        body: init.body ? JSON.stringify(init.body) : undefined,
        cache: 'no-store',
      })
      const text = await res.text()
      let parsed: any = null
      try {
        parsed = text ? JSON.parse(text) : null
      } catch {
        parsed = text
      }
      if (!res.ok) throw new ApiError(parsed?.message || `GitHub 返回 ${res.status}`, res.status, parsed)
      data = parsed as T
    }
    if (method === 'GET') cache.set(cacheKey, { at: Date.now(), data })
    emitSource('live')
    return data
  } finally {
    endRequest()
  }
}

export async function loadDemoData(): Promise<SnapshotData> {
  if (demo) return demo
  if (!demoPromise) {
    demoPromise = fetch('./demo.json', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new ApiError('演示数据缺失', r.status)
        return r.json() as Promise<SnapshotData>
      })
      .then((data) => {
        if (data.avatarDataUrl) {
          data.user = { ...data.user, avatar_url: data.avatarDataUrl }
          for (const repo of [...data.repos, ...data.starred]) {
            if (repo.owner?.login === data.login) repo.owner.avatar_url = data.avatarDataUrl
          }
          for (const key of Object.keys(data.repoData)) {
            if (key.startsWith(data.login + '/')) {
              data.repoData[key].repo.owner.avatar_url = data.avatarDataUrl
            }
          }
        }
        demo = data
        return data
      })
      .catch((e) => {
        demoPromise = null
        throw e
      })
  }
  return demoPromise
}

async function demoRequest<T>(rawPath: string): Promise<T> {
  const snap = await loadDemoData()
  const url = new URL(rawPath, 'https://snap.local')
  const p = decodeURIComponent(url.pathname)
  const params = url.searchParams
  const empty = [] as unknown as T

  if (p === '/user') return { ...snap.user, public_repos: snap.repos.length } as T
  if (p === '/user/repos' || p === '/user/repos/') return snap.repos as T
  if (p === '/user/starred') return snap.starred as T
  if (p === '/notifications') return snap.notifications as T

  if (p === '/issues' || p === '/issues/') {
    const state = params.get('state') || 'open'
    const all: any[] = []
    for (const [full, d] of Object.entries(snap.repoData)) {
      for (const it of d.issues) {
        all.push({ ...it, repository_url: `https://api.github.com/repos/${full}` })
      }
    }
    return all.filter((i) => state === 'all' || i.state === state) as T
  }

  if (p === '/search/repositories') {
    const q = (params.get('q') || '').toLowerCase().trim()
    const pool = dedupe([...snap.repos, ...snap.starred])
    const topics = Array.from(q.matchAll(/topic:([^\s]+)/g)).map((m) => m[1])
    const words = q.split(/\s+/).filter((w) => w && !w.includes(':'))
    const filtered = pool
      .filter((r) => {
        if (topics.length && !topics.some((t) => (r.topics || []).includes(t))) return false
        if (!words.length) return true
        const hay = `${r.full_name} ${r.description || ''} ${(r.topics || []).join(' ')} ${r.language || ''}`.toLowerCase()
        return words.every((w) => hay.includes(w))
      })
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
    return { total_count: filtered.length, incomplete_results: false, items: filtered } as T
  }

  if (p === '/search/users') {
    const q = (params.get('q') || '').toLowerCase()
    const items = q && snap.user.login.toLowerCase().includes(q) ? [snap.user] : []
    return { total_count: items.length, incomplete_results: false, items } as T
  }

  if (p === '/search/issues') {
    const raw = params.get('q') || ''
    const repoQual = raw.match(/repo:([^\s]+)/i)?.[1]?.toLowerCase()
    const type = raw.match(/type:(issue|pr)/i)?.[1]?.toLowerCase()
    const state = raw.match(/state:(open|closed)/i)?.[1]?.toLowerCase()
    const words = raw.split(/\s+/).filter((w) => w && !w.includes(':')).map((w) => w.toLowerCase())
    const all: any[] = []
    for (const [full, d] of Object.entries(snap.repoData)) {
      if (repoQual && full.toLowerCase() !== repoQual) continue
      const source = type === 'pr'
        ? d.pulls.map((p) => ({ ...p, pull_request: p.pull_request || {} }))
        : d.issues.filter((i) => type !== 'issue' || !i.pull_request)
      for (const it of source) {
        if (state && it.state !== state) continue
        const hay = `${it.title || ''} ${it.body || ''} ${it.user?.login || ''}`.toLowerCase()
        if (words.length && !words.every((w) => hay.includes(w))) continue
        all.push({ ...it, repository_url: `https://api.github.com/repos/${full}` })
      }
    }
    return { total_count: all.length, incomplete_results: false, items: all } as T
  }

  const repoMatch = p.match(/^\/repos\/([^/]+)\/([^/]+)(?:\/(.*))?$/)
  if (repoMatch) {
    const owner = repoMatch[1]
    const repo = repoMatch[2]
    const rest = repoMatch[3] || ''
    const full = `${owner}/${repo}`
    const data = snap.repoData[full]
    if (!data) throw new SnapshotMiss(`离线快照中没有 ${full}`)
    if (!rest) return data.repo as T
    if (rest === 'branches') return data.branches as T
    if (rest === 'releases') return data.releases as T
    if (rest === 'languages') return data.languages as T
    if (rest === 'contributors') return data.contributors as T

    if (rest === 'readme') {
      if (!data.readme) throw new SnapshotMiss('该仓库没有 README')
      return {
        name: data.readmeMeta?.name || 'README.md',
        path: data.readmeMeta?.path || 'README.md',
        sha: data.readmeMeta?.sha || '',
        html_url: data.readmeMeta?.html_url || '',
        encoding: 'base64',
        content: b64EncodeUnicode(data.readme),
        size: new TextEncoder().encode(data.readme).length,
      } as T
    }

    if (rest.startsWith('git/trees/')) {
      return { sha: '', truncated: false, tree: data.tree } as T
    }

    if (rest === 'commits') {
      const pathFilter = params.get('path')
      if (pathFilter) {
        if (data.fileCommits?.[pathFilter]) {
          return data.fileCommits[pathFilter].slice(0, Number(params.get('per_page') || 1)) as T
        }
        return data.commits.slice(0, Number(params.get('per_page') || 30)) as T
      }
      return data.commits.slice(0, Number(params.get('per_page') || 30)) as T
    }

    if (rest.startsWith('contents/') || rest === 'contents') {
      const path = rest === 'contents' ? '' : rest.slice('contents/'.length)
      const file = data.files[path]
      if (file) {
        return {
          type: 'file',
          name: path.split('/').pop(),
          path,
          sha: file.sha,
          size: file.size,
          encoding: 'base64',
          content: b64EncodeUnicode(file.content),
        } as T
      }
      const prefix = path ? path.replace(/\/$/, '') + '/' : ''
      const children = data.tree
        .filter((e) => e.path.startsWith(prefix) && !e.path.slice(prefix.length).includes('/') && e.path !== path)
        .map((e) => ({
          type: e.type === 'tree' ? 'dir' : 'file',
          name: e.path.slice(prefix.length),
          path: e.path,
          sha: e.sha,
          size: e.size || 0,
          download_url: e.type === 'blob' ? `https://raw.githubusercontent.com/${full}/${data.repo.default_branch}/${e.path}` : null,
        }))
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
      if (!children.length && path) throw new SnapshotMiss('离线快照中没有该文件')
      return children as T
    }

    if (rest === 'issues') {
      const state = params.get('state') || 'open'
      return data.issues.filter((i) => state === 'all' || i.state === state) as T
    }
    if (rest.startsWith('issues/')) {
      const parts = rest.split('/')
      const n = Number(parts[1])
      if (parts[2] === 'comments') {
        return (data.issueComments?.[String(n)] || empty) as T
      }
      const issue = data.issues.find((i) => i.number === n)
      if (!issue) throw new SnapshotMiss('演示数据中没有该议题')
      return issue as T
    }

    if (rest === 'pulls') {
      const state = params.get('state') || 'open'
      return data.pulls.filter((i) => state === 'all' || i.state === state) as T
    }
    if (rest.startsWith('pulls/')) {
      const parts = rest.split('/')
      const n = Number(parts[1])
      if (parts[2] === 'files') {
        return (data.pullFiles?.[String(n)] || empty) as T
      }
      if (parts[2] === 'commits') {
        return (data.pullCommits?.[String(n)] || empty) as T
      }
      const pr = data.pulls.find((i) => i.number === n)
      if (!pr) throw new SnapshotMiss('演示数据中没有该拉取请求')
      return pr as T
    }

    if (rest === 'actions/workflows') return { total_count: data.workflows.length, workflows: data.workflows } as T
    if (rest === 'actions/runs') return { total_count: data.runs.length, workflow_runs: data.runs } as T
    if (rest.startsWith('actions/workflows/')) {
      return { total_count: data.runs.length, workflow_runs: data.runs } as T
    }

    throw new SnapshotMiss('离线快照中没有该接口')
  }

  const userMatch = p.match(/^\/users\/([^/]+)$/)
  if (userMatch) {
    if (userMatch[1].toLowerCase() === snap.user.login.toLowerCase()) return snap.user as T
    for (const d of Object.values(snap.repoData)) {
      const c = d.contributors.find((x) => x.login === userMatch[1])
      if (c) return c as T
    }
    throw new SnapshotMiss('离线快照中没有该用户')
  }
  const userRepos = p.match(/^\/users\/([^/]+)\/repos$/)
  if (userRepos) {
    return (userRepos[1].toLowerCase() === snap.user.login.toLowerCase() ? snap.repos : []) as T
  }
  const userEvents = p.match(/^\/users\/([^/]+)\/events(?:\/public)?$/)
  if (userEvents) {
    return (userEvents[1].toLowerCase() === snap.user.login.toLowerCase() ? snap.events : []) as T
  }

  throw new SnapshotMiss('离线快照中没有该数据')
}

function dedupe<T extends { full_name: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((i) => (seen.has(i.full_name) ? false : (seen.add(i.full_name), true)))
}

export async function fetchContributions(login?: string): Promise<ContributionCalendar | null> {
  const useViewer = !login
  const query = useViewer
    ? `query { viewer { contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } } } } }`
    : `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } } } } }`
  const body: any = { query }
  if (!useViewer) body.variables = { login }

  if (demoMode) {
    const data = await loadDemoData()
    return data.contributions
  }
  beginRequest()
  try {
    let payload: any
    if (isNative()) {
      payload = await nativeGraphql<any>(body)
    } else {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...tokenHeaders() },
        body: JSON.stringify(body),
      })
      payload = await res.json()
      if (!res.ok) return null
    }
    const target = useViewer ? payload?.data?.viewer : payload?.data?.user
    return target?.contributionsCollection?.contributionCalendar || null
  } catch {
    return null
  } finally {
    endRequest()
  }
}

export async function fetchRateLimit(): Promise<RateLimit | null> {
  try {
    const data = await gh<any>('/rate_limit')
    const core = data?.resources?.core
    if (!core) return null
    return { limit: core.limit, used: core.used, remaining: core.remaining, reset: core.reset }
  } catch {
    return null
  }
}

export async function saveHostState(state: HostState): Promise<HostState> {
  const clean = normalizeHost(state)
  if (isNative()) {
    const raw = nativeSetHost(JSON.stringify(clean))
    try {
      const parsed = JSON.parse(raw || '{}')
      if (parsed.host) return normalizeHost(parsed.host)
    } catch {}
    return clean
  }
  const res = await fetch('/api/host', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(clean),
  })
  const data = await res.json()
  if (!res.ok) throw new ApiError(data.message || '保存 Host 映射失败', res.status)
  return normalizeHost(data.host)
}

export interface HostTestResponse {
  proxy: boolean
  results: HostTestResult[]
}

export async function testHostMappings(): Promise<HostTestResponse> {
  if (isNative()) {
    const data = await nativeTestHosts<{ proxy?: boolean; results?: HostTestResult[] }>()
    return { proxy: Boolean(data?.proxy), results: data?.results || [] }
  }
  const res = await fetch('/api/host/test', { method: 'POST', headers: { 'content-type': 'application/json' } })
  const data = await res.json()
  if (!res.ok) throw new ApiError(data.message || '测速失败', res.status)
  const results = (data.results || []).map((r: HostTestResult) => ({ ...r, ms: r.ms ?? r.elapsed }))
  return { proxy: Boolean(data.proxy), results }
}

export async function loadImage(url: string): Promise<string> {
  if (!url) return ''
  if (url.startsWith('data:')) return url
  if (isNative()) {
    const cached = imageCache.get(url)
    if (cached) return cached
    const data = await nativeFetchImage(url)
    if (data) {
      if (imageCache.size > 100) imageCache.clear()
      imageCache.set(url, data)
    }
    return data
  }
  return `/api/img?url=${encodeURIComponent(url)}`
}

export function openExternal(url: string): void {
  if (!url) return
  if (isNative()) {
    nativeOpenExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function repoFromUrl(repositoryUrl?: string): string {
  if (!repositoryUrl) return ''
  const m = repositoryUrl.match(/repos\/([^/]+\/[^/]+)$/)
  return m ? m[1] : ''
}

export function repoOwnerName(full: string): [string, string] {
  return splitRepo(full)
}

export function mappingName(id: string): string {
  return mappingById(id).name
}

export async function refreshDemo(): Promise<SnapshotData> {
  demoPromise = null
  demo = null
  return loadDemoData()
}
