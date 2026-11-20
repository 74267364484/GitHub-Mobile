import { useEffect, useState } from 'react'

export type RepoTab =
  | 'code' | 'issues' | 'pulls' | 'actions' | 'projects' | 'wiki'
  | 'security' | 'insights' | 'settings' | 'discussions' | 'releases'

export type Route =
  | { kind: 'home' }
  | { kind: 'repositories' }
  | { kind: 'global-issues' }
  | { kind: 'global-pulls' }
  | { kind: 'notifications' }
  | { kind: 'explore' }
  | { kind: 'profile'; login?: string }
  | { kind: 'settings' }
  | { kind: 'search'; q: string; type: string }
  | {
      kind: 'repo'
      owner: string
      repo: string
      tab: RepoTab
      number?: number
      branch?: string
      path?: string
      mode?: 'tree' | 'blob'
      runId?: number
    }
  | { kind: 'not-found' }

const RESERVED = new Set([
  'repos', 'issues', 'pulls', 'notifications', 'explore', 'profile',
  'settings', 'search', 'user', 'topics', 'marketplace',
])

function decode(seg: string): string {
  try {
    return decodeURIComponent(seg)
  } catch {
    return seg
  }
}

export function parseHash(hash: string): Route {
  const raw = (hash || '').replace(/^#/, '') || '/'
  const [pathname, qs = ''] = raw.split('?')
  const params = new URLSearchParams(qs)
  const segs = pathname.split('/').filter(Boolean).map(decode)

  if (segs.length === 0) return { kind: 'home' }
  const head = segs[0]

  if (head === 'repos' && segs.length === 1) return { kind: 'repositories' }
  if (head === 'issues' && segs.length === 1) return { kind: 'global-issues' }
  if (head === 'pulls' && segs.length === 1) return { kind: 'global-pulls' }
  if (head === 'notifications') return { kind: 'notifications' }
  if (head === 'explore') return { kind: 'explore' }
  if (head === 'settings') return { kind: 'settings' }
  if (head === 'profile') return { kind: 'profile' }
  if (head === 'user' && segs[1]) return { kind: 'profile', login: segs[1] }
  if (head === 'search') return { kind: 'search', q: params.get('q') || '', type: params.get('type') || 'repositories' }
  if (RESERVED.has(head)) return { kind: 'not-found' }

  if (segs.length >= 2) {
    const owner = segs[0]
    const repo = segs[1]
    const tabRaw = segs[2] || 'code'
    const rest = segs.slice(3)

    if (tabRaw === 'tree' || tabRaw === 'blob') {
      return {
        kind: 'repo',
        owner,
        repo,
        tab: 'code',
        mode: tabRaw,
        branch: rest[0] || undefined,
        path: rest.slice(1).join('/'),
      }
    }

    const tab = (
      ['issues', 'pulls', 'actions', 'projects', 'wiki', 'security', 'insights', 'settings', 'discussions', 'releases'].includes(tabRaw)
        ? tabRaw
        : 'code'
    ) as RepoTab

    if ((tab === 'issues' || tab === 'pulls') && rest[0]) {
      const n = Number(rest[0])
      return { kind: 'repo', owner, repo, tab, number: Number.isFinite(n) ? n : undefined }
    }
    if (tab === 'actions' && rest[0] === 'runs' && rest[1]) {
      return { kind: 'repo', owner, repo, tab, runId: Number(rest[1]) || undefined }
    }
    return { kind: 'repo', owner, repo, tab }
  }

  return { kind: 'not-found' }
}

export function routeKey(route: Route): string {
  switch (route.kind) {
    case 'repo':
      return [route.kind, route.owner, route.repo, route.tab, route.number, route.branch, route.mode, route.path, route.runId].join('|')
    case 'profile':
      return `profile|${route.login || 'me'}`
    case 'search':
      return `search|${route.type}|${route.q}`
    default:
      return route.kind
  }
}

export function repoHref(owner: string, repo: string, suffix = ''): string {
  return `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${suffix}`
}

export function navigate(to: string): void {
  const target = to.startsWith('#') ? to : `#${to.startsWith('/') ? '' : '/'}${to}`
  if (location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    return
  }
  location.hash = target
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function useQuery(): URLSearchParams {
  const [qs, setQs] = useState(() => new URLSearchParams((location.hash.split('?')[1] || '')))
  useEffect(() => {
    const onChange = () => setQs(new URLSearchParams((location.hash.split('?')[1] || '')))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return qs
}

export function isRepoTab(s: string): s is RepoTab {
  return ['code', 'issues', 'pulls', 'actions', 'projects', 'wiki', 'security', 'insights', 'settings', 'discussions', 'releases'].includes(s)
}
