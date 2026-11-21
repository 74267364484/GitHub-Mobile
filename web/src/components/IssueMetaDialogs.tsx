import { useMemo, useState } from 'react'
import type { GitHubUser, IssueLabel } from '../types'
import { useApi } from '../lib/hooks'
import { gh, invalidateCache } from '../lib/api'
import { useApp } from '../state/AppState'
import { Button, Dialog, LabelPill, Skeleton } from './ui'
import { Octicon } from './Octicon'

interface RepoLabel extends IssueLabel {
  id: number
}

interface Milestone {
  number: number
  title: string
  state: string
}

function useIssueUpdate(full: string, number: number, onSaved: () => void) {
  const { showToast } = useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (body: Record<string, unknown>, path = `/repos/${full}/issues/${number}`, method = 'PATCH') => {
    setBusy(true)
    setError('')
    try {
      await gh(path, { method, body })
      invalidateCache()
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
      showToast(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, run }
}

export function LabelsDialog({
  full, number, current, onClose, onSaved,
}: {
  full: string
  number: number
  current: IssueLabel[]
  onClose: () => void
  onSaved: () => void
}) {
  const state = useApi<RepoLabel[]>(`/repos/${full}/labels?per_page=100`)
  const [selected, setSelected] = useState<string[]>(current.map((l) => l.name))
  const [q, setQ] = useState('')
  const { busy, error, run } = useIssueUpdate(full, number, () => { onSaved(); onClose() })

  const labels = useMemo(
    () => (state.data || []).filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase())),
    [state.data, q],
  )

  const toggle = (name: string) => {
    setSelected((prev) => prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name])
  }

  return (
    <Dialog
      title="编辑标签"
      subtitle={`${full} #${number}`}
      onClose={onClose}
      width={560}
      footer={(
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={busy}>取消</Button>
          <Button
            variant="primary"
            icon="check"
            disabled={busy}
            onClick={() => run({ labels: selected }, `/repos/${full}/issues/${number}/labels`, 'PUT')}
          >
            {busy ? '保存中…' : '保存标签'}
          </Button>
        </div>
      )}
    >
      <div className="write-form">
        <div className="list-search">
          <Octicon name="search" size={16} />
          <input className="form-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="筛选标签…" autoFocus />
        </div>
        {state.loading && <Skeleton height={120} />}
        {state.error && <div className="form-error">{state.error.message}</div>}
        <div className="label-picker">
          {labels.map((l) => (
            <label className={`label-picker-item ${selected.includes(l.name) ? 'selected' : ''}`} key={l.id}>
              <input type="checkbox" checked={selected.includes(l.name)} onChange={() => toggle(l.name)} />
              <LabelPill name={l.name} color={l.color} description={l.description} />
              {l.description && <span className="label-picker-desc">{l.description}</span>}
            </label>
          ))}
          {!state.loading && !state.error && labels.length === 0 && <p className="muted">没有匹配的标签。</p>}
        </div>
        {error && <div className="form-error">{error}</div>}
      </div>
    </Dialog>
  )
}

export function AssigneesDialog({
  full, number, current, onClose, onSaved,
}: {
  full: string
  number: number
  current: GitHubUser[]
  onClose: () => void
  onSaved: () => void
}) {
  const state = useApi<GitHubUser[]>(`/repos/${full}/assignees?per_page=100`)
  const [selected, setSelected] = useState<string[]>(current.map((u) => u.login))
  const [q, setQ] = useState('')
  const { busy, error, run } = useIssueUpdate(full, number, () => { onSaved(); onClose() })

  const people = useMemo(
    () => (state.data || []).filter((u) => !q || u.login.toLowerCase().includes(q.toLowerCase())),
    [state.data, q],
  )

  const toggle = (login: string) => {
    setSelected((prev) => prev.includes(login) ? prev.filter((x) => x !== login) : [...prev, login])
  }

  return (
    <Dialog
      title="编辑负责人"
      subtitle={`${full} #${number}`}
      onClose={onClose}
      width={520}
      footer={(
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="primary" icon="check" disabled={busy} onClick={() => run({ assignees: selected })}>
            {busy ? '保存中…' : '保存负责人'}
          </Button>
        </div>
      )}
    >
      <div className="write-form">
        <div className="list-search">
          <Octicon name="search" size={16} />
          <input className="form-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="筛选协作者…" autoFocus />
        </div>
        {state.loading && <Skeleton height={100} />}
        {state.error && <div className="form-error">{state.error.message}</div>}
        <div className="people-picker">
          {people.map((u) => (
            <label className={`people-picker-item ${selected.includes(u.login) ? 'selected' : ''}`} key={u.id}>
              <input type="checkbox" checked={selected.includes(u.login)} onChange={() => toggle(u.login)} />
              <img className="avatar" src={u.avatar_url} alt={u.login} width={22} height={22} />
              <span>{u.login}</span>
            </label>
          ))}
          {!state.loading && !state.error && people.length === 0 && <p className="muted">没有可分配的协作者。</p>}
        </div>
        {error && <div className="form-error">{error}</div>}
      </div>
    </Dialog>
  )
}

export function MilestoneDialog({
  full, number, current, onClose, onSaved,
}: {
  full: string
  number: number
  current: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const state = useApi<Milestone[]>(`/repos/${full}/milestones?state=open&per_page=100`)
  const [value, setValue] = useState<string>(current ? String(current) : '')
  const { busy, error, run } = useIssueUpdate(full, number, () => { onSaved(); onClose() })

  return (
    <Dialog
      title="设置里程碑"
      subtitle={`${full} #${number}`}
      onClose={onClose}
      width={480}
      footer={(
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={busy}>取消</Button>
          <Button
            variant="primary"
            icon="check"
            disabled={busy}
            onClick={() => run({ milestone: value ? Number(value) : null })}
          >
            {busy ? '保存中…' : '保存'}
          </Button>
        </div>
      )}
    >
      <div className="write-form">
        <label className="settings-field">
          <span className="settings-label">里程碑</span>
          <select className="form-select" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">清除里程碑</option>
            {(state.data || []).map((m) => <option key={m.number} value={m.number}>{m.title}</option>)}
          </select>
        </label>
        {state.loading && <Skeleton height={40} />}
        {state.error && <div className="form-error">{state.error.message}</div>}
        {!state.loading && (state.data || []).length === 0 && <p className="form-hint">此仓库还没有打开的里程碑。</p>}
        {error && <div className="form-error">{error}</div>}
      </div>
    </Dialog>
  )
}
