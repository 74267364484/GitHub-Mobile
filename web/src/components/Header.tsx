import { useState } from 'react'
import { useApp } from '../state/AppState'
import { useRoute } from '../lib/router'
import { Octicon } from './Octicon'
import { Avatar } from './Avatar'
import { SearchBox } from './SearchBox'
import { Dropdown } from './ui'
import { navigate } from '../lib/router'

export function Header() {
  const {
    user, config, unreadCount, clearToken, setDrawerOpen, theme, setTheme,
    source, exitDemo,
  } = useApp()
  const route = useRoute()
  const [mobileSearch, setMobileSearch] = useState(false)
  const isDemo = source === 'demo'

  const active = (kind: string) => route.kind === kind

  const signOut = async () => {
    await clearToken()
    navigate('/')
  }

  return (
    <>
      <header className="AppHeader">
        <button className="icon-btn header-burger" onClick={() => setDrawerOpen(true)} aria-label="打开导航">
          <Octicon name="three-bars" size={20} />
        </button>

        <a className="header-logo" href="#/" aria-label="OctoMobile 首页">
          <Octicon name="mark-github" size={32} />
        </a>

        <div className="header-search">
          <SearchBox />
        </div>

        <button className="icon-btn header-search-toggle" onClick={() => setMobileSearch(true)} aria-label="搜索">
          <Octicon name="search" size={20} />
        </button>

        <nav className="header-nav" aria-label="全局导航">
          <a className={`header-nav-item ${active('global-pulls') ? 'active' : ''}`} href="#/pulls">拉取请求</a>
          <a className={`header-nav-item ${active('global-issues') ? 'active' : ''}`} href="#/issues">议题</a>
          <a className="header-nav-item" href="https://github.com/marketplace" target="_blank" rel="noreferrer">市场</a>
          <a className={`header-nav-item ${active('explore') ? 'active' : ''}`} href="#/explore">探索</a>
        </nav>

        <div className="header-right">
          <a className="icon-btn header-bell" href="#/notifications" aria-label={`通知${unreadCount ? `，${unreadCount} 条未读` : ''}`}>
            <Octicon name="bell" size={16} />
            {unreadCount > 0 && <span className="unread-dot" />}
          </a>

          <Dropdown
            align="right"
            width={270}
            trigger={
              <button className="icon-btn" aria-label="新建">
                <span className="plus-caret">
                  <Octicon name="plus" size={16} />
                  <Octicon name="triangle-down" size={8} className="caret" />
                </span>
              </button>
            }
          >
            {(close) => (
              <>
                <div className="dropdown-header">新建</div>
                <a className="dropdown-item" href="https://github.com/new" target="_blank" rel="noreferrer" onClick={close}>
                  <Octicon name="repo" size={16} /> 新建仓库
                </a>
                <a className="dropdown-item" href="https://gist.github.com/" target="_blank" rel="noreferrer" onClick={close}>
                  <Octicon name="code" size={16} /> 新建 Gist
                </a>
                <a className="dropdown-item" href="https://github.com/new/import" target="_blank" rel="noreferrer" onClick={close}>
                  <Octicon name="upload" size={16} /> 导入仓库
                </a>
                <div className="dropdown-divider" />
                <a className="dropdown-item" href="#/settings" onClick={close}>
                  <Octicon name="gear" size={16} /> OctoMobile 设置
                </a>
              </>
            )}
          </Dropdown>

          <Dropdown
            align="right"
            width={300}
            trigger={
              <button className="avatar-trigger" aria-label="账户菜单">
                {user
                  ? <Avatar user={user} size={20} square={user.type === 'Organization'} />
                  : <span className="avatar avatar-placeholder" style={{ width: 20, height: 20 }} />}
              </button>
            }
          >
            {(close) => (
              <>
                <div className="dropdown-userhead">
                  {user ? (
                    <>
                      <div className="dropdown-userhead-name">
                        {isDemo ? '演示账号' : '已登录为'} <strong>{user.login}</strong>
                      </div>
                      <div className="dropdown-userhead-sub">
                        {isDemo
                          ? '公开演示数据 · 非你的账号'
                          : config?.tokenSource === 'server'
                            ? '本地服务令牌'
                            : '已连接 GitHub · 登录状态已保存'}
                      </div>
                    </>
                  ) : (
                    <div className="dropdown-userhead-name">未登录</div>
                  )}
                </div>
                <div className="dropdown-divider" />
                <a className="dropdown-item" href="#/profile" onClick={close}>
                  <Octicon name="person" size={16} /> 你的主页
                </a>
                <a className="dropdown-item" href="#/repos" onClick={close}>
                  <Octicon name="repo" size={16} /> 你的仓库
                </a>
                <a className="dropdown-item" href="#/pulls" onClick={close}>
                  <Octicon name="git-pull-request" size={16} /> 你的拉取请求
                </a>
                <a className="dropdown-item" href="#/settings" onClick={close}>
                  <Octicon name="gear" size={16} /> 设置
                </a>
                <div className="dropdown-divider" />
                <div className="dropdown-header">外观</div>
                <div className="theme-picker">
                  <button className={`theme-choice ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>
                    <Octicon name="sun" size={16} /> 浅色
                  </button>
                  <button className={`theme-choice ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>
                    <Octicon name="moon" size={16} /> 深色
                  </button>
                  <button className={`theme-choice ${theme === 'auto' ? 'active' : ''}`} onClick={() => setTheme('auto')}>
                    <Octicon name="device-desktop" size={16} /> 跟随系统
                  </button>
                </div>
                <div className="dropdown-divider" />
                {isDemo ? (
                  <>
                    <a className="dropdown-item dropdown-accent" href="#/settings" onClick={close}>
                      <Octicon name="key" size={16} /> 连接 GitHub
                    </a>
                    <button className="dropdown-item dropdown-danger" onClick={() => { close(); exitDemo() }}>
                      <Octicon name="sign-out" size={16} /> 退出演示
                    </button>
                  </>
                ) : (
                  <button className="dropdown-item dropdown-danger" onClick={() => { close(); signOut() }}>
                    <Octicon name="sign-out" size={16} /> 退出登录
                  </button>
                )}
                <div className="dropdown-version">OctoMobile v1.2.0</div>
              </>
            )}
          </Dropdown>
        </div>
      </header>

      {mobileSearch && (
        <div className="mobile-search-overlay">
          <div className="mobile-search-inner">
            <SearchBox mobile autoFocus onNavigate={() => setMobileSearch(false)} />
            <button className="mobile-search-cancel" onClick={() => setMobileSearch(false)}>取消</button>
          </div>
          <div className="mobile-search-backdrop" onClick={() => setMobileSearch(false)} />
        </div>
      )}
    </>
  )
}
