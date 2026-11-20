import { useState } from 'react'
import type { Repository, Workflow, WorkflowRun } from '../types'
import { useApi } from '../lib/hooks'
import { gh, invalidateCache, openExternal } from '../lib/api'
import { startDownload } from '../lib/downloads'
import { useApp } from '../state/AppState'
import { Octicon } from '../components/Octicon'
import { Avatar } from '../components/Avatar'
import { Button, Dialog, Skeleton } from '../components/ui'
import { firstLine, formatDuration, timeAgo } from '../lib/format'

interface RunStep {
  number: number
  name: string
  status: string
  conclusion: string | null
}

interface RunJob {
  id: number
  name: string
  status: string
  conclusion: string | null
  started_at: string
  completed_at: string | null
  html_url: string
  steps?: RunStep[]
}

function statusIcon(run: WorkflowRun) {
  if (run.status === 'in_progress' || run.status === 'queued' || run.status === 'waiting') {
    return { icon: run.status === 'queued' ? 'clock' : 'dot-fill', cls: 'run-status-pending', label: run.status.replace('_', ' ') }
  }
  switch (run.conclusion) {
    case 'success': return { icon: 'check-circle-fill', cls: 'run-status-success', label: 'success' }
    case 'failure': return { icon: 'x-circle-fill', cls: 'run-status-failure', label: 'failure' }
    case 'cancelled': return { icon: 'stop', cls: 'run-status-cancelled', label: 'cancelled' }
    case 'skipped': return { icon: 'stop', cls: 'run-status-cancelled', label: 'skipped' }
    default: return { icon: 'dot-fill', cls: 'run-status-pending', label: run.conclusion || run.status }
  }
}

const STARTERS = [
  { name: '简单工作流', icon: 'zap' as const, file: 'simple.yml', desc: '从空白工作流开始' },
  { name: 'Node.js', icon: 'code' as const, file: 'node.js.yml', desc: '构建并测试 Node.js 项目' },
  { name: 'Python', icon: 'code' as const, file: 'python.yml', desc: '构建并测试 Python 项目' },
  { name: 'Android', icon: 'package' as const, file: 'android.yml', desc: '构建并测试 Android 应用' },
]

export function ActionsPage({
  repo, owner, repoName,
}: {
  repo: Repository
  owner: string
  repoName: string
}) {
  const full = `${owner}/${repoName}`
  const branch = repo.default_branch || 'main'
  const { config, showToast } = useApp()
  const [busyRun, setBusyRun] = useState<number | null>(null)
  const [selected, setSelected] = useState<WorkflowRun | null>(null)
  const [workflowId, setWorkflowId] = useState<number | null>(null)
  const workflowsState = useApi<{ workflows: Workflow[]; total_count: number }>(`/repos/${full}/actions/workflows`)
  const runsState = useApi<{ workflow_runs: WorkflowRun[]; total_count: number }>(
    workflowId
      ? `/repos/${full}/actions/workflows/${workflowId}/runs?per_page=30`
      : `/repos/${full}/actions/runs?per_page=30`,
  )
  const jobsState = useApi<{ jobs: RunJob[] }>(
    selected ? `/repos/${full}/actions/runs/${selected.id}/jobs?per_page=100` : null,
  )

  const workflows = workflowsState.data?.workflows || []
  const runs = runsState.data?.workflow_runs || []
  const current = workflows.find((w) => w.id === workflowId)
  const actionsDisabled = Boolean(workflowsState.error)

  const runAction = async (runId: number, action: 'rerun' | 'cancel') => {
    if (!config?.hasToken) {
      showToast('登录 GitHub 后才能操作 Actions', 'info')
      return
    }
    setBusyRun(runId)
    try {
      await gh(`/repos/${full}/actions/runs/${runId}/${action}`, { method: 'POST', body: {} })
      invalidateCache()
      runsState.reload()
      jobsState.reload()
      showToast(action === 'rerun' ? '已重新运行' : '已取消运行', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败', 'error')
    } finally {
      setBusyRun(null)
    }
  }

  return (
    <div className="actions-layout">
      <aside className="actions-side">
        <button
          className={`actions-side-item ${workflowId == null ? 'active' : ''}`}
          onClick={() => setWorkflowId(null)}
        >
          <Octicon name="play" size={16} />
          <span>全部工作流</span>
        </button>
        {workflowsState.loading && <div className="actions-side-loading"><Skeleton height={28} /><Skeleton height={28} /></div>}
        {workflows.map((w) => (
          <button
            key={w.id}
            className={`actions-side-item ${workflowId === w.id ? 'active' : ''}`}
            onClick={() => setWorkflowId(w.id)}
            title={w.name}
          >
            <Octicon name="workflow" size={16} />
            <span>{w.name}</span>
          </button>
        ))}
        {!workflowsState.loading && workflows.length > 0 && (
          <a className="actions-side-manage" href={`https://github.com/${full}/actions`} target="_blank" rel="noreferrer">
            管理工作流 <Octicon name="link-external" size={12} />
          </a>
        )}
      </aside>

      <div className="actions-main">
        <div className="actions-head">
          <h2>{current ? current.name : '全部工作流'}</h2>
          <a className="btn btn-sm btn-default" href={`https://github.com/${full}/actions`} target="_blank" rel="noreferrer">
            <Octicon name="link-external" size={14} /> 在 GitHub 打开
          </a>
        </div>

        {runsState.loading && (
          <div className="card pad">
            <Skeleton height={44} /><Skeleton height={44} /><Skeleton height={44} />
          </div>
        )}

        {!runsState.loading && runs.length > 0 && (
          <div className="card run-list">
            {runs.map((run) => {
              const st = statusIcon(run)
              return (
                <div
                  className="run-row"
                  key={run.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => setSelected(run)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelected(run) }}
                >
                  <span className={`run-status ${st.cls}`} title={st.label}>
                    <Octicon name={st.icon as any} size={16} />
                  </span>
                  <div className="run-main">
                    <div className="run-title">{run.display_title || firstLine(run.head_commit?.message, 90) || run.name}</div>
                    <div className="run-meta">
                      <span className="run-workflow">{run.name}</span>
                      <span>#{run.run_number}</span>
                      <span className="run-branch"><Octicon name="git-branch" size={12} /> {run.head_branch}</span>
                      <span>{run.event}</span>
                    </div>
                  </div>
                  {run.actor && <Avatar user={run.actor} size={20} />}
                  <div className="run-side">
                    <span>{timeAgo(run.created_at)}</span>
                    <span className="run-duration">{formatDuration(run.created_at, run.updated_at)}</span>
                    {run.status === 'in_progress' || run.status === 'queued' ? (
                      <button
                        className="run-download"
                        title="取消运行"
                        aria-label="取消运行"
                        disabled={busyRun === run.id}
                        onClick={(e) => { e.stopPropagation(); runAction(run.id, 'cancel') }}
                      >
                        <Octicon name="stop" size={14} />
                      </button>
                    ) : (
                      <button
                        className="run-download"
                        title="重新运行"
                        aria-label="重新运行"
                        disabled={busyRun === run.id}
                        onClick={(e) => { e.stopPropagation(); runAction(run.id, 'rerun') }}
                      >
                        <Octicon name="sync" size={14} />
                      </button>
                    )}
                    <button
                      className="run-download"
                      title="下载运行日志"
                      aria-label="下载运行日志"
                      onClick={(e) => {
                        e.stopPropagation()
                        startDownload({ kind: 'run-logs', repo: full, runId: run.id })
                      }}
                    >
                      <Octicon name="download" size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!runsState.loading && runs.length === 0 && (
          <div className="actions-empty card">
            <div className="actions-empty-icon"><Octicon name="workflow" size={32} /></div>
            <h3>开始使用 GitHub Actions</h3>
            <p>
              {actionsDisabled
                ? 'Actions 未在此仓库启用，或当前令牌没有 workflow 读取权限。'
                : `${full} 还没有工作流运行记录，选择一个模板开始。`}
            </p>
            <div className="starter-grid">
              {STARTERS.map((s) => (
                <a
                  key={s.name}
                  className="starter-card"
                  href={`https://github.com/${full}/new/${encodeURIComponent(branch)}?filename=.github/workflows/${s.file}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="starter-icon"><Octicon name={s.icon} size={18} /></span>
                  <span className="starter-name">{s.name}</span>
                  <span className="starter-desc">{s.desc}</span>
                </a>
              ))}
            </div>
            <a className="actions-docs" href="https://docs.github.com/actions" target="_blank" rel="noreferrer">
              了解 GitHub Actions <Octicon name="arrow-right" size={14} />
            </a>
          </div>
        )}
      </div>

      {selected && (
        <Dialog
          title={selected.display_title || firstLine(selected.head_commit?.message, 90) || selected.name}
          subtitle={`${selected.name} #${selected.run_number} · ${selected.head_branch}`}
          onClose={() => setSelected(null)}
          width={720}
          footer={(
            <div className="dialog-actions">
              <Button size="sm" icon="link-external" onClick={() => openExternal(selected.html_url)}>在 GitHub 打开</Button>
              {selected.status === 'in_progress' || selected.status === 'queued' ? (
                <Button size="sm" icon="stop" onClick={() => runAction(selected.id, 'cancel')} disabled={busyRun === selected.id}>
                  取消运行
                </Button>
              ) : (
                <Button size="sm" icon="sync" onClick={() => runAction(selected.id, 'rerun')} disabled={busyRun === selected.id}>
                  重新运行
                </Button>
              )}
              <Button size="sm" variant="primary" icon="download" onClick={() => startDownload({ kind: 'run-logs', repo: full, runId: selected.id })}>
                下载日志
              </Button>
            </div>
          )}
        >
          {jobsState.loading && <div className="run-jobs"><Skeleton height={60} /><Skeleton height={60} /></div>}
          {jobsState.error && <div className="form-error">无法加载作业：{jobsState.error.message}</div>}
          {!jobsState.loading && !jobsState.error && (
            <div className="run-jobs">
              {(jobsState.data?.jobs || []).map((job) => (
                <div className="run-job" key={job.id}>
                  <div className="run-job-head">
                    <Octicon name={job.conclusion === 'success' ? 'check-circle-fill' : job.conclusion === 'failure' ? 'x-circle-fill' : job.status === 'in_progress' ? 'dot-fill' : 'clock'} size={16} />
                    <strong>{job.name}</strong>
                    <span className={`run-job-status status-${job.conclusion || job.status}`}>{job.conclusion || job.status}</span>
                  </div>
                  <div className="run-job-steps">
                    {(job.steps || []).map((step) => (
                      <div className={`run-step step-${step.conclusion || step.status}`} key={step.number}>
                        <span className="run-step-num">{step.number}</span>
                        <span className="run-step-name">{step.name}</span>
                        <span className="run-step-state">{step.conclusion || step.status}</span>
                      </div>
                    ))}
                    {!job.steps?.length && <div className="side-empty">暂无步骤信息。</div>}
                  </div>
                </div>
              ))}
              {!jobsState.data?.jobs?.length && <div className="side-empty">没有作业信息。</div>}
            </div>
          )}
        </Dialog>
      )}
    </div>
  )
}
