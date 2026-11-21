import { useMemo, useState } from 'react'
import type { Branch, Issue, PullRequest, Repository } from '../types'
import { gh, invalidateCache } from '../lib/api'
import { useApi } from '../lib/hooks'
import { b64EncodeUnicode } from '../lib/format'
import { Button, Dialog, Spinner } from './ui'
import { Octicon } from './Octicon'

function encodePath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

export function NewRepoDialog({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (repo: Repository) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setPrivate] = useState(true)
  const [autoInit, setAutoInit] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    if (!/^[A-Za-z0-9._-]+$/.test(name.trim())) {
      setError('仓库名只能包含字母、数字、点、下划线和连字符。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const repo = await gh<Repository>('/user/repos', {
        method: 'POST',
        body: {
          name: name.trim(),
          description: description.trim() || undefined,
          private: isPrivate,
          auto_init: autoInit,
        },
      })
      invalidateCache()
      onCreated(repo)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建仓库失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="新建仓库"
      subtitle="在应用内创建，无需跳转 GitHub 网页"
      onClose={onClose}
      width={520}
      footer={(
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="primary" icon="repo" onClick={submit} disabled={busy || !name.trim()}>
            {busy ? <><Spinner size={14} /> 创建中…</> : '创建仓库'}
          </Button>
        </div>
      )}
    >
      <form className="write-form" onSubmit={submit}>
        <label className="settings-field">
          <span className="settings-label">仓库名称</span>
          <input
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-project"
            autoFocus
            spellCheck={false}
          />
        </label>
        <label className="settings-field">
          <span className="settings-label">描述（可选）</span>
          <textarea
            className="form-input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="这个仓库是做什么的？"
          />
        </label>
        <label className="settings-check">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} />
          <span><strong>私有仓库</strong><span className="settings-check-desc">只有你和你邀请的协作者可见</span></span>
        </label>
        <label className="settings-check">
          <input type="checkbox" checked={autoInit} onChange={(e) => setAutoInit(e.target.checked)} />
          <span><strong>初始化 README</strong><span className="settings-check-desc">自动创建 main 分支与 README.md</span></span>
        </label>
        {error && <div className="form-error">{error}</div>}
      </form>
    </Dialog>
  )
}

export function IssueDialog({
  repo, mode, issue, initialTitle, initialBody, onClose, onSaved,
}: {
  repo: string
  mode: 'create' | 'edit'
  issue?: Issue | PullRequest | null
  initialTitle?: string
  initialBody?: string
  onClose: () => void
  onSaved: (issue: Issue) => void
}) {
  const [title, setTitle] = useState(issue?.title || initialTitle || '')
  const [body, setBody] = useState(issue?.body || initialBody || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const saved = mode === 'create'
        ? await gh<Issue>(`/repos/${repo}/issues`, { method: 'POST', body: { title: title.trim(), body } })
        : await gh<Issue>(`/repos/${repo}/issues/${issue!.number}`, { method: 'PATCH', body: { title: title.trim(), body } })
      invalidateCache()
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={mode === 'create' ? '新建议题' : '编辑标题与描述'}
      subtitle={repo}
      onClose={onClose}
      width={600}
      footer={(
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="primary" icon="check" onClick={submit} disabled={busy || !title.trim()}>
            {busy ? <><Spinner size={14} /> 保存中…</> : mode === 'create' ? '创建议题' : '保存'}
          </Button>
        </div>
      )}
    >
      <form className="write-form" onSubmit={submit}>
        <label className="settings-field">
          <span className="settings-label">标题</span>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="简要描述问题" />
        </label>
        <label className="settings-field">
          <span className="settings-label">描述（支持 Markdown）</span>
          <textarea className="form-input" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="补充复现步骤、期望结果等" />
        </label>
        {error && <div className="form-error">{error}</div>}
      </form>
    </Dialog>
  )
}

export function PullDialog({
  repo, defaultBranch, onClose, onCreated,
}: {
  repo: string
  defaultBranch: string
  onClose: () => void
  onCreated: (pr: PullRequest) => void
}) {
  const branchesState = useApi<Branch[]>(`/repos/${repo}/branches?per_page=100`)
  const branches = branchesState.data || []
  const [base, setBase] = useState(defaultBranch)
  const [head, setHead] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const headOptions = useMemo(() => branches.filter((b) => b.name !== base), [branches, base])
  const effectiveHead = head || headOptions[0]?.name || ''

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !base || !effectiveHead || busy) return
    setBusy(true)
    setError('')
    try {
      const pr = await gh<PullRequest>(`/repos/${repo}/pulls`, {
        method: 'POST',
        body: { title: title.trim(), head: effectiveHead, base, body, draft },
      })
      invalidateCache()
      onCreated(pr)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建拉取请求失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="新建拉取请求"
      subtitle={repo}
      onClose={onClose}
      width={600}
      footer={(
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="primary" icon="git-pull-request" onClick={submit} disabled={busy || !title.trim() || !effectiveHead}>
            {busy ? <><Spinner size={14} /> 创建中…</> : '创建拉取请求'}
          </Button>
        </div>
      )}
    >
      <form className="write-form" onSubmit={submit}>
        {branchesState.loading && <div className="form-hint">正在读取分支…</div>}
        <div className="write-form-row">
          <label className="settings-field">
            <span className="settings-label">目标分支（base）</span>
            <select className="form-select" value={base} onChange={(e) => { setBase(e.target.value); setHead('') }}>
              {branches.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
              {!branches.length && <option value={defaultBranch}>{defaultBranch}</option>}
            </select>
          </label>
          <label className="settings-field">
            <span className="settings-label">来源分支（head）</span>
            <select className="form-select" value={effectiveHead} onChange={(e) => setHead(e.target.value)} disabled={!headOptions.length}>
              {headOptions.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
              {!headOptions.length && <option value="">没有其他分支</option>}
            </select>
          </label>
        </div>
        <label className="settings-field">
          <span className="settings-label">标题</span>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="这次改动做了什么？" />
        </label>
        <label className="settings-field">
          <span className="settings-label">描述（支持 Markdown）</span>
          <textarea className="form-input" rows={7} value={body} onChange={(e) => setBody(e.target.value)} placeholder="说明改动内容与测试情况" />
        </label>
        <label className="settings-check">
          <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
          <span><strong>创建为草稿</strong><span className="settings-check-desc">草稿不会被自动合并</span></span>
        </label>
        {error && <div className="form-error">{error}</div>}
      </form>
    </Dialog>
  )
}

export function FileDialog({
  repo, branch, mode, path: initialPath, pathPrefix = '', initialContent, sha, onClose, onSaved,
}: {
  repo: string
  branch: string
  mode: 'create' | 'edit' | 'upload'
  path?: string
  pathPrefix?: string
  initialContent?: string
  sha?: string
  onClose: () => void
  onSaved: (path: string) => void
}) {
  const [path, setPath] = useState(initialPath || '')
  const [content, setContent] = useState(initialContent || '')
  const [message, setMessage] = useState(
    mode === 'create' ? `Create ${initialPath || 'new file'}` : mode === 'edit' ? `Update ${initialPath}` : 'Upload file',
  )
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const readFile = (f: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(f)
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const targetPath = (mode === 'upload' ? path || file?.name || '' : path).trim()
    if (!targetPath) {
      setError('请填写文件路径。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const body: any = {
        message: message.trim() || `Update ${targetPath}`,
        branch,
      }
      if (mode === 'upload') {
        if (!file) {
          setError('请选择要上传的文件。')
          setBusy(false)
          return
        }
        body.content = await readFile(file)
      } else {
        body.content = b64EncodeUnicode(content)
      }
      if (sha) body.sha = sha
      await gh(`/repos/${repo}/contents/${encodePath(targetPath)}`, { method: 'PUT', body })
      invalidateCache()
      onSaved(targetPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存文件失败')
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'create' ? '创建新文件' : mode === 'edit' ? '编辑文件' : '上传文件'

  return (
    <Dialog
      title={title}
      subtitle={`${repo} · ${branch}`}
      onClose={onClose}
      width={680}
      footer={(
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="primary" icon="check" onClick={submit} disabled={busy || (mode === 'upload' && !file)}>
            {busy ? <><Spinner size={14} /> 提交中…</> : '提交更改'}
          </Button>
        </div>
      )}
    >
      <form className="write-form" onSubmit={submit}>
        <label className="settings-field">
          <span className="settings-label">文件路径</span>
          <input
            className="form-input"
            value={mode === 'upload' && !path ? file ? pathPrefix + file.name : '' : path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="src/index.ts"
            disabled={mode === 'edit'}
            spellCheck={false}
          />
        </label>
        {mode === 'upload' ? (
          <label className="settings-field">
            <span className="settings-label">选择文件</span>
            <input
              className="form-input"
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] || null
                setFile(f)
                if (f) {
                  setPath(pathPrefix + f.name)
                  setMessage(`Upload ${pathPrefix}${f.name}`)
                }
              }}
            />
          </label>
        ) : (
          <label className="settings-field">
            <span className="settings-label">文件内容</span>
            <textarea
              className="form-input monospace-input"
              rows={14}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
            />
          </label>
        )}
        <label className="settings-field">
          <span className="settings-label">提交信息</span>
          <input className="form-input" value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        {error && <div className="form-error">{error}</div>}
      </form>
    </Dialog>
  )
}

export function NewReleaseDialog({
  repo, defaultBranch, onClose, onCreated,
}: {
  repo: string
  defaultBranch: string
  onClose: () => void
  onCreated: () => void
}) {
  const [tag, setTag] = useState('')
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [prerelease, setPrerelease] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tag.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await gh(`/repos/${repo}/releases`, {
        method: 'POST',
        body: {
          tag_name: tag.trim(),
          target_commitish: defaultBranch,
          name: name.trim() || tag.trim(),
          body,
          prerelease,
          draft: false,
        },
      })
      invalidateCache()
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建发行版失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="起草新发行版"
      subtitle={repo}
      onClose={onClose}
      width={620}
      footer={(
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="primary" icon="tag" onClick={submit} disabled={busy || !tag.trim()}>
            {busy ? <><Spinner size={14} /> 发布中…</> : '发布发行版'}
          </Button>
        </div>
      )}
    >
      <form className="write-form" onSubmit={submit}>
        <div className="write-form-row">
          <label className="settings-field">
            <span className="settings-label">标签（tag）</span>
            <input className="form-input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="v1.0.0" autoFocus />
          </label>
          <label className="settings-field">
            <span className="settings-label">标题（可选）</span>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="1.0.0" />
          </label>
        </div>
        <label className="settings-field">
          <span className="settings-label">说明（支持 Markdown）</span>
          <textarea className="form-input" rows={9} value={body} onChange={(e) => setBody(e.target.value)} placeholder="这一版有什么变化？" />
        </label>
        <label className="settings-check">
          <input type="checkbox" checked={prerelease} onChange={(e) => setPrerelease(e.target.checked)} />
          <span><strong>预发行</strong><span className="settings-check-desc">标记为 Beta / RC</span></span>
        </label>
        <div className="form-hint"><Octicon name="info" size={14} /> 标签不存在时会从 <code>{defaultBranch}</code> 自动创建。</div>
        {error && <div className="form-error">{error}</div>}
      </form>
    </Dialog>
  )
}
