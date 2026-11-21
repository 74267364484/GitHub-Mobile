import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './state/AppState'
import { Header } from './components/Header'
import { LeftRail } from './components/LeftRail'
import { Octicon } from './components/Octicon'
import { LoadingBar } from './components/LoadingBar'
import { DownloadTray } from './components/DownloadTray'
import { DeepLinkDialog } from './components/DeepLinkDialogs'
import { initNativeDownloadEvents } from './lib/downloads'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthPage, AuthLoading } from './pages/AuthPage'
import { routeKey, useRoute, navigate } from './lib/router'
import { DashboardPage } from './pages/DashboardPage'
import { RepositoriesPage } from './pages/RepositoriesPage'
import { GlobalIssuesPage } from './pages/GlobalIssuesPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { ExplorePage } from './pages/ExplorePage'
import { GistsPage, GistDetailPage } from './pages/GistsPage'
import { ProfilePage } from './pages/ProfilePage'
import { SearchPage } from './pages/SearchPage'
import { AppSettingsPage } from './pages/AppSettingsPage'
import { RepoRoute } from './pages/RepoRoute'
import { NotFoundPage } from './pages/NotFoundPage'
import { openExternal } from './lib/api'
import { openGithubPage, parseDeepLink, type DeepLinkAction } from './lib/deeplink'
import type { Route } from './lib/router'

function Page({ route }: { route: Route }) {
  switch (route.kind) {
    case 'home': return <DashboardPage />
    case 'repositories': return <RepositoriesPage />
    case 'global-issues': return <GlobalIssuesPage mode="issues" />
    case 'global-pulls': return <GlobalIssuesPage mode="pulls" />
    case 'notifications': return <NotificationsPage />
    case 'explore': return <ExplorePage />
    case 'gists': return <GistsPage />
    case 'gist': return <GistDetailPage id={route.id} />
    case 'profile': return <ProfilePage />
    case 'search': return <SearchPage />
    case 'settings': return <AppSettingsPage />
    case 'repo': return <RepoRoute route={route} />
    case 'not-found': return <NotFoundPage />
    default: return <NotFoundPage />
  }
}

function useShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let waitingForG = false
    let timer: number | null = null

    const isTyping = (el: EventTarget | null) => {
      const node = el as HTMLElement | null
      if (!node) return false
      const tag = node.tagName?.toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || node.isContentEditable
    }

    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('.search-input')?.focus()
        return
      }
      if (e.key === 'g') {
        waitingForG = true
        if (timer) window.clearTimeout(timer)
        timer = window.setTimeout(() => { waitingForG = false }, 900)
        return
      }
      if (waitingForG) {
        const map: Record<string, string> = {
          h: '/', i: '/issues', p: '/pulls', n: '/notifications',
          e: '/explore', s: '/settings', r: '/repos',
        }
        const target = map[e.key.toLowerCase()]
        waitingForG = false
        if (timer) window.clearTimeout(timer)
        if (target) {
          e.preventDefault()
          navigate(target)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (timer) window.clearTimeout(timer)
    }
  }, [enabled])
}

function Shell() {
  const { loading, source, fatal, toast, setDrawerOpen, drawerOpen, exitDemo, user, config, showToast } = useApp()
  const route = useRoute()
  const key = routeKey(route)
  const [linkDialog, setLinkDialog] = useState<DeepLinkAction | null>(null)
  useShortcuts(source === 'live' || source === 'demo')

  useEffect(() => {
    initNativeDownloadEvents()
  }, [])

  useEffect(() => {
    const handle = (raw: string) => {
      if (!raw) return
      const action = parseDeepLink(raw)
      switch (action.kind) {
        case 'route':
          navigate(action.href)
          break
        case 'web':
          openGithubPage(action.url)
          break
        case 'external':
          openExternal(action.url)
          break
        case 'invalid':
          showToast(action.message, 'error')
          break
        default:
          setLinkDialog(action)
      }
    }

    const onOpenUrl = (e: Event) => {
      handle(String((e as CustomEvent).detail || ''))
    }

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const anchor = target?.closest?.('a') as HTMLAnchorElement | null
      if (!anchor) return
      const href = anchor.getAttribute('href') || ''
      if (!/^https?:\/\/(?:www\.)?(?:gist\.)?github\.com(?:\/|$)/i.test(href)) return
      e.preventDefault()
      handle(href)
    }

    window.addEventListener('octo-open-url', onOpenUrl as EventListener)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('octo-open-url', onOpenUrl as EventListener)
      document.removeEventListener('click', onClick, true)
    }
  }, [showToast])

  useEffect(() => {
    window.scrollTo({ top: 0 })
    setDrawerOpen(false)
  }, [key, setDrawerOpen])

  if (loading) return <AuthLoading />
  if (source === 'onboarding') return <AuthPage />

  const isRepo = route.kind === 'repo'

  return (
    <div className={`App ${drawerOpen ? 'App-drawer' : ''}`}>
      <Header />
      <div className="AppBody">
        <LeftRail />
        <main className={`Main ${isRepo ? 'Main-repo' : ''}`}>
          <div className={`app-banners ${isRepo ? 'app-banners-repo' : ''}`}>
            {source === 'demo' && (
              <div className="flash demo-banner">
                <span className="demo-banner-icon"><Octicon name="sparkle" size={16} /></span>
                <div className="demo-banner-text">
                  <strong>{config?.hasToken ? '演示模式' : '公开浏览'}</strong>
                  <span>
                    {config?.hasToken
                      ? '正在浏览公开演示数据（sindresorhus/awesome、microsoft/vscode），不是你的 GitHub 账号。'
                      : '未登录也能直接使用：首页展示中性公开数据，搜索与仓库页可浏览 GitHub 公共仓库。登录后可访问私有仓库与个人数据。'}
                  </span>
                </div>
                {config?.hasToken ? (
                  <button className="demo-banner-action" onClick={() => exitDemo()}>退出演示</button>
                ) : (
                  <a className="demo-banner-action" href="#/settings">登录 GitHub</a>
                )}
                {config?.hasToken && <a className="demo-banner-link" href="#/settings">连接 GitHub</a>}
              </div>
            )}
            {fatal && (
              <div className="flash flash-error">
                <Octicon name="alert" size={16} />
                <span>{fatal}</span>
              </div>
            )}
          </div>
          <div className="page-fade" key={key}>
            <ErrorBoundary>
              <Page route={route} />
            </ErrorBoundary>
          </div>
          <footer className="app-foot">
            <span>GitHub Mobile v1.6.1</span>
            <span>·</span>
            <a href="#/settings">设置</a>
            <span>·</span>
            <span>{user ? `@${user.login}` : '未登录'}</span>
          </footer>
        </main>
      </div>

      <DownloadTray />

      {linkDialog && <DeepLinkDialog action={linkDialog} onClose={() => setLinkDialog(null)} />}

      {toast && (
        <div className={`toast toast-${toast.kind}`} role="status">
          <Octicon name={toast.kind === 'success' ? 'check-circle-fill' : toast.kind === 'error' ? 'x-circle-fill' : 'info'} size={16} />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <LoadingBar />
        <Shell />
      </AppProvider>
    </ErrorBoundary>
  )
}
