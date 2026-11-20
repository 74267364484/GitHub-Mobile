import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import type { Repository } from '../types'
import { useApi } from '../lib/hooks'
import { graphql } from '../lib/api'
import { useApp } from '../state/AppState'
import { Octicon, type IconName } from '../components/Octicon'
import { Avatar } from '../components/Avatar'
import { Markdown } from '../components/Markdown'
import { Button, Dialog, EmptyState, Skeleton, Spinner } from '../components/ui'
import { timeAgo } from '../lib/format'

function AuxHeader({
  title, icon, description, action,
}: {
  title: string
  icon: IconName
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="aux-header">
      <span className="aux-icon"><Octicon name={icon} size={20} /></span>
      <div className="aux-header-text">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}

/* ---------------- Projects ---------------- */

interface ProjectItem {
  id: string
  number: number
  title: string
  readme: string | null
  updatedAt: string
  items: { totalCount: number }
}

interface ProjectsData {
  repository: {
    id: string
    owner: { id: string; login: string }
    projectsV2: { nodes: ProjectItem[] }
  } | null
}

const PROJECTS_QUERY = `query($owner:String!,$name:String!){
  repository(owner:$owner,name:$name){
    id
    owner{id login}
    projectsV2(first:20){nodes{id number title readme updatedAt items{totalCount}}}
  }
}`

export function RepoProjectsPage({ repo, owner, repoName }: { repo: Repository; owner: string; repoName: string }) {
  const full = `${owner}/${repoName}`
  const { config, showToast } = useApp()
  const [data, setData] = useState<ProjectsData['repository'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    graphql<ProjectsData>(PROJECTS_QUERY, { owner, name: repoName })
      .then((res) => setData(res.repository))
      .catch((e) => setError(e instanceof Error ? e.message : '读取项目失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    graphql<ProjectsData>(PROJECTS_QUERY, { owner, name: repoName })
      .then((res) => { if (alive) setData(res.repository) })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : '读取项目失败') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [owner, repoName])

  const projects = data?.projectsV2.nodes || []

  const create = async () => {
    if (!config?.hasToken) {
      showToast('登录 GitHub 后才能创建项目', 'info')
      return
    }
    if (!data?.owner.id || !name.trim() || busy) return
    setBusy(true)
    setFormError('')
    try {
      await graphql(
        `mutation($ownerId:ID!,$repoId:ID!,$title:String!){
          createProjectV2(input:{ownerId:$ownerId,repositoryId:$repoId,title:$title}){projectV2{number}}
        }`,
        { ownerId: data.owner.id, repoId: data.id, title: name.trim() },
      )
      setOpen(false)
      setName('')
      showToast('项目已创建', 'success')
      load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '创建项目失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="aux-page">
      <AuxHeader
        title="项目"
        icon="table"
        description="使用 GitHub Projects 规划并跟踪工作，数据直接读取自 GitHub。"
        action={<Button variant="primary" size="sm" icon="plus" onClick={() => setOpen(true)}>新建项目</Button>}
      />
      {loading && <div className="card pad"><Skeleton height={80} /><Skeleton height={80} /></div>}
      {!loading && error && (
        <div className="card blankslate-wrap">
          <EmptyState icon="table" title="无法读取项目">
            <p>{error}</p>
            <p className="form-hint">需要登录并具备 Projects 读取权限。此页面不会自动跳转网页。</p>
          </EmptyState>
        </div>
      )}
      {!loading && !error && projects.length > 0 && (
        <div className="project-grid">
          {projects.map((project) => (
            <div className="card project-card" key={project.id}>
              <div className="project-card-head">
                <Octicon name="table" size={16} />
                <strong>{project.title}</strong>
              </div>
              {project.readme && <p className="project-card-body">{project.readme}</p>}
              <div className="project-card-meta">
                #{project.number} · {project.items.totalCount} 个条目 · 更新于 {timeAgo(project.updatedAt)}
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && !error && projects.length === 0 && (
        <div className="card blankslate-wrap">
          <div className="blankslate">
            <span className="blankslate-icon"><Octicon name="table" size={24} /></span>
            <h3>还没有项目</h3>
            <p>项目是 GitHub 上可自定义的规划与跟踪工具。</p>
            <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>创建项目</Button>
          </div>
        </div>
      )}

      {open && (
        <Dialog
          title="新建项目"
          subtitle={full}
          onClose={() => setOpen(false)}
          width={520}
          footer={(
            <div className="dialog-actions">
              <Button onClick={() => setOpen(false)} disabled={busy}>取消</Button>
              <Button variant="primary" icon="check" onClick={create} disabled={busy || !name.trim()}>
                {busy ? <><Spinner size={14} /> 创建中…</> : '创建项目'}
              </Button>
            </div>
          )}
        >
          <div className="write-form">
            <label className="settings-field">
              <span className="settings-label">项目名称</span>
              <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="路线图" autoFocus />
            </label>
            {formError && <div className="form-error">{formError}</div>}
          </div>
        </Dialog>
      )}
    </div>
  )
}

/* ---------------- Wiki ---------------- */

export function RepoWikiPage({ repo, owner, repoName }: { repo: Repository; owner: string; repoName: string }) {
  const full = `${owner}/${repoName}`
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    fetch(`/api/raw?url=${encodeURIComponent(`https://raw.githubusercontent.com/wiki/${full}/Home.md`)}`, { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 404) return ''
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.text()
      })
      .then((content) => { if (alive) setText(content) })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : '读取 Wiki 失败') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [full])

  return (
    <div className="aux-page">
      <AuxHeader title="Wiki" icon="book" description="与代码放在一起的长篇文档，直接读取 Wiki 首页。" />
      {loading && <div className="card pad"><Skeleton height={200} /></div>}
      {!loading && error && (
        <div className="card blankslate-wrap">
          <EmptyState icon="alert" title="无法读取 Wiki"><p>{error}</p></EmptyState>
        </div>
      )}
      {!loading && !error && text && (
        <div className="card wiki-card">
          <Markdown text={text} owner={owner} repo={repoName} branch={repo.default_branch} />
        </div>
      )}
      {!loading && !error && !text && (
        <div className="card blankslate-wrap">
          <div className="blankslate">
            <span className="blankslate-icon"><Octicon name="book" size={24} /></span>
            <h3>Wiki 还没有首页</h3>
            <p>Wiki 仓库中还没有 <code>Home.md</code>。创建后可在这里直接阅读，不会跳转网页。</p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Discussions ---------------- */

interface DiscussionCategory {
  id: string
  name: string
  emoji: string
}

interface DiscussionItem {
  number: number
  title: string
  body: string
  createdAt: string
  updatedAt: string
  author: { login: string; avatarUrl: string } | null
  category: { name: string; emoji: string } | null
  comments: { totalCount: number }
}

interface DiscussionData {
  repository: {
    id: string
    discussionCategories: { nodes: DiscussionCategory[] }
    discussions: { nodes: DiscussionItem[] }
  } | null
}

const DISCUSSIONS_QUERY = `query($owner:String!,$name:String!){
  repository(owner:$owner,name:$name){
    id
    discussionCategories(first:20){nodes{id name emoji}}
    discussions(first:20,orderBy:{field:UPDATED_AT,direction:DESC}){
      nodes{number title body createdAt updatedAt author{login avatarUrl} category{name emoji} comments{totalCount}}
    }
  }
}`

export function RepoDiscussionsPage({ repo, owner, repoName }: { repo: Repository; owner: string; repoName: string }) {
  const full = `${owner}/${repoName}`
  const { config, showToast } = useApp()
  const [data, setData] = useState<DiscussionData['repository'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    setError('')
    graphql<DiscussionData>(DISCUSSIONS_QUERY, { owner, name: repoName })
      .then((res) => {
        setData(res.repository)
        const first = res.repository?.discussionCategories.nodes[0]
        if (first) setCategoryId((prev) => prev || first.id)
      })
      .catch((e) => setError(e instanceof Error ? e.message : '读取讨论失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    graphql<DiscussionData>(DISCUSSIONS_QUERY, { owner, name: repoName })
      .then((res) => { if (alive) { setData(res.repository); const first = res.repository?.discussionCategories.nodes[0]; if (first) setCategoryId((prev) => prev || first.id) } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : '读取讨论失败') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [owner, repoName])

  const categories = data?.discussionCategories.nodes || []
  const discussions = data?.discussions.nodes || []

  const create = async () => {
    if (!config?.hasToken) {
      showToast('登录 GitHub 后才能发起讨论', 'info')
      return
    }
    if (!data?.id || !categoryId || !title.trim() || busy) return
    setBusy(true)
    try {
      await graphql(
        `mutation($repoId:ID!,$catId:ID!,$title:String!,$body:String!){
          createDiscussion(input:{repositoryId:$repoId,categoryId:$catId,title:$title,body:$body}){
            discussion{number}
          }
        }`,
        { repoId: data.id, catId: categoryId, title: title.trim(), body },
      )
      setOpen(false)
      setTitle('')
      setBody('')
      showToast('讨论已发布', 'success')
      load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '发起讨论失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="aux-page">
      <AuxHeader
        title="讨论"
        icon="comment-discussion"
        description="社区交流、提问和公告，内容直接读取自 GitHub Discussions。"
        action={<Button variant="primary" size="sm" icon="plus" onClick={() => setOpen(true)}>发起讨论</Button>}
      />
      {loading && <div className="card pad"><Skeleton height={60} /><Skeleton height={60} /><Skeleton height={60} /></div>}
      {!loading && error && (
        <div className="card blankslate-wrap">
          <EmptyState icon="comment-discussion" title="无法读取讨论">
            <p>{error}</p>
            <p className="form-hint">Discussions 需要登录并具备 Discussions 读取权限。</p>
          </EmptyState>
        </div>
      )}
      {!loading && !error && discussions.length > 0 && (
        <div className="card discussion-list">
          {discussions.map((d) => (
            <div className="discussion-row" key={d.number}>
              <button className="discussion-head" onClick={() => setExpanded((v) => (v === d.number ? null : d.number))}>
                <span className="discussion-emoji">{d.category?.emoji || '💬'}</span>
                <span className="discussion-main">
                  <span className="discussion-title">{d.title}</span>
                  <span className="discussion-meta">
                    #{d.number} · {d.category?.name || '讨论'} · {d.author?.login || '未知'} · {d.comments.totalCount} 条回复 · {timeAgo(d.updatedAt)}
                  </span>
                </span>
                <Octicon name={expanded === d.number ? 'chevron-down' : 'chevron-right'} size={16} />
              </button>
              {expanded === d.number && (
                <div className="discussion-body">
                  <div className="discussion-author">
                    {d.author?.avatarUrl && <img src={d.author.avatarUrl} alt={d.author.login} width={20} height={20} />}
                    <span>{d.author?.login}</span>
                  </div>
                  {d.body ? <Markdown text={d.body} owner={owner} repo={repoName} branch={repo.default_branch} /> : <p className="side-empty">暂无正文。</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!loading && !error && discussions.length === 0 && (
        <div className="card blankslate-wrap">
          <div className="blankslate">
            <span className="blankslate-icon"><Octicon name="comment-discussion" size={24} /></span>
            <h3>还没有讨论</h3>
            <p>讨论区是社区提问、分享想法和发布公告的地方。</p>
            <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>开始讨论</Button>
          </div>
        </div>
      )}

      {open && (
        <Dialog
          title="发起讨论"
          subtitle={full}
          onClose={() => setOpen(false)}
          width={620}
          footer={(
            <div className="dialog-actions">
              <Button onClick={() => setOpen(false)} disabled={busy}>取消</Button>
              <Button variant="primary" icon="check" onClick={create} disabled={busy || !title.trim() || !categoryId}>
                {busy ? <><Spinner size={14} /> 发布中…</> : '发布讨论'}
              </Button>
            </div>
          )}
        >
          <div className="write-form">
            <label className="settings-field">
              <span className="settings-label">分类</span>
              <select className="form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            </label>
            <label className="settings-field">
              <span className="settings-label">标题</span>
              <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </label>
            <label className="settings-field">
              <span className="settings-label">正文（支持 Markdown）</span>
              <textarea className="form-input" rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
            </label>
          </div>
        </Dialog>
      )}
    </div>
  )
}

/* ---------------- Security ---------------- */

interface AlertItem {
  number: number
  state: string
  html_url?: string
  security_advisory?: { summary?: string; severity?: string }
  security_vulnerability?: { package?: { name?: string; ecosystem?: string }; severity?: string }
  rule?: { description?: string; severity?: string; id?: string }
  most_recent_instance?: { message?: { text?: string } }
}

interface ApiState<T> {
  data: T | null
  error: Error | null
  loading: boolean
  reload: () => void
}

export function RepoSecurityPage({ repo, owner, repoName }: { repo: Repository; owner: string; repoName: string }) {
  const full = `${owner}/${repoName}`
  const [tab, setTab] = useState<'overview' | 'dependabot' | 'code-scanning' | 'policy'>('overview')
  const dependabot = useApi<AlertItem[]>(`/repos/${full}/dependabot/alerts?state=open&per_page=30`)
  const codeScanning = useApi<AlertItem[]>(`/repos/${full}/code-scanning/alerts?state=open&per_page=30`)
  const treeState = useApi<{ tree: { path: string }[] }>(`/repos/${full}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`)
  const tree = treeState.data?.tree || []
  const hasPolicy = useMemo(() => tree.some((e) => /(^|\/)security\.md$/i.test(e.path)), [tree])
  const depCount = dependabot.loading ? null : (dependabot.data || []).length
  const scanCount = codeScanning.loading ? null : (codeScanning.data || []).length

  const tabs = [
    { id: 'overview' as const, label: '安全概览' },
    { id: 'dependabot' as const, label: `Dependabot${depCount != null ? ` (${depCount})` : ''}` },
    { id: 'code-scanning' as const, label: `代码扫描${scanCount != null ? ` (${scanCount})` : ''}` },
    { id: 'policy' as const, label: '安全策略' },
  ]

  const renderAlerts = (state: ApiState<AlertItem[]>, kind: 'dependabot' | 'code-scanning') => {
    if (state.loading) return <div className="card pad"><Skeleton height={70} /><Skeleton height={70} /></div>
    if (state.error) {
      return (
        <div className="card blankslate-wrap">
          <EmptyState icon="shield" title={`${kind === 'dependabot' ? 'Dependabot' : '代码扫描'} 未启用或无权限`}>
            <p>{state.error.message}</p>
            <p className="form-hint">此页面不会自动跳转网页；启用后警报会直接显示在这里。</p>
          </EmptyState>
        </div>
      )
    }
    const alerts = state.data || []
    if (!alerts.length) {
      return (
        <div className="card blankslate-wrap">
          <EmptyState icon="shield-check" title="没有打开的警报">
            <p>{kind === 'dependabot' ? 'Dependabot 未发现依赖漏洞。' : '代码扫描没有发现未解决警报。'}</p>
          </EmptyState>
        </div>
      )
    }
    return (
      <div className="card security-alert-list">
        {alerts.map((a) => (
          <div className="security-alert" key={a.number}>
            <span className={`security-severity severity-${(a.security_advisory?.severity || a.security_vulnerability?.severity || a.rule?.severity || '').toLowerCase()}`}>
              {a.security_advisory?.severity || a.security_vulnerability?.severity || a.rule?.severity || '警报'}
            </span>
            <div className="security-alert-main">
              <strong>{a.security_advisory?.summary || a.rule?.description || `警报 #${a.number}`}</strong>
              <span>
                {kind === 'dependabot'
                  ? `${a.security_vulnerability?.package?.name || ''} ${a.security_vulnerability?.package?.ecosystem || ''}`
                  : (a.most_recent_instance?.message?.text || a.rule?.id || '')}
              </span>
            </div>
            <span className="security-alert-state">{a.state}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="aux-page">
      <AuxHeader title="安全" icon="shield" description={`${full} 的安全警报与策略，直接读取自 GitHub API。`} />
      <div className="aux-split">
        <aside className="aux-nav">
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </aside>
        <div className="aux-main">
          {tab === 'overview' && (
            <>
              <div className="card security-card">
                <div className="security-card-head">
                  <Octicon name="shield-check" size={20} />
                  <div>
                    <h3>安全策略</h3>
                    <p>{hasPolicy ? '仓库已包含 SECURITY.md。' : '未检测到 SECURITY.md，建议添加漏洞报告说明。'}</p>
                  </div>
                  <span className={`data-badge ${hasPolicy ? 'live' : 'demo'}`}>{hasPolicy ? '已配置' : '未配置'}</span>
                </div>
              </div>
              <div className="card security-card">
                <div className="security-card-head">
                  <Octicon name="alert" size={20} />
                  <div>
                    <h3>Dependabot 警报</h3>
                    <p>{depCount == null ? '正在读取…' : depCount > 0 ? `${depCount} 个未解决警报` : '没有未解决的依赖漏洞。'}</p>
                  </div>
                  <Button size="sm" onClick={() => setTab('dependabot')}>查看</Button>
                </div>
              </div>
              <div className="card security-card">
                <div className="security-card-head">
                  <Octicon name="code" size={20} />
                  <div>
                    <h3>代码扫描</h3>
                    <p>{scanCount == null ? '正在读取…' : scanCount > 0 ? `${scanCount} 个未解决警报` : '没有未解决的代码扫描警报。'}</p>
                  </div>
                  <Button size="sm" onClick={() => setTab('code-scanning')}>查看</Button>
                </div>
              </div>
            </>
          )}
          {tab === 'dependabot' && renderAlerts(dependabot, 'dependabot')}
          {tab === 'code-scanning' && renderAlerts(codeScanning, 'code-scanning')}
          {tab === 'policy' && (
            <div className="card blankslate-wrap">
              <EmptyState icon={hasPolicy ? 'shield-check' : 'shield'} title={hasPolicy ? '已配置安全策略' : '未配置安全策略'}>
                <p>{hasPolicy ? 'SECURITY.md 已存在于仓库中。' : '在仓库根目录或 .github/ 下添加 SECURITY.md，即可在这里显示。'}</p>
              </EmptyState>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
