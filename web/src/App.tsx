import { useEffect } from 'react'
import { AppProvider, useApp } from './state/AppState'
import { Header } from './components/Header'
import { LeftRail } from './components/LeftRail'
import { Octicon } from './components/Octicon'
import { LoadingBar } from './components/LoadingBar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthPage, AuthLoading } from './pages/AuthPage'
import { routeKey, useRoute, navigate } from './lib/router'
import { DashboardPage } from './pages/DashboardPage'
import { RepositoriesPage } from './pages/RepositoriesPage'
import { GlobalIssuesPage } from './pages/GlobalIssuesPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { ExplorePage } from './pages/ExplorePage'
import { ProfilePage } from './pages/ProfilePage'
import { SearchPage } from './pages/SearchPage'
import { AppSettingsPage } from './pages/AppSettingsPage'
import { RepoRoute } from './pages/RepoRoute'
import { NotFoundPage } from './pages/NotFoundPage'
import type { Route } from './lib/router'

function Page({ route }: { route: Route }) {
  switch (route.kind) {
    case 'home': return <DashboardPage />
    case 'repositories': return <RepositoriesPage />
    case 'global-issues': return <GlobalIssuesPage mode="issues" />
    case 'global-pulls': return <GlobalIssuesPage mode="pulls" />
    case 'notifications': return <NotificationsPage />
    case 'explore': return <ExplorePage />
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
  const { loading, source, fatal, toast, setDrawerOpen, drawerOpen, exitDemo, user } = useApp()
  const route = useRoute()
  const key = routeKey(route)
  useShortcuts(source === 'live' || source === 'demo')

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
                  <strong>演示模式</strong>
                  <span>正在浏览公开演示数据（sindresorhus/awesome、microsoft/vscode），不是你的 GitHub 账号。</span>
                </div>
                <button className="demo-banner-action" onClick={() => exitDemo()}>退出演示</button>
                <a className="demo-banner-link" href="#/settings">连接 GitHub</a>
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
            <span>OctoDeck v1.1.0</span>
            <span>·</span>
            <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
            <span>·</span>
            <span>{user ? `@${user.login}` : '未登录'}</span>
          </footer>
        </main>
      </div>

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
