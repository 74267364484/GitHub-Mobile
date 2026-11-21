import { useEffect, useState } from 'react'
import type { Repository, Workflow, WorkflowRun } from '../types'
import { useApi } from '../lib/hooks'
import { gh, invalidateCache } from '../lib/api'
import { startDownload } from '../lib/downloads'
import { useApp } from '../state/AppState'
import { Octicon } from '../components/Octicon'
import { Avatar } from '../components/Avatar'
import { Button, Dialog, Skeleton } from '../components/ui'
import { FileDialog } from '../components/WriteDialogs'
import { copyText } from '../lib/clipboard'
import { navigate } from '../lib/router'
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

const SIMPLE_YAML = `name: CI

on:
  push:
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run a one-line script
        run: echo "Hello, GitHub Actions!"
`

const NODE_YAML = `name: Node.js CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
      - run: npm ci
      - run: npm test
`

const PYTHON_YAML = `name: Python CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.10", "3.11", "3.12"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: \${{ matrix.python-version }}
      - run: pip install -r requirements.txt
      - run: pytest
`

const ANDROID_YAML = `name: Android CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"
      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4
      - name: Build debug APK
        run: ./gradlew assembleDebug
`

const STARTERS = [
  { name: '简单工作流', icon: 'zap' as const, file: 'ci.yml', desc: '从空白工作流开始', content: SIMPLE_YAML },
  { name: 'Node.js', icon: 'code' as const, file: 'node.js.yml', desc: '构建并测试 Node.js 项目', content: NODE_YAML },
  { name: 'Python', icon: 'code' as const, file: 'python.yml', desc: '构建并测试 Python 项目', content: PYTHON_YAML },
  { name: 'Android', icon: 'package' as const, file: 'android.yml', desc: '构建并测试 Android 应用', content: ANDROID_YAML },
]

type Starter = typeof STARTERS[number]

export function ActionsPage({
  repo, owner, repoName, runId,
}: {
  repo: Repository
  owner: string
  repoName: string
  runId?: number
}) {
  const full = `${owner}/${repoName}`
  const branch = repo.default_branch || 'main'
  const { config, showToast } = useApp()
  const [busyRun, setBusyRun] = useState<number | null>(null)
  const [selected, setSelected] = useState<WorkflowRun | null>(null)
  const [workflowId, setWorkflowId] = useState<number | null>(null)
  const [starter, setStarter] = useState<Starter | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const workflowsState = useApi<{ workflows: Workflow[]; total_count: number }>(`/repos/${full}/actions/workflows`)
  const runsState = useApi<{ workflow_runs: WorkflowRun[]; total_count: number }>(
    workflowId
      ? `/repos/${full}/actions/workflows/${workflowId}/runs?per_page=30`
      : `/repos/${full}/actions/runs?per_page=30`,
  )
  const jobsState = useApi<{ jobs: RunJob[] }>(
    selected ? `/repos/${full}/actions/runs/${selected.id}/jobs?per_page=100` : null,
  )
  const linkedRun = useApi<WorkflowRun>(runId ? `/repos/${full}/actions/runs/${runId}` : null)

  useEffect(() => {
    if (linkedRun.data) setSelected(linkedRun.data)
  }, [linkedRun.data])

  const workflows = workflowsState.data?.workflows || []
  const runs = runsState.data?.workflow_runs || []
  const current = workflows.find((w) => w.id === workflowId)
  const actionsDisabled = Boolean(workflowsState.error)

  const requireLogin = (message: string) => {
    if (config?.hasToken) return true
    showToast(message, 'info')
    navigate('/settings')
    return false
  }

  const openStarter = (s: Starter) => {
    if (!requireLogin('登录 GitHub 后才能创建工作流')) return
    setStarter(s)
  }

  const onWorkflowSaved = () => {
    setStarter(null)
    setNewOpen(false)
    workflowsState.reload()
    runsState.reload()
    showToast('工作流文件已提交，Actions 会在下次推送后运行', 'success')
  }

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
        <button className="actions-side-manage" onClick={() => setNewOpen(true)}>
          <Octicon name="plus" size={14} /> 新建工作流
        </button>
      </aside>

      <div className="actions-main">
        <div className="actions-head">
          <h2>{current ? current.name : '全部工作流'}</h2>
          <div className="actions-head-actions">
            <Button
              size="sm"
              icon="sync"
              onClick={() => { workflowsState.reload(); runsState.reload(); jobsState.reload() }}
            >
              刷新
            </Button>
            <Button size="sm" variant="primary" icon="plus" onClick={() => setNewOpen(true)}>
              新建工作流
            </Button>
          </div>
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
                <button key={s.name} className="starter-card" onClick={() => openStarter(s)}>
                  <span className="starter-icon"><Octicon name={s.icon} size={18} /></span>
                  <span className="starter-name">{s.name}</span>
                  <span className="starter-desc">{s.desc}</span>
                </button>
              ))}
            </div>
            <p className="actions-docs">
              模板会直接提交到 <code>.github/workflows/</code>，无需离开应用。
            </p>
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
              <Button
                size="sm"
                icon="link"
                onClick={async () => {
                  await copyText(selected.html_url)
                  showToast('运行链接已复制', 'success')
                }}
              >
                复制运行链接
              </Button>
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

      {(starter || newOpen) && (
        <FileDialog
          repo={full}
          branch={branch}
          mode="create"
          path={`${starter ? `.github/workflows/${starter.file}` : '.github/workflows/ci.yml'}`}
          initialContent={starter ? starter.content : SIMPLE_YAML}
          onClose={() => { setStarter(null); setNewOpen(false) }}
          onSaved={onWorkflowSaved}
        />
      )}
    </div>
  )
}
