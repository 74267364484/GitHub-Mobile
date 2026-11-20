import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { GHConfig, GitHubUser, HostState, HostTestResult, RateLimit, Repository } from '../types'
import {
  ApiError, fetchRateLimit, getClientToken, gh, loadConfig, loadDemoData, refreshDemo,
  saveHostState, setClientToken, setDemoMode, testHostMappings, validateToken,
} from '../lib/api'
import { defaultHostState, mappingById } from '../lib/hosts'
import { nativeSetTheme } from '../lib/native'
import { navigate } from '../lib/router'

export type Theme = 'light' | 'dark' | 'auto'
export type ToastKind = 'info' | 'success' | 'error'
export type AppSource = 'live' | 'demo' | 'onboarding'

interface ToastState {
  id: number
  message: string
  kind: ToastKind
}

interface AppValue {
  config: GHConfig | null
  user: GitHubUser | null
  repos: Repository[]
  source: AppSource
  loading: boolean
  fatal: string | null
  defaultRepo: string
  host: HostState
  hostResults: Record<string, HostTestResult>
  testingHosts: boolean
  updateHost: (patch: Partial<HostState>) => Promise<void>
  runHostTests: () => Promise<Record<string, HostTestResult>>
  autoSelectHost: () => Promise<void>
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (t: Theme) => void
  toast: ToastState | null
  showToast: (message: string, kind?: ToastKind) => void
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  rateLimit: RateLimit | null
  unreadCount: number
  connectToken: (token: string) => Promise<void>
  clearToken: () => Promise<void>
  enterDemo: () => Promise<void>
  exitDemo: () => Promise<void>
  reload: () => Promise<void>
}

const AppContext = createContext<AppValue | null>(null)

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('octodeck.theme')
    if (t === 'light' || t === 'dark' || t === 'auto') return t
  } catch {}
  return 'light'
}

function useResolvedTheme(theme: Theme): 'light' | 'dark' {
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(m.matches)
    // WebView 83 / Chrome 83 只有 addListener/removeListener。
    if (typeof (m as any).addEventListener === 'function') {
      m.addEventListener('change', onChange)
      return () => m.removeEventListener('change', onChange)
    }
    ;(m as any).addListener(onChange)
    return () => (m as any).removeListener(onChange)
  }, [])
  return theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<GHConfig | null>(null)
  const [user, setUser] = useState<GitHubUser | null>(null)
  const [repos, setRepos] = useState<Repository[]>([])
  const [source, setSource] = useState<AppSource>('onboarding')
  const [loading, setLoading] = useState(true)
  const [fatal, setFatal] = useState<string | null>(null)
  const [defaultRepo, setDefaultRepo] = useState('')
  const [host, setHost] = useState<HostState>(defaultHostState())
  const [hostResults, setHostResults] = useState<Record<string, HostTestResult>>({})
  const [testingHosts, setTestingHosts] = useState(false)
  const [theme, setThemeState] = useState<Theme>(readTheme)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [rateLimit, setRateLimit] = useState<RateLimit | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const toastTimer = useRef<number | null>(null)
  const bootRef = useRef(0)
  const resolvedTheme = useResolvedTheme(theme)

  const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
    setToast({ id: Date.now(), message, kind })
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4200)
  }, [])

  const resetToOnboarding = useCallback(() => {
    setUser(null)
    setRepos([])
    setDefaultRepo('')
    setRateLimit(null)
    setUnreadCount(0)
    setSource('onboarding')
  }, [])

  const bootstrap = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const boot = ++bootRef.current
    setLoading(true)
    setFatal(null)
    setDemoMode(false)
    setSource('onboarding')
    try {
      const cfg = await loadConfig()
      if (boot !== bootRef.current) return { ok: false }
      setConfig(cfg)
      setHost(cfg.host)

      if (!cfg.hasToken) {
        resetToOnboarding()
        setLoading(false)
        return { ok: true }
      }

      try {
        const [u, r] = await Promise.all([
          gh<GitHubUser>('/user'),
          gh<Repository[]>('/user/repos?per_page=100&sort=updated&visibility=all&affiliation=owner,collaborator,organization_member'),
        ])
        if (boot !== bootRef.current) return { ok: false }
        setUser(u)
        setRepos(r)
        setDefaultRepo(
          cfg.defaultRepo && r.some((x) => x.full_name === cfg.defaultRepo)
            ? cfg.defaultRepo
            : (r[0]?.full_name || ''),
        )
        setSource('live')
        setLoading(false)
        fetchRateLimit().then((rl) => { if (rl) setRateLimit(rl) })
        gh<any>('/notifications?all=false&per_page=50')
          .then((list) => setUnreadCount(Array.isArray(list) ? list.filter((n: any) => n.unread).length : 0))
          .catch(() => setUnreadCount(0))
        return { ok: true }
      } catch (e) {
        if (boot !== bootRef.current) return { ok: false }
        const err = e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : String(e), 0)
        const unauthorized = err.status === 401 ||
          (err.status === 403 && /bad credentials|requires authentication/i.test(err.message))
        if (unauthorized) {
          await setClientToken('')
          setConfig({ ...cfg, hasToken: false, tokenSource: 'none' })
          const msg = '登录已失效，请重新粘贴 GitHub Token。'
          resetToOnboarding()
          setFatal(msg)
          setLoading(false)
          return { ok: false, error: msg }
        }
        const msg = `无法连接 GitHub：${err.message}`
        resetToOnboarding()
        setFatal(msg)
        setLoading(false)
        return { ok: false, error: msg }
      }
    } catch (e) {
      if (boot !== bootRef.current) return { ok: false }
      const msg = e instanceof Error ? e.message : String(e)
      resetToOnboarding()
      setFatal(msg)
      setLoading(false)
      return { ok: false, error: msg }
    }
  }, [resetToOnboarding])

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    const onSource = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail === 'live' || detail === 'demo') setSource(detail)
    }
    window.addEventListener('octo-source', onSource)
    return () => window.removeEventListener('octo-source', onSource)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', resolvedTheme)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', resolvedTheme === 'dark' ? '#0d1117' : '#ffffff')
    document.body.classList.toggle('octo-dark', resolvedTheme === 'dark')
    nativeSetTheme(resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => {
    document.body.classList.toggle('drawer-open', drawerOpen)
  }, [drawerOpen])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try { localStorage.setItem('octodeck.theme', t) } catch {}
  }, [])

  const updateHost = useCallback(async (patch: Partial<HostState>) => {
    const next: HostState = { ...host, ...patch, custom: { ...host.custom, ...(patch.custom || {}) } }
    setHost(next)
    try {
      const saved = await saveHostState(next)
      setHost(saved)
    } catch (e) {
      setHost(host)
      showToast(e instanceof Error ? e.message : '保存 Host 映射失败', 'error')
    }
  }, [host, showToast])

  const runHostTests = useCallback(async (): Promise<Record<string, HostTestResult>> => {
    setTestingHosts(true)
    try {
      const res = await testHostMappings()
      const map: Record<string, HostTestResult> = {}
      for (const r of res.results) map[r.id] = { ...r, ms: r.ms ?? r.elapsed }
      setHostResults(map)
      const ok = res.results.filter((r) => r.ok).length
      showToast(`测速完成：${ok}/${res.results.length} 条线路可用${res.proxy ? '（经本机代理）' : ''}`, ok ? 'success' : 'error')
      return map
    } catch (e) {
      showToast(e instanceof Error ? e.message : '测速失败', 'error')
      return {}
    } finally {
      setTestingHosts(false)
    }
  }, [showToast])

  const autoSelectHost = useCallback(async () => {
    const results = await runHostTests()
    const candidates = Object.values(results)
      .filter((r) => r.ok && r.id !== 'official' && r.id !== 'custom' && typeof r.ms === 'number')
      .sort((a, b) => (a.ms || 0) - (b.ms || 0))
    if (!candidates.length) {
      showToast('没有可用的映射线路', 'error')
      return
    }
    const best = candidates[0]
    await updateHost({ enabled: true, mappingId: best.id })
    showToast(`已切换到 ${mappingById(best.id).name}（${best.ms} ms）`, 'success')
  }, [runHostTests, showToast, updateHost])

  const connectToken = useCallback(async (token: string) => {
    const clean = token.trim()
    if (!clean) throw new ApiError('Token 不能为空')
    let login = ''
    try {
      const u = await validateToken(clean)
      login = u.login
    } catch (e) {
      await setClientToken('')
      throw e
    }
    await setClientToken(clean)
    setDemoMode(false)
    const res = await bootstrap()
    if (!res.ok) throw new ApiError(res.error || '登录失败')
    navigate('/')
    showToast(`欢迎回来，${login}`, 'success')
  }, [bootstrap, showToast])

  const clearToken = useCallback(async () => {
    await setClientToken('')
    setDemoMode(false)
    await bootstrap()
    navigate('/')
    showToast('已退出登录', 'success')
  }, [bootstrap, showToast])

  const enterDemo = useCallback(async () => {
    setFatal(null)
    setDemoMode(true)
    try {
      const data = await loadDemoData()
      setUser(data.user)
      setRepos(data.repos)
      setDefaultRepo(data.defaultRepo || data.repos[0]?.full_name || '')
      setSource('demo')
      setConfig((prev) => prev ? { ...prev, hasToken: false, tokenSource: 'none' } : prev)
      setRateLimit(null)
      setUnreadCount(0)
      navigate('/')
      showToast('已进入演示模式', 'info')
    } catch (e) {
      setDemoMode(false)
      resetToOnboarding()
      setFatal(e instanceof Error ? e.message : '演示数据加载失败')
    }
  }, [resetToOnboarding, showToast])

  const exitDemo = useCallback(async () => {
    setDemoMode(false)
    resetToOnboarding()
    await bootstrap()
    navigate('/')
    showToast('已退出演示模式', 'success')
  }, [bootstrap, resetToOnboarding, showToast])

  const reload = useCallback(async () => {
    if (source === 'demo') {
      try {
        const data = await refreshDemo()
        setUser(data.user)
        setRepos(data.repos)
        setDefaultRepo(data.defaultRepo || data.repos[0]?.full_name || '')
        showToast('演示数据已刷新', 'success')
      } catch (e) {
        showToast(e instanceof Error ? e.message : '刷新失败', 'error')
      }
      return
    }
    const res = await bootstrap()
    showToast(res.ok ? '数据已刷新' : (res.error || '刷新失败'), res.ok ? 'success' : 'error')
  }, [bootstrap, showToast, source])

  useEffect(() => {
    if (!toast) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setToast(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toast])

  const value = useMemo<AppValue>(() => ({
    config, user, repos, source, loading, fatal, defaultRepo,
    host, hostResults, testingHosts, updateHost, runHostTests, autoSelectHost,
    theme, resolvedTheme, setTheme, toast, showToast, drawerOpen, setDrawerOpen,
    rateLimit, unreadCount, connectToken, clearToken, enterDemo, exitDemo, reload,
  }), [
    config, user, repos, source, loading, fatal, defaultRepo,
    host, hostResults, testingHosts, updateHost, runHostTests, autoSelectHost,
    theme, resolvedTheme, setTheme, toast, showToast, drawerOpen,
    rateLimit, unreadCount, connectToken, clearToken, enterDemo, exitDemo, reload,
  ])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppValue {
  const v = useContext(AppContext)
  if (!v) throw new Error('useApp must be used within AppProvider')
  return v
}

export function useCurrentUser(): GitHubUser | null {
  return useApp().user
}

export function useIsAuthed(): boolean {
  const { config } = useApp()
  return Boolean(config?.hasToken || getClientToken())
}
