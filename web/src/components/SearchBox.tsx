import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { useApp } from '../state/AppState'
import { gh } from '../lib/api'
import { navigate } from '../lib/router'
import type { GitHubUser, Repository } from '../types'
import { Octicon } from './Octicon'
import { Avatar } from './Avatar'
import { Spinner } from './ui'
import { languageColor, compact } from '../lib/format'

export function SearchBox({ mobile, onNavigate, autoFocus }: { mobile?: boolean; onNavigate?: () => void; autoFocus?: boolean }) {
  const { source } = useApp()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(Boolean(autoFocus))
  const [repos, setRepos] = useState<Repository[]>([])
  const [users, setUsers] = useState<GitHubUser[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  useEffect(() => {
    if (!mobile) {
      const onKey = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault()
          inputRef.current?.focus()
          setOpen(true)
        }
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }
  }, [mobile])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setRepos([])
      setUsers([])
      setLoading(false)
      return
    }
    const id = ++seq.current
    setLoading(true)
    const t = window.setTimeout(async () => {
      try {
        const [r, u] = await Promise.all([
          gh<{ items: Repository[] }>(`/search/repositories?q=${encodeURIComponent(term)}&per_page=5`),
          gh<{ items: GitHubUser[] }>(`/search/users?q=${encodeURIComponent(term)}&per_page=3`).catch(() => ({ items: [] })),
        ])
        if (id !== seq.current) return
        setRepos(r.items || [])
        setUsers(u.items || [])
      } catch {
        if (id === seq.current) {
          setRepos([])
          setUsers([])
        }
      } finally {
        if (id === seq.current) setLoading(false)
      }
    }, 220)
    return () => window.clearTimeout(t)
  }, [q])

  const go = (href: string) => {
    setOpen(false)
    setQ('')
    inputRef.current?.blur()
    onNavigate?.()
    navigate(href)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const term = q.trim()
    if (!term) return
    go(`/search?q=${encodeURIComponent(term)}&type=repositories`)
  }

  const showEmpty = q.trim().length === 0

  return (
    <div className={`search-box ${mobile ? 'search-box-mobile' : ''}`} ref={wrapRef}>
      <form onSubmit={submit} role="search">
        <Octicon name="search" size={16} className="search-icon" />
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="搜索或跳转到…"
          value={q}
          autoFocus={autoFocus}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
          }}
          aria-label="搜索 GitHub"
        />
        {!mobile && <span className="search-key">/</span>}
      </form>

      {open && (
        <div className="search-panel">
          {showEmpty ? (
            <div className="search-empty">
              <div className="search-panel-title">快速搜索</div>
              <button className="search-item" onClick={() => go('/repos')}>
                <Octicon name="repo" size={16} />
                <span>你的仓库</span>
              </button>
              <button className="search-item" onClick={() => go('/issues')}>
                <Octicon name="issue-opened" size={16} />
                <span>你的议题</span>
              </button>
              <button className="search-item" onClick={() => go('/pulls')}>
                <Octicon name="git-pull-request" size={16} />
                <span>你的拉取请求</span>
              </button>
              <button className="search-item" onClick={() => go('/explore')}>
                <Octicon name="telescope" size={16} />
                <span>探索仓库</span>
              </button>
              <div className="search-hint">
                {source === 'demo' ? '演示模式 · 搜索本地演示数据' : '按 / 或 Ctrl K 聚焦搜索'}
              </div>
            </div>
          ) : (
            <>
              {loading && <div className="search-loading"><Spinner size={16} /> 搜索中…</div>}
              {!loading && repos.length === 0 && users.length === 0 && (
                <div className="search-noresult">没有找到“{q.trim()}”</div>
              )}
              {repos.length > 0 && (
                <div className="search-group">
                  <div className="search-panel-title">仓库</div>
                  {repos.map((r) => (
                    <button className="search-item search-repo" key={r.id} onClick={() => go(`/${r.owner.login}/${r.name}`)}>
                      <Octicon name="repo" size={16} />
                      <span className="search-repo-name">{r.full_name}</span>
                      {r.language && (
                        <span className="search-repo-meta">
                          <i className="lang-dot" style={{ background: languageColor(r.language) }} />
                          {r.language}
                          <Octicon name="star" size={12} /> {compact(r.stargazers_count)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {users.length > 0 && (
                <div className="search-group">
                  <div className="search-panel-title">用户</div>
                  {users.map((u) => (
                    <button className="search-item" key={u.id} onClick={() => go(`/user/${u.login}`)}>
                      <Avatar user={u} size={20} />
                      <span>{u.login}</span>
                    </button>
                  ))}
                </div>
              )}
              <button className="search-all" onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}&type=repositories`)}>
                在全部 GitHub 中搜索“{q.trim()}” <Octicon name="arrow-right" size={14} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
