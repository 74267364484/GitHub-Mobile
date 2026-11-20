import { useMemo, useState } from 'react'
import type { PullRequest, Repository } from '../types'
import { useApi } from '../lib/hooks'
import { IssueRow } from '../components/IssueRow'
import { Octicon } from '../components/Octicon'
import { Button, ButtonLink, Counter, EmptyState, Skeleton } from '../components/ui'

export function RepoPullsPage({
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
  const [sort, setSort] = useState<'newest' | 'oldest' | 'recent'>('newest')

  const pullsState = useApi<PullRequest[]>(
    `/repos/${full}/pulls?state=${state}&per_page=30&page=${page}&sort=created&direction=desc`,
  )
  const closedCount = useApi<{ total_count: number }>(
    `/search/issues?q=${encodeURIComponent(`repo:${full} type:pr state:closed`)}&per_page=1`,
  )

  const pulls = useMemo(() => pullsState.data || [], [pullsState.data])
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = pulls.filter((p) => !term || p.title.toLowerCase().includes(term) || `#${p.number}`.includes(term))
    return [...list].sort((a, b) => {
      if (sort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sort === 'recent') return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [pulls, q, sort])

  return (
    <div className="issues-page">
      <div className="list-toolbar">
        <div className="list-toolbar-left">
          <div className="state-tabs">
            <button className={`state-tab ${state === 'open' ? 'active' : ''}`} onClick={() => { setState('open'); setPage(1) }}>
              <Octicon name="git-pull-request" size={16} /> 打开
              {openCount != null && <Counter>{openCount.toLocaleString()}</Counter>}
            </button>
            <button className={`state-tab ${state === 'closed' ? 'active' : ''}`} onClick={() => { setState('closed'); setPage(1) }}>
              <Octicon name="git-pull-request-closed" size={16} /> 已关闭
              {closedCount.data?.total_count != null && <Counter>{closedCount.data.total_count.toLocaleString()}</Counter>}
            </button>
          </div>
        </div>
        <div className="list-toolbar-right">
          <ButtonLink href={`https://github.com/${full}/compare`} external variant="primary" size="sm" icon="git-pull-request">
            新建拉取请求
          </ButtonLink>
        </div>
      </div>

      <div className="list-filters">
        <div className="list-search">
          <Octicon name="search" size={16} />
          <input className="form-input" placeholder="搜索所有拉取请求" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="list-filter-selects">
          <select className="form-select" value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="排序">
            <option value="newest">最新</option>
            <option value="oldest">最早</option>
            <option value="recent">最近更新</option>
          </select>
        </div>
      </div>

      {pullsState.loading && (
        <div className="issue-list card">
          {[0, 1, 2].map((i) => (
            <div className="issue-row" key={i}>
              <Skeleton width={16} circle height={16} />
              <div className="issue-main"><Skeleton width="50%" /><Skeleton width="30%" height={12} /></div>
            </div>
          ))}
        </div>
      )}

      {!pullsState.loading && filtered.length > 0 && (
        <>
          <ul className="issue-list card">
            {filtered.map((p) => <IssueRow key={p.id} item={p} owner={owner} repo={repoName} kind="pull" />)}
          </ul>
          <div className="pagination">
            {page > 1 && <Button size="sm" icon="arrow-left" onClick={() => setPage((p) => p - 1)}>上一页</Button>}
            <span className="pagination-info">第 {page} 页</span>
            {pulls.length >= 30 && <Button size="sm" onClick={() => setPage((p) => p + 1)}>下一页 <Octicon name="arrow-right" size={14} /></Button>}
          </div>
        </>
      )}

      {!pullsState.loading && filtered.length === 0 && (
        <div className="card blankslate-wrap">
          {state === 'open' ? (
            <EmptyState
              icon="git-pull-request"
              title="欢迎使用拉取请求！"
              action={
                <ButtonLink href={`https://github.com/${full}/compare`} external variant="primary" icon="git-pull-request">
                  新建拉取请求
                </ButtonLink>
              }
            >
              <p>拉取请求让你和其他人协作修改代码。创建后会出现在这里，并支持搜索与筛选。</p>
              <div className="empty-checklist">
                <span><Octicon name="git-compare" size={16} /> 从分支提出改动</span>
                <span><Octicon name="comment-discussion" size={16} /> 审查代码并讨论</span>
                <span><Octicon name="check-circle-fill" size={16} /> 检查通过后合并</span>
              </div>
            </EmptyState>
          ) : (
            <EmptyState icon="git-pull-request-closed" title="没有已关闭的拉取请求">
              <p>已关闭或已合并的拉取请求会显示在这里。</p>
            </EmptyState>
          )}
        </div>
      )}
    </div>
  )
}
