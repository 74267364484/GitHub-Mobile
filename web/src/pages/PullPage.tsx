import { useMemo, useState } from 'react'
import type { IssueComment, PRFile, PullRequest, Repository, GitCommit } from '../types'
import { useApi, useDocumentTitle } from '../lib/hooks'
import { useApp } from '../state/AppState'
import { gh, invalidateCache, openExternal } from '../lib/api'
import { Octicon } from '../components/Octicon'
import { Avatar } from '../components/Avatar'
import { Markdown } from '../components/Markdown'
import { TimelineCard } from './IssuePage'
import { FileDiff } from '../components/DiffView'
import { Button, ButtonLink, Dropdown, EmptyState, LabelPill, Skeleton, StateBadge } from '../components/ui'
import { NotFoundPage } from './NotFoundPage'
import { formatBytes, timeAgo, firstLine } from '../lib/format'
import { repoHref } from '../lib/router'

type Tab = 'conversation' | 'commits' | 'checks' | 'files'

export function PullPage({
  repo, owner, repoName, number,
}: {
  repo: Repository
  owner: string
  repoName: string
  number: number
}) {
  const full = `${owner}/${repoName}`
  const prState = useApi<PullRequest>(`/repos/${full}/pulls/${number}`)
  const pr = prState.data
  const commentsState = useApi<IssueComment[]>(pr ? `/repos/${full}/issues/${number}/comments?per_page=100` : null)
  const [tab, setTab] = useState<Tab>('conversation')
  const filesState = useApi<PRFile[]>(tab === 'files' ? `/repos/${full}/pulls/${number}/files?per_page=100` : null)
  const commitsState = useApi<GitCommit[]>(tab === 'commits' ? `/repos/${full}/pulls/${number}/commits?per_page=100` : null)
  const { config, showToast, user } = useApp()
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useDocumentTitle(pr ? `${pr.title} · Pull request #${pr.number}` : '拉取请求')

  const participants = useMemo(() => {
    const map = new Map<string, { login: string; avatar_url?: string }>()
    if (pr?.user) map.set(pr.user.login, pr.user)
    for (const c of commentsState.data || []) if (c.user) map.set(c.user.login, c.user)
    return Array.from(map.values())
  }, [pr, commentsState.data])

  const canWrite = Boolean(config?.hasToken)
  const branch = repo.default_branch

  if (prState.error) return <NotFoundPage title="拉取请求不存在" />
  if (prState.loading || !pr) {
    return (
      <div className="issue-detail">
        <Skeleton width="60%" height={32} />
        <div className="issue-detail-meta"><Skeleton width={240} height={16} /></div>
        <div className="issue-detail-layout">
          <div className="issue-main-col"><Skeleton height={220} /></div>
          <div className="issue-side"><Skeleton height={160} /></div>
        </div>
      </div>
    )
  }

  const merged = Boolean(pr.merged_at)
  const files = filesState.data || []
  const commits = commitsState.data || []

  const submitComment = async () => {
    if (!body.trim()) return
    setSubmitting(true)
    try {
      await gh(`/repos/${full}/issues/${number}/comments`, { method: 'POST', body: { body } })
      invalidateCache()
      setBody('')
      commentsState.reload()
      showToast('评论已发布', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '评论失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const merge = () => openExternal(`https://github.com/${full}/pull/${number}`)

  return (
    <div className="issue-detail pull-detail">
      <div className="issue-title-block">
        <h1 className="issue-detail-title">
          {pr.title} <span className="issue-detail-number">#{pr.number}</span>
        </h1>
        <div className="issue-detail-sub">
          <StateBadge state={pr.state} merged={merged} draft={pr.draft} />
          <span className="issue-detail-meta-text">
            <a href={`#/user/${pr.user?.login}`}>{pr.user?.login}</a>{' '}
            {merged ? '已合并' : '想要合并'} {pr.commits ?? commits.length ?? 0} 个提交{' '}
            {pr.base?.ref && (
              <>
                合并到 <code className="ref-name">{pr.base.ref}</code>，来自 <code className="ref-name">{pr.head?.ref}</code>
              </>
            )}
            {' '}· {timeAgo(pr.created_at)}
          </span>
          <span className="issue-detail-spacer" />
          <ButtonLink href={`https://github.com/${full}/pull/${pr.number}`} external size="sm" icon="pencil">编辑</ButtonLink>
          <Dropdown width={220} trigger={<Button size="sm" icon="kebab-horizontal" aria-label="拉取请求操作" />}>
            {(close) => (
              <>
                <button className="dropdown-item" onClick={() => { close(); openExternal(`https://github.com/${full}/pull/${pr.number}`) }}>
                  <Octicon name="link-external" size={16} /> 在 GitHub 打开
                </button>
                <a className="dropdown-item" href={`#${repoHref(owner, repoName, `/pulls/${pr.number}`)}`} onClick={close}>
                  <Octicon name="link" size={16} /> 复制链接
                </a>
              </>
            )}
          </Dropdown>
        </div>
      </div>

      <div className="pr-tabs">
        <button className={tab === 'conversation' ? 'active' : ''} onClick={() => setTab('conversation')}>
          <Octicon name="comment-discussion" size={16} /> 会话
        </button>
        <button className={tab === 'commits' ? 'active' : ''} onClick={() => setTab('commits')}>
          <Octicon name="git-commit" size={16} /> 提交 <span className="Counter">{pr.commits ?? '—'}</span>
        </button>
        <button className={tab === 'checks' ? 'active' : ''} onClick={() => setTab('checks')}>
          <Octicon name="check-circle-fill" size={16} /> 检查
        </button>
        <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>
          <Octicon name="file-diff" size={16} /> 文件变更 <span className="Counter">{pr.changed_files ?? '—'}</span>
        </button>
      </div>

      <div className={`issue-detail-layout ${tab === 'files' ? 'issue-detail-layout-wide' : ''}`}>
        <div className="issue-main-col">
          {tab === 'conversation' && (
            <>
              <div className="timeline-list">
                <TimelineCard
                  author={pr.user}
                  createdAt={pr.created_at}
                  body={pr.body}
                  owner={owner}
                  repo={repoName}
                  branch={branch}
                  isIssueBody
                  bodyLabel="打开了此拉取请求"
                />
                {commentsState.data?.map((c) => (
                  <TimelineCard key={c.id} author={c.user} createdAt={c.created_at} body={c.body} owner={owner} repo={repoName} branch={branch} />
                ))}
              </div>

              <div className="comment-box">
                <div className="comment-tabs"><button className="active">编写</button><button>预览</button></div>
                {!canWrite && (
                  <div className="readonly-note">
                    <Octicon name="info" size={16} /> 演示模式 / 未登录，评论已锁定。<a href="#/settings">连接 GitHub</a>
                  </div>
                )}
                <textarea
                  className="comment-textarea"
                  placeholder="留下评论"
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={!canWrite}
                />
                <div className="comment-box-foot">
                  <span className="comment-hint">支持 Markdown</span>
                  <span className="comment-foot-spacer" />
                  <Button size="sm" onClick={() => openExternal(`https://github.com/${full}/pull/${pr.number}`)}>关闭拉取请求</Button>
                  <Button size="sm" variant="primary" disabled={!canWrite || !body.trim() || submitting} onClick={submitComment}>
                    {submitting ? '评论中…' : '评论'}
                  </Button>
                </div>
              </div>

              {pr.state === 'open' && (
                <div className={`merge-box ${pr.draft ? 'merge-box-draft' : ''}`}>
                  <div className="merge-box-main">
                    <span className="merge-box-icon"><Octicon name="git-merge" size={24} /></span>
                    <div>
                      <div className="merge-box-title">
                        {pr.mergeable === false ? '此分支存在冲突，需要先解决' : '此分支与目标分支没有冲突'}
                      </div>
                      <div className="merge-box-sub">
                        {pr.draft
                          ? '此拉取请求仍是草稿。标记为可审查后才能合并。'
                          : '可以自动合并，前往 GitHub 完成操作。'}
                      </div>
                    </div>
                  </div>
                  <div className="merge-box-actions">
                    <Button variant="primary" icon="git-merge" onClick={merge} disabled={pr.mergeable === false}>
                      合并拉取请求
                    </Button>
                  </div>
                </div>
              )}
              {merged && (
                <div className="merge-box merge-box-merged">
                  <div className="merge-box-main">
                    <span className="merge-box-icon"><Octicon name="git-merge" size={24} /></span>
                    <div>
                      <div className="merge-box-title">拉取请求已成功合并并关闭</div>
                      <div className="merge-box-sub">可以安全删除此分支。</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'commits' && (
            <div className="card commit-list-card">
              {commitsState.loading && <div className="pad"><Skeleton height={40} /><Skeleton height={40} /></div>}
              {commits.map((c) => (
                <div className="commit-row" key={c.sha}>
                  <Avatar user={c.author || undefined} login={c.commit.author?.name} size={24} />
                  <div className="commit-main">
                    <a className="commit-msg" href={`https://github.com/${full}/commit/${c.sha}`} target="_blank" rel="noreferrer">
                      {firstLine(c.commit.message, 100)}
                    </a>
                    <div className="commit-meta">
                      {c.author?.login || c.commit.author?.name} · {timeAgo(c.commit.author?.date)}
                    </div>
                  </div>
                  <code className="commit-sha">{c.sha.slice(0, 7)}</code>
                </div>
              ))}
              {!commitsState.loading && commits.length === 0 && (
                <EmptyState icon="git-commit" title="没有找到提交" />
              )}
            </div>
          )}

          {tab === 'checks' && (
            <div className="card blankslate-wrap">
              <EmptyState icon="check-circle-fill" title="此拉取请求没有检查结果">
                <p>状态检查由 GitHub Actions 配置，请前往 GitHub 查看详情。</p>
                <ButtonLink href={`https://github.com/${full}/pull/${pr.number}/checks`} external icon="link-external">
                  View checks on GitHub
                </ButtonLink>
              </EmptyState>
            </div>
          )}

          {tab === 'files' && (
            <div className="files-changed">
              {filesState.loading && <div className="card pad"><Skeleton height={160} /></div>}
              {!filesState.loading && files.length > 0 && (
                <>
                  <div className="files-summary">
                    <span>{files.length} 个文件变更</span>
                    <span className="diff-add">+{files.reduce((a, f) => a + f.additions, 0)}</span>
                    <span className="diff-del">−{files.reduce((a, f) => a + f.deletions, 0)}</span>
                  </div>
                  {files.map((f) => (
                    <FileDiff key={f.filename} file={f} owner={owner} repo={repoName} branch={pr.head?.ref || branch} />
                  ))}
                </>
              )}
              {!filesState.loading && files.length === 0 && (
                <div className="card blankslate-wrap"><EmptyState icon="file-diff" title="没有文件变更" /></div>
              )}
            </div>
          )}
        </div>

        <aside className="issue-side">
          <div className="side-section">
            <div className="side-section-head"><h3>审查者</h3><a href={`https://github.com/${full}/pull/${pr.number}`} target="_blank" rel="noreferrer"><Octicon name="gear" size={14} /></a></div>
            <span className="side-empty">暂无审查</span>
          </div>
          <div className="side-section">
            <div className="side-section-head"><h3>负责人</h3><a href={`https://github.com/${full}/pull/${pr.number}`} target="_blank" rel="noreferrer"><Octicon name="gear" size={14} /></a></div>
            {(pr.assignees || []).length > 0 ? (
              <div className="side-people">
                {pr.assignees!.map((a) => <a key={a.login} href={`#/user/${a.login}`} className="side-person"><Avatar user={a} size={20} /> {a.login}</a>)}
              </div>
            ) : <span className="side-empty">未分配</span>}
          </div>
          <div className="side-section">
            <div className="side-section-head"><h3>标签</h3><a href={`https://github.com/${full}/labels`} target="_blank" rel="noreferrer"><Octicon name="gear" size={14} /></a></div>
            <div className="side-labels">
              {(pr.labels || []).length ? pr.labels.map((l) => <LabelPill key={l.id || l.name} name={l.name} color={l.color} />) : <span className="side-empty">暂无</span>}
            </div>
          </div>
          <div className="side-section">
            <div className="side-section-head"><h3>参与者</h3></div>
            <div className="side-people">
              {participants.map((p) => <a key={p.login} href={`#/user/${p.login}`} title={p.login}><Avatar user={p as any} size={24} /></a>)}
            </div>
          </div>
          {pr.additions != null && (
            <div className="side-section">
              <div className="side-section-head"><h3>变更</h3></div>
              <div className="side-stats">
                <span className="diff-add">+{pr.additions}</span>
                <span className="diff-del">−{pr.deletions}</span>
                <span>{pr.changed_files} files</span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
