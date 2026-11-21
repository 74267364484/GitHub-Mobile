import { useState } from 'react'
import type { GitCommit } from '../types'
import { useApi } from '../lib/hooks'
import { useApp } from '../state/AppState'
import { Avatar } from './Avatar'
import { Octicon } from './Octicon'
import { Button, Dialog, Skeleton } from './ui'
import { copyText } from '../lib/clipboard'
import { timeAgo, formatDateTime, firstLine } from '../lib/format'

export function CommitDialog({
  full, sha, onClose,
}: {
  full: string
  sha: string
  onClose: () => void
}) {
  const state = useApi<GitCommit>(`/repos/${full}/commits/${sha}`)
  const commit = state.data
  const { showToast } = useApp()

  return (
    <Dialog
      title="提交详情"
      subtitle={sha.slice(0, 10)}
      onClose={onClose}
      width={680}
      footer={(
        <div className="dialog-actions">
          <Button icon="copy" onClick={async () => { await copyText(sha); showToast('提交 SHA 已复制', 'success') }}>
            复制 SHA
          </Button>
          <Button variant="primary" onClick={onClose}>关闭</Button>
        </div>
      )}
    >
      {state.loading && <Skeleton height={120} />}
      {state.error && <div className="form-error">{state.error.message}</div>}
      {commit && (
        <div className="commit-detail">
          <div className="commit-detail-head">
            <Avatar user={commit.author || undefined} login={commit.commit.author?.name} size={36} />
            <div className="commit-detail-main">
              <div className="commit-detail-msg">{firstLine(commit.commit.message, 200)}</div>
              <div className="commit-detail-meta">
                {commit.author?.login || commit.commit.author?.name} · {formatDateTime(commit.commit.author?.date || '')}
              </div>
            </div>
          </div>
          {commit.commit.message.includes('\n') && (
            <pre className="commit-detail-body">{commit.commit.message.split('\n').slice(1).join('\n').trim()}</pre>
          )}
          {(commit.files || []).length > 0 && (
            <div className="commit-detail-files">
              <div className="commit-detail-files-head">
                <strong>{commit.files!.length} 个文件变更</strong>
                <span className="diff-add">+{commit.files!.reduce((a, f) => a + f.additions, 0)}</span>
                <span className="diff-del">−{commit.files!.reduce((a, f) => a + f.deletions, 0)}</span>
              </div>
              {commit.files!.map((f) => (
                <div className="commit-detail-file" key={f.filename}>
                  <Octicon name="file" size={14} />
                  <span className="commit-detail-file-name">{f.filename}</span>
                  <span className="diff-add">+{f.additions}</span>
                  <span className="diff-del">−{f.deletions}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}

export function CommitsDialog({
  full, branch, onClose,
}: {
  full: string
  branch: string
  onClose: () => void
}) {
  const state = useApi<GitCommit[]>(`/repos/${full}/commits?sha=${encodeURIComponent(branch)}&per_page=30`)
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <>
      <Dialog title="提交历史" subtitle={`${full} · ${branch}`} onClose={onClose} width={680}>
        {state.loading && <Skeleton height={160} />}
        {state.error && <div className="form-error">{state.error.message}</div>}
        <div className="commit-list">
          {(state.data || []).map((c) => (
            <button className="commit-row commit-row-button" key={c.sha} onClick={() => setSelected(c.sha)}>
              <Avatar user={c.author || undefined} login={c.commit.author?.name} size={24} />
              <div className="commit-main">
                <span className="commit-msg">{firstLine(c.commit.message, 100)}</span>
                <div className="commit-meta">
                  {c.author?.login || c.commit.author?.name} · {timeAgo(c.commit.author?.date)}
                </div>
              </div>
              <code className="commit-sha">{c.sha.slice(0, 7)}</code>
            </button>
          ))}
          {!state.loading && !state.error && (state.data || []).length === 0 && <p className="muted">暂无提交。</p>}
        </div>
      </Dialog>
      {selected && <CommitDialog full={full} sha={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
