import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import type { ContributionCalendar, GitHubEvent, GitHubUser, Repository } from '../types'
import { useApi, useDocumentTitle } from '../lib/hooks'
import { useApp } from '../state/AppState'
import { fetchContributions, gh } from '../lib/api'
import { ContributionGraph } from '../components/ContributionGraph'
import { Octicon, type IconName } from '../components/Octicon'
import { Avatar } from '../components/Avatar'
import { Button, Dialog, EmptyState, Skeleton } from '../components/ui'
import { NewRepoDialog } from '../components/WriteDialogs'
import { compact, formatDate, languageColor, timeAgo, firstLine } from '../lib/format'
import { navigate, useRoute } from '../lib/router'
import { NotFoundPage } from './NotFoundPage'

type ProfileTab = 'overview' | 'repositories' | 'projects' | 'packages' | 'stars'

const PROFILE_TABS: { id: ProfileTab; label: string; icon: IconName }[] = [
  { id: 'overview', label: '概览', icon: 'book' },
  { id: 'repositories', label: '仓库', icon: 'repo' },
  { id: 'projects', label: '项目', icon: 'table' },
  { id: 'packages', label: '包', icon: 'package' },
  { id: 'stars', label: '星标', icon: 'star' },
]

function activityText(e: GitHubEvent): { icon: IconName; text: React.ReactNode } {
  const [owner, repo] = e.repo.name.split('/')
  const repoLink = <a href={`#/${owner}/${repo}`}>{e.repo.name}</a>
  switch (e.type) {
    case 'PushEvent': {
      const n = e.payload?.commits?.length || e.payload?.size || 1
      return { icon: 'git-commit', text: <>推送了 {n} 个提交到 {repoLink}</> }
    }
    case 'CreateEvent':
      return { icon: e.payload?.ref_type === 'repository' ? 'repo' : 'git-branch', text: <>创建了{({ repository: '仓库', branch: '分支', tag: '标签' } as Record<string, string>)[e.payload?.ref_type] || '内容'} {e.payload?.ref || ''}（{repoLink}）</> }
    case 'WatchEvent': return { icon: 'star', text: <>星标了 {repoLink}</> }
    case 'ForkEvent': return { icon: 'repo-forked', text: <>分叉了 {repoLink}</> }
    case 'PullRequestEvent': return { icon: 'git-pull-request', text: <>处理了拉取请求（{repoLink}）</> }
    case 'IssuesEvent': return { icon: 'issue-opened', text: <>处理了议题（{repoLink}）</> }
    case 'IssueCommentEvent': return { icon: 'comment', text: <>评论了 {repoLink}</> }
    case 'ReleaseEvent': return { icon: 'tag', text: <>发布了 {e.payload?.release?.tag_name}（{repoLink}）</> }
    default: return { icon: 'pulse', text: <>有新的公开动态（{repoLink}）</> }
  }
}

function RepoMiniCard({ repo }: { repo: Repository }) {
  return (
    <div className="pinned-repo card">
      <div className="pinned-head">
        <Octicon name={repo.private ? 'lock' : 'repo'} size={16} />
        <a href={`#/${repo.owner.login}/${repo.name}`}>{repo.name}</a>
        <span className={`repo-visibility ${repo.private ? 'private' : ''}`}>{repo.private ? '私有' : '公开'}</span>
      </div>
      {repo.description && <p className="pinned-desc">{repo.description}</p>}
      <div className="pinned-meta">
        {repo.language && <span><i className="lang-dot" style={{ background: languageColor(repo.language) }} />{repo.language}</span>}
        <span><Octicon name="star" size={12} /> {compact(repo.stargazers_count)}</span>
        <span><Octicon name="repo-forked" size={12} /> {compact(repo.forks_count)}</span>
      </div>
    </div>
  )
}

export function ProfilePage() {
  const route = useRoute()
  const { user: current, repos: authRepos, config, showToast, reload } = useApp()
  const login = (route.kind === 'profile' && route.login) || current?.login || ''
  const isSelf = Boolean(login && current && login.toLowerCase() === current.login.toLowerCase())
  const userState = useApi<GitHubUser>(login ? `/users/${login}` : null)
  const reposState = useApi<Repository[]>(
    login ? (isSelf ? '/user/repos?per_page=100&sort=updated&visibility=all&affiliation=owner,collaborator,organization_member' : `/users/${login}/repos?per_page=100&sort=updated`) : null,
  )
  const eventsState = useApi<GitHubEvent[]>(login ? `/users/${login}/events?per_page=30` : null)
  const starredState = useApi<Repository[]>(isSelf ? '/user/starred?per_page=30' : null)
  const [calendar, setCalendar] = useState<ContributionCalendar | null>(null)
  const [calLoading, setCalLoading] = useState(true)
  const [tab, setTab] = useState<ProfileTab>('overview')
  const [repoFilter, setRepoFilter] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [newRepoOpen, setNewRepoOpen] = useState(false)
  const [peopleList, setPeopleList] = useState<'followers' | 'following' | null>(null)
  const [following, setFollowing] = useState<boolean | null>(null)
  const [followBusy, setFollowBusy] = useState(false)

  const user = isSelf ? (current || userState.data) : userState.data
  const repos = reposState.data || (isSelf ? authRepos : [])
  const events = eventsState.data || []
  useDocumentTitle(user ? `${user.name || user.login} (${user.login})` : '个人主页')

  useEffect(() => {
    setTab('overview')
  }, [login])

  useEffect(() => {
    let alive = true
    if (!login) return
    setCalLoading(true)
    fetchContributions(isSelf ? undefined : login)
      .then((c) => { if (alive) setCalendar(c) })
      .finally(() => { if (alive) setCalLoading(false) })
    return () => { alive = false }
  }, [login, isSelf])

  useEffect(() => {
    let alive = true
    setFollowing(null)
    if (!config?.hasToken || isSelf || !login) return
    gh(`/user/following/${encodeURIComponent(login)}`)
      .then(() => { if (alive) setFollowing(true) })
      .catch((e: any) => { if (alive) setFollowing(e?.status === 404 ? false : null) })
    return () => { alive = false }
  }, [config?.hasToken, isSelf, login])

  const toggleFollow = async () => {
    if (!config?.hasToken) {
      showToast('登录 GitHub 后才能关注用户', 'info')
      navigate('/settings')
      return
    }
    const next = !following
    setFollowBusy(true)
    try {
      await gh(`/user/following/${encodeURIComponent(login)}`, { method: next ? 'PUT' : 'DELETE' })
      setFollowing(next)
      showToast(next ? `已关注 ${login}` : `已取消关注 ${login}`, 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败', 'error')
    } finally {
      setFollowBusy(false)
    }
  }

  const popular = useMemo(
    () => [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 6),
    [repos],
  )

  const groupedEvents = useMemo(() => {
    const groups: { label: string; items: GitHubEvent[] }[] = []
    for (const e of events) {
      const d = new Date(e.created_at)
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      let g = groups.find((x) => x.label === label)
      if (!g) {
        g = { label, items: [] }
        groups.push(g)
      }
      g.items.push(e)
    }
    return groups
  }, [events])

  const filteredRepos = useMemo(
    () => repos.filter((r) => !repoFilter || r.name.toLowerCase().includes(repoFilter.toLowerCase())),
    [repos, repoFilter],
  )

  if (userState.error) return <NotFoundPage title="用户不存在" />
  if (!user) {
    return (
      <div className="profile-loading">
        <aside className="profile-side"><Skeleton width={200} circle height={200} /><Skeleton width={140} height={24} /><Skeleton height={16} /></aside>
        <div className="profile-main"><Skeleton height={220} /><Skeleton height={120} /></div>
      </div>
    )
  }

  return (
    <div className="profile-page">
      <aside className="profile-side">
        <div className="profile-avatar-wrap">
          <Avatar user={user} size={240} />
          <span className="profile-status" title="在线" />
        </div>
        <div className="profile-name-block">
          {user.name && <h1 className="profile-name">{user.name}</h1>}
          <div className={`profile-login ${user.name ? '' : 'profile-login-lg'}`}>{user.login}</div>
          {user.bio && <p className="profile-bio">{user.bio}</p>}
        </div>

        <div className="profile-actions">
          {isSelf ? (
            <Button className="profile-follow-btn" onClick={() => setEditOpen(true)}>
              编辑资料
            </Button>
          ) : (
            <Button className="profile-follow-btn" onClick={toggleFollow} disabled={followBusy}>
              {followBusy ? '处理中…' : following ? '取消关注' : '关注'}
            </Button>
          )}
        </div>

        <div className="profile-meta">
          <div className="profile-follow-row">
            <button className="profile-count-btn" onClick={() => setPeopleList('followers')}>
              <Octicon name="people" size={16} /> <strong>{compact(user.followers ?? user.followersCount ?? 0)}</strong> 关注者
            </button>
            <span>·</span>
            <button className="profile-count-btn" onClick={() => setPeopleList('following')}>
              <strong>{compact(user.following ?? user.followingCount ?? 0)}</strong> 正在关注
            </button>
          </div>
          {user.company && <div className="profile-meta-row"><Octicon name="repo" size={16} /> {user.company}</div>}
          {user.location && <div className="profile-meta-row"><Octicon name="location" size={16} /> {user.location}</div>}
          {user.blog && (
            <div className="profile-meta-row">
              <Octicon name="link" size={16} />
              <a href={user.blog.startsWith('http') ? user.blog : `https://${user.blog}`} target="_blank" rel="noreferrer">
                {user.blog.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}
          {user.twitter_username && (
            <div className="profile-meta-row"><Octicon name="mention" size={16} /> @{user.twitter_username}</div>
          )}
          {user.created_at && (
            <div className="profile-meta-row profile-joined">
              <Octicon name="calendar" size={16} /> 加入于 {formatDate(user.created_at)}
            </div>
          )}
        </div>
      </aside>

      <div className="profile-main">
        <nav className="profile-tabs">
          {PROFILE_TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <Octicon name={t.icon} size={16} /> {t.label}
              {t.id === 'repositories' && <span className="Counter">{repos.length}</span>}
            </button>
          ))}
        </nav>

        {tab === 'overview' && (
          <>
            <ContributionGraph calendar={calendar} loading={calLoading && !calendar} />
            <div className="profile-section-head">
              <h2>贡献活动</h2>
            </div>
            {events.length > 0 ? (
              <div className="profile-activity">
                {groupedEvents.map((g) => (
                  <div className="activity-month" key={g.label}>
                    <h3 className="activity-month-label">{g.label}</h3>
                    <ul className="activity-list">
                      {g.items.slice(0, 12).map((e) => {
                        const a = activityText(e)
                        return (
                          <li className="activity-item" key={e.id}>
                            <span className="activity-icon"><Octicon name={a.icon} size={14} /></span>
                            <span className="activity-text">{a.text}</span>
                            <span className="activity-time">{timeAgo(e.created_at)}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card blankslate-wrap">
                <EmptyState icon="pulse" title="暂无贡献活动">
                  <p>公开的推送、议题和拉取请求会显示在这里。</p>
                </EmptyState>
              </div>
            )}

            <div className="profile-section-head">
              <h2>热门仓库</h2>
            </div>
            <div className="pinned-grid">
              {popular.map((r) => <RepoMiniCard key={r.id} repo={r} />)}
              {popular.length === 0 && (
                <div className="card blankslate-wrap" style={{ gridColumn: '1 / -1' }}>
                  <EmptyState icon="repo" title="暂无公开仓库" />
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'repositories' && (
          <>
            <div className="profile-repo-toolbar">
              <div className="list-search">
                <Octicon name="search" size={16} />
                <input className="form-input" placeholder="查找仓库…" value={repoFilter} onChange={(e) => setRepoFilter(e.target.value)} />
              </div>
              {isSelf && (
                <Button size="sm" variant="primary" icon="repo" onClick={() => setNewRepoOpen(true)}>
                  新建
                </Button>
              )}
            </div>
            <div className="profile-repo-list">
              {filteredRepos.map((r) => (
                <div className="profile-repo-row" key={r.id}>
                  <div className="profile-repo-row-main">
                    <div className="profile-repo-row-title">
                      <Octicon name={r.private ? 'lock' : 'repo'} size={16} />
                      <a href={`#/${r.owner.login}/${r.name}`}>{r.full_name}</a>
                      <span className={`repo-visibility ${r.private ? 'private' : ''}`}>{r.private ? '私有' : '公开'}</span>
                    </div>
                    {r.description && <p>{r.description}</p>}
                    <div className="profile-repo-row-meta">
                      {r.language && <span><i className="lang-dot" style={{ background: languageColor(r.language) }} />{r.language}</span>}
                      <span><Octicon name="star" size={12} /> {compact(r.stargazers_count)}</span>
                      <span>更新于 {timeAgo(r.updated_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {filteredRepos.length === 0 && <div className="side-empty">没有找到仓库。</div>}
            </div>
          </>
        )}

        {tab === 'stars' && (
          <div className="profile-star-list">
            {(starredState.data || []).map((r) => (
              <div className="profile-repo-row" key={r.id}>
                <div className="profile-repo-row-main">
                  <div className="profile-repo-row-title">
                    <Octicon name="star" size={16} />
                    <a href={`#/${r.owner.login}/${r.name}`}>{r.full_name}</a>
                  </div>
                  {r.description && <p>{r.description}</p>}
                  <div className="profile-repo-row-meta">
                    {r.language && <span><i className="lang-dot" style={{ background: languageColor(r.language) }} />{r.language}</span>}
                    <span><Octicon name="star" size={12} /> {compact(r.stargazers_count)}</span>
                  </div>
                </div>
              </div>
            ))}
            {starredState.loading && <Skeleton height={60} />}
            {!starredState.loading && (starredState.data || []).length === 0 && (
              <div className="card blankslate-wrap"><EmptyState icon="star" title="暂无星标仓库"><p>星标仓库后会显示在这里。</p></EmptyState></div>
            )}
          </div>
        )}

        {(tab === 'projects' || tab === 'packages') && (
          <div className="card blankslate-wrap">
            <EmptyState
              icon={tab === 'projects' ? 'table' : 'package'}
              title={tab === 'projects' ? '暂无项目' : '暂无已发布的包'}
            >
              <p>{tab === 'projects' ? '仓库内的项目可在对应仓库的「项目」页查看。' : 'Packages 用于在组织内发布和使用软件包。'}</p>
            </EmptyState>
          </div>
        )}
      </div>

      {editOpen && user && (
        <EditProfileDialog
          user={user}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false)
            await reload()
            showToast('个人资料已更新', 'success')
          }}
        />
      )}

      {newRepoOpen && (
        <NewRepoDialog
          onClose={() => setNewRepoOpen(false)}
          onCreated={(repo) => {
            setNewRepoOpen(false)
            showToast(`仓库 ${repo.full_name} 已创建`, 'success')
            navigate(`/${repo.owner.login}/${repo.name}`)
          }}
        />
      )}

      {peopleList && (
        <PeopleListDialog
          login={login}
          kind={peopleList}
          onClose={() => setPeopleList(null)}
        />
      )}
    </div>
  )
}

function EditProfileDialog({
  user, onClose, onSaved,
}: {
  user: GitHubUser
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useApp()
  const [name, setName] = useState(user.name || '')
  const [bio, setBio] = useState(user.bio || '')
  const [company, setCompany] = useState(user.company || '')
  const [location, setLocation] = useState(user.location || '')
  const [blog, setBlog] = useState(user.blog || '')
  const [twitter, setTwitter] = useState(user.twitter_username || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await gh('/user', {
        method: 'PATCH',
        body: {
          name: name.trim() || null,
          bio: bio.trim() || null,
          company: company.trim() || null,
          location: location.trim() || null,
          blog: blog.trim() || null,
          twitter_username: twitter.trim() || null,
        },
      })
      onSaved()
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败'
      setError(message)
      showToast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="编辑个人资料"
      subtitle="保存在你的 GitHub 账号"
      onClose={onClose}
      width={560}
      footer={(
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="primary" icon="check" onClick={submit} disabled={busy}>
            {busy ? '保存中…' : '保存资料'}
          </Button>
        </div>
      )}
    >
      <form className="write-form" onSubmit={submit}>
        <label className="settings-field">
          <span className="settings-label">昵称</span>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="你的名字" autoFocus />
        </label>
        <label className="settings-field">
          <span className="settings-label">简介</span>
          <textarea className="form-input" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="一句话介绍自己" />
        </label>
        <div className="write-form-row">
          <label className="settings-field">
            <span className="settings-label">公司</span>
            <input className="form-input" value={company} onChange={(e) => setCompany(e.target.value)} />
          </label>
          <label className="settings-field">
            <span className="settings-label">所在地</span>
            <input className="form-input" value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
        </div>
        <div className="write-form-row">
          <label className="settings-field">
            <span className="settings-label">网站</span>
            <input className="form-input" value={blog} onChange={(e) => setBlog(e.target.value)} placeholder="https://example.com" />
          </label>
          <label className="settings-field">
            <span className="settings-label">X / Twitter</span>
            <input className="form-input" value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="username" />
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
      </form>
    </Dialog>
  )
}

function PeopleListDialog({
  login, kind, onClose,
}: {
  login: string
  kind: 'followers' | 'following'
  onClose: () => void
}) {
  const state = useApi<GitHubUser[]>(`/users/${encodeURIComponent(login)}/${kind}?per_page=100`)
  return (
    <Dialog
      title={kind === 'followers' ? '关注者' : '正在关注'}
      subtitle={`@${login}`}
      onClose={onClose}
      width={480}
    >
      {state.loading && <Skeleton height={120} />}
      {state.error && <div className="form-error">{state.error.message}</div>}
      <div className="people-list-dialog">
        {(state.data || []).map((u) => (
          <a className="people-list-row" key={u.id} href={`#/user/${u.login}`}>
            <Avatar user={u} size={28} />
            <span>{u.login}</span>
          </a>
        ))}
        {!state.loading && !state.error && (state.data || []).length === 0 && <p className="muted">暂无用户。</p>}
      </div>
    </Dialog>
  )
}
