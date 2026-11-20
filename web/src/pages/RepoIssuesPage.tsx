import { useMemo, useState } from 'react'
import type { Issue, IssueLabel, Repository } from '../types'
import { useApi } from '../lib/hooks'
import { IssueRow } from '../components/IssueRow'
import { Octicon } from '../components/Octicon'
import { Button, ButtonLink, Counter, EmptyState, Skeleton } from '../components/ui'
import { repoHref } from '../lib/router'

export function RepoIssuesPage({
  repo, owner, repoName, openCount,
}: {
  repo: Repository
  owner: string
  repoName: string
  openCount?: number | null
}) {
  const full = `${owner}/${repoName}`
  const [state, setState] = useState<'open' | 'closed'>('open')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [author, setAuthor] = useState('')
  const [label, setLabel] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'comments' | 'updated'>('newest')

  const issuesState = useApi<Issue[]>(`/repos/${full}/issues?state=${state}&per_page=30&page=${page}`)
  const closedCount = useApi<{ total_count: number }>(
    `/search/issues?q=${encodeURIComponent(`repo:${full} type:issue state:closed`)}&per_page=1`,
  )

  const issues = useMemo(() => (issuesState.data || []).filter((i) => !i.pull_request), [issuesState.data])
  const authors = useMemo(() => Array.from(new Set(issues.map((i) => i.user?.login).filter(Boolean))), [issues])
  const labels = useMemo(() => {
    const map = new Map<string, IssueLabel>()
    for (const i of issues) for (const l of i.labels || []) map.set(l.name, l)
    return Array.from(map.values())
  }, [issues])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    let list = issues.filter((i) => {
      if (author && i.user?.login !== author) return false
      if (label && !(i.labels || []).some((l) => l.name === label)) return false
      if (!term) return true
      return i.title.toLowerCase().includes(term) || `#${i.number}`.includes(term) || String(i.number) === term.replace('#', '')
    })
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case 'comments': return b.comments - a.comments
        case 'updated': return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })
    return list
  }, [issues, q, author, label, sort])

  const changeState = (s: 'open' | 'closed') => {
    setState(s)
    setPage(1)
  }

  return (
    <div className="issues-page">
      <div className="list-toolbar">
        <div className="list-toolbar-left">
          <div className="state-tabs">
            <button className={`state-tab ${state === 'open' ? 'active' : ''}`} onClick={() => changeState('open')}>
              <Octicon name="issue-opened" size={16} /> 打开
              {openCount != null && <Counter>{openCount.toLocaleString()}</Counter>}
            </button>
            <button className={`state-tab ${state === 'closed' ? 'active' : ''}`} onClick={() => changeState('closed')}>
              <Octicon name="issue-closed" size={16} /> 已关闭
              {closedCount.data?.total_count != null && <Counter>{closedCount.data.total_count.toLocaleString()}</Counter>}
            </button>
          </div>
        </div>
        <div className="list-toolbar-right">
          <ButtonLink href={`https://github.com/${full}/issues/new/choose`} external variant="primary" size="sm" icon="plus">
            新建议题
          </ButtonLink>
        </div>
      </div>

      <div className="list-filters">
        <div className="list-search">
          <Octicon name="search" size={16} />
          <input
            className="form-input"
            placeholder="搜索所有议题"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="list-filter-selects">
          <select className="form-select" value={author} onChange={(e) => setAuthor(e.target.value)} aria-label="作者">
            <option value="">作者</option>
            {authors.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="form-select" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="标签">
            <option value="">标签</option>
            {labels.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
          </select>
          <select className="form-select" value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="排序">
            <option value="newest">最新</option>
            <option value="oldest">最早</option>
            <option value="comments">评论最多</option>
            <option value="updated">最近更新</option>
          </select>
        </div>
      </div>

      {issuesState.loading && (
        <div className="issue-list card">
          {[0, 1, 2, 3].map((i) => (
            <div className="issue-row" key={i}>
              <Skeleton width={16} circle height={16} />
              <div className="issue-main"><Skeleton width="55%" /><Skeleton width="35%" height={12} /></div>
            </div>
          ))}
        </div>
      )}

      {!issuesState.loading && filtered.length > 0 && (
        <>
          <ul className="issue-list card">
            {filtered.map((issue) => (
              <IssueRow key={issue.id} item={issue} owner={owner} repo={repoName} />
            ))}
          </ul>
          <div className="pagination">
            {page > 1 && (
              <Button size="sm" icon="arrow-left" onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</Button>
            )}
            <span className="pagination-info">第 {page} 页</span>
            {(issuesState.data?.length || 0) >= 30 && (
              <Button size="sm" onClick={() => setPage((p) => p + 1)}>下一页 <Octicon name="arrow-right" size={14} /></Button>
            )}
          </div>
        </>
      )}

      {!issuesState.loading && filtered.length === 0 && (
        <div className="card blankslate-wrap">
          {state === 'open' ? (
            <EmptyState
              icon="issue-opened"
              title="欢迎使用议题！"
              action={
                <ButtonLink href={`https://github.com/${full}/issues/new/choose`} external variant="primary" icon="plus">
                  新建议题
                </ButtonLink>
              }
            >
              <p>议题用于跟踪待办、Bug、功能请求等。创建后会出现在这里，并支持搜索与筛选。</p>
              <div className="empty-checklist">
                <span><Octicon name="checklist" size={16} /> 跟踪 Bug 与功能请求</span>
                <span><Octicon name="people" size={16} /> 把议题分配给协作者</span>
                <span><Octicon name="tag" size={16} /> 用标签和里程碑整理</span>
              </div>
            </EmptyState>
          ) : (
            <EmptyState icon="issue-closed" title="没有已关闭的议题">
              <p>已关闭的议题会显示在这里。<a href={`#${repoHref(owner, repoName, '/issues')}`} onClick={(e) => { e.preventDefault(); changeState('open') }}>返回打开的议题</a></p>
            </EmptyState>
          )}
        </div>
      )}
    </div>
  )
}
