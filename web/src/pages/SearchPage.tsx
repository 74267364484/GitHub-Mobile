import { useEffect, useState } from 'react'
import type React from 'react'
import type { GitHubUser, Issue, Repository } from '../types'
import { useApi, useDocumentTitle } from '../lib/hooks'
import { useRoute, navigate } from '../lib/router'
import { Octicon } from '../components/Octicon'
import { Avatar } from '../components/Avatar'
import { Button, Counter, EmptyState, LabelPill, Skeleton } from '../components/ui'
import { compact, languageColor, timeAgo } from '../lib/format'
import { repoFromUrl } from '../lib/api'

const TYPES = [
  { id: 'repositories', label: '仓库' },
  { id: 'users', label: '用户' },
  { id: 'issues', label: '议题' },
]

export function SearchPage() {
  const route = useRoute()
  const q = route.kind === 'search' ? route.q : ''
  const type = route.kind === 'search' ? route.type : 'repositories'
  const [input, setInput] = useState(q)
  const [page, setPage] = useState(1)
  useDocumentTitle(q ? `搜索 · ${q}` : '搜索')

  useEffect(() => {
    setInput(q)
    setPage(1)
  }, [q, type])

  const repoResults = useApi<{ total_count: number; items: Repository[] }>(
    q && type === 'repositories' ? `/search/repositories?q=${encodeURIComponent(q)}&per_page=20&page=${page}` : null,
  )
  const userResults = useApi<{ total_count: number; items: GitHubUser[] }>(
    q && type === 'users' ? `/search/users?q=${encodeURIComponent(q)}&per_page=20&page=${page}` : null,
  )
  const issueResults = useApi<{ total_count: number; items: Issue[] }>(
    q && type === 'issues' ? `/search/issues?q=${encodeURIComponent(q)}&per_page=20&page=${page}` : null,
  )

  const loading = repoResults.loading || userResults.loading || issueResults.loading
  const error = repoResults.error || userResults.error || issueResults.error
  const total = repoResults.data?.total_count ?? userResults.data?.total_count ?? issueResults.data?.total_count ?? 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    navigate(`/search?q=${encodeURIComponent(input.trim())}&type=${type}`)
  }

  return (
    <div className="search-page">
      <div className="search-page-head">
        <h1>搜索</h1>
        <form className="search-page-form" onSubmit={submit}>
          <Octicon name="search" size={16} />
          <input
            className="form-input"
            placeholder="搜索 GitHub"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
          <Button variant="primary" size="sm" type="submit">搜索</Button>
        </form>
      </div>

      <div className="global-tabs search-type-tabs">
        {TYPES.map((t) => (
          <button
            key={t.id}
            className={type === t.id ? 'active' : ''}
            onClick={() => navigate(`/search?q=${encodeURIComponent(q)}&type=${t.id}`)}
          >
            {t.label}
            {t.id === type && total > 0 && <Counter>{compact(total)}</Counter>}
          </button>
        ))}
      </div>

      {q && !loading && !error && (
        <div className="search-count">
          {total.toLocaleString()} 个结果，关键词 <strong>“{q}”</strong>
        </div>
      )}

      {loading && (
        <div className="card pad">
          <Skeleton height={60} /><Skeleton height={60} /><Skeleton height={60} />
        </div>
      )}

      {error && (
        <div className="card blankslate-wrap">
          <EmptyState icon="alert" title="搜索失败">
            <p>{error.message}</p>
            <p className="muted">GitHub Search API 有独立的限流；稍后重试或连接令牌。</p>
          </EmptyState>
        </div>
      )}

      {!loading && !error && type === 'repositories' && (repoResults.data?.items || []).length > 0 && (
        <div className="search-results">
          {(repoResults.data?.items || []).map((r) => (
            <div className="search-result card" key={r.id}>
              <div className="search-result-head">
                <Octicon name="repo" size={16} />
                <a className="search-result-title" href={`#/${r.owner.login}/${r.name}`}>{r.full_name}</a>
                <span className={`repo-visibility ${r.private ? 'private' : ''}`}>{r.private ? '私有' : '公开'}</span>
                <span className="search-result-stars"><Octicon name="star" size={12} /> {compact(r.stargazers_count)}</span>
              </div>
              {r.description && <p className="search-result-desc">{r.description}</p>}
              {(r.topics || []).length > 0 && (
                <div className="about-topics">
                  {r.topics!.slice(0, 6).map((t) => (
                    <a className="topic-tag" key={t} href={`#/search?q=${encodeURIComponent(`topic:${t}`)}&type=repositories`}>{t}</a>
                  ))}
                </div>
              )}
              <div className="search-result-meta">
                {r.language && <span><i className="lang-dot" style={{ background: languageColor(r.language) }} />{r.language}</span>}
                <span>更新于 {timeAgo(r.updated_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && type === 'users' && (userResults.data?.items || []).length > 0 && (
        <div className="search-results">
          {(userResults.data?.items || []).map((u) => (
            <div className="search-result search-user-result card" key={u.id}>
              <Avatar user={u} size={48} />
              <div className="search-user-main">
                <a className="search-result-title" href={`#/user/${u.login}`}>{u.login}</a>
                <span className="search-user-type">{u.type === 'Organization' ? '组织' : '用户'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && type === 'issues' && (issueResults.data?.items || []).length > 0 && (
        <div className="search-results">
          {(issueResults.data?.items || []).map((i) => {
            const full = repoFromUrl(i.repository_url) || ''
            const isPR = Boolean(i.pull_request)
            return (
              <div className="search-result search-issue-result card" key={i.id}>
                <span className={`issue-icon ${isPR ? 'issue-icon-pr' : i.state === 'closed' ? 'issue-icon-closed' : 'issue-icon-open'}`}>
                  <Octicon name={isPR ? 'git-pull-request' : i.state === 'closed' ? 'issue-closed' : 'issue-opened'} size={16} />
                </span>
                <div className="search-issue-main">
                  <a className="search-result-title" href={full ? `#/${full}/${isPR ? 'pulls' : 'issues'}/${i.number}` : i.html_url} target={full ? undefined : '_blank'} rel="noreferrer">
                    {i.title}
                  </a>
                  <div className="search-result-meta">
                    <span>{full}</span>
                    <span>#{i.number}</span>
                    <span>{timeAgo(i.created_at)} 打开</span>
                    {i.comments > 0 && <span><Octicon name="comment" size={12} /> {i.comments}</span>}
                  </div>
                  {(i.labels || []).length > 0 && (
                    <div className="issue-labels">
                      {i.labels.map((l) => <LabelPill key={l.id || l.name} name={l.name} color={l.color} />)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && !error && q && total === 0 && (
        <div className="card blankslate-wrap">
          <EmptyState icon="search" title="没有结果">
            <p>没有找到“{q}”的结果，换个关键词试试。</p>
          </EmptyState>
        </div>
      )}

      {!loading && !error && q && (
        <div className="pagination">
          {page > 1 && <Button size="sm" icon="arrow-left" onClick={() => setPage((p) => p - 1)}>上一页</Button>}
          <span className="pagination-info">第 {page} 页</span>
          {total > page * 20 && <Button size="sm" onClick={() => setPage((p) => p + 1)}>下一页 <Octicon name="arrow-right" size={14} /></Button>}
        </div>
      )}
    </div>
  )
}
