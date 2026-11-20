import { useMemo, useState } from 'react'
import type { TreeEntry } from '../types'
import { Dialog } from './ui'
import { Octicon } from './Octicon'

export function GoToFileDialog({
  branch, tree, onClose, onSelect,
}: {
  owner: string
  repo: string
  branch: string
  tree: TreeEntry[]
  onClose: () => void
  onSelect: (path: string) => void
}) {
  const [q, setQ] = useState('')
  const files = useMemo(() => {
    const term = q.trim().toLowerCase()
    const blobs = tree.filter((e) => e.type === 'blob')
    if (!term) return blobs.slice(0, 60)
    return blobs
      .filter((e) => e.path.toLowerCase().includes(term))
      .sort((a, b) => {
        const ai = a.path.toLowerCase().indexOf(term)
        const bi = b.path.toLowerCase().indexOf(term)
        if (ai !== bi) return ai - bi
        return a.path.length - b.path.length
      })
      .slice(0, 80)
  }, [tree, q])

  return (
    <Dialog
      title="转到文件"
      subtitle={`分支：${branch}`}
      onClose={onClose}
      width={620}
      className="gotofile-dialog"
    >
      <div className="branch-search">
        <Octicon name="search" size={16} />
        <input
          autoFocus
          className="form-input"
          placeholder="按文件名查找…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="gotofile-list">
        {files.map((f) => (
          <button key={f.path} className="gotofile-item" onClick={() => onSelect(f.path)}>
            <Octicon name="file" size={16} />
            <span className="gotofile-path">
              {f.path.split('/').map((seg, i, arr) => (
                <span key={i} className={i === arr.length - 1 ? 'gotofile-last' : 'gotofile-dir'}>
                  {seg}{i < arr.length - 1 ? '/' : ''}
                </span>
              ))}
            </span>
            <span className="gotofile-size">{(f.size || 0).toLocaleString()} B</span>
          </button>
        ))}
        {files.length === 0 && <div className="gotofile-empty">没有匹配的文件。</div>}
      </div>
    </Dialog>
  )
}
