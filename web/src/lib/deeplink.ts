import { isNative, nativeOpenWebSheet } from './native'

export type DeepLinkAction =
  | { kind: 'route'; href: string; url: string }
  | { kind: 'oauth-callback'; code: string; state: string; error: string; errorDescription: string; raw: string }
  | {
      kind: 'oauth-authorize'
      url: string
      clientId: string
      scopes: string[]
      redirectUri: string
      state: string
    }
  | { kind: 'web'; url: string }
  | { kind: 'external'; url: string }
  | { kind: 'invalid'; message: string; raw: string }

const RESERVED = new Set([
  'login', 'logout', 'join', 'signup', 'settings', 'notifications', 'issues', 'pulls',
  'explore', 'topics', 'trending', 'search', 'marketplace', 'new', 'organizations',
  'orgs', 'users', 'sponsors', 'apps', 'collections', 'events', 'codespaces', 'features',
  'enterprise', 'pricing', 'about', 'site', 'contact', 'security', 'readme', 'home',
])

const REPO_TABS = new Set([
  'issues', 'pulls', 'actions', 'projects', 'wiki', 'security', 'insights',
  'settings', 'discussions', 'releases', 'pulse', 'network', 'community',
  'graphs', 'tags', 'stargazers', 'forks', 'watchers', 'commits', 'commit',
  'tree', 'blob', 'archive', 'labels', 'milestones', 'assignees',
])

function seg(value: string): string {
  return encodeURIComponent(value)
}

function encodePath(value: string): string {
  return value.split('/').filter(Boolean).map(seg).join('/')
}

function route(href: string): DeepLinkAction {
  return { kind: 'route', href, url: href }
}

function mapRepo(owner: string, repo: string, rest: string[], search: string): DeepLinkAction {
  const base = `/${seg(owner)}/${seg(repo)}`
  const [head, ...tail] = rest

  if (!head) return route(base)

  if (head === 'tree' || head === 'blob') {
    const branch = tail[0] || ''
    const path = tail.slice(1).join('/')
    if (!branch) return route(base)
    return route(`${base}/${head}/${seg(branch)}${path ? `/${encodePath(path)}` : ''}`)
  }

  if (head === 'issues' && tail[0] && /^\d+$/.test(tail[0])) return route(`${base}/issues/${tail[0]}`)
  if (head === 'issues') return route(`${base}/issues`)
  if (head === 'pull' && tail[0]) return route(`${base}/pulls/${tail[0]}`)
  if (head === 'pulls' && tail[0] && /^\d+$/.test(tail[0])) return route(`${base}/pulls/${tail[0]}`)
  if (head === 'pulls') return route(`${base}/pulls`)

  if (head === 'actions') {
    if (tail[0] === 'runs' && tail[1]) return route(`${base}/actions/runs/${tail[1]}`)
    return route(`${base}/actions`)
  }

  if (head === 'releases' || head === 'tags') return route(`${base}/releases`)
  if (head === 'security' || head === 'code-scanning' || head === 'dependabot') return route(`${base}/security`)
  if (head === 'insights' || head === 'pulse' || head === 'network' || head === 'graphs' || head === 'community') {
    return route(`${base}/insights`)
  }
  if (head === 'projects') return route(`${base}/projects`)
  if (head === 'wiki') return route(`${base}/wiki`)
  if (head === 'discussions') return route(`${base}/discussions`)
  if (head === 'settings') return route(`${base}/settings`)
  if (head === 'stargazers' || head === 'forks' || head === 'watchers') return route(base)
  if (head === 'commits' || head === 'commit') return route(base)
  if (head === 'labels' || head === 'milestones' || head === 'assignees') return route(`${base}/issues`)
  if (head === 'archive') return route(base)

  if (REPO_TABS.has(head)) return route(`${base}/${head}`)
  return route(`${base}?path=${encodeURIComponent(rest.join('/'))}`)
}

function parseGitHubUrl(raw: string): DeepLinkAction {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { kind: 'invalid', message: '链接格式不正确', raw }
  }
  const host = u.hostname.toLowerCase()

  if (host === 'gist.github.com') {
    const parts = u.pathname.split('/').filter(Boolean)
    const id = parts.length >= 2 ? parts[1] : (parts[0] || '')
    return route(id ? `/gist/${seg(id)}` : '/gists')
  }

  if (host !== 'github.com' && host !== 'www.github.com') {
    return { kind: 'external', url: raw }
  }

  if (u.pathname === '/login/oauth/authorize' || u.pathname === '/login/oauth/authorize/') {
    return {
      kind: 'oauth-authorize',
      url: raw,
      clientId: u.searchParams.get('client_id') || '',
      scopes: (u.searchParams.get('scope') || '').split(/[,\s]+/).filter(Boolean),
      redirectUri: u.searchParams.get('redirect_uri') || '',
      state: u.searchParams.get('state') || '',
    }
  }

  const segs = u.pathname.split('/').filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s)
    } catch {
      return s
    }
  })

  if (segs.length === 0) return route('/')

  const head = segs[0].toLowerCase()

  if (head === 'notifications') return route('/notifications')
  if (head === 'issues' || head === 'pulls') {
    if (segs[1] === 'assigned' || segs[1] === 'created' || segs[1] === 'mentioned' || segs[1] === 'review-requested') {
      return route(`/${head}`)
    }
    return route(`/${head}`)
  }
  if (head === 'explore' || head === 'trending') return route('/explore')
  if (head === 'topics' && segs[1]) {
    return route(`/search?q=${encodeURIComponent(`topic:${segs[1]}`)}&type=repositories`)
  }
  if (head === 'search') {
    const q = u.searchParams.get('q') || ''
    const typeRaw = u.searchParams.get('type') || 'repositories'
    const type = ['repositories', 'users', 'issues'].includes(typeRaw) ? typeRaw : 'repositories'
    return route(`/search?q=${encodeURIComponent(q)}&type=${type}`)
  }
  if (head === 'settings') {
    if (segs[1] === 'tokens') return { kind: 'web', url: raw }
    return route('/settings')
  }
  if (head === 'new') {
    if (segs[1] === 'import') return { kind: 'web', url: raw }
    return route('/repos?new=1')
  }
  if (head === 'marketplace' || head === 'sponsors' || head === 'apps' || head === 'codespaces' || head === 'organizations' || head === 'orgs') {
    return { kind: 'web', url: raw }
  }
  if (head === 'users' && segs[1]) return route(`/user/${seg(segs[1])}`)
  if (head === 'login' || head === 'logout' || head === 'join' || head === 'signup' || head === 'session') {
    return { kind: 'web', url: raw }
  }

  if (segs.length === 1) {
    if (RESERVED.has(head)) return { kind: 'web', url: raw }
    return route(`/user/${seg(segs[0])}`)
  }

  const owner = segs[0]
  const repo = segs[1]
  if (RESERVED.has(owner.toLowerCase())) return { kind: 'web', url: raw }
  return mapRepo(owner, repo, segs.slice(2), u.search)
}

export function parseDeepLink(raw: string): DeepLinkAction {
  const input = (raw || '').trim()
  if (!input) return { kind: 'invalid', message: '空链接', raw }

  if (/^githubmobile:\/\//i.test(input)) {
    const rest = input.replace(/^githubmobile:\/\//i, '')
    const [rawPath, rawQuery = ''] = rest.split('?')
    const params = new URLSearchParams(rawQuery)
    const parts = rawPath.split('/').filter(Boolean)
    const host = (parts[0] || '').toLowerCase()
    const path = parts.slice(1).join('/')

    if (host === 'oauth' && path === 'callback') {
      return {
        kind: 'oauth-callback',
        code: params.get('code') || '',
        state: params.get('state') || '',
        error: params.get('error') || '',
        errorDescription: params.get('error_description') || '',
        raw: input,
      }
    }

    if (host === 'oauth' && path === 'authorize') {
      const target = params.get('url') || ''
      if (target) return parseDeepLink(target)
      return { kind: 'web', url: 'https://github.com/login/oauth/authorize' }
    }

    if (host === 'open') {
      const target = params.get('url') || ''
      return target ? parseDeepLink(target) : { kind: 'invalid', message: '缺少 url 参数', raw: input }
    }

    if (host === 'gh') {
      const target = `https://github.com/${path}${rawQuery ? `?${rawQuery}` : ''}`
      return parseDeepLink(target)
    }

    return { kind: 'invalid', message: '未知的应用链接', raw: input }
  }

  if (/^https?:\/\//i.test(input)) {
    try {
      const u = new URL(input)
      const host = u.hostname.toLowerCase()
      if (host === 'github.com' || host === 'www.github.com' || host === 'gist.github.com') {
        return parseGitHubUrl(input)
      }
      return { kind: 'external', url: input }
    } catch {
      return { kind: 'invalid', message: '链接格式不正确', raw: input }
    }
  }

  return { kind: 'invalid', message: '只支持 GitHub 或 githubmobile:// 链接', raw: input }
}

export function dispatchOpenUrl(url: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('octo-open-url', { detail: url }))
}

/** Open a GitHub web-only page inside the app (native) or in a new tab (browser preview). */
export function openGithubPage(url: string): void {
  if (!url) return
  if (isNative()) {
    nativeOpenWebSheet(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
