import { useMemo, useState } from 'react'
import type { Issue, PullRequest } from '../types'
import { useApi, useDocumentTitle } from '../lib/hooks'
import { IssueRow } from '../components/IssueRow'
import { Octicon } from '../components/Octicon'
import { Button, Counter, EmptyState, Skeleton } from '../components/ui'
import { repoFromUrl } from '../lib/api'
import { repoOwnerName } from '../lib/api'

const FILTERS = [
  { id: 'created', label: '我创建的' },
  { id: 'assigned', label: '分配给我的' },
  { id: 'mentioned', label: '提到我的' },
  { id: 'all', label: '全部' },
]

export function GlobalIssuesPage({ mode }: { mode: 'issues' | 'pulls' }) {
  const [filter, setFilter] = useState('created')
  const [state, setState] = useState<'open' | 'closed'>('open')
  const [q, setQ] = useState('')
  useDocumentTitle(mode === 'issues' ? '议题' : '拉取请求')

  const listState = useApi<Issue[]>(`/issues?filter=${filter}&state=${state}&per_page=50`)

  const items = useMemo(() => {
    const list = (listState.data || []).filter((i) => (mode === 'pulls' ? Boolean(i.pull_request) : !i.pull_request))
    if (!q.trim()) return list
    const term = q.trim().toLowerCase()
    return list.filter((i) => i.title.toLowerCase().includes(term) || String(i.number).includes(term))
  }, [listState.data, mode, q])

  return (
    <div className="global-issues">
      <div className="page-heading">
        <h1>{mode === 'issues' ? '议题' : '拉取请求'}</h1>
        <div className="state-tabs">
          <button className={`state-tab ${state === 'open' ? 'active' : ''}`} onClick={() => setState('open')}>
            <Octicon name={mode === 'pulls' ? 'git-pull-request' : 'issue-opened'} size={16} /> 打开
          </button>
          <button className={`state-tab ${state === 'closed' ? 'active' : ''}`} onClick={() => setState('closed')}>
            <Octicon name={mode === 'pulls' ? 'git-pull-request-closed' : 'issue-closed'} size={16} /> 已关闭
          </button>
        </div>
      </div>

      <div className="global-tabs">
        {FILTERS.map((f) => (
          <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="list-filters">
        <div className="list-search">
          <Octicon name="search" size={16} />
          <input
            className="form-input"
            placeholder={mode === 'pulls' ? '搜索所有拉取请求' : '搜索所有议题'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {listState.loading && (
        <div className="issue-list card">
          {[0, 1, 2, 3].map((i) => (
            <div className="issue-row" key={i}>
              <Skeleton width={16} circle height={16} />
              <div className="issue-main"><Skeleton width="50%" /><Skeleton width="30%" height={12} /></div>
            </div>
          ))}
        </div>
      )}

      {!listState.loading && items.length > 0 && (
        <ul className="issue-list card">
          {items.map((item) => {
            const full = repoFromUrl(item.repository_url)
            const [owner, repo] = repoOwnerName(full)
            return (
              <IssueRow
                key={item.id}
                item={item as PullRequest}
                owner={owner}
                repo={repo}
                kind={mode === 'pulls' ? 'pull' : 'issue'}
                showRepo
                repoFullName={full}
              />
            )
          })}
        </ul>
      )}

      {!listState.loading && items.length === 0 && (
        <div className="card blankslate-wrap">
          <EmptyState
            icon={mode === 'pulls' ? 'git-pull-request' : 'issue-opened'}
            title={mode === 'pulls' ? '没有找到拉取请求' : '没有找到议题'}
          >
            <p>
              {state === 'open'
                ? `没有符合筛选条件的${mode === 'pulls' ? '拉取请求' : '议题'}。`
                : `没有符合筛选条件的已关闭${mode === 'pulls' ? '拉取请求' : '议题'}。`}
            </p>
          </EmptyState>
        </div>
      )}
    </div>
  )
}
