import { useEffect, useMemo, useState } from 'react'
import type { Issue, IssueComment, Repository } from '../types'
import { useApi, useDocumentTitle } from '../lib/hooks'
import { useApp } from '../state/AppState'
import { gh, invalidateCache } from '../lib/api'
import { copyText } from '../lib/clipboard'
import { Octicon } from '../components/Octicon'
import { IssueDialog } from '../components/WriteDialogs'
import { LabelsDialog, AssigneesDialog, MilestoneDialog } from '../components/IssueMetaDialogs'
import { Avatar } from '../components/Avatar'
import { Markdown } from '../components/Markdown'
import { useRedirectIfPull } from '../components/IssueRow'
import { Button, Dropdown, LabelPill, Skeleton, StateBadge } from '../components/ui'
import { NotFoundPage } from './NotFoundPage'
import { formatDateTime, timeAgo } from '../lib/format'

export function TimelineCard({
  author, createdAt, body, owner, repo, branch, isIssueBody, bodyLabel,
}: {
  author: { login: string; avatar_url?: string; html_url?: string } | null | undefined
  createdAt: string
  body?: string | null
  owner: string
  repo: string
  branch: string
  isIssueBody?: boolean
  bodyLabel?: string
}) {
  return (
    <div className="timeline-item">
      <div className="timeline-avatar">
        <Avatar user={author as any} login={author?.login} size={40} />
      </div>
      <div className="timeline-card-wrap">
        <div className="timeline-card">
          <div className="timeline-card-head">
            <a className="timeline-author" href={`#/user/${author?.login}`}>{author?.login}</a>
            <span className="timeline-meta">
              {isIssueBody ? (bodyLabel || '打开了此议题') : '评论了'} {timeAgo(createdAt)}
            </span>
            <span className="timeline-head-spacer" />
            <span className="timeline-author-badge">作者</span>
            <Dropdown
              width={200}
              trigger={<button className="timeline-kebab" aria-label="评论操作"><Octicon name="kebab-horizontal" size={16} /></button>}
            >
              {(close) => (
                <>
                  <button className="dropdown-item" onClick={async () => { close(); await copyText(location.href); }}>
                    <Octicon name="link" size={16} /> 复制评论链接
                  </button>
                </>
              )}
            </Dropdown>
          </div>
          <div className="timeline-content">
            {body ? (
              <Markdown text={body} owner={owner} repo={repo} branch={branch} />
            ) : (
              <p className="timeline-empty">未提供描述。</p>
            )}
          </div>
          <div className="timeline-card-foot">
            <Octicon name="smiley" size={16} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function IssuePage({
  repo, owner, repoName, number,
}: {
  repo: Repository
  owner: string
  repoName: string
  number: number
}) {
  const full = `${owner}/${repoName}`
  const issueState = useApi<Issue>(`/repos/${full}/issues/${number}`)
  const issue = issueState.data
  const commentsState = useApi<IssueComment[]>(
    issue && !issue.pull_request ? `/repos/${full}/issues/${number}/comments?per_page=100` : null,
  )
  const { config, showToast, user } = useApp()
  const [body, setBody] = useState('')
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [submitting, setSubmitting] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [assigneesOpen, setAssigneesOpen] = useState(false)
  const [milestoneOpen, setMilestoneOpen] = useState(false)

  useRedirectIfPull(issue, owner, repoName)
  useDocumentTitle(issue ? `${issue.title} · #${issue.number}` : '议题')

  const participants = useMemo(() => {
    const map = new Map<string, { login: string; avatar_url?: string }>()
    if (issue?.user) map.set(issue.user.login, issue.user)
    for (const c of commentsState.data || []) if (c.user) map.set(c.user.login, c.user)
    return Array.from(map.values())
  }, [issue, commentsState.data])

  const commenters = commentsState.data || []
  const canWrite = Boolean(config?.hasToken)
  const branch = repo.default_branch

  if (issueState.error) return <NotFoundPage title="议题不存在" />

  const submitComment = async () => {
    if (!body.trim() || !issue) return
    setSubmitting(true)
    try {
      await gh(`/repos/${full}/issues/${issue.number}/comments`, { method: 'POST', body: { body } })
      invalidateCache()
      setBody('')
      setTab('write')
      commentsState.reload()
      issueState.reload()
      showToast('评论已发布', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '评论失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleState = async () => {
    if (!issue) return
    const next = issue.state === 'open' ? 'closed' : 'open'
    try {
      await gh(`/repos/${full}/issues/${issue.number}`, { method: 'PATCH', body: { state: next } })
      invalidateCache()
      issueState.reload()
      showToast(next === 'closed' ? 'Issue 已关闭' : 'Issue 已重新打开', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败', 'error')
    }
  }

  if (issueState.loading || !issue) {
    return (
      <div className="issue-detail">
        <Skeleton width="60%" height={32} />
        <div className="issue-detail-meta"><Skeleton width={220} height={16} /></div>
        <div className="issue-detail-layout">
          <div className="issue-main-col"><Skeleton height={200} /></div>
          <div className="issue-side"><Skeleton height={160} /></div>
        </div>
      </div>
    )
  }

  return (
    <div className="issue-detail">
      <div className="issue-title-block">
        <h1 className="issue-detail-title">
          {issue.title} <span className="issue-detail-number">#{issue.number}</span>
        </h1>
        <div className="issue-detail-sub">
          <StateBadge state={issue.state} />
          <span className="issue-detail-meta-text">
            <a href={`#/user/${issue.user?.login}`}>{issue.user?.login}</a> 于 {timeAgo(issue.created_at)} 打开了此议题 ·{' '}
            {issue.comments} 条评论
          </span>
          <span className="issue-detail-spacer" />
          <Button
            size="sm"
            icon="pencil"
            onClick={() => setEditOpen(true)}
            disabled={!canWrite}
          >
            编辑
          </Button>
          <Dropdown
            width={220}
            trigger={<Button size="sm" icon="kebab-horizontal" aria-label="议题操作" />}
          >
            {(close) => (
              <>
                <button className="dropdown-item" onClick={async () => { close(); await copyText(location.href) }}>
                  <Octicon name="link" size={16} /> 复制链接
                </button>
                <button className="dropdown-item" onClick={() => { close(); setQuoteOpen(true) }}>
                  <Octicon name="comment" size={16} /> 引用到新议题
                </button>
              </>
            )}
          </Dropdown>
        </div>
      </div>

      <div className="issue-detail-layout">
        <div className="issue-main-col">
          <div className="timeline-list">
            <TimelineCard
              author={issue.user}
              createdAt={issue.created_at}
              body={issue.body}
              owner={owner}
              repo={repoName}
              branch={branch}
              isIssueBody
            />
            {commentsState.data?.map((c) => (
              <TimelineCard
                key={c.id}
                author={c.user}
                createdAt={c.created_at}
                body={c.body}
                owner={owner}
                repo={repoName}
                branch={branch}
              />
            ))}
            {commentsState.loading && <div className="timeline-loading"><Skeleton height={90} /></div>}
          </div>

          <div className="comment-box">
            <div className="comment-box-head">
              <span className="comment-box-avatar">
                {user ? <Avatar user={user} size={28} /> : <Octicon name="person" size={20} />}
              </span>
              <div className="comment-tabs">
                <button className={tab === 'write' ? 'active' : ''} onClick={() => setTab('write')}>编写</button>
                <button className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}>预览</button>
              </div>
            </div>
            {!canWrite && (
              <div className="readonly-note">
                <Octicon name="info" size={16} />
                <span>当前为演示模式 / 未登录，评论功能已锁定。</span>
                <a href="#/settings">连接 GitHub</a>
              </div>
            )}
            {tab === 'write' ? (
              <textarea
                className="comment-textarea"
                placeholder="留下评论"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={!canWrite}
                rows={5}
              />
            ) : (
              <div className="comment-preview">
                {body ? <Markdown text={body} owner={owner} repo={repoName} branch={branch} /> : <span className="comment-preview-empty">暂无可预览内容</span>}
              </div>
            )}
            <div className="comment-box-foot">
              <span className="comment-hint">支持 Markdown</span>
              <span className="comment-foot-spacer" />
              <Button
                size="sm"
                onClick={toggleState}
                disabled={!canWrite}
              >
                {issue.state === 'open' ? '关闭议题' : '重新打开'}
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={submitComment}
                disabled={!canWrite || !body.trim() || submitting}
              >
                {submitting ? '评论中…' : '评论'}
              </Button>
            </div>
          </div>
        </div>

        <aside className="issue-side">
          <div className="side-section">
            <div className="side-section-head">
              <h3>标签</h3>
              <button className="side-gear" onClick={() => setLabelsOpen(true)} aria-label="编辑标签"><Octicon name="gear" size={14} /></button>
            </div>
            <div className="side-labels">
              {(issue.labels || []).length > 0
                ? issue.labels.map((l) => <LabelPill key={l.id || l.name} name={l.name} color={l.color} description={l.description} />)
                : <span className="side-empty">暂无</span>}
            </div>
          </div>

          <div className="side-section">
            <div className="side-section-head">
              <h3>负责人</h3>
              <button className="side-gear" onClick={() => setAssigneesOpen(true)} aria-label="编辑负责人"><Octicon name="gear" size={14} /></button>
            </div>
            {(issue.assignees || []).length > 0 ? (
              <div className="side-people">
                {issue.assignees!.map((a) => (
                  <a key={a.login} href={`#/user/${a.login}`} className="side-person"><Avatar user={a} size={20} /> {a.login}</a>
                ))}
              </div>
            ) : <span className="side-empty">未分配</span>}
          </div>

          <div className="side-section">
            <div className="side-section-head">
              <h3>里程碑</h3>
              <button className="side-gear" onClick={() => setMilestoneOpen(true)} aria-label="编辑里程碑"><Octicon name="gear" size={14} /></button>
            </div>
            {issue.milestone ? <span className="side-value">{issue.milestone.title}</span> : <span className="side-empty">暂无里程碑</span>}
          </div>

          <div className="side-section">
            <div className="side-section-head"><h3>参与者</h3></div>
            <div className="side-people">
              {participants.map((p) => (
                <a key={p.login} href={`#/user/${p.login}`} title={p.login}>
                  <Avatar user={p as any} size={24} />
                </a>
              ))}
            </div>
          </div>

          <div className="side-section side-section-meta">
            <span><Octicon name="calendar" size={14} /> 创建于 {formatDateTime(issue.created_at)}</span>
            <span><Octicon name="clock" size={14} /> 更新于 {formatDateTime(issue.updated_at)}</span>
          </div>
        </aside>
      </div>

      {editOpen && (
        <IssueDialog
          repo={full}
          mode="edit"
          issue={issue}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false)
            issueState.reload()
            invalidateCache()
            showToast('议题已更新', 'success')
          }}
        />
      )}

      {quoteOpen && (
        <IssueDialog
          repo={full}
          mode="create"
          initialTitle={`引用 #${issue.number}：${issue.title}`}
          initialBody={`> 引用自 #${issue.number}\n\n`}
          onClose={() => setQuoteOpen(false)}
          onSaved={() => {
            setQuoteOpen(false)
            invalidateCache()
            showToast('已创建引用议题', 'success')
          }}
        />
      )}

      {labelsOpen && (
        <LabelsDialog
          full={full}
          number={issue.number}
          current={issue.labels || []}
          onClose={() => setLabelsOpen(false)}
          onSaved={() => { issueState.reload(); showToast('标签已更新', 'success') }}
        />
      )}

      {assigneesOpen && (
        <AssigneesDialog
          full={full}
          number={issue.number}
          current={issue.assignees || []}
          onClose={() => setAssigneesOpen(false)}
          onSaved={() => { issueState.reload(); showToast('负责人已更新', 'success') }}
        />
      )}

      {milestoneOpen && (
        <MilestoneDialog
          full={full}
          number={issue.number}
          current={issue.milestone?.number ?? null}
          onClose={() => setMilestoneOpen(false)}
          onSaved={() => { issueState.reload(); showToast('里程碑已更新', 'success') }}
        />
      )}
    </div>
  )
}
