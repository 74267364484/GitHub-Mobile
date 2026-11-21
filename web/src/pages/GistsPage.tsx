import { useState } from 'react'
import type { Gist } from '../types'
import { useApi, useDocumentTitle } from '../lib/hooks'
import { gh, invalidateCache } from '../lib/api'
import { useApp } from '../state/AppState'
import { Octicon } from '../components/Octicon'
import { Avatar } from '../components/Avatar'
import { Button, Dialog, EmptyState, Skeleton } from '../components/ui'
import { copyText } from '../lib/clipboard'
import { navigate, useQuery } from '../lib/router'
import { timeAgo } from '../lib/format'

export function GistsPage() {
  const qs = useQuery()
  const { config, showToast } = useApp()
  const [createOpen, setCreateOpen] = useState(qs.get('new') === '1')
  const state = useApi<Gist[]>(config?.hasToken ? '/gists?per_page=100' : null)
  const gists = state.data || []
  useDocumentTitle('Gist')

  return (
    <div className="gists-page">
      <div className="page-heading">
        <h1>Gist</h1>
        <Button
          variant="primary"
          size="sm"
          icon="plus"
          onClick={() => {
            if (!config?.hasToken) {
              showToast('登录 GitHub 后才能创建 Gist', 'info')
              navigate('/settings')
              return
            }
            setCreateOpen(true)
          }}
        >
          新建 Gist
        </Button>
      </div>

      {!config?.hasToken && (
        <div className="card blankslate-wrap">
          <EmptyState icon="code" title="登录后管理你的 Gist">
            <p>Gist 可以保存代码片段、笔记和配置。登录 GitHub 后会显示你自己的 Gist 列表。</p>
            <Button variant="primary" icon="key" onClick={() => navigate('/settings')}>连接 GitHub</Button>
          </EmptyState>
        </div>
      )}

      {config?.hasToken && state.loading && (
        <div className="card pad"><Skeleton height={64} /><Skeleton height={64} /><Skeleton height={64} /></div>
      )}

      {config?.hasToken && !state.loading && state.error && (
        <div className="card blankslate-wrap">
          <EmptyState icon="alert" title="无法加载 Gist"><p>{state.error.message}</p></EmptyState>
        </div>
      )}

      {config?.hasToken && !state.loading && !state.error && gists.length === 0 && (
        <div className="card blankslate-wrap">
          <EmptyState icon="code" title="还没有 Gist">
            <p>把常用代码片段保存为 Gist，随时在手机上查看。</p>
            <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>新建 Gist</Button>
          </EmptyState>
        </div>
      )}

      {gists.length > 0 && (
        <div className="gist-list card">
          {gists.map((g) => {
            const files = Object.values(g.files || {})
            return (
              <a className="gist-row" key={g.id} href={`#/gist/${g.id}`}>
                <span className="gist-icon"><Octicon name="code" size={16} /></span>
                <span className="gist-main">
                  <span className="gist-title">{g.description || files[0]?.filename || g.id}</span>
                  <span className="gist-meta">
                    {files.length} 个文件 · {g.public ? '公开' : '私密'} · 更新于 {timeAgo(g.updated_at)}
                  </span>
                </span>
                <span className="gist-files">{files.map((f) => f.filename).join(', ')}</span>
              </a>
            )
          })}
        </div>
      )}

      {createOpen && (
        <NewGistDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(gist) => {
            setCreateOpen(false)
            invalidateCache()
            navigate(`/gist/${gist.id}`)
            showToast('Gist 已创建', 'success')
          }}
        />
      )}
    </div>
  )
}

function NewGistDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (gist: Gist) => void }) {
  const [description, setDescription] = useState('')
  const [filename, setFilename] = useState('snippet.md')
  const [content, setContent] = useState('')
  const [isPublic, setPublic] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !filename.trim()) return
    setBusy(true)
    setError('')
    try {
      const gist = await gh<Gist>('/gists', {
        method: 'POST',
        body: {
          description: description.trim() || undefined,
          public: isPublic,
          files: { [filename.trim()]: { content } },
        },
      })
      onCreated(gist)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建 Gist 失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="新建 Gist"
      subtitle="Gist 会保存到你的 GitHub 账号"
      onClose={onClose}
      width={620}
      footer={(
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="primary" icon="code" onClick={submit} disabled={busy || !filename.trim()}>
            {busy ? '创建中…' : '创建 Gist'}
          </Button>
        </div>
      )}
    >
      <form className="write-form" onSubmit={submit}>
        <label className="settings-field">
          <span className="settings-label">描述（可选）</span>
          <input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="这段代码是做什么的？" autoFocus />
        </label>
        <label className="settings-field">
          <span className="settings-label">文件名</span>
          <input className="form-input" value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="snippet.md" spellCheck={false} />
        </label>
        <label className="settings-field">
          <span className="settings-label">内容</span>
          <textarea className="form-input monospace-input" rows={12} value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false} />
        </label>
        <label className="settings-check">
          <input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} />
          <span><strong>公开 Gist</strong><span className="settings-check-desc">公开后任何人都能通过链接查看</span></span>
        </label>
        {error && <div className="form-error">{error}</div>}
      </form>
    </Dialog>
  )
}

export function GistDetailPage({ id }: { id: string }) {
  const state = useApi<Gist>(`/gists/${id}`)
  const gist = state.data
  const { showToast } = useApp()
  useDocumentTitle(gist?.description || 'Gist')

  if (state.loading) {
    return <div className="gist-detail"><Skeleton height={60} /><Skeleton height={220} /></div>
  }

  if (state.error || !gist) {
    return (
      <div className="card blankslate-wrap">
        <EmptyState icon="alert" title="无法加载 Gist">
          <p>{state.error?.message || 'Gist 不存在或没有访问权限。'}</p>
          <Button icon="arrow-left" onClick={() => navigate('/gists')}>返回 Gist 列表</Button>
        </EmptyState>
      </div>
    )
  }

  const files = Object.values(gist.files || {})

  return (
    <div className="gist-detail">
      <div className="gist-detail-head">
        <div className="gist-detail-main">
          <h1>{gist.description || files[0]?.filename || gist.id}</h1>
          <div className="gist-detail-meta">
            {gist.owner && (
              <>
                <Avatar user={gist.owner} size={20} />
                <a href={`#/user/${gist.owner.login}`}>{gist.owner.login}</a>
              </>
            )}
            <span>{gist.public ? '公开' : '私密'}</span>
            <span>更新于 {timeAgo(gist.updated_at)}</span>
            <span>{files.length} 个文件</span>
          </div>
        </div>
        <div className="gist-detail-actions">
          <Button
            size="sm"
            icon="link"
            onClick={async () => { await copyText(gist.html_url); showToast('Gist 链接已复制', 'success') }}
          >
            复制链接
          </Button>
          <Button size="sm" icon="arrow-left" onClick={() => navigate('/gists')}>全部 Gist</Button>
        </div>
      </div>

      {files.map((file) => (
        <div className="gist-file card" key={file.filename}>
          <div className="gist-file-head">
            <span className="gist-file-name"><Octicon name="file" size={16} /> {file.filename}</span>
            {file.language && <span className="blob-lang">{file.language}</span>}
            <span className="gist-file-size">{file.size != null ? `${file.size} B` : ''}</span>
          </div>
          <pre className="gist-file-content">{file.content || (file.truncated ? '文件过大，已截断。' : '空文件')}</pre>
        </div>
      ))}
    </div>
  )
}
