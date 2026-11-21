import { useMemo, useState } from 'react'
import { useApp } from '../state/AppState'
import { useDocumentTitle } from '../lib/hooks'
import { Octicon } from '../components/Octicon'
import { Button, EmptyState } from '../components/ui'
import { NewRepoDialog } from '../components/WriteDialogs'
import { useQuery, navigate } from '../lib/router'
import { compact, languageColor, timeAgo } from '../lib/format'

export function RepositoriesPage() {
  const { repos, user, config, showToast, reload } = useApp()
  const qs = useQuery()
  useDocumentTitle('仓库')
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [language, setLanguage] = useState('all')
  const [sort, setSort] = useState('updated')
  const [newOpen, setNewOpen] = useState(qs.get('new') === '1')

  const openCreate = () => {
    if (!config?.hasToken) {
      showToast('登录 GitHub 后才能新建仓库', 'info')
      navigate('/settings')
      return
    }
    setNewOpen(true)
  }

  const languages = useMemo(
    () => Array.from(new Set(repos.map((r) => r.language).filter(Boolean))) as string[],
    [repos],
  )

  const filtered = useMemo(() => {
    let list = repos.filter((r) => {
      if (q && !`${r.full_name} ${r.description || ''}`.toLowerCase().includes(q.toLowerCase())) return false
      if (type === 'public' && r.private) return false
      if (type === 'private' && !r.private) return false
      if (type === 'archived' && !r.archived) return false
      if (language !== 'all' && r.language !== language) return false
      return true
    })
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'stars') return b.stargazers_count - a.stargazers_count
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
    return list
  }, [repos, q, type, language, sort])

  const privateCount = repos.filter((r) => r.private).length
  const publicCount = repos.length - privateCount

  return (
    <div className="repos-page">
      <div className="page-heading">
        <h1>仓库 <span className="page-count">{repos.length}</span></h1>
        <Button variant="primary" size="sm" icon="repo" onClick={openCreate}>
          新建仓库
        </Button>
      </div>

      <div className="repo-filters">
        <div className="list-search">
          <Octicon name="search" size={16} />
          <input className="form-input" placeholder="查找仓库…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="list-filter-selects">
          <select className="form-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="类型">
            <option value="all">全部（{repos.length}）</option>
            <option value="public">公开（{publicCount}）</option>
            <option value="private">私有（{privateCount}）</option>
            <option value="archived">已归档</option>
          </select>
          <select className="form-select" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="语言">
            <option value="all">语言</option>
            {languages.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select className="form-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="排序">
            <option value="updated">最近更新</option>
            <option value="name">名称</option>
            <option value="stars">星标数</option>
          </select>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="repo-list card">
          {filtered.map((r) => (
            <div className="repo-list-item" key={r.id}>
              <div className="repo-list-title">
                <Octicon name={r.private ? 'lock' : 'repo'} size={16} className="repo-list-icon" />
                <a className="repo-list-name" href={`#/${r.owner.login}/${r.name}`}>{r.full_name}</a>
                <span className={`repo-visibility ${r.private ? 'private' : ''}`}>{r.private ? '私有' : '公开'}</span>
                {r.archived && <span className="repo-visibility">已归档</span>}
              </div>
              {r.description && <p className="repo-list-desc">{r.description}</p>}
              <div className="repo-list-meta">
                {r.language && (
                  <span className="repo-meta-item">
                    <i className="lang-dot" style={{ background: languageColor(r.language) }} /> {r.language}
                  </span>
                )}
                <span className="repo-meta-item">
                  <Octicon name="star" size={14} /> {compact(r.stargazers_count)}
                </span>
                <span className="repo-meta-item">
                  <Octicon name="repo-forked" size={14} /> {compact(r.forks_count)}
                </span>
                <span className="repo-meta-item">更新于 {timeAgo(r.updated_at)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card blankslate-wrap">
          <EmptyState icon="repo" title="没有找到仓库">
            <p>换个搜索条件，或在应用内新建仓库。</p>
            <Button variant="primary" icon="plus" onClick={openCreate}>新建仓库</Button>
          </EmptyState>
        </div>
      )}

      {newOpen && (
        <NewRepoDialog
          onClose={() => setNewOpen(false)}
          onCreated={(repo) => {
            setNewOpen(false)
            reload()
            showToast(`仓库 ${repo.full_name} 已创建`, 'success')
            navigate(`/${repo.owner.login}/${repo.name}`)
          }}
        />
      )}
    </div>
  )
}
