import { useEffect } from 'react'
import type { Issue, IssueLabel, PullRequest } from '../types'
import { Octicon } from './Octicon'
import { Avatar } from './Avatar'
import { LabelPill } from './ui'
import { timeAgo } from '../lib/format'
import { repoHref } from '../lib/router'

export function IssueRow({
  item, owner, repo, kind, showRepo, repoFullName,
}: {
  item: Issue | PullRequest
  owner: string
  repo: string
  kind?: 'issue' | 'pull'
  showRepo?: boolean
  repoFullName?: string
}) {
  const isPR = kind === 'pull' || Boolean(item.pull_request)
  const merged = Boolean((item as PullRequest).merged_at)
  const href = `#${repoHref(owner, repo, `/${isPR ? 'pulls' : 'issues'}/${item.number}`)}`
  const icon = isPR
    ? merged ? 'git-merge' : item.state === 'closed' ? 'git-pull-request-closed' : 'git-pull-request'
    : item.state === 'closed' ? 'issue-closed' : 'issue-opened'
  const iconClass = merged ? 'issue-icon-merged' : item.state === 'closed' ? 'issue-icon-closed' : isPR ? 'issue-icon-pr' : 'issue-icon-open'
  const labels: IssueLabel[] = item.labels || []

  return (
    <li className="issue-row">
      <span className={`issue-icon ${iconClass}`}>
        <Octicon name={icon} size={16} />
      </span>
      <div className="issue-main">
        <div className="issue-title-line">
          <a className="issue-title" href={href}>{item.title}</a>
          {labels.map((l) => (
            <LabelPill key={l.id || l.name} name={l.name} color={l.color} description={l.description} />
          ))}
        </div>
        <div className="issue-meta">
          {showRepo && repoFullName && (
            <>
              <a className="issue-repo-name" href={`#/${repoFullName}`}>{repoFullName}</a>
              <span className="issue-meta-sep">·</span>
            </>
          )}
          #{item.number} · {item.state === 'closed' ? (isPR && merged ? '已合并' : '已关闭') : '打开'} ·{' '}
          <a href={`#/user/${item.user?.login}`}>{item.user?.login}</a> {timeAgo(item.created_at)}
          {item.comments > 0 && (
            <>
              {' · '}
              <a href={href} className="issue-comments">
                <Octicon name="comment" size={14} /> {item.comments} 条评论
              </a>
            </>
          )}
        </div>
      </div>
      {item.user && <Avatar user={item.user} size={20} className="issue-author-avatar" />}
    </li>
  )
}

export function useRedirectIfPull(issue: Issue | null, owner: string, repo: string) {
  useEffect(() => {
    if (issue?.pull_request) {
      location.hash = `#${repoHref(owner, repo, `/pulls/${issue.number}`)}`
    }
  }, [issue, owner, repo])
}
