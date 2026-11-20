import { useState } from 'react'
import type { Branch } from '../types'
import { Dialog, Spinner } from './ui'
import { Octicon } from './Octicon'
import { timeAgo } from '../lib/format'

export function BranchPicker({
  branches, current, loading, onClose, onSelect,
}: {
  owner: string
  repo: string
  branches: Branch[]
  current: string
  loading?: boolean
  onClose: () => void
  onSelect: (branch: string) => void
}) {
  const [q, setQ] = useState('')
  const filtered = branches.filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <Dialog title="切换分支" subtitle="选择要查看的分支" onClose={onClose} width={480}>
      <div className="branch-search">
        <Octicon name="search" size={16} />
        <input
          autoFocus
          className="form-input"
          placeholder="查找分支…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {loading && <div className="branch-loading"><Spinner /> 正在加载分支…</div>}
      <div className="branch-list">
        {filtered.map((b) => (
          <button
            key={b.name}
            className={`branch-item ${b.name === current ? 'active' : ''}`}
            onClick={() => onSelect(b.name)}
          >
            <Octicon name="git-branch" size={16} />
            <span className="branch-item-name">{b.name}</span>
            {b.name === current && <span className="branch-current">当前</span>}
            <span className="branch-updated">{timeAgo((b as any).commit?.author?.date)}</span>
            {b.name === current && <Octicon name="check" size={16} />}
          </button>
        ))}
        {!loading && filtered.length === 0 && <div className="branch-empty">没有找到分支</div>}
      </div>
    </Dialog>
  )
}
