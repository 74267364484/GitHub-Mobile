import { useMemo, useState } from 'react'
import type { Notification } from '../types'
import { useApi, useDocumentTitle } from '../lib/hooks'
import { Octicon, type IconName } from '../components/Octicon'
import { ButtonLink, Skeleton } from '../components/ui'
import { repoFromUrl } from '../lib/api'
import { timeAgo } from '../lib/format'

const REASONS: Record<string, string> = {
  review_requested: '请求你审查',
  mention: '提到了你',
  assign: '分配给你',
  author: '你创建的',
  comment: '有新评论',
  ci_activity: 'CI 活动',
  manual: '手动订阅',
  state_change: '状态变更',
  subscribed: '已订阅',
  team_mention: '团队提及',
  security_alert: '安全警报',
  invitation: '邀请',
}

function subjectMeta(n: Notification): { icon: IconName; href: string; external?: boolean } {
  const type = n.subject.type
  const icon: IconName =
    type === 'Issue' ? 'issue-opened'
      : type === 'PullRequest' ? 'git-pull-request'
        : type === 'Discussion' ? 'comment-discussion'
          : type === 'Release' ? 'tag'
            : type === 'Commit' ? 'git-commit'
              : type === 'RepositoryVulnerabilityAlert' ? 'shield'
                : 'bell'
  const apiUrl = n.subject.url || ''
  const m = apiUrl.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/(issues|pulls)\/(\d+)$/)
  if (m) {
    const kind = m[2] === 'pulls' ? 'pulls' : 'issues'
    return { icon, href: `#/${m[1]}/${kind}/${m[3]}` }
  }
  const repo = n.repository?.full_name
  return { icon, href: repo ? `#/${repo}` : 'https://github.com/notifications', external: !repo }
}

export function NotificationsPage() {
  useDocumentTitle('通知')
  const state = useApi<Notification[]>('/notifications?all=false&per_page=50')
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const list = useMemo(() => {
    const data = state.data || []
    return tab === 'unread' ? data.filter((n) => n.unread) : data
  }, [state.data, tab])

  const grouped = useMemo(() => {
    const map = new Map<string, Notification[]>()
    for (const n of list) {
      const key = n.repository?.full_name || 'Other'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(n)
    }
    return Array.from(map.entries())
  }, [list])

  const unread = (state.data || []).filter((n) => n.unread).length

  return (
    <div className="notifications-page">
      <div className="page-heading">
        <h1>通知</h1>
        <ButtonLink href="https://github.com/notifications" external size="sm" icon="link-external">在 GitHub 打开</ButtonLink>
      </div>

      <div className="list-toolbar">
        <div className="state-tabs">
          <button className={`state-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
            <Octicon name="bell" size={16} /> 全部
          </button>
          <button className={`state-tab ${tab === 'unread' ? 'active' : ''}`} onClick={() => setTab('unread')}>
            <Octicon name="bell-fill" size={16} /> 未读 <span className="Counter">{unread}</span>
          </button>
        </div>
      </div>

      {state.loading && (
        <div className="card pad"><Skeleton height={48} /><Skeleton height={48} /><Skeleton height={48} /></div>
      )}

      {!state.loading && grouped.length > 0 && (
        <div className="card notification-list">
          {grouped.map(([repo, notes]) => (
            <div className="notification-group" key={repo}>
              <div className="notification-repo">
                <Octicon name="repo" size={14} />
                <a href={`#/${repo}`}>{repo}</a>
              </div>
              {notes.map((n) => {
                const meta = subjectMeta(n)
                return (
                  <a
                    className={`notification-row ${n.unread ? 'unread' : ''}`}
                    key={n.id}
                    href={meta.href}
                    {...(meta.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                  >
                    <span className={`notification-icon ${n.unread ? 'unread' : ''}`}>
                      <Octicon name={meta.icon} size={16} />
                    </span>
                    <span className="notification-title">{n.subject.title}</span>
                    <span className="notification-reason">{REASONS[n.reason] || n.reason}</span>
                    <span className="notification-time">{timeAgo(n.updated_at)}</span>
                    {n.unread && <span className="notification-dot" />}
                  </a>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {!state.loading && grouped.length === 0 && (
        <div className="card blankslate-wrap">
          <div className="blankslate notifications-empty">
            <span className="notifications-check"><Octicon name="check" size={32} /></span>
            <h3>全部处理完了！</h3>
            <p>{tab === 'unread' ? '没有未读通知。' : '当前没有通知。'}</p>
          </div>
        </div>
      )}
    </div>
  )
}
