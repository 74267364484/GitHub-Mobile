import { useApp } from '../state/AppState'
import { useRoute, repoHref } from '../lib/router'
import { Octicon } from './Octicon'
import { HostCard } from './HostCard'
import { Avatar } from './Avatar'
import { compact, languageColor } from '../lib/format'
import type { IconName } from './Octicon'

function RailLink({
  href, icon, label, active, count, onClick,
}: {
  href: string
  icon: IconName
  label: string
  active?: boolean
  count?: number
  onClick?: () => void
}) {
  return (
    <a className={`rail-link ${active ? 'active' : ''}`} href={href} onClick={onClick}>
      <Octicon name={icon} size={16} className="rail-link-icon" />
      <span className="rail-link-label">{label}</span>
      {count != null && count > 0 && <span className="rail-count">{count}</span>}
    </a>
  )
}

export function LeftRail() {
  const {
    user, repos, source, unreadCount, drawerOpen, setDrawerOpen, rateLimit,
    theme, setTheme, defaultRepo,
  } = useApp()
  const route = useRoute()
  const close = () => setDrawerOpen(false)

  const repoFull = route.kind === 'repo' ? `${route.owner}/${route.repo}` : ''
  const currentRepo = repos.find((r) => r.full_name.toLowerCase() === repoFull.toLowerCase())
  const isRepo = route.kind === 'repo'
  const repoBase = isRepo ? repoHref(route.owner, route.repo) : ''
  const isDemo = source === 'demo'

  const ratePct = rateLimit && rateLimit.limit ? Math.max(0, Math.min(100, (rateLimit.remaining / rateLimit.limit) * 100)) : 0

  return (
    <>
      {drawerOpen && <div className="rail-backdrop" onClick={close} />}
      <aside className={`LeftRail ${drawerOpen ? 'LeftRail-open' : ''}`}>
        <div className="rail-mobile-head">
          <a href="#/" className="rail-brand" onClick={close}>
            <Octicon name="mark-github" size={24} />
            <span>OctoDeck</span>
          </a>
          <button className="icon-btn" onClick={close} aria-label="关闭导航">
            <Octicon name="x" size={18} />
          </button>
        </div>

        <HostCard />

        <nav className="rail-nav" aria-label="OctoDeck 导航">
          <div className="rail-section-label">主菜单</div>
          <RailLink href="#/" icon="home" label="首页" active={route.kind === 'home'} onClick={close} />
          <RailLink href="#/repos" icon="repo" label="仓库" active={route.kind === 'repositories'} onClick={close} />
          <RailLink href="#/issues" icon="issue-opened" label="议题" active={route.kind === 'global-issues'} onClick={close} />
          <RailLink href="#/pulls" icon="git-pull-request" label="拉取请求" active={route.kind === 'global-pulls'} onClick={close} />
          <RailLink href="#/notifications" icon="bell" label="通知" active={route.kind === 'notifications'} count={unreadCount} onClick={close} />
          <RailLink href="#/explore" icon="telescope" label="探索" active={route.kind === 'explore'} onClick={close} />
          <RailLink href="#/profile" icon="person" label="个人主页" active={route.kind === 'profile'} onClick={close} />
        </nav>

        {isRepo && (
          <>
            <div className="rail-repo">
              <a className="rail-repo-title" href={`#${repoBase}`} onClick={close}>
                <Octicon name={currentRepo?.private ? 'lock' : 'repo'} size={16} />
                <span className="rail-repo-owner">{route.owner}/</span>
                <strong>{route.repo}</strong>
              </a>
              <div className="rail-repo-kind">
                {currentRepo ? (currentRepo.private ? '私有' : '公开') : '仓库'}
                {currentRepo?.language && <span className="rail-repo-lang"> · {currentRepo.language}</span>}
              </div>
            </div>
            <nav className="rail-nav rail-repo-nav" aria-label="仓库导航">
              <RailLink href={`#${repoBase}`} icon="code" label="代码" active={route.tab === 'code'} onClick={close} />
              <RailLink href={`#${repoBase}/issues`} icon="issue-opened" label="议题" active={route.tab === 'issues'} onClick={close} />
              <RailLink href={`#${repoBase}/pulls`} icon="git-pull-request" label="拉取请求" active={route.tab === 'pulls'} onClick={close} />
              <RailLink href={`#${repoBase}/actions`} icon="play" label="Actions" active={route.tab === 'actions'} onClick={close} />
              <RailLink href={`#${repoBase}/projects`} icon="table" label="项目" active={route.tab === 'projects'} onClick={close} />
              <RailLink href={`#${repoBase}/wiki`} icon="book" label="Wiki" active={route.tab === 'wiki'} onClick={close} />
              <RailLink href={`#${repoBase}/security`} icon="shield" label="安全" active={route.tab === 'security'} onClick={close} />
              <RailLink href={`#${repoBase}/insights`} icon="graph" label="洞察" active={route.tab === 'insights'} onClick={close} />
              <RailLink href={`#${repoBase}/settings`} icon="gear" label="设置" active={route.tab === 'settings'} onClick={close} />
            </nav>
          </>
        )}

        <div className="rail-repos-section">
          <div className="rail-section-label">
            你的仓库
            <a className="rail-section-link" href="#/repos" onClick={close}>查看全部</a>
          </div>
          <div className="rail-repos">
            {repos.slice(0, 6).map((r) => (
              <a
                key={r.id}
                className={`rail-repo-item ${repoFull.toLowerCase() === r.full_name.toLowerCase() ? 'active' : ''}`}
                href={`#${repoHref(r.owner.login, r.name)}`}
                onClick={close}
              >
                <Octicon name={r.private ? 'lock' : 'repo'} size={14} />
                <span className="rail-repo-item-name">{r.name}</span>
                {r.language && <i className="lang-dot" style={{ background: languageColor(r.language) }} />}
              </a>
            ))}
            {repos.length === 0 && <div className="rail-empty">暂无仓库</div>}
          </div>
          {user && (
            <a className="rail-user" href="#/profile" onClick={close}>
              <Avatar user={user} size={20} square={user.type === 'Organization'} />
              <span>{user.login}</span>
              {isDemo && <span className="rail-demo-badge">演示</span>}
              <span className="rail-user-followers">{compact(user.followers)} 关注者</span>
            </a>
          )}
        </div>

        <div className="rail-footer">
          <div className="rail-status">
            {isDemo ? (
              <span className="rail-status-badge rail-status-demo">
                <Octicon name="sparkle" size={12} /> 演示模式
              </span>
            ) : (
              <span className="rail-status-badge rail-status-live">
                <span className="status-dot" /> 实时数据
              </span>
            )}
            {rateLimit && !isDemo && (
              <div className="rail-rate" title={`剩余 ${rateLimit.remaining} / ${rateLimit.limit} 次请求`}>
                <div className="rail-rate-head">
                  <span>API</span>
                  <span>{rateLimit.remaining.toLocaleString()} / {rateLimit.limit.toLocaleString()}</span>
                </div>
                <div className="rail-rate-bar"><span style={{ width: `${ratePct}%` }} /></div>
              </div>
            )}
          </div>

          <div className="rail-footer-row">
            <div className="rail-theme" role="group" aria-label="主题">
              <button className={`rail-theme-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')} title="浅色">
                <Octicon name="sun" size={14} />
              </button>
              <button className={`rail-theme-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')} title="深色">
                <Octicon name="moon" size={14} />
              </button>
              <button className={`rail-theme-btn ${theme === 'auto' ? 'active' : ''}`} onClick={() => setTheme('auto')} title="跟随系统">
                <Octicon name="device-desktop" size={14} />
              </button>
            </div>
            <a className="rail-settings" href="#/settings" onClick={close} title="OctoDeck 设置">
              <Octicon name="gear" size={14} />
            </a>
          </div>
          <div className="rail-version">
            <span>OctoDeck v1.1.0</span>
            <span>{defaultRepo ? `· ${defaultRepo.split('/')[1]}` : ''}</span>
          </div>
        </div>
      </aside>
    </>
  )
}
