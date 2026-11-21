import type { PRFile } from '../types'
import { Octicon } from './Octicon'
import { compact } from '../lib/format'

interface DiffRow {
  type: 'hunk' | 'add' | 'del' | 'ctx' | 'meta'
  text: string
  oldNo?: number
  newNo?: number
}

function parsePatch(patch: string): DiffRow[] {
  let oldNo = 0
  let newNo = 0
  const rows: DiffRow[] = []
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('@@')) {
      const m = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) {
        oldNo = Number(m[1])
        newNo = Number(m[2])
      }
      rows.push({ type: 'hunk', text: raw })
    } else if (raw.startsWith('+')) {
      rows.push({ type: 'add', oldNo: undefined, newNo, text: raw.slice(1) })
      newNo++
    } else if (raw.startsWith('-')) {
      rows.push({ type: 'del', oldNo, newNo: undefined, text: raw.slice(1) })
      oldNo++
    } else if (raw.startsWith('\\')) {
      rows.push({ type: 'meta', text: raw })
    } else {
      rows.push({ type: 'ctx', oldNo, newNo, text: raw.startsWith(' ') ? raw.slice(1) : raw })
      oldNo++
      newNo++
    }
  }
  return rows
}

export function DiffView({ patch }: { patch?: string }) {
  if (!patch) {
    return <div className="diff-nopatch">二进制文件或差异过大，无法显示。</div>
  }
  const rows = parsePatch(patch)
  return (
    <div className="diff-view">
      <table className="diff-table">
        <tbody>
          {rows.map((r, i) => {
            if (r.type === 'hunk') {
              return (
                <tr key={i} className="diff-hunk">
                  <td className="diff-num" />
                  <td className="diff-num" />
                  <td className="diff-code">{r.text}</td>
                </tr>
              )
            }
            if (r.type === 'meta') {
              return (
                <tr key={i} className="diff-meta">
                  <td className="diff-num" />
                  <td className="diff-num" />
                  <td className="diff-code">{r.text}</td>
                </tr>
              )
            }
            return (
              <tr key={i} className={`diff-row diff-${r.type}`}>
                <td className="diff-num">{r.type === 'add' ? '' : r.oldNo}</td>
                <td className="diff-num">{r.type === 'del' ? '' : r.newNo}</td>
                <td className="diff-code">
                  <span className="diff-sign">{r.type === 'add' ? '+' : r.type === 'del' ? '−' : ' '}</span>
                  <span className="diff-text">{r.text || ' '}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function FileDiff({ file, owner, repo, branch }: { file: PRFile; owner: string; repo: string; branch: string }) {
  const icon = file.status === 'added' ? 'diff-added' : file.status === 'removed' ? 'diff-removed' : 'file-diff'
  return (
    <div className="diff-file">
      <div className="diff-file-head">
        <span className={`diff-file-icon diff-file-${file.status}`}>
          <Octicon name={icon} size={16} />
        </span>
        <span className="diff-file-name">
          {file.filename.split('/').map((seg, i, arr) => (
            <span key={i} className={i === arr.length - 1 ? 'diff-file-last' : 'diff-file-dir'}>
              {seg}{i < arr.length - 1 ? '/' : ''}
            </span>
          ))}
        </span>
        <span className="diff-file-stats">
          <span className="diff-add">+{compact(file.additions)}</span>
          <span className="diff-del">−{compact(file.deletions)}</span>
        </span>
        <a
          className="diff-file-link"
          href={`#/${owner}/${repo}/blob/${encodeURIComponent(branch)}/${file.filename.split('/').map(encodeURIComponent).join('/')}`}
          title="在应用内查看文件"
        >
          <Octicon name="file" size={16} />
        </a>
      </div>
      <DiffView patch={file.patch} />
    </div>
  )
}
