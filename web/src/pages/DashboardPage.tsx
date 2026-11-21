import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import type { ContributionCalendar, GitHubEvent, Repository } from '../types'
import { useApi, useDocumentTitle } from '../lib/hooks'
import { useApp } from '../state/AppState'
import { fetchContributions } from '../lib/api'
import { ContributionGraph } from '../components/ContributionGraph'
import { Octicon } from '../components/Octicon'
import { Avatar } from '../components/Avatar'
import { ButtonLink, Skeleton } from '../components/ui'
import { compact, timeAgo, languageColor, firstLine } from '../lib/format'

function actionZh(action?: string): string {
  const map: Record<string, string> = {
    opened: '打开', closed: '关闭', reopened: '重新打开', merged: '合并',
  }
  return map[action || ''] || action || ''
}

function eventInfo(e: GitHubEvent): { icon: any; text: React.ReactNode; detail?: React.ReactNode } {
  const [owner, repo] = e.repo.name.split('/')
  const repoLink = <a className="feed-repo" href={`#/${owner}/${repo}`}>{e.repo.name}</a>
  switch (e.type) {
    case 'PushEvent': {
      const commits = e.payload?.commits || []
      return {
        icon: 'git-commit',
        text: <>推送了 {commits.length || e.payload?.size || 1} 个提交到 {repoLink}</>,
        detail: commits.length > 0 && (
          <ul className="feed-commits">
            {commits.slice(0, 3).map((c: any) => (
              <li key={c.sha}>
                <code>{c.sha?.slice(0, 7)}</code>
                <span>{firstLine(c.message, 90)}</span>
              </li>
            ))}
          </ul>
        ),
      }
    }
    case 'CreateEvent':
      return {
        icon: e.payload?.ref_type === 'repository' ? 'repo' : 'git-branch',
        text: <>创建了 {e.payload?.ref_type === 'repository' ? '仓库' : `${e.payload?.ref_type} ${e.payload?.ref}`} {e.payload?.ref_type === 'repository' ? repoLink : <>于 {repoLink}</>}</>,
      }
    case 'DeleteEvent':
      return { icon: 'trash', text: <>删除了 {e.payload?.ref_type} {e.payload?.ref}（{repoLink}）</> }
    case 'WatchEvent':
      return { icon: 'star', text: <>星标了 {repoLink}</> }
    case 'ForkEvent':
      return { icon: 'repo-forked', text: <>分叉了 {repoLink}</> }
    case 'PullRequestEvent':
      return {
        icon: 'git-pull-request',
        text: <>{actionZh(e.payload?.action)}了拉取请求（{repoLink}）</>,
        detail: e.payload?.pull_request?.title ? <a className="feed-commit-title" href={`#/${owner}/${repo}/pulls/${e.payload.pull_request.number}`}>{e.payload.pull_request.title}</a> : null,
      }
    case 'IssuesEvent':
      return {
        icon: 'issue-opened',
        text: <>{actionZh(e.payload?.action)}了议题（{repoLink}）</>,
        detail: e.payload?.issue?.title ? <a className="feed-commit-title" href={`#/${owner}/${repo}/issues/${e.payload.issue.number}`}>{e.payload.issue.title}</a> : null,
      }
    case 'IssueCommentEvent':
      return {
        icon: 'comment',
        text: <>评论了{e.payload?.issue?.pull_request ? '拉取请求' : '议题'}（{repoLink}）</>,
        detail: e.payload?.issue?.title ? <a className="feed-commit-title" href={`#/${owner}/${repo}/${e.payload.issue.pull_request ? 'pulls' : 'issues'}/${e.payload.issue.number}`}>{e.payload.issue.title}</a> : null,
      }
    case 'ReleaseEvent':
      return {
        icon: 'tag',
        text: <>发布了 {e.payload?.release?.tag_name}（{repoLink}）</>,
      }
    case 'PublicEvent':
      return { icon: 'globe', text: <>将 {repoLink} 设为公开</> }
    default:
      return { icon: 'pulse', text: <>{e.type.replace(/Event$/, '')}（{repoLink}）</> }
  }
}

export function DashboardPage() {
  const { user, repos, loading } = useApp()
  useDocumentTitle('首页')
  const eventsState = useApi<GitHubEvent[]>(user ? `/users/${user.login}/events?per_page=30` : null)
  const starredState = useApi<Repository[]>('/user/starred?per_page=6')
  const [calendar, setCalendar] = useState<ContributionCalendar | null>(null)
  const [calLoading, setCalLoading] = useState(true)

  useEffect(() => {
    let alive = true
    if (!user) return
    setCalLoading(true)
    fetchContributions()
      .then((c) => { if (alive) setCalendar(c) })
      .finally(() => { if (alive) setCalLoading(false) })
    return () => { alive = false }
  }, [user?.login])

  const sortedRepos = useMemo(
    () => [...repos].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [repos],
  )

  return (
    <div className="dashboard-layout">
      <div className="dashboard-main">
        <div className="page-heading">
          <h1>首页</h1>
        </div>

        <ContributionGraph calendar={calendar} loading={calLoading && !calendar} compact />

        <div className="feed-card card">
          <div className="feed-head">
            <h2>最近活动</h2>
          </div>
          {eventsState.loading && <div className="pad"><Skeleton height={48} /><Skeleton height={48} /><Skeleton height={48} /></div>}
          {!eventsState.loading && (eventsState.data || []).length === 0 && (
            <div className="feed-empty">
              <Octicon name="pulse" size={24} />
              <p>暂无公开活动。推送提交或星标仓库后会显示在这里。</p>
            </div>
          )}
          <ul className="feed">
            {(eventsState.data || []).slice(0, 15).map((e) => {
              const info = eventInfo(e)
              return (
                <li className="feed-item" key={e.id}>
                  <div className="feed-avatar-wrap">
                    <Avatar user={e.actor as any} login={e.actor?.login} size={32} />
                    <span className="feed-avatar-icon"><Octicon name={info.icon} size={10} /></span>
                  </div>
                  <div className="feed-body">
                    <div className="feed-text">
                      <a className="feed-user" href={`#/user/${e.actor?.login}`}>{e.actor?.login}</a> {info.text}
                      <span className="feed-time">{timeAgo(e.created_at)}</span>
                    </div>
                    {info.detail}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <aside className="dashboard-side">
        <div className="side-panel card">
          <div className="side-panel-head">
            <h2>你的仓库</h2>
            <a href="#/repos" title="查看全部仓库"><Octicon name="chevron-right" size={16} /></a>
          </div>
          <div className="side-repo-list">
            {sortedRepos.slice(0, 6).map((r) => (
              <a className="side-repo" key={r.id} href={`#/${r.owner.login}/${r.name}`}>
                <Octicon name={r.private ? 'lock' : 'repo'} size={16} />
                <span className="side-repo-name">{r.full_name}</span>
                {r.private && <span className="side-repo-vis">私有</span>}
                {r.language && <i className="lang-dot" style={{ background: languageColor(r.language) }} />}
              </a>
            ))}
            {loading && <Skeleton height={30} />}
            {!loading && repos.length === 0 && <div className="side-empty">暂无仓库。</div>}
          </div>
          <a className="side-panel-link" href="#/repos">查看更多</a>
        </div>

        <div className="side-panel card">
          <div className="side-panel-head">
            <h2>探索仓库</h2>
            <a href="#/explore" title="探索"><Octicon name="chevron-right" size={16} /></a>
          </div>
          <div className="explore-mini-list">
            {(starredState.data || []).slice(0, 4).map((r) => (
              <a className="explore-mini" key={r.id} href={`#/${r.owner.login}/${r.name}`}>
                <div className="explore-mini-title">
                  <Octicon name="repo" size={14} /> {r.full_name}
                </div>
                {r.description && <div className="explore-mini-desc">{r.description}</div>}
                <div className="explore-mini-meta">
                  {r.language && <><i className="lang-dot" style={{ background: languageColor(r.language) }} />{r.language}</>}
                  <Octicon name="star" size={12} /> {compact(r.stargazers_count)}
                </div>
              </a>
            ))}
            {starredState.loading && <Skeleton height={60} />}
            {!starredState.loading && (starredState.data || []).length === 0 && (
              <div className="side-empty">星标仓库后会显示在这里。</div>
            )}
          </div>
          <a className="side-panel-link" href="#/explore">探索更多</a>
        </div>

        <div className="side-panel card quick-links">
          <div className="side-panel-head"><h2>快捷入口</h2></div>
          <a href="#/issues"><Octicon name="issue-opened" size={16} /> 你的议题</a>
          <a href="#/pulls"><Octicon name="git-pull-request" size={16} /> 你的拉取请求</a>
          <a href="#/notifications"><Octicon name="inbox" size={16} /> 通知</a>
          <a href="#/settings"><Octicon name="server" size={16} /> Host 映射设置</a>
        </div>
      </aside>
    </div>
  )
}
